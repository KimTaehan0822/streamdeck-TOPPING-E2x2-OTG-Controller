import assert from 'node:assert/strict'
import test from 'node:test'
import { inputOptionSpec, linkSpec, muteSpec, operation, outputRoomSpec, pressToggle, soloSpec } from '../dist/actions/toggle-spec.js'
import { E2x2Connection } from '../dist/connection.js'
import { decodeReport } from '../dist/protocol/report.js'
import { emptyState } from '../dist/state/mixer-state.js'

const V = 0x01ffffe0

/** Real connection on a fake HID port (writes are captured, nothing touches a device). */
function setup(mutate = () => {}) {
	const s = emptyState()
	for (const ch of Object.values(s.mixes[0].channels)) ch.volL = ch.volR = V
	mutate(s)
	const port = { written: [], write: (b) => port.written.push(b), onData() {}, onError() {}, close() {} }
	const conn = new E2x2Connection({ open: () => port, read: () => s, watch: () => () => {}, setInterval: () => 0, setTimeout: (fn) => fn() })
	conn.start()
	const sent = () => port.written.map((b) => decodeReport(b)).map(({ group, item, value }) => ({ group, item, value }))
	return { conn, sent, clear: () => (port.written.length = 0) }
}
const has = (reports, group, item, value) => reports.some((r) => r.group === group && r.item === item && r.value === value)

test('mute on a LINKed mix pair mutes both channels and sends only the changed crosspoints', () => {
	const { conn, sent } = setup()
	pressToggle(conn, muteSpec({ kind: 'mix', mix: '0', channel: 'pb12' }), 'toggle')
	const ch = conn.state.mixes[0].channels.pb12
	assert.equal(ch.muteL && ch.muteR, true)
	// PB 1/2 is hard-panned: L item 5 -> bus 0x61, R item 6 -> bus 0x62
	assert.deepEqual(sent(), [{ group: 0x61, item: 5, value: 0 }, { group: 0x62, item: 6, value: 0 }])
	pressToggle(conn, muteSpec({ kind: 'mix', mix: '0', channel: 'pb12' }), 'toggle')
	assert.equal(conn.state.mixes[0].channels.pb12.muteL, false)
})

test('mute on one side with LINK off touches only that side; with LINK on it acts on the pair', () => {
	const { conn, sent } = setup()
	pressToggle(conn, muteSpec({ kind: 'mix', mix: 0, channel: 'in12', side: 'L' }), 'on')
	const ch = conn.state.mixes[0].channels.in12
	assert.deepEqual([ch.muteL, ch.muteR], [true, false])
	assert.equal(sent().length, 2) // centred mono: both buses
	assert.ok(sent().every((r) => r.item === 1 && r.value === 0))

	const linked = setup()
	pressToggle(linked.conn, muteSpec({ kind: 'mix', mix: 0, channel: 'pb12', side: 'L' }), 'on')
	const p = linked.conn.state.mixes[0].channels.pb12
	assert.deepEqual([p.muteL, p.muteR], [true, true])
})

test('mute works on loopbacks and outputs; op on/off forces the state', () => {
	const { conn, sent } = setup()
	pressToggle(conn, muteSpec({ kind: 'output', channel: 'out12', side: 'pair' }), 'on')
	pressToggle(conn, muteSpec({ kind: 'output', channel: 'out12', side: 'pair' }), 'on')
	assert.deepEqual(sent(), [{ group: 0x31, item: 3, value: 0 }, { group: 0x32, item: 3, value: 0 }])
	assert.equal(conn.state.outputs.out12.muteL, true)
	pressToggle(conn, muteSpec({ kind: 'loopback', channel: 'lp12' }), 'on')
	assert.equal(conn.state.loopbacks.lp12.muteR, true)
	pressToggle(conn, muteSpec({ kind: 'output', channel: 'out12' }), 'off')
	assert.equal(conn.state.outputs.out12.muteR, false)
	assert.equal(operation('bogus'), 'toggle')
})

