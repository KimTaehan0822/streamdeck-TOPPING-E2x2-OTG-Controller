// Shared Property Inspector code. Every PI loads sdpi-components.js, then this file.
// It puts the sync limitation and the recommended workflow at the top of the screen, then the Language choice,
// and translates the screen (see TEXT below).
const NOTICE = `
<style>
	.notice { margin: 4px 0 12px; padding: 8px 10px; border-left: 3px solid #e2b23a; background: #2d2d2d; color: #d8d8d8; font-size: 9pt; line-height: 1.4; }
	.notice b { color: #e2b23a; }
	.notice details { margin-top: 6px; }
	.notice summary { cursor: pointer; color: #e2b23a; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; user-select: none; }
	.notice summary:hover { color: #ffd36a; }
	.notice ol { margin: 6px 0 0; padding-left: 18px; }
	.notice.danger { border-left-color: #e5483e; }
	.notice.danger b, .notice.danger summary { color: #e5483e; }
	.notice.danger details { margin-top: 0; }
	.notice.danger details > span { display: block; margin-top: 6px; }
</style>
<div class="notice">
	<b>Heads up:</b> <span>values changed from Stream Deck are not shown in the TOPPING app, and the app can overwrite them (it goes back to the values it remembers when you change the Mix view or restart it).</span>
	<details><summary>Recommended workflow</summary>
	<ol>
		<li><span>Use Stream Deck as your main control.</span> <b>(Important) This Stream Deck plugin and the TOPPING Control Center app do not sync with each other in real time.</b></li>
		<li><span>To make the TOPPING app show the same values, press a TOPPING app restart key in "Match TOPPING app settings" mode. Save and Load keys do it too while "Restart the TOPPING app to match" is on.</span> <b>The TOPPING app closes and opens again for 2-3 seconds, and changes not saved in the app are lost.</b></li>
		<li><span>Overwrote the wrong values? The restart key's "Undo to the previous version" mode puts back the version from before.</span></li>
		<li><span>Changed values in the TOPPING app itself? Save the workspace in the app, and the plugin reads it again.</span></li>
	</ol></details>
</div>
<sdpi-item label="Language"><sdpi-select setting="language" global default="auto">
<option value="auto">Same as Stream Deck</option><option value="en">English</option><option value="ko">한국어</option><option value="ja">日本語</option>
</sdpi-select></sdpi-item>`
document.body.insertAdjacentHTML('afterbegin', NOTICE)
for (const s of document.querySelectorAll('sdpi-select')) s.append(...s.querySelectorAll('option'))

