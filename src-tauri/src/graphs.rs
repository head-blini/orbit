//! 설계 그래프 저장소: 앱 데이터 폴더 `graphs/<id>.json` 파일 하나당 그래프 하나.
//! 웹뷰는 경로를 보내지 않는다. id는 Rust가 만들고 이름은 봉투 안에만 둔다.
use serde_json::Value;
use std::fs::DirEntry;
use std::io::Read;
use std::path::Path;

pub const GRAPH_MAX_BYTES: usize = 24 * 1024 * 1024; // webview가 보낸 graph 원문
pub const FILE_MAX_BYTES: u64 = 25 * 1024 * 1024; // 디스크 봉투
pub const MAX_GRAPHS: usize = 100;
pub const FORMAT: u64 = 1;
pub const GRAPH_MAX_DEPTH: usize = 100; // graph 원문의 [·{ 중첩 깊이(그래프 객체 = 1). 봉투는 +1

pub const E_ID: &str = "잘못된 id입니다";
pub const E_NAME: &str = "이름이 올바르지 않습니다";
pub const E_BIG: &str = "너무 큽니다";
pub const E_GRAPH: &str = "그래프 형식이 올바르지 않습니다";
pub const E_UNREADABLE: &str = "읽을 수 없는 파일입니다";
pub const E_MISSING: &str = "파일이 없습니다";
pub const E_CAP: &str = "그래프는 100개까지입니다 — 저장하지 않았습니다";
pub const E_PERM: &str = "폴더에 쓸 권한이 없습니다";
pub const E_WRITE: &str = "디스크에 쓸 수 없습니다";
pub const E_DIR: &str = "폴더를 열 수 없습니다";
pub const E_DEEP: &str = "스키마 중첩이 너무 깊습니다";

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub name: Option<String>,
    pub saved_at: Option<u64>,
    pub readable: bool,
}

