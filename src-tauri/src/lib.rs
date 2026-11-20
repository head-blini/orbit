mod config;
mod hooks;
mod owned;
mod roadmap;
mod screens;
mod server;
mod sessions;
mod term;
mod watch;

use std::net::SocketAddr;
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

struct AppState {
    cfg: Result<config::Config, String>,
    server: Result<SocketAddr, String>,
    settings_path: Result<PathBuf, String>,
    store: Arc<Mutex<sessions::Store>>,
    projects_dir: Result<PathBuf, String>,
    screens_dir: Result<PathBuf, String>,
    tabs: term::Tabs,
    owned: Arc<Mutex<owned::Owned>>,
    plugin_dir: Option<String>,
    /// 터미널 claude에 붙일 훅 설정 파일 경로(`app_data_dir/orbit-hooks.json`).
    observer: Option<PathBuf>,
    /// 마지막으로 고른 폴더. 경로는 웹뷰로 나가지 않는다.
    picked: Mutex<Option<String>>,
    /// 이어 가기를 시작하는 중인 세션 id(같은 세션의 중복 시작 방지).
    resuming: Mutex<std::collections::HashSet<String>>,
    /// 시작하는 중인 폴더(정규화 cwd). 같은 폴더의 동시 시작을 막는다.
    launching: Mutex<std::collections::HashSet<String>>,
    /// 로드맵 파일을 지켜볼 세션 id. 감시 스레드가 읽는다.
    roadmap_target: Arc<Mutex<Option<String>>>,
}

/// 같은 폴더에서 이미 실행 중인 터미널이 있을 때의 거부 문구(프론트 `SAME`과 같은 글).
const SAME: &str = "이 폴더는 이미 터미널에서 실행 중입니다 — 실행 중 줄을 고르세요";

/// 시작 중 예약. drop하면 풀린다.
struct Reserve<'a>(&'a Mutex<std::collections::HashSet<String>>, String);

impl<'a> Reserve<'a> {
    fn take(set: &'a Mutex<std::collections::HashSet<String>>, id: &str) -> Result<Reserve<'a>, String> {
        if !set.lock().unwrap_or_else(|e| e.into_inner()).insert(id.to_string()) {
            return Err("이 세션은 이미 시작하는 중입니다".into());
        }
        Ok(Reserve(set, id.to_string()))
    }
}

impl Drop for Reserve<'_> {
    fn drop(&mut self) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).remove(&self.1);
    }
}

#[derive(serde::Serialize)]
struct Status {
    listen_addr: Option<String>,
    server_error: Option<String>,
    installed: Option<bool>,
    settings_error: Option<String>,
    projects_error: Option<String>,
    node_missing: bool,
    hooks_disabled: bool,
}

fn lock(s: &Mutex<sessions::Store>) -> std::sync::MutexGuard<'_, sessions::Store> {
    s.lock().unwrap_or_else(|e| e.into_inner())
}

/// 한 회차: 새 로그 줄을 모두 넣고, 바뀐 세션의 스냅숏을 돌려준다.
fn poll_round(w: &mut watch::Watcher, store: &Mutex<sessions::Store>) -> Vec<sessions::Session> {
    let mut changed = BTreeSet::new();
    w.poll(|sid, v| {
        if let Some(id) = lock(store).ingest_log(sid, &v, sessions::now_ms()) {
            changed.insert(id);
        }
    });
    let st = lock(store);
    let now = sessions::now_ms();
    changed.iter().filter_map(|id| st.get(id).map(|s| sessions::snapshot(s, now))).collect()
}

/// 실행 중인 탭의 (정규화한 cwd, 시작 시각, 탭 id). 맵 lock은 복사만 하고 놓은 뒤 running을 본다.
fn current_runs(tabs: &term::Tabs) -> Vec<(String, u64, u32)> {
    tabs.runs().into_iter().filter(|(_, t, _, _)| t.running()).map(|(k, _, c, t0)| (owned::norm_cwd(&c), t0, k)).collect()
}

/// Orbit이 시작한 세션(채택 규칙 포함)만 남기고, 연결된 탭을 채운다. owned lock만 잡는다.
fn visible(
    owned: &mut owned::Owned,
    v: Vec<sessions::Session>,
    runs: &[(String, u64, u32)],
    now: u64,
) -> Vec<sessions::Session> {
    let refs: Vec<(&str, u64)> = runs.iter().map(|(c, t, _)| (c.as_str(), *t)).collect();
    let mut out = Vec::new();
    for mut s in v {
        match owned.adopt_in(&s.id, s.cwd.as_deref(), s.started_ms, &refs, now) {
            None => continue,
            Some(Some(i)) => owned.link(&s.id, runs[i].2),
            Some(None) => {}
        }
        s.tab = owned.tab_of(&s.id);
        out.push(s);
    }
    out
}

