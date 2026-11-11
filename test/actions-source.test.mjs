import assert from 'node:assert/strict'
import test from 'node:test'
import { nextSource, sourceSpec, SOURCE_ORDER } from '../dist/actions/source-spec.js'
import { E2x2Connection } from '../dist/connection.js'
import { decodeReport } from '../dist/protocol/report.js'
import { SOURCES } from '../dist/model/e2x2.js'
import { emptyState } from '../dist/state/mixer-state.js'

function setup(source) {
	const s = emptyState()
	if (source) s.outputs.mobile.source = SOURCES[source]
	const port = { written: [], write: (b) => port.written.push(b), onData() {}, onError() {}, close() {} }
	const conn = new E2x2Connection({ open: () => port, read: () => s, watch: () => () => {}, setInterval: () => 0, setTimeout: (fn) => fn() })
	conn.start()
	port.written.length = 0
	const sent = () => port.written.map((b) => decodeReport(b)).map(({ group, item, value }) => ({ group, item, value }))
	return { conn, sent }
}
const press = (conn, settings) => sourceSpec(settings).press(conn, settings)
const cur = (conn, settings) => sourceSpec(settings).current(conn.state)

test('cycleMix goes A->B->C->D->A and sends the source report', () => {
	const { conn, sent } = setup('mixA')
	const st = { target: 'mobile', mode: 'cycleMix' }
	const seen = []
	for (let i = 0; i < 5; i++) {
		press(conn, st)
		seen.push(cur(conn, st))
	}
	assert.deepEqual(seen, ['mixB', 'mixC', 'mixD', 'mixA', 'mixB'])
	assert.deepEqual(sent()[0], { group: 0x36, item: 1, value: SOURCES.mixB }) // Mobile Out source
	assert.equal(sent().length, 5)
})

test('cycleMix from a non-mix source goes to MIX A; a loopback uses its own report', () => {
	const { conn, sent } = setup('in1')
	press(conn, { target: 'mobile' }) // missing mode = cycleMix
	assert.equal(conn.state.outputs.mobile.source, SOURCES.mixA)
	press(conn, { target: 'lp34', mode: 'cycleMix' })
	assert.equal(conn.state.loopbacks.lp34.source, SOURCES.mixA)
	assert.deepEqual(sent()[1], { group: 0x58, item: 1, value: SOURCES.mixA })
})

test('cycleList only visits the ticked sources, in the fixed order', () => {
	const { conn } = setup('in2') // not in the list -> first of the list
	const st = { target: 'mobile', mode: 'cycleList', list: ['pb12', 'mixB', 'in1', 'bogus'] }
	const seen = []
	for (let i = 0; i < 4; i++) {
		press(conn, st)
		seen.push(cur(conn, st))
	}
	assert.deepEqual(seen, ['mixB', 'in1', 'pb12', 'mixB'])
	assert.equal(nextSource('cycleList', 'mixA', { list: [] }), undefined)
	assert.equal(nextSource('cycleList', 'mixA', {}), undefined)
})

test('toggle flips between two sources; anything else goes to the first', () => {
	const { conn } = setup('mixC')
	const st = { target: 'mobile', mode: 'toggle', a: 'pb12', b: 'mixA' }
	const seen = []
	for (let i = 0; i < 3; i++) {
		press(conn, st)
		seen.push(cur(conn, st))
	}
	assert.deepEqual(seen, ['pb12', 'mixA', 'pb12'])
	const before = conn.state.outputs.mobile.source
	press(conn, { target: 'mobile', mode: 'toggle', a: 'pb12' }) // incomplete: nothing happens
	press(conn, { target: 'mobile', mode: 'toggle', a: 'pb12', b: 'pb12' })
	assert.equal(conn.state.outputs.mobile.source, before)
})

test('all 12 sources exist; bad settings give no spec', () => {
	assert.equal(SOURCE_ORDER.length, 12)
	assert.equal(sourceSpec({}), undefined)
	assert.equal(sourceSpec({ target: 'out99' }), undefined)
	assert.equal(sourceSpec({ target: 'spdif', mode: 'nope' }), undefined)
	const { conn } = setup()
	conn.update((s) => (s.outputs.spdif.source = SOURCES.pb78))
	press(conn, { target: 'spdif', mode: 'cycleList', list: SOURCE_ORDER }) // last -> wraps to first
	assert.equal(conn.state.outputs.spdif.source, SOURCES.mixA)
})
