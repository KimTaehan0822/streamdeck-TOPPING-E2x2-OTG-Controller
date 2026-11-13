import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, openSync, writeSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodeReport } from '../dist/protocol/report.js'
import { stateReports } from '../dist/state/crosspoints.js'
import { currentWorkspacePath, listWorkspaces, parseWorkspace, writeWorkspace } from '../dist/workspace/tpwork.js'
import { watchWorkspace } from '../dist/workspace/watch.js'
import { lastOpenedInLog, loggedWorkspace } from '../dist/workspace/applog.js'

const file = readFileSync(new URL('./fixtures/workspace.TPwork', import.meta.url), 'utf8')
const startup = readFileSync(new URL('./fixtures/app-startup-reports.tsv', import.meta.url), 'utf8')
	.split(/\r?\n/)
	.filter(Boolean)
	.map((line) => decodeReport(Buffer.from('00' + line.split('\t')[1], 'hex')))
	.slice(1) // 11 01 start command

test('workspace reproduces the app startup reports', () => {
	const got = stateReports(parseWorkspace(file))
	assert.equal(got.length, 138)
	assert.deepEqual(got, startup)
})

test('round trip', () => {
	const s = parseWorkspace(file)
	assert.deepEqual(parseWorkspace(writeWorkspace(s, file)), s)
	// changed values survive too
	s.mixes[1].channels.pb34.volL = 12300
	s.mixes[0].channels.in12.panL = 0.25
	s.inputs.in2.phase = true
	s.outputs.mobile.muteR = true
	assert.deepEqual(parseWorkspace(writeWorkspace(s, file)), s)
})

test('unknown fields survive writeWorkspace', () => {
	const t = JSON.parse(file)
	t.SomethingNew = { a: [1, 2] }
	t.IN1.FutureField = 7
	const out = JSON.parse(writeWorkspace(parseWorkspace(file), JSON.stringify(t)))
	assert.deepEqual(out.SomethingNew, { a: [1, 2] })
	assert.equal(out.IN1.FutureField, 7)
	assert.equal(out.TIME, t.TIME)
})

function fakeDir() {
	const dir = mkdtempSync(join(tmpdir(), 'tpwork-'))
	mkdirSync(join(dir, 'E2X2_OTG'))
	writeFileSync(join(dir, 'sound_card_workspace_file.TPconfig'), JSON.stringify({ LastWorkspaceOpened_E2x2_OTG: 'Mine' }))
	writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_Mine.TPwork'), file)
	writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_Other.TPwork'), file)
	writeFileSync(join(dir, 'E2X2_OTG', 'Default.config'), '{}')
	return dir
}

test('currentWorkspacePath and listWorkspaces', () => {
	const dir = fakeDir()
	try {
		assert.equal(currentWorkspacePath(dir), join(dir, 'E2X2_OTG', 'E2X2_OTG_Mine.TPwork'))
		assert.deepEqual(listWorkspaces(dir).sort(), ['Mine', 'Other'])
		assert.equal(currentWorkspacePath(join(dir, 'nope')), undefined)
		assert.deepEqual(listWorkspaces(join(dir, 'nope')), [])
	} finally {
		rmSync(dir, { recursive: true })
	}
})

/** Fake fs.watch and timers; fire() runs all pending timers. */
function harness(dir) {
	const listeners = []
	const closed = []
	const errors = []
	const timers = new Map()
	const polls = []
	let id = 0
	const deps = {
		dir,
		watch: (path, cb) => {
			listeners.push({ path, cb })
			return { close: () => closed.push(path), on: (ev, fn) => (errors.push(fn), undefined) }
		},
		setTimeout: (fn, ms) => (timers.set(++id, { fn, ms }), id),
		clearTimeout: (t) => timers.delete(t),
		setInterval: (fn, ms) => (polls.push({ fn, ms }), polls.length),
		clearInterval: () => polls.splice(0),
	}
	return {
		deps,
		listeners,
		closed,
		errors,
		timers,
		change: (i = 0, name = 'E2X2_OTG_Mine.TPwork') => listeners[i].cb('change', name),
		fire: () => [...timers.values()].splice(0).forEach((t) => t.fn()) || timers.clear(),
		polls,
		poll: () => polls.forEach((p) => p.fn()),
	}
}

