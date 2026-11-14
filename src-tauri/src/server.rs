//! 훅 수신 서버 (T1)

use serde_json::Value;
use std::io::{ErrorKind, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

pub const MAX_BODY: u64 = 4 * 1024 * 1024;
/// 요청 줄 + 헤더 전체 상한. 넘으면 431.
const MAX_HEAD: usize = 16 * 1024;
/// 연결 하나가 읽기에 쓸 수 있는 총 시간. 바이트를 조금씩 흘려도 이 안에 끊는다.
const DEADLINE: Duration = Duration::from_secs(2);

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// 마감까지 남은 시간을 읽기 타임아웃으로 걸고 한 번 읽는다.
fn read_by(s: &mut TcpStream, buf: &mut [u8], end: Instant) -> std::io::Result<usize> {
    let left = end.saturating_duration_since(Instant::now());
    if left.is_zero() {
        return Err(ErrorKind::TimedOut.into());
    }
    s.set_read_timeout(Some(left))?;
    s.read(buf)
}

/// 판정 순서는 PLAN 참고. 본문은 인증·크기 검사 뒤에만 할당하고 읽는다.
/// None이면 응답 없이 닫는다(헤더가 다 오기 전에 끊기거나 마감 초과).
fn judge(s: &mut TcpStream, port: u16, token: &str, end: Instant) -> Option<Result<Value, u16>> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    let head_end = loop {
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break i;
        }
        if buf.len() > MAX_HEAD {
            return Some(Err(431));
        }
        match read_by(s, &mut chunk, end) {
            Ok(0) | Err(_) => return None,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    };
    if head_end > MAX_HEAD {
        return Some(Err(431));
    }
    let head = String::from_utf8_lossy(&buf[..head_end]);
    let mut lines = head.split("\r\n");
    let mut first = lines.next().unwrap_or("").split(' ');
    let (method, target) = (first.next().unwrap_or(""), first.next().unwrap_or(""));
    let headers: Vec<(&str, &str)> = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(k, v)| (k.trim(), v.trim()))
        .collect();
    let header = |name: &str| headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| *v);

    let host = header("Host").unwrap_or("");
    let code = if host != format!("127.0.0.1:{port}") && host != format!("localhost:{port}") {
        403
    } else if header("Origin").is_some() {
        403
    } else if target.split('?').next() != Some("/events") {
        404
    } else if method != "POST" {
        405
    } else if !ct_eq(header("X-Orbit-Token").unwrap_or("").as_bytes(), token.as_bytes()) {
        401
    } else if header("Transfer-Encoding").is_some() {
        // shortcut: chunked 본문은 받지 않는다(Claude Code http 훅은 Content-Length로 보냄), 실측에서 chunked가 보이면 구현.
        411
    } else {
        let len = match header("Content-Length").map(str::parse::<u64>) {
            None => 0,
            Some(Ok(n)) => n,
            Some(Err(_)) => return Some(Err(400)),
        };
        if len > MAX_BODY {
            413
        } else {
            let len = len as usize;
            let mut body = buf.split_off(head_end + 4);
            while body.len() < len {
                match read_by(s, &mut chunk, end) {
                    Ok(0) | Err(_) => return Some(Err(400)),
                    Ok(n) => body.extend_from_slice(&chunk[..n]),
                }
            }
            body.truncate(len);
            return Some(serde_json::from_slice(&body).map_err(|_| 400));
        }
    };
    Some(Err(code))
}

fn serve(mut s: TcpStream, port: u16, token: &str, tx: &mpsc::Sender<Value>) {
    let end = Instant::now() + DEADLINE;
    let Some(r) = judge(&mut s, port, token, end) else { return };
    let _ = match &r {
        Ok(_) => s.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n"),
        Err(c) => write!(s, "HTTP/1.1 {c} \r\nContent-Length: 0\r\nConnection: close\r\n\r\n"),
    };
    let _ = s.shutdown(Shutdown::Write);
    // 응답을 먼저 보낸 뒤 이벤트를 넘긴다.
    if let Ok(v) = r {
        let _ = tx.send(v);
    }
    // 안 읽은 바이트를 남기고 닫으면 RST로 응답이 사라질 수 있어 마감까지 고정 버퍼로 버린다(할당 없음).
    let mut sink = [0u8; 4096];
    while matches!(read_by(&mut s, &mut sink, end), Ok(n) if n > 0) {}
}

