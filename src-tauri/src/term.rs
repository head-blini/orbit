//! 앱 안 터미널: portable-pty로 진짜 `claude` CLI를 띄우고 출력은 Channel로 흘린다.
//! 웹뷰는 실행 파일·인자·경로·환경을 정하지 못한다(id·데이터·숫자만 넘어온다).

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

#[cfg(windows)]
pub const CLAUDE: &str = "claude.exe";
#[cfg(not(windows))]
pub const CLAUDE: &str = "claude";
#[cfg(windows)]
pub const NODE: &str = "node.exe";
#[cfg(not(windows))]
pub const NODE: &str = "node";
pub const NOT_FOUND: &str = "claude를 찾을 수 없습니다 — Claude Code를 설치했는지 확인하세요";
/// 터미널 종류만 알린다(Finder 실행 시 TERM 부재 대비). 색 설정이 아니다.
const TERM_ENV: &str = "xterm-256color";

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum TermOut {
    Data { d: String },
    Exit,
}

struct Proc {
    master: Box<dyn MasterPty + Send>,
    /// 상태 lock과 분리: 블로킹 write 중에도 stop·resize·대기 스레드가 상태 lock을 잡을 수 있다.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    pid: Option<u32>,
    epoch: u64,
}

struct Inner {
    proc: Option<Proc>,
    epoch: u64,
    size: (u16, u16), // cols, rows
}

#[derive(Clone)]
pub struct Term(Arc<Mutex<Inner>>);

impl Default for Term {
    fn default() -> Self {
        Term(Arc::new(Mutex::new(Inner { proc: None, epoch: 0, size: (80, 24) })))
    }
}

fn lk(m: &Mutex<Inner>) -> MutexGuard<'_, Inner> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

static BUNDLED: OnceLock<PathBuf> = OnceLock::new();
static USER_NODE_OK: OnceLock<bool> = OnceLock::new();

/// 내장 node 폴더를 등록한다. 한 번만 되고, 두 번째 호출은 무시한다.
pub fn set_bundled_bin(dir: PathBuf) {
    let _ = BUNDLED.set(dir);
}

/// 체크포인트 훅(`harness/hooks/gate.mjs`)이 도는 최소 node 버전.
/// 근거(gate.mjs를 읽어 뽑은 값, 각 기능이 처음 들어간 버전은 기억에 기댄 것이라 미확인):
/// `node:` 접두 import(14.13.1), `||=`(15.0), `Array.prototype.at`(16.6.0), `Object.hasOwn`(16.9.0).
/// gate.mjs가 더 새 문법을 쓰면 이 값도 올릴 것.
const MIN_NODE: (u64, u64, u64) = (16, 9, 0);

/// `node -v` 출력이 최소 버전 이상인지. 판정을 못 하면(형식이 다르면) false.
fn node_ok(out: &str) -> bool {
    let t = out.trim();
    let mut it = t.strip_prefix('v').unwrap_or(t).split('.');
    let mut n = || it.next()?.parse::<u64>().ok();
    let (Some(a), Some(b), Some(c)) = (n(), n(), n()) else { return false };
    it.next().is_none() && (a, b, c) >= MIN_NODE
}

/// 셸 없이 `node -v`를 실행해 stdout 앞 64바이트를 돌려준다. 시간 초과·실패·0이 아닌 종료는 None.
fn node_version_out(node: &Path, limit: Duration) -> Option<String> {
    use std::process::{Command, Stdio};
    let mut child = Command::new(node)
        .arg("-v")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped())
        .spawn()
        .ok()?;
    let out = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = out.take(64).read_to_end(&mut buf);
        let _ = tx.send(buf);
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) if start.elapsed() < limit => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    // 자손이 stdout을 쥐고 남아 있으면 읽기가 안 끝난다. 남은 시간만 기다리고 포기한다.
    let buf = rx.recv_timeout(limit.saturating_sub(start.elapsed()).max(Duration::from_millis(200))).ok()?;
    status.success().then(|| String::from_utf8_lossy(&buf).into_owned())
}

/// 우선순위: 쓸 만한 사용자 node가 있으면 그쪽이 먼저고 내장은 맨 뒤다(claude 안의 셸 `node`·npm이 사용자 node로 돈다).
/// 없거나 낡았으면 체크포인트를 살리려고 내장을 맨 앞에 둔다.
fn order_dirs(mut base: Vec<PathBuf>, bundled: Option<&Path>, user_ok: bool) -> Vec<PathBuf> {
    if let Some(b) = bundled {
        if user_ok {
            base.push(b.to_path_buf());
        } else {
            base.insert(0, b.to_path_buf());
        }
    }
    base
}

/// 내장 폴더를 뺀 기본 목록에서 찾은 사용자 node가 최소 버전 이상인지. 앱 실행 동안 캐시한다.
fn user_node_ok() -> bool {
    *USER_NODE_OK.get_or_init(|| {
        find_named(&base_dirs(), NODE)
            .and_then(|p| node_version_out(&p, Duration::from_secs(2)))
            .is_some_and(|o| node_ok(&o))
    })
}

/// 사용자 node 판정을 미리 데운다(첫 Term::start가 `node -v`를 기다리지 않게).
pub fn warm() {
    let _ = user_node_ok();
}

/// 쓸 수 있는 node(내장 또는 충분한 사용자 node)가 있는가.
pub fn node_usable() -> bool {
    BUNDLED.get().is_some() || user_node_ok()
}

/// claude에 줄 PATH 폴더. 내장 node가 없으면 `node -v`를 실행하지 않는다.
pub fn claude_dirs() -> Vec<PathBuf> {
    match BUNDLED.get() {
        None => base_dirs(),
        Some(b) => order_dirs(base_dirs(), Some(b), user_node_ok()),
    }
}

/// 찾을 폴더(내장 node 제외): 앱 PATH 중 절대 경로만 → ~/.local/bin → (macOS) Homebrew → nvm.
fn base_dirs() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).filter(|d| d.is_absolute()).collect())
        .unwrap_or_default();
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    if let Some(h) = home.clone().filter(|h| !h.is_empty()) {
        v.push(PathBuf::from(h).join(".local").join("bin"));
    }
    #[cfg(target_os = "macos")]
    {
        v.push(PathBuf::from("/opt/homebrew/bin"));
        v.push(PathBuf::from("/usr/local/bin"));
    }
    #[cfg(not(windows))]
    if let Some(h) = home.filter(|h| !h.is_empty()) {
        v.extend(nvm_bins(Path::new(&h)));
    }
    v
}

