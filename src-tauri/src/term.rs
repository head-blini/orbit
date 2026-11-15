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
    writer: Box<dyn Write + Send>,
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
        crate::chat::check_cwd(cwd)?;
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
        g.proc = Some(Proc { master: pair.master, writer, killer: child.clone_killer(), pid: child.process_id(), epoch });
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
        let mut g = lk(&self.0);
        let p = g.proc.as_mut().ok_or("실행 중인 터미널이 없습니다")?;
        p.writer.write_all(data.as_bytes()).and_then(|_| p.writer.flush()).map_err(|e| format!("터미널에 쓰지 못했습니다: {}", e.kind()))
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