pub fn start(
    port: u16,
    token: String,
    on_event: impl Fn(Value) + Send + 'static,
) -> Result<SocketAddr, String> {
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || rx.iter().for_each(on_event));
    let token: Arc<str> = token.into();
    std::thread::spawn(move || {
        for s in listener.incoming().flatten() {
            let (token, tx) = (token.clone(), tx.clone());
            // 연결마다 스레드: 느린 연결 하나가 다른 연결을 막지 않게. 생성에 실패하면 그 연결만 닫힌다.
            let _ = std::thread::Builder::new().spawn(move || serve(s, addr.port(), &token, &tx));
        }
    });
    Ok(addr)
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{Ipv4Addr, TcpStream};
    use std::sync::mpsc::{self, Receiver};
    use std::time::Duration;

    const TOKEN: &str = "tok-test";

    fn boot() -> (u16, Receiver<Value>, SocketAddr) {
        let (tx, rx) = mpsc::channel();
        let addr = start(0, TOKEN.to_string(), move |v| {
            let _ = tx.send(v);
        })
        .expect("start");
        (addr.port(), rx, addr)
    }

    /// 원시 요청을 보내고 (상태 코드, 본문 바이트 수)를 돌려준다.
    fn send(port: u16, raw: &str) -> (u16, usize) {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut buf = Vec::new();
        let _ = s.read_to_end(&mut buf);
        let text = String::from_utf8_lossy(&buf).to_string();
        let code = text.split_whitespace().nth(1).unwrap().parse().unwrap();
        let body = text.split("\r\n\r\n").nth(1).map_or(0, |b| b.len());
        (code, body)
    }

    fn post(port: u16, host: &str, extra: &str, body: &str) -> (u16, usize) {
        send(
            port,
            &format!(
                "POST /events HTTP/1.1\r\nHost: {host}\r\n{extra}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            ),
        )
    }

    fn tok() -> String {
        format!("X-Orbit-Token: {TOKEN}\r\n")
    }

    fn none(rx: &Receiver<Value>) {
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
    }

    #[test]
    fn ok_with_token_delivers_event() {
        let (p, rx, _) = boot();
        let (c, b) = post(p, &format!("127.0.0.1:{p}"), &tok(), r#"{"hook_event_name":"Stop"}"#);
        assert_eq!((c, b), (204, 0));
        let v = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(v, serde_json::json!({"hook_event_name":"Stop"}));
        none(&rx);
    }

    #[test]
    fn localhost_host_ok() {
        let (p, rx, _) = boot();
        assert_eq!(post(p, &format!("localhost:{p}"), &tok(), "{}").0, 204);
        assert!(rx.recv_timeout(Duration::from_secs(2)).is_ok());
    }

    #[test]
    fn missing_token_401() {
        let (p, rx, _) = boot();
        assert_eq!(post(p, &format!("127.0.0.1:{p}"), "", "{}").0, 401);
        none(&rx);
    }

    #[test]
    fn wrong_token_401() {
        let (p, rx, _) = boot();
        let h = "X-Orbit-Token: nope\r\n";
        assert_eq!(post(p, &format!("127.0.0.1:{p}"), h, "{}").0, 401);
        none(&rx);
    }

    #[test]
    fn origin_403() {
        let (p, rx, _) = boot();
        let h = format!("{}Origin: http://evil.example\r\n", tok());
        assert_eq!(post(p, &format!("127.0.0.1:{p}"), &h, "{}").0, 403);
        none(&rx);
    }

    #[test]
    fn bad_host_403() {
        let (p, rx, _) = boot();
        assert_eq!(post(p, "evil.example", &tok(), "{}").0, 403);
        none(&rx);
    }

    #[test]
    fn too_large_413() {
        let (p, rx, _) = boot();
        let raw = format!(
            "POST /events HTTP/1.1\r\nHost: 127.0.0.1:{p}\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n",
            tok(),
            MAX_BODY + 1
        );
        assert_eq!(send(p, &raw).0, 413);
        none(&rx);
    }

    #[test]
    fn wrong_method_and_path() {
        let (p, _rx, _) = boot();
        let get = format!("GET /events HTTP/1.1\r\nHost: 127.0.0.1:{p}\r\n{}Connection: close\r\n\r\n", tok());
        assert_eq!(send(p, &get).0, 405);
        let other = format!("POST /other HTTP/1.1\r\nHost: 127.0.0.1:{p}\r\n{}Content-Length: 0\r\nConnection: close\r\n\r\n", tok());
        assert_eq!(send(p, &other).0, 404);
    }

    #[test]
    fn bad_json_400_then_server_alive() {
        let (p, rx, _) = boot();
        let host = format!("127.0.0.1:{p}");
        assert_eq!(post(p, &host, &tok(), "{oops").0, 400);
        none(&rx);
        assert_eq!(post(p, &host, &tok(), "{}").0, 204);
        assert!(rx.recv_timeout(Duration::from_secs(2)).is_ok());
    }

    #[test]
    fn unknown_fields_passed_through() {
        let (p, rx, _) = boot();
        let body = r#"{"hook_event_name":"X","zzz":[1,{"a":null}]}"#;
        assert_eq!(post(p, &format!("127.0.0.1:{p}"), &tok(), body).0, 204);
        let v = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(v, serde_json::from_str::<Value>(body).unwrap());
    }

    #[test]
    fn binds_loopback_only() {
        let (_, _, addr) = boot();
        assert_eq!(addr.ip(), Ipv4Addr::LOCALHOST);
        assert!(!addr.ip().is_unspecified());
    }

    // S2 회귀: 토큰 없는 클라이언트가 큰 Content-Length만 보내고 본문 없이 소켓을 쥐고 있어도
    // 다른 정상 요청은 곧바로 처리돼야 한다.
    #[test]
    fn stalled_unauth_body_does_not_block_others() {
        let (p, rx, _) = boot();
        let mut hold = TcpStream::connect(("127.0.0.1", p)).unwrap();
        let head = format!("POST /events HTTP/1.1\r\nHost: 127.0.0.1:{p}\r\nContent-Length: 2000\r\n\r\n");
        hold.write_all(head.as_bytes()).unwrap();
        std::thread::sleep(Duration::from_millis(300));
        let t = std::time::Instant::now();
        assert_eq!(post(p, &format!("127.0.0.1:{p}"), &tok(), "{}").0, 204);
        assert!(t.elapsed() < Duration::from_secs(1), "took {:?}", t.elapsed());
        assert!(rx.recv_timeout(Duration::from_secs(2)).is_ok());
        drop(hold);
    }

    // S2 회귀: 터무니없이 큰 Content-Length(2^50, u64 최대)에 할당하지 않고 살아 있어야 한다.
    #[test]
    fn huge_content_length_does_not_crash() {
        let (p, rx, _) = boot();
        let host = format!("127.0.0.1:{p}");
        for n in ["1125899906842624", "18446744073709551615"] {
            let unauth = format!("POST /events HTTP/1.1\r\nHost: {host}\r\nContent-Length: {n}\r\nConnection: close\r\n\r\n");
            assert_eq!(send(p, &unauth).0, 401);
            let auth = format!("POST /events HTTP/1.1\r\nHost: {host}\r\n{}Content-Length: {n}\r\nConnection: close\r\n\r\n", tok());
            assert_eq!(send(p, &auth).0, 413);
        }
        assert_eq!(post(p, &host, &tok(), "{}").0, 204);
        assert!(rx.recv_timeout(Duration::from_secs(2)).is_ok());
    }

    // S2 회귀: 헤더가 상한을 넘으면 거부하고 이벤트를 넘기지 않는다.
    #[test]
    fn oversized_header_rejected() {
        let (p, rx, _) = boot();
        let pad = format!("X-Pad: {}\r\n", "a".repeat(64 * 1024));
        let h = format!("{}{pad}", tok());
        assert_eq!(post(p, &format!("127.0.0.1:{p}"), &h, "{}").0, 431);
        none(&rx);
    }

    #[test]
    fn ct_eq_cases() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab"));
        assert!(ct_eq(b"", b""));
    }
}
