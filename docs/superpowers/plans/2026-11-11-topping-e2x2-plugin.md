# TOPPING E2x2 OTG 스트림덱 플러그인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TOPPING E2x2 OTG를 USB(HID)로 직접 제어하는 스트림덱 플러그인을, 사용자의 토탈믹스 플러그인과 같은 구성으로 새 저장소에 만든다.

**Architecture:** 플러그인이 믹서 전체 값(`MixerState`)을 직접 기억하고, 바뀐 값을 16바이트 HID 출력 리포트로 장치에 보낸다. 장치는 값을 돌려주지 않으므로, 시작할 때와 토핑 앱의 작업 공간 파일이 바뀔 때 그 파일에서 상태를 다시 읽는다. Mute/Solo/LINK/Pan은 토핑 앱처럼 교차점 값을 계산해서 흉내 낸다. 액션·런타임·설정 화면 구조는 `streamdeck-rme-totalmix`를 따르고, 화면 모양은 토핑 앱 디자인으로 새로 그린다.

**Tech Stack:** TypeScript 6, `@elgato/streamdeck` 3.0.4, Node 20, rollup, `node:test`, `node-hid`(새 의존성, HID 접근용).

**Spec:** `docs/superpowers/specs/2026-11-11-topping-e2x2-plugin-design.md` / 프로토콜: `docs/usb-protocol.md`

## Global Constraints
- 저장소: `C:\Users\Kimtan_StreamPC\streamdeck-topping-e2x2`, 플러그인 ID `com.haeunga0822.topping-e2x2`, 폴더 `com.haeunga0822.topping-e2x2.sdPlugin`, Author `김탄2`.
- Windows 10 이상, Stream Deck 앱 7.3 이상, `Nodejs.Version` `20`, `SDKVersion` 2 (토탈믹스 플러그인 manifest와 같다).
- USB 드라이버를 바꾸지 않는다. 공식 드라이버가 만든 HID 인터페이스 MI_04(VID `0x152A`, PID `0x8756`)만 쓴다. 토핑 앱과 동시에 동작해야 한다.
- 리포트 형식: `[00] 22 33 20 01 01 [그룹] [항목] [값 4바이트 빅엔디언] 00 00 66 77 00` (리포트 ID 포함 17바이트).
- 배율 값: `raw = round(10^(dB/20) × 0x02000000)`, 0 = 소리 없음, 위상 반전은 음수(2의 보수, 0dB 반전 = `0xFE000000`).
- 액션 이름에 "디지털 게인", "출력 컨트롤룸"을 쓴다. 나머지 설정 화면 문구는 영어(토탈믹스 플러그인과 같음).
- 한계 경고 문구와 권장 사용법(작업 공간 저장 → 다운로드 아이콘 → "Save the current workspace and download to the device" → 스트림덱 Workspace 불러오기)을 README 맨 앞과 모든 설정 화면 위쪽에 넣는다.
- 화면 모양은 토핑 앱 스타일(`docs/images/download-to-device.png`, 색 `#1F1F1F` `#2D2D2D` `#4261C0` `#73CB67` `#D8D8D8`). 화면 작업 태스크는 frontend-design 스킬을 쓴다.
- 커밋은 사용자가 요청할 때만 한다. 아래 "Commit" 단계는 사용자가 허락한 뒤에만 실행한다.
- 번들할 때마다 이 플러그인만 다시 시작하고 시작 시간을 확인한다(`streamdeck restart com.haeunga0822.topping-e2x2`).

