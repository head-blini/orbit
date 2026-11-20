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

#[derive(serde::Serialize, Debug, PartialEq, Clone, Default)]
pub struct Loops {
    pub plan: u64,
    pub review: u64,
    pub debug: u64,
    pub security: u64,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
pub struct Tasks {
    pub done: u64,
    pub total: u64,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Roadmap {
    Missing,
    TooBig { max_bytes: u64, max_entries: usize },
    Error { reason: String },
    Found { lines: Vec<Line>, skipped: bool },
}

const MAX_STATE: u64 = 64 * 1024;

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

/// dir/ROADMAP.md의 검사된 경로를 돌려준다. 링크·정션·폴더·범위 밖은 Error, 없으면 Missing.
fn locate(dir: &Path) -> Result<std::path::PathBuf, Roadmap> {
    let file = dir.join(FILE);
    let meta = match std::fs::symlink_metadata(&file) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(Roadmap::Missing),
        Err(e) => return Err(err(&e.kind().to_string())),
    };
    if meta.file_type().is_symlink() {
        return Err(err("링크·정션은 읽지 않습니다"));
    }
    if !meta.is_file() {
        return Err(err("일반 파일이 아닙니다"));
    }
    // 심볼릭 링크·정션으로 폴더 밖을 가리키는 경우를 막는다
    let inside = match (file.canonicalize(), dir.canonicalize()) {
        (Ok(f), Ok(d)) => f.parent() == Some(d.as_path()),
        _ => false,
    };
    if !inside {
        return Err(err("폴더 밖의 파일입니다"));
    }
    Ok(file)
}

/// dir/ROADMAP.md 하나를 읽는다. 링크·정션·폴더·범위 밖은 Error, 없으면 Missing.
pub fn read(dir: &Path) -> Roadmap {
    let file = match locate(dir) {
        Ok(f) => f,
        Err(r) => return r,
    };
    let f = match std::fs::File::open(&file) {
        Ok(f) => f,
        Err(e) => return err(&e.kind().to_string()),
    };
    // 위 검사와 open 사이에 파일이 바뀌었을 수 있어 열린 핸들로 다시 확인한다
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

/// 로컬 절대 경로 모양인가. 파일 시스템을 건드리지 않는다.
pub fn local_abs(cwd: &str) -> bool {
    let p = Path::new(cwd);
    // Windows: 드라이브 문자 절대 경로만. UNC·장치·verbatim 경로는 SMB 접속(해시 유출)을 부른다.
    #[cfg(windows)]
    let ok = matches!(
        p.components().next(),
        Some(std::path::Component::Prefix(x)) if matches!(x.kind(), std::path::Prefix::Disk(_))
    ) && p.is_absolute();
    #[cfg(not(windows))]
    let ok = p.is_absolute();
    ok
}

/// cwd는 신뢰할 수 없는 문자열이다. 어떤 파일 시스템 호출보다 먼저 모양을 검사한다.
pub fn for_cwd(cwd: Option<&str>) -> Roadmap {
    let Some(cwd) = cwd.filter(|c| !c.is_empty()) else {
        return Roadmap::Missing;
    };
    if !local_abs(cwd) {
        return err("로컬 절대 경로가 아닙니다");
    }
    read(Path::new(cwd))
}

/// 로드맵 파일의 변경 감지용 지문. 파일을 열지 않고 검사된 경로의 metadata만 본다.
#[derive(Debug, Clone, PartialEq)]
pub enum Stamp {
    Missing,
    Rejected,
    File { len: u64, modified: Option<std::time::SystemTime> },
}

/// `for_cwd`와 같은 검사(`local_abs`·`locate`)를 거친 뒤 지문을 만든다.
pub fn stamp(cwd: Option<&str>) -> Stamp {
    let Some(cwd) = cwd.filter(|c| !c.is_empty()) else { return Stamp::Missing };
    if !local_abs(cwd) {
        return Stamp::Rejected;
    }
    match locate(Path::new(cwd)) {
        // 링크를 따라가지 않는다: locate 이후 바꿔치기돼도 일반 파일이 아니면 거부
        Ok(f) => match std::fs::symlink_metadata(&f) {
            Ok(m) if m.is_file() && !m.file_type().is_symlink() => Stamp::File { len: m.len(), modified: m.modified().ok() },
            _ => Stamp::Rejected,
        },
        Err(Roadmap::Missing) => Stamp::Missing,
        Err(_) => Stamp::Rejected,
    }
}

/// 감시 대상별 디바운스. 바뀐 지문이 다음 step에서도 같을 때 한 번만 true.
#[derive(Default)]
pub struct Follow {
    id: Option<String>,
    base: Option<Stamp>,
    pending: Option<Stamp>,
}

impl Follow {
    pub fn step(&mut self, id: Option<&str>, now: Stamp) -> bool {
        if self.id.as_deref() != id {
            self.id = id.map(str::to_string);
            self.base = Some(now);
            self.pending = None;
            return false;
        }
        if id.is_none() {
            return false;
        }
        if self.base.as_ref() == Some(&now) {
            self.pending = None;
            return false;
        }
        if self.pending.as_ref() == Some(&now) {
            self.base = Some(now);
            self.pending = None;
            return true;
        }
        self.pending = Some(now);
        false
    }
}

/// run id 패턴: 1~128바이트, ASCII 영숫자·`_`·`.`·`-`, `.`으로 시작 금지.
fn run_id_ok(n: &str) -> bool {
    !n.is_empty() && n.len() <= 128 && !n.starts_with('.') && n.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'.' | b'-'))
}

