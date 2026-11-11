import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import { SOURCES } from '../model/e2x2.js'
import { dbToLevel, type MeterChannel } from '../protocol/meter.js'
import { dbToRaw, rawToDb } from '../protocol/report.js'
import type { MeterView } from '../render/meter.js'
import type { Mix } from '../render/theme.js'
import type { MixerState } from '../state/mixer-state.js'
import { num, pick } from './common.js'
import { effectiveSide, targetName, targetOf, type OutputId, type Target } from './target.js'
import { holder, INPUTS, muteSpec } from './toggle-spec.js'

// Pure volume / pan logic (no Stream Deck SDK), so tests can drive it with a fake connection.

/** Volume range of every fader: -inf .. +6 dB. The workspace fixture only shows up to +2 dB; +6 is the planned limit. */
export const MAX_DB = 6
/** Below this a step down goes to silence (raw 0), and a step up from silence lands here. */
export const FLOOR_DB = -60

export function stepRaw(raw: number, deltaDb: number): number {
	const db = Math.min(MAX_DB, rawToDb(raw) + deltaDb) // -inf + delta stays -inf, so silence falls into the floor branch
	if (db < FLOOR_DB) return deltaDb < 0 ? 0 : dbToRaw(FLOOR_DB)
	return dbToRaw(db)
}
export const setRaw = (db: number): number => (db < FLOOR_DB ? 0 : dbToRaw(Math.min(MAX_DB, db)))

const round1 = (x: number) => Math.round(x * 10) / 10
export const dbText = (raw: number): string => {
	if (raw <= 0) return '-∞'
	const r = round1(rawToDb(raw))
	return `${r > 0 ? '+' : ''}${r.toFixed(1)} dB`
}
/** Fader position on the meter scale (0..1; +dB sits at the end of the bar). */
export const faderPos = (raw: number): number => Math.min(1, dbToLevel(rawToDb(raw)))

/** Anything a fader or dial can raise and lower: a mix/loopback/output volume or an input's digital gain. */
export interface Vol {
	name: string
	mix?: Mix
	/** Set for mix/loopback/output targets (meters and mute come from it). */
	target?: Target
	raw: (s: MixerState) => number
	/** Applies f to the raw value of each side the target acts on. */
	map: (s: MixerState, f: (raw: number) => number) => void
	muted: (s: MixerState) => boolean
	setMuted: (s: MixerState, on: boolean) => void
}

/** Mix channel, loopback or output volume; a pair moves both sides, a single side moves one (or the pair when LINKed). */
export function volSpec(settings: JsonObject): Vol | undefined {
	// A freshly dropped key has no kind or mix saved yet: the screen shows Mix A of a mix channel.
	const merged = { kind: 'mix', mix: 0, ...settings }
	const t = targetOf(merged)
	const mute = muteSpec(merged)
	if (!t || !mute) return undefined
	const sides = (s: MixerState) => (effectiveSide(t, s) === 'pair' ? (['L', 'R'] as const) : ([effectiveSide(t, s)] as ('L' | 'R')[]))
	const vols = (s: MixerState) => holder(s, t) as unknown as Record<string, number>
	return {
		name: targetName(t),
		mix: t.kind === 'mix' ? t.mix : undefined,
		target: t,
		raw: (s) => Math.max(...sides(s).map((x) => vols(s)['vol' + x])),
		map: (s, f) => {
			for (const x of sides(s)) vols(s)['vol' + x] = f(vols(s)['vol' + x])
		},
		muted: mute.read,
		setMuted: mute.write,
	}
}

export function gainSpec(settings: JsonObject): Vol | undefined {
	const id = pick(settings.input, INPUTS)
	if (!id) return undefined
	return {
		name: INPUTS[id],
		raw: (s) => s.inputs[id].gain,
		map: (s, f) => void (s.inputs[id].gain = f(s.inputs[id].gain)),
		muted: (s) => s.inputs[id].mute,
		setMuted: (s, on) => void (s.inputs[id].mute = on),
	}
}

export type FaderOp = { set: boolean; db: number }
/** Key settings: mode `set` goes to `db`; anything else steps by `step` dB (negative = down, blank = 1). undefined = `set` without a number. */
export function faderOp(settings: JsonObject): FaderOp | undefined {
	if (settings.mode === 'set') {
		const db = num(settings.db)
		return Number.isFinite(db) ? { set: true, db } : undefined
	}
	const step = num(settings.step)
	return { set: false, db: Number.isFinite(step) && step !== 0 ? step : 1 }
}

export const stepVol = (c: Pick<E2x2Connection, 'update'>, v: Vol, db: number): void => c.update((s) => v.map(s, (raw) => stepRaw(raw, db)))
export const setVol = (c: Pick<E2x2Connection, 'update'>, v: Vol, db: number): void => c.update((s) => v.map(s, () => setRaw(db)))
export const pressFader = (c: Pick<E2x2Connection, 'update'>, v: Vol, op: FaderOp): void => (op.set ? setVol(c, v, op.db) : stepVol(c, v, op.db))
export const setMute = (c: Pick<E2x2Connection, 'update'>, v: Vol, op: 'toggle' | 'on' | 'off'): void =>
	c.update((s) => v.setMuted(s, op === 'toggle' ? !v.muted(s) : op === 'on'))

