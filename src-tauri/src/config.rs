//! 토큰·포트 파일 (T3)
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Config {
    pub port: u16,
    pub token: String,
}

const FILE: &str = "hook-server.json";

/// 파일이 있으면 읽고(깨졌으면 덮어쓰지 않고 Err), 없으면 새 토큰·빈 포트로 만들어 저장한다.
pub fn load_or_create(dir: &Path) -> Result<Config, String> {
    let path = dir.join(FILE);
    match std::fs::read(&path) {
        Ok(bytes) => {
            let cfg: Config = serde_json::from_slice(&bytes)
                .map_err(|e| format!("{} 읽기 실패(파일은 그대로 둠): {e}", path.display()))?;
            #[cfg(unix)]
            {
                // 예전 기본 권한(0644) 파일 교정. 실패해도 시작을 막지 않는다.
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
            return Ok(cfg);
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("{} 읽기 실패: {e}", path.display())),
    }
    let mut buf = [0u8; 32];
    getrandom::fill(&mut buf).map_err(|e| format!("난수 생성 실패: {e}"))?;
    let token: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map_err(|e| format!("빈 포트 찾기 실패: {e}"))?
        .port();
    let cfg = Config { port, token };
    std::fs::create_dir_all(dir).map_err(|e| format!("{} 만들기 실패: {e}", dir.display()))?;
    let json = serde_json::to_vec(&cfg).map_err(|e| e.to_string())?;
    crate::hooks::write_private(&path, &json).map_err(|e| format!("{} 저장 실패: {e}", path.display()))?;
    Ok(cfg)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn tmp() -> std::path::PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let d = std::env::temp_dir().join(format!(
            "orbit-config-test-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn creates_in_empty_dir() {
        let d = tmp();
        let c = load_or_create(&d).unwrap();
        assert_eq!(c.token.len(), 64);
        assert!(c.token.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')));
        assert_ne!(c.port, 0);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn reuses_existing() {
        let d = tmp();
        let a = load_or_create(&d).unwrap();
        assert_eq!(a, load_or_create(&d).unwrap());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn different_dirs_different_tokens() {
        let (d1, d2) = (tmp(), tmp());
        let a = load_or_create(&d1).unwrap();
        let b = load_or_create(&d2).unwrap();
        assert_ne!(a.token, b.token);
        let _ = std::fs::remove_dir_all(&d1);
        let _ = std::fs::remove_dir_all(&d2);
    }

    #[test]
    fn corrupt_file_errs_and_is_untouched() {
        let d = tmp();
        std::fs::create_dir_all(&d).unwrap();
        let f = d.join("hook-server.json");
        std::fs::write(&f, b"{not json").unwrap();
        assert!(load_or_create(&d).is_err());
        assert_eq!(std::fs::read(&f).unwrap(), b"{not json");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[cfg(unix)]
    #[test]
    fn new_file_is_0600_and_no_tmp() {
        use std::os::unix::fs::PermissionsExt;
        let d = tmp();
        load_or_create(&d).unwrap();
        let m = std::fs::metadata(d.join("hook-server.json")).unwrap().permissions().mode();
        assert_eq!(m & 0o777, 0o600);
        assert!(!d.join("hook-server.json.tmp").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[cfg(unix)]
    #[test]
    fn existing_0644_file_is_corrected() {
        use std::os::unix::fs::PermissionsExt;
        let d = tmp();
        std::fs::create_dir_all(&d).unwrap();
        let f = d.join("hook-server.json");
        std::fs::write(&f, br#"{"port":4000,"token":"abc"}"#).unwrap();
        std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o644)).unwrap();
        let c = load_or_create(&d).unwrap();
        assert_eq!(c, Config { port: 4000, token: "abc".into() });
        assert_eq!(std::fs::metadata(&f).unwrap().permissions().mode() & 0o777, 0o600);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[cfg(unix)]
    #[test]
    fn corrupt_file_permissions_untouched() {
        use std::os::unix::fs::PermissionsExt;
        let d = tmp();
        std::fs::create_dir_all(&d).unwrap();
        let f = d.join("hook-server.json");
        std::fs::write(&f, b"{not json").unwrap();
        std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(load_or_create(&d).is_err());
        assert_eq!(std::fs::metadata(&f).unwrap().permissions().mode() & 0o777, 0o644);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn stale_tmp_does_not_block_creation() {
        let d = tmp();
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("hook-server.json.tmp"), b"old").unwrap();
        load_or_create(&d).unwrap();
        assert!(!d.join("hook-server.json.tmp").exists());
        let _ = std::fs::remove_dir_all(&d);
    }
}