## Review Focus
1. **장치가 없거나 빠졌다 다시 꽂힘:** 키는 오프라인 표시로 바뀌고 플러그인은 죽지 않으며, 다시 꽂으면 5초 안에 재연결하고 현재 상태 전체를 한 번 보낸다. → Task 6 테스트 `reconnects and resends full state`.
2. **작업 공간 파일이 없음/깨짐/저장 중:** 이전 상태를 유지하고 오류만 기록한다. → Task 4 테스트 `keeps previous state when the file is broken`.
3. **Mute 중에 페이더를 움직임:** 장치에는 계속 0이 가고, Mute를 풀면 최신 페이더 값이 간다. → Task 3 테스트 `fader change while muted restores the new value`.
4. **한 Mix에서 여러 채널 Solo:** Solo된 채널들만 들리고, 마지막 Solo를 풀면 Mix 전체가 원래대로 돌아간다. → Task 3 테스트 `two solos keep both audible`.
5. **입력 Ø와 Mute를 같이 켬:** 배율은 0. Mute를 풀면 음수(반전) 값으로 돌아간다. → Task 3 테스트 `phase survives mute`.

---

### Task 1: 저장소 뼈대

**Files:**
- Create: `package.json`, `tsconfig.json`, `rollup.config.mjs`, `.gitignore`, `com.haeunga0822.topping-e2x2.sdPlugin/manifest.json`(액션 없이), `com.haeunga0822.topping-e2x2.sdPlugin/ui/sdpi-components.js`, `com.haeunga0822.topping-e2x2.sdPlugin/layouts/strip.json`, `src/plugin.ts`(빈 연결), `src/runtime/hold.ts`, `src/runtime/redraw.ts`, `src/render/svg.ts`, `src/actions/common.ts`(`num`, `int`, `pick`만)
- Test: `test/runtime.test.mjs`(토탈믹스의 hold/redraw 테스트만 옮김)

토탈믹스 저장소에서 위 파일을 복사하고 이름만 바꾼다. `package.json`은 이름 `streamdeck-topping-e2x2`, 버전 `0.1.0`, 스크립트는 토탈믹스와 같고 플러그인 ID만 바꾼다. 의존성에 `node-hid`를 더한다. rollup은 `node-hid`를 `external`로 두고, `pack` 스크립트가 `node_modules/node-hid`(와 그 의존성)를 `*.sdPlugin/bin/node_modules/`에 복사한 뒤 `streamdeck pack`을 실행한다. `git init` 한다.

- [ ] Step 1: 파일 복사·이름 변경, `npm install`
- [ ] Step 2: `npm test` → 옮긴 테스트 PASS
- [ ] Step 3: `npm run bundle` → `bin/plugin.js` 생성, 오류 없음
- [ ] Step 4: Commit `chore: scaffold the TOPPING E2x2 plugin`

### Task 2: 리포트와 배율 (프로토콜)

**Files:**
- Create: `src/protocol/report.ts`, `src/model/e2x2.ts`
- Test: `test/report.test.mjs`

**Interfaces:**
- Produces:
  - `type Report = { group: number; item: number; value: number }` (value는 부호 있는 32비트)
  - `encodeReport(r: Report): Buffer` → 17바이트
  - `decodeReport(buf: Buffer): Report | undefined` (머리 `22 33 20 01 01`과 꼬리 `66 77`이 아니면 undefined)
  - `dbToRaw(db: number): number`, `rawToDb(raw: number): number` (0 → `-Infinity`)
  - `e2x2.ts`: `MIX_GROUPS = [[0x61,0x62],[0x63,0x64],[0x65,0x66],[0x67,0x68]]`, `MIX_INPUTS`(`in1`=1, `in2`=2, `otg`=[3,4], `pb12`=[5,6], `pb34`=[7,8], `pb56`=[9,10], `pb78`=[11,12]), `INPUT_GROUPS`(`in1`=0x21, `mobile`=0x22, `in2`=0x23, `in4`=0x24; 항목 `mon`=1, `p48v`=2, `inst`=3, `gain`=5), `OUTPUTS`(`out12`={vol:[0x31,0x32], source:0x35, gain:0x35/2}, `mobile`={vol:[0x33,0x34], source:0x36, gain:0x36/2}, `spdif`={vol:[0x5A,0x5B], source:0x5C}), `PHONES = { hp: [0x37,1], trs: [0x37,3], aux: [0x37,5] }`, `LOOPBACKS`(lp12={vol:[0x51,0x52], source:0x57}, lp34={vol:[0x53,0x54], source:0x58}, lp56={vol:[0x55,0x56], source:0x59}), `SOURCES`(`docs/usb-protocol.md` 소스 번호 표 그대로: mixA=0x0B … pb78=0x0A), `START = { group: 0x11, item: 1, value: 1 }`.

