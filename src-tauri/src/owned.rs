//! Orbit 터미널이 시작한 세션 id 기록 (sessions-resize T1)
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::PathBuf;

const MAX_IDS: usize = 10_000;
const MAX_BYTES: u64 = 1024 * 1024;

pub struct Owned {
    path: Option<PathBuf>,
    ids: Vec<String>,
    set: HashSet<String>,
    /// 메모리 전용: 필터가 세션을 처음 본 시각.
    first_seen: HashMap<String, u64>,
}

fn bad_path(p: &std::path::Path) -> PathBuf {
    let mut s = p.as_os_str().to_owned();
    s.push(".bad");
    PathBuf::from(s)
}

impl Owned {
    /// 파일이 없으면 빈 목록. 깨졌거나 너무 크면 `.bad`로 옮겨 두고 빈 목록. 형식이 틀린 id는 버린다.
    pub fn load(path: Option<PathBuf>) -> Owned {
        let mut ids: Vec<String> = Vec::new();
        if let Some(p) = &path {
            if let Ok(f) = std::fs::File::open(p) {
                let mut buf = Vec::new();
                let read = f.take(MAX_BYTES + 1).read_to_end(&mut buf);
                let parsed = match read {
                    Ok(_) if buf.len() as u64 <= MAX_BYTES => serde_json::from_slice::<Vec<String>>(&buf).ok(),
                    _ => None,
                };
                match parsed {
                    Some(v) => {
                        let mut seen = HashSet::new();
                        ids = v.into_iter().filter(|i| crate::term::valid_id(i) && seen.insert(i.clone())).collect();
                        if ids.len() > MAX_IDS {
                            ids.drain(..ids.len() - MAX_IDS);
                        }
                    }
                    None => {
                        let _ = std::fs::rename(p, bad_path(p));
                    }
                }
            }
        }
        let set = ids.iter().cloned().collect();
        Owned { path, ids, set, first_seen: HashMap::new() }
    }

    #[cfg(test)]
    pub fn contains(&self, id: &str) -> bool {
        self.set.contains(id)
    }

    /// 메모리에는 항상 넣는다. 파일 쓰기가 실패하면 Err.
    pub fn add(&mut self, id: &str) -> Result<(), String> {
        if !crate::term::valid_id(id) || self.set.contains(id) {
            return Ok(());
        }
        self.ids.push(id.to_string());
        self.set.insert(id.to_string());
        if self.ids.len() > MAX_IDS {
            for old in self.ids.drain(..self.ids.len() - MAX_IDS) {
                self.set.remove(&old);
            }
        }
        self.first_seen.remove(id);
        self.save()
    }

    fn save(&self) -> Result<(), String> {
        let Some(p) = &self.path else { return Ok(()) };
        if let Some(d) = p.parent() {
            std::fs::create_dir_all(d).map_err(|e| format!("{} 만들기 실패: {e}", d.display()))?;
        }
        let json = serde_json::to_vec(&self.ids).map_err(|e| e.to_string())?;
        crate::hooks::write_private(p, &json).map_err(|e| format!("{} 저장 실패: {e}", p.display()))
    }

    /// 기록에 있으면 true. 없으면 채택 규칙(cwd 일치 + 터미널 시작 뒤에 처음 봄)을 따져 맞으면 기록하고 true.
    /// `run`의 cwd는 이미 `norm_cwd`된 값이다.
    pub fn adopt(&mut self, id: &str, cwd: Option<&str>, started_ms: Option<u64>, run: Option<(&str, u64)>, now: u64) -> bool {
        if self.set.contains(id) {
            return true;
        }
        if !crate::term::valid_id(id) {
            return false;
        }
        if self.first_seen.len() >= MAX_IDS && !self.first_seen.contains_key(id) {
            // 상한: 가장 오래전에 처음 본 항목부터 버린다
            if let Some(old) = self.first_seen.iter().min_by_key(|(_, v)| **v).map(|(k, _)| k.clone()) {
                self.first_seen.remove(&old);
            }
        }
        let first = *self.first_seen.entry(id.to_string()).or_insert(now);
        let (Some((rcwd, rstart)), Some(cwd)) = (run, cwd) else { return false };
        let seen = started_ms.map_or(first, |s| s.min(first));
        if norm_cwd(cwd) != rcwd || seen < rstart {
            return false;
        }
        let _ = self.add(id);
        true
    }
}

