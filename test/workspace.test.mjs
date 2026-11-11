import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodeReport } from '../dist/protocol/report.js'
import { stateReports } from '../dist/state/crosspoints.js'
import { currentWorkspacePath, listWorkspaces, parseWorkspace, writeWorkspace } from '../dist/workspace/tpwork.js'
import { watchWorkspace } from '../dist/workspace/watch.js'

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
	const timers = new Map()
	let id = 0
	const deps = {
		dir,
		watch: (path, cb) => {
			listeners.push({ path, cb })
			return { close: () => closed.push(path) }
		},
		setTimeout: (fn, ms) => (timers.set(++id, { fn, ms }), id),
		clearTimeout: (t) => timers.delete(t),
	}
	return {
		deps,
		listeners,
		closed,
		timers,
		change: (i = 0, name = 'E2X2_OTG_Mine.TPwork') => listeners[i].cb('change', name),
		fire: () => [...timers.values()].splice(0).forEach((t) => t.fn()) || timers.clear(),
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