- [ ] Step 1: 실패하는 테스트
  - `encodeReport({group:0x61,item:5,value:0x01C851F8})` = `00 22 33 20 01 01 61 05 01 C8 51 F8 00 00 66 77 00`
  - `dbToRaw(0)` = `0x02000000`, `dbToRaw(-1)` = `0x01C851F8`(±2), `dbToRaw(-3)` = `0x016A77CC`(±2)
  - `encodeReport({group:0x23,item:5,value:-0x02000000})`의 값 바이트 = `FE 00 00 00`
  - `decodeReport`(`test/fixtures/app-startup-reports.tsv` 모든 줄) → 모두 성공, 다시 `encodeReport` 하면 원래 바이트와 같음
- [ ] Step 2: `npm test` → FAIL
- [ ] Step 3: 구현
- [ ] Step 4: `npm test` → PASS
- [ ] Step 5: Commit `feat: encode E2x2 HID reports and gain values`

### Task 3: 믹서 상태와 교차점 계산

**Files:**
- Create: `src/state/mixer-state.ts`, `src/state/crosspoints.ts`
- Test: `test/mixer-state.test.mjs`

**Interfaces:**
- Consumes: Task 2 `Report`, `e2x2.ts` 상수
- Produces:
  - `MixerState`(JSON으로 직렬화 가능한 순수 데이터): `mixes[4].channels[ch]` = `{ volL, volR, panL, panR, muteL, muteR, soloL, soloR, phaseL, phaseR, link }` (vol은 raw 배율, pan은 0~1, 0.5 가운데), `inputs[id]` = `{ gain, mute, phase, p48v, inst, mon }`, `outputs[id]` = `{ volL, volR, muteL, muteR, link, source, gainBtn? }`, `phones` = `{ hp, trs, aux }`, `loopbacks[id]` = `{ volL, volR, muteL, muteR, link, source }`
  - `emptyState(): MixerState`
  - `stateReports(s: MixerState): Report[]` → 앱 시작 때와 같은 순서와 같은 항목(`app-startup-reports.tsv`에서 `11 01`을 뺀 138개)
  - `diffReports(prev: MixerState, next: MixerState): Report[]` → 값이 바뀐 리포트만
  - `mixReports(s, mix: number): Report[]` → 그 Mix의 교차점 24개
- 규칙(`docs/usb-protocol.md`에서 관찰한 것):
  - 모노 입력: L몫 = vol × (1 − pan), R몫 = vol × pan (pan 0.5 → 각 v/2)
  - 스테레오 채널은 언제나 모노 두 개(L 채널, R 채널)로 계산한다. 각 채널이 자기 pan으로 모노 규칙을 쓴다. LINK 켜짐의 기본 pan은 L 채널 0, R 채널 1(관찰값: `61 05`=v, `62 05`=0, `61 06`=0, `62 06`=v). LINK를 끄면 앱처럼 두 pan을 0.5로 바꾼다. 다시 켜면 0과 1로 되돌린다(3차 기록 `160.90`~`173.84`).
  - Solo는 Mix 채널과 입력에만 있다(토핑 앱과 같음). Solo 설정 화면에서는 루프백·출력 대상을 고를 수 없게 한다.
  - Mute(채널/한쪽) → 그 채널의 몫 0. Solo가 하나라도 있으면 Solo 아닌 채널 몫 0.
  - Ø → 그 채널 몫의 부호 반전.
  - 입력 배율 `2x 05` = mute ? 0 : (phase ? −1 : 1) × gain.
  - 출력/루프백 mute → 볼륨 리포트 0.