test('solo silences the other channels of the mix', () => {
	const { conn, sent } = setup()
	pressToggle(conn, soloSpec({ kind: 'mix', mix: 0, channel: 'pb12' }), 'toggle')
	assert.equal(conn.state.mixes[0].channels.pb12.soloL, true)
	const r = sent()
	assert.ok(has(r, 0x61, 3, 0)) // OTG L now silent
	assert.ok(!r.some((x) => x.item === 5 || x.item === 6)) // PB 1/2 itself unchanged
	assert.equal(soloSpec({ kind: 'output', channel: 'out12' }), undefined)
})

test('48V is sent to the input group', () => {
	const { conn, sent } = setup()
	pressToggle(conn, inputOptionSpec({ input: 'in1', option: 'p48v' }), 'toggle')
	assert.equal(conn.state.inputs.in1.p48v, true)
	assert.deepEqual(sent(), [{ group: 0x21, item: 2, value: 1 }])
})

test('phase flips the sign of the input gain; INST maps to its item', () => {
	const { conn, sent, clear } = setup()
	pressToggle(conn, inputOptionSpec({ input: 'in2', option: 'phase' }), 'toggle')
	assert.deepEqual(sent(), [{ group: 0x23, item: 5, value: -0x02000000 }])
	clear()
	pressToggle(conn, inputOptionSpec({ input: 'mobile', option: 'inst' }), 'toggle')
	assert.deepEqual(sent(), [{ group: 0x22, item: 3, value: 1 }])
	assert.equal(inputOptionSpec({ input: 'in1' }), undefined)
})

test('LINK toggle pans the pair hard L/R and sends the new crosspoints', () => {
	const { conn, sent } = setup()
	pressToggle(conn, linkSpec({ mix: '0', channel: 'in12' }), 'toggle')
	const ch = conn.state.mixes[0].channels.in12
	assert.deepEqual([ch.link, ch.panL, ch.panR], [true, 0, 1])
	assert.ok(has(sent(), 0x61, 1, V))
	pressToggle(conn, linkSpec({ mix: 0, channel: 'in12' }), 'toggle')
	assert.equal(conn.state.mixes[0].channels.in12.link, false)
})

test('output room: HP and Gain buttons', () => {
	const { conn, sent, clear } = setup()
	pressToggle(conn, outputRoomSpec({ button: 'hp' }), 'toggle')
	assert.equal(conn.state.phones.hp, false)
	assert.deepEqual(sent(), [{ group: 0x37, item: 1, value: 0 }])
	clear()
	pressToggle(conn, outputRoomSpec({ button: 'gain', output: 'out12' }), 'toggle')
	assert.equal(conn.state.outputs.out12.gainBtn, true)
	assert.deepEqual(sent(), [{ group: 0x35, item: 2, value: 1 }])
	assert.equal(outputRoomSpec({ button: 'gain' }).read(conn.state), true) // one headphone gain: no output to pick
})

test('specs read live state for the key face', () => {
	const { conn } = setup()
	const spec = muteSpec({ kind: 'mix', mix: 1, channel: 'otg' })
	assert.deepEqual([spec.title, spec.label, spec.mix, spec.color, spec.read(conn.state)], ['MUTE', 'OTG', 1, 'red', false])
})

test('a custom name replaces the key label on every toggle spec; blank keeps the default', () => {
	assert.equal(muteSpec({ kind: 'mix', mix: 0, channel: 'pb12', side: 'L', name: ' Music ' }).label, 'Music')
	assert.equal(muteSpec({ kind: 'mix', mix: 0, channel: 'pb12', side: 'L', name: '' }).label, 'PB 1/2 L')
	assert.equal(soloSpec({ mix: 1, channel: 'otg', name: 'Phone' }).label, 'Phone')
	assert.equal(linkSpec({ mix: 1, channel: 'pb12', name: 'Game' }).label, 'Game')
	assert.equal(inputOptionSpec({ input: 'in1', option: 'p48v', name: 'Vocal' }).label, 'Vocal')
	assert.equal(outputRoomSpec({ button: 'hp', name: 'Cans' }).label, 'Cans')
	const g = outputRoomSpec({ button: 'gain', name: 'Cans gain' })
	assert.deepEqual([g.title, g.labelOf(false), g.labelOf(true)], ['Cans gain', 'LOW', 'HIGH'])
	assert.equal(outputRoomSpec({ button: 'gain' }).title, 'HP GAIN')
	assert.equal(outputRoomSpec({ button: 'hp' }).label, 'Phones')
})
