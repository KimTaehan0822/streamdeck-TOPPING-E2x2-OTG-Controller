import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodeReport } from '../dist/protocol/report.js'
import { emptyState, setLink } from '../dist/state/mixer-state.js'
import { diffReports, mixReports, stateReports } from '../dist/state/crosspoints.js'

const fixture = readFileSync(new URL('./fixtures/app-startup-reports.tsv', import.meta.url), 'utf8')
	.split(/\r?\n/)
	.filter(Boolean)
	.map((line) => decodeReport(Buffer.from('00' + line.split('\t')[1], 'hex')))
	.slice(1) // 11 01 start command

const V = 0x01ffffe0
const clone = (s) => structuredClone(s)
const valueOf = (reports, group, item) => reports.find((r) => r.group === group && r.item === item)?.value

/** Mix A with every channel audible at V. */
function audible() {
	const s = emptyState()
	for (const ch of Object.values(s.mixes[0].channels)) ch.volL = ch.volR = V
	return s
}

test('stateReports follows the app startup order', () => {
	const got = stateReports(emptyState()).map((r) => [r.group, r.item])
	assert.equal(got.length, 138)
	assert.deepEqual(got, fixture.map((r) => [r.group, r.item]))
})

test('mixReports gives the 24 crosspoints of one mix', () => {
	const r = mixReports(emptyState(), 2)
	assert.equal(r.length, 24)
	assert.ok(r.every((x) => x.group === 0x65 || x.group === 0x66))
})

test('fader change while muted restores the new value', () => {
	const a = audible()
	const muted = clone(a)
	muted.mixes[0].channels.pb12.muteL = true
	assert.equal(valueOf(diffReports(a, muted), 0x61, 5), 0)
	const moved = clone(muted)
	moved.mixes[0].channels.pb12.volL = 0x01000000
	assert.equal(valueOf(stateReports(moved), 0x61, 5), 0)
	assert.ok(diffReports(muted, moved).every((r) => r.value === 0))
	const unmuted = clone(moved)
	unmuted.mixes[0].channels.pb12.muteL = false
	assert.equal(valueOf(diffReports(moved, unmuted), 0x61, 5), 0x01000000)
	assert.deepEqual(diffReports(unmuted, unmuted), [])
})

test('two solos keep both audible', () => {
	const a = audible()
	const s = clone(a)
	const ch = s.mixes[0].channels
	ch.pb12.soloL = ch.pb12.soloR = ch.pb34.soloL = ch.pb34.soloR = true
	let r = stateReports(s)
	assert.equal(valueOf(r, 0x61, 1), 0)
	assert.equal(valueOf(r, 0x61, 5), V)
	assert.equal(valueOf(r, 0x62, 8), V)
	ch.pb12.soloL = ch.pb12.soloR = false
	r = stateReports(s)
	assert.equal(valueOf(r, 0x61, 5), 0)
	assert.equal(valueOf(r, 0x61, 7), V)
	ch.pb34.soloL = ch.pb34.soloR = false
	assert.deepEqual(stateReports(s), stateReports(a))
})

test('phase survives mute', () => {
	const s = emptyState()
	Object.assign(s.inputs.in2, { phase: true, mute: true })
	assert.equal(valueOf(stateReports(s), 0x23, 5), 0)
	s.inputs.in2.mute = false
	assert.equal(valueOf(stateReports(s), 0x23, 5), -0x02000000)
})

test('link off splits a stereo pair into two centred monos', () => {
	const s = audible()
	setLink(s, 0, 'pb12', false)
	let r = stateReports(s)
	assert.equal(valueOf(r, 0x61, 5), 0x00fffff0)
	assert.equal(valueOf(r, 0x62, 5), 0x00fffff0)
	assert.equal(valueOf(r, 0x61, 6), 0x00fffff0)
	setLink(s, 0, 'pb12', true)
	r = stateReports(s)
	assert.deepEqual([0x61, 0x62, 0x61, 0x62].map((g, i) => valueOf(r, g, 5 + (i >> 1))), [V, 0, 0, V])
})

test('mono pan left', () => {
	const s = audible()
	s.mixes[0].channels.in12.panL = 0
	const r = stateReports(s)
	assert.equal(valueOf(r, 0x61, 1), V)
	assert.equal(valueOf(r, 0x62, 1), 0)
})

test('mix channel phase inverts, output mute zeroes the volume report', () => {
	const s = audible()
	s.mixes[0].channels.pb12.phaseL = true
	s.outputs.out12.muteR = true
	const r = stateReports(s)
	assert.equal(valueOf(r, 0x61, 5), -V)
	assert.equal(valueOf(r, 0x62, 5), 0)
	assert.equal(valueOf(r, 0x32, 3), 0)
	assert.deepEqual(JSON.parse(JSON.stringify(s)), s)
})

test('input solo is stored but sends nothing yet', () => {
	const a = emptyState()
	const b = clone(a)
	b.inputs.in1.solo = true
	assert.deepEqual(diffReports(a, b), [])
})