/// `<home>/.nvm/versions/node/*/bin`, `vX.Y.Z` 내림차순. 해석이 안 되는 이름은 뒤. 폴더가 없으면 빈 목록.
#[cfg_attr(windows, allow(dead_code))]
fn nvm_bins(home: &Path) -> Vec<PathBuf> {
    let root = home.join(".nvm").join("versions").join("node");
    let Ok(rd) = std::fs::read_dir(&root) else { return Vec::new() };
    let ver = |n: &str| -> Option<(u64, u64, u64)> {
        let mut it = n.strip_prefix('v')?.split('.');
        let v = (it.next()?.parse().ok()?, it.next()?.parse().ok()?, it.next()?.parse().ok()?);
        it.next().is_none().then_some(v)
    };
    let mut v: Vec<(Option<(u64, u64, u64)>, String)> = rd
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .map(|n| (ver(&n), n))
        .collect();
    v.sort_by(|a, b| b.0.is_some().cmp(&a.0.is_some()).then(b.0.cmp(&a.0)).then(a.1.cmp(&b.1)));
    v.into_iter().map(|(_, n)| root.join(n).join("bin")).collect()
}

/// 절대 경로 폴더 중 처음으로 `name` 파일이 있는 곳의 절대 경로.
pub fn find_named(dirs: &[PathBuf], name: &str) -> Option<PathBuf> {
    dirs.iter().filter(|d| d.is_absolute()).map(|d| d.join(name)).find(|p| p.is_file())
}

/// 절대 경로 폴더 중 처음으로 `claude` 파일이 있는 곳의 절대 경로.
pub fn find_in(dirs: &[PathBuf]) -> Option<PathBuf> {
    find_named(dirs, CLAUDE)
}

/// 버퍼에서 UTF-8로 완성된 앞부분만 문자열로 꺼낸다. 잘린 꼬리(≤3바이트)는 버퍼에 남기고, 깨진 바이트는 U+FFFD.
pub fn take_utf8(buf: &mut Vec<u8>) -> String {
    let mut out = String::new();
    let mut i = 0;
    loop {
        match std::str::from_utf8(&buf[i..]) {
            Ok(s) => {
                out.push_str(s);
                i = buf.len();
                break;
            }
            Err(e) => {
                let ok = e.valid_up_to();
                out.push_str(std::str::from_utf8(&buf[i..i + ok]).unwrap_or(""));
                i += ok;
                match e.error_len() {
                    None => break, // 잘린 꼬리
                    Some(n) => {
                        out.push('\u{FFFD}');
                        i += n;
                    }
                }
            }
        }
    }
    buf.drain(..i);
    out
}

/// claude cwd로 쓸 수 있는 경로인지 검사한다(비어 있지 않음, 로컬 절대 경로, 폴더).
pub fn check_cwd(cwd: &str) -> Result<(), String> {
    if cwd.is_empty() {
        return Err("세션 폴더를 알 수 없습니다".into());
    }
    if !crate::roadmap::local_abs(cwd) {
        return Err("로컬 절대 경로가 아닙니다".into());
    }
    if !std::path::Path::new(cwd).is_dir() {
        return Err("폴더가 없습니다".into());
    }
    Ok(())
}

/// `\\?\X:\...` 드라이브 경로만 `X:\...`로 벗긴다. `\\?\UNC\...`는 그대로 둔다.
pub fn strip_verbatim_disk(s: &str) -> &str {
    match s.strip_prefix(r"\\?\") {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') && rest.as_bytes()[0].is_ascii_alphabetic() => rest,
        _ => s,
    }
}

/// 세션 id 형식: 36자, 8-4-4-4-12, 하이픈 자리 외 ASCII 16진수.
pub fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| if matches!(i, 8 | 13 | 18 | 23) { b == b'-' } else { b.is_ascii_hexdigit() })
}

/// 새 세션 id: UUID v4(소문자).
pub fn new_session_id() -> Result<String, String> {
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).map_err(|e| format!("난수 생성 실패: {e}"))?;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h: String = b.iter().map(|x| format!("{x:02x}")).collect();
    Ok(format!("{}-{}-{}-{}-{}", &h[..8], &h[8..12], &h[12..16], &h[16..20], &h[20..]))
}

/// claude 인자: 플러그인 경로가 있으면 `--plugin-dir <경로>`(앱이 정한 고정 값)와 메인 세션을 Lead로 하는 `--agent orbit:lead`, 이어 가기는 `--resume <id>`, 새 세션은 `--session-id <id>`(id는 호출자가 검증, 둘은 동시에 주지 않음).
pub fn args<'a>(resume: Option<&'a str>, session_id: Option<&'a str>, settings: Option<&'a str>, plugin: Option<&'a str>) -> Vec<&'a str> {
    debug_assert!(resume.is_none() || session_id.is_none());
    let mut v = Vec::new();
    if let Some(p) = plugin {
        v.extend(["--plugin-dir", p, "--agent", "orbit:lead"]);
    }
    if let Some(s) = settings {
        v.extend(["--settings", s]);
    }
    if let Some(id) = resume {
        v.extend(["--resume", id]);
    }
    if let Some(id) = session_id {
        v.extend(["--session-id", id]);
    }
    v
}

/// 세션 id → 그 세션이 실행됐던 폴더(검증 통과한 것만).
pub fn session_cwd(store: &crate::sessions::Store, id: &str) -> Result<String, String> {
    if !valid_id(id) {
        return Err("세션 id 형식이 아닙니다".into());
    }
    let cwd = store.get(id).ok_or("세션을 찾을 수 없습니다")?.cwd.clone().unwrap_or_default();
    check_cwd(&cwd)?;
    Ok(cwd)
}

#[cfg(windows)]
fn kill_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(0x0800_0000)
        .output();
}

