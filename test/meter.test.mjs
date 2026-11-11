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
	assert.deepEqual(names, ['spdifL_B', 'spdifR_B', 'out1L_A', 'out2R_A', 'mobileL_A', 'mobileR_A', 'out1L_B', 'out2R_B', 'mobileL_B', 'mobileR_B', 'aux41L_A', 'aux42R_A'])
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
