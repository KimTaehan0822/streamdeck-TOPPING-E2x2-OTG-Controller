import { dbToAxis } from '../protocol/meter.js'
import { fitSize, fitText, frame, plainText, textBlock, wrapFit, type Overlay } from './svg.js'
import { DIM, GREEN, MIX_COLORS, MUTED_BAR, ON, PLATE, PLATE_TEXT, RED, TICK, TRACK, WHITE, YELLOW, mixName, type Mix } from './theme.js'

export type MeterView = {
	mix?: Mix
	name: string
	/** Levels and fader position are 0..1 on the fader axis (dbToAxis: 0 dB at 0.8, +12 dB at the top). */
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
		`<stop offset="${stop(0)}" stop-color="${GREEN}"/><stop offset="${stop(dbToAxis(-12))}" stop-color="${GREEN}"/>` +
		`<stop offset="${stop(dbToAxis(-3))}" stop-color="${YELLOW}"/><stop offset="${stop(dbToAxis(0))}" stop-color="${RED}"/></linearGradient></defs>` +
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
	for (const db of [6, 0, -6, -12, -24]) {
		const x = 12 + 176 * dbToAxis(db)
		b += `<line x1="${x}" y1="61" x2="${x}" y2="65" stroke="${TICK}" stroke-width="1.5"/>`
	}
	if (v.fader !== undefined) b += cap(12 + 176 * v.fader, 46, 12, 34, false)
	if (v.muted) b += plainText(100, base(83, 19), 'MUTED', { size: 19, fill: RED })
	else b += plainText(6, base(83, 19), v.levelDb, { size: 19, fill: DIM, anchor: 'start' }) + plainText(194, base(83, 19), v.faderDb, { size: 19, fill: WHITE, anchor: 'end' })
	return frame(200, 100, b, v.overlay)
}

export type FaderRole = 'top' | 'bottom' | 'left' | 'right'

/** Name rows (plate, MIX X, name) end at TEXT_END; the fader cap, centred on the end of the axis, then just clears them. */
const TEXT_END = 72
const CAP = 14 * (KEY / 100) // cap thickness along the axis, about 20
const AXIS_START = TEXT_END + CAP / 2 // top key: y of axis 1 (vertical); the axis then runs 2 * AXIS_LEN down through the seam
const AXIS_LEN = KEY - AXIS_START // length of one key's half of the axis (vertical, 62)
const H_START = 10 // left key: x of axis 0 (horizontal); the axis runs 2 * H_LEN to the right through the seam
const H_LEN = KEY - H_START // 134

/** Name block of the top / left key: MIX X plate with the name under it (a long name wraps to two smaller rows under a slimmer plate). */
function nameHead(v: MeterView): string {
	if (v.mix === undefined) return plate(21, 34, plateName(v.name, 21, 24))
	const name = wrapFit(v.name, 26, 128, 10)
	const mixText = (cy: number, size: number) => plainText(72, base(cy, size), mixName(v.mix!), { size, fill: MIX_COLORS[v.mix!] })
	return name.lines.length > 1
		? plate(15, 26, mixText(15, 20)) + textBlock({ lines: name.lines, size: Math.min(18, name.size) }, 50, WHITE)
		: plate(21, 34, mixText(21, 24)) + textBlock(name, 56, WHITE)
}

/**
 * Two keys share one fader. Vertical: 'top' = upper half of the axis + name, 'bottom' = lower half + dB text.
 * Horizontal: 'left' = lower half + name, 'right' = upper half + dB text. The axis is one continuous line across the seam;
 * bars and cap are placed in its global coordinates, so the meter and a cap straddling the seam stay seamless.
 */
export function renderButtonFader(v: MeterView, role: FaderRole): string {
	const vertical = role === 'top' || role === 'bottom'
	const high = role === 'top' || role === 'right'
	const part: [number, number] = high ? [0.5, 1] : [0, 0.5]
	const u = KEY / 100
	let b = ''
	if (vertical) {
		const off = high ? 0 : KEY // global y of this key's top
		const local = (f: number) => AXIS_START + 2 * AXIS_LEN * (1 - f) - off
		const y = high ? AXIS_START : 0
		b += bar(28 * u, y, 18 * u, AXIS_LEN, v.left, true, v.muted, part) + bar(54 * u, y, 18 * u, AXIS_LEN, v.right, true, v.muted, part)
		for (const db of [6, 0, -6, -12, -24]) {
			const f = dbToAxis(db)
			if (f >= part[0] && f <= part[1]) b += `<line x1="${74 * u}" y1="${local(f)}" x2="${80 * u}" y2="${local(f)}" stroke="${TICK}" stroke-width="2"/>`
		}
		if (v.fader !== undefined && Math.abs(local(v.fader) - KEY / 2) < KEY / 2 + CAP / 2) b += cap(72, local(v.fader), 60 * u, CAP, true)
	} else {
		const off = high ? KEY : 0
		const local = (f: number) => H_START + 2 * H_LEN * f - off
		const x = high ? 0 : H_START
		b += bar(x, 82, H_LEN, 14, v.left, false, v.muted, part) + bar(x, 100, H_LEN, 14, v.right, false, v.muted, part)
		for (const db of [6, 0, -6, -12, -24]) {
			const f = dbToAxis(db)
			if (f >= part[0] && f <= part[1]) b += `<line x1="${local(f)}" y1="118" x2="${local(f)}" y2="124" stroke="${TICK}" stroke-width="2"/>`
		}
		if (v.fader !== undefined && Math.abs(local(v.fader) - KEY / 2) < KEY / 2 + CAP / 2) b += cap(local(v.fader), 98, CAP, 44, false)
	}
	// Name rows on the top / left key; the dB value (MUTED when muted) on the bottom / right key.
	if (role === 'top' || role === 'left') b = nameHead(v) + b
	else {
		const s = vertical ? 20 * u : fitSize(v.faderDb, 32, 128, 10)
		const cy = vertical ? 83 * u : 45
		b += v.muted ? plainText(72, base(cy, s), 'MUTED', { size: s, fill: RED }) : plainText(72, base(cy, s), fitText(v.faderDb, s, 128), { size: s, fill: WHITE })
	}
	return frame(KEY, KEY, b, v.overlay)
}
