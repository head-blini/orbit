#!/usr/bin/env bash
# Orbit 맥 준비: 도구 확인·설치 -> run 브랜치로 전환 -> npm install -> 관문 테스트.
# 다시 실행해도 안전하다(이미 있는 도구는 건너뜀).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install || true
  echo "Xcode 명령줄 도구 설치 창을 끝낸 뒤 다시 실행하세요: bash .orbit/setup-mac.sh"
  exit 1
fi

if ! command -v node >/dev/null; then
  if command -v brew >/dev/null; then brew install node
  else echo "Node가 없습니다. https://nodejs.org 에서 LTS를 설치한 뒤 다시 실행하세요: bash .orbit/setup-mac.sh"; exit 1; fi
fi

if ! command -v cargo >/dev/null; then
  [ -f "$HOME/.cargo/env" ] || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi

command -v claude >/dev/null || curl -fsSL https://claude.ai/install.sh | bash

run=$(tr -d '[:space:]' < .orbit/current)
git switch "orbit/$run"
npm install
node --test harness/hooks/gate.test.mjs

echo
echo "준비 끝 (브랜치 orbit/$run)."
echo "앱 실행: npm run tauri dev   -> 뜨면 상단 바 '설치'를 한 번 누르기"
echo "그다음 Claude 앱 Code 탭에서 이 폴더(~/Projects/orbit)로 새 세션을 열고 넘겨받기 메시지를 보내기."
