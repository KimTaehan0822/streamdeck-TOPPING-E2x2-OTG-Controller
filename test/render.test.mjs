import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { dbToLevel } from '../dist/protocol/meter.js'
import { renderButtonFader, renderSourceKey, renderToggleKey, renderValueKey, renderVuStrip, renderWorkspaceKey } from '../dist/render/keys.js'

const lv = dbToLevel
const texts = (svg) => [...svg.matchAll(/font-size="([\d.]+)"[^>]*>([^<]*)</g)].map((m) => ({ size: +m[1], t: m[2] }))
const none = 'none'
const mv = (o = {}) => ({ name: 'PB 1/2', left: lv(-10), right: lv(-14), fader: lv(-3), faderDb: '-3.0 dB', levelDb: '-9.0', muted: false, overlay: none, ...o })
const tg = (o = {}) => ({ title: 'MUTE', label: 'PB 1/2', on: false, color: 'red', overlay: none, ...o })

// Samples mirror the approved mockup; written out for eyeballing (contact sheet).
const samples = {
	'toggle-mute-off-a': renderToggleKey(tg({ mix: 0 })),
	'toggle-mute-on-b': renderToggleKey(tg({ mix: 1, on: true })),
	'toggle-solo-on-c': renderToggleKey(tg({ title: 'SOLO', mix: 2, label: 'IN 1', on: true, color: 'yellow' })),
	'toggle-link-off-d': renderToggleKey(tg({ title: 'LINK', mix: 3, label: 'IN 1/2', color: 'blue' })),
	'toggle-48v-on': renderToggleKey(tg({ title: '48V', label: 'IN 1', on: true, color: 'blue' })),
	'toggle-out-mute': renderToggleKey(tg({ label: 'Out 1/2' })),
	'value-mix-meter': renderValueKey({ mix: 0, name: 'PB 1/2', value: '-3.0 dB', meter: { left: lv(-10), right: lv(-14), fader: lv(-3) }, overlay: none }),
	'value-mix-bar': renderValueKey({ mix: 1, name: 'IN 1', value: '-12.5 dB', bar: 0.45, overlay: none }),
	'value-gain': renderValueKey({ name: 'IN 1 게인', value: '+12 dB', bar: 0.8, overlay: none }),
	'value-monitor': renderValueKey({ name: 'Monitor', value: '-8.0 dB', bar: 0.55, overlay: none }),
	'source-mix-a': renderSourceKey({ target: 'Out 1/2', source: 'MIX A', sourceMix: 0, overlay: none }),
	'source-mix-d': renderSourceKey({ target: 'Mobile Out', source: 'MIX D', sourceMix: 3, overlay: none }),
	'source-loop': renderSourceKey({ target: 'Loop 1/2', source: 'PB 3/4', overlay: none }),
	'workspace-load': renderWorkspaceKey({ mode: 'load', name: 'Stream', active: true, overlay: none }),
	'workspace-save': renderWorkspaceKey({ mode: 'save', name: 'Backup', active: false, overlay: none }),
	'vu-playing': renderVuStrip(mv({ mix: 0, left: lv(-9), right: lv(-14) })),
	'vu-input': renderVuStrip(mv({ mix: 2, name: 'IN 1', left: lv(-18), right: lv(-18), fader: lv(-6), levelDb: '-18.0', faderDb: '-6.0 dB' })),
	'vu-loud': renderVuStrip(mv({ name: 'Out 1/2', left: lv(-1), right: lv(-2), fader: 1, levelDb: '-1.0', faderDb: '0.0 dB' })),
	'vu-muted': renderVuStrip(mv({ name: 'Loop 1/2', left: lv(-30), right: lv(-30), fader: lv(-12), muted: true })),
	'vu-offline': renderVuStrip(mv({ mix: 1, left: 0, right: 0, levelDb: '-∞', overlay: 'offline' })),
}
const f1 = mv({ mix: 0, left: lv(-10), right: lv(-16), fader: lv(-4.5), faderDb: '-4.5 dB' })
const f2 = mv({ mix: 3, name: 'IN 1', left: lv(-30), right: lv(-32), fader: lv(-15), faderDb: '-15 dB', muted: true })
const f3 = mv({ name: 'Out 1/2', left: lv(-12), right: lv(-12), fader: lv(-6), faderDb: '-6.0 dB' })
for (const [n, f] of [['normal', f1], ['muted', f2], ['out', f3]])
	for (const r of ['top', 'bottom']) samples[`fader-${n}-${r}`] = renderButtonFader(f, r)

