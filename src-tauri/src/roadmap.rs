use std::io::Read;
use std::path::Path;

pub const FILE: &str = "ROADMAP.md";
pub const MAX_BYTES: u64 = 256 * 1024;
pub const MAX_ENTRIES: usize = 500;
pub const MAX_LINE: usize = 2000; // 바이트

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Mark {
    Heading,
    Done,
    Todo,
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Line {
    pub mark: Mark,
    pub text: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Roadmap {
    Missing,
    TooBig { max_bytes: u64, max_entries: usize },
    Error { reason: String },
    Found { lines: Vec<Line>, skipped: bool },
}

fn too_big() -> Roadmap {
    Roadmap::TooBig { max_bytes: MAX_BYTES, max_entries: MAX_ENTRIES }
}

fn err(reason: &str) -> Roadmap {
    Roadmap::Error { reason: reason.to_string() }
}

/// 한 줄(앞 공백 제거 후)을 묶음 제목·항목으로 읽는다. 그 밖의 줄은 None.
fn classify(s: &str) -> Option<Line> {
    let s = s.trim_start();
    let (mark, rest) = if let Some(r) = s.strip_prefix("## ") {
        (Mark::Heading, r)
    } else if let Some(r) = s.strip_prefix("- [ ] ") {
        (Mark::Todo, r)
    } else if let Some(r) = s.strip_prefix("- [x] ").or_else(|| s.strip_prefix("- [X] ")) {
        (Mark::Done, r)
    } else {
        return None;
    };
    let text = rest.trim();
    (!text.is_empty()).then(|| Line { mark, text: text.to_string() })
}

pub fn parse(bytes: &[u8]) -> Roadmap {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    let mut lines = Vec::new();
    let mut skipped = false;
    for raw in bytes.split(|&b| b == b'\n') {
        let raw = raw.strip_suffix(b"\r").unwrap_or(raw);
        if raw.len() > MAX_LINE {
            skipped = true;
            continue;
        }
        let Ok(s) = std::str::from_utf8(raw) else {
            skipped = true;
            continue;
        };
        if let Some(l) = classify(s) {
            if lines.len() >= MAX_ENTRIES {
                return too_big();
            }
            lines.push(l);
        }
    }
    Roadmap::Found { lines, skipped }
}

/// dir/ROADMAP.md 하나를 읽는다. 링크·정션·폴더·범위 밖은 Error, 없으면 Missing.
pub fn read(dir: &Path) -> Roadmap {
    let file = dir.join(FILE);
    let meta = match std::fs::symlink_metadata(&file) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Roadmap::Missing,
        Err(e) => return err(&e.kind().to_string()),
    };
    if meta.file_type().is_symlink() {
        return err("링크·정션은 읽지 않습니다");
    }
    if !meta.is_file() {
        return err("일반 파일이 아닙니다");
    }
    let inside = match (file.canonicalize(), dir.canonicalize()) {
        (Ok(f), Ok(d)) => f.parent() == Some(d.as_path()),
        _ => false,
    };
    if !inside {
        return err("폴더 밖의 파일입니다");
    }
    let f = match std::fs::File::open(&file) {
        Ok(f) => f,
        Err(e) => return err(&e.kind().to_string()),
    };
    match f.metadata() {
        Ok(m) if m.is_file() => {
            if m.len() > MAX_BYTES {
                return too_big();
            }
        }
        Ok(_) => return err("일반 파일이 아닙니다"),
        Err(e) => return err(&e.kind().to_string()),
    }
    let mut buf = Vec::new();
    if let Err(e) = f.take(MAX_BYTES + 1).read_to_end(&mut buf) {
        return err(&e.kind().to_string());
    }
    if buf.len() as u64 > MAX_BYTES {
        return too_big();
    }
    parse(&buf)
}

/// cwd는 신뢰할 수 없는 문자열이다. 어떤 파일 시스템 호출보다 먼저 모양을 검사한다.
pub fn for_cwd(cwd: Option<&str>) -> Roadmap {
    let Some(cwd) = cwd.filter(|c| !c.is_empty()) else {
        return Roadmap::Missing;
    };
    let p = Path::new(cwd);
    // Windows: 드라이브 문자 절대 경로만. UNC·장치·verbatim 경로는 SMB 접속(해시 유출)을 부른다.
    #[cfg(windows)]
    let ok = matches!(
        p.components().next(),
        Some(std::path::Component::Prefix(x)) if matches!(x.kind(), std::path::Prefix::Disk(_))
    ) && p.is_absolute();
    #[cfg(not(windows))]
    let ok = p.is_absolute();
    if !ok {
        return err("로컬 절대 경로가 아닙니다");
    }
    read(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    static N: AtomicU32 = AtomicU32::new(0);

    fn tmp() -> PathBuf {
        let root = std::env::temp_dir()
            .join(format!("orbit-roadmap-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        std::fs::create_dir_all(root.join("proj")).unwrap();
        root
    }

    fn l(mark: Mark, text: &str) -> Line {
        Line { mark, text: text.to_string() }
    }

    fn found(r: Roadmap) -> (Vec<Line>, bool) {
        match r {
            Roadmap::Found { lines, skipped } => (lines, skipped),
            other => panic!("Found가 아님: {:?}", other),
        }
    }

    fn long_item() -> String {
        format!("- [ ] {}", "긴".repeat(120))
    }

    fn sample() -> String {
        format!(
            "## 1단계: 관찰\n- [x] 로그 읽기\n- [x] 훅 받기\n## 2단계: 화면\n- [ ] 그래프\n- [ ] 액정\n{}\n",
            long_item()
        )
    }

    #[test]
    fn parse_sample_crlf_bom() {
        let want = vec![
            l(Mark::Heading, "1단계: 관찰"),
            l(Mark::Done, "로그 읽기"),
            l(Mark::Done, "훅 받기"),
            l(Mark::Heading, "2단계: 화면"),
            l(Mark::Todo, "그래프"),
            l(Mark::Todo, "액정"),
            l(Mark::Todo, &"긴".repeat(120)),
        ];
        assert_eq!(found(parse(sample().as_bytes())), (want, false));
        let crlf = sample().replace('\n', "\r\n");
        let (a, _) = found(parse(crlf.as_bytes()));
        let (b, _) = found(parse(sample().as_bytes()));
        assert_eq!(a, b);
        let mut bom = b"\xEF\xBB\xBF".to_vec();
        bom.extend_from_slice(sample().as_bytes());
        assert_eq!(found(parse(&bom)).0, b);
    }

    #[test]
    fn parse_recognizes_and_ignores() {
        let src = "- [ ] early\n- [X] big\n  - [ ] indented\n# h1\n### h3\n* [ ] star\n-[ ] tight\n1. num\nbody\n- [ ]  \n##\n## 묶음\n";
        let want = vec![
            l(Mark::Todo, "early"),
            l(Mark::Done, "big"),
            l(Mark::Todo, "indented"),
            l(Mark::Heading, "묶음"),
        ];
        assert_eq!(found(parse(src.as_bytes())), (want, false));
    }

    #[test]
    fn parse_bad_utf8_line_is_skipped() {
        let mut b = b"- [ ] a\n".to_vec();
        b.extend_from_slice(b"- [ ] \xff\xfe\n");
        b.extend_from_slice(b"- [x] c\n");
        let (lines, skipped) = found(parse(&b));
        assert_eq!(lines, vec![l(Mark::Todo, "a"), l(Mark::Done, "c")]);
        assert!(skipped);
        assert_eq!(found(parse(b"\xff\xfe\n\xff\n")), (vec![], true));
        assert_eq!(found(parse(b"")), (vec![], false));
    }

    #[test]
    fn parse_entry_limit() {
        let ok = "- [ ] x\n".repeat(MAX_ENTRIES);
        assert_eq!(found(parse(ok.as_bytes())).0.len(), MAX_ENTRIES);
        let over = "- [ ] x\n".repeat(MAX_ENTRIES + 1);
        assert_eq!(parse(over.as_bytes()), Roadmap::TooBig { max_bytes: MAX_BYTES, max_entries: MAX_ENTRIES });
    }

    #[test]
    fn parse_long_line_is_skipped() {
        let src = format!("- [ ] a\n- [ ] {}\n- [ ] b\n", "x".repeat(MAX_LINE + 1 - 6));
        assert_eq!(src.lines().nth(1).unwrap().len(), MAX_LINE + 1);
        let (lines, skipped) = found(parse(src.as_bytes()));
        assert_eq!(lines, vec![l(Mark::Todo, "a"), l(Mark::Todo, "b")]);
        assert!(skipped);
    }

    #[test]
    fn parse_keeps_html_verbatim() {
        let src = "- [ ] <b>x</b>\n- [ ] <img src=x onerror=alert(1)>\n";
        let (lines, _) = found(parse(src.as_bytes()));
        assert_eq!(lines[0].text, "<b>x</b>");
        assert_eq!(lines[1].text, "<img src=x onerror=alert(1)>");
    }

    #[test]
    fn read_missing_file_and_dir() {
        let root = tmp();
        assert_eq!(read(&root.join("proj")), Roadmap::Missing);
        assert_eq!(read(&root.join("nope")), Roadmap::Missing);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn read_size_limit() {
        let root = tmp();
        let dir = root.join("proj");
        std::fs::write(dir.join(FILE), vec![b'a'; 300 * 1024]).unwrap();
        assert_eq!(read(&dir), Roadmap::TooBig { max_bytes: MAX_BYTES, max_entries: MAX_ENTRIES });
        // 정확히 MAX_BYTES: 1024바이트 줄 256개(마지막은 항목)
        let mut s = format!("{}\n", "a".repeat(1023)).repeat(255);
        s.push_str(&format!("- [x] {}\n", "a".repeat(1017)));
        assert_eq!(s.len() as u64, MAX_BYTES);
        std::fs::write(dir.join(FILE), s).unwrap();
        assert_eq!(found(read(&dir)).0.len(), 1);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn read_rejects_folder_and_links() {
        let root = tmp();
        let dir = root.join("proj");
        std::fs::create_dir_all(dir.join(FILE)).unwrap();
        assert!(matches!(read(&dir), Roadmap::Error { .. }));
        std::fs::remove_dir_all(dir.join(FILE)).unwrap();

        std::fs::write(root.join("out.md"), "- [ ] x\n").unwrap();
        #[cfg(windows)]
        let r = std::os::windows::fs::symlink_file(root.join("out.md"), dir.join(FILE));
        #[cfg(unix)]
        let r = std::os::unix::fs::symlink(root.join("out.md"), dir.join(FILE));
        // 권한이 없어 링크를 못 만들면(Windows 일반 사용자) 이 단언은 건너뛴다.
        if r.is_ok() {
            assert!(matches!(read(&dir), Roadmap::Error { .. }));
            let _ = std::fs::remove_file(dir.join(FILE));
        } else {
            eprintln!("read_rejects_folder_and_links: 심볼릭 링크를 만들 수 없어 단언을 건너뜀: {:?}", r);
        }

        #[cfg(windows)]
        {
            let out = std::fs::create_dir_all(root.join("outdir")).and_then(|_| {
                std::process::Command::new("cmd")
                    .args(["/C", "mklink", "/J"])
                    .arg(dir.join(FILE))
                    .arg(root.join("outdir"))
                    .output()
            });
            if out.as_ref().map(|o| o.status.success()).unwrap_or(false) {
                eprintln!("junction: 만들어짐, 단언 실행");
                assert!(matches!(read(&dir), Roadmap::Error { .. }));
                let _ = std::fs::remove_dir(dir.join(FILE));
            } else {
                eprintln!("read_rejects_folder_and_links: 정션을 만들 수 없어 단언을 건너뜀: {:?}", out);
            }
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn for_cwd_shapes() {
        assert_eq!(for_cwd(None), Roadmap::Missing);
        assert_eq!(for_cwd(Some("")), Roadmap::Missing);
        assert!(matches!(for_cwd(Some("rel\\dir")), Roadmap::Error { .. }));
        assert!(matches!(for_cwd(Some("rel/dir")), Roadmap::Error { .. }));
        #[cfg(windows)]
        for bad in [r"\\server\share\p", r"\\?\C:\x", r"\\.\C:\x", r"\\?\UNC\s\x", "C:rel", r"\rooted"] {
            assert!(matches!(for_cwd(Some(bad)), Roadmap::Error { .. }), "{bad}");
        }
        let root = tmp();
        let dir = root.join("proj");
        std::fs::write(dir.join(FILE), "## g\n- [ ] x\n").unwrap();
        assert_eq!(found(for_cwd(dir.to_str())).0.len(), 2);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn serializes_as_tagged_json() {
        assert_eq!(serde_json::to_value(Roadmap::Missing).unwrap(), serde_json::json!({"kind": "missing"}));
        let v = serde_json::to_value(parse(sample().as_bytes())).unwrap();
        assert_eq!(v["kind"], "found");
        assert_eq!(v["lines"][0]["mark"], "heading");
    }
}
