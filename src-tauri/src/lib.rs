mod chat;
mod config;
mod hooks;
mod roadmap;
mod screens;
mod server;
mod sessions;
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
}

#[derive(serde::Serialize)]
struct Status {
    listen_addr: Option<String>,
    server_error: Option<String>,
    installed: Option<bool>,
    settings_error: Option<String>,
    projects_error: Option<String>,
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

fn settings_path(state: &AppState) -> Result<&PathBuf, String> {
    state.settings_path.as_ref().map_err(|e| e.clone())
}

#[tauri::command(async)]
fn get_status(state: State<AppState>) -> Status {
    let (listen_addr, server_error) = match &state.server {
        Ok(a) => (Some(a.to_string()), None),
        Err(e) => (None, Some(e.clone())),
    };
    let (installed, settings_error) = match &state.settings_path {
        Ok(p) => match hooks::is_installed(p) {
            Ok(b) => (Some(b), None),
            Err(e) => (None, Some(e)),
        },
        Err(e) => (None, Some(e.clone())),
    };
    let projects_error = state.projects_dir.as_ref().err().cloned();
    Status { listen_addr, server_error, installed, settings_error, projects_error }
}

#[tauri::command(async)]
fn get_roadmap(state: State<AppState>, id: String) -> roadmap::Roadmap {
    let cwd = lock(&state.store).get(&id).and_then(|s| s.cwd.clone());
    roadmap::for_cwd(cwd.as_deref())
}

#[tauri::command(async)]
fn get_sessions(state: State<AppState>) -> Vec<sessions::Session> {
    let now = sessions::now_ms();
    lock(&state.store).all().into_iter().map(|s| sessions::stalled(s, now)).collect()
}

#[tauri::command(async)]
fn list_screens(state: State<AppState>) -> Vec<String> {
    match &state.screens_dir {
        Ok(d) => screens::list(d).iter().map(|p| p.display().to_string()).collect(),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let cfg = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())
                .and_then(|d| config::load_or_create(&d));
            let store = Arc::new(Mutex::new(sessions::Store::default()));
            let server = match &cfg {
                Ok(c) => {
                    let handle = app.handle().clone();
                    let store = store.clone();
                    server::start(c.port, c.token.clone(), move |v| {
                        let snap = {
                            let mut st = lock(&store);
                            let now = sessions::now_ms();
                            st.ingest_hook(&v, now).and_then(|id| st.get(&id).map(|s| sessions::snapshot(s, now)))
                        };
                        if let Some(s) = snap {
                            let _ = handle.emit("session-update", vec![s]);
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
                std::thread::spawn(move || {
                    let mut w = watch::Watcher::new(root);
                    loop {
                        let snaps = poll_round(&mut w, &store);
                        if !snaps.is_empty() {
                            let _ = handle.emit("session-update", snaps);
                        }
                        std::thread::sleep(std::time::Duration::from_secs(1));
                    }
                });
            }
            let screens_dir = app.path().app_data_dir().map(|d| d.join("screens")).map_err(|e| e.to_string());
            app.manage(AppState { cfg, server, settings_path, store, projects_dir, screens_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_roadmap,
            get_sessions,
            list_screens,
            open_screens_dir,
            install_hooks,
            uninstall_hooks
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
}