test('watchWorkspace reports the state after a 300 ms settle', () => {
	const dir = fakeDir()
	try {
		const h = harness(dir)
		const seen = []
		const stop = watchWorkspace((s) => seen.push(s), h.deps)
		assert.equal(h.listeners.length, 2)
		h.change()
		h.change()
		assert.equal(h.timers.size, 1)
		assert.equal([...h.timers.values()][0].ms, 300)
		h.fire()
		assert.equal(seen.length, 1)
		assert.deepEqual(seen[0], parseWorkspace(file))
		// the user switches workspace in the app
		const other = JSON.parse(file)
		other.IN1.MUTEEnable = true
		writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_Other.TPwork'), JSON.stringify(other))
		writeFileSync(join(dir, 'sound_card_workspace_file.TPconfig'), JSON.stringify({ LastWorkspaceOpened_E2x2_OTG: 'Other' }))
		h.change(1, 'sound_card_workspace_file.TPconfig')
		h.fire()
		assert.equal(seen.length, 2)
		assert.equal(seen[1].inputs.in1.mute, true)
		stop()
		assert.equal(h.closed.length, 2)
	} finally {
		rmSync(dir, { recursive: true })
	}
})

test('keeps previous state when the file is broken', () => {
	const dir = fakeDir()
	try {
		const h = harness(dir)
		const seen = []
		watchWorkspace((s) => seen.push(s), h.deps)
		writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_Mine.TPwork'), file.slice(0, file.length / 2))
		h.change()
		h.fire()
		assert.equal(seen.length, 0)
		writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_Mine.TPwork'), '{"IN1":{}}')
		h.change()
		h.fire()
		assert.equal(seen.length, 0)
	} finally {
		rmSync(dir, { recursive: true })
	}
})

test('a watcher error is swallowed and closes that watcher', () => {
	const dir = fakeDir()
	try {
		const h = harness(dir)
		watchWorkspace(() => {}, h.deps)
		assert.equal(h.errors.length, 2)
		assert.doesNotThrow(() => h.errors[0](new Error('EPERM')))
		assert.deepEqual(h.closed, [h.listeners[0].path])
	} finally {
		rmSync(dir, { recursive: true })
	}
})

test('display ints follow 90 + dB and survive a write of the fixture', () => {
	const s = parseWorkspace(file)
	assert.deepEqual(JSON.parse(writeWorkspace(s, file)), JSON.parse(file))
	s.mixes[0].channels.pb12.volL = Math.round(10 ** (-6 / 20) * 0x02000000)
	s.mixes[0].channels.pb12.volR = 0
	const w = JSON.parse(writeWorkspace(s, file)).MixSaveA
	assert.equal(w['MixParmeter_3.Mix_volume_L'], 84)
	assert.equal(w['MixParmeter_3.Mix_volume_R'], 0)
})

test('a save to another workspace file does not re-read the open one', () => {
	const dir = fakeDir()
	try {
		const h = harness(dir)
		const seen = []
		watchWorkspace((s) => seen.push(s), h.deps)
		// the plugin's save key writes a temp file and renames it to another name; the app's open file did not change
		h.change(0, '.E2X2_OTG_Backup.tmp')
		h.change(0, 'E2X2_OTG_Backup.TPwork')
		h.change(0, null)
		assert.equal(h.timers.size, 0)
		h.change(0, 'e2x2_otg_mine.tpwork') // Windows names are case-insensitive
		assert.equal(h.timers.size, 1)
	} finally {
		rmSync(dir, { recursive: true })
	}
})

test('the Mixer section follows the selected mix, as the app reads it on load', () => {
	// the app shows (and re-saves) the selected mix from "Mixer", a copy of MixSave[Mixer_main]
	for (const main of [0, 2]) {
		const t = JSON.parse(file)
		t.Mixer_main = main
		const s = parseWorkspace(JSON.stringify(t))
		s.mixes[main].channels.pb12.volL = 9457 * 3.5
		s.mixes[main].channels.pb12.muteR = true
		const w = JSON.parse(writeWorkspace(s, JSON.stringify(t)))
		const active = w[['MixSaveA', 'MixSaveB', 'MixSaveC', 'MixSaveD'][main]]
		for (const k of Object.keys(w.Mixer)) if (k in active) assert.deepEqual(w.Mixer[k], active[k], `${main} ${k}`)
	}
})