/// 시작 공통 흐름: open → resize → start → set_ran. open이 새로 만든 항목은 그 뒤 Err면 맵에서 뺀다.
/// (resume_check·check_cwd처럼 맵을 건드리지 않고 끝낼 검사는 호출자가 먼저 한다.)
fn launch(
    tabs: &term::Tabs,
    tab: u32,
    cols: u16,
    rows: u16,
    start: impl FnOnce(&term::Term) -> Result<(), String>,
    cwd: String,
    t0: u64,
    epoch: u64,
) -> Result<term::Term, String> {
    let (term, created) = tabs.open(tab)?;
    let r = term.resize(cols, rows).and_then(|_| start(&term));
    if let Err(e) = r {
        if created {
            tabs.remove_if(tab, &term);
        }
        return Err(e);
    }
    if !tabs.set_ran(tab, &term, cwd, t0) {
        term.stop();
        return Err("탭이 닫혔습니다".into());
    }
    // 명령이 시작된 뒤 term_stop_all이 돌았다: 웹뷰는 이 탭을 모른다(C1)
    if tabs.epoch() != epoch {
        tabs.remove_if(tab, &term);
        term.stop();
        return Err("탭이 닫혔습니다".into());
    }
    Ok(term)
}

/// 이어 가기 사전 검사. 기록 없는 hook 세션(C1)과 이미 실행 중인 탭이 쥔 세션(중복)은 거부한다.
fn resume_check(source: Option<sessions::Source>, transcript: bool, running_cur: &[Option<String>], id: &str) -> Result<(), String> {
    if source == Some(sessions::Source::Hook) && !transcript {
        return Err("보낸 메시지가 없어 이어 갈 대화가 없습니다 — 새로 시작하세요".into());
    }
    if running_cur.iter().any(|c| c.as_deref() == Some(id)) {
        return Err("이 세션은 이미 다른 탭에서 실행 중입니다".into());
    }
    Ok(())
}

/// `cwd`와 같은 폴더에서 실행 중인 탭 id(`current_runs` 결과와 정규화 cwd를 비교).
fn same_folder(runs: &[(String, u64, u32)], cwd: &str) -> Option<u32> {
    let c = owned::norm_cwd(cwd);
    runs.iter().find(|(r, _, _)| *r == c).map(|(_, _, k)| *k)
}

fn lock_owned(o: &Mutex<owned::Owned>) -> std::sync::MutexGuard<'_, owned::Owned> {
    o.lock().unwrap_or_else(|e| e.into_inner())
}

fn settings_path(state: &AppState) -> Result<&PathBuf, String> {
    state.settings_path.as_ref().map_err(|e| e.clone())
}

#[tauri::command(async)]
fn get_status(state: State<AppState>) -> Status {
    let (listen_addr, server_error) = match &state.server {
        Ok(a) => (Some(a.to_string()), None),
        Err(e) => (None, Some(e.clone())),
    };
    let checked = match (&state.settings_path, &state.cfg) {
        (Ok(p), Ok(c)) => hooks::is_installed(p, c.port, &c.token),
        (Err(e), _) | (_, Err(e)) => Err(e.clone()),
    };
    let (installed, settings_error) = match checked {
        Ok(b) => (Some(b), None),
        Err(e) => (None, Some(e)),
    };
    let projects_error = state.projects_dir.as_ref().err().cloned();
    let node_missing = state.plugin_dir.is_some() && !term::node_usable();
    let mut files: Vec<PathBuf> = state.settings_path.iter().cloned().collect();
    for ran in state.tabs.cwds() {
        let d = std::path::Path::new(&ran).join(".claude");
        files.push(d.join("settings.json"));
        files.push(d.join("settings.local.json"));
    }
    let hooks_disabled = hooks::hooks_disabled(&files);
    Status { listen_addr, server_error, installed, settings_error, projects_error, node_missing, hooks_disabled }
}

#[tauri::command(async)]
fn get_roadmap(state: State<AppState>, id: String) -> roadmap::Roadmap {
    let cwd = lock(&state.store).get(&id).and_then(|s| s.cwd.clone());
    roadmap::for_cwd(cwd.as_deref())
}

#[tauri::command]
fn watch_roadmap(state: State<AppState>, id: Option<String>) {
    *state.roadmap_target.lock().unwrap_or_else(|e| e.into_inner()) = id;
}