const LONG = 'Playback 7/8 Left'
const HAN = '마이크 입력 채널'
Object.assign(samples, {
	'long-toggle-mix': renderToggleKey(tg({ mix: 0, label: LONG })),
	'long-toggle-nomix': renderToggleKey(tg({ title: '48V', label: HAN, on: true, color: 'blue' })),
	'long-toggle-both': renderToggleKey(tg({ title: 'Solo Mute', mix: 1, label: LONG, on: true })),
	'long-value-mix': renderValueKey({ mix: 3, name: LONG, value: '-3.0 dB', meter: { left: 0.6, right: 0.5, fader: 0.8 }, overlay: none }),
	'long-source': renderSourceKey({ target: 'Out 1/2', source: 'Playback 7/8 Left', overlay: none }),
	'long-source-han': renderSourceKey({ target: 'Mobile Out', source: HAN, overlay: none }),
	'long-fader-top': renderButtonFader(mv({ mix: 2, name: LONG }), 'top'),
	'long-fader-bottom': renderButtonFader(mv({ mix: 2, name: LONG }), 'bottom'),
	'long-vu': renderVuStrip(mv({ mix: 1, name: LONG })),
})

// Two-key faders: short / long / Hangul / no-mix names, cap at the top, middle (the seam), 0 dB and the bottom, every role.
const PAIRS = {}
for (const [n, o] of [['short', { mix: 0 }], ['long', { mix: 2, name: LONG }], ['han', { mix: 1, name: HAN }], ['out', { name: 'Out 1/2' }]])
	for (const [fn, f] of [['max', 1], ['mid', 0.5], ['0db', 0.8], ['min', 0]])
		for (const r of ['top', 'bottom', 'left', 'right']) PAIRS[`pair-${n}-${fn}-${r}`] = renderButtonFader(mv({ ...o, fader: f, left: 0.55, right: 0.4, faderDb: '+12.0 dB', levelDb: '-9 dB' }), r)
Object.assign(samples, PAIRS)

// Level dB contact sheet: every role for short / long / Hangul names, muted, silent and a channel without a meter.
const LV = {}
const LVCASES = [['peek', { mix: 3, muted: true, peek: true }], ['short', { mix: 0 }], ['long', { mix: 2, name: LONG }], ['han', { mix: 1, name: HAN }], ['muted', { mix: 3, muted: true }], ['silent', { mix: 0, left: 0, right: 0, levelDb: '-∞' }], ['nometer', { mix: 0, left: 0, right: 0, levelDb: '' }]]
for (const [n, o] of LVCASES)
	for (const r of ['top', 'bottom', 'left', 'right']) LV[`lv-${n}-${r}`] = renderButtonFader(mv({ fader: 0.62, left: 0.55, right: 0.4, faderDb: '-4.5 dB', levelDb: '-9 dB', ...o }), r)
Object.assign(samples, LV)

mkdirSync(new URL('./out/', import.meta.url), { recursive: true })
for (const [n, s] of Object.entries(samples)) writeFileSync(new URL(`./out/${n}.svg`, import.meta.url), s)
{
	const img = (n) => `<img src="${n}.svg" width="144" style="display:block">`
	const cell = (n) => `<div style="margin:6px 12px;font:11px sans-serif;color:#888"><div style="display:flex;gap:18px"><div>${img(`lv-${n}-top`)}${img(`lv-${n}-bottom`)}</div><div style="display:flex;align-self:flex-start">${img(`lv-${n}-left`)}${img(`lv-${n}-right`)}</div></div>${n}</div>`
	const row = (a) => '<div style="display:flex">' + a.map(cell).join('') + '</div>'
	writeFileSync(new URL('./out/contact-level.html', import.meta.url), '<body style="background:#000;margin:10px">' + row(['short', 'long', 'han']) + row(['muted', 'silent', 'nometer']) + row(['peek']) + '</body>')
}
// Contact sheet: per name and cap position, the vertical pair (top over bottom) and the horizontal pair (left, right).
{
	const img = (n) => `<img src="${n}.svg" width="144" style="display:block">`
	const cell = (n, fn) =>
		`<div style="margin:6px 10px;font:11px sans-serif;color:#888"><div style="display:flex;gap:18px"><div>${img(`pair-${n}-${fn}-top`)}${img(`pair-${n}-${fn}-bottom`)}</div><div style="display:flex;align-self:flex-start">${img(`pair-${n}-${fn}-left`)}${img(`pair-${n}-${fn}-right`)}</div></div>${n} ${fn}</div>`
	const rows = ['short', 'long', 'han', 'out'].map((n) => '<div style="display:flex">' + ['max', 'mid', '0db', 'min'].map((fn) => cell(n, fn)).join('') + '</div>')
	writeFileSync(new URL('./out/contact-fader2.html', import.meta.url), '<body style="background:#000;margin:10px">' + rows.join('') + '</body>')
}

