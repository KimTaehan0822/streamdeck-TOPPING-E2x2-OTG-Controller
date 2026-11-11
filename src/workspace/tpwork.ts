import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { rawToDb } from '../protocol/report.js'
import { emptyState, type MixChannelId, type MixerState } from '../state/mixer-state.js'

export const WORKSPACE_DIR = 'C:\\Program Files\\TOPPING Pro\\TOPPING Professional Control Center'

const MIX_KEYS = ['MixSaveA', 'MixSaveB', 'MixSaveC', 'MixSaveD']
/** TPwork strip number (MixParmeter_N) -> our strip id. */
const STRIPS: MixChannelId[] = ['in12', 'otg', 'pb12', 'pb34', 'pb56', 'pb78']
const INPUT_KEYS = { in1: 'IN1', mobile: 'IN2', in2: 'IN3', in4: 'IN4' } as const
const OUTPUT_KEYS = { out12: 'OUT12', mobile: 'OUT34', spdif: 'OUT56' } as const
const LOOPBACK_KEYS = { lp12: 'Loopback12', lp34: 'Loopback34', lp56: 'Loopback56' } as const
// the app stores mix faders as raw / 100, everything else as raw
const MIX_SCALE = 100

type Obj = Record<string, any>

/** The app's dB display int next to each raw volume: 90 + dB, never below 0, 0 for silence. */
const display = (raw: number) => (raw <= 0 ? 0 : Math.max(0, 90 + Math.round(rawToDb(raw))))

/** Throws on broken JSON or a missing section, so callers can keep their previous state. */
export function parseWorkspace(json: string): MixerState {
	const w: Obj = JSON.parse(json)
	const s = emptyState()
	MIX_KEYS.forEach((key, m) => {
		const mix = need(w, key)
		STRIPS.forEach((id, i) => {
			const p = `MixParmeter_${i + 1}.`
			const link: boolean = !!mix[p + 'LinkEnable']
			Object.assign(s.mixes[m].channels[id], {
				volL: num(mix[p + 'Mix_volume_Lnum']) * MIX_SCALE,
				volR: num(mix[p + 'Mix_volume_Rnum']) * MIX_SCALE,
				// linked strips are always hard L / hard R (the channel numbers read 100 there)
				panL: link ? 0 : num(mix[p + 'Mix_channel_L']) / 100,
				panR: link ? 1 : num(mix[p + 'Mix_channel_R']) / 100,
				muteL: !!mix[p + 'MUTEEnable_L'],
				muteR: !!mix[p + 'MUTEEnable_R'],
				soloL: !!mix[p + 'SOLOEnable_L'],
				soloR: !!mix[p + 'SOLOEnable_R'],
				phaseL: !!mix[p + 'ANTIEnable_L'],
				phaseR: !!mix[p + 'ANTIEnable_R'],
				link,
			})
		})
	})
	for (const [id, key] of Object.entries(INPUT_KEYS) as [keyof typeof INPUT_KEYS, string][]) {
		const i = need(w, key)
		s.inputs[id] = {
			gain: num(i.IN_volumenum),
			mute: !!i.MUTEEnable,
			solo: !!i.SOLOEnable,
			phase: !!i.ANTIEnable,
			p48v: !!i.P48VEnable,
			inst: !!i.INSTEnable,
			mon: !!i.MONIEnable,
		}
	}
	const route = (o: Obj) => ({
		volL: num(o.OUT_volume_Lnum),
		volR: num(o.OUT_volume_Rnum),
		muteL: !!o.MUTEEnable_L,
		muteR: !!o.MUTEEnable_R,
		link: !!o.LinkEnable,
		source: num(o.ChannelOUT_mode),
	})
	for (const [id, key] of Object.entries(OUTPUT_KEYS) as [keyof typeof OUTPUT_KEYS, string][]) Object.assign(s.outputs[id], route(need(w, key)))
	for (const [id, key] of Object.entries(LOOPBACK_KEYS) as [keyof typeof LOOPBACK_KEYS, string][]) Object.assign(s.loopbacks[id], route(need(w, key)))
	s.outputs.out12.gainBtn = !!w.Gain1_Enable
	s.outputs.mobile.gainBtn = !!w.Gain2_Enable
	const o12 = w.OUT12
	Object.assign(s.phones, { hp: !!o12.HPEnable, trs: !!o12.LINEOUTEnable, aux: !!o12.AUXEnable })
	return s
}

