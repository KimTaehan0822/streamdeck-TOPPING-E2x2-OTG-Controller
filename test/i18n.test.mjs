import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// The settings screens are written in English and translated through the TEXT table in ui/common.js.
// 1) every TEXT entry has exactly two real translations (Korean, Japanese);
// 2) every English text found in the screen files and in the plugin's messages is in TEXT, unless it is a device name.
const UI = 'com.haeunga0822.topping-e2x2.sdPlugin/ui/'
const common = readFileSync(UI + 'common.js', 'utf8').replace(/\r\n/g, '\n') // a Windows checkout has CRLF
const TEXT = new Function(`return ${common.match(/const TEXT = (\{[\s\S]*?\n\})\nlet language/)[1]}`)()

// Names of the device's own channels and buttons: shown as the device and the keys call them, so they stay English.
const DEVICE_NAMES = new Set([
	'Mix', 'Mobile', 'Mobile In', 'Mobile Out', 'Loop 1/2', 'Loop 3/4', 'Loop 5/6', 'Out 1/2', 'Phones',
	'Input 1', 'Input 2', 'Input 1+2', 'Playback 1+2', 'Playback 3+4', 'Playback 5+6', 'Playback 7+8',
])

test('every TEXT entry has a Korean and a Japanese translation', () => {
	for (const [en, tx] of Object.entries(TEXT)) {
		assert.equal(tx.length, 2, en)
		assert.ok(tx.every((t) => typeof t === 'string' && t.trim()), en)
		assert.match(tx[0], /[가-힣]/, `Korean: ${en}`)
		assert.match(tx[1], /[ぁ-んァ-ン一-龯]/, `Japanese: ${en}`)
	}
})

/** English texts a screen shows: quoted words, label/placeholder attributes, and text inside b/span/li/summary/option. */
function screenStrings(src) {
	const found = new Set()
	const add = (s) => {
		s = s.replace(/\s+/g, ' ').trim()
		if (s && !s.includes('${')) found.add(s)
	}
	for (const m of src.matchAll(/'([^'\n]+)'/g)) if (/^(?:[A-Z][a-z]|[A-Z] [a-z]|e\.g\.|Ø)/.test(m[1])) add(m[1])
	for (const m of src.matchAll(/\b(?:label|placeholder)="([^"]+)"/g)) add(m[1])
	for (const m of src.matchAll(/<(?:b|span|li|summary|option)\b[^>]*>([^<]+)</g)) if (/[A-Za-z]/.test(m[1])) add(m[1])
	return found
}

test('every English text on the settings screens is in TEXT', () => {
	const files = readdirSync(UI).filter((f) => (f.endsWith('.html') || f === 'target.js' || f === 'common.js'))
	const missing = []
	for (const f of files) {
		let src = readFileSync(UI + f, 'utf8')
		if (f === 'common.js') src = src.replace(/const TEXT = [\s\S]*?\nlet language/, '') // the table itself is not a screen text
		for (const s of screenStrings(src)) if (!(s in TEXT) && !DEVICE_NAMES.has(s) && !/^(English|한국어|日本語)$/.test(s)) missing.push(`${f}: ${s}`)
	}
	assert.deepEqual(missing, [])
})

test('every message the plugin sends to the workspace screen is in TEXT', () => {
	const src = ['src/actions/workspace-spec.ts', 'src/workspace/app.ts'].map((f) => readFileSync(f, 'utf8')).join('\n')
	const messages = [...src.matchAll(/'([A-Z][^'\n]* [^'\n]*\.)'/g)].map((m) => new Function(`return '${m[1]}'`)())
	assert.ok(messages.length >= 4) // invalid name, in use, exists, no template
	for (const m of messages) assert.ok(m in TEXT, m)
})