test('every renderer returns an svg', () => {
	for (const [n, s] of Object.entries(samples)) assert.ok(s.startsWith('<svg'), n)
})

test('theme background replaces black', () => {
	assert.ok(samples['toggle-48v-on'].includes('fill="#1F1F1F"'))
	assert.ok(!samples['value-gain'].includes('fill="#000"/>'))
})

test('on toggle uses the app blue; off does not', () => {
	assert.ok(renderToggleKey(tg({ on: true, color: 'blue' })).includes('#4261C0'))
	assert.ok(!renderToggleKey(tg({ on: false, color: 'blue' })).includes('#4261C0'))
})

test('mix views name the mix in its colour', () => {
	assert.ok(samples['vu-playing'].includes('MIX A') && samples['vu-playing'].includes('#75CB75'))
	assert.ok(samples['fader-normal-top'].includes('MIX A') && samples['fader-normal-top'].includes('#75CB75'))
	assert.ok(samples['fader-muted-top'].includes('MIX D') && samples['fader-muted-top'].includes('#FFA500'))
	assert.ok(!samples['vu-loud'].includes('MIX'))
	assert.ok(samples['source-mix-a'].includes('#75CB75'))
})

test('on toggle with a mix has the dark chip', () => {
	const on = samples['toggle-mute-on-b']
	assert.ok(on.includes('MIX B') && on.includes('#309BE8'))
	assert.ok(on.includes('rx="5" fill="#1F1F1F"'))
	assert.ok(!samples['toggle-48v-on'].includes('rx="5"'))
})

test('muted meters are grey and show MUTED', () => {
	assert.ok(samples['vu-muted'].includes('#555') && samples['vu-muted'].includes('MUTED'))
	assert.ok(!samples['vu-muted'].includes('url(#'))
	assert.ok(samples['fader-muted-bottom'].includes('MUTED') && !samples['fader-muted-bottom'].includes('-15 dB'))
	assert.ok(samples['vu-playing'].includes('url(#') && !samples['vu-playing'].includes('MUTED'))
})

test('meter fill height is proportional to level', () => {
	const h = (svg) => +/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)" fill="url/.exec(svg)[1]
	const a = h(renderValueKey({ name: 'x', value: 'y', meter: { left: 0.2, right: 0, fader: 0 }, overlay: none }))
	const b = h(renderButtonFader(mv({ left: 0.95 }), 'top'))
	const c = h(renderButtonFader(mv({ left: 0.85 }), 'top'))
	assert.ok(a > 0 && b > c) // top part: 0.95 taller than 0.85
	const seam = 108 / (108 + 144 - 110.08) // the seam on the axis
	assert.ok(Math.abs(b / c - (0.95 - seam) / (0.85 - seam)) < 1e-6)
})

test('fader cap sits in the half that holds it', () => {
	const capRect = (svg) => svg.includes('rx="2" fill="#D8D8D8"')
	assert.ok(capRect(renderButtonFader(mv({ fader: 0.9 }), 'top')) && !capRect(renderButtonFader(mv({ fader: 0.9 }), 'bottom')))
	assert.ok(capRect(renderButtonFader(mv({ fader: 0.2 }), 'bottom')) && !capRect(renderButtonFader(mv({ fader: 0.2 }), 'top')))
})

test('overlay dims the body', () => {
	assert.ok(samples['vu-offline'].includes('OFFLINE') && samples['vu-offline'].includes('opacity'))
})