/// cwd 비교용 정규화: 드라이브 verbatim 접두사 제거, 끝 구분자 제거(루트는 유지), 윈도우는 `\`·소문자.
pub fn norm_cwd(s: &str) -> String {
    let s = crate::term::strip_verbatim_disk(s);
    let t = s.trim_end_matches(['/', '\\']);
    let mut out = if t.is_empty() {
        s.chars().next().map(String::from).unwrap_or_default()
    } else if t.len() == 2 && t.as_bytes()[1] == b':' && s.len() > 2 {
        format!("{t}{}", &s[2..3])
    } else {
        t.to_string()
    };
    if cfg!(windows) {
        out = out.replace('/', "\\").to_lowercase();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    const A: &str = "11111111-2222-3333-4444-555555555555";
    const B: &str = "aaaaaaaa-2222-3333-4444-555555555555";

    fn dir() -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let d = std::env::temp_dir().join(format!("orbit-owned-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn missing_file_is_empty() {
        let d = dir();
        let o = Owned::load(Some(d.join("o.json")));
        assert!(!o.contains(A));
    }

    #[test]
    fn add_then_reload_contains_and_no_tmp() {
        let d = dir();
        let p = d.join("o.json");
        let mut o = Owned::load(Some(p.clone()));
        o.add(A).unwrap();
        assert!(Owned::load(Some(p.clone())).contains(A));
        assert!(!d.join("o.json.tmp").exists());
    }

    #[test]
    fn invalid_ids_dropped_on_load() {
        let d = dir();
        let p = d.join("o.json");
        std::fs::write(&p, format!("[\"{A}\",\"../x\",\"--resume\",\"\"]")).unwrap();
        let o = Owned::load(Some(p));
        assert!(o.contains(A));
        assert!(!o.contains("../x"));
        assert_eq!(o.ids.len(), 1);
    }

    #[test]
    fn broken_json_moves_to_bad() {
        let d = dir();
        let p = d.join("o.json");
        std::fs::write(&p, "{not json").unwrap();
        let o = Owned::load(Some(p.clone()));
        assert!(!o.contains(A));
        assert!(d.join("o.json.bad").exists());
        assert!(!p.exists());
    }

    #[test]
    fn over_cap_drops_oldest() {
        let mut o = Owned::load(None);
        let id = |n: usize| format!("{n:08x}-2222-3333-4444-555555555555");
        for n in 0..MAX_IDS + 3 {
            o.add(&id(n)).unwrap();
        }
        assert_eq!(o.ids.len(), MAX_IDS);
        assert!(!o.contains(&id(0)) && !o.contains(&id(2)));
        assert!(o.contains(&id(3)) && o.contains(&id(MAX_IDS + 2)));
    }

    #[cfg(unix)]
    #[test]
    fn saved_file_is_private() {
        use std::os::unix::fs::PermissionsExt;
        let d = dir();
        let p = d.join("o.json");
        Owned::load(Some(p.clone())).add(A).unwrap();
        assert_eq!(std::fs::metadata(&p).unwrap().permissions().mode() & 0o777, 0o600);
    }

    #[test]
    fn first_seen_is_capped() {
        let mut o = Owned::load(None);
        let id = |n: usize| format!("{n:08x}-2222-3333-4444-555555555555");
        for n in 0..MAX_IDS + 5 {
            o.adopt(&id(n), None, None, None, n as u64);
        }
        assert_eq!(o.first_seen.len(), MAX_IDS);
        assert!(!o.first_seen.contains_key(&id(0)) && o.first_seen.contains_key(&id(MAX_IDS + 4)));
    }

    #[test]
    fn path_none_is_memory_only() {
        let mut o = Owned::load(None);
        o.add(A).unwrap();
        assert!(o.contains(A));
    }

    #[test]
    fn adopt_recorded_always_true() {
        let mut o = Owned::load(None);
        o.add(A).unwrap();
        assert!(o.adopt(A, None, None, None, 1));
    }

    #[test]
    fn adopt_same_cwd_trailing_sep_after_start() {
        let mut o = Owned::load(None);
        assert!(o.adopt(A, Some("/w/p/"), None, Some(("/w/p", 1000)), 1500));
        assert!(o.contains(A));
    }

    #[test]
    fn adopt_other_cwd_rejected() {
        let mut o = Owned::load(None);
        assert!(!o.adopt(A, Some("/w/q"), None, Some(("/w/p", 1000)), 1500));
        assert!(!o.contains(A));
    }

    #[test]
    fn adopt_started_before_terminal_rejected() {
        let mut o = Owned::load(None);
        assert!(!o.adopt(A, Some("/w/p"), Some(900), Some(("/w/p", 1000)), 1500));
        assert!(!o.contains(A));
    }

    #[test]
    fn adopt_first_seen_before_terminal_rejected() {
        let mut o = Owned::load(None);
        assert!(!o.adopt(B, Some("/w/p"), None, None, 500));
        assert!(!o.adopt(B, Some("/w/p"), None, Some(("/w/p", 1000)), 1500));
        assert!(!o.contains(B));
    }

    #[test]
    fn adopt_after_terminal_stopped_rejected() {
        let mut o = Owned::load(None);
        assert!(!o.adopt(A, Some("/w/p"), None, None, 2000));
        assert!(!o.contains(A));
    }

    #[test]
    fn adopt_without_cwd_rejected_then_later_ok() {
        let mut o = Owned::load(None);
        assert!(!o.adopt(A, None, None, Some(("/w/p", 1000)), 1500));
        assert!(o.adopt(A, Some("/w/p"), None, Some(("/w/p", 1000)), 1600));
    }

    #[test]
    fn norm_cwd_rules() {
        assert_eq!(norm_cwd("/w/p/"), "/w/p");
        assert_eq!(norm_cwd("/w/p//"), "/w/p");
        assert_eq!(norm_cwd("/"), "/");
        assert_eq!(norm_cwd("/w/p"), "/w/p");
        #[cfg(not(windows))]
        {
            assert_eq!(norm_cwd(r"\\?\C:\x\"), r"C:\x");
            assert_eq!(norm_cwd(r"C:\"), r"C:\");
        }
        #[cfg(windows)]
        {
            assert_eq!(norm_cwd(r"\\?\C:\X\"), r"c:\x");
            assert_eq!(norm_cwd("C:/Foo/"), r"c:\foo");
            assert_eq!(norm_cwd(r"C:\"), r"c:\");
        }
    }
}
