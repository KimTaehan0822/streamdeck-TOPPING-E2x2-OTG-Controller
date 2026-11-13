import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createMeterParser, dbToLevel, parseMeter } from '../dist/protocol/meter.js'

const rows = readFileSync(new URL('./fixtures/meter-calibration.tsv', import.meta.url), 'utf8')
	.split(/\r?\n/)
	.filter(Boolean)
	.map((l) => {
		const [, ms, hex] = l.split('\t')
		return { ms: +ms, bytes: Uint8Array.from(Buffer.from(hex, 'hex')) }
	})
const parse = createMeterParser()
const meters = rows.map((r) => ({ ms: r.ms, ...parse(r.bytes) }))
const seg = (a, b) => meters.filter((m) => m.ms >= a && m.ms <= b)
const median = (xs) => xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)]
const med = (ms, ch) => median(ms.filter((m) => m.channel === ch).map((m) => m.db))

test('single report decodes the example', () => {
	const m = parseMeter(Uint8Array.from(Buffer.from('22332001013101FFFFFF391AFA667700', 'hex')))
	assert.equal(m.channel, 'out1L_A')
	assert.ok(Math.abs(m.db - -19.89) < 0.01)
	assert.equal(parseMeter(new Uint8Array(16)), undefined)
})

test('dbToLevel', () => {
	assert.equal(dbToLevel(-90.3), 0)
	assert.equal(dbToLevel(-96), 0)
	assert.equal(dbToLevel(0.5), 1)
	for (const [db, l] of [[0, 1], [-6, 0.84], [-12, 0.68], [-24, 0.44], [-60, 0], [-20, 0.52], [-3, 0.92], [-70, 0]]) assert.ok(Math.abs(dbToLevel(db) - l) < 1e-9, String(db))
})

test('burst maps to channels, second 33 01 is Mobile R', () => {
	const first = rows.findIndex((r) => r.bytes[5] === 0x5a)
	const names = rows.slice(first, first + 12).map((r, i) => meters[first + i].channel)
	assert.deepEqual(names, ['spdifL_B', 'spdifR_B', 'out1L_A', 'out2R_A', 'mobileL_A', 'mobileR_A', 'out1L_B', 'out2R_B', 'mobileL_B', 'mobileR_B', 'pb12L_A', 'pb12R_A'])
})

test('silence reads level 0', () => {
	const s = seg(10000, 18000)
	assert.ok(s.length > 100)
	assert.ok(s.every((m) => m.level === 0))
})

test('-20 dBFS tone', () => {
	const s = seg(20500, 27500)
	for (const ch of ['out1L_A', 'out2R_A', 'mobileL_A', 'mobileR_A', 'spdifL_B']) {
		const d = med(s, ch)
		assert.ok(Math.abs(d - -20) < 0.3, `${ch} ${d}`)
		assert.ok(Math.abs(dbToLevel(d) - 0.52) < 0.01)
	}
})

test('0 dBFS left only', () => {
	const s = seg(39500, 43500)
	for (const ch of ['out1L_A', 'mobileL_A', 'spdifL_B']) assert.ok(Math.abs(med(s, ch)) < 0.3, ch)
	for (const ch of ['out2R_A', 'mobileR_A', 'spdifR_B']) assert.equal(dbToLevel(med(s, ch)), 0, ch)
})

const load = (file) => {
	const p = createMeterParser()
	return readFileSync(new URL(`./fixtures/${file}.tsv`, import.meta.url), 'utf8')
		.split('\n')
		.filter((l) => l.trim())
		.map((l) => {
			const [, ms, hex] = l.trim().split('\t')
			return { ms: +ms, ...p(Uint8Array.from(Buffer.from(hex, 'hex'))) }
		})
}

test('tone on PB 1/2 shows in the pb12 channel, not pb34', () => {
	const s = seg(20500, 27500)
	assert.ok(Math.abs(med(s, 'pb12L_A') - -20) < 0.3)
	assert.ok(Math.abs(med(s, 'pb12R_A') - -20) < 0.3)
	assert.ok(meters.every((m) => !m.channel.startsWith('pb34') && !m.channel.startsWith('lp')))
})

test('tone on PB 3/4 only: pb34 follows it, loopback 1/2 follows, pb12 is silent', () => {
	const all = load('meter-pb34')
	const level = (ch, a, b) => median(all.filter((m) => m.channel === ch && m.ms >= a && m.ms <= b).map((m) => m.db))
	const t0 = all.find((m) => m.channel === 'pb34L_A' && m.db > -30).ms // first audible report
	for (const ch of ['pb34L_A', 'pb34R_A', 'lp12L_A', 'lp12R_A']) assert.ok(Math.abs(level(ch, t0 + 500, t0 + 5000) - -20) < 0.5, ch)
	assert.ok(all.every((m) => m.channel && !m.channel.startsWith('pb12')))
	assert.ok(all.some((m) => m.channel === 'out1L_A'))
})

test('input meters: 21 04 is IN 1, 23 04 is IN 2 (capture 2026-11-13, sound into IN 1 then IN 2)', () => {
	const in1 = parseMeter(Uint8Array.from(Buffer.from('22332001012104FFFFFD7ED875667700', 'hex')))
	assert.equal(in1.channel, 'in1L_A')
	assert.ok(Math.abs(in1.db - -64.1) < 0.1)
	const in2 = parseMeter(Uint8Array.from(Buffer.from('22332001012304FFFFFC796834667700', 'hex')))
	assert.equal(in2.channel, 'in2R_A')
	// item 04 elsewhere is unseen: ignored, so it cannot overwrite that channel's item 01 meter
	assert.equal(parseMeter(Uint8Array.from(Buffer.from('22332001014104FFFFFD7ED875667700', 'hex'))), undefined)
})

test('OTG meters: 22 04 is OTG L, 24 04 is OTG R (capture 2026-11-14, phone audio over OTG)', () => {
	const l = parseMeter(Uint8Array.from(Buffer.from('22332001012204FFFFFF196135667700', 'hex')))
	assert.equal(l.channel, 'otgL_A')
	assert.ok(Math.abs(l.db - -23.1) < 0.1)
	assert.equal(parseMeter(Uint8Array.from(Buffer.from('22332001012404FFFFFF196135667700', 'hex'))).channel, 'otgR_A')
})