test('dbToLevel follows the app scale', () => {
	for (const [db, l] of [[0, 1], [-6, 0.84], [-12, 0.68], [-24, 0.44], [-60, 0], [-20, 0.52]]) assert.ok(Math.abs(lv(db) - l) < 1e-9, String(db))
})


test('long text wraps to two rows instead of shrinking', () => {
	for (const [n, base, want] of [['long-toggle-mix', 26, ['Playback', '7/8 Left']], ['long-value-mix', 24, ['Playback', '7/8 Left']], ['long-source', 30, ['Playback', '7/8 Left']]]) {
		const rows = texts(samples[n]).filter((x) => want.some((w) => x.t.includes(w.replace('7/8 Left', 'Left'))))
		assert.equal(rows.length, 2, n)
		assert.ok(rows.every((r) => r.size >= base * 0.85), `${n} ${rows.map((r) => r.size)}`)
	}
	// Hangul is drawn at 0.82 of the requested size
	for (const [n, base, w] of [['long-toggle-nomix', 26, ['마이크', '입력 채널']], ['long-source-han', 30, ['마이크', '입력 채널']]]) {
		const rows = texts(samples[n]).filter((x) => w.includes(x.t))
		assert.equal(rows.length, 2, n)
		assert.ok(rows.every((r) => r.size >= base * 0.85 * 0.82 - 0.1), `${n} ${rows.map((r) => r.size)}`)
	}
	const fader = texts(samples['long-fader-top']).filter((x) => x.t === 'Playback' || x.t === '7/8 Left')
	assert.equal(fader.length, 2)
	assert.ok(fader.every((r) => r.size >= 18)) // capped at 18 by the room under the slim plate
	assert.equal(texts(samples['long-toggle-both']).filter((x) => x.t === 'Playback' || x.t === '7/8 Left').length, 2)
})

test('short names keep one row', () => {
	assert.equal(texts(samples['toggle-mute-off-a']).filter((x) => x.t === 'PB 1/2').length, 1)
	assert.equal(texts(samples['fader-normal-top']).filter((x) => x.t === 'PB 1/2').length, 1)
})

