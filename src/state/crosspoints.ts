import type { Report } from '../protocol/report.js'
import { INPUT_GROUPS, INPUT_ITEMS, LOOPBACKS, MIX_GROUPS, OUTPUTS, PHONES } from '../model/e2x2.js'
import { MIX_CHANNELS, type Loopback, type MixChannelId, type MixerState } from './mixer-state.js'

const bit = (b: boolean | undefined) => (b ? 1 : 0)
// | 0 turns -0 (phase on a silent share) into 0
const share = (vol: number, part: number, phase: boolean) => Math.round(vol * part) * (phase ? -1 : 1) | 0

/** The 24 crosspoints of one mix, in the app's order: per input item, L bus then R bus. */
export function mixReports(s: MixerState, mix: number): Report[] {
	const [gl, gr] = MIX_GROUPS[mix]
	const chs = s.mixes[mix].channels
	const ids = Object.keys(MIX_CHANNELS) as MixChannelId[]
	const solo = ids.some((id) => chs[id].soloL || chs[id].soloR)
	return ids.flatMap((id) => {
		const c = chs[id]
		const sides = [
			{ item: MIX_CHANNELS[id][0], vol: c.volL, pan: c.panL, mute: c.muteL, solo: c.soloL, phase: c.phaseL },
			{ item: MIX_CHANNELS[id][1], vol: c.volR, pan: c.panR, mute: c.muteR, solo: c.soloR, phase: c.phaseR },
		]
		return sides.flatMap(({ item, vol, pan, mute, solo: soloed, phase }) => {
			const v = mute || (solo && !soloed) ? 0 : vol
			return [
				{ group: gl, item, value: share(v, 1 - pan, phase) },
				{ group: gr, item, value: share(v, pan, phase) },
			]
		})
	})
}

/** Every value the app sends at startup, in the same order (without the 11 01 start command). */
export function stateReports(s: MixerState): Report[] {
	const { out12, mobile, spdif } = s.outputs
	const { lp12, lp34, lp56 } = s.loopbacks
	const routed: [Loopback, { vol: readonly number[]; source: number }][] = [
		[out12, OUTPUTS.out12],
		[mobile, OUTPUTS.mobile],
		[lp12, LOOPBACKS.lp12],
		[lp34, LOOPBACKS.lp34],
		[lp56, LOOPBACKS.lp56],
		[spdif, OUTPUTS.spdif],
	]
	const inputs = Object.entries(INPUT_GROUPS) as [keyof typeof INPUT_GROUPS, number][]
	return [
		...(['hp', 'trs', 'aux'] as const).map((k) => ({ group: PHONES[k][0], item: PHONES[k][1], value: bit(s.phones[k]) })),
		// shortcut: 37 02/04/06 are always 1 in the startup dump and never sent on changes; meaning unknown, model them once seen changing
		...[2, 4, 6].map((item) => ({ group: PHONES.hp[0], item, value: 1 })),
		{ ...OUTPUTS.out12.gain, value: bit(out12.gainBtn) },
		{ ...OUTPUTS.mobile.gain, value: bit(mobile.gainBtn) },
		...routed.map(([o, ids]) => ({ group: ids.source, item: 1, value: o.source })),
		...routed.flatMap(([o, ids]) => [
			{ group: ids.vol[0], item: 3, value: o.muteL ? 0 : o.volL },
			{ group: ids.vol[1], item: 3, value: o.muteR ? 0 : o.volR },
		]),
		...[0, 1, 2, 3].flatMap((m) => mixReports(s, m)),
		...inputs.flatMap(([id, group]) =>
			(['mon', 'p48v', 'inst'] as const).map((k) => ({ group, item: INPUT_ITEMS[k], value: bit(s.inputs[id][k]) })),
		),
		...inputs.map(([id, group]) => {
			const i = s.inputs[id]
			// shortcut: input solo has no observed USB effect yet, model it once captured
			return { group, item: INPUT_ITEMS.gain, value: i.mute ? 0 : ((i.phase ? -1 : 1) * i.gain) | 0 }
		}),
	]
}

/** Only the reports whose value differs between the two states. */
export function diffReports(prev: MixerState, next: MixerState): Report[] {
	const before = stateReports(prev)
	return stateReports(next).filter((r, i) => r.value !== before[i].value)
}
