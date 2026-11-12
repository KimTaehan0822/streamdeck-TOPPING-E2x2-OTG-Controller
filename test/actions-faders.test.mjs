import assert from 'node:assert/strict'
import test from 'node:test'
import { faderOp, gainSpec, meterOf, meterView, panOp, panSpec, panText, pressFader, pressPan, setMute, setPan, stepPan, stepRaw, stepVol, volSpec, MAX_DB, GAIN_MAX_DB, FLOOR_DB, faderPos, roleSign } from '../dist/actions/fader-spec.js'
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
	assert.equal(MAX_DB, 12)
	assert.ok(dbToRaw(MAX_DB) < 2 ** 31) // +12 dB must fit the signed 32-bit raw value
	const { conn } = setup(at(11.5))
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
	near(conn.state.loopbacks.lp12.volR, dbToRaw(12))
	assert.equal(faderOp({ mode: 'set', db: ' ' }), undefined)
	assert.deepEqual(faderOp({}), { set: false, db: 1 })
})

test('a volume spec always moves both sides, LINKed or not (a side setting is ignored)', () => {
	const mix = (link) => (s) => {
		for (const ch of Object.values(s.mixes[0].channels)) ch.volL = ch.volR = dbToRaw(-20)
		s.mixes[0].channels.in12.link = link
		s.mixes[0].channels.pb12.link = link
	}
	const off = setup(mix(false))
	stepVol(off.conn, volSpec({ kind: 'mix', mix: 0, channel: 'in12' }), 1)
	near(off.conn.state.mixes[0].channels.in12.volL, dbToRaw(-19))
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

test('VU dial view: a mix channel shows its own playback meter, loopback its 5x, output its own, IN 1/2 its 21/23 meters', () => {
	const { conn } = setup()
	const meters = new Map([['out1L_A', 0.84], ['out2R_A', 0.44], ['mobileL_A', 0.68], ['mobileR_A', 0.2], ['pb12L_A', 0.3], ['pb12R_A', 0.31], ['pb34L_A', 0.5], ['pb34R_A', 0.52], ['lp12L_A', 0.7], ['lp12R_A', 0.71]])
	const lr = (settings) => {
		const view = meterView(volSpec(settings), conn.state, meters, false)
		return [view.left, view.right]
	}
	let view = meterView(volSpec({ kind: 'output', channel: 'out12' }), conn.state, meters, false)
	assert.deepEqual([view.left, view.right], [0.84 * 0.8, 0.44 * 0.8].map((x) => x)) // meter levels sit on the axis (0 dB = 0.8)
	assert.equal(view.levelDb, '-6 dB')
	assert.equal(view.faderDb, '0.0 dB')
	assert.deepEqual(lr({ kind: 'output', channel: 'mobile' }), [0.68 * 0.8, 0.2 * 0.8])
	assert.deepEqual(lr({ kind: 'mix', mix: 0, channel: 'pb12' }), [0.3 * 0.8, 0.31 * 0.8])
	assert.deepEqual(lr({ kind: 'mix', mix: 3, channel: 'pb34' }), [0.5 * 0.8, 0.52 * 0.8]) // any mix: the channel's own meter
	assert.deepEqual(lr({ kind: 'mix', mix: 0, channel: 'pb56' }), [0, 0])
	assert.deepEqual(lr({ kind: 'mix', mix: 0, channel: 'in12' }), [0, 0]) // no IN meter reports in this map
	assert.deepEqual(lr({ kind: 'loopback', channel: 'lp12' }), [0.7 * 0.8, 0.71 * 0.8])
	assert.equal(meterOf({ kind: 'mix', mix: 2, channel: 'otg', side: 'pair' }), undefined)
	assert.deepEqual(meterOf({ kind: 'mix', mix: 1, channel: 'in12', side: 'pair' }), ['in1L_A', 'in2R_A'])
	assert.deepEqual(meterOf({ kind: 'mix', mix: 2, channel: 'pb78', side: 'pair' }), ['pb78L_A', 'pb78R_A'])
})

test('fader, button fader and VU dial ignore a saved L/R side: they act on the pair', () => {
	const { conn } = setup()
	const v = volSpec({ kind: 'mix', mix: 0, channel: 'pb12', side: 'L' })
	stepVol(conn, v, -6)
	const c = conn.state.mixes[0].channels.pb12
	near(c.volL, c.volR)
	assert.ok(c.volR < dbToRaw(0))
	assert.equal(v.name, 'PB 1/2')
})

test('a custom name replaces the channel name; blank keeps the default; long names are cut to 24', () => {
	assert.equal(volSpec({ kind: 'mix', mix: 0, channel: 'pb12', name: '  Music ' }).name, 'Music')
	assert.equal(volSpec({ kind: 'mix', mix: 0, channel: 'pb12', name: '   ' }).name, 'PB 1/2')
	assert.equal(gainSpec({ input: 'in1', name: 'Mic' }).name, 'Mic')
	assert.equal(panSpec({ mix: 0, channel: 'pb12', name: 'Pan me' }).name, 'Pan me')
	assert.equal(volSpec({ kind: 'mix', mix: 0, channel: 'pb12', name: 'x'.repeat(40) }).name.length, 24)
})

test('a muted VU view shows MUTED, and peek lets the fader dB through for a moment', () => {
	const { conn } = setup()
	const v = volSpec({ kind: 'output', channel: 'out12' })
	setMute(conn, v, 'on')
	assert.equal(meterView(v, conn.state, new Map(), false).muted, true)
	assert.ok(!meterView(v, conn.state, new Map(), false).peek)
	const peeked = meterView(v, conn.state, new Map(), true)
	assert.equal(peeked.muted, true) // the muted look stays
	assert.equal(peeked.peek, true)
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
	assert.equal(GAIN_MAX_DB, 6)
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

test('fader axis: 0 dB at 0.8, +12 dB at the top; presses go up on top/right and down on bottom/left', () => {
	assert.ok(Math.abs(faderPos(dbToRaw(0)) - 0.8) < 1e-9)
	assert.ok(Math.abs(faderPos(dbToRaw(12)) - 1) < 1e-9)
	assert.ok(Math.abs(faderPos(dbToRaw(6)) - 0.9) < 1e-9)
	assert.equal(faderPos(0), 0)
	assert.deepEqual(['top', 'bottom', 'left', 'right'].map(roleSign), [1, -1, -1, 1])
})
