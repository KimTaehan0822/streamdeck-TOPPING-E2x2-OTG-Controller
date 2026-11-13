import assert from 'node:assert/strict'
import test from 'node:test'
import { effectiveSide, followMix, targetName, targetOf } from '../dist/actions/target.js'
import { emptyState } from '../dist/state/mixer-state.js'

test('targetOf rejects invalid settings', () => {
	assert.equal(targetOf({}), undefined)
	assert.equal(targetOf({ kind: 'bogus', mix: '0', channel: 'pb12' }), undefined)
	assert.equal(targetOf({ kind: 'mix', mix: '4', channel: 'pb12' }), undefined)
	assert.equal(targetOf({ kind: 'mix', mix: '-1', channel: 'pb12' }), undefined)
	assert.equal(targetOf({ kind: 'mix', mix: '', channel: 'pb12' }), undefined)
	assert.equal(targetOf({ kind: 'mix', mix: '1.5', channel: 'pb12' }), undefined)
	assert.equal(targetOf({ kind: 'mix', mix: '0', channel: 'nope' }), undefined)
	assert.equal(targetOf({ kind: 'mix', mix: '0', channel: 'out12' }), undefined)
	assert.equal(targetOf({ kind: 'mix', mix: '0', channel: 'pb12', side: 'X' }), undefined)
	assert.equal(targetOf({ kind: 'loopback', channel: 'out12' }), undefined)
	assert.equal(targetOf({ kind: 'output', channel: 'lp12' }), undefined)
})

test('targetOf parses each kind', () => {
	assert.deepEqual(targetOf({ kind: 'mix', mix: '2', channel: 'in12' }), { kind: 'mix', mix: 2, channel: 'in12', side: 'pair' })
	assert.deepEqual(targetOf({ kind: 'mix', mix: 3, channel: 'otg', side: 'L' }), { kind: 'mix', mix: 3, channel: 'otg', side: 'L' })
	assert.deepEqual(targetOf({ kind: 'loopback', channel: 'lp34', side: 'R' }), { kind: 'loopback', id: 'lp34', side: 'R' })
	assert.deepEqual(targetOf({ kind: 'output', channel: 'spdif', side: '' }), { kind: 'output', id: 'spdif', side: 'pair' })
})

test('a single side on a LINKed channel acts as the pair', () => {
	const s = emptyState()
	const t = targetOf({ kind: 'mix', mix: 1, channel: 'pb12', side: 'L' })
	assert.equal(s.mixes[1].channels.pb12.link, true)
	assert.equal(effectiveSide(t, s), 'pair')
	s.mixes[1].channels.pb12.link = false
	assert.equal(effectiveSide(t, s), 'L')
	assert.equal(effectiveSide(targetOf({ kind: 'mix', mix: 1, channel: 'in12', side: 'R' }), s), 'R') // in12 starts unlinked
	const o = targetOf({ kind: 'output', channel: 'out12', side: 'R' })
	assert.equal(effectiveSide(o, s), 'pair')
	s.outputs.out12.link = false
	assert.equal(effectiveSide(o, s), 'R')
	const l = targetOf({ kind: 'loopback', channel: 'lp12', side: 'L' })
	assert.equal(effectiveSide(l, s), 'pair')
	s.loopbacks.lp12.link = false
	assert.equal(effectiveSide(l, s), 'L')
	assert.equal(effectiveSide(targetOf({ kind: 'mix', mix: 0, channel: 'pb12' }), s), 'pair')
})

test('targetName gives the plain name without the mix', () => {
	const name = (settings) => targetName(targetOf(settings))
	assert.equal(name({ kind: 'mix', mix: 1, channel: 'pb12' }), 'PB 1/2')
	assert.equal(name({ kind: 'mix', mix: 0, channel: 'in12', side: 'L' }), 'IN 1/2 L')
	assert.equal(name({ kind: 'mix', mix: 0, channel: 'otg' }), 'OTG')
	assert.equal(name({ kind: 'loopback', channel: 'lp12' }), 'Loop 1/2')
	assert.equal(name({ kind: 'output', channel: 'out12' }), 'Out 1/2')
	assert.equal(name({ kind: 'output', channel: 'mobile', side: 'R' }), 'Mobile Out R')
	assert.equal(name({ kind: 'output', channel: 'spdif' }), 'S/PDIF')
})

test('followMix fills in the Mix the chosen output plays now; a non-Mix source gives undefined', async () => {
	const { SOURCES } = await import('../dist/model/e2x2.js')
	const { volSpec } = await import('../dist/actions/fader-spec.js')
	const s = emptyState()
	const keyed = { kind: 'mix', mix: '1', channel: 'pb12' }
	assert.equal(followMix(keyed, s), keyed) // a fixed Mix passes through
	s.outputs.out12.source = SOURCES.mixC
	s.outputs.mobile.source = SOURCES.mixA
	assert.deepEqual(followMix({ kind: 'mix', mix: 'follow', channel: 'pb12' }, s), { kind: 'mix', mix: 2, channel: 'pb12' }) // Out 1/2 by default
	assert.equal(followMix({ kind: 'mix', mix: 'follow', follow: 'mobile', channel: 'pb12' }, s).mix, 0)
	assert.equal(volSpec(followMix({ kind: 'mix', mix: 'follow', channel: 'otg' }, s)).mix, 2)
	s.outputs.out12.source = SOURCES.pb34
	assert.equal(followMix({ kind: 'mix', mix: 'follow', channel: 'pb12' }, s), undefined)
	// without following, 'follow' is not a Mix number: the key stays unset rather than guessing
	assert.equal(targetOf({ kind: 'mix', mix: 'follow', channel: 'pb12' }), undefined)
})