- [ ] Step 1: 실패하는 테스트
  - `fader change while muted restores the new value`: mute 켜고 volL을 바꾸면 `diffReports`의 해당 교차점 값 0, mute 끄면 새 volL
  - `two solos keep both audible`: Mix A에서 pb12, pb34 Solo → in1 몫 0, pb12·pb34 몫은 원래 값. 하나 풀면 나머지 Solo 유지, 다 풀면 전체 원래 값
  - `phase survives mute`: in2 phase+mute → `23 05` = 0, mute 해제 → `-gain`
  - `link off splits a stereo pair into two centred monos`: pb12 LINK 끔 → `61 05` = `62 05` = v/2 (3차 기록 `167.03` 값 `00FFFFF0`와 같음)
  - `mono pan left`: in1 pan 0 → `61 01` = v, `62 01` = 0
- [ ] Step 2: FAIL 확인
- [ ] Step 3: 구현
- [ ] Step 4: PASS 확인
- [ ] Step 5: Commit `feat: model the E2x2 mixer and compute crosspoints`

### Task 4: 작업 공간 파일 읽기·쓰기·감시

**Files:**
- Create: `src/workspace/tpwork.ts`, `src/workspace/watch.ts`
- Test: `test/workspace.test.mjs` (fixture: `test/fixtures/workspace.TPwork`, `test/fixtures/app-startup-reports.tsv`)

**Interfaces:**
- Produces:
  - `WORKSPACE_DIR = 'C:\\Program Files\\TOPPING Pro\\TOPPING Professional Control Center'`
  - `parseWorkspace(json: string): MixerState` (필드 이름은 `docs/usb-protocol.md`의 작업 공간 절과 fixture 참고: `MixSaveA~D.MixParmeter_N.*`, `IN1~IN4`, `OUT12/34/56`, `Loopback12/34/56`, `ChannelOUT_mode`, `*_volume_*num`)
  - `writeWorkspace(s: MixerState, template: string): string` (템플릿의 모르는 필드는 그대로 둔다)
  - `currentWorkspacePath(dir = WORKSPACE_DIR): string | undefined` (`sound_card_workspace_file.TPconfig`의 `LastWorkspaceOpened_E2x2_OTG` → `E2X2_OTG/E2X2_OTG_<이름>.TPwork`)
  - `listWorkspaces(dir = WORKSPACE_DIR): string[]` (Workspace 키 설정 목록용, 이름만)
  - `watchWorkspace(onState: (s: MixerState) => void, deps?): () => void` (`fs.watch` + 300ms 대기 후 읽기, 깨진 파일은 무시)

- [ ] Step 1: 실패하는 테스트
  - `workspace reproduces the app startup reports`: `stateReports(parseWorkspace(fixture))` = fixture tsv(`11 01` 제외)의 그룹·항목·값과 순서까지 같음. **이 테스트가 Task 3·4의 필드 해석을 검증하는 기준이다.**
  - `round trip`: `parseWorkspace(writeWorkspace(parseWorkspace(f), f))` = `parseWorkspace(f)`
  - `keeps previous state when the file is broken`: 반쯤 잘린 JSON을 감시 중에 쓰면 `onState`가 불리지 않음
- [ ] Step 2: FAIL 확인
- [ ] Step 3: 구현
- [ ] Step 4: PASS 확인
- [ ] Step 5: Commit `feat: read, write and watch TOPPING workspaces`

### Task 5: 레벨미터 해석 (장치 필요)

**Files:**
- Create: `src/protocol/meter.ts`, `test/fixtures/meter-calibration.tsv`
- Test: `test/meter.test.mjs`

