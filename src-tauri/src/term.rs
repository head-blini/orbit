//! 앱 안 터미널: portable-pty로 진짜 `claude` CLI를 띄우고 출력은 Channel로 흘린다.
//! 웹뷰는 실행 파일·인자·경로·환경을 정하지 못한다(id·데이터·숫자만 넘어온다).

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

#[cfg(windows)]
pub const CLAUDE: &str = "claude.exe";
#[cfg(not(windows))]
pub const CLAUDE: &str = "claude";
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

pub struct Term(Arc<Mutex<Inner>>);

impl Default for Term {
    fn default() -> Self {
        Term(Arc::new(Mutex::new(Inner { proc: None, epoch: 0, size: (80, 24) })))
    }
}

fn lk(m: &Mutex<Inner>) -> MutexGuard<'_, Inner> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// 찾을 폴더: 앱 PATH 중 절대 경로만 → ~/.local/bin → (macOS) Homebrew.
pub fn claude_dirs() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).filter(|d| d.is_absolute()).collect())
        .unwrap_or_default();
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    if let Some(h) = home.filter(|h| !h.is_empty()) {
        v.push(PathBuf::from(h).join(".local").join("bin"));
    }
    #[cfg(target_os = "macos")]
    {
        v.push(PathBuf::from("/opt/homebrew/bin"));
        v.push(PathBuf::from("/usr/local/bin"));
    }
    v
}

/// 절대 경로 폴더 중 처음으로 `claude` 파일이 있는 곳의 절대 경로.
pub fn find_in(dirs: &[PathBuf]) -> Option<PathBuf> {
    dirs.iter().filter(|d| d.is_absolute()).map(|d| d.join(CLAUDE)).find(|p| p.is_file())
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

/// claude 인자: 새로 시작은 없음, 이어 가기는 `--resume <id>`(id는 호출자가 검증).
pub fn args(resume: Option<&str>) -> Vec<&str> {
    match resume {
        Some(id) => vec!["--resume", id],
        None => Vec::new(),
    }
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

#[cfg(unix)]
fn kill_tree(pid: u32) {
    // portable-pty가 setsid하므로 pid = pgid (미확인, M9로 실측)
    let _ = std::process::Command::new("/bin/kill").args(["-TERM", "--", &format!("-{pid}")]).output();
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
            drop(g);
            drop(p);
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
    fn args_none_empty_some_resume() {
        assert!(args(None).is_empty());
        assert_eq!(args(Some(ID)), vec!["--resume", ID]);
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
}