// Settings screen language. Pages keep writing English; every label, placeholder, option, summary, bold lead-in,
// list item and span is swapped through this table as it lands on the page. Text missing here stays English
// (device channel names such as "MIX A" or "Out 1/2" are meant to). [Korean, Japanese]
const TEXT = {
	'Heads up:': ['알아 두세요:', 'ご注意:'],
	'values changed from Stream Deck are not shown in the TOPPING app, and the app can overwrite them (it goes back to the values it remembers when you change the Mix view or restart it).': [
		'Stream Deck에서 바꾼 값은 TOPPING 앱 화면에 보이지 않으며, 앱이 그 값을 다시 덮어쓸 수 있습니다. 앱에서 Mix 화면을 바꾸거나 앱을 다시 켜면, 앱이 기억하던 값으로 되돌아갑니다.',
		'Stream Deck で変更した値は TOPPING アプリの画面には表示されず、アプリに上書きされることがあります。アプリで Mix の画面を切り替えたり、アプリを再起動したりすると、アプリが覚えている値に戻ります。',
	],
	'Same as Stream Deck': ['Stream Deck과 같게', 'Stream Deck と同じ'],
	'Follow an output (the Mix it plays now)': ['출력이 듣는 Mix 따라가기', '出力が鳴らしている Mix に追従'],
	'Output to follow': ['따라갈 출력', '追従する出力'],
	'⚠ The Mix can change: the sound can suddenly get louder': ['⚠ Mix가 바뀌면 소리가 갑자기 커질 수 있습니다', '⚠ Mix が変わると音が急に大きくなることがあります'],
	'when this output switches to another Mix, the key acts on that Mix instead. Each Mix has its own levels, so the sound can suddenly get louder. Turn the volume down before switching, and listen with care. If the output plays something other than a Mix, the key shows NOT A MIX and does nothing.': [
		'이 출력이 다른 Mix로 바뀌면 이 키도 그 Mix를 조절합니다. Mix마다 볼륨이 달라 소리가 갑자기 커질 수 있습니다. 바꾸기 전에 볼륨을 낮추고, 들을 때 주의하세요. 출력이 Mix가 아닌 소리를 내보내고 있으면 키에 NOT A MIX가 뜨고 아무것도 하지 않습니다.',
		'この出力が別の Mix に切り替わると、キーもその Mix を操作します。Mix ごとに音量が違うため、音が急に大きくなることがあります。切り替える前に音量を下げ、聞くときは注意してください。出力が Mix 以外を鳴らしているときは、キーに NOT A MIX と表示され、何もしません。',
	],
	'Recommended workflow': ['권장 사용법', 'おすすめの手順'],
	'Use Stream Deck as your main control.': ['스트림덱 위주로 사용합니다.', 'Stream Deck を中心に使います。'],
	'(Important) This Stream Deck plugin and the TOPPING Control Center app do not sync with each other in real time.': ['(중요) 스트림덱 플러그인과 토핑 컨트롤 센터 앱은 서로 실시간 연동이 되지 않습니다.', '(重要) Stream Deck プラグインと TOPPING Control Center アプリは、お互いにリアルタイムでは連動しません。'],
	'To make the TOPPING app show the same values, press a TOPPING app restart key in "Match TOPPING app settings" mode. Save and Load keys do it too while "Restart the TOPPING app to match" is on.': [
		'TOPPING 앱 화면도 같은 값으로 맞추려면 "토핑 앱 다시 켜기" 키를 "토핑앱 설정 맞추기" 모드로 누릅니다. 저장·불러오기 키도 "토핑 앱 다시 켜서 맞추기"가 켜져 있으면 같은 일을 합니다.',
		'TOPPING アプリの画面も同じ値に合わせるには、「토핑 앱 다시 켜기」(TOPPING アプリ再起動) キーを「TOPPINGアプリの設定を合わせる」モードで押します。保存・読み込みキーも「TOPPINGアプリを再起動して合わせる」がオンなら同じことをします。',
	],
	'The TOPPING app closes and opens again for 2-3 seconds, and changes not saved in the app are lost.': [
		'이때 TOPPING 앱이 2~3초 꺼졌다 다시 켜지고, 앱에서 바꾸고 저장하지 않은 값은 사라집니다.',
		'このとき TOPPING アプリが 2〜3 秒止まってから起動し直し、アプリで変えて保存していない値は失われます。',
	],
	'Overwrote the wrong values? The restart key\'s "Undo to the previous version" mode puts back the version from before.': [
		'잘못 덮어썼다면 다시 켜기 키의 "직전으로 되돌리기" 모드로 바로 전 값을 되살립니다.',
		'間違えて上書きしたときは、再起動キーの「直前に戻す」モードで直前の値に戻せます。',
	],
	'Changed values in the TOPPING app itself? Save the workspace in the app, and the plugin reads it again.': [
		'TOPPING 앱에서 직접 값을 바꿨다면 앱에서 작업 공간을 저장하세요. 플러그인이 그 값을 다시 읽습니다.',
		'TOPPING アプリで直接値を変えたときは、アプリでワークスペースを保存してください。プラグインがその値を読み直します。',
	],
	'48V phantom power:': ['48V 팬텀 전원:', '48V ファンタム電源:'],
	'it can damage ribbon and some dynamic microphones, and it can pop speakers. Turn it on only with a condenser microphone connected, and turn the monitor level down first. The plugin sends it to the device straight away.': [
		'리본 마이크와 일부 다이내믹 마이크가 망가질 수 있고, 스피커에서 큰 "퍽" 소리가 날 수 있습니다. 콘덴서 마이크를 연결했을 때만 켜고, 켜기 전에 모니터 볼륨을 먼저 낮추세요. 플러그인은 이 설정을 장치에 바로 보냅니다.',
		'リボンマイクや一部のダイナミックマイクが壊れることがあり、スピーカーから大きなポップ音が出ることがあります。コンデンサーマイクを接続しているときだけオンにし、先にモニターの音量を下げてください。プラグインはこの設定をすぐにデバイスへ送ります。',
	],
	'Cannot save:': ['저장할 수 없습니다:', '保存できません:'],
	'Note:': ['참고:', 'お知らせ:'],
	'Invalid name: use 1-60 characters without \\ / : * ? " < > | or "..".': [
		'이름이 올바르지 않습니다. 1~60자로 쓰고, \\ / : * ? " < > | 와 ".." 는 쓸 수 없습니다.',
		'名前が正しくありません。1〜60文字で、\\ / : * ? " < > | と ".." は使えません。',
	],
	'The workspace file was saved, but the device is not connected, so the values were not stored on it.': [
		'작업 공간 파일은 저장했지만 장치가 연결되어 있지 않아 장치에는 기록하지 못했습니다.',
		'ワークスペースファイルは保存しましたが、デバイスが接続されていないため、デバイスには記録できませんでした。',
	],
	'The TOPPING app did not close, so it was not restarted.': ['TOPPING 앱이 닫히지 않아 다시 켜지 못했습니다.', 'TOPPING アプリが閉じなかったため、再起動できませんでした。'],
	'The TOPPING app is using this workspace. Pick another name.': ['TOPPING 앱이 이 작업 공간을 사용 중입니다. 다른 이름을 고르세요.', 'TOPPING アプリがこのワークスペースを使用中です。別の名前にしてください。'],
	'A workspace with this name exists. Pressing the key replaces it and keeps the old file as .E2X2_OTG_<name>.TPwork.bak.': [
		'같은 이름의 작업 공간이 이미 있습니다. 키를 누르면 덮어쓰고, 원래 파일은 .E2X2_OTG_<이름>.TPwork.bak 으로 남깁니다.',
		'同じ名前のワークスペースがすでにあります。キーを押すと上書きし、元のファイルは .E2X2_OTG_<名前>.TPwork.bak として残します。',
	],
	'No workspace is loaded yet. Open one in the TOPPING app or press a Workspace load key.': [
		'아직 불러온 작업 공간이 없습니다. TOPPING 앱에서 작업 공간을 열거나 Workspace 불러오기 키를 누르세요.',
		'まだワークスペースが読み込まれていません。TOPPING アプリでワークスペースを開くか、Workspace 読み込みキーを押してください。',
	],
	'No workspace is open in the TOPPING app to use as a template.': [
		'TOPPING 앱에 열려 있는 작업 공간이 없어서, 바탕(템플릿)으로 쓸 수 없습니다.',
		'TOPPING アプリで開いているワークスペースがないため、テンプレートに使えません。',
	],
	Language: ['언어', '言語'],
	Name: ['이름', '名前'],
	'Channel name': ['채널 이름', 'チャンネル名'],
	Select: ['선택', '選択'],
	'Select channel': ['채널 선택', 'チャンネルを選択'],
	Target: ['대상', '対象'],
	Channel: ['채널', 'チャンネル'],
	Side: ['좌/우', '左右'],
	'Mix channel': ['Mix 채널', 'Mix チャンネル'],
	Loopback: ['루프백', 'ループバック'],
	Output: ['출력', '出力'],
	Input: ['입력', '入力'],
	'Both (pair)': ['양쪽 (페어)', '両方 (ペア)'],
	'L only': ['L만', 'L のみ'],
	'R only': ['R만', 'R のみ'],
	Mode: ['모드', 'モード'],
	Step: ['단계 조절', 'ステップ調整'],
	Set: ['값으로 설정', '値に設定'],
	Role: ['키 역할', 'キーの役割'],
	'Top key (raises)': ['위 키 (올리기)', '上のキー (上げる)'],
	'Bottom key (lowers)': ['아래 키 (내리기)', '下のキー (下げる)'],
	'Left key (lowers)': ['왼쪽 키 (내리기)', '左のキー (下げる)'],
	'Right key (raises)': ['오른쪽 키 (올리기)', '右のキー (上げる)'],
	'Step (dB)': ['조절 단위 (dB)', '調整幅 (dB)'],
	'Step (dB, negative = down)': ['조절 단위 (dB, 음수 = 내리기)', '調整幅 (dB、負の数 = 下げる)'],
	'Step (%, negative = left)': ['조절 단위 (%, 음수 = 왼쪽)', '調整幅 (%、負の数 = 左)'],
	'Pan (-100 L .. 100 R)': ['팬 (-100 왼쪽 ~ 100 오른쪽)', 'パン (-100 左 ~ 100 右)'],
	'Level (dB, -60 or lower = silence, max +12)': ['볼륨 (dB, -60 이하 = 무음, 최대 +12)', '音量 (dB、-60 以下 = 無音、最大 +12)'],
	'Step per tick (dB)': ['한 칸당 (dB)', '1クリックごと (dB)'],
	'Step per tick (%)': ['한 칸당 (%)', '1クリックごと (%)'],
	'Gain (dB, 0 to +20)': ['게인 (dB, 0 ~ +20)', 'ゲイン (dB、0 〜 +20)'],
	'Cycle MIX A-D': ['MIX A~D 번갈아 선택', 'MIX A〜D を順に切り替え'],
	'Cycle chosen sources': ['고른 소스 안에서 번갈아 선택', '選んだソースを順に切り替え'],
	'Toggle between two': ['두 소스 사이 토글', '2つのソースを切り替え'],
	Sources: ['소스 목록', 'ソース'],
	'Source 1': ['소스 1', 'ソース 1'],
	'Source 2': ['소스 2', 'ソース 2'],
	Operation: ['동작', '動作'],
	Toggle: ['토글', 'トグル'],
	On: ['켜기', 'オン'],
	Off: ['끄기', 'オフ'],
	Option: ['옵션', 'オプション'],
	'Ø (phase invert)': ['Ø (위상 반전)', 'Ø (位相反転)'],
	Button: ['버튼', 'ボタン'],
	Gain: ['게인', 'ゲイン'],
	'Headphone gain': ['헤드폰 게인', 'ヘッドホンゲイン'],
	Press: ['누르기', '押す'],
	'Press + turn left': ['누른 채 왼쪽으로', '押しながら左に回す'],
	'Press + turn right': ['누른 채 오른쪽으로', '押しながら右に回す'],
	'Press actions': ['누르기 동작', '押したときの動作'],
	'Mute toggle': ['음소거 토글', 'ミュート切り替え'],
	'Mute on': ['음소거 켜기', 'ミュート オン'],
	'Mute off': ['음소거 끄기', 'ミュート オフ'],
	'Step level': ['볼륨 조절', '音量を調整'],
	'Recall level': ['지정 볼륨으로 복귀', '指定の音量に戻す'],
	'Recall level (dB)': ['복귀 볼륨 (dB)', '戻す音量 (dB)'],
	'e.g. -20 or 0': ['예: -20 또는 0', '例: -20 または 0'],
	'Touch tap mutes': ['화면 터치로 음소거', 'タッチでミュート'],
	'Also store on the device': ['장치에도 기록', 'デバイスにも記録'],
	'Restart the TOPPING app to match': ['토핑 앱 다시 켜서 맞추기', 'TOPPINGアプリを再起動して合わせる'],
	'Match TOPPING app settings': ['토핑앱 설정 맞추기', 'TOPPINGアプリの設定を合わせる'],
	'Restart TOPPING app': ['토핑앱 재실행', 'TOPPINGアプリを再起動'],
	'Undo to the previous version': ['직전으로 되돌리기', '直前に戻す'],
	'Puts back the version of the open workspace from before the last save, then restarts the TOPPING app with it. Press again to return to the newer version.': [
		'열린 작업 공간을 마지막 저장 바로 전 값으로 되돌린 뒤, 그 값으로 TOPPING 앱을 다시 켭니다. 한 번 더 누르면 새 값으로 돌아갑니다.',
		'開いているワークスペースを最後の保存の直前の値に戻し、その値で TOPPING アプリを再起動します。もう一度押すと新しい値に戻ります。',
	],
	'Overwrites the workspace:': ['작업 공간을 덮어씁니다:', 'ワークスペースを上書きします:'],
	'the values saved in the workspace the app has open are replaced by the Stream Deck values. Only the version just before is kept as a backup, and the "Undo to the previous version" mode can put it back.': [
		'앱이 열고 있는 작업 공간에 저장된 값이 스트림덱 값으로 바뀝니다. 바로 전 값 하나만 백업으로 남고, "직전으로 되돌리기" 모드로 되살릴 수 있습니다.',
		'アプリが開いているワークスペースに保存された値が Stream Deck の値に置き換わります。直前の値ひとつだけがバックアップとして残り、「直前に戻す」モードで元に戻せます。',
	],
	'No earlier version of this workspace is saved.': ['이 작업 공간의 이전 값이 저장되어 있지 않습니다.', 'このワークスペースの以前の値は保存されていません。'],
	'Saves the Stream Deck values into the workspace the TOPPING app has open, then restarts the app with it.': [
		'스트림덱 값을 TOPPING 앱이 열고 있는 작업 공간에 저장한 뒤, 그 작업 공간으로 앱을 다시 켭니다.',
		'Stream Deck の値を TOPPING アプリが開いているワークスペースに保存し、そのワークスペースでアプリを再起動します。',
	],
	'Restarts the TOPPING app without saving. The app sends its saved workspace to the device, and the keys follow it.': [
		'저장하지 않고 TOPPING 앱을 다시 켭니다. 앱이 저장된 작업 공간을 장치에 보내고, 키도 그 값을 따릅니다.',
		'保存せずに TOPPING アプリを再起動します。アプリが保存済みのワークスペースをデバイスに送り、キーもその値に従います。',
	],
	'No workspace is open in the TOPPING app to restart with.': ['다시 켤 때 쓸, TOPPING 앱에서 열린 작업 공간이 없습니다.', '再起動に使う、TOPPING アプリで開いているワークスペースがありません。'],
	Load: ['불러오기', '読み込み'],
	Save: ['저장', '保存'],
	Workspace: ['작업 공간', 'ワークスペース'],
	'New workspace name': ['새 작업 공간 이름', '新しいワークスペース名'],
	'e.g. Streaming': ['예: Streaming', '例: Streaming'],
	'New version available:': ['새 버전이 나왔어요:', '新しいバージョンがあります:'],
	'Open release page': ['릴리즈 페이지 열기', 'リリースページを開く'],
}
let language = 'en'
const tr = (en) => TEXT[en]?.[{ ko: 0, ja: 1 }[language]] ?? en

