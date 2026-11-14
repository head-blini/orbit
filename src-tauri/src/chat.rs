use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;

pub const MAX_LINE: usize = 1024 * 1024;

struct Proc {
    child: Child,
    stdin: ChildStdin,
    epoch: u64,
}

#[derive(Default)]
pub struct Chat {
    proc: Arc<Mutex<Option<Proc>>>,
    epoch: AtomicU64,
}

impl Chat {
    /// 사이드카가 없으면 띄워 `start`를, 있으면 `send`를 쓴다(있을 때 cwd는 무시).
    pub fn send(&self, app: &tauri::AppHandle, cwd: Option<String>, text: &str) -> Result<(), String> {
        if self.proc.lock().unwrap_or_else(|e| e.into_inner()).is_some() {
            return self.write(&json!({"t": "send", "text": text}));
        }
        let app = app.clone();
        self.spawn_with(cwd.as_deref(), text, move |v| {
            let _ = app.emit("chat", v);
        })
    }

    pub fn write(&self, msg: &Value) -> Result<(), String> {
        let mut g = self.proc.lock().unwrap_or_else(|e| e.into_inner());
        let p = g.as_mut().ok_or("대화가 없습니다")?;
        write_json(&mut p.stdin, msg)
    }

    /// close → stdin 닫기 → 3초 대기 → 안 끝나면 트리째 종료. 여러 번 불러도 된다.
    pub fn stop(&self) {
        let taken = self.proc.lock().unwrap_or_else(|e| e.into_inner()).take();
        let Some(Proc { mut child, mut stdin, .. }) = taken else { return };
        let _ = write_json(&mut stdin, &json!({"t": "close"}));
        drop(stdin);
        let end = Instant::now() + Duration::from_secs(3);
        while Instant::now() < end {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // claude.exe까지 트리로 끝낸다
            let _ = Command::new("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .creation_flags(0x0800_0000)
                .output();
        }
        let _ = child.kill();
        let _ = child.wait();
    }

    fn spawn_with(
        &self,
        cwd: Option<&str>,
        text: &str,
        mut on_line: impl FnMut(Value) + Send + 'static,
    ) -> Result<(), String> {
        let cwd = cwd.filter(|c| !c.is_empty()).ok_or("세션 폴더를 알 수 없습니다")?;
        if !crate::roadmap::local_abs(cwd) {
            return Err("로컬 절대 경로가 아닙니다".into());
        }
        if !std::path::Path::new(cwd).is_dir() {
            return Err("폴더가 없습니다".into());
        }
        let mut g = self.proc.lock().unwrap_or_else(|e| e.into_inner());
        if g.is_some() {
            return Err("이미 대화가 있습니다".into());
        }
        // shortcut: dev 빌드 경로 고정, 설치 파일을 만들 때 resources로 옮긴다
        let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../sidecar/chat.mjs");
        let mut cmd = Command::new("node");
        cmd.arg(script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "Node.js 18.14 이상이 필요합니다 — node를 찾지 못했습니다".to_string()
            } else {
                format!("사이드카를 시작하지 못했습니다: {}", e.kind())
            }
        })?;
        let (Some(mut stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
            let _ = child.kill();
            let _ = child.wait();
            return Err("사이드카 입출력을 열지 못했습니다".into());
        };
        if let Err(e) = write_json(&mut stdin, &json!({"t": "start", "cwd": cwd, "text": text})) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e);
        }
        let epoch = self.epoch.fetch_add(1, Ordering::SeqCst) + 1;
        *g = Some(Proc { child, stdin, epoch });
        let slot = Arc::clone(&self.proc);
        std::thread::spawn(move || {
            pump(BufReader::new(stdout), &mut on_line);
            // 지금 대화일 때만 exit을 알린다(새 대화로 끈 프로세스의 exit는 버림)
            let mut g = slot.lock().unwrap_or_else(|e| e.into_inner());
            let mine = if g.as_ref().is_some_and(|p| p.epoch == epoch) { g.take() } else { None };
            drop(g);
            if let Some(mut p) = mine {
                let _ = p.child.wait();
                on_line(json!({"t": "exit"}));
            }
        });
        Ok(())
    }
}

fn write_json(w: &mut impl Write, msg: &Value) -> Result<(), String> {
    let mut line = msg.to_string();
    line.push('\n');
    w.write_all(line.as_bytes()).and_then(|_| w.flush()).map_err(|e| format!("사이드카에 쓰지 못했습니다: {}", e.kind()))
}

/// 객체이고 `t`가 문자열인 줄만 통과시킨다.
pub fn parse_line(b: &[u8]) -> Option<Value> {
    let v: Value = serde_json::from_slice(b).ok()?;
    v.get("t")?.is_string().then_some(v)
}

