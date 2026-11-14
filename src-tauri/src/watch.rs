//! 세션 로그 디렉터리 감시.

use serde_json::Value;
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
            if let Ok(v) = serde_json::from_slice::<Value>(line) {
                on_line(sid, v);
            }
        }
        tail.skipping = false;
        tail.offset = tail.offset.saturating_add(i as u64 + 1);
        rest = after.get(1..).unwrap_or_default();
    }
    true
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
        append(&log(&t), b"{\"a\":1}\n");
        let mut w = Watcher::new(t.0.clone());
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].0, U);
        assert_eq!(r[0].1["a"], 1);
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
        append(&log(&t), b"{oops\n{\"ok\":true}\n");
        let mut w = Watcher::new(t.0.clone());
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].1["ok"], true);
    }

    #[test]
    fn d_oversize_line() {
        let t = Tmp::new();
        let mut b = vec![b'x'; MAX_LINE + 1];
        b.extend_from_slice(b"\n{\"ok\":true}\n");
        append(&log(&t), &b);
        let mut w = Watcher::new(t.0.clone());
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].1["ok"], true);
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
        append(&p, b"\n{\"ok\":true}\n");
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].1["ok"], true);
    }

    #[test]
    fn f_truncated_rewrite() {
        let t = Tmp::new();
        let p = log(&t);
        append(&p, b"{\"n\":1}\n{\"n\":2}\n");
        let mut w = Watcher::new(t.0.clone());
        assert_eq!(collect(&mut w).len(), 2);
        fs::write(&p, b"{\"n\":3}\n").unwrap();
        let r = collect(&mut w);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].1["n"], 3);
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
{\"ok\":true}
");
        assert_eq!(collect(&mut w).len(), 1);
    }
}
