//! settings.json 훅 설치 도우미 (T2)
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const EVENTS: [&str; 11] = [
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "SubagentStop",
    "Stop",
    "Notification",
    "SubagentStart",
    "PostToolUseFailure",
    "PermissionRequest",
    "SessionEnd",
    "StopFailure",
];

const TOKEN_HEADER: &str = "X-Orbit-Token";

fn is_orbit(h: &Value) -> bool {
    h.get("type").and_then(Value::as_str) == Some("http")
        && h.get("headers").and_then(|x| x.get(TOKEN_HEADER)).is_some()
}

/// 파일 내용을 읽어 JSON으로 파싱한다. 파일 없음 = Ok(None).
fn read_root(path: &Path) -> Result<Option<Value>, String> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("settings 읽기 실패: {e}")),
    };
    let v: Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("settings JSON이 깨져 있음: {e}"))?;
    if !v.is_object() {
        return Err("settings 루트가 객체가 아님".into());
    }
    Ok(Some(v))
}

/// Orbit 핸들러를 모두 뺀다. 그 때문에 비게 된 그룹·이벤트·hooks도 지운다. 바뀌었으면 true.
fn strip(root: &mut Value) -> Result<bool, String> {
    let Some(hooks) = root.get_mut("hooks") else {
        return Ok(false);
    };
    let hooks = hooks.as_object_mut().ok_or("`hooks`가 객체가 아님")?;
    let mut changed = false;
    let mut emptied = vec![];
    for (name, list) in hooks.iter_mut() {
        let groups = list
            .as_array_mut()
            .ok_or_else(|| format!("`hooks.{name}`이 배열이 아님"))?;
        let mut removed = false;
        groups.retain_mut(|g| {
            let Some(hs) = g.get_mut("hooks").and_then(Value::as_array_mut) else {
                return true;
            };
            let n = hs.len();
            hs.retain(|h| !is_orbit(h));
            removed |= hs.len() != n;
            hs.len() == n || !hs.is_empty()
        });
        changed |= removed;
        if removed && groups.is_empty() {
            emptied.push(name.clone());
        }
    }
    for name in emptied {
        hooks.shift_remove(&name);
    }
    if changed && hooks.is_empty() {
        root.as_object_mut().expect("root is object").shift_remove("hooks");
    }
    Ok(changed)
}

fn suffixed(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    path.with_file_name(name)
}

/// 기존 파일이 있으면 바이트 동일 백업을 만들고, 임시 파일 → rename으로 교체한다.
fn write_atomic(path: &Path, root: &Value) -> Result<Option<PathBuf>, String> {
    let mut text = serde_json::to_string_pretty(root).map_err(|e| e.to_string())?;
    text.push('\n');
    let backup = if path.exists() {
        // 내용이 같으면 쓰지도 백업하지도 않는다.
        if fs::read(path).map_err(|e| format!("settings 읽기 실패: {e}"))? == text.as_bytes() {
            return Ok(None);
        }
        let ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        // 같은 ms에 또 쓰면 기존 백업을 덮지 않고 번호를 붙인다.
        let mut b = suffixed(path, &format!(".orbit-backup-{ms}"));
        for n in 1.. {
            if !b.exists() {
                break;
            }
            b = suffixed(path, &format!(".orbit-backup-{ms}-{n}"));
        }
        fs::copy(path, &b).map_err(|e| format!("백업 실패: {e}"))?;
        Some(b)
    } else {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| format!("폴더 생성 실패: {e}"))?;
        }
        None
    };
    let tmp = suffixed(path, ".orbit-tmp");
    fs::write(&tmp, text).map_err(|e| format!("임시 파일 쓰기 실패: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("settings 교체 실패: {e}")
    })?;
    Ok(backup)
}

pub fn install(path: &Path, port: u16, token: &str) -> Result<Option<PathBuf>, String> {
    let mut root = read_root(path)?.unwrap_or_else(|| json!({}));
    strip(&mut root)?;
    let obj = root.as_object_mut().expect("root is object");
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    let hooks = hooks.as_object_mut().ok_or("`hooks`가 객체가 아님")?;
    let handler = json!({
        "type": "http",
        "url": format!("http://127.0.0.1:{port}/events"),
        "headers": { TOKEN_HEADER: token },
        "timeout": 2,
    });
    for ev in EVENTS {
        hooks
            .entry(ev)
            .or_insert_with(|| json!([]))
            .as_array_mut()
            .ok_or_else(|| format!("`hooks.{ev}`이 배열이 아님"))?
            .push(json!({ "hooks": [handler.clone()] }));
    }
    write_atomic(path, &root)
}

pub fn uninstall(path: &Path) -> Result<Option<PathBuf>, String> {
    let Some(mut root) = read_root(path)? else {
        return Ok(None);
    };
    if !strip(&mut root)? {
        return Ok(None);
    }
    write_atomic(path, &root)
}

