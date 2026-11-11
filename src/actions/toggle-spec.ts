import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import type { KeyColor, Mix } from '../render/theme.js'
import { setLink, type MixerState } from '../state/mixer-state.js'
import { pick } from './common.js'
import { effectiveSide, targetName, targetOf, type Side, type Target } from './target.js'

// Pure key logic (no Stream Deck SDK), so tests can drive it with a fake connection.

export interface ToggleSpec {
	title: string
	mix?: Mix
	label: string
	color: KeyColor
	read: (s: MixerState) => boolean
	write: (s: MixerState, on: boolean) => void
}

export type Op = 'toggle' | 'on' | 'off'
export const operation = (v: unknown): Op => (v === 'on' || v === 'off' ? v : 'toggle')

const sidesOf = (side: Side): ('L' | 'R')[] => (side === 'pair' ? ['L', 'R'] : [side])

/** Reads (and with `on` sets) the `${prefix}L` / `${prefix}R` flags of a side; a pair reads as on when either side is. */
function sideFlags(prefix: string, side: Side, o: object, on?: boolean): boolean {
	const f = o as Record<string, boolean>
	if (on !== undefined) for (const x of sidesOf(side)) f[prefix + x] = on
	return sidesOf(side).some((x) => f[prefix + x])
}

const mixOf = (t: Target): Mix | undefined => (t.kind === 'mix' ? t.mix : undefined)
export const holder = (s: MixerState, t: Target): object =>
	t.kind === 'mix' ? s.mixes[t.mix].channels[t.channel] : t.kind === 'loopback' ? s.loopbacks[t.id] : s.outputs[t.id]

function flagSpec(settings: JsonObject, prefix: 'mute' | 'solo', title: string, color: KeyColor): ToggleSpec | undefined {
	// A freshly dropped key has no kind or mix saved yet: the screen shows Mix A of a mix channel.
	const t = targetOf({ kind: 'mix', mix: 0, ...settings })
	if (!t || (prefix === 'solo' && t.kind !== 'mix')) return undefined
	return {
		title,
		mix: mixOf(t),
		label: targetName(t),
		color,
		read: (s) => sideFlags(prefix, effectiveSide(t, s), holder(s, t)),
		write: (s, on) => void sideFlags(prefix, effectiveSide(t, s), holder(s, t), on),
	}
}

export const muteSpec = (s: JsonObject) => flagSpec(s, 'mute', 'MUTE', 'red')
export const soloSpec = (s: JsonObject) => flagSpec(s, 'solo', 'SOLO', 'yellow')

export const INPUTS = { in1: 'IN 1', in2: 'IN 2', mobile: 'Mobile' } as const
const OPTIONS = { p48v: '48V', inst: 'INST', phase: 'Ø' } as const

export function inputOptionSpec(settings: JsonObject): ToggleSpec | undefined {
	const input = pick(settings.input, INPUTS)
	const option = pick(settings.option, OPTIONS)
	if (!input || !option) return undefined
	return {
		title: OPTIONS[option],
		label: INPUTS[input],
		color: 'blue',
		read: (s) => s.inputs[input][option],
		write: (s, on) => void (s.inputs[input][option] = on),
	}
}

export function linkSpec(settings: JsonObject): ToggleSpec | undefined {
	// LINK works on the whole strip, so a side setting is ignored.
	const t = targetOf({ mix: 0, ...settings, kind: 'mix', side: 'pair' })
	if (t?.kind !== 'mix') return undefined
	return {
		title: 'LINK',
		mix: t.mix,
		label: targetName(t),
		color: 'blue',
		read: (s) => s.mixes[t.mix].channels[t.channel].link,
		write: (s, on) => setLink(s, t.mix, t.channel, on),
	}
}

const BUTTONS = { gain: 'GAIN', hp: 'HP', trs: 'TRS', aux: 'AUX' } as const
const OUTPUTS = { out12: 'Out 1/2', mobile: 'Mobile Out' } as const

export function outputRoomSpec(settings: JsonObject): ToggleSpec | undefined {
	const button = pick(settings.button, BUTTONS)
	if (!button) return undefined
	if (button !== 'gain') {
		// HP / TRS / AUX are one set of phone buttons, not per output.
		return { title: BUTTONS[button], label: 'Phones', color: 'blue', read: (s) => s.phones[button], write: (s, on) => void (s.phones[button] = on) }
	}
	const output = pick(settings.output, OUTPUTS)
	if (!output) return undefined
	return { title: 'GAIN', label: OUTPUTS[output], color: 'blue', read: (s) => !!s.outputs[output].gainBtn, write: (s, on) => void (s.outputs[output].gainBtn = on) }
}

/** Key press: toggle flips what the key shows; on/off force it. Only changed reports are sent. */
export function pressToggle(connection: Pick<E2x2Connection, 'state' | 'update'>, spec: ToggleSpec, op: Op): void {
	const on = op === 'toggle' ? !spec.read(connection.state) : op === 'on'
	connection.update((s) => spec.write(s, on))
}
