# TOPPING E2x2 OTG Controller (Stream Deck 플러그인)

Elgato Stream Deck의 키와 다이얼로 **TOPPING E2x2 OTG** 믹서를 조작하는 플러그인입니다. 장치와 USB(HID)로 직접 통신하며, 키마다 Mix와 채널을 정해 두면 토핑 앱 화면에 어떤 Mix가 떠 있든 정해 둔 대상만 움직입니다.

## 먼저 꼭 읽어 주세요 (한계)

**이 플러그인이 바꾼 값은 TOPPING 앱 화면에 보이지 않습니다. 그리고 앱이 그 값을 다시 덮어쓸 수 있습니다.**

장치는 현재 믹서 값을 돌려주지 않습니다. 그래서 플러그인은 믹서 값을 직접 기억하고, 시작할 때와 작업 공간 파일이 바뀔 때마다 TOPPING 앱의 작업 공간 파일(`.TPwork`)을 읽어 값을 맞춥니다. 앱에서 Mix 화면을 바꾸거나 앱을 다시 켜면, 앱은 자기가 기억하는 값으로 장치를 되돌립니다.

### 권장 사용법 (4단계)

1. TOPPING 앱에서 볼륨을 원하는 값으로 맞추고 **작업 공간(Workspace)을 저장**합니다.
2. 앱 위쪽에서 작업 공간 이름 오른쪽의 **다운로드 아이콘**을 누릅니다.
3. **"Save the current workspace and download to the device"** 를 고르고 **OK**를 누릅니다. 작업 공간이 저장되고 장치에도 기록됩니다.

   ![다운로드 창: 빨간 표시가 고를 항목입니다](docs/images/download-to-device.png)

4. Stream Deck에서 **Workspace 불러오기 키**를 눌러 그 작업 공간을 불러옵니다. 이렇게 하면 장치와 플러그인이 같은 값을 갖게 됩니다.

그다음부터는 Stream Deck을 주로 쓰면 됩니다. 앱에서 값을 다시 바꿨다면 1~4단계를 한 번 더 하세요.

## 필요한 것

- Windows 10 이상
- Stream Deck 소프트웨어 7.3 이상
- TOPPING E2x2 OTG와 **TOPPING 공식 드라이버** (드라이버는 바꾸지 않습니다)
- TOPPING 앱은 설치해 두거나 켜 둬도 됩니다. 이 플러그인은 앱과 같은 장치를 함께 씁니다.
- 다이얼 액션을 쓰려면 Stream Deck +가 필요합니다. 키 액션은 모든 Stream Deck에서 쓸 수 있습니다.

## 설치

`com.haeunga0822.topping-e2x2.streamDeckPlugin` 파일을 더블클릭하고, Stream Deck이 설치할지 물으면 승인합니다. 설치 후 액션 목록에 **TOPPING E2x2 OTG Controller** 카테고리가 생깁니다. 설정 화면의 문구는 영어이고, 화면 맨 위에는 위의 한계 경고가 항상 표시됩니다.

## 액션

| 액션 | 하는 일 |
| --- | --- |
| Mute | 대상의 음소거 켜기/끄기 |
| Solo | Mix 채널의 솔로 켜기/끄기 |
| Input option (48V, INST, Ø) | IN 1, IN 2, Mobile 입력의 48V, INST, Ø(위상 반전) |
| LINK | Mix별로 스테레오 채널 묶기/풀기 |
| 출력 컨트롤룸 | 출력 게인 버튼, 모니터 HP / TRS / AUX 켜기·끄기 |
| Fader | 볼륨을 정해 둔 값으로 맞추거나 한 단계씩 올리고 내리기 |
| Button fader (2 keys) | 키 두 개로 볼륨 올리기 / 내리기 (누르고 있으면 반복) |
| VU dial | 돌리면 볼륨, 누르면 Mute, 레벨미터 표시 |
| Pan | Mix 채널의 Pan (키) |
| Pan dial | Mix 채널의 Pan (다이얼, 누르면 가운데) |
| 디지털 게인 | 입력 디지털 게인 (키) |
| 디지털 게인 다이얼 | 입력 디지털 게인 (다이얼, 누르면 입력 음소거) |
| Source select | 루프백과 출력(OUT 1/2, Mobile OUT, S/PDIF OUT)에 보낼 소리 고르기 |
| Workspace load/save | 작업 공간 파일 불러오기 / 현재 값을 새 작업 공간 파일로 저장 |

Fader, Button fader, VU dial, Mute는 대상으로 **Mix 채널**(Mix A~D의 채널), **루프백**, **출력** 중 하나를 고릅니다. LINK를 끄면 스테레오 채널이 L/R 두 개가 되고, Mute·Solo·Pan 키는 대상에서 짝 전체 / L / R을 고를 수 있습니다.

Source select는 세 가지 방식이 있습니다: Mix를 A → B → C → D로 번갈아 가기, 고른 후보 안에서 번갈아 가기, 두 후보 사이 토글.

Workspace의 저장은 TOPPING 앱이 지금 쓰고 있는 파일을 덮어쓰지 않습니다(앱이 끌 때 자기 값으로 다시 덮어쓰기 때문). 다른 이름으로 새로 저장하고, 앱의 작업 공간 목록에서 열 수 있습니다.

## 레벨 미터

- 미터는 **소리가 나올 때만** 움직입니다.
- 미터는 채널마다 있습니다. Mix 채널 키(Playback)는 그 채널 자신의 미터, 루프백은 루프백의 미터, 출력은 출력의 미터를 보여 줍니다.
- IN 1/2와 OTG는 미터 코드를 아직 몰라서 막대가 비어 있습니다. Playback 5/6·7/8과 Loopback 3/4·5/6은 추정값이라 실제 장치에서 확인이 필요합니다.
- 볼륨 키, 2키 페이더, VU 다이얼은 L/R을 따로 고르지 않고 항상 양쪽(페어)에 동작합니다.
- 모든 채널 키는 **Name** 칸에 이름을 적으면 그 이름을 표시합니다(비우면 기본 이름, 최대 24자).

## 알려진 한계

- 입력의 **Solo**는 장치에서 아무 효과가 없습니다.
- 볼륨 최대값 **+6 dB**와 **LINK 상태의 Pan 곡선**은 실제 장치에서 아직 확인하지 못했습니다.
- **48V**는 켤 때 설정 화면에 경고만 표시합니다. 키를 누르면 바로 켜지므로, 콘덴서가 아닌 마이크나 장비를 연결한 채 켜지 않도록 주의하세요.
- 이 플러그인은 장치 USB 드라이버를 바꾸지 않습니다. 공식 드라이버로 열 수 있는 HID 통신만 씁니다.

## 개발

```
npm install
npm test          # 빌드 후 전체 테스트
npm run pack      # com.haeunga0822.topping-e2x2.streamDeckPlugin 만들기
```

USB 통신 분석 결과는 [docs/usb-protocol.md](docs/usb-protocol.md), 설계는 `docs/superpowers/specs/`에 있습니다. 함께 쓰인 오픈소스 고지는 [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)에 있습니다.
