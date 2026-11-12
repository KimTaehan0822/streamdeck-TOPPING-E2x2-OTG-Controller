import assert from 'node:assert/strict'
import { existsSync, readdirSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadWorkspace, overwriteNotice, saveProblem, saveWorkspace, validName } from '../dist/actions/workspace-spec.js'
import { E2x2Connection } from '../dist/connection.js'
import { decodeReport } from '../dist/protocol/report.js'
import { stateReports } from '../dist/state/crosspoints.js'
import { emptyState } from '../dist/state/mixer-state.js'
import { parseWorkspace } from '../dist/workspace/tpwork.js'

const fixture = readFileSync(new URL('./fixtures/workspace.TPwork', import.meta.url), 'utf8')

/** Temp TOPPING folder (never the real one): the app uses workspace "App"; "Other" is another saved file. */
function setup() {
	const dir = mkdtempSync(join(tmpdir(), 'e2x2-ws-'))
	mkdirSync(join(dir, 'E2X2_OTG'))
	writeFileSync(join(dir, 'sound_card_workspace_file.TPconfig'), JSON.stringify({ LastWorkspaceOpened_E2x2_OTG: 'App' }))
	writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_App.TPwork'), fixture)
	const other = JSON.parse(fixture)
	other.IN1.IN_volumenum = 1234
	writeFileSync(join(dir, 'E2X2_OTG', 'E2X2_OTG_Other.TPwork'), JSON.stringify(other))
	const port = { written: [], write: (b) => port.written.push(b), onData() {}, onError() {}, close() {} }
	const conn = new E2x2Connection({ open: () => port, read: () => emptyState(), watch: () => () => {}, setInterval: () => 0, setTimeout: (fn) => fn() })
	conn.start()
	port.written.length = 0
	return { dir, conn, port, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('load sends the whole state and replaces the plugin state', () => {
	const t = setup()
	try {
		loadWorkspace(t.conn, t.dir, 'Other')
		assert.equal(t.conn.state.inputs.in1.gain, 1234)
		const expect = stateReports(parseWorkspace(readFileSync(join(t.dir, 'E2X2_OTG', 'E2X2_OTG_Other.TPwork'), 'utf8')))
		assert.deepEqual(
			t.port.written.map((b) => decodeReport(b)),
			expect,
		)
		assert.equal(expect.length, 138)
	} finally {
		t.done()
	}
})

test('load of a missing or broken file throws and keeps the state', () => {
	const t = setup()
	try {
		writeFileSync(join(t.dir, 'E2X2_OTG', 'E2X2_OTG_Bad.TPwork'), '{nope')
		const before = t.conn.state
		assert.throws(() => loadWorkspace(t.conn, t.dir, 'Bad'))
		assert.throws(() => loadWorkspace(t.conn, t.dir, 'Missing'))
		assert.equal(t.conn.state, before)
		assert.equal(t.port.written.length, 0)
	} finally {
		t.done()
	}
})

test('save writes E2X2_OTG_<name>.TPwork with the plugin state', () => {
	const t = setup()
	try {
		t.conn.update((s) => (s.inputs.in2.gain = 777))
		const path = saveWorkspace(t.conn, t.dir, 'My Mix 2')
		assert.equal(path, join(t.dir, 'E2X2_OTG', 'E2X2_OTG_My Mix 2.TPwork'))
		assert.deepEqual(parseWorkspace(readFileSync(path, 'utf8')), t.conn.state)
		// the app's own file is untouched
		assert.equal(readFileSync(join(t.dir, 'E2X2_OTG', 'E2X2_OTG_App.TPwork'), 'utf8'), fixture)
	} finally {
		t.done()
	}
})

test('save refuses the file the app currently uses (any letter case)', () => {
	const t = setup()
	try {
		assert.throws(() => saveWorkspace(t.conn, t.dir, 'App'), /using this workspace/)
		assert.throws(() => saveWorkspace(t.conn, t.dir, 'app'), /using this workspace/)
		assert.ok(saveProblem(t.dir, 'App'))
		assert.equal(saveProblem(t.dir, 'Other'), undefined)
		assert.equal(readFileSync(join(t.dir, 'E2X2_OTG', 'E2X2_OTG_App.TPwork'), 'utf8'), fixture)
	} finally {
		t.done()
	}
})

test('bad names are rejected and nothing is written', () => {
	const t = setup()
	try {
		for (const bad of ['', ' ', 'a/b', 'a\\b', '..', '../x', 'a..b', 'x.', ' x', 'a:b', 'a*b', 'a'.repeat(61), undefined, 5, 'a\nb']) {
			assert.equal(validName(bad), false, JSON.stringify(bad))
			assert.throws(() => saveWorkspace(t.conn, t.dir, bad))
			assert.throws(() => loadWorkspace(t.conn, t.dir, bad))
		}
		assert.equal(existsSync(join(t.dir, 'x')), false)
		assert.equal(validName('Streaming 2'), true)
		assert.equal(validName('방송용'), true)
	} finally {
		t.done()
	}
})

test('saving over another existing workspace is noticed, still works, and leaves no temp file', () => {
	const t = setup()
	try {
		assert.match(overwriteNotice(t.dir, 'Other'), /exists/)
		assert.equal(overwriteNotice(t.dir, 'Brand New'), undefined)
		assert.equal(overwriteNotice(t.dir, 'App'), undefined) // refused instead
		assert.equal(saveProblem(t.dir, 'Other'), undefined)
		t.conn.update((s) => (s.inputs.in2.gain = 555))
		const path = saveWorkspace(t.conn, t.dir, 'Other')
		assert.deepEqual(parseWorkspace(readFileSync(path, 'utf8')), t.conn.state)
		assert.deepEqual(readdirSync(join(t.dir, 'E2X2_OTG')).sort(), ['E2X2_OTG_App.TPwork', 'E2X2_OTG_Other.TPwork'])
	} finally {
		t.done()
	}
})

test('save refuses without a loaded workspace and writes nothing', () => {
	const t = setup()
	try {
		const conn = new E2x2Connection({ open: () => t.port, read: () => undefined, watch: () => () => {}, setInterval: () => 0, setTimeout: (fn) => fn() })
		conn.start()
		assert.equal(conn.loaded, false)
		assert.throws(() => saveWorkspace(conn, t.dir, 'Brand New'), /No workspace is loaded/)
		assert.equal(existsSync(join(t.dir, 'E2X2_OTG', 'E2X2_OTG_Brand New.TPwork')), false)
	} finally {
		t.done()
	}
})
