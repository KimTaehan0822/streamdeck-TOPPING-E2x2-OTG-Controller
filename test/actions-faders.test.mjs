import assert from 'node:assert/strict'
import test from 'node:test'
import { faderOp, gainSpec, meterOf, meterView, panOp, panSpec, panText, pressFader, pressPan, setMute, setPan, stepPan, stepRaw, stepVol, volSpec, MAX_DB, FLOOR_DB } from '../dist/actions/fader-spec.js'
import { E2x2Connection } from '../dist/connection.js'
import { dbToRaw, decodeReport } from '../dist/protocol/report.js'
import { emptyState } from '../dist/state/mixer-state.js'

const near = (a, b, tol = 32) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`)

/** Real connection on a fake HID port (writes are captured, nothing touches a device). */
function setup(mutate = () => {}) {
	const s = emptyState()
	mutate(s)
	const port = { written: [], write: (b) => port.written.push(b), onData() {}, onError() {}, close() {} }
	const conn = new E2x2Connection({ open: () => port, read: () => s, watch: () => () => {}, setInterval: () => 0, setTimeout: (fn) => fn() })
	conn.start()
	const sent = () => port.written.map((b) => decodeReport(b)).map(({ group, item, value }) => ({ group, item, value }))
	return { conn, sent, clear: () => (port.written.length = 0) }
}
const at = (db) => (s) => {
	for (const o of Object.values(s.outputs)) o.volL = o.volR = dbToRaw(db)
}

test('step +1 dB raises the output volume to the matching raw value and sends it', () => {
	const { conn, sent } = setup(at(-10))
	stepVol(conn, volSpec({ kind: 'output', channel: 'out12' }), 1)
	near(conn.state.outputs.out12.volL, dbToRaw(-9))
	near(conn.state.outputs.out12.volR, dbToRaw(-9))
	assert.deepEqual(sent().map((r) => [r.group, r.item]), [[0x31, 3], [0x32, 3]])
})

test('stepping stops at the maximum, and below the floor goes to silence', () => {
	assert.equal(MAX_DB, 6)
	const { conn } = setup(at(5.5))
	const v = volSpec({ kind: 'output', channel: 'out12' })
	stepVol(conn, v, 1)
	near(conn.state.outputs.out12.volL, dbToRaw(MAX_DB))
	stepVol(conn, v, 1)
	near(conn.state.outputs.out12.volL, dbToRaw(MAX_DB))

	const low = setup(at(FLOOR_DB + 0.5))
	const lv = volSpec({ kind: 'output', channel: 'out12' })
	stepVol(low.conn, lv, -1)
	assert.equal(low.conn.state.outputs.out12.volL, 0)
	stepVol(low.conn, lv, -1)
	assert.equal(low.conn.state.outputs.out12.volL, 0)
	stepVol(low.conn, lv, 1) // silence comes back at the floor
	near(low.conn.state.outputs.out12.volL, dbToRaw(FLOOR_DB))
	assert.equal(stepRaw(0, -1), 0)
})

test('set mode goes to the level; above the maximum is clamped', () => {
	const { conn } = setup()
	const v = volSpec({ kind: 'loopback', channel: 'lp12' })
	pressFader(conn, v, faderOp({ mode: 'set', db: '-6' }))
	near(conn.state.loopbacks.lp12.volL, dbToRaw(-6))
	pressFader(conn, v, faderOp({ mode: 'set', db: 20 }))
	near(conn.state.loopbacks.lp12.volR, dbToRaw(6))
	assert.equal(faderOp({ mode: 'set', db: ' ' }), undefined)
	assert.deepEqual(faderOp({}), { set: false, db: 1 })
})

test('pair moves both sides; a single side moves one with LINK off and the pair with LINK on', () => {
	const mix = (link) => (s) => {
		for (const ch of Object.values(s.mixes[0].channels)) ch.volL = ch.volR = dbToRaw(-20)
		s.mixes[0].channels.in12.link = link
		s.mixes[0].channels.pb12.link = link
	}
	const off = setup(mix(false))
	stepVol(off.conn, volSpec({ kind: 'mix', mix: 0, channel: 'in12', side: 'L' }), 3)
	near(off.conn.state.mixes[0].channels.in12.volL, dbToRaw(-17))
	assert.equal(off.conn.state.mixes[0].channels.in12.volR, dbToRaw(-20))
	stepVol(off.conn, volSpec({ kind: 'mix', mix: 0, channel: 'in12' }), 1)
	near(off.conn.state.mixes[0].channels.in12.volL, dbToRaw(-16))
	near(off.conn.state.mixes[0].channels.in12.volR, dbToRaw(-19))

	const on = setup(mix(true))
	stepVol(on.conn, volSpec({ kind: 'mix', mix: 0, channel: 'pb12', side: 'R' }), 2)
	near(on.conn.state.mixes[0].channels.pb12.volL, dbToRaw(-18))
	near(on.conn.state.mixes[0].channels.pb12.volR, dbToRaw(-18))
})

test('mute through a fader spec toggles, and the muted state is read back', () => {
	const { conn } = setup()
	const v = volSpec({ kind: 'mix', mix: 1, channel: 'otg' })
	setMute(conn, v, 'toggle')
	assert.equal(v.muted(conn.state), true)
	setMute(conn, v, 'off')
	assert.equal(v.muted(conn.state), false)
})

test('VU dial view draws the output meters; a mix uses the first output it feeds; loopbacks stay empty', () => {
	const { conn } = setup((s) => {
		s.outputs.out12.source = 0x0b // Mix A
		s.outputs.mobile.source = 0x0c // Mix B
		s.outputs.spdif.source = 0x0c
	})
	const meters = new Map([['out1L_A', 0.84], ['out2R_A', 0.44], ['mobileL_A', 0.68], ['mobileR_A', 0.2]])
	let view = meterView(volSpec({ kind: 'output', channel: 'out12' }), conn.state, meters, false)
	assert.deepEqual([view.left, view.right], [0.84, 0.44])
	assert.equal(view.levelDb, '-6 dB')
	assert.equal(view.faderDb, '0.0 dB')
	view = meterView(volSpec({ kind: 'output', channel: 'mobile' }), conn.state, meters, false)
	assert.deepEqual([view.left, view.right], [0.68, 0.2])
	view = meterView(volSpec({ kind: 'mix', mix: 0, channel: 'pb12' }), conn.state, meters, false) // Mix A -> out12
	assert.equal(view.mix, 0)
	assert.deepEqual([view.left, view.right], [0.84, 0.44])
	view = meterView(volSpec({ kind: 'mix', mix: 1, channel: 'pb12' }), conn.state, meters, false) // Mix B -> mobile (before spdif)
	assert.deepEqual([view.left, view.right], [0.68, 0.2])
	assert.equal(meterOf({ kind: 'mix', mix: 2, channel: 'pb12', side: 'pair' }, conn.state), undefined)
	view = meterView(volSpec({ kind: 'mix', mix: 2, channel: 'pb12' }), conn.state, meters, false)
	assert.deepEqual([view.left, view.right, view.levelDb], [0, 0, '-∞'])
	view = meterView(volSpec({ kind: 'loopback', channel: 'lp12' }), conn.state, meters, false)
	assert.deepEqual([view.left, view.right], [0, 0])
})

test('a muted VU view shows MUTED, and peek lets the fader dB through for a moment', () => {
	const { conn } = setup()
	const v = volSpec({ kind: 'output', channel: 'out12' })
	setMute(conn, v, 'on')
	assert.equal(meterView(v, conn.state, new Map(), false).muted, true)
	assert.equal(meterView(v, conn.state, new Map(), true).muted, false)
})

test('button fader: top key raises, bottom key lowers (both through stepVol)', () => {
	const { conn } = setup(at(-10))
	const v = volSpec({ kind: 'output', channel: 'out12' })
	stepVol(conn, v, 2)
	near(conn.state.outputs.out12.volL, dbToRaw(-8))
	stepVol(conn, v, -1)
	near(conn.state.outputs.out12.volL, dbToRaw(-9))
})

test('digital gain steps, stops at the maximum and mutes the input', () => {
	const { conn, sent, clear } = setup()
	const g = gainSpec({ input: 'in1' })
	stepVol(conn, g, 1)
	near(conn.state.inputs.in1.gain, dbToRaw(1))
	assert.deepEqual(sent(), [{ group: 0x21, item: 5, value: conn.state.inputs.in1.gain }])
	stepVol(conn, g, 20)
	near(conn.state.inputs.in1.gain, dbToRaw(6))
	clear()
	setMute(conn, g, 'toggle')
	assert.deepEqual(sent(), [{ group: 0x21, item: 5, value: 0 }])
	assert.equal(gainSpec({ input: 'in4' }), undefined)
})

test('pan steps one mono side, and a pair keeps its width at the ends', () => {
	const { conn } = setup()
	const mono = panSpec({ mix: 0, channel: 'in12', side: 'L' })
	stepPan(conn, mono, 10)
	near(conn.state.mixes[0].channels.in12.panL, 0.55, 1e-9)
	assert.equal(conn.state.mixes[0].channels.in12.panR, 0.5)
	assert.equal(panText(mono.read(conn.state)), 'R10')
	setPan(conn, mono, 0)
	assert.equal(panText(mono.read(conn.state)), 'C')

	const pair = panSpec({ mix: 0, channel: 'in12' })
	stepPan(conn, pair, -30)
	near(conn.state.mixes[0].channels.in12.panR, 0.35, 1e-9)
	near(conn.state.mixes[0].channels.in12.panL, 0.35, 1e-9)
	// LINKed strip (starts at 0 / 1): pan is a balance and moves
	const linked = panSpec({ mix: 0, channel: 'pb12' })
	const pb = () => [conn.state.mixes[0].channels.pb12.panL, conn.state.mixes[0].channels.pb12.panR]
	stepPan(conn, linked, 20)
	near(pb()[0], 0.2, 1e-9)
	assert.equal(pb()[1], 1)
	assert.equal(panText(linked.read(conn.state)), 'R20')
	stepPan(conn, linked, -20)
	assert.deepEqual(pb(), [0, 1])
	stepPan(conn, linked, -30)
	near(pb()[1], 0.7, 1e-9)
	assert.equal(pb()[0], 0)
	stepPan(conn, linked, 30)
	assert.deepEqual(pb(), [0, 1])
	setPan(conn, linked, -100)
	assert.deepEqual(pb(), [0, 0])
	setPan(conn, linked, 100)
	assert.deepEqual(pb(), [1, 1])
	setPan(conn, linked, 0)
	assert.deepEqual(pb(), [0, 1])
	pressPan(conn, panSpec({ mix: 0, channel: 'in12', side: 'R' }), panOp({ mode: 'set', pan: -100 }))
	assert.equal(conn.state.mixes[0].channels.in12.panR, 0)
	assert.equal(panSpec({ mix: 0 }), undefined)
})