/// 줄 단위로 읽어 emit한다. MAX_LINE을 넘는 줄은 읽는 도중에 모으기를 멈추고 줄 끝까지 흘려 보낸다.
pub fn pump<R: BufRead>(mut r: R, mut emit: impl FnMut(Value)) {
    let mut line: Vec<u8> = Vec::new();
    let mut over = false;
    loop {
        let buf = match r.fill_buf() {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        };
        if buf.is_empty() {
            break;
        }
        let nl = buf.iter().position(|&b| b == b'\n');
        let chunk = &buf[..nl.unwrap_or(buf.len())];
        if !over {
            if line.len() + chunk.len() > MAX_LINE {
                over = true;
                line = Vec::new();
            } else {
                line.extend_from_slice(chunk);
            }
        }
        let used = chunk.len() + nl.is_some() as usize;
        r.consume(used);
        if nl.is_some() {
            if !over {
                if let Some(v) = parse_line(&line) {
                    emit(v);
                }
            }
            line.clear();
            over = false;
        }
    }
    if !over {
        if let Some(v) = parse_line(&line) {
            emit(v);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Cursor;

    #[test]
    fn parse_line_accepts_only_objects_with_string_t() {
        assert_eq!(parse_line(br#"{"t":"delta","text":"a"}"#), Some(json!({"t":"delta","text":"a"})));
        assert_eq!(parse_line(b"{\"t\":\"done\"}\r\n"), Some(json!({"t":"done"})));
        assert_eq!(parse_line(br#"{"x":1}"#), None);
        assert_eq!(parse_line(br#"{"t":1}"#), None);
        assert_eq!(parse_line(b"[]"), None);
        assert_eq!(parse_line(b"{bad"), None);
        assert_eq!(parse_line(b""), None);
        assert_eq!(parse_line(b"\r\n"), None);
    }

    fn run_pump(input: Vec<u8>) -> Vec<Value> {
        let mut out = Vec::new();
        pump(Cursor::new(input), |v| out.push(v));
        out
    }

    #[test]
    fn pump_skips_bad_long_and_non_utf8_lines_keeps_order() {
        let mut b = Vec::new();
        b.extend_from_slice(b"{\"t\":\"a\"}\n{\"t\":\"b\"}\n{bad\n");
        b.extend_from_slice(b"{\"t\":\"x\",\"p\":\"");
        b.extend(std::iter::repeat(b'z').take(MAX_LINE + 1));
        b.extend_from_slice(b"\"}\n");
        b.extend_from_slice(b"{\"t\":\"u\",\"p\":\"\xff\xfe\"}\n");
        b.extend_from_slice(b"{\"t\":\"c\"}\n");
        let got = run_pump(b);
        assert_eq!(got, vec![json!({"t":"a"}), json!({"t":"b"}), json!({"t":"c"})]);
    }

    #[test]
    fn pump_line_of_exactly_max_is_kept_and_last_line_without_newline() {
        let head = br#"{"t":"k","p":""#;
        let tail = br#""}"#;
        let mut b = head.to_vec();
        b.extend(std::iter::repeat(b'z').take(MAX_LINE - head.len() - tail.len()));
        b.extend_from_slice(tail);
        assert_eq!(b.len(), MAX_LINE);
        b.extend_from_slice(b"\n{\"t\":\"last\"}");
        let got = run_pump(b);
        assert_eq!(got.len(), 2);
        assert_eq!(got[1], json!({"t":"last"}));
    }

    #[test]
    fn pump_drops_overlong_line_with_tiny_reader_buffer() {
        // 누적 버퍼 크기는 관측할 수 없어 단언하지 않는다: 작은 BufRead 버퍼로 읽어도 상한 초과 줄만 버려지고 뒤 줄은 산다.
        let mut b = vec![b'a'; MAX_LINE * 3];
        b.extend_from_slice(b"\n{\"t\":\"ok\"}\n");
        let mut out = Vec::new();
        pump(std::io::BufReader::with_capacity(8, Cursor::new(b)), |v| out.push(v));
        assert_eq!(out, vec![json!({"t":"ok"})]);
    }

    #[test]
    fn write_without_process_errs_and_stop_is_idempotent() {
        let c = Chat::default();
        assert!(c.write(&json!({"t":"close"})).is_err());
        c.stop();
        c.stop();
    }

    #[test]
    fn spawn_rejects_bad_cwd_without_starting_a_process() {
        let c = Chat::default();
        let none = |_v: Value| {};
        assert_eq!(c.spawn_with(None, "hi", none).unwrap_err(), "세션 폴더를 알 수 없습니다");
        assert_eq!(c.spawn_with(Some(""), "hi", none).unwrap_err(), "세션 폴더를 알 수 없습니다");
        assert_eq!(c.spawn_with(Some("rel/dir"), "hi", none).unwrap_err(), "로컬 절대 경로가 아닙니다");
        #[cfg(windows)]
        assert_eq!(c.spawn_with(Some(r"\\server\share\p"), "hi", none).unwrap_err(), "로컬 절대 경로가 아닙니다");
        #[cfg(windows)]
        let missing = r"C:\orbit-no-such-dir-xyz";
        #[cfg(not(windows))]
        let missing = "/orbit-no-such-dir-xyz";
        assert_eq!(c.spawn_with(Some(missing), "hi", none).unwrap_err(), "폴더가 없습니다");
        assert!(c.write(&json!({"t":"close"})).is_err());
    }
}
