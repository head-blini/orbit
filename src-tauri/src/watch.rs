//! 세션 로그 디렉터리 감시.

use serde::Deserialize;
use serde_json::{value::RawValue, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

pub const MAX_LINE: usize = 16 * 1024 * 1024;

struct Tail {
    offset: u64,
    skipping: bool,
}

pub struct Watcher {
    root: PathBuf,
    files: HashMap<PathBuf, Tail>,
}

impl Watcher {
    pub fn new(root: PathBuf) -> Self {
        Watcher { root, files: HashMap::new() }
    }

    pub fn poll(&mut self, mut on_line: impl FnMut(&str, Value)) {
        let found = list_logs(&self.root);
        let live: HashSet<&PathBuf> = found.iter().map(|(p, _)| p).collect();
        self.files.retain(|p, _| live.contains(p));
        for (path, sid) in found {
            let tail = self.files.entry(path.clone()).or_insert(Tail { offset: 0, skipping: false });
            match read_new(&path, tail, &sid, &mut on_line) {
                Err(e) if e.kind() == ErrorKind::NotFound => {
                    self.files.remove(&path);
                }
                _ => {} // 공유 위반 등은 다음 회차에 재시도
            }
        }
    }
}

fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| {
            if matches!(i, 8 | 13 | 18 | 23) { b == b'-' } else { b.is_ascii_hexdigit() }
        })
}

/// `root/<dir>/<uuid>.jsonl`(깊이 2, 심볼릭 링크 제외)만 (경로, 세션 ID)로 모은다.
fn list_logs(root: &Path) -> Vec<(PathBuf, String)> {
    let mut out = Vec::new();
    let Ok(dirs) = fs::read_dir(root) else { return out };
    for d in dirs.flatten() {
        if !d.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let Ok(files) = fs::read_dir(d.path()) else { continue };
        for f in files.flatten() {
            if !f.file_type().map(|t| t.is_file()).unwrap_or(false) {
                continue;
            }
            let name = f.file_name();
            let Some(stem) = name.to_str().and_then(|n| n.strip_suffix(".jsonl")) else { continue };
            if is_uuid(stem) {
                out.push((f.path(), stem.to_string()));
            }
        }
    }
    out
}

fn read_new(
    path: &Path,
    tail: &mut Tail,
    sid: &str,
    on_line: &mut impl FnMut(&str, Value),
) -> std::io::Result<()> {
    let len = fs::metadata(path)?.len();
    if len < tail.offset {
        tail.offset = 0;
        tail.skipping = false;
    }
    if len == tail.offset {
        return Ok(());
    }
    let mut file = File::open(path)?;
    let mut buf = Vec::new();
    loop {
        file.seek(SeekFrom::Start(tail.offset))?;
        buf.clear();
        (&mut file).take(MAX_LINE as u64 + 1).read_to_end(&mut buf)?;
        let start = tail.offset;
        consume(&buf, tail, sid, on_line);
        // 전진이 없으면(빈 읽기·미완결 꼬리) 끝, 전진했으면 남은 부분을 같은 회차에 계속 읽는다.
        if tail.offset == start {
            return Ok(());
        }
    }
}

/// buf(offset부터의 바이트)를 처리하고 offset을 전진시킨다. 미완결 꼬리를 남기면 false.
fn consume(buf: &[u8], tail: &mut Tail, sid: &str, on_line: &mut impl FnMut(&str, Value)) -> bool {
    let mut rest = buf;
    while !rest.is_empty() {
        let Some(i) = rest.iter().position(|&b| b == b'\n') else {
            if tail.skipping || rest.len() > MAX_LINE {
                tail.skipping = true;
                tail.offset = tail.offset.saturating_add(rest.len() as u64);
            }
            return tail.skipping;
        };
        let (line, after) = rest.split_at(i);
        if !tail.skipping && line.len() <= MAX_LINE {
            if let Some(v) = slim(line) {
                on_line(sid, v);
            }
        }
        tail.skipping = false;
        tail.offset = tail.offset.saturating_add(i as u64 + 1);
        rest = after.get(1..).unwrap_or_default();
    }
    true
}

#[derive(Deserialize)]
struct Top<'a> {
    #[serde(borrow)]
    timestamp: Option<&'a RawValue>,
    #[serde(borrow)]
    cwd: Option<&'a RawValue>,
    #[serde(borrow)]
    uuid: Option<&'a RawValue>,
    #[serde(borrow, rename = "isSidechain")]
    is_sidechain: Option<&'a RawValue>,
    #[serde(borrow)]
    message: Option<&'a RawValue>,
}