**Interfaces:**
- Produces: `parseMeter(r: Report): { channel: MeterChannel; level: number } | undefined` (level 0~1, 미터 막대 높이), `type MeterChannel` (코드 → 채널 이름 표)
- 알려진 것: 입력 리포트 그룹/항목 코드 `5A 02`, `5B 02`, `31 01`, `32 01`, `33 01`(2회), `31 02`, `32 02`, `33 02`, `34 02`, `41 01`, `42 01`, 약 68ms 주기, 값은 `FF FF FF` 다음 3바이트. 토핑 앱이 켜져 있을 때만 오는 것으로 보임.

- [ ] Step 1: **사용자와 함께** 보정 기록: (a) 소리 없음 (b) Playback 1/2에 −20dBFS 사인파 (c) 0dBFS 사인파 (d) IN 1 입력. 각 10초씩 입력 리포트를 기록해 `meter-calibration.tsv`로 저장한다. 앱을 껐을 때도 미터가 오는지 확인하고, 안 오면 앱 시작 기록(`app-startup-reports.tsv`)과 출력 리포트를 다시 보고 미터 요청 명령을 찾는다.
- [ ] Step 2: 보정 값으로 실패하는 테스트(채널 대응, 소리 없음 → 0, −20dBFS → 해당 막대 높이)
- [ ] Step 3: 구현, `docs/usb-protocol.md`에 해석 추가
- [ ] Step 4: PASS 확인
- [ ] Step 5: Commit `feat: decode E2x2 level meters`

### Task 6: 장치 연결 (HID)

**Files:**
- Create: `src/usb/hid-device.ts`, `src/connection.ts`
- Test: `test/connection.test.mjs`

**Interfaces:**
- Consumes: Task 2~5
- Produces:
  - `interface HidPort { write(buf: Buffer): void; onData(cb: (buf: Buffer) => void): void; close(): void }`
  - `openE2x2(): HidPort | undefined` (node-hid로 VID/PID와 `interface === 4`인 장치를 공유 모드로 연다)
  - `class E2x2Connection` — `state: MixerState`, `online: boolean`, `meters: Map<MeterChannel, number>`, `onChange(cb): () => void`, `update(mutator: (s: MixerState) => void): void`(바뀐 리포트만 보냄), `loadState(s: MixerState): void`(전체를 보냄), `start(): void`, `stop(): void`. 생성자 deps: `open?: () => HidPort | undefined`, `setInterval?`, `now?` (토탈믹스 `TotalMixConnection`과 같은 주입 방식)
  - 보내기는 1ms 이상 간격으로 줄 세운다(앱도 약 2ms 간격으로 보냄).
- 시작 순서: 연결 → `watchWorkspace`로 받은 상태를 `state`로 둔다(장치에는 보내지 않는다. 장치는 이미 앱이 보낸 값을 갖고 있다).

- [ ] Step 1: 실패하는 테스트(가짜 `HidPort`)
  - `sends only changed crosspoints`
  - `reconnects and resends full state`: open이 undefined → online false, 5초 뒤 성공 → online true, `stateReports` 전체 전송
  - `write error marks offline without throwing`
- [ ] Step 2~4: FAIL → 구현 → PASS
- [ ] Step 5: 실제 장치 확인: `node -e`로 연결해 Mix A PB 1/2를 3초 Mute했다가 풀고, 사용자에게 소리가 끊겼는지 확인받는다
- [ ] Step 6: Commit `feat: connect to the E2x2 over HID`

### Task 7: 토핑 스타일 그리기 (frontend-design 스킬 사용)

**Files:**
- Create: `src/render/theme.ts`, `src/render/keys.ts`, `src/render/meter.ts`
- Test: `test/render.test.mjs` (토탈믹스처럼 `test/out/*.svg`로 저장해서 눈으로 확인)