test('a linked strip keeps its pan: L channel = 100 - left value, R channel = right value (app capture 2026-11-13)', () => {
	// the app saved Mix A PB 5/6 (LINK on, panned right) as 44/100; on the device the L channel sat at 0.56 (left out x0.44, right out x1.56)
	const t = JSON.parse(file)
	Object.assign(t.MixSaveA, { 'MixParmeter_5.LinkEnable': true, 'MixParmeter_5.Mix_channel_L': 44, 'MixParmeter_5.Mix_channel_R': 100 })
	const s = parseWorkspace(JSON.stringify(t))
	const c = s.mixes[0].channels.pb56
	assert.ok(Math.abs(c.panL - 0.56) < 1e-9)
	assert.equal(c.panR, 1)
	let w = JSON.parse(writeWorkspace(s, JSON.stringify(t)))
	assert.equal(w.MixSaveA['MixParmeter_5.Mix_channel_L'], 44)
	assert.equal(w.MixSaveA['MixParmeter_5.Mix_channel_R'], 100)
	// centred linked strip: hard L / hard R = 100/100, as every linked strip in the fixture
	Object.assign(c, { panL: 0, panR: 1 })
	w = JSON.parse(writeWorkspace(s, JSON.stringify(t)))
	assert.equal(w.MixSaveA['MixParmeter_5.Mix_channel_L'], 100)
	assert.equal(w.MixSaveA['MixParmeter_5.Mix_channel_R'], 100)
})

// Real Run.log lines (2026-11-13): the app logs the save path of the workspace it leaves, then the name it opens; a plain save has no name line.
const P = 'C:/Program Files/TOPPING Pro/TOPPING Professional Control Center'
const switchTo = (from, to) => `2026-11-13 05:00:22 ?? ? "${P}/E2X2_OTG/E2X2_OTG_${from}.TPwork"\n2026-11-13 05:00:22 ?前?? "${to}"\n2026-11-13 05:00:22  parmeterint->Gain1_Enable  false\n`

test('lastOpenedInLog: the name line after an E2X2_OTG save path, last one wins', () => {
	assert.equal(lastOpenedInLog(switchTo('Streaming', 'test')), 'test')
	assert.equal(lastOpenedInLog(switchTo('A', 'B') + switchTo('B', 'C')), 'C')
	// a plain save (no name line) and other models' paths do not count
	assert.equal(lastOpenedInLog(`2026-11-13 04:48:39 ?? ? "${P}/E2X2_OTG/E2X2_OTG_Streaming.TPwork"\n2026-11-13 04:48:39 Current number of devices   1\n`), undefined)
	assert.equal(lastOpenedInLog(`2026-11-13 03:29:09 ?? ? "${P}/E1X2_OTG/E1X2_New1.TPwork"\n2026-11-13 03:29:09 ?前?? "New1"\n`), undefined)
})

test('the workspace the app switched to (Run.log) wins over the config, which the app only writes on exit', () => {
	const dir = fakeDir()
	try {
		writeFileSync(join(dir, 'Run.log'), switchTo('Mine', 'Other'))
		assert.equal(currentWorkspacePath(dir), join(dir, 'E2X2_OTG', 'E2X2_OTG_Other.TPwork'))
		// a logged name without a file is unknown: the config is stale by then, and pushing its workspace would mismatch the app
		appendFileSync(join(dir, 'Run.log'), switchTo('Other', 'Gone'))
		assert.equal(currentWorkspacePath(dir), undefined)
	} finally {
		rmSync(dir, { recursive: true })
	}
})

