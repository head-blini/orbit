SUMMARY K3 (커밋 없음, kit은 git 밖)
바꾼 파일:
- C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-harness-hardening\kit\settings.json (.claude/settings.json 복사 + deny 2줄)
- C:\Users\lclk1\Projects\orbit\.orbit\runs\20261114-harness-hardening\kit\APPLY.md (요건 1~8)
원본 .claude/settings.json은 건드리지 않았다.

검증:
```
node -e "JSON.parse(readFileSync(kit/settings.json))"  -> exit 0
git diff --no-index --stat .claude/settings.json kit/settings.json
 {.claude => .orbit/runs/20261114-harness-hardening/kit}/settings.json | 2 ++
 1 file changed, 2 insertions(+)
diff 본문:
       "Read(./.env.*)",
+      "Read(./**/.env)",
+      "Read(./**/.env.*)",
       "Read(./**/*.pem)",
```
삭제 줄 없음. 추가 두 줄이 `"Read(./.env.*)",` 바로 아래에 있다.

계획과 달라진 점: 없음. APPLY.md는 요건 1~8을 모두 담았고 PowerShell 5.1 한 줄씩, `&&` 없음, CUTOVER 형식이다. 되돌리기는 해시 기준이다.
못 한 것: APPLY.md 명령은 실행하지 않았다(kit/gate.mjs, gate.test.mjs는 K1이 만들고 아직 없을 수 있다). git이 LF/CRLF 경고를 낸다(기존 파일도 동일). kit/settings.json은 LF로 썼다.
