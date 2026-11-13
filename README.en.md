# Controller for TOPPING E2x2 OTG (Stream Deck plugin)

[한국어](README.md) | **English** | [日本語](README.ja.md)

A plugin that controls the **TOPPING E2x2 OTG** mixer with the keys and dials of an Elgato Stream Deck. It talks to the device directly over USB (HID). You choose a Mix and a channel for each key, and the key moves only that target, whichever Mix the TOPPING app happens to be showing.

## Download

Get `TOPPING-E2x2-OTG-StreamDeck-v<version>.zip` from the [latest release](https://github.com/KimTaehan0822/streamdeck-TOPPING-E2x2-OTG-Controller/releases/latest) page and unzip it. It contains:

- `TOPPING-E2x2-OTG.streamDeckPlugin`: the installer
- Manual PDFs, one per language
  - `Controller for TOPPING E2x2 OTG 스트림덱 플러그인 사용설명서.pdf`: Korean
  - `Controller for TOPPING E2x2 OTG Stream Deck Plugin Manual (English).pdf`: English
  - `Controller for TOPPING E2x2 OTG Stream Deck プラグイン 取扱説明書 (日本語).pdf`: Japanese
- `LICENSE.txt`: this plugin's license (MIT)
- `THIRD-PARTY-NOTICES.txt`: notices for the open source it uses

## Please read this first (limitation)

**Values changed by this plugin are not shown on the TOPPING app screen, and the app can overwrite them again.**

The device does not report its current mixer values. So the plugin keeps the mixer values itself, and reads the TOPPING app's workspace file (`.TPwork`) at start-up and whenever that file changes to stay in sync. When you change the Mix view in the app or restart the app, the app sends the values it remembers back to the device.

### Recommended workflow (4 steps)

1. In the TOPPING app, set the volumes you want and **save the workspace**.
2. At the top of the app, click the **download icon** to the right of the workspace name.
3. Choose **"Save the current workspace and download to the device"** and click **OK**. The workspace is saved and also written to the device.

   ![The download window: the red mark shows the item to choose](docs/images/download-to-device.png)

4. In Stream Deck, press a **Workspace load key** to load that workspace. Now the device and the plugin hold the same values.

After that, use Stream Deck as your main control. If you change values in the app again, do steps 1 to 4 once more.

## Requirements

- Windows 10 or later
- Stream Deck software 7.3 or later
- A TOPPING E2x2 OTG with the **official TOPPING driver** (the driver is not changed)
- You can keep the TOPPING app installed or running. This plugin shares the device with the app.
- The dial actions need a Stream Deck +. The key actions work on every Stream Deck.

## Installation

Double-click `TOPPING-E2x2-OTG.streamDeckPlugin` and approve when the Stream Deck software asks to install it. The action list then gets a **Controller for TOPPING E2x2 OTG** category. The settings screens come in Korean, English and Japanese: choose the language with **Language** at the top of the screen (it applies to every action). The limitation warning above is always shown at the very top.

## Actions

| Action | What it does |
| --- | --- |
| Mute | Turns mute on/off for the target |
| Solo | Turns solo on/off for a Mix channel |
| Input option (48V, INST, Ø) | 48V, INST and Ø (phase invert) for IN 1, IN 2 and Mobile |
| LINK | Links or unlinks a stereo channel, per Mix |
| 출력 컨트롤룸 (output control room) | The output gain button, and the monitor HP / TRS / AUX on/off buttons |
| Fader | Sets the volume to a fixed value, or raises and lowers it step by step |
| Button fader (2 keys) | Two keys (top/bottom or left/right) raise and lower the volume (hold to repeat) |
| VU dial | Turn for volume, press for mute, and it shows a level meter |
| Pan | Pan of a Mix channel (key) |
| Pan dial | Pan of a Mix channel (dial, press to center) |
| 디지털 게인 (digital gain) | Digital gain of an input (key) |
| 디지털 게인 다이얼 (digital gain dial) | Digital gain of an input (dial, press to mute the input) |
| Source select | Chooses what is sent to the loopbacks and outputs (OUT 1/2, Mobile OUT, S/PDIF OUT) |
| Workspace load/save | Loads a workspace file, or saves the current values as a new workspace file and, if chosen, stores them on the device (kept after power off; on by default) |

The action names 출력 컨트롤룸, 디지털 게인 and 디지털 게인 다이얼 are shown in Korean in the Stream Deck action list in every language.

For Fader, Button fader, VU dial and Mute, the target is one of a **Mix channel** (a channel of Mix A to D), a **loopback** or an **output**. When LINK is off, a stereo channel becomes two channels, L and R, and the Mute, Solo and Pan keys let you choose the whole pair / L / R as the target.

Source select has three ways to work: cycle the Mix A → B → C → D, cycle through the candidates you choose, or toggle between two candidates.

Saving a workspace never overwrites the file the TOPPING app is currently using (the app writes its own values over it when it closes). The plugin saves under a new name, and you can open it from the app's workspace list. The plugin reads the TOPPING app's log to know which workspace the app has open, so it refuses that name, and a workspace you load in the app shows on the keys within a few seconds. The app lists a newly saved workspace after it is restarted. A replaced workspace is kept in the same folder as the hidden backup `.E2X2_OTG_<name>.TPwork.bak`.

## Level meters

- A meter moves **only while sound is playing**.
- There is one meter per channel. A Mix channel key (Playback) shows that channel's own meter, a loopback shows the loopback's meter, and an output shows the output's meter.
- The meter code for OTG is not known yet, so its bar stays empty.
- The volume key, the 2-key fader and the VU dial do not let you pick L or R: they always act on both sides (the pair).
- Every channel key shows the text you type in its **Name** field (empty means the default name, 24 characters at most).

## Known limitations

- **Solo** on an input has no effect on the device.
- Volume goes up to **+12 dB** and digital gain runs **0 to +20 dB**, and **Pan while LINK is on** works like the TOPPING app; all three were checked on the device.
- For **48V**, the settings screen only shows a warning when you pick it. Pressing the key turns it on right away, so be careful not to turn it on with a non-condenser microphone or other equipment connected.
- This plugin does not change the device's USB driver. It only uses HID communication that the official driver allows.

## Development

```
npm install
npm test          # build, then run all tests
npm run pack      # create com.haeunga0822.topping-e2x2.streamDeckPlugin
node docs/manual/make-pdf.mjs   # manual PDFs (needs Edge and Noto Sans KR/JP)
```

The USB protocol analysis is in [docs/usb-protocol.md](docs/usb-protocol.md), and the design is in `docs/superpowers/specs/`. Notices for the open-source software used are in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).