fn is_id(s: &str) -> bool {
    s.len() == 18 && s.starts_with("g-") && s[2..].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn check_name(s: &str) -> bool {
    let t = s.trim();
    !t.is_empty()
        && t.encode_utf16().count() <= 40
        && !s.chars().any(|c| c.is_control() || ('\u{202A}'..='\u{202E}').contains(&c) || ('\u{2066}'..='\u{2069}').contains(&c))
}

/// 의미 검사는 하지 않는다: 객체, version 1, nodes·edges 배열과 길이 상한만.
fn check_graph(v: &Value) -> bool {
    let Some(o) = v.as_object() else { return false };
    o.get("version").and_then(Value::as_u64) == Some(1)
        && o.get("nodes").and_then(Value::as_array).is_some_and(|a| a.len() <= 500)
        && o.get("edges").and_then(Value::as_array).is_some_and(|a| a.len() <= 2000)
}

/// `[`·`{` 중첩 깊이의 최댓값. 반복문 한 번, 문자열 안과 `\` 이스케이프는 건너뛴다. 깨진 JSON에도 숫자를 돌려준다.
fn json_depth(b: &[u8]) -> usize {
    let (mut depth, mut max, mut in_str, mut i) = (0usize, 0usize, false, 0usize);
    while i < b.len() {
        let c = b[i];
        if in_str {
            match c {
                b'\\' => i += 1,
                b'"' => in_str = false,
                _ => {}
            }
        } else {
            match c {
                b'"' => in_str = true,
                b'[' | b'{' => {
                    depth += 1;
                    max = max.max(depth);
                }
                b']' | b'}' => depth = depth.saturating_sub(1),
                _ => {}
            }
        }
        i += 1;
    }
    max
}

/// 이름이 `<id>.json`이고 링크가 아닌 일반 파일이면 그 id. list·count가 함께 쓴다.
fn candidate(e: &DirEntry) -> Option<String> {
    let name = e.file_name();
    let id = name.to_str()?.strip_suffix(".json")?;
    if !is_id(id) {
        return None;
    }
    let t = e.file_type().ok()?;
    (t.is_file() && !t.is_symlink()).then(|| id.to_string())
}

fn count(dir: &Path) -> Result<usize, String> {
    let rd = std::fs::read_dir(dir).map_err(|_| E_DIR.to_string())?;
    Ok(rd.flatten().filter(|e| candidate(e).is_some()).count())
}

fn hex8() -> Result<String, String> {
    let mut b = [0u8; 8];
    getrandom::fill(&mut b).map_err(|_| E_WRITE.to_string())?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

fn new_id() -> Result<String, String> {
    Ok(format!("g-{}", hex8()?))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn io_err(e: &std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::PermissionDenied { E_PERM } else { E_WRITE }.to_string()
}

fn path_of(dir: &Path, id: &str) -> std::path::PathBuf {
    dir.join(format!("{id}.json"))
}

/// 파일 하나를 안전하게 읽는다. 원문과 파싱한 봉투를 돌려준다.
fn read_file(dir: &Path, p: &Path) -> Result<(String, Value), String> {
    let unreadable = || E_UNREADABLE.to_string();
    let meta = match std::fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(E_MISSING.into()),
        Err(_) => return Err(unreadable()),
    };
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err(unreadable());
    }
    let inside = match (p.canonicalize(), dir.canonicalize()) {
        (Ok(f), Ok(d)) => f.parent() == Some(d.as_path()),
        _ => false,
    };
    if !inside {
        return Err(unreadable());
    }
    let f = std::fs::File::open(p).map_err(|_| unreadable())?;
    match f.metadata() {
        Ok(m) if m.is_file() => {
            if m.len() > FILE_MAX_BYTES {
                return Err(E_BIG.into());
            }
        }
        _ => return Err(unreadable()),
    }
    let mut buf = Vec::new();
    f.take(FILE_MAX_BYTES + 1).read_to_end(&mut buf).map_err(|_| unreadable())?;
    if buf.len() as u64 > FILE_MAX_BYTES {
        return Err(E_BIG.into());
    }
    let raw = String::from_utf8(buf).map_err(|_| unreadable())?;
    let v: Value = serde_json::from_str(&raw).map_err(|_| unreadable())?;
    let ok = v.as_object().is_some_and(|o| {
        o.get("format").and_then(Value::as_u64) == Some(FORMAT)
            && o.get("name").and_then(Value::as_str).is_some_and(check_name)
            && o.get("savedAt").and_then(Value::as_u64).is_some()
            && o.get("graph").is_some_and(check_graph)
    });
    if ok { Ok((raw, v)) } else { Err(unreadable()) }
}

/// 같은 폴더의 고유 임시 파일에 쓰고 sync → rename. 실패하면 임시 파일을 지우고 기존 파일은 그대로 둔다.
fn write_atomic(dir: &Path, target: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let fname = target.file_name().and_then(|n| n.to_str()).ok_or_else(|| E_WRITE.to_string())?;
    let tmp = dir.join(format!("{fname}.tmp-{}", hex8()?));
    let r = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp)
        .and_then(|mut f| f.write_all(bytes).and_then(|_| f.sync_all()))
        .and_then(|_| std::fs::rename(&tmp, target));
    r.map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        io_err(&e)
    })
}

pub fn list(dir: &Path) -> Result<Vec<Entry>, String> {
    let rd = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(_) => return Err(E_DIR.into()),
    };
    let mut ok = Vec::new();
    let mut bad = Vec::new();
    for e in rd.flatten() {
        let Some(id) = candidate(&e) else { continue };
        match read_file(dir, &path_of(dir, &id)) {
            Ok((_, v)) => {
                let name = v["name"].as_str().map(str::to_string);
                ok.push(Entry { id, name, saved_at: v["savedAt"].as_u64(), readable: true });
            }
            Err(_) => bad.push(Entry { id, name: None, saved_at: None, readable: false }),
        }
    }
    ok.sort_by(|a, b| b.saved_at.cmp(&a.saved_at).then_with(|| a.id.cmp(&b.id)));
    bad.sort_by(|a, b| a.id.cmp(&b.id));
    ok.extend(bad);
    Ok(ok)
}

pub fn load(dir: &Path, id: &str) -> Result<String, String> {
    if !is_id(id) {
        return Err(E_ID.into());
    }
    read_file(dir, &path_of(dir, id)).map(|(raw, _)| raw)
}

