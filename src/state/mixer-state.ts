import { INPUT_GROUPS, LOOPBACKS, MIX_INPUTS, OUTPUTS, SOURCES } from '../model/e2x2.js'

/** One mix strip: an L channel and an R channel, each a mono with its own pan. vol = raw linear gain, pan 0..1. */
export type MixChannel = {
	volL: number
	volR: number
	panL: number
	panR: number
	muteL: boolean
	muteR: boolean
	soloL: boolean
	soloR: boolean
	phaseL: boolean
	phaseR: boolean
	link: boolean
}

/** Strip id -> [L input item, R input item]; IN 1 and IN 2 share one strip like in the app (IN1+2). */
export const MIX_CHANNELS = {
	in12: [MIX_INPUTS.in1, MIX_INPUTS.in2],
	otg: MIX_INPUTS.otg,
	pb12: MIX_INPUTS.pb12,
	pb34: MIX_INPUTS.pb34,
	pb56: MIX_INPUTS.pb56,
	pb78: MIX_INPUTS.pb78,
} as const
export type MixChannelId = keyof typeof MIX_CHANNELS

export type Input = { gain: number; mute: boolean; solo: boolean; phase: boolean; p48v: boolean; inst: boolean; mon: boolean }
export type Output = { volL: number; volR: number; muteL: boolean; muteR: boolean; link: boolean; source: number; gainBtn?: boolean }
export type Loopback = Omit<Output, 'gainBtn'>

export type MixerState = {
	mixes: { channels: Record<MixChannelId, MixChannel> }[]
	inputs: Record<keyof typeof INPUT_GROUPS, Input>
	outputs: Record<keyof typeof OUTPUTS, Output>
	phones: { hp: boolean; trs: boolean; aux: boolean }
	loopbacks: Record<keyof typeof LOOPBACKS, Loopback>
}

const UNITY = 0x02000000

const strip = (link: boolean): MixChannel => ({
	volL: 0,
	volR: 0,
	panL: link ? 0 : 0.5,
	panR: link ? 1 : 0.5,
	muteL: false,
	muteR: false,
	soloL: false,
	soloR: false,
	phaseL: false,
	phaseR: false,
	link,
})

const out = (source: number): Loopback => ({ volL: UNITY, volR: UNITY, muteL: false, muteR: false, link: true, source })
const input = (): Input => ({ gain: UNITY, mute: false, solo: false, phase: false, p48v: false, inst: false, mon: false })

/** Mixes silent, everything else at 0 dB with the app's default routing. */
export function emptyState(): MixerState {
	const mix = () => ({
		channels: Object.fromEntries(Object.keys(MIX_CHANNELS).map((id) => [id, strip(id !== 'in12')])) as Record<MixChannelId, MixChannel>,
	})
	return {
		mixes: [mix(), mix(), mix(), mix()],
		inputs: { in1: input(), mobile: input(), in2: input(), in4: input() },
		outputs: {
			out12: { ...out(SOURCES.mixA), gainBtn: false },
			mobile: { ...out(SOURCES.pb12), gainBtn: false },
			spdif: out(SOURCES.pb12),
		},
		phones: { hp: true, trs: true, aux: true },
		loopbacks: { lp12: out(SOURCES.pb34), lp34: out(SOURCES.pb56), lp56: out(SOURCES.pb78) },
	}
}

/** Like the app: LINK off centres both channels, LINK on pans them hard L and R again. */
export function setLink(s: MixerState, mix: number, id: MixChannelId, on: boolean): void {
	Object.assign(s.mixes[mix].channels[id], { link: on, panL: on ? 0 : 0.5, panR: on ? 1 : 0.5 })
}