// the log is in CP949; Node's 'euc-kr' decoder misreads CP949-only syllables such as 똠 (8C 63), so the file is matched by shape
test('Korean names in Run.log (CP949, incl. syllables outside EUC-KR, and ? for unwritable characters) find their file', () => {
	const dir = fakeDir()
	try {
		const log = (nameBytes) => Buffer.concat([Buffer.from(switchTo('Mine', 'X').split('"X"')[0] + '"'), Buffer.from(nameBytes), Buffer.from('"\n')])
		writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_가똠1.TPwork'), file)
		writeFileSync(join(dir, 'Run.log'), log([0xb0, 0xa1, 0x8c, 0x63, 0x31]))
		assert.equal(currentWorkspacePath(dir), join(dir, 'E2X2_OTG', 'E2X2_OTG_가똠1.TPwork'))
		writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_aŝ.TPwork'), file)
		appendFileSync(join(dir, 'Run.log'), log([0x61, 0x3f]))
		assert.equal(currentWorkspacePath(dir), join(dir, 'E2X2_OTG', 'E2X2_OTG_aŝ.TPwork'))
		// two files of the same shape: unknown rather than a guess
		writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_나똠1.TPwork'), file)
		appendFileSync(join(dir, 'Run.log'), log([0xb3, 0xaa, 0x8c, 0x63, 0x31]))
		assert.equal(currentWorkspacePath(dir), undefined)
	} finally {
		rmSync(dir, { recursive: true })
	}
})

test('a workspace switch logged in Run.log reloads the state', () => {
	const dir = fakeDir()
	try {
		const other = JSON.parse(file)
		other.IN1.MUTEEnable = true
		writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_Other.TPwork'), JSON.stringify(other))
		writeFileSync(join(dir, 'Run.log'), '2026-11-13 04:53:06 Run app\n')
		const h = harness(dir)
		const seen = []
		watchWorkspace((s) => seen.push(s), h.deps)
		// Windows sends no change events for Run.log (the app keeps it open), so the watcher polls it every second
		assert.equal(h.polls.length, 1)
		assert.equal(h.polls[0].ms, 1000)
		h.poll() // a log line that is not a switch: nothing to do
		assert.equal(h.timers.size, 0)
		appendFileSync(join(dir, 'Run.log'), switchTo('Mine', 'Other'))
		h.poll()
		assert.equal(h.timers.size, 1)
		h.fire()
		assert.equal(seen.length, 1)
		assert.equal(seen[0].inputs.in1.mute, true)
	} finally {
		rmSync(dir, { recursive: true })
	}
})

test('Run.log bytes the app has reserved but not written yet (zeros) are read again later', () => {
	const dir = fakeDir()
	try {
		const log = join(dir, 'Run.log')
		writeFileSync(log, '2026-11-13 05:19:37 Current number of devices   1\n')
		assert.equal(loggedWorkspace(dir), undefined)
		const block = switchTo('Mine', 'Other')
		// seen 2026-11-13: the file grew before its text landed; a read in between got zeros
		// ... and the end of the new bytes may already hold a line break
		appendFileSync(log, Buffer.concat([Buffer.alloc(Buffer.byteLength(block)), Buffer.from('devices   1\r\n2026-11-13 05:19:39 Current number of devices   1\r\n')]))
		assert.equal(loggedWorkspace(dir), undefined)
		const fd = openSync(log, 'r+')
		writeSync(fd, block, Buffer.byteLength('2026-11-13 05:19:37 Current number of devices   1\n'))
		closeSync(fd)
		assert.equal(loggedWorkspace(dir), 'Other')
	} finally {
		rmSync(dir, { recursive: true })
	}
})

test('a switch written over earlier Run.log lines (a second app instance started) is still found', () => {
	const dir = fakeDir()
	try {
		const log = join(dir, 'Run.log')
		const head = '2026-11-13 05:24:09 Current number of devices   1\n'
		const block = switchTo('Mine', 'Other')
		// seen 2026-11-13: a second instance appended its start-up lines, then the running app wrote its switch over them
		writeFileSync(log, head + 'x'.repeat(Buffer.byteLength(block) - 1) + '\n')
		assert.equal(loggedWorkspace(dir), undefined)
		const fd = openSync(log, 'r+')
		writeSync(fd, block, Buffer.byteLength(head))
		closeSync(fd)
		assert.equal(loggedWorkspace(dir), 'Other')
	} finally {
		rmSync(dir, { recursive: true })
	}
})

test('a config change does not count once Run.log names the open workspace (the restart key writes the config while the log still names the old one)', () => {
	const dir = fakeDir()
	try {
		writeFileSync(join(dir, 'Run.log'), switchTo('Mine', 'Other'))
		const h = harness(dir)
		const stop = watchWorkspace(() => {}, h.deps)
		h.change(1, 'sound_card_workspace_file.TPconfig')
		assert.equal(h.timers.size, 0)
		stop()
	} finally {
		rmSync(dir, { recursive: true })
	}
})