test('the cap never covers the name rows, and the bars start below them', () => {
	const capY = (svg) => +/<rect x="[\d.-]+" y="([\d.-]+)"[^>]*rx="2" fill="#D8D8D8"/.exec(svg)?.[1]
	for (const n of ['short', 'long', 'han', 'out']) {
		assert.ok(capY(PAIRS[`pair-${n}-max-top`]) >= 100, n) // cap at the very top still starts below the name rows (which end at y=100)
		assert.ok(capY(PAIRS[`pair-${n}-min-left`]) >= 96, n) // horizontal cap sits in the band under the text (raised off the key's bottom bezel)
	}
	for (const [r, end] of [['top', 100], ['left', 96]]) for (const m of PAIRS[`pair-long-max-${r}`].matchAll(/y="([\d.]+)" font-family="[^"]*" font-size="([\d.]+)"/g)) assert.ok(+m[1] <= end + 0.35 * +m[2], r)
})

test('vertical pair: the bars meet at the seam with equal length and the cap straddles it', () => {
	const rects = (svg) => [...svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" fill="#0F0F0F"/g)].map((m) => [+m[1], +m[2]])
	const [[ty, th]] = rects(PAIRS['pair-short-mid-top'])
	const [[by, bh]] = rects(PAIRS['pair-short-mid-bottom'])
	assert.equal(ty + th, 144) // top box ends at the seam
	assert.equal(by, 0) // bottom box starts at it
	assert.ok(th < bh) // the bottom key holds more of the axis: its level dB row sits under it
	const capRect = (svg) => svg.includes('rx="2" fill="#D8D8D8"')
	const atSeam = (r) => renderButtonFader(mv({ fader: 108 / (108 + 144 - 110.08) }), r)
	assert.ok(capRect(atSeam('top')) && capRect(atSeam('bottom'))) // the cap at the seam's axis position straddles it
})

test('horizontal pair: bars continue across the seam, the cap sits in the right half, MIX X and the name are on the left key', () => {
	const boxes = (svg) => [...svg.matchAll(/<rect x="([\d.]+)" y="98" width="([\d.]+)" height="12" fill="#0F0F0F"/g)].map((m) => [+m[1], +m[2]])
	const [[lx, lw]] = boxes(PAIRS['pair-short-mid-left'])
	const [[rx, rw]] = boxes(PAIRS['pair-short-mid-right'])
	assert.equal(lx + lw, 144) // left bar reaches the seam
	assert.equal(rx, 0) // right bar starts at it
	assert.equal(lw, rw)
	const capRect = (svg) => svg.includes('rx="2" fill="#D8D8D8"')
	assert.ok(capRect(PAIRS['pair-short-0db-right']) && !capRect(PAIRS['pair-short-0db-left'])) // 0 dB = 0.8 of the axis: right half
	assert.ok(capRect(PAIRS['pair-short-min-left']) && !capRect(PAIRS['pair-short-min-right']))
	assert.ok(PAIRS['pair-short-mid-left'].includes('MIX A') && PAIRS['pair-short-mid-left'].includes('PB 1/2'))
	assert.ok(PAIRS['pair-short-mid-right'].includes('+12.0 dB') && !PAIRS['pair-short-mid-right'].includes('MIX A'))
})

const rowsOf = (svg) => texts(svg).map((x) => x.t)
test('two-key fader rows per role: name + fader dB, level dB, name + level dB, fader dB', () => {
	const t = (r) => rowsOf(LV[`lv-short-${r}`])
	assert.deepEqual(t('top'), ['MIX A', 'PB 1/2', '-4.5 dB'])
	assert.deepEqual(t('bottom'), ['-9 dB'])
	assert.deepEqual(t('left'), ['MIX A', 'PB 1/2', '-9 dB'])
	assert.deepEqual(t('right'), ['-4.5 dB'])
})

test('two-key fader: silent shows -∞, a channel without a meter shows no level row', () => {
	assert.deepEqual(rowsOf(LV['lv-silent-bottom']), ['-∞'])
	for (const r of ['bottom']) assert.deepEqual(rowsOf(LV[`lv-nometer-${r}`]), [])
	assert.deepEqual(rowsOf(LV['lv-nometer-left']), ['MIX A', 'PB 1/2'])
	assert.deepEqual(rowsOf(LV['lv-nometer-top']), ['MIX A', 'PB 1/2', '-4.5 dB']) // the fader dB stays
})

test('muted two-key fader hides the dB values and shows MUTED on the bottom / right key', () => {
	assert.deepEqual(rowsOf(LV['lv-muted-top']), ['MIX D', 'PB 1/2'])
	assert.deepEqual(rowsOf(LV['lv-muted-left']), ['MIX D', 'PB 1/2'])
	assert.deepEqual(rowsOf(LV['lv-muted-bottom']), ['MUTED'])
	assert.deepEqual(rowsOf(LV['lv-muted-right']), ['MUTED'])
})

test('muted + peek keeps the grey bars, hides the level dB and shows the fader dB in the MUTED slot', () => {
	for (const r of ['top', 'bottom', 'left', 'right']) assert.ok(!LV[`lv-peek-${r}`].includes('fill="url(#'), r)
	for (const r of ['bottom', 'left', 'right']) assert.ok(LV[`lv-peek-${r}`].includes('#555'), r)
	assert.deepEqual(rowsOf(LV['lv-peek-top']), ['MIX D', 'PB 1/2'])
	assert.deepEqual(rowsOf(LV['lv-peek-left']), ['MIX D', 'PB 1/2'])
	assert.deepEqual(rowsOf(LV['lv-peek-bottom']), ['-4.5 dB'])
	assert.deepEqual(rowsOf(LV['lv-peek-right']), ['-4.5 dB'])
	const strip = (o) => renderVuStrip(mv({ muted: true, faderDb: '-4.5 dB', levelDb: '-9 dB', ...o }))
	assert.deepEqual(rowsOf(strip({})).filter((t) => /MUTED|dB/.test(t)), ['MUTED'])
	const pk = strip({ peek: true })
	assert.deepEqual(rowsOf(pk).filter((t) => /MUTED|dB/.test(t)), ['-4.5 dB'])
	assert.ok(pk.includes('#555') && !pk.includes('url(#'))
})

test('the muted two-key fader shows MUTED on the dB key for every role', () => {
	for (const r of ['bottom', 'right']) assert.ok(renderButtonFader(mv({ muted: true }), r).includes('MUTED'), r)
	for (const r of ['top', 'left']) assert.ok(!renderButtonFader(mv({ muted: true }), r).includes('MUTED'), r)
})