fn real_dir(p: &Path) -> bool {
    std::fs::symlink_metadata(p).is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink())
}

/// `dir/name` 하나를 읽는다. 링크·범위 밖·max 초과·일반 파일 아님은 None.
fn read_capped(dir: &Path, name: &str, max: u64) -> Option<Vec<u8>> {
    let file = dir.join(name);
    let meta = std::fs::symlink_metadata(&file).ok()?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return None;
    }
    if file.canonicalize().ok()?.parent()? != dir.canonicalize().ok()?.as_path() {
        return None;
    }
    let f = std::fs::File::open(&file).ok()?;
    let m = f.metadata().ok()?;
    if !m.is_file() || m.len() > max {
        return None;
    }
    let mut buf = Vec::new();
    f.take(max + 1).read_to_end(&mut buf).ok()?;
    if buf.len() as u64 > max {
        return None;
    }
    Some(buf)
}

/// 마지막 `VERDICT: PASS|FAIL` 줄로 판정한다(gate.mjs와 같은 규칙). 파일이 없거나 못 읽으면 Missing.
fn verdict(dir: &Path, name: &str) -> Verdict {
    let Some(buf) = read_capped(dir, name, MAX_BYTES) else { return Verdict::Missing };
    let ws = |c: &u8| matches!(c, b' ' | b'\t');
    let mut out = Verdict::Pending;
    for line in buf.split(|&c| c == b'\n') {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        let Some(rest) = line.strip_prefix(b"VERDICT:") else { continue };
        let rest = &rest[rest.iter().take_while(|c| ws(c)).count()..];
        let rest = &rest[..rest.len() - rest.iter().rev().take_while(|c| ws(c)).count()];
        match rest {
            b"PASS" => out = Verdict::Pass,
            b"FAIL" => out = Verdict::Fail,
            _ => {}
        }
    }
    out
}