/** Puts the state into a copy of the template; fields we do not model stay as they are. */
export function writeWorkspace(s: MixerState, template: string): string {
	const w: Obj = JSON.parse(template)
	MIX_KEYS.forEach((key, m) => {
		const mix = need(w, key)
		STRIPS.forEach((id, i) => {
			const p = `MixParmeter_${i + 1}.`
			const c = s.mixes[m].channels[id]
			Object.assign(mix, {
				[p + 'Mix_volume_L']: display(c.volL),
				[p + 'Mix_volume_R']: display(c.volR),
				[p + 'Mix_volume_Lnum']: Math.round(c.volL / MIX_SCALE),
				[p + 'Mix_volume_Rnum']: Math.round(c.volR / MIX_SCALE),
				[p + 'LinkEnable']: c.link,
				[p + 'MUTEEnable_L']: c.muteL,
				[p + 'MUTEEnable_R']: c.muteR,
				[p + 'SOLOEnable_L']: c.soloL,
				[p + 'SOLOEnable_R']: c.soloR,
				[p + 'ANTIEnable_L']: c.phaseL,
				[p + 'ANTIEnable_R']: c.phaseR,
			})
			if (!c.link) Object.assign(mix, { [p + 'Mix_channel_L']: Math.round(c.panL * 100), [p + 'Mix_channel_R']: Math.round(c.panR * 100) })
		})
	})
	for (const [id, key] of Object.entries(INPUT_KEYS) as [keyof typeof INPUT_KEYS, string][]) {
		const i = s.inputs[id]
		Object.assign(need(w, key), { IN_volumenum: i.gain, MUTEEnable: i.mute, SOLOEnable: i.solo, ANTIEnable: i.phase, P48VEnable: i.p48v, INSTEnable: i.inst, MONIEnable: i.mon })
	}
	const route = (o: Obj, r: MixerState['loopbacks']['lp12']) =>
		Object.assign(o, { OUT_volume_L: display(r.volL), OUT_volume_R: display(r.volR), OUT_volume_Lnum: r.volL, OUT_volume_Rnum: r.volR, MUTEEnable_L: r.muteL, MUTEEnable_R: r.muteR, LinkEnable: r.link, ChannelOUT_mode: r.source })
	for (const [id, key] of Object.entries(OUTPUT_KEYS) as [keyof typeof OUTPUT_KEYS, string][]) route(need(w, key), s.outputs[id])
	for (const [id, key] of Object.entries(LOOPBACK_KEYS) as [keyof typeof LOOPBACK_KEYS, string][]) route(need(w, key), s.loopbacks[id])
	w.Gain1_Enable = !!s.outputs.out12.gainBtn
	w.Gain2_Enable = !!s.outputs.mobile.gainBtn
	Object.assign(need(w, 'OUT12'), { HPEnable: s.phones.hp, LINEOUTEnable: s.phones.trs, AUXEnable: s.phones.aux })
	return JSON.stringify(w, null, 4)
}

/** The workspace the app has open for the E2x2 OTG, if the config names one that exists. */
export function currentWorkspacePath(dir = WORKSPACE_DIR): string | undefined {
	try {
		const name = JSON.parse(readFileSync(join(dir, 'sound_card_workspace_file.TPconfig'), 'utf8')).LastWorkspaceOpened_E2x2_OTG
		const path = join(dir, 'E2X2_OTG', `E2X2_OTG_${name}.TPwork`)
		return typeof name === 'string' && existsSync(path) ? path : undefined
	} catch {
		return undefined
	}
}

/** Workspace names (without the E2X2_OTG_ prefix and .TPwork suffix). */
export function listWorkspaces(dir = WORKSPACE_DIR): string[] {
	try {
		return readdirSync(join(dir, 'E2X2_OTG'))
			.map((f) => /^E2X2_OTG_(.+)\.TPwork$/.exec(f)?.[1])
			.filter((n): n is string => n !== undefined)
	} catch {
		return []
	}
}

function need(w: Obj, key: string): Obj {
	if (typeof w[key] !== 'object' || w[key] === null) throw new Error(`workspace has no ${key}`)
	return w[key]
}

function num(v: unknown): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('workspace number missing')
	return v
}
