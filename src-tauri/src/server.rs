//! 훅 수신 서버 (T1)

use serde_json::Value;
use std::net::SocketAddr;

pub const MAX_BODY: u64 = 4 * 1024 * 1024;

use std::io::Read;
use tiny_http::{Request, Response, Server};

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn header(req: &Request, name: &str) -> Option<String> {
    req.headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str().to_string())
}

/// 판정 순서는 PLAN 참고. 본문은 인증 뒤에만 읽는다.
fn handle(mut req: Request, port: u16, token: &str, on_event: &impl Fn(Value)) {
    let host = header(&req, "Host").unwrap_or_default();
    let code = if host != format!("127.0.0.1:{port}") && host != format!("localhost:{port}") {
        403
    } else if header(&req, "Origin").is_some() {
        403
    } else if req.url().split('?').next() != Some("/events") {
        404
    } else if req.method() != &tiny_http::Method::Post {
        405
    } else if !ct_eq(
        header(&req, "X-Orbit-Token").unwrap_or_default().as_bytes(),
        token.as_bytes(),
    ) {
        401
    } else if req.body_length().is_some_and(|n| n as u64 > MAX_BODY) {
        413
    } else {
        let mut body = Vec::new();
        let _ = req.as_reader().take(MAX_BODY + 1).read_to_end(&mut body);
        if body.len() as u64 > MAX_BODY {
            413
        } else if let Ok(v) = serde_json::from_slice::<Value>(&body) {
            let _ = req.respond(Response::empty(204));
            on_event(v);
            return;
        } else {
            400
        }
    };
    let _ = req.respond(Response::empty(code));
}

pub fn start(
    port: u16,
    token: String,
    on_event: impl Fn(Value) + Send + 'static,
) -> Result<SocketAddr, String> {
    let server = Server::http(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    let addr = server.server_addr().to_ip().ok_or("not an IP listener")?;
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            handle(req, addr.port(), &token, &on_event);
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

    #[test]
    fn ct_eq_cases() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab"));
        assert!(ct_eq(b"", b""));
    }
}