// The English original is kept in a data- attribute so switching back (or again) always starts from it.
function translate(root) {
	if (!(root instanceof Element)) return
	const all = (sel) => [...(root.matches(sel) ? [root] : []), ...root.querySelectorAll(sel)]
	for (const [attr, key] of [['label', 'enLabel'], ['placeholder', 'enPlaceholder']])
		for (const el of all(`[${attr}]`)) {
			const text = tr((el.dataset[key] ??= el.getAttribute(attr)))
			if (el.getAttribute(attr) === text) continue
			el.setAttribute(attr, text)
			el.requestUpdate?.() // sdpi elements already drawn keep the old text until asked to redraw
		}
	// sdpi-select reads option text only when options are added, so a changed list is re-added.
	const selects = new Set()
	for (const el of all('summary, span, option, b, li')) {
		// a list item holding its own span/b is translated through them: writing its whole text would wipe them out on the next pass
		if (el.childElementCount) continue
		const text = tr((el.dataset.enText ??= el.textContent))
		if (el.textContent === text) continue
		el.textContent = text
		selects.add(el.closest('sdpi-select'))
	}
	for (const s of selects) s?.append(...s.querySelectorAll('option'))
}
/** Text a script sets itself (the plugin's messages): remember the English, show it in the current language. */
function showText(el, en) {
	el.dataset.enText = en
	el.textContent = tr(en)
}
/** The Stream Deck app's own language: the "Same as Stream Deck" choice (and a first start) uses it. */
let appLanguage = 'en'
function setLanguage(value) {
	const pick = (v) => (Object.hasOwn({ en: 0, ko: 0, ja: 0 }, v) ? v : undefined)
	language = pick(value) ?? pick(appLanguage) ?? 'en'
	translate(document.body)
}
new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(translate))).observe(document.body, { childList: true, subtree: true })
document.querySelector('[setting="language"]')?.addEventListener('valuechange', (e) => setLanguage(e.target.value))
Promise.all([SDPIComponents.streamDeckClient.getConnectionInfo().catch(() => undefined), SDPIComponents.streamDeckClient.getGlobalSettings()]).then(([c, g]) => {
	appLanguage = c?.info?.application?.language ?? 'en'
	setLanguage(g?.language)
})