#[derive(Deserialize)]
struct Msg<'a> {
    #[serde(borrow)]
    content: Option<&'a RawValue>,
}

#[derive(Deserialize)]
struct Blk<'a> {
    #[serde(borrow, rename = "type")]
    kind: Option<&'a RawValue>,
    #[serde(borrow)]
    id: Option<&'a RawValue>,
    #[serde(borrow)]
    tool_use_id: Option<&'a RawValue>,
    #[serde(borrow)]
    name: Option<&'a RawValue>,
    #[serde(borrow)]
    is_error: Option<&'a RawValue>,
    #[serde(borrow)]
    input: Option<&'a RawValue>,
}

#[derive(Deserialize)]
struct Inp<'a> {
    #[serde(borrow)]
    subagent_type: Option<&'a RawValue>,
    #[serde(borrow)]
    description: Option<&'a RawValue>,
}

fn first(r: &RawValue) -> u8 {
    r.get().bytes().next().unwrap_or(0)
}

/// 문자열이면 Value로, 아니면 None(소비자는 `as_str`만 쓴다).
fn put_str(m: &mut Map<String, Value>, k: &str, r: Option<&RawValue>) {
    if let Some(r) = r.filter(|r| first(r) == b'"') {
        if let Ok(v) = serde_json::from_str::<Value>(r.get()) {
            m.insert(k.to_string(), v);
        }
    }
}

fn put_bool(m: &mut Map<String, Value>, k: &str, r: Option<&RawValue>) {
    if let Some(b) = r.and_then(|r| r.get().parse::<bool>().ok()) {
        m.insert(k.to_string(), Value::Bool(b));
    }
}

fn slim_block(r: &RawValue) -> Value {
    let Some(b) = Some(r).filter(|r| first(r) == b'{').and_then(|r| serde_json::from_str::<Blk>(r.get()).ok()) else {
        return Value::Null;
    };
    let mut m = Map::new();
    put_str(&mut m, "type", b.kind);
    put_str(&mut m, "id", b.id);
    put_str(&mut m, "tool_use_id", b.tool_use_id);
    put_str(&mut m, "name", b.name);
    put_bool(&mut m, "is_error", b.is_error);
    if let Some(i) = b.input.filter(|r| first(r) == b'{').and_then(|r| serde_json::from_str::<Inp>(r.get()).ok()) {
        let mut im = Map::new();
        put_str(&mut im, "subagent_type", i.subagent_type);
        put_str(&mut im, "description", i.description);
        m.insert("input".to_string(), Value::Object(im));
    }
    Value::Object(m)
}

