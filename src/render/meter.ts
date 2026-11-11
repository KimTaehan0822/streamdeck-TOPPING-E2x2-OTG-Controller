import { dbToLevel } from '../protocol/meter.js'
import { fitSize, frame, plainText, textBlock, wrapFit, type Overlay } from './svg.js'
import { DIM, GREEN, MIX_COLORS, MUTED_BAR, ON, PLATE, PLATE_TEXT, RED, TICK, TRACK, WHITE, YELLOW, mixName, type Mix } from './theme.js'

export type MeterView = {
	mix?: Mix
	name: string
	/** Levels and fader position are 0..1 on the app's meter scale (dbToLevel). */
	left: number
	right: number
	fader?: number
	faderDb: string
	levelDb: string
	muted: boolean
	overlay: Overlay
}

const KEY = 144
export const base = (cy: number, size: number): number => cy + size * 0.35
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))

/** Meter bar: dark track, green to yellow to red fill. `part` = the [min,max] of the scale this box covers. */
export function bar(x: number, y: number, w: number, h: number, level: number, vertical: boolean, muted: boolean, part: [number, number] = [0, 1]): string {
	const [mn, mx] = part
	const f = clamp((level - mn) / (mx - mn))
	const stop = (v: number) => clamp((v - mn) / (mx - mn))
	const id = 'g' + [x, y, w, h, mn].join('_').replace(/\./g, 'p')
	const dir = vertical ? `x1="0" y1="${y + h}" x2="0" y2="${y}"` : `x1="${x}" y1="0" x2="${x + w}" y2="0"`
	let d =
		`<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" ${dir}>` +
		`<stop offset="${stop(0)}" stop-color="${GREEN}"/><stop offset="${stop(dbToLevel(-12))}" stop-color="${GREEN}"/>` +
		`<stop offset="${stop(dbToLevel(-3))}" stop-color="${YELLOW}"/><stop offset="${stop(1)}" stop-color="${RED}"/></linearGradient></defs>` +
		`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${TRACK}"/>`
	if (f > 0) {
		const r = vertical ? `x="${x}" y="${y + h * (1 - f)}" width="${w}" height="${h * f}"` : `x="${x}" y="${y}" width="${w * f}" height="${h}"`
		d += `<rect ${r} fill="${muted ? MUTED_BAR : `url(#${id})`}"/>`
	}
	return d
}

/** Fader cap: light grey block with a dark groove. */
export function cap(cx: number, cy: number, w: number, h: number, vertical: boolean): string {
	const groove = vertical
		? `<line x1="${cx - w / 2 + 4}" y1="${cy}" x2="${cx + w / 2 - 4}" y2="${cy}" stroke="#555" stroke-width="2"/>`
		: `<line x1="${cx}" y1="${cy - h / 2 + 4}" x2="${cx}" y2="${cy + h / 2 - 4}" stroke="#555" stroke-width="2"/>`
	return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="2" fill="${PLATE_TEXT}" stroke="#000" stroke-width="1.5"/>${groove}`
}

/** Grey name plate across the top of a key; mix name (in its colour) is passed in `inner`. */
export const plate = (cy: number, h: number, inner: string): string => `<rect x="4" y="${cy - h / 2}" width="${KEY - 8}" height="${h}" rx="5" fill="${PLATE}"/>${inner}`
export const plateName = (name: string, cy: number, size: number): string => {
	const s = fitSize(name, size, 128, 10)
	return plainText(72, base(cy, s), name, { size: s, fill: PLATE_TEXT })
}

/** Top plate of a dial strip: MIX X on the left and the name on the right, or just the name. */
function stripHeader(mix: Mix | undefined, name: string): string {
	let b = `<rect x="4" y="1" width="192" height="26" rx="5" fill="${PLATE}"/>`
	if (mix !== undefined) {
		b += plainText(12, base(14, 22), mixName(mix), { size: 22, fill: MIX_COLORS[mix], anchor: 'start' })
		const s = fitSize(name, 22, 100, 10)
		b += plainText(188, base(14, s), name, { size: s, fill: PLATE_TEXT, anchor: 'end' })
	} else {
		const s = fitSize(name, 22, 184, 10)
		b += plainText(100, base(14, s), name, { size: s, fill: PLATE_TEXT })
	}
	return b
}

/** Dial strip 200x100 with one value bar (pan: grows from the centre; gain: from the left) and a big value text; muted greys the bar. */
export function renderValueStrip(v: { mix?: Mix; name: string; value: string; bar: number; center?: boolean; muted?: boolean; overlay: Overlay }): string {
	const x = 12 + 176 * clamp(v.bar)
	const [from, w] = v.center ? [Math.min(x, 100), Math.abs(x - 100)] : [12, x - 12]
	let b = stripHeader(v.mix, v.name) + `<rect x="12" y="40" width="176" height="14" fill="${TRACK}"/>`
	if (w > 0) b += `<rect x="${from}" y="40" width="${w}" height="14" fill="${v.muted ? MUTED_BAR : ON}"/>`
	if (v.center) b += `<rect x="99" y="36" width="2" height="22" fill="${WHITE}"/>`
	b += plainText(100, base(80, 28), v.muted ? 'MUTED' : v.value, { size: 28, fill: v.muted ? RED : WHITE })
	return frame(200, 100, b, v.overlay)
}

/** Dial strip 200x100: plate (MIX X left, name right), L/R bars with a fader cap, tick marks, dB row. */
export function renderVuStrip(v: MeterView): string {
	let b = stripHeader(v.mix, v.name)
	b += bar(12, 32, 176, 12, v.left, false, v.muted) + bar(12, 48, 176, 12, v.right, false, v.muted)
	for (const db of [0, -6, -12, -24]) {
		const x = 12 + 176 * dbToLevel(db)
		b += `<line x1="${x}" y1="61" x2="${x}" y2="65" stroke="${TICK}" stroke-width="1.5"/>`
	}
	if (v.fader !== undefined) b += cap(12 + 176 * v.fader, 46, 12, 34, false)
	if (v.muted) b += plainText(100, base(83, 19), 'MUTED', { size: 19, fill: RED })
	else b += plainText(6, base(83, 19), v.levelDb, { size: 19, fill: DIM, anchor: 'start' }) + plainText(194, base(83, 19), v.faderDb, { size: 19, fill: WHITE, anchor: 'end' })
	return frame(200, 100, b, v.overlay)
}

/** Two stacked keys share one fader: 'top' = upper half of the scale + plate, 'bottom' = lower half + dB text. */
export function renderButtonFader(v: MeterView, role: 'top' | 'bottom'): string {
	const u = KEY / 100
	const high = role === 'top'
	const part: [number, number] = high ? [0.5, 1] : [0, 0.5]
	const y = high ? 50 * u : 0
	const h = 50 * u
	let b = bar(28 * u, y, 18 * u, h, v.left, true, v.muted, part) + bar(54 * u, y, 18 * u, h, v.right, true, v.muted, part)
	const tick = (db: number) => {
		const yy = high ? 50 * u + 50 * u * (1 - (dbToLevel(db) - 0.5) / 0.5) : 50 * u * (1 - dbToLevel(db) / 0.5)
		return `<line x1="${74 * u}" y1="${yy}" x2="${80 * u}" y2="${yy}" stroke="${TICK}" stroke-width="2"/>`
	}
	for (const db of high ? [0, -6, -12] : [-24]) b += tick(db)
	const f = v.fader
	if (f !== undefined && f >= part[0] && f <= part[1]) {
		const yy = high ? 50 * u + 50 * u * (1 - (f - 0.5) / 0.5) : 50 * u * (1 - f / 0.5)
		b += cap(50 * u, yy, 60 * u, 14 * u, true)
	}
	if (high) {
		// A name too long for one row wraps to two smaller rows under a slimmer plate (the bars start at y=72).
		const name = v.mix !== undefined ? wrapFit(v.name, 26, 128, 10) : undefined
		const two = name !== undefined && name.lines.length > 1
		const head =
			v.mix !== undefined
				? two
					? plate(15, 26, plainText(72, base(15, 20), mixName(v.mix), { size: 20, fill: MIX_COLORS[v.mix] })) + textBlock({ lines: name!.lines, size: Math.min(18, name!.size) }, 50, WHITE)
					: plate(21, 34, plainText(72, base(21, 24), mixName(v.mix), { size: 24, fill: MIX_COLORS[v.mix] })) + textBlock(name!, 56, WHITE)
				: plate(21, 34, plateName(v.name, 21, 24))
		b = head + b
	} else {
		const s = 20 * u
		b += v.muted ? plainText(72, base(83 * u, s), 'MUTED', { size: s, fill: RED }) : plainText(72, base(83 * u, s), v.faderDb, { size: s, fill: WHITE })
	}
	return frame(KEY, KEY, b, v.overlay)
}
