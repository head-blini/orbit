mod config;
mod hooks;
mod server;

use std::net::SocketAddr;
use std::path::PathBuf;
use tauri::{Emitter, Manager, State};

struct AppState {
    cfg: Result<config::Config, String>,
    server: Result<SocketAddr, String>,
    settings_path: Result<PathBuf, String>,
}

#[derive(serde::Serialize)]
struct Status {
    listen_addr: Option<String>,
    server_error: Option<String>,
    settings_path: String,
    installed: Option<bool>,
    settings_error: Option<String>,
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
    let (path, installed, settings_error) = match &state.settings_path {
        Ok(p) => match hooks::is_installed(p) {
            Ok(b) => (p.display().to_string(), Some(b), None),
            Err(e) => (p.display().to_string(), None, Some(e)),
        },
        Err(e) => (String::new(), None, Some(e.clone())),
    };
    Status { listen_addr, server_error, settings_path: path, installed, settings_error }
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
            let server = match &cfg {
                Ok(c) => {
                    let handle = app.handle().clone();
                    server::start(c.port, c.token.clone(), move |v| {
                        let _ = handle.emit("hook-event", v);
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
            app.manage(AppState { cfg, server, settings_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_status, install_hooks, uninstall_hooks])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
