import assert from 'node:assert/strict'
import test from 'node:test'
import { E2x2Connection } from '../dist/connection.js'
import { decodeReport, encodeReport } from '../dist/protocol/report.js'
import { diffReports, stateReports } from '../dist/state/crosspoints.js'
import { emptyState } from '../dist/state/mixer-state.js'

function setup(openImpl, initial) {
	let t = 0
	const timers = []
	let watched
	const port = {
		written: [],
		fail: false,
		write(b) {
			if (this.fail) throw new Error('boom')
			this.written.push(b)
		},
		onData(cb) {
			this.data = cb
		},
		onError(cb) {
			this.error = cb
		},
		closed: 0,
		throwOnClose: false,
		close() {
			this.closed++
			if (this.throwOnClose) throw new Error('close')
		},
	}
	const add = (every) => (fn, ms) => timers.push({ at: t + ms, fn, every: every ? ms : 0 })
	const conn = new E2x2Connection({
		open: () => openImpl(port),
		setInterval: add(true),
		setTimeout: add(false),
		now: () => t,
		// a function stands in for a read that changes (or throws) over time
		read: () => (typeof initial === 'function' ? initial() : initial),
		watch: (cb) => ((watched = cb), () => {}),
	})
	const advance = (ms) => {
		const end = t + ms
		for (;;) {
			timers.sort((a, b) => a.at - b.at)
			const n = timers.find((x) => x.at <= end)
			if (!n) break
			t = n.at
			if (n.every) n.at += n.every
			else timers.splice(timers.indexOf(n), 1)
			n.fn()
		}
		t = end
	}
	return { conn, port, advance, watched: (s) => watched(s) }
}

test('sends only changed crosspoints', () => {
	const { conn, port, advance } = setup((p) => p, emptyState())
	conn.start()
	conn.update((s) => {
		s.mixes[0].channels.pb12.volL = 123456
	})
	advance(100)
	assert.ok(port.written.length > 0 && port.written.length < 5)
	assert.equal(port.written[0].length, 17)
	assert.ok(port.written.every((b) => decodeReport(b)))
	const n = port.written.length
	conn.update(() => {})
	advance(100)
	assert.equal(port.written.length, n)
})

test('reconnects and resends full state', () => {
	let up = false
	const { conn, port, advance } = setup((p) => (up ? p : undefined), emptyState())
	conn.start()
	assert.equal(conn.online, false)
	up = true
	advance(5000)
	assert.equal(conn.online, true)
	advance(1000)
	assert.deepEqual(port.written, stateReports(emptyState()).map(encodeReport))
})

test('write error marks offline without throwing', () => {
	let up = true
	const { conn, port, advance } = setup((p) => (up ? p : undefined))
	conn.start()
	assert.equal(conn.online, true)
	port.fail = true
	conn.loadState(emptyState())
	assert.equal(conn.online, false)
	port.fail = false
	advance(5000)
	assert.equal(conn.online, true)
})

test('meters go to zero after 500 ms of silence', () => {
	const { conn, port, advance } = setup((p) => p)
	let n = 0
	conn.start()
	conn.onChange(() => n++)
	port.data(Buffer.from('22332001013101FFFFFF391AFA667700', 'hex'))
	assert.ok(conn.meters.get('out1L_A') > 0)
	advance(700)
	assert.equal(conn.meters.get('out1L_A'), 0)
	const after = n
	advance(1000)
	assert.equal(n, after)
})

test('device error closes the port and goes offline', () => {
	const { conn, port } = setup((p) => p)
	conn.start()
	port.error(new Error('unplug'))
	assert.equal(conn.online, false)
	assert.equal(port.closed, 1)
})

test('a stale port error does not take down the new port', () => {
	const ports = []
	let n = 0
	const { conn, advance } = setup((p) => {
		const q = { ...p, onError: (cb) => (q.error = cb), onData: () => {}, close() {} }
		ports.push(q)
		return n++ === 0 || n > 1 ? q : undefined
	})
	conn.start()
	ports[0].error()
	advance(5000)
	assert.equal(conn.online, true)
	ports[0].error()
	assert.equal(conn.online, true)
})