/// 레이드 화면용. 세션 cwd와 run id로 `STATE.json`과 체크포인트 파일 네 개를 읽는다.
/// 읽은 문자열은 고정 값으로만 바꿔 내보낸다.
pub fn raid(cwd: Option<&str>, run: Option<&str>) -> Raid {
    let (Some(cwd), Some(run)) = (cwd.filter(|c| !c.is_empty()), run) else { return Raid::None };
    if !local_abs(cwd) || !run_id_ok(run) {
        return Raid::None;
    }
    let orbit = Path::new(cwd).join(".orbit");
    let runs_dir = orbit.join("runs");
    let run_dir = runs_dir.join(run);
    if !real_dir(&orbit) || !real_dir(&runs_dir) || !real_dir(&run_dir) {
        return Raid::None;
    }
    let Some(buf) = read_capped(&run_dir, "STATE.json", MAX_STATE) else { return Raid::None };
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(&buf) else { return Raid::None };
    let Some(o) = v.as_object() else { return Raid::None };
    let track = ["quick", "standard", "full"].into_iter().find(|t| o.get("track").and_then(|x| x.as_str()) == Some(t));
    let stage = ["brief", "plan", "build", "review", "verify", "security", "release", "done"]
        .into_iter()
        .find(|s| o.get("stage").and_then(|x| x.as_str()) == Some(s));
    let loops = o
        .get("loops")
        .and_then(|x| x.as_object())
        .map(|m| m.values().filter_map(|x| x.as_u64()).fold(0u64, |a, n| a.saturating_add(n)).min(99))
        .unwrap_or(0);
    let kind = |k: &str| {
        o.get("loops").and_then(|x| x.as_object()).and_then(|m| m.get(k)).and_then(|x| x.as_u64()).unwrap_or(0).min(99)
    };
    let loops_by = Loops { plan: kind("plan"), review: kind("review"), debug: kind("debug"), security: kind("security") };
    let tasks = o.get("tasks").and_then(|x| x.as_object()).and_then(|m| {
        let (mut done, mut total) = (0u64, 0u64);
        for (k, val) in m {
            let b = k.as_bytes();
            if !(2..=4).contains(&b.len()) || b[0] != b'T' || !b[1..].iter().all(u8::is_ascii_digit) {
                continue;
            }
            total += 1;
            if val.as_str()?.starts_with("done") {
                done += 1;
            }
        }
        (total > 0 && total <= 99).then_some(Tasks { done, total })
    });
    let gates = Gates {
        plan: verdict(&run_dir, "PLAN_CHECK.md"),
        review: verdict(&run_dir, "REVIEW.md"),
        verify: verdict(&run_dir, "VERIFY.md"),
        security: verdict(&run_dir, "SECURITY.md"),
    };
    Raid::Run { track, stage, loops, loops_by, tasks, gates }
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    Missing,
    Pending,
    Pass,
    Fail,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
pub struct Gates {
    pub plan: Verdict,
    pub review: Verdict,
    pub verify: Verdict,
    pub security: Verdict,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Raid {
    None,
    Run {
        track: Option<&'static str>,
        stage: Option<&'static str>,
        loops: u64,
        loops_by: Loops,
        tasks: Option<Tasks>,
        gates: Gates,
    },
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
        let edge = format!("- [ ] a\n- [ ] {}\n", "x".repeat(MAX_LINE - 6));
        assert_eq!(edge.lines().nth(1).unwrap().len(), MAX_LINE);
        let (lines, skipped) = found(parse(edge.as_bytes()));
        assert_eq!(lines.len(), 2);
        assert!(!skipped);
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
    fn local_abs_shapes() {
        assert!(!local_abs(""));
        assert!(!local_abs("rel\\dir"));
        assert!(!local_abs("rel/dir"));
        #[cfg(windows)]
        {
            for bad in [r"\\server\share\p", r"\\?\C:\x", r"\\.\C:\x", r"\\?\UNC\s\x", "C:rel", r"\rooted"] {
                assert!(!local_abs(bad), "{bad}");
            }
            assert!(local_abs(r"C:\Users\a\proj"));
        }
        #[cfg(not(windows))]
        assert!(local_abs("/home/a/proj"));
    }

    #[test]
    fn serializes_as_tagged_json() {
        assert_eq!(serde_json::to_value(Roadmap::Missing).unwrap(), serde_json::json!({"kind": "missing"}));
        let v = serde_json::to_value(parse(sample().as_bytes())).unwrap();
        assert_eq!(v["kind"], "found");
        assert_eq!(v["lines"][0]["mark"], "heading");
    }

    // ---- 파일 지문·디바운스 ----
    fn file(len: u64) -> Stamp {
        Stamp::File { len, modified: None }
    }

    #[test]
    fn stamp_shapes() {
        assert_eq!(stamp(None), Stamp::Missing);
        assert_eq!(stamp(Some("")), Stamp::Missing);
        assert_eq!(stamp(Some("rel/dir")), Stamp::Rejected);
        #[cfg(windows)]
        for bad in [r"\\server\share\p", r"\\?\C:\x", r"\\.\C:\x", r"\\?\UNC\s\x", "C:rel", r"\rooted"] {
            assert_eq!(stamp(Some(bad)), Stamp::Rejected, "{bad}");
        }
        let root = tmp();
        let dir = root.join("proj");
        let d = dir.to_str();
        assert_eq!(stamp(d), Stamp::Missing);
        assert_eq!(stamp(root.join("nope").to_str()), Stamp::Missing);
        std::fs::write(dir.join(FILE), "- [ ] a\n").unwrap();
        let a = stamp(d);
        assert!(matches!(a, Stamp::File { len: 8, .. }), "{:?}", a);
        std::fs::write(dir.join(FILE), "- [ ] abc\n").unwrap();
        let b = stamp(d);
        assert!(matches!(b, Stamp::File { len: 10, .. }), "{:?}", b);
        assert_ne!(a, b);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn stamp_rejects_links() {
        let root = tmp();
        let dir = root.join("proj");
        std::fs::create_dir_all(dir.join(FILE)).unwrap();
        assert_eq!(stamp(dir.to_str()), Stamp::Rejected);
        std::fs::remove_dir_all(dir.join(FILE)).unwrap();
        #[cfg(unix)]
        {
            std::fs::write(root.join("out.md"), "- [ ] x\n").unwrap();
            std::os::unix::fs::symlink(root.join("out.md"), dir.join(FILE)).unwrap();
            assert_eq!(stamp(dir.to_str()), Stamp::Rejected);
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn follow_debounce() {
        let mut f = Follow::default();
        // 대상이 정해진 tick은 기준만 잡는다
        assert!(!f.step(Some("a"), file(1)));
        assert!(!f.step(Some("a"), file(1)));
        // 바뀜 1회차 false, 2회차 true, 3회차 false
        assert!(!f.step(Some("a"), file(2)));
        assert!(f.step(Some("a"), file(2)));
        assert!(!f.step(Some("a"), file(2)));
        // 변경 중 또 바뀌면 연속 두 번 같을 때만 true
        assert!(!f.step(Some("a"), file(3)));
        assert!(!f.step(Some("a"), file(4)));
        assert!(f.step(Some("a"), file(4)));
        // 대상이 바뀐 tick은 기준만 다시 잡는다
        assert!(!f.step(Some("b"), file(9)));
        assert!(!f.step(Some("b"), file(9)));
        // 대상 없음으로 바뀌어도 보내지 않는다
        assert!(!f.step(None, Stamp::Missing));
        assert!(!f.step(None, file(1)));
        assert!(!f.step(None, file(1)));
        // 파일이 없어졌다 생기는 것도 변경이다
        assert!(!f.step(Some("c"), Stamp::Missing));
        assert!(!f.step(Some("c"), file(1)));
        assert!(f.step(Some("c"), file(1)));
        assert!(!f.step(Some("c"), Stamp::Missing));
        assert!(f.step(Some("c"), Stamp::Missing));
    }

    // ---- run 목록 ----
    use std::time::{Duration, SystemTime};

    fn mk_run(proj: &Path, id: &str, body: &str, age: u64) {
        let d = proj.join(".orbit").join("runs").join(id);
        std::fs::create_dir_all(&d).unwrap();
        let f = d.join("STATE.json");
        std::fs::write(&f, body).unwrap();
        let t = SystemTime::now() - Duration::from_secs(age);
        std::fs::OpenOptions::new().write(true).open(&f).unwrap().set_modified(t).unwrap();
    }

    #[test]
    fn roadmap_empty_ignores_runs() {
        let p = tmp().join("proj");
        mk_run(&p, "a", r#"{"stage":"x"}"#, 1);
        assert_eq!(for_cwd(p.to_str()), Roadmap::Missing);
        std::fs::write(p.join(FILE), "## 제목만\n").unwrap();
        assert_eq!(
            for_cwd(p.to_str()),
            Roadmap::Found { lines: vec![l(Mark::Heading, "제목만")], skipped: false }
        );
    }

    fn raid_at(proj: &Path, id: &str) -> Raid {
        raid(Some(proj.to_str().unwrap()), Some(id))
    }

    fn put(proj: &Path, id: &str, name: &str, body: &[u8]) {
        let d = proj.join(".orbit").join("runs").join(id);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join(name), body).unwrap();
    }

    fn gates_of(r: &Raid) -> Gates {
        match r {
            Raid::Run { gates, .. } => gates.clone(),
            other => panic!("Run이 아님: {:?}", other),
        }
    }

    #[test]
    fn raid_rejects_bad_input() {
        let root = tmp();
        let proj = root.join("proj");
        mk_run(&proj, "a", r#"{"track":"quick"}"#, 0);
        let p = proj.to_str().unwrap();
        assert_eq!(raid(None, Some("a")), Raid::None);
        assert_eq!(raid(Some(""), Some("a")), Raid::None);
        assert_eq!(raid(Some("rel/path"), Some("a")), Raid::None);
        assert_eq!(raid(Some(p), None), Raid::None);
        for bad in ["..", "a/b", "", ".hid"] {
            assert_eq!(raid(Some(p), Some(bad)), Raid::None, "{bad}");
        }
        assert_eq!(raid(Some(p), Some("nope")), Raid::None);
    }

    #[test]
    fn raid_reads_state_and_loops() {
        let root = tmp();
        let proj = root.join("proj");
        mk_run(&proj, "a", r#"{"track":"standard","stage":"build","loops":{"plan":1,"review":"x","debug":2}}"#, 0);
        assert_eq!(
            raid_at(&proj, "a"),
            Raid::Run {
                track: Some("standard"),
                stage: Some("build"),
                loops: 3,
                loops_by: Loops { plan: 1, review: 0, debug: 2, security: 0 },
                tasks: None,
                gates: Gates { plan: Verdict::Missing, review: Verdict::Missing, verify: Verdict::Missing, security: Verdict::Missing },
            }
        );
        mk_run(&proj, "b", r#"{"track":"full","stage":"done","loops":{"a":90,"b":90}}"#, 0);
        match raid_at(&proj, "b") {
            Raid::Run { loops, .. } => assert_eq!(loops, 99),
            o => panic!("{:?}", o),
        }
        mk_run(&proj, "c", r#"{"track":"quick","loops":[1,2]}"#, 0);
        match raid_at(&proj, "c") {
            Raid::Run { loops, stage, .. } => assert_eq!((loops, stage), (0, None)),
            o => panic!("{:?}", o),
        }
    }

    #[test]
    fn raid_unknown_values_become_none() {
        let root = tmp();
        let proj = root.join("proj");
        mk_run(&proj, "a", r#"{"track":"<img src=x>","stage":"<b>x</b>"}"#, 0);
        let r = raid_at(&proj, "a");
        assert_eq!(
            r,
            Raid::Run { track: None, stage: None, loops: 0, loops_by: Loops::default(), tasks: None, gates: gates_of(&r) }
        );
        mk_run(&proj, "b", r#"{"track":5,"stage":["build"]}"#, 0);
        match raid_at(&proj, "b") {
            Raid::Run { track, stage, .. } => assert_eq!((track, stage), (None, None)),
            o => panic!("{:?}", o),
        }
        mk_run(&proj, "c", "[1]", 0);
        assert_eq!(raid_at(&proj, "c"), Raid::None);
        mk_run(&proj, "d", "{broken", 0);
        assert_eq!(raid_at(&proj, "d"), Raid::None);
    }

    fn tasks_of(proj: &Path, id: &str, body: &str) -> (Option<Tasks>, serde_json::Value) {
        mk_run(proj, id, body, 0);
        let r = raid_at(proj, id);
        let v = serde_json::to_value(&r).unwrap();
        match r {
            Raid::Run { tasks, .. } => (tasks, v),
            o => panic!("{:?}", o),
        }
    }

    #[test]
    fn raid_counts_tasks_and_loop_kinds() {
        let root = tmp();
        let proj = root.join("proj");
        let (t, v) = tasks_of(
            &proj,
            "a",
            r#"{"tasks":{"T1":"done 9ea","t2":"pending","T3":"done(x)","T4":"pending","t0":"done","R1":"done","merge":"main","T":"done","T1a":"done","TT1":"done"}}"#,
        );
        assert_eq!(t, Some(Tasks { done: 2, total: 3 }));
        assert_eq!(v["tasks"], serde_json::json!({"done":2,"total":3}));
        assert!(v["loops_by"]["debug"].is_number());
        let (t, v) = tasks_of(&proj, "b", r#"{"tasks":{"T1":5,"T2":"done"}}"#);
        assert_eq!((t, v["tasks"].is_null()), (None, true));
        assert_eq!(tasks_of(&proj, "c", r#"{"tasks":{"T1":{"x":1}}}"#).0, None);
        assert_eq!(tasks_of(&proj, "d", r#"{"tasks":["T1"]}"#).0, None);
        assert_eq!(tasks_of(&proj, "e", r#"{"tasks":"T1"}"#).0, None);
        assert_eq!(tasks_of(&proj, "f", r#"{"tasks":{"merge":"done","t1":"done"}}"#).0, None);
        let many: String = (1..=100).map(|i| format!("\"T{i}\":\"done\"")).collect::<Vec<_>>().join(",");
        assert_eq!(tasks_of(&proj, "h", &format!("{{\"tasks\":{{{many}}}}}")).0, None);
        mk_run(&proj, "g", r#"{"loops":{"plan":500,"security":3,"zzz":7}}"#, 0);
        match raid_at(&proj, "g") {
            Raid::Run { loops_by, .. } => assert_eq!(loops_by, Loops { plan: 99, review: 0, debug: 0, security: 3 }),
            o => panic!("{:?}", o),
        }
    }

    #[test]
    fn raid_verdict_rules() {
        let root = tmp();
        let proj = root.join("proj");
        mk_run(&proj, "a", r#"{"track":"full"}"#, 0);
        put(&proj, "a", "PLAN_CHECK.md", b"VERDICT: PASS\nnotes\nVERDICT: FAIL\n");
        put(&proj, "a", "REVIEW.md", b"VERDICT: FAIL\nVERDICT:\t PASS \t\n");
        put(&proj, "a", "VERIFY.md", b"VERDICT: PASS extra\n");
        put(&proj, "a", "SECURITY.md", b"x\r\nVERDICT: PASS\r\n");
        let g = gates_of(&raid_at(&proj, "a"));
        assert_eq!(g.plan, Verdict::Fail);
        assert_eq!(g.review, Verdict::Pass);
        assert_eq!(g.verify, Verdict::Pending);
        assert_eq!(g.security, Verdict::Pass);
        mk_run(&proj, "b", r#"{"track":"full"}"#, 0);
        assert_eq!(gates_of(&raid_at(&proj, "b")).plan, Verdict::Missing);
        let v = serde_json::to_value(raid_at(&proj, "a")).unwrap();
        assert_eq!(v["kind"], "run");
        assert_eq!(v["track"], "full");
        assert_eq!(v["gates"]["plan"], "fail");
        assert_eq!(v["gates"]["review"], "pass");
        assert_eq!(v["gates"]["verify"], "pending");
        assert_eq!(v["gates"]["security"], "pass");
        assert_eq!(serde_json::to_value(Raid::None).unwrap()["kind"], "none");
    }

    #[test]
    fn raid_size_caps() {
        let root = tmp();
        let proj = root.join("proj");
        let mut big = br#"{"track":"quick","pad":""#.to_vec();
        big.extend(std::iter::repeat(b'a').take(64 * 1024));
        big.extend_from_slice(b"\"}");
        mk_run(&proj, "a", std::str::from_utf8(&big).unwrap(), 0);
        assert_eq!(raid_at(&proj, "a"), Raid::None);
        mk_run(&proj, "b", r#"{"track":"quick"}"#, 0);
        let mut md = b"VERDICT: PASS\n".to_vec();
        md.extend(std::iter::repeat(b'a').take(256 * 1024));
        put(&proj, "b", "REVIEW.md", &md);
        assert_eq!(gates_of(&raid_at(&proj, "b")).review, Verdict::Missing);
    }

    #[cfg(unix)]
    #[test]
    fn raid_rejects_links() {
        use std::os::unix::fs::symlink;
        let root = tmp();
        let proj = root.join("proj");
        std::fs::write(root.join("out.json"), r#"{"track":"quick"}"#).unwrap();
        std::fs::write(root.join("out.md"), "VERDICT: PASS\n").unwrap();
        mk_run(&proj, "a", r#"{"track":"quick"}"#, 0);
        std::fs::remove_file(proj.join(".orbit/runs/a/STATE.json")).unwrap();
        symlink(root.join("out.json"), proj.join(".orbit/runs/a/STATE.json")).unwrap();
        assert_eq!(raid_at(&proj, "a"), Raid::None);
        mk_run(&proj, "b", r#"{"track":"quick"}"#, 0);
        symlink(root.join("out.md"), proj.join(".orbit/runs/b/REVIEW.md")).unwrap();
        assert_eq!(gates_of(&raid_at(&proj, "b")).review, Verdict::Missing);
        // runs/<id> 링크 폴더
        let real = root.join("elsewhere");
        std::fs::create_dir_all(&real).unwrap();
        std::fs::write(real.join("STATE.json"), r#"{"track":"quick"}"#).unwrap();
        symlink(&real, proj.join(".orbit/runs/c")).unwrap();
        assert_eq!(raid_at(&proj, "c"), Raid::None);
        // .orbit/runs 링크
        let proj2 = root.join("proj2");
        std::fs::create_dir_all(proj2.join(".orbit")).unwrap();
        std::fs::create_dir_all(root.join("runs-real/a")).unwrap();
        std::fs::write(root.join("runs-real/a/STATE.json"), r#"{"track":"quick"}"#).unwrap();
        symlink(root.join("runs-real"), proj2.join(".orbit/runs")).unwrap();
        assert_eq!(raid_at(&proj2, "a"), Raid::None);
    }
}