**Interfaces:**
- Produces: `renderToggleKey(v: { label: string; zone: string; on: boolean; color: 'blue'|'red'|'yellow'|'green' }): string`, `renderValueKey(v: { name: string; value: string; sub?: string }): string`, `renderVuStrip(v: MeterView): string`(다이얼 200×100), `renderButtonFader(v: MeterView, role: 'top'|'bottom'): string`, `renderSourceKey(v: { target: string; source: string }): string`, `MeterView = { name, left, right, fader, faderDb, muted, overlay }`
- 모양: 스펙 "화면 모양" 절. 미터는 가는 L/R 막대와 눈금 0/−6/−12/−24/−∞, 이름은 위쪽 회색 이름표, 켜진 버튼 `#4261C0`, 선택 Mix 글자 `#73CB67`.

- [ ] Step 1: frontend-design 스킬로 키 5종의 모양을 정하고, 사용자에게 SVG 견본을 보여 확인받는다
- [ ] Step 2: 실패하는 테스트(각 렌더러가 `<svg`로 시작, muted면 회색 막대, `on`이면 `#4261C0` 포함, 미터 높이가 level에 비례)
- [ ] Step 3~4: 구현 → PASS
- [ ] Step 5: Commit `feat: draw keys in the TOPPING app style`

### Task 8: 대상 고르기와 공통 액션 기반

**Files:**
- Create: `src/actions/target.ts`, `src/runtime/base-action.ts`(토탈믹스 것을 `E2x2Connection`용으로 고침)
- Test: `test/target.test.mjs`

**Interfaces:**
- Produces:
  - `type Target = { kind: 'mix'; mix: 0|1|2|3; channel: MixChannelId; side: 'pair'|'L'|'R' } | { kind: 'loopback'; id: 'lp12'|'lp34'|'lp56'; side } | { kind: 'output'; id: 'out12'|'mobile'|'spdif'; side }`
  - `targetOf(settings: JsonObject): Target | undefined` (설정 키: `kind`, `mix`, `channel`, `side`)
  - `targetName(t: Target): string` (예: `Mix B · PB 1/2`)
  - `E2x2Action<S>` — 토탈믹스 `TotalMixAction`과 같은 생명주기, `render(settings, ctx)`, `keyState(settings)`
- `side`가 `L`/`R`인데 그 채널이 LINK 켜짐이면 `pair`처럼 동작한다.

- [ ] Step 1~4: 테스트(`targetOf` 잘못된 값 → undefined, side 규칙) → 구현 → PASS
- [ ] Step 5: Commit `feat: add target selection shared by all actions`

### Task 9: 켜기/끄기 액션 (Mute, Solo, Input option, LINK, 출력 컨트롤룸)

**Files:**
- Create: `src/actions/toggles.ts`, `com.haeunga0822.topping-e2x2.sdPlugin/ui/toggle.html`, `ui/common.js`(경고 문구 포함)
- Modify: `manifest.json`, `src/plugin.ts`
- Test: `test/actions-toggles.test.mjs`

**Interfaces:**
- UUID: `com.haeunga0822.topping-e2x2.mute`, `.solo`, `.input-option`(설정 `option`: `p48v`/`inst`/`phase`, `input`: `in1`/`in2`/`mobile`), `.link`(mix + channel), `.output-room`(설정 `button`: `gain`/`hp`/`trs`/`aux`, `output`: `out12`/`mobile`)
- 동작 설정 `op`: `toggle`(기본)/`on`/`off` (토탈믹스와 같음). 48V는 설정 화면에 경고 문구.

- [ ] Step 1~4: 테스트(키 누름 → `connection.update`가 맞는 필드를 바꾸고, 가짜 포트로 기대 리포트가 나감) → 구현 → PASS
- [ ] Step 5: Commit `feat: add mute, solo, input option, link and output room keys`

### Task 10: 볼륨 액션 (페이더, 페이더(2버튼), VU 다이얼, Pan, Pan 다이얼, 디지털 게인, 디지털 게인 다이얼)

