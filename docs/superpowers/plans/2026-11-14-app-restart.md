# 토핑 앱 다시 켜서 맞추기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장/불러오기 뒤, 또는 새 키로, 토핑 앱을 강제로 닫고 그 작업공간으로 다시 켜서 앱과 스트림덱 값을 맞춘다.

**Architecture:** 새 모듈 `src/workspace/app.ts`에 '앱 다시 켜기'(강제 종료 → TPconfig 한 칸 수정 → `--autostart` 실행)를 둔다. 프로세스 조작은 주입 가능한 `AppDeps`로 감싸 테스트는 가짜로 돈다. 작업공간 키와 새 액션은 이 함수만 부른다.

**Tech Stack:** TypeScript, `@elgato/streamdeck`, `node:child_process`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-14-app-restart-design.md`

## Global Constraints

- 테스트는 임시 폴더와 가짜 `AppDeps`만 쓴다. `C:\Program Files\TOPPING Pro`에 쓰는 테스트 금지.
- 강제 종료 대상은 `ToppingPro.exe` 하나뿐 (`taskkill /F /IM ToppingPro.exe`).
- 실행: `<dir>\ToppingPro.exe --autostart`, 작업 폴더 `<dir>`, 분리(`detached`, `stdio: 'ignore'`, `unref`).
- TPconfig는 `LastWorkspaceOpened_E2x2_OTG`만 바꾸고 나머지 칸·순서 유지, `JSON.stringify(obj, null, 4)`, 임시 파일 후 이름 바꾸기.
- 새 설정 `restart`(작업공간 키) 기본 켜짐: `restart !== false && restart !== 'false'`.
- 새 액션 UUID `com.haeunga0822.topping-e2x2.app-restart`, 이름 `토핑 앱 다시 켜기`, 설정 `mode`: `sync`(기본, 가) | `plain`(나).
- 화면 글자는 영어 원문을 쓰고 `ui/common.js` TEXT에 한국어·일본어를 넣는다 (i18n 테스트가 검사).
- 오류 메시지도 TEXT에 번역을 넣는다.

## Review Focus

1. 다시 켠 뒤 Run.log의 예전 전환 기록 때문에 플러그인이 엉뚱한 작업공간을 "열린 것"으로 보는 경우 → 앱 시작 줄 이후로는 TPconfig를 믿어야 한다 (Task 1).
2. 앱이 꺼져 있을 때 누름 → 종료는 건너뛰고 설정만 바꾼 뒤 켠다.
3. 강제 종료가 5초 안에 안 끝남 → 설정을 건드리지 않고 오류(키에 경고).
4. 가 모드인데 작업공간을 아직 불러오지 않음 → 저장하지 않고 거부.
5. 다시 켜기가 켜진 저장 키가 앱이 쓰는 이름으로 저장 → 허용(백업 규칙은 그대로).

---

### Task 1: 앱 다시 켜기 모듈 + 로그 해석 보정

**Files:**
- Create: `src/workspace/app.ts`
- Modify: `src/workspace/applog.ts` (`lastOpenedInLog`, `loggedWorkspace`)
- Test: `test/app-restart.test.mjs`, `test/workspace.test.mjs`

**Interfaces:**
- Produces:
  - `export type AppDeps = { running: () => boolean; kill: () => void; launch: (exe: string, cwd: string) => void; sleep: (ms: number) => Promise<void> }`
  - `export function setLastWorkspace(dir: string, name: string): void`
  - `export async function restartApp(dir: string, name: string, deps?: Partial<AppDeps>): Promise<void>`
  - `lastOpenedInLog(text)`가 마지막 `============ Run app ==========` 줄 뒤에 전환이 없으면 `null`을 돌려준다 (전환 기록 없음 = `undefined`와 구분). `loggedWorkspace`는 `null`이면 캐시를 `''`로 비운다 → `currentWorkspacePath`가 TPconfig를 쓴다.

- [ ] **Step 1: 실패하는 테스트**
  - `restartApp` 순서: 가짜 deps 기록이 `['running','kill', ...'running'(false까지), 'launch']`이고 launch 인자가 `[join(dir,'ToppingPro.exe'), dir]`, launch 시점에 TPconfig의 `LastWorkspaceOpened_E2x2_OTG === name`, 다른 칸(`AutoSaveWorkspace`, `LastWorkspaceOpened`) 그대로.
  - 앱이 꺼져 있으면 `kill` 호출 없음, launch는 있음.
  - 5초 동안 `running()`이 계속 true면 reject, TPconfig 그대로, launch 없음.
  - 로그: `... E2X2_OTG_A.TPwork"` + `"B"` 전환 뒤 `============ Run app ==========` 줄이 오면 `lastOpenedInLog` → `null`; 시작 줄 뒤에 다시 전환이 있으면 그 이름.
- [ ] **Step 2:** `npm test` → 새 테스트 실패 확인.
- [ ] **Step 3:** 구현. 기본 deps: `running` = `tasklist /FI "IMAGENAME eq ToppingPro.exe" /NH` 출력에 `ToppingPro.exe` 포함 여부(`execFileSync`), `kill` = `execFileSync('taskkill', ['/F','/IM','ToppingPro.exe'])`, `launch` = `spawn(exe, ['--autostart'], { cwd, detached: true, stdio: 'ignore' }).unref()`, 대기는 100ms 간격 최대 5000ms.
- [ ] **Step 4:** `npm test` 전부 통과.
- [ ] **Step 5:** 커밋 `feat: restart the TOPPING app into a workspace`.

