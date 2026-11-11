import { bar, base, cap, plate, plateName } from './meter.js'
import { frame, fitSize, plainText, type Overlay } from './svg.js'
import { BG, DIM, KEY_COLORS, MIX_COLORS, ON, OUTLINE, PLATE_TEXT, TRACK, WHITE, WORKSPACE_ON_BG, WORKSPACE_ON_TEXT, mixName, type KeyColor, type Mix } from './theme.js'

const K = 144
const fit = (t: string, size: number, w: number) => fitSize(t, size, w, 10)
const text = (x: number, cy: number, t: string, size: number, fill: string, anchor?: 'start' | 'middle' | 'end') => {
	const s = fit(t, size, 128)
	return plainText(x, base(cy, s), t, { size: s, fill, anchor })
}

/** Mix name in its app colour on a dark chip, so it reads on any key colour. */
const chip = (cx: number, cy: number, mix: Mix, size: number) => {
	const w = mixName(mix).length * size * 0.62 + 14
	return `<rect x="${cx - w / 2}" y="${cy - size * 0.62}" width="${w}" height="${size * 1.24}" rx="5" fill="${BG}"/>` + plainText(cx, base(cy, size), mixName(mix), { size, fill: MIX_COLORS[mix] })
}

/** Switch key. With a mix: title / mix chip / label rows; otherwise title + label. `on` fills the whole key. */
export function renderToggleKey(v: { title: string; mix?: Mix; label: string; on: boolean; color: KeyColor; overlay: Overlay }): string {
	let b = `<rect width="${K}" height="${K}" fill="${v.on ? KEY_COLORS[v.color] : BG}"/>`
	if (!v.on) b += `<rect x="3" y="3" width="${K - 6}" height="${K - 6}" rx="10" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`
	const tc = v.on ? WHITE : DIM
	const lc = v.on ? WHITE : PLATE_TEXT
	if (v.mix !== undefined) b += text(72, 32, v.title, 24, tc) + chip(72, 74, v.mix, 24) + text(72, 114, v.label, 26, lc)
	else b += plainText(72, 62, v.title, { size: 26, fill: tc }) + text(72, 104, v.label, 26, lc)
	return frame(K, K, b, v.overlay)
}

/** Value key: plate with the name (mix in its colour, channel row under it), big value, optional bar or fader meter. */
export function renderValueKey(v: {
	mix?: Mix
	name: string
	value: string
	bar?: number
	meter?: { left: number; right: number; fader: number; muted?: boolean }
	overlay: Overlay
}): string {
	const m = v.mix !== undefined
	let b = m
		? plate(21, 34, plainText(72, base(21, 24), mixName(v.mix!), { size: 24, fill: MIX_COLORS[v.mix!] })) + text(72, 55, v.name, 24, PLATE_TEXT)
		: plate(21, 34, plateName(v.name, 21, 24))
	b += text(72, m ? 90 : 76, v.value, m ? 28 : 34, WHITE)
	const by = m ? 112 : 108
	if (v.meter) {
		const { left, right, fader, muted = false } = v.meter
		b += bar(10, by, 124, 6, left, false, muted) + bar(10, by + 8, 124, 6, right, false, muted) + cap(10 + 124 * fader, by + 7, 10, 22, false)
	} else if (v.bar !== undefined) {
		b += `<rect x="10" y="${by}" width="124" height="14" fill="${TRACK}"/><rect x="10" y="${by}" width="${124 * Math.max(0, Math.min(1, v.bar))}" height="14" fill="${ON}"/>`
	}
	return frame(K, K, b, v.overlay)
}

/** Output source key: target in the plate, the source below (in its colour when it is a mix) with a dropdown arrow. */
export function renderSourceKey(v: { target: string; source: string; sourceMix?: Mix; overlay: Overlay }): string {
	const col = v.sourceMix === undefined ? WHITE : MIX_COLORS[v.sourceMix]
	const s = fit(v.source, 30, 112)
	// Arrow follows the text; the width is the same estimate the mockup used (about 0.62 em per capital).
	const ax = 64 + (Array.from(v.source).length * s * 0.31 + 4)
	const b =
		plate(21, 34, plateName(v.target, 21, 24)) +
		plainText(64, base(86, s), v.source, { size: s, fill: col }) +
		`<path d="M${ax} 82 l12 0 l-6 8 z" fill="${col}"/>`
	return frame(K, K, b, v.overlay)
}

/** Workspace LOAD/SAVE key, laid out like the TotalMix snapshot key. */
export function renderWorkspaceKey(v: { mode: 'load' | 'save'; name: string; active: boolean; overlay: Overlay }): string {
	const b =
		`<rect width="${K}" height="${K}" fill="${v.active ? WORKSPACE_ON_BG : BG}"/>` +
		plainText(72, 40, v.mode === 'load' ? 'LOAD' : 'SAVE', { size: 22, fill: DIM }) +
		text(72, 96, v.name, 30, v.active ? WORKSPACE_ON_TEXT : WHITE)
	return frame(K, K, b, v.overlay)
}

export { renderVuStrip, renderButtonFader, type MeterView } from './meter.js'
