import { bar, base, cap, plate, plateName } from './meter.js'
import { fitSize, fitText, frame, plainText, textBlock, textWidth, wrapFit, type Overlay } from './svg.js'
import { BG, DIM, KEY_COLORS, MIX_COLORS, ON, OUTLINE, PLATE_TEXT, TRACK, WHITE, WORKSPACE_ON_BG, WORKSPACE_ON_TEXT, mixName, type KeyColor, type Mix } from './theme.js'

const K = 144
const fit = (t: string, size: number, w: number) => fitSize(t, size, w, 10)
type Block = { lines: string[]; size: number }
const wrap = (t: string, size: number, w = 128): Block => wrapFit(t, size, w, 10)
const height = (b: Block) => b.lines.length * b.size * 1.1
/** Centres of rows stacked around `cc`; the gap shrinks (down to 2) when the rows are tall. */
function stack(heights: number[], cc: number, gap = 12): number[] {
	const sum = heights.reduce((a, b) => a + b, 0)
	const g = sum + gap * (heights.length - 1) > 138 ? Math.max(2, (138 - sum) / (heights.length - 1)) : gap
	let top = Math.max(3, cc - (sum + g * (heights.length - 1)) / 2)
	return heights.map((h) => {
		const c = top + h / 2
		top += h + g
		return +c.toFixed(1)
	})
}
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
export function renderToggleKey(v: { title: string; mix?: Mix; label: string; on: boolean; color: KeyColor; overlay: Overlay; free?: 'top' | 'middle' | 'bottom' }): string {
	let b = `<rect width="${K}" height="${K}" fill="${v.on ? KEY_COLORS[v.color] : BG}"/>`
	if (!v.on) b += `<rect x="3" y="3" width="${K - 6}" height="${K - 6}" rx="10" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`
	const tc = v.on ? WHITE : DIM
	const lc = v.on ? WHITE : PLATE_TEXT
	const mix = v.mix !== undefined
	// Long text wraps to a second row; if the stack then gets too tall, use slightly smaller base sizes.
	let sizes = mix ? [24, 26] : [26, 26]
	let title = wrap(v.title, sizes[0])
	let label = wrap(v.label, sizes[1])
	if (mix && height(title) + 30 + height(label) + 8 > 138) {
		title = wrap(v.title, 22)
		label = wrap(v.label, 24)
	}
	// `free`: the Stream Deck title sits there (top / middle / bottom), so the row in that place is left out
	if (mix) {
		const cy = stack([height(title), 30, height(label)], 73)
		if (v.free !== 'top') b += textBlock(title, cy[0], tc)
		if (v.free !== 'middle') b += chip(72, cy[1], v.mix!, 24)
		if (v.free !== 'bottom') b += textBlock(label, cy[2], lc)
	} else if (v.free === 'middle') {
		b += textBlock(title, stack([height(title)], 30)[0], tc) + textBlock(label, stack([height(label)], 114)[0], lc)
	} else if (v.free) {
		b += v.free === 'bottom' ? textBlock(title, stack([height(title)], 50)[0], tc) : textBlock(label, stack([height(label)], 96)[0], lc)
	} else {
		const cy = stack([height(title), height(label)], 83)
		b += textBlock(title, cy[0], tc) + textBlock(label, cy[1], lc)
	}
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
	const name = wrap(v.name, 24)
	const two = m && name.lines.length > 1
	let b = m
		? plate(21, 34, plainText(72, base(21, 24), mixName(v.mix!), { size: 24, fill: MIX_COLORS[v.mix!] })) + textBlock(name, two ? 64 : 55, PLATE_TEXT)
		: plate(21, 34, plateName(v.name, 21, 24))
	b += text(72, two ? 107 : m ? 90 : 76, v.value, two ? 24 : m ? 28 : 34, WHITE)
	const by = two ? 120 : m ? 112 : 108
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
	const src = wrap(v.source, 30, 112)
	const step = src.size * 1.1
	const mid = 86
	const first = mid - (step * (src.lines.length - 1)) / 2
	let b = plate(21, 34, plateName(v.target, 21, 24))
	src.lines.forEach((line, i) => (b += plainText(64, +(first + i * step + src.size * 0.35).toFixed(1), fitText(line, src.size, 112), { size: src.size, fill: col })))
	// Arrow follows the last line (which is centred on x=64).
	const lastText = fitText(src.lines[src.lines.length - 1], src.size, 112)
	const ay = first + (src.lines.length - 1) * step
	b += `<path d="M${+(64 + textWidth(lastText, src.size) / 2 + 6).toFixed(1)} ${ay - 4} l12 0 l-6 8 z" fill="${col}"/>`
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

export { renderVuStrip, renderValueStrip, renderButtonFader, type MeterView } from './meter.js'