/// `ps -axo pid=,ppid=` 출력에서 root의 자손 pid(root 제외). 형식이 깨진 줄은 건너뛴다.
#[cfg_attr(not(unix), allow(dead_code))]
fn descendants(ps: &str, root: u32) -> Vec<u32> {
    let pairs: Vec<(u32, u32)> = ps
        .lines()
        .filter_map(|l| {
            let mut it = l.split_whitespace();
            match (it.next()?.parse().ok()?, it.next()?.parse().ok()?, it.next()) {
                (pid, ppid, None) => Some((pid, ppid)),
                _ => None,
            }
        })
        .collect();
    let mut out = Vec::new();
    let mut stack = vec![root];
    while let Some(p) = stack.pop() {
        for &(c, pp) in &pairs {
            if pp == p && c != root && !out.contains(&c) {
                out.push(c);
                stack.push(c);
            }
        }
    }
    out
}

/// `pid ppid command…` 줄에서 command의 `--spawned-by` 뒤 `"pid":<숫자열>`이 정확히 root인 줄의 pid.
#[cfg_attr(not(unix), allow(dead_code))]
fn spawned_by(ps: &str, root: u32) -> Vec<u32> {
    ps.lines()
        .filter_map(|l| {
            let (pid, rest) = l.trim_start().split_once(char::is_whitespace)?;
            let pid: u32 = pid.parse().ok()?;
            let (ppid, rest) = rest.trim_start().split_once(char::is_whitespace)?;
            let _ppid: u32 = ppid.parse().ok()?;
            let after = &rest[rest.find("--spawned-by")? + "--spawned-by".len()..];
            // `--spawned-by` 바로 다음 인자가 JSON 객체일 때만, 그 객체 안의 pid를 본다.
            let obj = after.trim_start().strip_prefix('{')?;
            let obj = &obj[..obj.find('}').unwrap_or(obj.len())];
            let v = obj[obj.find("\"pid\":")? + 6..].trim_start();
            let end = v.find(|c: char| !c.is_ascii_digit()).unwrap_or(v.len());
            (end > 0 && v[..end].parse::<u32>().ok() == Some(root)).then_some(pid)
        })
        .collect()
}

/// 루트가 스스로 끝난 뒤 `--spawned-by {"pid":root}`로 남은 setsid 자손 트리를 정리한다.
#[cfg(unix)]
fn reap_spawned(root: u32) {
    let ps = std::process::Command::new("/bin/ps")
        .args(["-axo", "pid=,ppid=,command="])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();
    for p in spawned_by(&ps, root) {
        kill_tree(p);
    }
}
#[cfg(not(unix))]
fn reap_spawned(_root: u32) {}

#[cfg(unix)]
fn kill_tree(pid: u32) {
    // claude는 `claude daemon run`·`--bg-pty-host`(백그라운드 세션)를 setsid로 새 그룹에 띄운다. 그룹 kill로는 안 닿으므로
    // 루트가 죽어 자손이 launchd로 넘어가기 전에 부모-자식 관계로 자손을 먼저 모아 각각 보낸다. Orbit이 띄운 트리 밖은 건드리지 않는다.
    let kids = std::process::Command::new("/bin/ps")
        .args(["-axo", "pid=,ppid="])
        .output()
        .map(|o| descendants(&String::from_utf8_lossy(&o.stdout), pid))
        .unwrap_or_default();
    // portable-pty가 setsid하므로 pid = pgid
    let mut targets = vec![format!("-{pid}")];
    targets.extend(kids.iter().map(|k| k.to_string()));
    let _ = std::process::Command::new("/bin/kill").arg("-TERM").arg("--").args(&targets).output();
}

impl Term {
    pub fn running(&self) -> bool {
        lk(&self.0).proc.is_some()
    }

    #[cfg(test)]
    pub fn size(&self) -> (u16, u16) {
        lk(&self.0).size
    }

    /// 실행 확인 → spawn → proc 설정을 lock 하나 안에서 끝낸다.
    pub fn start(
        &self,
        exe: Option<PathBuf>,
        cwd: &str,
        args: &[&str],
        mut on_out: impl FnMut(TermOut) + Send + 'static,
    ) -> Result<(), String> {
        check_cwd(cwd)?;
        let exe = exe.ok_or(NOT_FOUND)?;
        let mut g = lk(&self.0);
        if g.proc.is_some() {
            return Err("이미 실행 중입니다".into());
        }
        let (cols, rows) = g.size;
        let pair = native_pty_system()
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("터미널을 열지 못했습니다: {e}"))?;
        let mut cmd = CommandBuilder::new(exe);
        cmd.args(args);
        cmd.cwd(cwd);
        cmd.env("TERM", TERM_ENV);
        // Finder로 띄운 앱의 PATH에는 Homebrew가 없어 훅의 node를 못 찾는다.
        // 내장 node는 쓸 만한 사용자 node가 있으면 맨 뒤, 없거나 낡았으면 맨 앞(claude_dirs).
        if let Ok(p) = std::env::join_paths(claude_dirs()) {
            cmd.env("PATH", p);
        }
        let mut child = pair.slave.spawn_command(cmd).map_err(|e| format!("claude를 시작하지 못했습니다: {e}"))?;
        drop(pair.slave);
        let (reader, writer) = match (pair.master.try_clone_reader(), pair.master.take_writer()) {
            (Ok(r), Ok(w)) => (r, w),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("터미널 입출력을 열지 못했습니다".into());
            }
        };
        g.epoch += 1;
        let epoch = g.epoch;
        g.proc = Some(Proc { master: pair.master, writer: Arc::new(Mutex::new(writer)), killer: child.clone_killer(), pid: child.process_id(), epoch });
        drop(g);

        // 대기: 끝나면 자기 epoch의 Proc을 놓아 읽기 스레드가 EOF로 끝나게 한다
        let slot = Arc::clone(&self.0);
        std::thread::spawn(move || {
            let _ = child.wait();
            let mut g = lk(&slot);
            let mine = g.proc.as_ref().is_some_and(|p| p.epoch == epoch);
            let p = if mine { g.proc.take() } else { None };
            let root = p.as_ref().and_then(|p| p.pid);
            drop(g);
            drop(p);
            if let Some(r) = root {
                reap_spawned(r);
            }
        });
        // 읽기: 데이터 → Exit 순서를 한 스레드가 보장. send 실패는 무시하고 EOF까지 비운다
        std::thread::spawn(move || {
            let mut r = reader;
            let mut buf = vec![0u8; 16 * 1024];
            let mut tail: Vec<u8> = Vec::new();
            loop {
                match r.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        tail.extend_from_slice(&buf[..n]);
                        let d = take_utf8(&mut tail);
                        if !d.is_empty() {
                            on_out(TermOut::Data { d });
                        }
                    }
                }
            }
            on_out(TermOut::Exit);
        });
        Ok(())
    }

    pub fn write(&self, data: &str) -> Result<(), String> {
        let w = Arc::clone(&lk(&self.0).proc.as_ref().ok_or("실행 중인 터미널이 없습니다")?.writer);
        let mut w = w.lock().unwrap_or_else(|e| e.into_inner());
        w.write_all(data.as_bytes()).and_then(|_| w.flush()).map_err(|e| format!("터미널에 쓰지 못했습니다: {}", e.kind()))
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        if cols == 0 || rows == 0 {
            return Err("터미널 크기가 0입니다".into());
        }
        let mut g = lk(&self.0);
        g.size = (cols, rows);
        if let Some(p) = g.proc.as_ref() {
            p.master
                .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
                .map_err(|e| format!("터미널 크기를 바꾸지 못했습니다: {e}"))?;
        }
        Ok(())
    }

    /// 트리 종료 → kill → master·writer drop. 여러 번 불러도 된다.
    pub fn stop(&self) {
        let taken = lk(&self.0).proc.take();
        let Some(mut p) = taken else { return };
        if let Some(pid) = p.pid {
            kill_tree(pid);
        }
        let _ = p.killer.kill();
        drop(p);
    }

    /// 같은 Term(같은 PTY 슬롯)인가.
    pub fn same(&self, o: &Term) -> bool {
        Arc::ptr_eq(&self.0, &o.0)
    }
}