pub fn save(dir: &Path, id: Option<&str>, name: &str, graph: &str) -> Result<Entry, String> {
    if id.is_some_and(|i| !is_id(i)) {
        return Err(E_ID.into());
    }
    if !check_name(name) {
        return Err(E_NAME.into());
    }
    if graph.len() > GRAPH_MAX_BYTES {
        return Err(E_BIG.into());
    }
    if json_depth(graph.as_bytes()) > GRAPH_MAX_DEPTH {
        return Err(E_DEEP.into());
    }
    let value: Value = serde_json::from_str(graph).map_err(|_| E_GRAPH.to_string())?;
    if !check_graph(&value) {
        return Err(E_GRAPH.into());
    }
    std::fs::create_dir_all(dir).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied { E_PERM } else { E_DIR }.to_string()
    })?;
    let existing = match id {
        Some(i) => match std::fs::symlink_metadata(path_of(dir, i)) {
            Ok(_) => {
                read_file(dir, &path_of(dir, i))?;
                true
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
            Err(_) => return Err(E_UNREADABLE.into()),
        },
        None => false,
    };
    if !existing && count(dir)? >= MAX_GRAPHS {
        return Err(E_CAP.into());
    }
    let id = match id {
        Some(i) => i.to_string(),
        None => {
            let mut found = None;
            for _ in 0..8 {
                let c = new_id()?;
                if std::fs::symlink_metadata(path_of(dir, &c)).is_err() {
                    found = Some(c);
                    break;
                }
            }
            found.ok_or_else(|| E_WRITE.to_string())?
        }
    };
    let saved_at = now_ms();
    let bytes = serde_json::to_vec(&serde_json::json!({
        "format": FORMAT, "id": id, "name": name, "savedAt": saved_at, "graph": value
    }))
    .map_err(|_| E_WRITE.to_string())?;
    if bytes.len() as u64 > FILE_MAX_BYTES {
        return Err(E_BIG.into());
    }
    write_atomic(dir, &path_of(dir, &id), &bytes)?;
    Ok(Entry { id, name: Some(name.to_string()), saved_at: Some(saved_at), readable: true })
}

pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    if !is_id(id) {
        return Err(E_ID.into());
    }
    let p = path_of(dir, id);
    read_file(dir, &p)?;
    std::fs::remove_file(&p).map_err(|e| io_err(&e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    static N: AtomicU32 = AtomicU32::new(0);

    fn tmp() -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir()
            .join(format!("orbit-graphs-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&root);
        let dir = root.join("graphs");
        std::fs::create_dir_all(&dir).unwrap();
        (root, dir)
    }

    fn g(nodes: usize, edges: usize) -> String {
        let n = vec!["{}"; nodes].join(",");
        let e = vec!["{}"; edges].join(",");
        format!("{{\"version\":1,\"nodes\":[{n}],\"edges\":[{e}]}}")
    }

    fn env(name: &str, graph_json: &str) -> Vec<u8> {
        let v: Value = serde_json::from_str(graph_json).unwrap();
        serde_json::to_vec(&serde_json::json!({"format":1,"id":"g-0000000000000000","name":name,"savedAt":1u64,"graph":v}))
            .unwrap()
    }

    fn put(dir: &Path, id: &str, bytes: &[u8]) {
        std::fs::write(dir.join(format!("{id}.json")), bytes).unwrap();
    }

    fn idn(n: u64) -> String {
        format!("g-{n:016x}")
    }

    fn snapshot(dir: &Path) -> BTreeMap<String, Vec<u8>> {
        std::fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| (e.file_name().to_string_lossy().into_owned(), std::fs::read(e.path()).unwrap_or_default()))
            .collect()
    }

    fn count_entries(dir: &Path) -> usize {
        std::fs::read_dir(dir).unwrap().count()
    }

    fn padded(n: usize) -> String {
        format!("{{\"version\":1,\"nodes\":[],\"edges\":[],\"pad\":\"{}\"}}", "x".repeat(n))
    }

    fn deep(k: usize) -> String {
        format!("{{\"version\":1,\"nodes\":[],\"edges\":[],\"pad\":{}{}}}", "[".repeat(k), "]".repeat(k))
    }

    fn is_graph_file_name(s: &str) -> bool {
        s.len() == 23
            && s.starts_with("g-")
            && s.ends_with(".json")
            && s[2..18].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    }

    #[test]
    fn generated_ids_have_format() {
        let mut seen = std::collections::BTreeSet::new();
        for _ in 0..200 {
            let id = new_id().unwrap();
            assert!(is_id(&id), "{id}");
            // designGraph.ts ID_RE: [a-z0-9]+(-[a-z0-9]+)*, 64자 이하
            assert!(id.len() <= 64);
            assert!(id.split('-').all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())));
            assert!(seen.insert(id));
        }
        assert!(is_id("g-0123456789abcdef"));
        let long = "a".repeat(64);
        let longer = "a".repeat(65);
        for bad in [
            "", "A", "../x", "a/b", "g-0123456789ABCDEF", "g-0123456789abcde", "g-0123456789abcdef0",
            long.as_str(), longer.as_str(), "g-0123456789abcde/",
        ] {
            assert!(!is_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn save_list_load_roundtrip() {
        let (root, dir) = tmp();
        let e = save(&dir, None, "기능 구현 → 리뷰 → 검증", &g(3, 2)).unwrap();
        assert!(is_id(&e.id));
        assert!(e.readable);
        let l = list(&dir).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].name.as_deref(), Some("기능 구현 → 리뷰 → 검증"));
        let raw = load(&dir, &e.id).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["format"], 1);
        assert_eq!(v["graph"], serde_json::from_str::<Value>(&g(3, 2)).unwrap());
        std::thread::sleep(std::time::Duration::from_millis(5));
        let e2 = save(&dir, None, "둘째", &g(1, 0)).unwrap();
        let l = list(&dir).unwrap();
        assert_eq!(l.len(), 2);
        assert_eq!(l[0].id, e2.id);
        assert!(l[0].saved_at >= l[1].saved_at);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn names_never_reach_file_names() {
        let (root, dir) = tmp();
        let names = ["../../x", "a/b", "CON", "<img src=x onerror=alert(1)>"];
        for n in names {
            save(&dir, None, n, &g(1, 0)).unwrap();
        }
        let snap = snapshot(&dir);
        assert_eq!(snap.len(), 4);
        assert!(snap.keys().all(|k| is_graph_file_name(k)), "{:?}", snap.keys());
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
        let got: Vec<String> = list(&dir).unwrap().into_iter().filter_map(|e| e.name).collect();
        for n in names {
            assert!(got.iter().any(|x| x == n), "{n}");
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn resave_same_id_replaces_and_leaves_no_tmp() {
        let (root, dir) = tmp();
        let e = save(&dir, None, "처음", &g(3, 0)).unwrap();
        let e2 = save(&dir, Some(&e.id), "나중", &g(1, 0)).unwrap();
        assert_eq!(e2.id, e.id);
        let v: Value = serde_json::from_str(&load(&dir, &e.id).unwrap()).unwrap();
        assert_eq!(v["name"], "나중");
        assert_eq!(v["graph"], serde_json::from_str::<Value>(&g(1, 0)).unwrap());
        let snap = snapshot(&dir);
        assert_eq!(snap.keys().collect::<Vec<_>>(), vec![&format!("{}.json", e.id)]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn bad_ids_rejected_without_touching_fs() {
        let (root, dir) = tmp();
        let ok = save(&dir, None, "n", &g(1, 0)).unwrap();
        assert!(load(&dir, &ok.id).is_ok());
        let outside = root.join("x.json");
        std::fs::write(&outside, b"keep").unwrap();
        let long = "a".repeat(64);
        let longer = "a".repeat(65);
        let bads = [
            "", "A", "../x", "a/b", "g-0123456789ABCDEF", "g-0123456789abcde", "g-0123456789abcdef0",
            long.as_str(), longer.as_str(), "g-0123456789abcde/", "../x", "..",
        ];
        let before = snapshot(&dir);
        for b in bads {
            assert_eq!(load(&dir, b), Err(E_ID.to_string()), "{b:?}");
            assert_eq!(delete(&dir, b), Err(E_ID.to_string()), "{b:?}");
            assert_eq!(save(&dir, Some(b), "n", &g(1, 0)).map(|_| ()), Err(E_ID.to_string()), "{b:?}");
        }
        assert_eq!(snapshot(&dir), before);
        assert_eq!(std::fs::read(&outside).unwrap(), b"keep");
        assert!(delete(&dir, &ok.id).is_ok());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn graph_size_cap_boundary() {
        let (root, dir) = tmp();
        let at = padded(GRAPH_MAX_BYTES - padded(0).len());
        assert_eq!(at.len(), GRAPH_MAX_BYTES);
        let e = save(&dir, None, "경계", &at).unwrap();
        assert!(load(&dir, &e.id).is_ok());
        let n = count_entries(&dir);
        let over = padded(GRAPH_MAX_BYTES - padded(0).len() + 1);
        assert_eq!(over.len(), GRAPH_MAX_BYTES + 1);
        assert_eq!(save(&dir, None, "초과", &over).map(|_| ()), Err(E_BIG.to_string()));
        assert_eq!(count_entries(&dir), n);
        // 재직렬화로 커지는 경우
        let grown = serde_json::to_string(&serde_json::from_str::<Value>("1e5").unwrap()).unwrap();
        if grown.len() > 3 {
            let items = (GRAPH_MAX_BYTES - padded(0).len() - 2) / 4;
            let raw = format!(
                "{{\"version\":1,\"nodes\":[],\"edges\":[],\"pad\":[{}1e5]}}",
                "1e5,".repeat(items)
            );
            assert!(raw.len() <= GRAPH_MAX_BYTES);
            assert_eq!(save(&dir, None, "커짐", &raw).map(|_| ()), Err(E_BIG.to_string()));
            assert_eq!(count_entries(&dir), n);
        } else {
            eprintln!("건너뜀: 숫자 재직렬화가 커지지 않음");
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn oversized_file_is_unreadable() {
        let (root, dir) = tmp();
        let base = env("큰", &padded(0)).len();
        let at = env("큰", &padded(FILE_MAX_BYTES as usize - base));
        assert_eq!(at.len() as u64, FILE_MAX_BYTES);
        let id = idn(1);
        put(&dir, &id, &at);
        let l = list(&dir).unwrap();
        assert_eq!(l.len(), 1);
        assert!(l[0].readable);
        assert!(load(&dir, &id).is_ok());
        let id2 = idn(2);
        let mut over = at.clone();
        over.push(b' ');
        put(&dir, &id2, &over);
        assert_eq!(load(&dir, &id2), Err(E_BIG.to_string()));
        let l = list(&dir).unwrap();
        let bad = l.iter().find(|e| e.id == id2).unwrap();
        assert!(!bad.readable);
        assert_eq!(bad.name, None);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn save_rejects_bad_graph() {
        let (root, dir) = tmp();
        assert!(save(&dir, None, "n", &g(1, 0)).is_ok());
        let n = count_entries(&dir);
        let bads = [
            "{".to_string(),
            "[]".to_string(),
            "\"s\"".to_string(),
            "null".to_string(),
            r#"{"version":2,"nodes":[],"edges":[]}"#.to_string(),
            r#"{"version":"1","nodes":[],"edges":[]}"#.to_string(),
            r#"{"version":1.5,"nodes":[],"edges":[]}"#.to_string(),
            r#"{"version":1,"nodes":{},"edges":[]}"#.to_string(),
            r#"{"version":1,"nodes":[],"edges":"x"}"#.to_string(),
            r#"{"nodes":[],"edges":[]}"#.to_string(),
            r#"{"version":1,"edges":[]}"#.to_string(),
            g(501, 0),
            g(1, 2001),
        ];
        for b in &bads {
            assert_eq!(save(&dir, None, "n", b).map(|_| ()), Err(E_GRAPH.to_string()), "{b:.60}");
            assert_eq!(count_entries(&dir), n);
        }
        assert!(save(&dir, None, "n", &g(500, 0)).is_ok());
        assert!(save(&dir, None, "n", &g(1, 2000)).is_ok());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn save_rejects_bad_name() {
        let (root, dir) = tmp();
        assert!(save(&dir, None, &"가".repeat(40), &g(1, 0)).is_ok());
        assert!(save(&dir, None, &"😀".repeat(20), &g(1, 0)).is_ok());
        let n = count_entries(&dir);
        let bads = [
            "".to_string(),
            "   ".to_string(),
            "가".repeat(41),
            "😀".repeat(21),
            "a\u{202E}b".to_string(),
            "\u{2066}a".to_string(),
            "a\u{7}".to_string(),
            "a\u{9F}".to_string(),
            "a\n".to_string(),
        ];
        for b in &bads {
            assert_eq!(save(&dir, None, b, &g(1, 0)).map(|_| ()), Err(E_NAME.to_string()), "{b:?}");
        }
        assert_eq!(count_entries(&dir), n);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn broken_and_future_files_listed_unreadable() {
        let (root, dir) = tmp();
        let good = idn(1);
        put(&dir, &good, &env("정상", &g(1, 0)));
        let broken = idn(2);
        put(&dir, &broken, b"{not json");
        let fmt2 = idn(3);
        let mut v: Value = serde_json::from_slice(&env("미래", &g(1, 0))).unwrap();
        v["format"] = 2.into();
        put(&dir, &fmt2, &serde_json::to_vec(&v).unwrap());
        let gv2 = idn(4);
        put(&dir, &gv2, &env("그래프v2", r#"{"version":2,"nodes":[],"edges":[]}"#));
        let noname = idn(5);
        put(&dir, &noname, &env("", &g(1, 0)));
        let l = list(&dir).unwrap();
        assert_eq!(l.len(), 5);
        assert_eq!(l.iter().filter(|e| e.readable).count(), 1);
        assert_eq!(l[0].id, good);
        let before = snapshot(&dir);
        assert!(load(&dir, &good).is_ok());
        for id in [&broken, &fmt2, &gv2, &noname] {
            assert_eq!(load(&dir, id), Err(E_UNREADABLE.to_string()));
            assert_eq!(save(&dir, Some(id), "새", &g(1, 0)).map(|_| ()), Err(E_UNREADABLE.to_string()));
            assert_eq!(delete(&dir, id), Err(E_UNREADABLE.to_string()));
        }
        assert_eq!(snapshot(&dir), before);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn symlink_entries_excluded() {
        let (root, dir) = tmp();
        let out = root.join("out.json");
        std::fs::write(&out, env("밖", &g(1, 0))).unwrap();
        let id = idn(1);
        let link = dir.join(format!("{id}.json"));
        #[cfg(unix)]
        let made = std::os::unix::fs::symlink(&out, &link);
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_file(&out, &link);
        if let Err(e) = made {
            eprintln!("symlink_entries_excluded: 링크를 만들 수 없어 건너뜀: {e}");
            let _ = std::fs::remove_dir_all(&root);
            return;
        }
        let out_before = std::fs::read(&out).unwrap();
        assert!(list(&dir).unwrap().is_empty());
        assert_eq!(load(&dir, &id), Err(E_UNREADABLE.to_string()));
        assert_eq!(delete(&dir, &id), Err(E_UNREADABLE.to_string()));
        assert_eq!(save(&dir, Some(&id), "n", &g(1, 0)).map(|_| ()), Err(E_UNREADABLE.to_string()));
        assert!(std::fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        // 폴더 안의 정상 파일을 가리키는 링크도 거부한다(범위 검사만으로는 못 거른다)
        let real = idn(2);
        put(&dir, &real, &env("안", &g(1, 0)));
        let id3 = idn(3);
        #[cfg(unix)]
        std::os::unix::fs::symlink(dir.join(format!("{real}.json")), dir.join(format!("{id3}.json"))).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(dir.join(format!("{real}.json")), dir.join(format!("{id3}.json"))).unwrap();
        assert!(load(&dir, &real).is_ok());
        assert_eq!(load(&dir, &id3), Err(E_UNREADABLE.to_string()));
        assert_eq!(list(&dir).unwrap().len(), 1);
        assert_eq!(std::fs::read(&out).unwrap(), out_before);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn count_cap_blocks_new_allows_overwrite() {
        let (root, dir) = tmp();
        for i in 0..99 {
            put(&dir, &idn(i + 1), &env("n", &g(1, 0)));
        }
        let last = save(&dir, None, "백", &g(1, 0)).unwrap();
        assert_eq!(count_entries(&dir), 100);
        assert_eq!(save(&dir, None, "백하나", &g(1, 0)).map(|_| ()), Err(E_CAP.to_string()));
        assert_eq!(count_entries(&dir), 100);
        assert_eq!(save(&dir, Some(&idn(0xabc)), "없음", &g(1, 0)).map(|_| ()), Err(E_CAP.to_string()));
        assert!(save(&dir, Some(&last.id), "덮어쓰기", &g(1, 0)).is_ok());
        assert_eq!(count_entries(&dir), 100);
        // 읽을 수 없는 파일도 센다
        let (root2, dir2) = tmp();
        for i in 0..99 {
            put(&dir2, &idn(i + 1), &env("n", &g(1, 0)));
        }
        put(&dir2, &idn(1000), b"broken");
        assert_eq!(save(&dir2, None, "n", &g(1, 0)).map(|_| ()), Err(E_CAP.to_string()));
        // 후보가 아닌 것은 세지 않는다
        let (root3, dir3) = tmp();
        for i in 0..98 {
            put(&dir3, &idn(i + 1), &env("n", &g(1, 0)));
        }
        std::fs::write(dir3.join("notes.json"), b"{}").unwrap();
        std::fs::write(dir3.join("x.tmp-1"), b"x").unwrap();
        std::fs::create_dir(dir3.join("sub")).unwrap();
        assert!(save(&dir3, None, "n", &g(1, 0)).is_ok());
        for r in [root, root2, root3] {
            let _ = std::fs::remove_dir_all(&r);
        }
    }

    #[cfg(unix)]
    #[test]
    fn readonly_dir_keeps_original() {
        use std::os::unix::fs::PermissionsExt;
        let (root, dir) = tmp();
        let e = save(&dir, None, "원본", &g(1, 0)).unwrap();
        let before = snapshot(&dir);
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
        let probe = dir.join("probe");
        if std::fs::write(&probe, b"x").is_ok() {
            let _ = std::fs::remove_file(&probe);
            eprintln!("readonly_dir_keeps_original: 쓰기가 막히지 않아 건너뜀(root 권한)");
        } else {
            assert_eq!(save(&dir, Some(&e.id), "새", &g(2, 0)).map(|_| ()), Err(E_PERM.to_string()));
            assert_eq!(snapshot(&dir), before);
            assert!(snapshot(&dir).keys().all(|k| !k.contains(".tmp-")));
        }
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn write_atomic_failure_cleans_tmp() {
        let (root, dir) = tmp();
        let ok = dir.join("ok.json");
        assert!(write_atomic(&dir, &ok, b"y").is_ok());
        assert_eq!(std::fs::read(&ok).unwrap(), b"y");
        std::fs::remove_file(&ok).unwrap();
        let target = dir.join(format!("{}.json", idn(1)));
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("inner"), b"keep").unwrap();
        assert!(write_atomic(&dir, &target, b"x").is_err());
        assert_eq!(count_entries(&dir), 1);
        assert_eq!(std::fs::read(target.join("inner")).unwrap(), b"keep");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn deep_nesting_rejected_without_panic() {
        let (root, dir) = tmp();
        assert!(save(&dir, None, "기준", &g(1, 0)).is_ok());
        let n = count_entries(&dir);
        assert_eq!(json_depth(deep(99).as_bytes()), 100);
        let e = save(&dir, None, "깊이100", &deep(99)).unwrap();
        let raw = load(&dir, &e.id).unwrap();
        assert!(serde_json::from_str::<Value>(&raw).is_ok());
        assert_eq!(count_entries(&dir), n + 1);
        for k in [100, 1_000, 100_000] {
            assert_eq!(save(&dir, None, "깊음", &deep(k)).map(|_| ()), Err(E_DEEP.to_string()), "k={k}");
            assert_eq!(count_entries(&dir), n + 1);
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn missing_dir_lists_empty_and_ignores_strangers() {
        let (root, _) = tmp();
        let dir = root.join("nope");
        assert_eq!(list(&dir), Ok(vec![]));
        let e = save(&dir, None, "n", &g(1, 0)).unwrap();
        assert!(dir.is_dir());
        std::fs::write(dir.join("notes.json"), env("n", &g(1, 0))).unwrap();
        std::fs::write(dir.join("G-0123456789abcdef.json"), env("n", &g(1, 0))).unwrap();
        std::fs::write(dir.join("g-0123456789abcdef.json.tmp-0123456789abcdef"), b"x").unwrap();
        std::fs::write(dir.join("g-0123456789abcdef.txt"), b"x").unwrap();
        std::fs::create_dir(dir.join("g-0123456789abcdee.json")).unwrap();
        let l = list(&dir).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].id, e.id);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn json_depth_ignores_strings() {
        assert_eq!(json_depth(br#"{"a":"]\"[[[["}"#), 1);
        assert_eq!(json_depth(br#"[{"s":"\\"},[]]"#), 2);
        assert_eq!(json_depth(b""), 0);
        assert_eq!(json_depth(b"]]]"), 0);
        let (root, dir) = tmp();
        let raw = format!("{{\"version\":1,\"nodes\":[],\"edges\":[],\"pad\":\"{}\"}}", "[".repeat(1000));
        assert!(save(&dir, None, "문자열", &raw).is_ok());
        let _ = std::fs::remove_dir_all(&root);
    }
}