### Task 2: 저장/불러오기 키에 '토핑 앱 다시 켜서 맞추기'

**Files:**
- Modify: `src/actions/workspace-spec.ts`, `src/actions/workspace.ts`, `com.haeunga0822.topping-e2x2.sdPlugin/ui/workspace.html`, `ui/common.js`
- Test: `test/actions-workspace.test.mjs`

**Interfaces:**
- Consumes: `restartApp` (Task 1)
- Produces:
  - `saveProblem(dir, name, restart = false)` — `restart`면 "앱이 쓰는 작업공간" 거부를 하지 않는다. `overwriteNotice(dir, name, restart = false)`도 같은 인자를 넘긴다.
  - `saveWorkspace(conn, dir, name, store = true, restart = false)` — 동기 함수 그대로, `restart`는 거부 규칙에만 쓴다.
  - 키 처리(`workspace.ts`)에서 저장/불러오기 성공 뒤 `restart`면 `await restartApp(dir, name)`; 실패 시 `showAlert` + 저장 모드면 경고 표시.

- [ ] **Step 1: 실패하는 테스트**: `saveProblem(dir, 열린이름, true) === undefined`, `saveProblem(dir, 열린이름)`은 지금 메시지 그대로; `saveWorkspace(..., store, true)`가 열린 이름에 저장하고 `.bak`을 남김.
- [ ] **Step 2:** 실패 확인.
- [ ] **Step 3:** 구현. PI: 저장·불러오기 두 모드 모두에 `<sdpi-item label="Restart the TOPPING app to match"><sdpi-checkbox setting="restart" default="true"></sdpi-checkbox></sdpi-item>`. TEXT: `'Restart the TOPPING app to match': ['토핑 앱 다시 켜서 맞추기', 'TOPPINGアプリを再起動して合わせる']`.
- [ ] **Step 4:** `npm test` 통과.
- [ ] **Step 5:** 커밋 `feat: workspace keys can restart the TOPPING app to match`.

### Task 3: 새 액션 '토핑 앱 다시 켜기'

**Files:**
- Create: `src/actions/app-restart.ts`, `com.haeunga0822.topping-e2x2.sdPlugin/ui/app-restart.html`
- Modify: `src/actions/workspace-spec.ts` (`syncOpenWorkspace`), `src/render/keys.ts` (`renderRestartKey`), `src/plugin.ts`, `manifest.json`, `ui/common.js`
- Test: `test/actions-workspace.test.mjs`, `test/render.test.mjs`

**Interfaces:**
- Consumes: `restartApp`, `saveWorkspace`, `currentWorkspacePath`
- Produces:
  - `export function syncOpenWorkspace(conn, dir): string` — 열린 작업공간 이름을 찾아 `saveWorkspace(conn, dir, 그이름, false, true)`, 이름 반환. 열린 작업공간이 없거나 `!conn.loaded`면 throw.
  - `export function openWorkspaceName(dir): string | undefined` — `currentWorkspacePath`에서 이름만.
  - `export function renderRestartKey(v: { mode: 'sync' | 'plain'; overlay: Overlay }): string` — 작업공간 키 모양, 위 `RESTART`(22, DIM), 아래 `SYNC` 또는 `APP`(30, WHITE).
  - `appRestartActions(connection, dir = WORKSPACE_DIR)`를 `plugin.ts`의 actions 목록에 추가.

- [ ] **Step 1: 실패하는 테스트**: `syncOpenWorkspace`가 열린 파일에 현재 상태를 쓰고 이름을 돌려줌; `loaded`가 false면 throw하고 파일 그대로; `renderRestartKey({mode:'sync'})` SVG에 `RESTART`와 `SYNC`.
- [ ] **Step 2:** 실패 확인.
- [ ] **Step 3:** 구현. 키 누름: `sync`면 `syncOpenWorkspace` 후 `restartApp(dir, 이름)`, `plain`이면 `restartApp(dir, openWorkspaceName(dir))`(없으면 alert), 성공 `showOk`, 실패 `showAlert`. PI: `select('mode', 'Mode', { sync: 'Save Stream Deck values, then restart', plain: 'Just restart' }, 'default="sync"')` + 각 모드 설명 한 줄. manifest 항목은 작업공간 액션과 같은 형식(`Icon`/`Image`: `imgs/channel`). TEXT에 새 글자 번역 추가.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit -p .` 통과.
- [ ] **Step 5:** 커밋 `feat: add a key that restarts the TOPPING app`.

### Task 4: 실제 확인, 매뉴얼, 배포

- [ ] **Step 1:** 사용자 허락을 받은 뒤 실제 확인: 저장 키(다시 켜기 켜짐) 누름 → `Run.log`에 강제 종료 시점의 종료 저장 줄(`保存文件 ... E2X2_OTG_<이름>.TPwork`)이 **없고**, 새 `Run app` 뒤 `LastWorkspaceOpened_E2x2_OTG = "<이름>"`, 앱 화면 값이 스트림덱과 같음. 48V는 누르지 않는다.
- [ ] **Step 2:** 매뉴얼 3개(ko/en/ja)에 새 옵션과 새 키 설명 추가, `node docs/manual/make-pdf.mjs`로 PDF 다시 만들기.
- [ ] **Step 3:** 번들 → 플러그인 폴더 복사 → 이 플러그인 node만 재시작, 시작 시각·해시 확인.
- [ ] **Step 4:** 커밋 `docs: describe the app restart option and key`.