/// 탭은 최대 8개.
pub const MAX_TABS: usize = 8;

struct Tab {
    term: Term,
    /// 시작한 (cwd, 시작 시각 ms). 시작 성공 뒤 `set_ran`이 채운다.
    ran: Option<(String, u64)>,
}

/// 탭 id → Term 맵. lock 안에서는 clone·복사만 하고, Term 메서드는 lock 밖에서 부른다.
#[derive(Clone, Default)]
pub struct Tabs(Arc<Mutex<std::collections::HashMap<u32, Tab>>>);

fn lk_tabs(m: &Mutex<std::collections::HashMap<u32, Tab>>) -> MutexGuard<'_, std::collections::HashMap<u32, Tab>> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Tabs {
    /// 없으면 새로 넣고(created=true), 있으면 그 Term(created=false). 새 탭이 상한을 넘으면 Err.
    pub fn open(&self, tab: u32) -> Result<(Term, bool), String> {
        let mut g = lk_tabs(&self.0);
        if let Some(t) = g.get(&tab) {
            return Ok((t.term.clone(), false));
        }
        if g.len() >= MAX_TABS {
            return Err(format!("탭은 {MAX_TABS}개까지 열 수 있습니다"));
        }
        let term = Term::default();
        g.insert(tab, Tab { term: term.clone(), ran: None });
        Ok((term, true))
    }

    pub fn get(&self, tab: u32) -> Option<Term> {
        lk_tabs(&self.0).get(&tab).map(|t| t.term.clone())
    }

    /// 맵에 같은 Term이 아직 있을 때만 ran을 기록한다. 아니면 false(그 사이 탭이 닫혔다).
    pub fn set_ran(&self, tab: u32, term: &Term, cwd: String, t0: u64) -> bool {
        let mut g = lk_tabs(&self.0);
        match g.get_mut(&tab) {
            Some(t) if t.term.same(term) => {
                t.ran = Some((cwd, t0));
                true
            }
            _ => false,
        }
    }

    pub fn remove(&self, tab: u32) -> Option<Term> {
        lk_tabs(&self.0).remove(&tab).map(|t| t.term)
    }

    pub fn take_all(&self) -> Vec<Term> {
        lk_tabs(&self.0).drain().map(|(_, t)| t.term).collect()
    }

    /// ran이 있는 항목의 (탭 id, Term, cwd, 시작 시각). running 판정은 호출자가 lock 밖에서 한다.
    pub fn runs(&self) -> Vec<(u32, Term, String, u64)> {
        lk_tabs(&self.0).iter().filter_map(|(k, t)| t.ran.as_ref().map(|(c, s)| (*k, t.term.clone(), c.clone(), *s))).collect()
    }

    /// ran cwd 목록(중복 제거).
    pub fn cwds(&self) -> Vec<String> {
        let mut v: Vec<String> = lk_tabs(&self.0).values().filter_map(|t| t.ran.as_ref().map(|(c, _)| c.clone())).collect();
        v.sort();
        v.dedup();
        v
    }
}

/// `projects/*/<id>.jsonl`이 파일로 있는가(1단계 하위 폴더만). id 형식이 아니면 false.
pub fn has_transcript(projects: &Path, id: &str) -> bool {
    if !valid_id(id) {
        return false;
    }
    let Ok(rd) = std::fs::read_dir(projects) else { return false };
    let name = format!("{id}.jsonl");
    rd.flatten().any(|e| e.path().join(&name).is_file())
}