test('initial workspace is loaded but not sent', () => {
	const s = emptyState()
	s.mixes[0].channels.pb12.volL = 4242
	const { conn, port, advance } = setup((p) => p, s)
	conn.start()
	advance(1000)
	assert.equal(conn.state.mixes[0].channels.pb12.volL, 4242)
	assert.equal(port.written.length, 0)
})

test('no workspace: a reconnect does not push default state', () => {
	let up = false
	const { conn, port, advance } = setup((p) => (up ? p : undefined))
	conn.start()
	up = true
	advance(6000)
	assert.equal(conn.online, true)
	assert.equal(port.written.length, 0)
})

test('close() throwing does not escape stop() or offline', () => {
	const { conn, port } = setup((p) => p)
	conn.start()
	port.throwOnClose = true
	assert.doesNotThrow(() => conn.stop())
	assert.equal(conn.online, false)
})

test('a watched change sends only the differences', () => {
	const { conn, port, advance, watched } = setup((p) => p, emptyState())
	conn.start()
	const s = emptyState()
	s.mixes[0].channels.pb12.volL = 4242
	watched(s)
	advance(100)
	assert.ok(port.written.length > 0)
	assert.deepEqual(port.written.map((b) => decodeReport(b)), diffReports(emptyState(), s))
	assert.equal(conn.state, s)
})

test('no workspace: the first watched workspace is loaded but not sent', () => {
	const { conn, port, advance, watched } = setup((p) => p)
	conn.start()
	const s = emptyState()
	s.mixes[0].channels.pb12.volL = 4242
	watched(s)
	advance(100)
	assert.equal(conn.loaded, true)
	assert.equal(conn.state, s)
	assert.equal(port.written.length, 0)
})

test('no workspace: update sends nothing and keeps the state', () => {
	const { conn, port, advance } = setup((p) => p)
	conn.start()
	const before = conn.state
	conn.update((s) => (s.mixes[0].channels.pb12.volL = 123456))
	advance(100)
	assert.equal(conn.loaded, false)
	assert.equal(conn.state, before)
	assert.equal(port.written.length, 0)
})

test('no workspace: the read is retried every 5 s until one loads', () => {
	let s
	const { conn, port, advance } = setup((p) => p, () => {
		if (!s) throw new Error('no file yet')
		return s
	})
	let n = 0
	conn.start()
	conn.onChange(() => n++)
	advance(5000)
	assert.equal(conn.loaded, false)
	s = emptyState()
	s.mixes[0].channels.pb12.volL = 4242
	advance(5000)
	assert.equal(conn.loaded, true)
	assert.equal(conn.state, s)
	assert.ok(n > 0)
	assert.equal(port.written.length, 0)
})

test('device buttons update the state without sending (capture 2026-11-14: INST, MON, 48V, Gain pressed on the E2x2)', () => {
	const { conn, port } = setup((p) => p, emptyState())
	conn.start()
	let n = 0
	conn.onChange(() => n++)
	const before = port.written.length
	port.data(Buffer.from('22332001012103000000014cc1667700', 'hex')) // INST 1 on
	port.data(Buffer.from('2233200101230300000001aec0667700', 'hex')) // INST 2 on
	port.data(Buffer.from('22332001012101000000014cc1667700', 'hex')) // MON 1 on
	port.data(Buffer.from('22332001012302000000014cc1667700', 'hex')) // 48V 2 on
	port.data(Buffer.from('2233200101350200000000583e667700', 'hex')) // Gain off
	assert.equal(conn.state.inputs.in1.inst, true)
	assert.equal(conn.state.inputs.in2.inst, true)
	assert.equal(conn.state.inputs.in1.mon, true)
	assert.equal(conn.state.inputs.in2.p48v, true)
	assert.equal(conn.state.inputs.in1.p48v, false)
	assert.equal(conn.state.outputs.out12.gainBtn, false)
	port.data(Buffer.from('223320010135020000000198ff667700', 'hex')) // Gain on
	assert.equal(conn.state.outputs.out12.gainBtn, true)
	port.data(Buffer.from('22332001012103000000008c00667700', 'hex')) // INST 1 off
	assert.equal(conn.state.inputs.in1.inst, false)
	assert.equal(port.written.length, before) // the device already has these values
	assert.ok(n >= 7)
	// the knob (35 03) is not modelled: ignored
	port.data(Buffer.from('22332001013503000000039943667700', 'hex'))
	assert.equal(conn.state.outputs.out12.gainBtn, true)
})