/** Custom key name field (empty = the default name, shown as the placeholder). */
/** Mix choice with "Follow an output": the key then acts on the Mix that output plays now. `select` is the page's own field builder. */
function followMixHtml(s, select) {
	let html = select('mix', 'Mix', { 0: 'MIX A', 1: 'MIX B', 2: 'MIX C', 3: 'MIX D', follow: "Follow an output (the Mix it plays now)" }, 'default="0"')
	if (s.mix !== 'follow') return html
	return (
		html +
		select('follow', 'Output to follow', { out12: 'Out 1/2', mobile: 'Mobile Out', spdif: 'S/PDIF' }, 'default="out12"') +
		'<div class="notice danger"><details><summary>⚠ The Mix can change: the sound can suddenly get louder</summary><span>when this output switches to another Mix, the key acts on that Mix instead. Each Mix has its own levels, so the sound can suddenly get louder. Turn the volume down before switching, and listen with care. If the output plays something other than a Mix, the key shows NOT A MIX and does nothing.</span></details></div>'
	)
}
const nameField = (placeholder) =>
	`<sdpi-item label="Name"><sdpi-textfield setting="name" maxlength="24" placeholder="${placeholder || 'Channel name'}"></sdpi-textfield></sdpi-item>`

// Fields a page adds from script miss what sdpi picks up while the page loads: sdpi-select only sees options
// added after it is on the page, and saved settings only reach fields that existed at connect. Redo both.
async function initFields(root) {
	for (const s of root.querySelectorAll('sdpi-select, sdpi-checkbox-list')) s.append(...s.querySelectorAll('option'))
	await Promise.all([...root.querySelectorAll('[setting]')].map((e) => e.updateComplete))
	await SDPIComponents.streamDeckClient.getSettings()
}

// New-release notice at the bottom of every settings screen (ui/update-check.js).
UpdateCheck.mountPluginNotice('streamdeck-TOPPING-E2x2-OTG-Controller', { available: 'New version available:', open: 'Open release page' })