/// 감시 한 번. 바뀐 것이 확정되면 보낼 세션 id. lock을 잡은 채 fs를 부르지 않는다.
fn roadmap_tick(f: &mut roadmap::Follow, target: &Mutex<Option<String>>, store: &Mutex<sessions::Store>) -> Option<String> {
    let id = target.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let cwd = id.as_ref().and_then(|i| lock(store).get(i).and_then(|s| s.cwd.clone()));
    let now = roadmap::stamp(cwd.as_deref());
    f.step(id.as_deref(), now).then_some(id).flatten()
}

#[tauri::command(async)]
fn get_raid(state: State<AppState>, id: String) -> roadmap::Raid {
    let (cwd, run) = lock(&state.store).get(&id).map(|s| (s.cwd.clone(), s.run.clone())).unwrap_or_default();
    roadmap::raid(cwd.as_deref(), run.as_deref())
}

#[tauri::command(async)]
fn get_sessions(state: State<AppState>) -> Vec<sessions::Session> {
    let runs = current_runs(&state.tabs);
    let now = sessions::now_ms();
    let all: Vec<_> = lock(&state.store).all().into_iter().map(|s| sessions::stalled(s, now)).collect();
    visible(&mut lock_owned(&state.owned), all, &runs, now)
}

#[tauri::command(async)]
fn list_screens(app: tauri::AppHandle, state: State<AppState>) -> Vec<String> {
    match &state.screens_dir {
        Ok(d) => {
            let scope = app.asset_protocol_scope();
            screens::list(d).iter().filter(|p| scope.allow_file(p).is_ok()).map(|p| p.display().to_string()).collect()
        }
        Err(_) => Vec::new(),
    }
}