// --- VU meters: the device only measures its outputs ---

const PAIRS: Record<OutputId, [MeterChannel, MeterChannel]> = {
	out12: ['out1L_A', 'out2R_A'],
	mobile: ['mobileL_A', 'mobileR_A'],
	spdif: ['spdifL_A', 'spdifR_A'],
}

/** Output -> its own pair; mix -> the pair of the first output (out12, mobile, spdif) fed by that mix; loopback -> none. */
export function meterOf(t: Target, s: MixerState): [MeterChannel, MeterChannel] | undefined {
	// shortcut: loopbacks have no meter on the device, so they show empty bars; upgrade only if a loopback meter report is ever found
	if (t.kind === 'loopback') return undefined
	if (t.kind === 'output') return PAIRS[t.id]
	const id = (Object.keys(PAIRS) as OutputId[]).find((o) => s.outputs[o].source === SOURCES.mixA + t.mix)
	return id && PAIRS[id]
}

/** Inverse of dbToLevel, by bisection (the scale is monotonic). */
function levelToDb(level: number): number {
	let lo = -60
	let hi = 0
	for (let i = 0; i < 30; i++) {
		const mid = (lo + hi) / 2
		if (dbToLevel(mid) < level) lo = mid
		else hi = mid
	}
	return hi
}

/** Level text: the louder side as dB, derived from its bar level; '-∞' when silent. */
export const levelText = (level: number): string => (level <= 0 ? '-∞' : `${Math.round(levelToDb(level))} dB`)

/** What a VU strip or button fader draws. `peek` shows the fader dB instead of MUTED for a moment after an adjustment. */
export function meterView(v: Vol, s: MixerState, meters: ReadonlyMap<MeterChannel, number>, peek: boolean): MeterView {
	const pair = v.target && meterOf(v.target, s)
	const [left, right] = pair ? pair.map((c) => meters.get(c) ?? 0) : [0, 0]
	const raw = v.raw(s)
	return {
		mix: v.mix,
		name: v.name,
		left,
		right,
		fader: faderPos(raw),
		faderDb: dbText(raw),
		levelDb: levelText(Math.max(left, right)),
		muted: v.muted(s) && !peek,
		overlay: 'none',
	}
}

// --- Pan ---

export interface Pan {
	name: string
	mix: Mix
	/** 0..1, the mean of the sides it acts on. */
	read: (s: MixerState) => number
	/** Moves the sides together by d (0..1 scale), stopping when one reaches an end, so a pair keeps its width. */
	shift: (s: MixerState, d: number) => void
}

export function panSpec(settings: JsonObject): Pan | undefined {
	const t = targetOf({ mix: 0, ...settings, kind: 'mix' })
	if (t?.kind !== 'mix') return undefined
	const pans = (s: MixerState) => {
		const c = s.mixes[t.mix].channels[t.channel]
		const side = effectiveSide(t, s)
		return side === 'pair' ? ([['panL', c], ['panR', c]] as const) : ([[side === 'L' ? 'panL' : 'panR', c]] as const)
	}
	const values = (s: MixerState) => pans(s).map(([k, c]) => c[k])
	return {
		name: targetName(t),
		mix: t.mix,
		read: (s) => {
			const v = values(s)
			return v.reduce((a, b) => a + b, 0) / v.length
		},
		shift: (s, d) => {
			const v = values(s)
			const moved = Math.max(-Math.min(...v), Math.min(1 - Math.max(...v), d))
			for (const [k, c] of pans(s)) c[k] = Math.min(1, Math.max(0, c[k] + moved))
		},
	}
}

/** -100 (hard L) .. 100 (hard R). */
export const panPercent = (v: number): number => Math.round((v - 0.5) * 200)
export const panText = (v: number): string => {
	const p = panPercent(v)
	return p === 0 ? 'C' : p < 0 ? `L${-p}` : `R${p}`
}

export type PanOp = { set: boolean; value: number }
/** Mode `set` goes to `pan` (-100..100); otherwise steps by `step` percent (negative = left, blank = 5). */
export function panOp(settings: JsonObject): PanOp | undefined {
	if (settings.mode === 'set') {
		const pan = num(settings.pan)
		return Number.isFinite(pan) ? { set: true, value: Math.max(-100, Math.min(100, pan)) } : undefined
	}
	const step = num(settings.step)
	return { set: false, value: Number.isFinite(step) && step !== 0 ? step : 5 }
}

export const stepPan = (c: Pick<E2x2Connection, 'update'>, p: Pan, percent: number): void => c.update((s) => p.shift(s, percent / 200))
export const setPan = (c: Pick<E2x2Connection, 'update'>, p: Pan, percent: number): void => c.update((s) => p.shift(s, (percent + 100) / 200 - p.read(s)))
export const pressPan = (c: Pick<E2x2Connection, 'update'>, p: Pan, op: PanOp): void => (op.set ? setPan(c, p, op.value) : stepPan(c, p, op.value))
