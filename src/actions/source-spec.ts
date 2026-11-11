import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import { LOOPBACKS, OUTPUTS, SOURCES } from '../model/e2x2.js'
import type { Mix } from '../render/theme.js'
import type { MixerState } from '../state/mixer-state.js'
import { pick } from './common.js'

// Pure source-select logic (no Stream Deck SDK), so tests can drive it with a fake connection.

export type SourceId = keyof typeof SOURCES
export type SourceMode = 'cycleMix' | 'cycleList' | 'toggle'

/** Cycling and PI order (user-given). */
export const SOURCE_ORDER: SourceId[] = ['mixA', 'mixB', 'mixC', 'mixD', 'in1', 'in2', 'in12', 'mobile', 'pb12', 'pb34', 'pb56', 'pb78']
export const SOURCE_NAMES: Record<SourceId, string> = {
	mixA: 'MIX A',
	mixB: 'MIX B',
	mixC: 'MIX C',
	mixD: 'MIX D',
	in1: 'IN 1',
	in2: 'IN 2',
	in12: 'IN 1+2',
	mobile: 'Mobile In',
	pb12: 'PB 1/2',
	pb34: 'PB 3/4',
	pb56: 'PB 5/6',
	pb78: 'PB 7/8',
}
const MIXES: SourceId[] = ['mixA', 'mixB', 'mixC', 'mixD']

export const TARGET_NAMES = { lp12: 'Loop 1/2', lp34: 'Loop 3/4', lp56: 'Loop 5/6', out12: 'Out 1/2', mobile: 'Mobile Out', spdif: 'S/PDIF' } as const
export type SourceTarget = keyof typeof TARGET_NAMES

const MODES: Record<SourceMode, unknown> = { cycleMix: 0, cycleList: 0, toggle: 0 }
const route = (s: MixerState, t: SourceTarget) => (t in LOOPBACKS ? s.loopbacks[t as keyof typeof LOOPBACKS] : s.outputs[t as keyof typeof OUTPUTS])

export const sourceOfCode = (code: number): SourceId | undefined => SOURCE_ORDER.find((id) => SOURCES[id] === code)
const sourceId = (v: unknown) => pick(v, SOURCES)

/** The source after `current` for the given mode; undefined when the settings give nothing to switch to. */
export function nextSource(mode: SourceMode, current: SourceId | undefined, settings: JsonObject): SourceId | undefined {
	if (mode === 'cycleMix') {
		const i = current ? MIXES.indexOf(current) : -1
		return MIXES[(i + 1) % 4]
	}
	if (mode === 'cycleList') {
		const picked = Array.isArray(settings.list) ? settings.list : []
		const list = SOURCE_ORDER.filter((id) => picked.includes(id))
		const i = current ? list.indexOf(current) : -1
		return list[(i + 1) % list.length] // empty list: undefined
	}
	const a = sourceId(settings.a)
	const b = sourceId(settings.b)
	if (!a || !b || a === b) return undefined
	return current === a ? b : a
}

export interface SourceSpec {
	target: SourceTarget
	mode: SourceMode
	current: (s: MixerState) => SourceId | undefined
	press: (conn: E2x2Connection, settings: JsonObject) => void
}

/** undefined when target is missing; a missing mode means cycleMix. */
export function sourceSpec(settings: JsonObject): SourceSpec | undefined {
	const target = pick(settings.target, TARGET_NAMES)
	if (!target) return undefined
	const mode = settings.mode === undefined || settings.mode === '' ? 'cycleMix' : pick(settings.mode, MODES)
	if (!mode) return undefined
	const current = (s: MixerState) => sourceOfCode(route(s, target).source)
	return {
		target,
		mode,
		current,
		press(conn, st) {
			const next = nextSource(mode, current(conn.state), st)
			if (next) conn.update((s) => void (route(s, target).source = SOURCES[next]))
		},
	}
}

export function mixIndexOf(id: SourceId | undefined): Mix | undefined {
	const i = id ? MIXES.indexOf(id) : -1
	return i < 0 ? undefined : (i as Mix)
}
