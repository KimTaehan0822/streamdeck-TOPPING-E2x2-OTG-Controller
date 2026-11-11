import type { JsonObject } from '@elgato/utils'
import { LOOPBACKS, OUTPUTS } from '../model/e2x2.js'
import { MIX_CHANNELS, type MixChannelId, type MixerState } from '../state/mixer-state.js'
import { int, pick } from './common.js'

export type Side = 'pair' | 'L' | 'R'
export type Mix = 0 | 1 | 2 | 3
export type LoopbackId = keyof typeof LOOPBACKS
export type OutputId = keyof typeof OUTPUTS
export type Target =
	| { kind: 'mix'; mix: Mix; channel: MixChannelId; side: Side }
	| { kind: 'loopback'; id: LoopbackId; side: Side }
	| { kind: 'output'; id: OutputId; side: Side }

const SIDES = { pair: 0, L: 0, R: 0 }
const KINDS = { mix: 0, loopback: 0, output: 0 }

/** Reads the target from settings (kind, mix, channel, side); undefined when anything is missing or invalid. A blank side means pair. For loopback/output the `channel` setting holds the id. */
export function targetOf(settings: JsonObject): Target | undefined {
	const kind = pick(settings.kind, KINDS)
	const side = settings.side === undefined || settings.side === '' ? 'pair' : pick(settings.side, SIDES)
	if (!kind || !side) return undefined
	if (kind === 'mix') {
		const mix = int(settings.mix, 0, 3) as Mix | undefined
		const channel = pick(settings.channel, MIX_CHANNELS)
		return mix === undefined || !channel ? undefined : { kind, mix, channel, side }
	}
	const id = kind === 'loopback' ? pick(settings.channel, LOOPBACKS) : pick(settings.channel, OUTPUTS)
	return id ? ({ kind, id, side } as Target) : undefined
}

const NAMES: Record<MixChannelId | LoopbackId | OutputId, string> = {
	in12: 'IN 1/2',
	otg: 'OTG',
	pb12: 'PB 1/2',
	pb34: 'PB 3/4',
	pb56: 'PB 5/6',
	pb78: 'PB 7/8',
	lp12: 'Loop 1/2',
	lp34: 'Loop 3/4',
	lp56: 'Loop 5/6',
	out12: 'Out 1/2',
	mobile: 'Mobile Out',
	spdif: 'S/PDIF',
}

/** Plain name without the mix (renderers draw "MIX X" themselves); a single side appends " L" / " R". */
export function targetName(t: Target): string {
	const id = t.kind === 'mix' ? t.channel : t.id
	return t.side === 'pair' ? NAMES[id] : `${NAMES[id]} ${t.side}`
}

/** A single side on a LINKed channel acts on the pair. */
export function effectiveSide(t: Target, s: MixerState): Side {
	if (t.side === 'pair') return 'pair'
	const link = t.kind === 'mix' ? s.mixes[t.mix].channels[t.channel].link : t.kind === 'loopback' ? s.loopbacks[t.id].link : s.outputs[t.id].link
	return link ? 'pair' : t.side
}