#[tauri::command(async)]
fn open_screens_dir(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let d = state.screens_dir.as_ref().map_err(|e| e.clone())?;
    std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    app.opener().open_path(d.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn install_hooks(state: State<AppState>) -> Result<Option<String>, String> {
    let cfg = state.cfg.as_ref().map_err(|e| e.clone())?;
    let backup = hooks::install(settings_path(&state)?, cfg.port, &cfg.token)?;
    Ok(backup.map(|p| p.display().to_string()))
}

#[tauri::command(async)]
fn uninstall_hooks(state: State<AppState>) -> Result<Option<String>, String> {
    let backup = hooks::uninstall(settings_path(&state)?)?;
    Ok(backup.map(|p| p.display().to_string()))
}

#[derive(serde::Serialize)]
struct Picked {
    name: String,
    tab: Option<u32>,
}

/// 폴더 선택 창. 경로는 Rust에만 두고 폴더 이름만 돌려준다(취소는 None).
/// 그 폴더에서 이미 실행 중인 터미널이 있으면 고른 폴더를 남기지 않고 그 탭 id를 함께 돌려준다.
#[tauri::command(async)]
fn term_pick_folder(app: tauri::AppHandle, state: State<AppState>) -> Result<Option<Picked>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(fp) = app.dialog().file().blocking_pick_folder() else {
        *state.picked.lock().unwrap_or_else(|e| e.into_inner()) = None;
        return Ok(None);
    };
    let path = fp.into_path().map_err(|_| "폴더 경로를 읽을 수 없습니다".to_string())?;
    let s = path.to_str().ok_or("폴더 경로를 읽을 수 없습니다")?;
    let s = term::strip_verbatim_disk(s);
    term::check_cwd(s)?;
    let name = std::path::Path::new(s).file_name().map_or_else(|| s.to_string(), |n| n.to_string_lossy().into_owned());
    let tab = same_folder(&current_runs(&state.tabs), s);
    *state.picked.lock().unwrap_or_else(|e| e.into_inner()) = if tab.is_some() { None } else { Some(s.to_string()) };
    Ok(Some(Picked { name, tab }))
}

/// 고른 폴더에서 새 탭의 claude 시작. 다른 탭은 건드리지 않는다.
#[tauri::command(async)]
fn term_open_folder(
    state: State<AppState>,
    tab: u32,
    cols: u16,
    rows: u16,
    on_out: tauri::ipc::Channel<term::TermOut>,
) -> Result<(), String> {
    let epoch = state.tabs.epoch();
    let picked = state.picked.lock().unwrap_or_else(|e| e.into_inner()).take();
    let s = picked.ok_or("폴더를 먼저 고르세요")?;
    term::check_cwd(&s)?;
    start_new(&state, tab, cols, rows, s, epoch, on_out)
}

/// 훅 설정 파일을 쓰고 `--settings`에 넘길 경로를 돌려준다. skip이거나 경로를 모르거나 쓰기에 실패하면 None(시작은 막지 않음).
fn observer_arg(path: Option<&std::path::Path>, port: u16, token: &str, skip: bool) -> Option<String> {
    let path = path.filter(|_| !skip)?;
    let s = path.to_str()?;
    hooks::write_observer(path, port, token).ok()?;
    Some(s.to_string())
}

/// 사용자 settings에 지금 포트·토큰의 훅이 이미 있거나 받을 서버가 없으면 주입하지 않는다.
fn observer_for(state: &AppState) -> Option<String> {
    let (Ok(c), Ok(_)) = (&state.cfg, &state.server) else { return None };
    let skip = matches!(&state.settings_path, Ok(p) if hooks::is_installed(p, c.port, &c.token) == Ok(true));
    observer_arg(state.observer.as_deref(), c.port, &c.token, skip)
}

/// 훅 설정을 붙여 claude를 시작하고, 성공하면 세션을 탭에 묶는다(실패한 시작은 cur를 남기지 않는다).
fn run_claude(
    state: &AppState,
    tab: u32,
    (cols, rows): (u16, u16),
    cwd: String,
    id: &str,
    resume: bool,
    epoch: u64,
    on_out: tauri::ipc::Channel<term::TermOut>,
) -> Result<(), String> {
    // 예약 → 검사 → 시작 순서라서 같은 폴더의 동시 시작도 걸린다(예약은 launch가 끝난 뒤 풀린다)
    let _rsv = Reserve::take(&state.launching, &owned::norm_cwd(&cwd)).map_err(|_| SAME.to_string())?;
    if same_folder(&current_runs(&state.tabs), &cwd).is_some() {
        return Err(SAME.into());
    }
    let _ = lock_owned(&state.owned).add(id);
    let t0 = sessions::now_ms();
    let obs = observer_for(state);
    let run_cwd = cwd.clone();
    let linked = std::cell::Cell::new(false);
    let (resume_id, new_id) = if resume { (Some(id), None) } else { (None, Some(id)) };
    let r = launch(&state.tabs, tab, cols, rows, |t| {
        t.start(term::find_in(&term::claude_dirs()), &cwd, &term::args(resume_id, new_id, obs.as_deref(), state.plugin_dir.as_deref()), move |m| {
            let _ = on_out.send(m);
        })?;
        lock_owned(&state.owned).link(id, tab);
        linked.set(true);
        Ok(())
    }, run_cwd, t0, epoch);
    if r.is_err() && linked.get() {
        lock_owned(&state.owned).unlink(tab);
    }
    r.map(|_| ())
}

/// 새 세션 id를 기록(실패는 무시)한 뒤 `--session-id`로 시작한다.
fn start_new(
    state: &AppState,
    tab: u32,
    cols: u16,
    rows: u16,
    cwd: String,
    epoch: u64,
    on_out: tauri::ipc::Channel<term::TermOut>,
) -> Result<(), String> {
    let id = term::new_session_id()?;
    run_claude(state, tab, (cols, rows), cwd, &id, false, epoch, on_out)
}

/// 세션 id의 폴더에서 claude 시작(`resume`이면 `--resume <id>`). 경로는 Rust 안에서만 쓴다.
fn term_from_session(
    state: &AppState,
    tab: u32,
    cols: u16,
    rows: u16,
    id: &str,
    resume: bool,
    on_out: tauri::ipc::Channel<term::TermOut>,
) -> Result<(), String> {
    let epoch = state.tabs.epoch();
    let cwd = term::session_cwd(&lock(&state.store), id)?;
    if !resume {
        return start_new(state, tab, cols, rows, cwd, epoch, on_out);
    }
    // 예약 → 검사 → 시작 → link 순서라서 같은 세션의 두 번째 호출은 예약이나 실행 중 검사에 걸린다(TOCTOU)
    let _rsv = Reserve::take(&state.resuming, id)?;
    let source = lock(&state.store).get(id).map(|s| s.source);
    let transcript = state.projects_dir.as_ref().is_ok_and(|p| term::has_transcript(p, id));
    let cur: Vec<Option<String>> = {
        let running: Vec<u32> = state.tabs.runs().into_iter().filter(|(_, t, _, _)| t.running()).map(|(k, _, _, _)| k).collect();
        let o = lock_owned(&state.owned);
        running.into_iter().map(|k| o.current(k).map(str::to_string)).collect()
    };
    resume_check(source, transcript, &cur, id)?;
    term::check_cwd(&cwd)?;
    run_claude(state, tab, (cols, rows), cwd, id, true, epoch, on_out)
}

#[tauri::command(async)]
fn term_new(state: State<AppState>, tab: u32, cols: u16, rows: u16, id: String, on_out: tauri::ipc::Channel<term::TermOut>) -> Result<(), String> {
    term_from_session(&state, tab, cols, rows, &id, false, on_out)
}

#[tauri::command(async)]
fn term_resume(state: State<AppState>, tab: u32, cols: u16, rows: u16, id: String, on_out: tauri::ipc::Channel<term::TermOut>) -> Result<(), String> {
    term_from_session(&state, tab, cols, rows, &id, true, on_out)
}

#[tauri::command(async)]
fn term_write(state: State<AppState>, tab: u32, data: String) -> Result<(), String> {
    state.tabs.get(tab).ok_or("탭이 없습니다")?.write(&data)
}

/// 맵에 없는 탭이면 만들지 않고 Err(닫힌 탭에 늦게 온 resize가 항목을 되살리지 않게).
#[tauri::command(async)]
fn term_resize(state: State<AppState>, tab: u32, cols: u16, rows: u16) -> Result<(), String> {
    state.tabs.get(tab).ok_or("탭이 없습니다")?.resize(cols, rows)
}

#[tauri::command(async)]
fn term_stop(state: State<AppState>, tab: u32) {
    lock_owned(&state.owned).unlink(tab);
    if let Some(t) = state.tabs.remove(tab) {
        t.stop();
    }
}

/// 모든 탭의 claude를 끝내고 맵을 비운다(웹뷰 재로드·종료용).
#[tauri::command(async)]
fn term_stop_all(state: State<AppState>) {
    for t in state.tabs.take_all() {
        t.stop();
    }
    lock_owned(&state.owned).unlink_all();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let node_bin = if cfg!(debug_assertions) {
                Ok(PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/node/bin")))
            } else {
                app.path().resource_dir().map(|d| d.join("node").join("bin"))
            };
            if let Ok(b) = node_bin {
                if b.join(term::NODE).is_file() {
                    term::set_bundled_bin(b);
                }
            }
            std::thread::spawn(|| {
                term::warm();
            });
            let cfg = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())
                .and_then(|d| config::load_or_create(&d));
            let store = Arc::new(Mutex::new(sessions::Store::default()));
            let tabs = term::Tabs::default();
            let owned = Arc::new(Mutex::new(owned::Owned::load(
                app.path().app_data_dir().ok().map(|d| d.join("orbit-sessions.json")),
            )));
            let server = match &cfg {
                Ok(c) => {
                    let handle = app.handle().clone();
                    let store = store.clone();
                    let (tabs, owned) = (tabs.clone(), owned.clone());
                    server::start(c.port, c.token.clone(), move |v| {
                        let runs = current_runs(&tabs);
                        let snap = {
                            let mut st = lock(&store);
                            let now = sessions::now_ms();
                            st.ingest_hook(&v, now).and_then(|id| st.get(&id).map(|s| sessions::snapshot(s, now)))
                        };
                        if let Some(s) = snap {
                            let shown = visible(&mut lock_owned(&owned), vec![s], &runs, sessions::now_ms());
                            if !shown.is_empty() {
                                let _ = handle.emit("session-update", shown);
                            }
                        }
                    })
                }
                Err(e) => Err(e.clone()),
            };
            #[allow(unused_mut)]
            let mut settings_path = app
                .path()
                .home_dir()
                .map(|h| h.join(".claude").join("settings.json"))
                .map_err(|e| e.to_string());
            #[cfg(debug_assertions)]
            if let Some(p) = std::env::var_os("ORBIT_CLAUDE_SETTINGS") {
                settings_path = Ok(PathBuf::from(p));
            }
            #[allow(unused_mut)]
            let mut projects_dir = match std::env::var_os("CLAUDE_CONFIG_DIR") {
                Some(d) if !d.is_empty() => Ok(PathBuf::from(d).join("projects")),
                _ => app
                    .path()
                    .home_dir()
                    .map(|h| h.join(".claude").join("projects"))
                    .map_err(|e| e.to_string()),
            };
            #[cfg(debug_assertions)]
            if let Some(p) = std::env::var_os("ORBIT_CLAUDE_PROJECTS") {
                projects_dir = Ok(PathBuf::from(p));
            }
            if let Ok(root) = &projects_dir {
                let root = root.clone();
                let store = store.clone();
                let handle = app.handle().clone();
                let (tabs, owned) = (tabs.clone(), owned.clone());
                std::thread::spawn(move || {
                    let mut w = watch::Watcher::new(root);
                    loop {
                        let runs = current_runs(&tabs);
                        let snaps = poll_round(&mut w, &store);
                        let snaps = visible(&mut lock_owned(&owned), snaps, &runs, sessions::now_ms());
                        if !snaps.is_empty() {
                            let _ = handle.emit("session-update", snaps);
                        }
                        std::thread::sleep(std::time::Duration::from_secs(1));
                    }
                });
            }
            let roadmap_target = Arc::new(Mutex::new(None));
            {
                let (target, store, handle) = (roadmap_target.clone(), store.clone(), app.handle().clone());
                let _ = std::thread::Builder::new().name("roadmap-watch".into()).spawn(move || {
                    let mut f = roadmap::Follow::default();
                    loop {
                        if let Some(id) = roadmap_tick(&mut f, &target, &store) {
                            let _ = handle.emit("roadmap-changed", id);
                        }
                        std::thread::sleep(std::time::Duration::from_millis(500));
                    }
                });
            }
            let screens_dir = app.path().app_data_dir().map(|d| d.join("screens")).map_err(|e| e.to_string());
            let plugin = if cfg!(debug_assertions) {
                Ok(PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../harness")))
            } else {
                app.path().resource_dir().map(|d| d.join("harness"))
            };
            let plugin_dir = plugin
                .ok()
                .filter(|p| p.is_dir())
                .and_then(|p| p.to_str().map(|s| term::strip_verbatim_disk(s).to_string()));
            let observer = app.path().app_data_dir().map(|d| d.join("orbit-hooks.json")).ok();
            app.manage(AppState { cfg, server, settings_path, store, projects_dir, screens_dir, tabs, owned, plugin_dir, observer, picked: Mutex::new(None), resuming: Mutex::new(Default::default()), launching: Mutex::new(Default::default()), roadmap_target });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_roadmap,
            watch_roadmap,
            get_raid,
            get_sessions,
            list_screens,
            open_screens_dir,
            install_hooks,
            uninstall_hooks,
            term_pick_folder,
            term_open_folder,
            term_new,
            term_resume,
            term_write,
            term_resize,
            term_stop,
            term_stop_all
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, ev| {
            if let tauri::RunEvent::Exit = ev {
                let st = app.state::<AppState>();
                for t in st.tabs.take_all() {
                    t.stop();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicU32, Ordering};

    static N: AtomicU32 = AtomicU32::new(0);

    fn line(id: &str) -> String {
        format!(
            "{{\"uuid\":\"u-{id}\",\"message\":{{\"content\":[{{\"type\":\"tool_use\",\"id\":\"{id}\",\"name\":\"Read\"}}]}}}}\n"
        )
    }

    #[test]
    fn roadmap_tick_emits_after_change() {
        let dir = std::env::temp_dir()
            .join(format!("orbit-tick-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        std::fs::create_dir_all(&dir).unwrap();
        let cwd = dir.to_str().unwrap().to_string();
        let mut st = sessions::Store::default();
        st.ingest_hook(&serde_json::json!({"session_id":"s1","cwd":cwd,"hook_event_name":"SessionStart"}), 1);
        let store = Mutex::new(st);
        let target = Mutex::new(Some("s1".to_string()));
        let mut f = roadmap::Follow::default();
        assert_eq!(roadmap_tick(&mut f, &target, &store), None);
        std::fs::write(dir.join(roadmap::FILE), "- [ ] a\n").unwrap();
        assert_eq!(roadmap_tick(&mut f, &target, &store), None);
        assert_eq!(roadmap_tick(&mut f, &target, &store), Some("s1".to_string()));
        assert_eq!(roadmap_tick(&mut f, &target, &store), None);
        *target.lock().unwrap() = None;
        assert_eq!(roadmap_tick(&mut f, &target, &store), None);
        std::fs::write(dir.join(roadmap::FILE), "- [ ] a\n- [ ] bb\n").unwrap();
        assert_eq!(roadmap_tick(&mut f, &target, &store), None);
        assert_eq!(roadmap_tick(&mut f, &target, &store), None);
        *target.lock().unwrap() = Some("unknown".to_string());
        assert_eq!(roadmap_tick(&mut f, &target, &store), None);
        std::fs::write(dir.join(roadmap::FILE), "x").unwrap();
        assert_eq!(roadmap_tick(&mut f, &target, &store), None);
        assert_eq!(roadmap_tick(&mut f, &target, &store), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reread_after_truncate_does_not_duplicate() {
        let root = std::env::temp_dir()
            .join(format!("orbit-lib-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let dir = root.join("slug");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("11111111-2222-3333-4444-555555555555.jsonl");
        std::fs::write(&f, format!("{}{}", line("t1"), line("t2"))).unwrap();
        let mut w = watch::Watcher::new(root.clone());
        let store = std::sync::Mutex::new(sessions::Store::default());
        let count = |w: &mut watch::Watcher| {
            poll_round(w, &store);
            store.lock().unwrap().all().iter().map(|s| s.events.len()).sum::<usize>()
        };
        assert_eq!(count(&mut w), 2);
        std::fs::write(&f, line("t1")).unwrap();
        assert_eq!(count(&mut w), 2);
        std::fs::OpenOptions::new().append(true).open(&f).unwrap().write_all(line("t3").as_bytes()).unwrap();
        assert_eq!(count(&mut w), 3);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn visible_drops_unrecorded_unadopted_sessions() {
        let id = |n: &str| format!("{n}1111111-2222-3333-4444-555555555555");
        let mut st = sessions::Store::default();
        for (i, cwd) in [(id("a"), "/x"), (id("b"), "/x"), (id("c"), "/w/p/")] {
            st.ingest_hook(&serde_json::json!({"hook_event_name":"UserPromptSubmit","session_id":i,"cwd":cwd}), 1);
        }
        let mut v = st.all();
        v.sort_by(|x, y| x.id.cmp(&y.id));
        let mut o = owned::Owned::load(None);
        o.add(&id("a")).unwrap();
        let out = visible(&mut o, v, &[("/w/p".to_string(), 0, 7)], 10);
        let ids: Vec<_> = out.iter().map(|s| s.id.clone()).collect();
        assert_eq!(ids, vec![id("a"), id("c")]);
        assert!(o.contains(&id("c")) && !o.contains(&id("b")));
        assert_eq!(out[1].tab, Some(7));
    }

    fn sess(st: &mut sessions::Store, id: &str, cwd: &str) {
        st.ingest_hook(&serde_json::json!({"hook_event_name":"UserPromptSubmit","session_id":id,"cwd":cwd}), 1);
    }

    #[test]
    fn visible_tab_follows_adopting_run() {
        let (a, b) = ("a1111111-2222-3333-4444-555555555555", "b1111111-2222-3333-4444-555555555555");
        let mut st = sessions::Store::default();
        sess(&mut st, a, "/w/p");
        sess(&mut st, b, "/w/q");
        let mut v = st.all();
        v.sort_by(|x, y| x.id.cmp(&y.id));
        let mut o = owned::Owned::load(None);
        let runs = [("/w/p".to_string(), 0, 1), ("/w/q".to_string(), 0, 2)];
        let out = visible(&mut o, v, &runs, 10);
        assert_eq!(out.iter().map(|s| s.tab).collect::<Vec<_>>(), vec![Some(1), Some(2)]);
    }

    #[test]
    fn visible_linked_recorded_session_keeps_tab_without_runs() {
        let (a, b) = ("a1111111-2222-3333-4444-555555555555", "b1111111-2222-3333-4444-555555555555");
        let mut st = sessions::Store::default();
        sess(&mut st, a, "/w/p");
        sess(&mut st, b, "/w/p");
        let mut v = st.all();
        v.sort_by(|x, y| x.id.cmp(&y.id));
        let mut o = owned::Owned::load(None);
        o.add(a).unwrap();
        o.add(b).unwrap();
        o.link(a, 5);
        let out = visible(&mut o, v, &[], 10);
        assert_eq!(out.iter().map(|s| s.tab).collect::<Vec<_>>(), vec![Some(5), None]);
    }

    #[test]
    fn resume_check_cases() {
        use sessions::Source::*;
        let id = "a1111111-2222-3333-4444-555555555555";
        assert!(resume_check(Some(Hook), false, &[], id).unwrap_err().contains("보낸 메시지가 없어"));
        assert!(resume_check(Some(Hook), true, &[], id).is_ok());
        assert!(resume_check(Some(Log), false, &[], id).is_ok());
        assert!(resume_check(Some(Both), false, &[], id).is_ok());
        assert!(resume_check(Some(Log), true, &[None, Some(id.to_string())], id).is_err());
        assert!(resume_check(Some(Log), true, &[None, Some("x".to_string())], id).is_ok());
    }

    #[test]
    fn launch_cleans_new_slot_on_start_err_and_keeps_existing() {
        let tabs = term::Tabs::default();
        for i in 0..7 {
            tabs.open(i).unwrap();
        }
        let g = tabs.epoch();
        let r = launch(&tabs, 100, 80, 24, |_| Err("x".to_string()), "/w".into(), 0, g);
        assert!(r.is_err());
        assert!(tabs.get(100).is_none());
        assert!(tabs.open(101).is_ok());
        // 이미 있던 id는 start Err여도 남는다
        let r = launch(&tabs, 3, 80, 24, |_| Err("x".to_string()), "/w".into(), 0, g);
        assert!(r.is_err());
        assert!(tabs.get(3).is_some());
        // 성공하면 ran이 기록된다
        assert!(launch(&tabs, 3, 80, 24, |_| Ok(()), "/w".into(), 0, g).is_ok());
        assert_eq!(tabs.cwds(), vec!["/w".to_string()]);
    }

    #[test]
    fn launch_failure_keeps_new_term_with_same_id() {
        // S-A1: start 도중 같은 id가 닫혔다 새로 열려도 새 Term은 지우지 않는다
        let tabs = term::Tabs::default();
        let r = launch(&tabs, 5, 80, 24, |_| {
            tabs.remove(5);
            tabs.open(5).unwrap();
            Err("x".to_string())
        }, "/w".into(), 0, tabs.epoch());
        assert!(r.is_err());
        assert!(tabs.get(5).is_some());
    }

    #[test]
    fn launch_after_stop_all_is_rolled_back() {
        // C1: 시작한 뒤 stop_all이 돌았으면 성공하지 않고 맵에도 남지 않는다
        let tabs = term::Tabs::default();
        let g = tabs.epoch();
        tabs.take_all();
        let r = launch(&tabs, 6, 80, 24, |_| Ok(()), "/w".into(), 0, g);
        assert!(r.is_err());
        assert!(tabs.get(6).is_none());
        assert!(launch(&tabs, 6, 80, 24, |_| Ok(()), "/w".into(), 0, tabs.epoch()).is_ok());
    }

    #[test]
    fn reserve_blocks_second_and_frees_on_drop() {
        let set = Mutex::new(Default::default());
        let a = Reserve::take(&set, "x").unwrap();
        assert!(Reserve::take(&set, "x").is_err());
        assert!(Reserve::take(&set, "y").is_ok());
        drop(a);
        assert!(Reserve::take(&set, "x").is_ok());
    }

    #[test]
    fn same_folder_cases() {
        let runs = vec![("/w/p".to_string(), 0, 1), ("/w/q".to_string(), 0, 2)];
        assert_eq!(same_folder(&runs, "/w/q/"), Some(2));
        assert_eq!(same_folder(&runs, "/w/r"), None);
        assert_eq!(same_folder(&[], "/w/p"), None);
    }

    #[test]
    fn launching_reserve_blocks_same_folder() {
        let set = Mutex::new(Default::default());
        let a = Reserve::take(&set, "/w/p").unwrap();
        assert!(Reserve::take(&set, "/w/p").is_err());
        drop(a);
        assert!(Reserve::take(&set, "/w/p").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn same_folder_sees_running_tab_until_stopped() {
        let tabs = term::Tabs::default();
        let d = std::env::temp_dir().join(format!("orbit-lib-same-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        std::fs::create_dir_all(&d).unwrap();
        let g = tabs.epoch();
        let t = launch(&tabs, 4, 80, 24, |t| {
            t.start(Some(PathBuf::from("/bin/sh")), d.to_str().unwrap(), &["-c", "sleep 30"], |_| {})
        }, "/w/p".into(), 0, g).unwrap();
        assert_eq!(same_folder(&current_runs(&tabs), "/w/p"), Some(4));
        t.stop();
        let until = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while t.running() && std::time::Instant::now() < until {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        assert_eq!(same_folder(&current_runs(&tabs), "/w/p"), None);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn poll_round_marks_old_working_session_stalled() {
        let root = std::env::temp_dir()
            .join(format!("orbit-lib-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let dir = root.join("slug");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("11111111-2222-3333-4444-555555555555.jsonl");
        std::fs::write(
            &f,
            "{\"uuid\":\"u1\",\"timestamp\":\"2000-03-01T00:00:00Z\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"id\":\"t1\",\"name\":\"Read\"}]}}\n",
        )
        .unwrap();
        let mut w = watch::Watcher::new(root.clone());
        let store = std::sync::Mutex::new(sessions::Store::default());
        let snaps = poll_round(&mut w, &store);
        assert_eq!(snaps.len(), 1);
        assert!(snaps[0].stalled);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn observer_arg_cases() {
        let d = std::env::temp_dir().join(format!("orbit-obs-test-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let p = d.join("orbit-hooks.json");
        assert_eq!(observer_arg(Some(&p), 4000, "tok", true), None);
        assert!(!p.exists());
        assert_eq!(observer_arg(None, 4000, "tok", false), None);
        let bad = d.join("file");
        std::fs::write(&bad, "x").unwrap();
        assert_eq!(observer_arg(Some(&bad.join("o.json")), 4000, "tok", false), None);
        let got = observer_arg(Some(&p), 4000, "tok", false).unwrap();
        assert_eq!(got, p.to_str().unwrap());
        assert!(p.exists());
        let _ = std::fs::remove_dir_all(&d);
    }
}