/// 한 줄에서 소비자(`Store::ingest_log`)가 읽는 필드만 남긴 Value. 큰 본문은 파싱·할당하지 않는다.
fn slim(line: &[u8]) -> Option<Value> {
    if line.iter().find(|b| !b.is_ascii_whitespace()) != Some(&b'{') {
        return None;
    }
    let t: Top = serde_json::from_slice(line).ok()?;
    let mut m = Map::new();
    put_str(&mut m, "timestamp", t.timestamp);
    put_str(&mut m, "cwd", t.cwd);
    put_str(&mut m, "uuid", t.uuid);
    put_bool(&mut m, "isSidechain", t.is_sidechain);
    let content = t
        .message
        .filter(|r| first(r) == b'{')
        .and_then(|r| serde_json::from_str::<Msg>(r.get()).ok())
        .and_then(|msg| msg.content)
        .filter(|r| first(r) == b'[')
        .and_then(|r| serde_json::from_str::<Vec<&RawValue>>(r.get()).ok());
    if let Some(c) = content {
        let blocks = c.into_iter().map(slim_block).collect();
        let mut msg = Map::new();
        msg.insert("content".to_string(), Value::Array(blocks));
        m.insert("message".to_string(), Value::Object(msg));
    }
    Some(Value::Object(m))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::sync::atomic::{AtomicU32, Ordering};

    static N: AtomicU32 = AtomicU32::new(0);
    const U: &str = "0a1b2c3d-0000-4000-8000-123456789abc";

    struct Tmp(PathBuf);
    impl Tmp {
        fn new() -> Tmp {
            let p = std::env::temp_dir().join(format!(
                "orbit-watch-test-{}-{}",
                std::process::id(),
                N.fetch_add(1, Ordering::SeqCst)
            ));
            let _ = fs::remove_dir_all(&p);
            Tmp(p)
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn collect(w: &mut Watcher) -> Vec<(String, Value)> {
        let mut v = Vec::new();
        w.poll(|s, x| v.push((s.to_string(), x)));
        v
    }

    fn log(t: &Tmp) -> PathBuf {
        let d = t.0.join("slug");
        fs::create_dir_all(&d).unwrap();
        d.join(format!("{U}.jsonl"))
    }

    fn append(p: &PathBuf, b: &[u8]) {
        let mut f = OpenOptions::new().create(true).append(true).open(p).unwrap();
        f.write_all(b).unwrap();
    }

    #[test]
    fn a_complete_line() {
        let t = Tmp::new();
        append(&log(&t), b"{\"cwd\":\"a\"}\n");
        let mut w = Watcher::new(t.0.clone());
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].0, U);
        assert_eq!(r[0].1["cwd"], "a");
    }

    #[test]
    fn b_half_line() {
        let t = Tmp::new();
        let p = log(&t);
        append(&p, b"{\"a\":");
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 0);
        append(&p, b"1}\n");
        assert_eq!(collect(&mut w).len(), 1);
    }

    #[test]
    fn c_broken_json() {
        let t = Tmp::new();
        append(&log(&t), b"{oops\n{\"cwd\":\"ok\"}\n");
        let mut w = Watcher::new(t.0.clone());
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].1["cwd"], "ok");
    }

    #[test]
    fn d_oversize_line() {
        let t = Tmp::new();
        let mut b = vec![b'x'; MAX_LINE + 1];
        b.extend_from_slice(b"\n{\"cwd\":\"ok\"}\n");
        append(&log(&t), &b);
        let mut w = Watcher::new(t.0.clone());
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].1["cwd"], "ok");
    }

    #[test]
    fn e_growing_tail() {
        let t = Tmp::new();
        let p = log(&t);
        append(&p, &vec![b'x'; MAX_LINE / 2 + 10]);
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 0);
        append(&p, &vec![b'x'; MAX_LINE / 2 + 10]);
        assert_eq!(collect(&mut w).len(), 0);
        append(&p, b"\n{\"cwd\":\"ok\"}\n");
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].1["cwd"], "ok");
    }

    #[test]
    fn f_truncated_rewrite() {
        let t = Tmp::new();
        let p = log(&t);
        append(&p, b"{\"n\":1}\n{\"n\":2}\n");
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 2);
        fs::write(&p, b"{\"cwd\":\"3\"}\n").unwrap();
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].1["cwd"], "3");
    }

    #[test]
    fn g_deleted_file() {
        let t = Tmp::new();
        let p = log(&t);
        append(&p, b"{\"n\":1}\n");
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 1);
        fs::remove_file(&p).unwrap();
        assert_eq!(collect(&mut w).len(), 0);
    }

    #[test]
    fn h_excluded_files() {
        let t = Tmp::new();
        let d = t.0.join("slug");
        fs::create_dir_all(&d).unwrap();
        let line: &[u8] = b"{\"n\":1}\n";
        for n in [
            format!("{U}.orphaned-1-x.jsonl"),
            format!("{U}.jsonl.superseded-1"),
            format!("{U}.meta.json"),
            "notauuid.jsonl".to_string(),
        ] {
            append(&d.join(n), line);
        }
        for sub in [format!("{U}/tool-results/{U}.jsonl"), format!("{U}/subagents/agent-a1.jsonl")] {
            let p = d.join(sub);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            append(&p, line);
        }
        append(&t.0.join(format!("{U}.jsonl")), line);
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 0);
    }

    #[test]
    fn i_missing_root() {
        let t = Tmp::new();
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 0);
        append(&log(&t), b"{\"n\":1}\n");
        assert_eq!(collect(&mut w).len(), 1);
    }

    #[test]
    fn j_no_change() {
        let t = Tmp::new();
        append(&log(&t), b"{\"n\":1}\n");
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 1);
        assert_eq!(collect(&mut w).len(), 0);
    }

    fn json_line(n: usize) -> Vec<u8> {
        let mut b = b"{\"a\":\"".to_vec();
        b.extend(vec![b'x'; n]);
        b.extend_from_slice(b"\"}
");
        b
    }

    #[test]
    fn k_big_file_one_poll() {
        let t = Tmp::new();
        let mut b = Vec::new();
        for _ in 0..3 {
            b.extend(json_line(10 * 1024 * 1024));
        }
        append(&log(&t), &b);
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 3);
    }

    #[test]
    fn l_oversize_valid_json_and_numeric_tail() {
        let t = Tmp::new();
        let mut b = json_line(MAX_LINE);
        b.extend(vec![b'1'; MAX_LINE + 5]);
        b.push(b'\n');
        b.extend(vec![b'1'; MAX_LINE / 2]);
        append(&log(&t), &b);
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 0);
        append(&log(&t), &vec![b'1'; MAX_LINE / 2 + 10]);
        assert_eq!(collect(&mut w).len(), 0);
        append(&log(&t), b"
{\"cwd\":\"ok\"}
");
        assert_eq!(collect(&mut w).len(), 1);
    }

    #[test]
    fn m_slim_drops_bulky_fields() {
        let t = Tmp::new();
        let mut b = br#"{"uuid":"u","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":["#.to_vec();
        for _ in 0..1_000_000 {
            b.extend_from_slice(b"0,");
        }
        b.extend_from_slice(br#"0]}]},"toolUseResult":{"x":[1,2,3]}}"#);
        b.push(b'\n');
        append(&log(&t), &b);
        let mut w = Watcher::new(t.0.clone());
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        let v = &r[0].1;
        assert!(v.get("toolUseResult").is_none());
        assert!(v["message"]["content"][0].get("content").is_none());
        assert_eq!(v["message"]["content"][0]["tool_use_id"], "t1");
        assert_eq!(v["uuid"], "u");
    }

    #[test]
    fn n_slim_odd_shapes_same_as_before() {
        use crate::sessions::Store;
        use serde_json::json;
        let odd = [
            json!([1, 2]), json!(5), json!("x"), json!(null),
            json!({"type":5,"message":{"content":[{"type":"tool_use","id":"q","name":"R"}]}}),
            json!({"type":{"a":1}}),
            json!({"message":"str"}),
            json!({"message":{"content":{"a":1}}}),
            json!({"message":{"content":["s", 1, null, [], {"type":7}]}}),
            json!({"message":{"content":[{"type":"tool_use","id":3,"name":4}]}}),
            json!({"timestamp":5,"cwd":6,"uuid":7,"zzz":1}),
            json!({"type":"zzz"}),
        ];
        let t = Tmp::new();
        let mut text = String::new();
        for v in &odd {
            text.push_str(&v.to_string());
            text.push('\n');
        }
        append(&log(&t), text.as_bytes());
        let mut w = Watcher::new(t.0.clone());
        let mut st = Store::default();
        w.poll(|s, v| {
            st.ingest_log(s, &v, 1);
        });
        let n: usize = st.all().iter().map(|s| s.events.len()).sum();
        assert_eq!(n, 1);
    }

    #[test]
    fn o_slim_keeps_agent_fields_through_ingest() {
        use crate::sessions::{NodeState, Store};
        let t = Tmp::new();
        let text = concat!(
            r#"{"timestamp":"2000-03-01T00:00:00Z","uuid":"u1","message":{"content":[{"type":"tool_use","id":"t1","name":"Agent","input":{"subagent_type":"orbit:x","description":"do it","prompt":"big"}}]}}"#, "\n",
            r#"{"timestamp":"2000-03-01T00:00:01Z","uuid":"u2","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"boom"}]}}"#, "\n",
            r#"{"timestamp":"2000-03-01T00:00:02Z","uuid":"u3","isSidechain":true,"message":{"content":[{"type":"tool_use","id":"t2","name":"Agent","input":{"subagent_type":"y"}}]}}"#, "\n",
        );
        append(&log(&t), text.as_bytes());
        let mut w = Watcher::new(t.0.clone());
        let mut st = Store::default();
        w.poll(|s, v| {
            st.ingest_log(s, &v, 1);
        });
        let ag = &st.get(U).unwrap().agents;
        assert_eq!(ag.len(), 1, "sidechain 줄은 노드를 만들지 않는다");
        assert_eq!(ag[0].kind.as_deref(), Some("orbit:x"));
        assert_eq!(ag[0].description.as_deref(), Some("do it"));
        assert_eq!(ag[0].state, NodeState::Failed);
    }

    #[test]
    fn p_duplicate_keys_pinned() {
        let t = Tmp::new();
        let text = concat!(
            r#"{"uuid":"a","uuid":"b"}"#, "\n",
            r#"{"uuid":"ok","message":{"content":[{"type":"tool_use","id":"a","id":"b"},{"type":"tool_use","id":"c"}]}}"#, "\n",
        );
        append(&log(&t), text.as_bytes());
        let mut w = Watcher::new(t.0.clone());
        let r = collect(&mut w);
        assert_eq!(r.len(), 1, "최상위 중복 키 줄은 버린다");
        let c = &r[0].1["message"]["content"];
        assert!(c[0].is_null(), "중복 키 블록은 Null");
        assert_eq!(c[1]["id"], "c");
    }
}