#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("orbit-term-{}-{tag}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn take_utf8_keeps_split_hangul_tail() {
        let b = "가".as_bytes().to_vec(); // 3바이트
        for cut in [1, 2] {
            let mut v = b[..cut].to_vec();
            assert_eq!(take_utf8(&mut v), "");
            assert_eq!(v.len(), cut);
            v.extend_from_slice(&b[cut..]);
            assert_eq!(take_utf8(&mut v), "가");
            assert!(v.is_empty());
        }
        let mut v = [b"ab".as_slice(), &b[..2]].concat();
        assert_eq!(take_utf8(&mut v), "ab");
        assert_eq!(v, b[..2]);
    }

    #[test]
    fn take_utf8_replaces_invalid_and_handles_empty() {
        let mut v = vec![b'a', 0xff, b'b'];
        assert_eq!(take_utf8(&mut v), "a\u{FFFD}b");
        assert!(v.is_empty());
        let mut e: Vec<u8> = Vec::new();
        assert_eq!(take_utf8(&mut e), "");
    }

    #[test]
    fn find_in_finds_absolute_ignores_relative_and_missing() {
        let d = tmp("find");
        assert_eq!(find_in(&[d.clone()]), None);
        std::fs::write(d.join(CLAUDE), b"").unwrap();
        assert_eq!(find_in(&[PathBuf::from("."), PathBuf::from("rel"), d.clone()]), Some(d.join(CLAUDE)));
        assert_eq!(find_in(&[PathBuf::from(".")]), None);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn start_rejects_missing_exe_and_bad_cwd() {
        let t = Term::default();
        let ok = tmp("start");
        let cwd = ok.to_str().unwrap();
        assert_eq!(t.start(None, cwd, &[], |_| {}).unwrap_err(), NOT_FOUND);
        let exe = Some(PathBuf::from("/bin/sh"));
        for bad in ["", "rel/dir", "/orbit-no-such-dir-xyz"] {
            assert!(t.start(exe.clone(), bad, &[], |_| {}).is_err());
        }
        assert!(!t.running());
        let _ = std::fs::remove_dir_all(&ok);
    }

    #[test]
    fn write_without_proc_errs_and_stop_twice_ok() {
        let t = Term::default();
        assert!(t.write("x").is_err());
        t.stop();
        t.stop();
        assert!(!t.running());
    }

    #[test]
    fn resize_zero_errs_and_default_size() {
        let t = Term::default();
        assert_eq!(t.size(), (80, 24));
        assert!(t.resize(0, 10).is_err());
        assert!(t.resize(10, 0).is_err());
        assert_eq!(t.size(), (80, 24));
        assert!(t.resize(100, 30).is_ok());
        assert_eq!(t.size(), (100, 30));
    }

    #[cfg(unix)]
    #[test]
    fn blocked_write_does_not_block_stop_or_running() {
        use std::sync::mpsc::channel;
        use std::time::Duration;
        let t = Arc::new(Term::default());
        let d = tmp("blockw");
        let (otx, orx) = channel();
        t.start(Some(PathBuf::from("/bin/sh")), d.to_str().unwrap(), &["-c", "stty raw -echo; echo READY; sleep 30"], move |m| {
            let _ = otx.send(m);
        })
        .unwrap();
        // raw 모드가 켜진 뒤에 쓴다(그 전 canonical 모드에선 넘치는 입력을 버려 write가 안 막힌다)
        let mut seen = String::new();
        while !seen.contains("READY") {
            match orx.recv_timeout(Duration::from_secs(10)).unwrap() {
                TermOut::Data { d } => seen.push_str(&d),
                TermOut::Exit => panic!("셸이 먼저 끝났다"),
            }
        }
        let t2 = Arc::clone(&t);
        let (wtx, wrx) = channel();
        std::thread::spawn(move || {
            // raw 모드에서 stdin을 안 읽으면(claude처럼) PTY 입력 버퍼가 차서 write가 막힌다
            let _ = wtx.send(t2.write(&"x".repeat(4 << 20)));
        });
        std::thread::sleep(Duration::from_millis(1000));
        let early = wrx.try_recv();
        assert!(early.is_err(), "write가 막혀 있어야 이 테스트가 의미 있다: {early:?}");
        let (tx, rx) = channel();
        let t3 = Arc::clone(&t);
        std::thread::spawn(move || {
            let _ = t3.resize(100, 30);
            let _ = t3.running();
            t3.stop();
            let _ = tx.send(());
        });
        rx.recv_timeout(Duration::from_secs(3)).expect("stop/resize가 막힌 write 때문에 멈췄다");
        assert!(!t.running());
        wrx.recv_timeout(Duration::from_secs(10)).expect("stop 뒤 막힌 write가 풀려야 한다").ok();
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn descendants_walks_tree_only_under_root() {
        // 1 ─ 10(root) ─ 11 ─ 13, 10 ─ 12 / 1 ─ 20 ─ 21 (다른 트리), 줄 형식이 깨진 줄은 무시
        let ps = " 10 1\n11 10\n12 10\n 13  11\n20 1\n21 20\nbad line\n\n";
        let mut d = descendants(ps, 10);
        d.sort();
        assert_eq!(d, vec![11, 12, 13]);
        assert!(descendants(ps, 99).is_empty());
    }

    // claude가 띄우는 `claude daemon run`·`--bg-pty-host`는 setsid로 새 프로세스 그룹에 들어가 그룹 kill을 벗어난다 (DEBUG.md 버그 2)
    #[cfg(unix)]
    #[test]
    fn stop_kills_descendant_in_other_session() {
        use std::time::{Duration, Instant};
        let t = Term::default();
        let d = tmp("setsid");
        let (tx, rx) = std::sync::mpsc::channel();
        let sh = r#"perl -e 'use POSIX; POSIX::setsid() or die; exec "sleep", "300"' & echo "PID:$!"; wait"#;
        t.start(Some(PathBuf::from("/bin/sh")), d.to_str().unwrap(), &["-c", sh], move |m| {
            let _ = tx.send(m);
        })
        .unwrap();
        let mut seen = String::new();
        let pid = loop {
            if let Some(p) = seen.split("PID:").nth(1).and_then(|s| s.split_whitespace().next()).and_then(|s| s.parse::<u32>().ok()) {
                break p;
            }
            match rx.recv_timeout(Duration::from_secs(10)).unwrap() {
                TermOut::Data { d } => seen.push_str(&d),
                TermOut::Exit => panic!("셸이 먼저 끝났다: {seen:?}"),
            }
        };
        let alive = |p: u32| std::process::Command::new("/bin/kill").args(["-0", &p.to_string()]).output().is_ok_and(|o| o.status.success());
        // setsid가 끝나 sleep이 자기 그룹에 들어갈 때까지 기다린다
        let until = Instant::now() + Duration::from_secs(5);
        while Instant::now() < until {
            let o = std::process::Command::new("/bin/ps").args(["-o", "pgid=", "-p", &pid.to_string()]).output().unwrap();
            if String::from_utf8_lossy(&o.stdout).trim() == pid.to_string() {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        t.stop();
        let until = Instant::now() + Duration::from_secs(5);
        while alive(pid) && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(50));
        }
        let left = alive(pid);
        if left {
            let _ = std::process::Command::new("/bin/kill").args(["-KILL", &pid.to_string()]).output();
        }
        assert!(!left, "stop 뒤에도 다른 세션의 자손(pid {pid})이 남았다");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn nvm_bins_sorted_newest_first() {
        let h = tmp("nvm");
        assert!(nvm_bins(&h).is_empty());
        let n = h.join(".nvm/versions/node");
        for v in ["v9.0.0", "v20.1.0", "v18.2.0", "junk"] {
            std::fs::create_dir_all(n.join(v)).unwrap();
        }
        std::fs::write(n.join("file"), b"").unwrap();
        let want: Vec<PathBuf> = ["v20.1.0", "v18.2.0", "v9.0.0", "junk"].iter().map(|v| n.join(v).join("bin")).collect();
        assert_eq!(nvm_bins(&h), want);
        let _ = std::fs::remove_dir_all(&h);
    }

    #[test]
    fn node_ok_compares_numerically() {
        for s in ["v16.9.0\n", "v16.10.0", "v18.0.0", "v22.11.0", "  v17.0.0  "] {
            assert!(node_ok(s), "{s:?}");
        }
        for s in ["v16.8.9", "v15.14.0", "v4.9.1", "v9.99.99", "", "v20", "v20.1", "v20.1.2.3", "20.x.0", "node"] {
            assert!(!node_ok(s), "{s:?}");
        }
    }

    #[test]
    fn order_dirs_places_bundled() {
        let base = vec![PathBuf::from("/a"), PathBuf::from("/b"), PathBuf::from("/c")];
        assert_eq!(order_dirs(base.clone(), None, true), base);
        assert_eq!(order_dirs(base.clone(), None, false), base);
        let b = PathBuf::from("/bundle/bin");
        let last = order_dirs(base.clone(), Some(&b), true);
        assert_eq!(last.last(), Some(&b));
        assert_eq!(last[..3], base[..]);
        let first = order_dirs(base.clone(), Some(&b), false);
        assert_eq!(first.first(), Some(&b));
        assert_eq!(first[1..], base[..]);
        assert_eq!(last.iter().filter(|p| **p == b).count(), 1);
        assert_eq!(first.iter().filter(|p| **p == b).count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn node_version_out_reads_and_times_out() {
        use std::os::unix::fs::PermissionsExt;
        use std::time::{Duration, Instant};
        let d = tmp("nodev");
        let mk = |name: &str, body: &str| {
            let p = d.join(name);
            std::fs::write(&p, body).unwrap();
            std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
            p
        };
        let lim = Duration::from_secs(2);
        let ok = mk("ok", "#!/bin/sh\necho v18.0.0\n");
        let out = node_version_out(&ok, lim).expect("some");
        assert!(node_ok(&out));
        assert_eq!(node_version_out(&mk("fail", "#!/bin/sh\nexit 1\n"), lim), None);
        let slow = mk("slow", "#!/bin/sh\nsleep 5\n");
        let t = Instant::now();
        assert_eq!(node_version_out(&slow, Duration::from_millis(300)), None);
        assert!(t.elapsed() < Duration::from_secs(2));
        let held = mk("held", "#!/bin/sh\necho v18.0.0\nsleep 5 &\n");
        let t = Instant::now();
        assert_eq!(node_version_out(&held, Duration::from_millis(300)), None);
        assert!(t.elapsed() < Duration::from_secs(2));
        assert_eq!(node_version_out(&d.join("nope"), lim), None);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn warm_computes_user_node_check() {
        warm();
        assert!(USER_NODE_OK.get().is_some());
    }

    #[test]
    fn find_named_finds_node() {
        let d = tmp("node");
        assert_eq!(find_named(&[d.clone()], NODE), None);
        std::fs::write(d.join(NODE), b"").unwrap();
        assert_eq!(find_named(&[PathBuf::from("rel"), d.clone()], NODE), Some(d.join(NODE)));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn spawned_by_matches_exact_pid_only() {
        let ps = concat!(
            " 50 1 claude daemon run --spawned-by {\"pid\":23026,\"x\":1}\n",
            "51 1 x --spawned-by {\"pid\": 23026}\n",
            "52 1 x --spawned-by {\"pid\":230260}\n",
            "53 1 x --spawned-by {\"pid\":2302}\n",
            "54 1 x {\"pid\":23026}\n",
            "garbage\n55\n56 1\n57 x --spawned-by {\"pid\":23026}\n"
        );
        assert_eq!(spawned_by(ps, 23026), vec![50, 51]);
    }

    #[cfg(unix)]
    #[test]
    fn spawned_by_ignores_pid_in_other_args() {
        let ps = concat!(
            "60 1 x --spawned-by foo --other {\"pid\":23026}\n",
            "61 1 x --spawned-by {\"label\":\"c\"} --arg {\"pid\":23026}\n",
            "62 1 x --spawned-by {\"label\":\"c\",\"pid\":23026}\n"
        );
        assert_eq!(spawned_by(ps, 23026), vec![62]);
    }

    #[test]
    fn self_exit_reaps_spawned_by_tree() {
        use std::time::{Duration, Instant};
        let t = Term::default();
        let d = tmp("spawnedby");
        let (tx, rx) = std::sync::mpsc::channel();
        let sh = r#"perl -e 'use POSIX; POSIX::setsid() or die; exec "/bin/sh", "-c", "sleep 300; :", "x", "--spawned-by", "{\"pid\":$ARGV[0]}"' $$ & echo "PID:$!"; sleep 1"#;
        t.start(Some(PathBuf::from("/bin/sh")), d.to_str().unwrap(), &["-c", sh], move |m| {
            let _ = tx.send(m);
        })
        .unwrap();
        let mut seen = String::new();
        let pid = loop {
            let p = seen.lines().find_map(|l| l.trim().strip_prefix("PID:")?.trim().parse::<u32>().ok());
            if let Some(p) = p {
                break p;
            }
            match rx.recv_timeout(Duration::from_secs(10)).unwrap() {
                TermOut::Data { d } => seen.push_str(&d),
                TermOut::Exit => panic!("셸이 먼저 끝났다: {seen:?}"),
            }
        };
        let ps = || {
            let o = std::process::Command::new("/bin/ps").args(["-axo", "pid=,ppid="]).output().expect("ps 실행 실패");
            String::from_utf8_lossy(&o.stdout).into_owned()
        };
        // 정리 전에 자손(sleep 300)을 잡아 둔다.
        let mut kids = Vec::new();
        let seen_until = Instant::now() + Duration::from_secs(5);
        while kids.is_empty() && Instant::now() < seen_until {
            kids = descendants(&ps(), pid);
            std::thread::sleep(Duration::from_millis(20));
        }
        // kill -0: 실행 실패는 panic, 종료 코드 비0만 "죽음"
        let alive = |p: u32| std::process::Command::new("/bin/kill").args(["-0", &p.to_string()]).output().expect("kill 실행 실패").status.success();
        let all: Vec<u32> = std::iter::once(pid).chain(kids.iter().copied()).collect();
        let until = Instant::now() + Duration::from_secs(8);
        while all.iter().any(|&p| alive(p)) && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(50));
        }
        let left: Vec<u32> = all.iter().copied().filter(|&p| alive(p)).collect();
        if !left.is_empty() {
            let _ = std::process::Command::new("/bin/kill").args(["-KILL", &format!("-{pid}")]).output();
            for p in &left {
                let _ = std::process::Command::new("/bin/kill").args(["-KILL", &p.to_string()]).output();
            }
        }
        assert!(!kids.is_empty(), "자손 sleep을 찾지 못했다(pid {pid})");
        assert!(left.is_empty(), "스스로 끝난 뒤에도 자손이 남았다: 루트 {pid}, 남은 {left:?}");
        let _ = std::fs::remove_dir_all(&d);
    }

    const ID: &str = "11111111-2222-3333-4444-555555555555";

    #[test]
    fn valid_id_accepts_uuid_shape_only() {
        assert!(valid_id(ID));
        assert!(valid_id("ABCDEF12-abcd-ABCD-0123-456789abcdef"));
        for bad in [
            "11111111-2222-3333-4444-55555555555",
            "11111111-2222-3333-4444-5555555555555",
            "g1111111-2222-3333-4444-555555555555",
            "1111111-12222-3333-4444-555555555555",
            " 11111111-2222-3333-4444-555555555555",
            "11111111-2222-3333-4444-555555555555 ",
            "--resume",
            "-1111111-2222-3333-4444-555555555555",
            "../x",
            "/tmp/a.jsonl",
            "a.jsonl",
            "",
        ] {
            assert!(!valid_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn args_combinations() {
        assert!(args(None, None, None, None).is_empty());
        assert_eq!(args(Some(ID), None, None, None), vec!["--resume", ID]);
        assert_eq!(args(None, Some(ID), None, None), vec!["--session-id", ID]);
        assert_eq!(args(None, None, None, Some("/p")), vec!["--plugin-dir", "/p", "--agent", "orbit:lead"]);
        assert_eq!(args(Some(ID), None, None, Some("/p")), vec!["--plugin-dir", "/p", "--agent", "orbit:lead", "--resume", ID]);
        assert_eq!(args(None, Some(ID), None, Some("/p")), vec!["--plugin-dir", "/p", "--agent", "orbit:lead", "--session-id", ID]);
        assert_eq!(
            args(None, Some(ID), Some("/s.json"), Some("/p")),
            vec!["--plugin-dir", "/p", "--agent", "orbit:lead", "--settings", "/s.json", "--session-id", ID]
        );
        assert_eq!(args(None, None, Some("/s.json"), None), vec!["--settings", "/s.json"]);
        assert_eq!(args(Some(ID), None, Some("/s.json"), None), vec!["--settings", "/s.json", "--resume", ID]);
    }

    #[test]
    fn new_session_id_is_v4_and_unique() {
        let a = new_session_id().unwrap();
        let b = new_session_id().unwrap();
        assert_ne!(a, b);
        for x in [&a, &b] {
            assert!(valid_id(x));
            assert_eq!(x.as_bytes()[14], b'4');
            assert!(matches!(x.as_bytes()[19], b'8' | b'9' | b'a' | b'b'));
            assert_eq!(x, &x.to_lowercase());
        }
    }

    #[test]
    fn session_cwd_validates_id_store_and_dir() {
        let mut st = crate::sessions::Store::default();
        assert_eq!(session_cwd(&st, ID).unwrap_err(), "세션을 찾을 수 없습니다");
        assert_eq!(session_cwd(&st, "--resume").unwrap_err(), "세션 id 형식이 아닙니다");
        let d = tmp("sess");
        let line = |cwd: &str| serde_json::json!({"uuid": "u1", "cwd": cwd});
        st.ingest_log(ID, &line(d.to_str().unwrap()), 1);
        assert_eq!(session_cwd(&st, ID).unwrap(), d.to_str().unwrap());
        let id2 = "22222222-2222-3333-4444-555555555555";
        st.ingest_log(id2, &line("/orbit-no-such-dir-xyz"), 1);
        assert_eq!(session_cwd(&st, id2).unwrap_err(), "폴더가 없습니다");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn check_cwd_rejects_bad_and_accepts_dir() {
        assert!(check_cwd("").is_err());
        assert!(check_cwd("rel/dir").is_err());
        #[cfg(windows)]
        {
            assert!(check_cwd(r"C:\orbit-no-such-dir-xyz").is_err());
            assert_eq!(check_cwd(r"\\server\share\p").unwrap_err(), "로컬 절대 경로가 아닙니다");
            assert!(check_cwd(r"\\?\C:\Windows").is_err());
            assert_eq!(check_cwd(r"\\?\UNC\server\share\p").unwrap_err(), "로컬 절대 경로가 아닙니다");
        }
        #[cfg(not(windows))]
        assert!(check_cwd("/orbit-no-such-dir-xyz").is_err());
        let f = std::env::temp_dir().join(format!("orbit-chat-file-{}", std::process::id()));
        std::fs::write(&f, b"x").unwrap();
        let r = check_cwd(f.to_str().unwrap());
        let _ = std::fs::remove_file(&f);
        assert!(r.is_err());
        assert!(check_cwd(std::env::temp_dir().to_str().unwrap()).is_ok());
    }

    #[test]
    fn strip_verbatim_disk_only_strips_drive_paths() {
        assert_eq!(strip_verbatim_disk(r"\\?\C:\x"), r"C:\x");
        assert_eq!(strip_verbatim_disk(r"\\?\UNC\server\share\p"), r"\\?\UNC\server\share\p");
        assert_eq!(strip_verbatim_disk(r"C:\x"), r"C:\x");
        assert_eq!(strip_verbatim_disk(r"\\?\"), r"\\?\");
    }

    #[cfg(unix)]
    #[test]
    fn start_runs_echo_and_sends_data_then_exit() {
        let t = Term::default();
        let d = tmp("run");
        let (tx, rx) = std::sync::mpsc::channel();
        t.start(Some(PathBuf::from("/bin/echo")), d.to_str().unwrap(), &["안녕"], move |m| {
            let _ = tx.send(m);
        })
        .unwrap();
        let mut s = String::new();
        loop {
            match rx.recv_timeout(std::time::Duration::from_secs(10)).unwrap() {
                TermOut::Data { d } => s.push_str(&d),
                TermOut::Exit => break,
            }
        }
        assert!(s.contains("안녕"), "{s:?}");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn tabs_open_caps_at_max_and_reuses_existing() {
        let t = Tabs::default();
        for i in 1..=MAX_TABS as u32 {
            assert!(t.open(i).unwrap().1, "새 탭 {i}");
        }
        assert!(t.open(99).is_err());
        let (a, created) = t.open(3).unwrap();
        assert!(!created);
        assert!(a.same(&t.get(3).unwrap()));
    }

    #[test]
    fn tabs_remove_then_get_none_and_reopen() {
        let t = Tabs::default();
        t.open(1).unwrap();
        assert!(t.remove(1).is_some());
        assert!(t.get(1).is_none());
        assert!(t.remove(1).is_none());
        assert!(t.open(1).unwrap().1);
    }

    #[test]
    fn tabs_remove_frees_slot_when_full() {
        let t = Tabs::default();
        for i in 1..=MAX_TABS as u32 {
            t.open(i).unwrap();
        }
        assert!(t.open(100).is_err());
        t.remove(4);
        assert!(t.open(100).unwrap().1);
    }

    #[test]
    fn tabs_set_ran_requires_same_term_still_in_map() {
        let t = Tabs::default();
        let (a, _) = t.open(1).unwrap();
        assert!(t.set_ran(1, &a, "/w/p".into(), 5));
        t.remove(1);
        assert!(!t.set_ran(1, &a, "/w/p".into(), 6));
        let (b, _) = t.open(1).unwrap();
        assert!(!t.set_ran(1, &a, "/w/p".into(), 7), "같은 id의 새 Term");
        assert!(t.set_ran(1, &b, "/w/q".into(), 8));
        assert!(!t.set_ran(2, &b, "/w/q".into(), 9), "없는 탭");
    }

    #[test]
    fn tabs_take_all_empties_map() {
        let t = Tabs::default();
        t.open(1).unwrap();
        t.open(2).unwrap();
        assert_eq!(t.take_all().len(), 2);
        assert!(t.get(1).is_none() && t.get(2).is_none());
        assert!(t.take_all().is_empty());
        assert!(t.runs().is_empty() && t.cwds().is_empty());
    }

    #[test]
    fn tabs_runs_and_cwds_only_with_ran() {
        let t = Tabs::default();
        let (a, _) = t.open(1).unwrap();
        t.open(2).unwrap();
        let (c, _) = t.open(3).unwrap();
        assert!(t.set_ran(1, &a, "/w/p".into(), 10));
        assert!(t.set_ran(3, &c, "/w/p".into(), 30));
        let mut r: Vec<(u32, String, u64)> = t.runs().into_iter().map(|(i, _, c, s)| (i, c, s)).collect();
        r.sort();
        assert_eq!(r, vec![(1, "/w/p".to_string(), 10), (3, "/w/p".to_string(), 30)]);
        assert_eq!(t.cwds(), vec!["/w/p".to_string()]);
    }

    #[cfg(unix)]
    #[test]
    fn tabs_stop_one_leaves_other_running() {
        let t = Tabs::default();
        let d = tmp("tabs2");
        let cwd = d.to_str().unwrap();
        let (a, _) = t.open(1).unwrap();
        let (b, _) = t.open(2).unwrap();
        for x in [&a, &b] {
            x.start(Some(PathBuf::from("/bin/sh")), cwd, &["-c", "sleep 30"], |_| {}).unwrap();
        }
        assert!(a.running() && b.running());
        t.remove(1).unwrap().stop();
        assert!(!a.running());
        assert!(b.running());
        t.remove(2).unwrap().stop();
        assert!(!b.running());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn has_transcript_finds_file_in_one_level_only() {
        let p = tmp("transcript");
        assert!(!has_transcript(&p, ID));
        std::fs::create_dir_all(p.join("slug")).unwrap();
        assert!(!has_transcript(&p, ID));
        std::fs::create_dir_all(p.join("slug").join(format!("{ID}.jsonl"))).unwrap();
        assert!(!has_transcript(&p, ID), "같은 이름의 폴더");
        std::fs::remove_dir_all(p.join("slug").join(format!("{ID}.jsonl"))).unwrap();
        std::fs::write(p.join("slug").join(format!("{ID}.jsonl")), b"{}").unwrap();
        assert!(has_transcript(&p, ID));
        assert!(!has_transcript(&p, "../x"));
        assert!(!has_transcript(&p, "22222222-2222-3333-4444-555555555555"));
        std::fs::create_dir_all(p.join("a").join("b")).unwrap();
        std::fs::write(p.join("a").join("b").join("33333333-2222-3333-4444-555555555555.jsonl"), b"{}").unwrap();
        assert!(!has_transcript(&p, "33333333-2222-3333-4444-555555555555"), "2단계 아래는 안 본다");
        assert!(!has_transcript(&p.join("no-such"), ID));
        let _ = std::fs::remove_dir_all(&p);
    }
}
