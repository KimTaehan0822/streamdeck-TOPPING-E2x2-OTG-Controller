import assert from 'node:assert/strict'
import test from 'node:test'
import { E2x2Connection } from '../dist/connection.js'
import { decodeReport, encodeReport } from '../dist/protocol/report.js'
import { stateReports } from '../dist/state/crosspoints.js'
import { emptyState } from '../dist/state/mixer-state.js'

function setup(openImpl) {
	let t = 0
	const timers = []
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
		close() {},
	}
	const add = (every) => (fn, ms) => timers.push({ at: t + ms, fn, every: every ? ms : 0 })
	const conn = new E2x2Connection({
		open: () => openImpl(port),
		setInterval: add(true),
		setTimeout: add(false),
		now: () => t,
		watch: () => () => {},
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
	return { conn, port, advance }
}

test('sends only changed crosspoints', () => {
	const { conn, port, advance } = setup((p) => p)
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
	const { conn, port, advance } = setup((p) => (up ? p : undefined))
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