/// 모든 이벤트에 지금 앱의 포트·토큰과 정확히 맞는 Orbit 핸들러가 있을 때만 true.
pub fn is_installed(path: &Path, port: u16, token: &str) -> Result<bool, String> {
    let Some(root) = read_root(path)? else {
        return Ok(false);
    };
    let url = format!("http://127.0.0.1:{port}/events");
    Ok(EVENTS.iter().all(|ev| {
        root["hooks"][ev].as_array().is_some_and(|groups| {
            groups.iter().filter_map(|g| g["hooks"].as_array()).flatten().any(|h| {
                is_orbit(h)
                    && h["url"].as_str() == Some(&url)
                    && h["headers"][TOKEN_HEADER].as_str() == Some(token)
            })
        })
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    const FIXTURE: &str = r#"{"model":"x","permissions":{"allow":["Read"]},"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"echo hi"}]}]}}"#;

    struct Dir(PathBuf);
    impl Dir {
        fn new() -> Dir {
            static N: AtomicU32 = AtomicU32::new(0);
            let d = std::env::temp_dir().join(format!(
                "orbit-hooks-test-{}-{}",
                std::process::id(),
                N.fetch_add(1, Ordering::SeqCst)
            ));
            fs::create_dir_all(&d).unwrap();
            Dir(d)
        }
        fn file(&self, content: &str) -> PathBuf {
            let p = self.0.join("settings.json");
            fs::write(&p, content).unwrap();
            p
        }
        fn names(&self) -> Vec<String> {
            fs::read_dir(&self.0)
                .unwrap()
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect()
        }
    }
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn read(p: &Path) -> Value {
        serde_json::from_slice(&fs::read(p).unwrap()).unwrap()
    }

    fn orbit_handlers<'a>(root: &'a Value, ev: &str) -> Vec<&'a Value> {
        root["hooks"][ev]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|g| g["hooks"].as_array().unwrap())
            .filter(|h| h["headers"]["X-Orbit-Token"].is_string())
            .collect()
    }

    #[test]
    fn install_preserves_and_adds_all_events() {
        let d = Dir::new();
        let p = d.file(FIXTURE);
        let backup = install(&p, 4000, "tok").unwrap().unwrap();
        assert_eq!(fs::read(&backup).unwrap(), FIXTURE.as_bytes());
        let v = read(&p);
        assert_eq!(v["model"], "x");
        assert_eq!(v["permissions"]["allow"][0], "Read");
        assert_eq!(v["hooks"]["PreToolUse"][0]["hooks"][0]["command"], "echo hi");
        for ev in EVENTS {
            let hs = orbit_handlers(&v, ev);
            assert_eq!(hs.len(), 1, "{ev}");
            assert_eq!(hs[0]["url"], "http://127.0.0.1:4000/events");
            assert_eq!(hs[0]["headers"]["X-Orbit-Token"], "tok");
            assert_eq!(hs[0]["timeout"], 2);
            assert!(hs[0].get("onFailure").is_none());
        }
    }

    #[test]
    fn reinstall_replaces_without_duplicates() {
        let d = Dir::new();
        let p = d.file(FIXTURE);
        install(&p, 4000, "tok").unwrap();
        install(&p, 5000, "tok2").unwrap();
        let v = read(&p);
        for ev in EVENTS {
            let hs = orbit_handlers(&v, ev);
            assert_eq!(hs.len(), 1, "{ev}");
            assert_eq!(hs[0]["url"], "http://127.0.0.1:5000/events");
        }
    }

    #[test]
    fn install_then_uninstall_restores_original() {
        let d = Dir::new();
        let p = d.file(FIXTURE);
        install(&p, 4000, "tok").unwrap();
        assert!(uninstall(&p).unwrap().is_some());
        let v = read(&p);
        assert_eq!(v, serde_json::from_str::<Value>(FIXTURE).unwrap());
        let keys: Vec<_> = v.as_object().unwrap().keys().collect();
        assert_eq!(keys, ["model", "permissions", "hooks"]);
    }

    #[test]
    fn identical_reinstall_writes_and_backs_up_nothing() {
        let d = Dir::new();
        let p = d.file(FIXTURE);
        install(&p, 4000, "tok").unwrap();
        let before = fs::read(&p).unwrap();
        let names = d.names().len();
        assert_eq!(install(&p, 4000, "tok"), Ok(None));
        assert_eq!(fs::read(&p).unwrap(), before);
        assert_eq!(d.names().len(), names);
    }

    #[test]
    fn rapid_writes_keep_original_backup() {
        let d = Dir::new();
        let p = d.file(FIXTURE);
        for port in 4000..4005 {
            install(&p, port, "tok").unwrap();
        }
        let backups: Vec<_> = d.names().into_iter().filter(|n| n.contains(".orbit-backup-")).collect();
        assert_eq!(backups.len(), 5);
        assert!(backups.iter().any(|n| fs::read(d.0.join(n)).unwrap() == FIXTURE.as_bytes()));
    }

    // 사용자 훅과 Orbit이 아닌 http 훅이 Orbit 핸들러와 같은 그룹에 섞여 있어도 보존된다.
    #[test]
    fn mixed_group_keeps_foreign_handlers() {
        let mixed = r#"{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo a"},{"type":"http","url":"http://x.example/e","headers":{"Authorization":"b"}},{"type":"http","url":"http://127.0.0.1:1/events","headers":{"X-Orbit-Token":"old"}}]}]}}"#;
        let expected: Value = serde_json::from_str(
            r#"{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo a"},{"type":"http","url":"http://x.example/e","headers":{"Authorization":"b"}}]}]}}"#,
        )
        .unwrap();
        let d = Dir::new();
        let p = d.file(mixed);
        install(&p, 4000, "tok").unwrap();
        let v = read(&p);
        assert_eq!(v["hooks"]["Stop"][0], expected["hooks"]["Stop"][0]);
        assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(), 2);
        uninstall(&p).unwrap();
        assert_eq!(read(&p), expected);
    }

    // 옛 버전(SessionStart 포함)이 심은 항목도 이벤트 이름이 아니라 헤더로 식별돼 재설치·제거 때 지워진다.
    #[test]
    fn legacy_session_start_entry_is_removed() {
        assert!(!EVENTS.contains(&"SessionStart"));
        let legacy = r#"{"hooks":{"SessionStart":[{"hooks":[{"type":"http","url":"http://127.0.0.1:1/events","headers":{"X-Orbit-Token":"old"}}]}]}}"#;
        let d = Dir::new();
        let p = d.file(legacy);
        install(&p, 4000, "tok").unwrap();
        assert!(read(&p)["hooks"].get("SessionStart").is_none());
        let p2 = d.0.join("b.json");
        fs::write(&p2, legacy).unwrap();
        uninstall(&p2).unwrap();
        assert_eq!(read(&p2), serde_json::json!({}));
    }

    #[test]
    fn missing_file_is_created() {
        let d = Dir::new();
        let p = d.0.join("sub").join("settings.json");
        assert_eq!(install(&p, 4000, "tok").unwrap(), None);
        let v = read(&p);
        for ev in EVENTS {
            assert_eq!(orbit_handlers(&v, ev).len(), 1);
        }
    }

    #[test]
    fn broken_json_is_untouched() {
        let d = Dir::new();
        let p = d.file(r#"{"hooks": ["#);
        assert!(install(&p, 4000, "tok").is_err());
        assert_eq!(fs::read(&p).unwrap(), br#"{"hooks": ["#);
        assert_eq!(d.names(), ["settings.json"]);
    }

    #[test]
    fn hooks_not_object_is_untouched() {
        let d = Dir::new();
        let p = d.file(r#"{"hooks":[]}"#);
        assert!(install(&p, 4000, "tok").is_err());
        assert_eq!(fs::read(&p).unwrap(), br#"{"hooks":[]}"#);
        assert_eq!(d.names(), ["settings.json"]);
    }

    #[test]
    fn is_installed_lifecycle() {
        let d = Dir::new();
        let p = d.0.join("settings.json");
        assert_eq!(is_installed(&p, 4000, "tok"), Ok(false));
        fs::write(&p, FIXTURE).unwrap();
        assert_eq!(is_installed(&p, 4000, "tok"), Ok(false));
        install(&p, 4000, "tok").unwrap();
        assert_eq!(is_installed(&p, 4000, "tok"), Ok(true));
        uninstall(&p).unwrap();
        assert_eq!(is_installed(&p, 4000, "tok"), Ok(false));
    }

    #[test]
    fn is_installed_requires_matching_port_and_token() {
        let d = Dir::new();
        let p = d.file(FIXTURE);
        install(&p, 4000, "tok").unwrap();
        assert_eq!(is_installed(&p, 4001, "tok"), Ok(false));
        assert_eq!(is_installed(&p, 4000, "other"), Ok(false));
        assert_eq!(is_installed(&p, 4000, "tok"), Ok(true));
        // 이벤트 하나가 어긋나도 설치됨이 아니다.
        let mut v = read(&p);
        v["hooks"]["Stop"][0]["hooks"][0]["url"] = json!("http://127.0.0.1:1/events");
        fs::write(&p, v.to_string()).unwrap();
        assert_eq!(is_installed(&p, 4000, "tok"), Ok(false));
    }

    #[test]
    fn install_after_port_change_leaves_one_new_entry() {
        let d = Dir::new();
        let p = d.file(FIXTURE);
        install(&p, 4000, "tok").unwrap();
        assert_eq!(is_installed(&p, 5000, "tok2"), Ok(false));
        install(&p, 5000, "tok2").unwrap();
        assert_eq!(is_installed(&p, 5000, "tok2"), Ok(true));
        let v = read(&p);
        for ev in EVENTS {
            let hs = orbit_handlers(&v, ev);
            assert_eq!(hs.len(), 1, "{ev}");
            assert_eq!(hs[0]["url"], "http://127.0.0.1:5000/events");
        }
    }

    #[test]
    fn uninstall_without_orbit_entries_is_noop() {
        let d = Dir::new();
        let p = d.file(FIXTURE);
        assert_eq!(uninstall(&p), Ok(None));
        assert_eq!(fs::read(&p).unwrap(), FIXTURE.as_bytes());
        assert_eq!(d.names(), ["settings.json"]);
    }
}
