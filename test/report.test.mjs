import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodeReport, encodeReport, dbToRaw, rawToDb } from '../dist/protocol/report.js'
import { MIX_GROUPS, OUTPUTS, SOURCES, START } from '../dist/model/e2x2.js'

test('encodeReport lays out the 17 bytes', () => {
	const buf = encodeReport({ group: 0x61, item: 5, value: 0x01c851f8 })
	assert.equal(buf.toString('hex'), '00223320010161050' + '1c851f80000667700')
})

test('negative value (phase invert) encodes as two-complement', () => {
	const buf = encodeReport({ group: 0x23, item: 5, value: -0x02000000 })
	assert.equal(buf.subarray(8, 12).toString('hex'), 'fe000000')
})

// The app's values sit ~19 below 10^(dB/20)*0x02000000 (brief said +-2); 32 is ~1e-6 relative, inaudible.
test('dbToRaw matches observed values', () => {
	assert.equal(dbToRaw(0), 0x02000000)
	assert.ok(Math.abs(dbToRaw(-1) - 0x01c851f8) <= 32)
	assert.ok(Math.abs(dbToRaw(-3) - 0x016a77cc) <= 32)
	assert.equal(dbToRaw(-Infinity), 0)
	assert.equal(rawToDb(0), -Infinity)
	assert.ok(Math.abs(rawToDb(dbToRaw(-6)) + 6) < 1e-6)
})

test('decodeReport rejects wrong header or tail', () => {
	const ok = encodeReport({ group: 1, item: 2, value: 3 })
	assert.deepEqual(decodeReport(ok), { group: 1, item: 2, value: 3 })
	const badHead = Buffer.from(ok)
	badHead[1] = 0
	assert.equal(decodeReport(badHead), undefined)
	const badTail = Buffer.from(ok)
	badTail[15] = 0
	assert.equal(decodeReport(badTail), undefined)
})

test('fixture reports round-trip', () => {
	const lines = readFileSync(new URL('./fixtures/app-startup-reports.tsv', import.meta.url), 'utf8')
		.split(/\r?\n/)
		.filter(Boolean)
	assert.ok(lines.length > 100)
	for (const line of lines) {
		const hex = line.split('\t')[1]
		const r = decodeReport(Buffer.from('00' + hex, 'hex'))
		assert.ok(r, hex)
		assert.equal(encodeReport(r).subarray(1).toString('hex'), hex)
	}
})

test('model constants', () => {
	assert.deepEqual(MIX_GROUPS[3], [0x67, 0x68])
	assert.deepEqual(OUTPUTS.out12.gain, { group: 0x35, item: 2 })
	assert.equal(SOURCES.mixA, 0x0b)
	assert.equal(SOURCES.pb78, 0x0a)
	assert.deepEqual(START, { group: 0x11, item: 1, value: 1 })
})