**Files:**
- Create: `src/actions/faders.ts`, `src/actions/gain.ts`, `ui/fader.html`, `ui/vu-dial.html`, `ui/gain.html`
- Modify: `manifest.json`, `src/plugin.ts`
- Test: `test/actions-faders.test.mjs`

**Interfaces:**
- UUID: `.fader`(설정 `mode`: `set`/`step`, `db`, `step`), `.button-fader`(`role`: `top`/`bottom`), `.vu-dial`(돌리기 = step dB, 누르기 = Mute, 토탈믹스 VU Dial의 누르기/누른 채 돌리기 설정 포함), `.pan`, `.pan-dial`(mix 대상만), `.gain`, `.gain-dial`(입력 `in1`/`in2`/`mobile`)
- 볼륨 범위: −∞ ~ +6dB로 시작하고, Task 4 fixture에서 실제 최대값을 확인해 맞춘다. 누르고 있으면 반복은 `hold()` 그대로.

- [ ] Step 1~4: 테스트(step +1dB → 기대 raw, 최대값에서 멈춤, VU 다이얼이 meters 값을 그림) → 구현 → PASS
- [ ] Step 5: Commit `feat: add fader, dial, pan and digital gain actions`

### Task 11: 소스 선택과 Workspace 키

**Files:**
- Create: `src/actions/source.ts`, `src/actions/workspace.ts`, `ui/source.html`, `ui/workspace.html`
- Modify: `manifest.json`, `src/plugin.ts`
- Test: `test/actions-source.test.mjs`, `test/actions-workspace.test.mjs`

**Interfaces:**
- `.source`: 설정 `target`(lp12/lp34/lp56/out12/mobile/spdif), `mode`(`cycleMix`/`cycleList`/`toggle`), `list`(소스 id 배열, `SOURCES` 키), 키에 현재 소스 이름 표시
- `.workspace`: 설정 `mode`(`load`/`save`), `name`(load: `listWorkspaces()`에서 고름 / save: 저장할 이름, 앱이 지금 쓰는 파일 이름이면 거부하고 경고)
  - load: `connection.loadState(parseWorkspace(파일))`
  - save: `writeWorkspace(connection.state, 현재 작업 공간 파일 내용)`을 `E2X2_OTG/E2X2_OTG_<name>.TPwork`로 저장

- [ ] Step 1~4: 테스트(cycleMix A→B→C→D→A, cycleList는 고른 것만, toggle 두 개, save가 앱 사용 중 파일을 덮어쓰지 않음) → 구현 → PASS
- [ ] Step 5: Commit `feat: add source select and workspace keys`

### Task 12: README, 경고 문구, 패키지, 실제 장치 확인

**Files:**
- Create: `README.md`(한국어), `THIRD-PARTY-NOTICES.txt`(node-hid 포함)
- Modify: 모든 `ui/*.html` 위쪽 경고(`common.js`에서 한 번에)

- [ ] Step 1: README 맨 앞에 한계 경고와 권장 사용법 4단계, 스크린샷 `docs/images/download-to-device.png`(빨간 표시)
- [ ] Step 2: `npm test` 전체 PASS, `npm run pack` → `com.haeunga0822.topping-e2x2.streamDeckPlugin`
- [ ] Step 3: 설치 후 `streamdeck restart com.haeunga0822.topping-e2x2`, 로그에서 시작 시간과 "connected" 확인
- [ ] Step 4: 사용자와 실제 확인 목록: Mix B PB 1/2 페이더, OUT 1/2 마스터, Mobile OUT 소스 cycle, Loopback 1/2 소스 toggle, IN 1 Ø, Mute/Solo, LINK 끄고 L/R Pan, Workspace 불러오기, VU 다이얼 미터. 테스트 요청에는 파일 전체 경로를 적고 폴더를 탐색기로 연다
- [ ] Step 5: 배포 zip은 버전 이름(`v0.1.0`)으로, 사용자가 버전을 정한다
- [ ] Step 6: Commit `docs: explain the TOPPING app limits and recommended workflow`
