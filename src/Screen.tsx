import { useCallback, useEffect, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

const ROTATE_MS = 5 * 60 * 1000;

// 경로는 Rust list_screens가 준 값만 쓴다. 실패는 빈 목록으로 본다.
const list = () => invoke<string[]>("list_screens").catch(() => [] as string[]);

export default function Screen() {
  const [path, setPath] = useState<string | null>(null);
  const [bad, setBad] = useState<string | null>(null);

  // 목록을 다시 받아 현재 다음 그림으로 넘긴다(현재 그림이 목록에 없으면 처음).
  const next = useCallback(async () => {
    const l = await list();
    setPath((cur) => (l.length ? l[(cur ? l.indexOf(cur) + 1 : 0) % l.length] : null));
  }, []);

  useEffect(() => {
    let alive = true;
    list().then((l) => {
      if (alive && l.length) setPath(l[Math.floor(Math.random() * l.length)]);
    });
    const id = setInterval(() => void next(), ROTATE_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [next]);

  return (
    <button type="button" className="lcd" aria-label="다음 그림" disabled={!path} onClick={() => void next()}>
      {path && path !== bad && <img src={convertFileSrc(path)} alt="" onError={() => setBad(path)} />}
    </button>
  );
}
