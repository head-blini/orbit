// Orbit 앱에 내장할 node(darwin-arm64)를 받아 src-tauri/resources/node/ 에 둔다.
// 출처: https://nodejs.org/dist/v<VER>/node-v<VER>-darwin-arm64.tar.gz (공식 배포본)
// 버전: Node.js v26.13.1 (LTS "Lithium"). 라이선스: MIT — LICENSE를 bin/node 옆에 함께 둔다.
// 바이너리는 저장소에 커밋하지 않는다. SHA는 아래 고정값과 공식 SHASUMS256.txt 둘 다에 대조한다.
// 올릴 때: VER·SHA를 같이 바꾼다(SHA는 SHASUMS256.txt의 darwin-arm64.tar.gz 줄).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, realpathSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VER = "26.13.1";
const SHA = "aec2514ea1ceb2ba52455e9ec65986f6749a06dd759e5db2a72e6889668c9735";
const NAME = `node-v${VER}-darwin-arm64`;
const BASE = `https://nodejs.org/dist/v${VER}`;

// SHASUMS256.txt에서 file 이름과 정확히 같은 줄의 해시를 돌려준다. 없으면 null.
export function shaFromShasums(text, file) {
  for (const line of text.split("\n")) {
    const m = /^([0-9a-f]{64}) [ *]?(\S+)\s*$/.exec(line);
    if (m && m[2] === file) return m[1];
  }
  return null;
}

// 리다이렉트를 따라가도 https://nodejs.org 안에서만 간다.
export function allowedUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && x.hostname === "nodejs.org";
  } catch {
    return false;
  }
}

async function get(url) {
  for (let hop = 0; hop < 5; hop++) {
    if (!allowedUrl(url)) throw new Error(`허용하지 않는 주소: ${url}`);
    const res = await fetch(url, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location"), url).href;
      continue;
    }
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("리다이렉트가 너무 많다");
}

const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

// 캐시가 온전한가: VERSION(`<VER> <SHA> <bin/node 해시>`)이 맞고 LICENSE가 있고 bin/node가 기록한 해시와 같다.
export function cacheValid(dest, stamp) {
  const bin = join(dest, "bin", "node");
  const versionFile = join(dest, "VERSION");
  if (!existsSync(bin) || !existsSync(versionFile) || !existsSync(join(dest, "LICENSE"))) return false;
  const [ver, sha, binSha, ...rest] = readFileSync(versionFile, "utf8").trim().split(/\s+/);
  return rest.length === 0 && `${ver} ${sha}` === stamp && !!binSha && sha256File(bin) === binSha;
}

async function main() {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    console.log("fetch-node: darwin-arm64가 아니라 건너뜀");
    return;
  }
  const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "resources", "node");
  const stamp = `${VER} ${SHA}`;
  const versionFile = join(dest, "VERSION");
  if (cacheValid(dest, stamp)) {
    console.log(`fetch-node: 캐시 사용 (v${VER})`);
    return;
  }

  const file = `${NAME}.tar.gz`;
  const listed = shaFromShasums((await get(`${BASE}/SHASUMS256.txt`)).toString("utf8"), file);
  if (listed !== SHA) throw new Error(`SHASUMS256.txt의 해시(${listed})가 고정값과 다르다`);
  const bytes = await get(`${BASE}/${file}`);
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== SHA) throw new Error(`받은 파일의 해시(${got})가 고정값과 다르다`);

  const tmp = mkdtempSync(join(tmpdir(), "orbit-node-"));
  try {
    const tgz = join(tmp, file);
    writeFileSync(tgz, bytes);
    execFileSync("/usr/bin/tar", ["-xzf", tgz, "-C", tmp, `${NAME}/bin/node`, `${NAME}/LICENSE`]);
    mkdirSync(join(dest, "bin"), { recursive: true });
    renameOrCopy(join(tmp, NAME, "bin", "node"), join(dest, "bin", "node"));
    chmodSync(join(dest, "bin", "node"), 0o755);
    renameOrCopy(join(tmp, NAME, "LICENSE"), join(dest, "LICENSE"));
    writeFileSync(versionFile, `${stamp} ${sha256File(join(dest, "bin", "node"))}\n`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`fetch-node: v${VER} 받음`);
}

// tmpdir과 저장소가 다른 볼륨일 수 있어 rename이 실패하면 복사한다.
function renameOrCopy(from, to) {
  try {
    renameSync(from, to);
  } catch {
    writeFileSync(to, readFileSync(from));
  }
}

const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isMain) {
  main().catch((e) => {
    console.error(`fetch-node: 실패 — ${e.message}`);
    process.exit(1);
  });
}
