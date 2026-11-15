use std::path::{Path, PathBuf};

pub const EXTS: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];

/// dir 바로 아래 그림 파일(dir.join(이름)), 이름순. dir이 없거나 못 읽으면 빈 목록.
pub fn list(dir: &Path) -> Vec<PathBuf> {
    if std::fs::symlink_metadata(dir).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        return Vec::new();
    }
    let (Ok(canon), Ok(rd)) = (dir.canonicalize(), std::fs::read_dir(dir)) else {
        return Vec::new();
    };
    let mut out: Vec<PathBuf> = rd
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter(|e| !multi_linked(e))
        .map(|e| dir.join(e.file_name()))
        .filter(|p| {
            let ext = p.extension().and_then(|x| x.to_str()).map(str::to_ascii_lowercase);
            ext.is_some_and(|x| EXTS.contains(&x.as_str())) && inside(&canon, p)
        })
        .collect();
    out.sort();
    out
}

// 하드 링크(nlink > 1)는 다른 곳의 파일과 같은 내용이라 뺀다. Windows는 검사하지 않는다.
#[cfg(unix)]
fn multi_linked(e: &std::fs::DirEntry) -> bool {
    use std::os::unix::fs::MetadataExt;
    e.metadata().map(|m| m.nlink() > 1).unwrap_or(true)
}
#[cfg(not(unix))]
fn multi_linked(_: &std::fs::DirEntry) -> bool {
    false
}

// 방어선(정상 경로에서는 도달하지 않음): list에서는 앞의 is_file()이 링크를 이미 걸러 이 검사가 거르는 입력을 만들 수 없다. 지우지 않는다.
fn inside(dir_canon: &Path, p: &Path) -> bool {
    p.canonicalize().ok().and_then(|c| c.parent().map(|d| d == dir_canon)).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static N: AtomicU32 = AtomicU32::new(0);

    fn tmp() -> PathBuf {
        let root = std::env::temp_dir()
            .join(format!("orbit-screens-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        std::fs::create_dir_all(root.join("screens")).unwrap();
        root
    }

    #[test]
    fn missing_and_empty_dir_give_empty() {
        let root = tmp();
        assert!(list(&root.join("nope")).is_empty());
        assert!(list(&root.join("screens")).is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn picks_images_sorted_and_joined() {
        let root = tmp();
        let dir = root.join("screens");
        for n in ["e.jpg", "d.webp", "c.jpeg", "b.GIF", "a.png"] {
            std::fs::write(dir.join(n), b"x").unwrap();
        }
        let want: Vec<PathBuf> = ["a.png", "b.GIF", "c.jpeg", "d.webp", "e.jpg"].iter().map(|n| dir.join(n)).collect();
        assert_eq!(list(&dir), want);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn excludes_non_images_and_folders() {
        let root = tmp();
        let dir = root.join("screens");
        std::fs::write(dir.join("x.svg"), b"x").unwrap();
        std::fs::write(dir.join("y.txt"), b"x").unwrap();
        std::fs::write(dir.join("z"), b"x").unwrap();
        std::fs::create_dir_all(dir.join("sub.png")).unwrap();
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("sub").join("in.png"), b"x").unwrap();
        assert!(list(&dir).is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn inside_checks_parent() {
        let root = tmp();
        let dir = root.join("screens");
        std::fs::write(root.join("out.png"), b"x").unwrap();
        std::fs::write(dir.join("a.png"), b"x").unwrap();
        let canon = dir.canonicalize().unwrap();
        assert!(!inside(&canon, &dir.join("..").join("out.png")));
        assert!(inside(&canon, &dir.join("a.png")));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn symlink_out_is_excluded() {
        let root = tmp();
        let dir = root.join("screens");
        std::fs::write(root.join("out.png"), b"x").unwrap();
        #[cfg(windows)]
        let r = std::os::windows::fs::symlink_file(root.join("out.png"), dir.join("link.png"));
        #[cfg(unix)]
        let r = std::os::unix::fs::symlink(root.join("out.png"), dir.join("link.png"));
        // 권한이 없어 링크를 못 만들면(Windows 일반 사용자) 이 단언은 건너뛴다.
        if r.is_ok() {
            assert!(list(&dir).is_empty());
        } else {
            eprintln!("symlink_out_is_excluded: 링크를 만들 수 없어 단언을 건너뜀: {:?}", r);
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn dir_symlink_gives_empty() {
        let root = tmp();
        let real = root.join("real");
        std::fs::create_dir_all(&real).unwrap();
        std::fs::write(real.join("a.png"), b"x").unwrap();
        let link = root.join("lnk");
        #[cfg(unix)]
        let r = std::os::unix::fs::symlink(&real, &link);
        #[cfg(windows)]
        let r = std::os::windows::fs::symlink_dir(&real, &link);
        if r.is_ok() {
            assert!(list(&link).is_empty());
            assert_eq!(list(&real).len(), 1);
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn hard_link_is_excluded() {
        let root = tmp();
        let dir = root.join("screens");
        std::fs::write(dir.join("b.png"), b"x").unwrap();
        std::fs::hard_link(dir.join("b.png"), dir.join("a.png")).unwrap();
        std::fs::write(dir.join("c.png"), b"x").unwrap();
        assert_eq!(list(&dir), vec![dir.join("c.png")]);
        let _ = std::fs::remove_dir_all(&root);
    }
}
