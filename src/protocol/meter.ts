// Meter reports do not fit decodeReport: the value is bytes 8..11 of the 16-byte report (no report ID).
// group = channel (captures: pb12/pb34 tones 2026-11-12, pb56/pb78 tones and IN 1/2 sound 2026-11-13; Loopback 3/4 and 5/6 followed their PB 5/6, 7/8 sources).
const BASE = {
	0x31: 'out1L', 0x32: 'out2R', 0x33: 'mobileL', 0x34: 'mobileR', 0x5a: 'spdifL', 0x5b: 'spdifR',
	0x41: 'pb12L', 0x42: 'pb12R', 0x43: 'pb34L', 0x44: 'pb34R', 0x45: 'pb56L', 0x46: 'pb56R', 0x47: 'pb78L', 0x48: 'pb78R',
	0x21: 'in1L', 0x23: 'in2R', // inputs send item 04 (capture 2026-11-13)
	0x22: 'otgL', 0x24: 'otgR', // item 04 too; tracked the outputs while a phone played over OTG (capture 2026-11-14)
	0x51: 'lp12L', 0x52: 'lp12R', 0x53: 'lp34L', 0x54: 'lp34R', 0x55: 'lp56L', 0x56: 'lp56R',
} as const
type Base = (typeof BASE)[keyof typeof BASE]
/** Suffix A = item 01 (inputs: 04, the one shown), B = item 02. shortcut: item 02 is an unknown variant, parsed but not displayed. */
export type MeterChannel = `${Base}_${'A' | 'B'}`

export type Meter = { channel: MeterChannel; db: number; level: number }

const POINTS = [[0, 1], [-6, 0.84], [-12, 0.68], [-24, 0.44], [-60, 0]] as const

/** The TOPPING app's meter scale: piecewise linear through 0 dB 1, -6 0.84, -12 0.68, -24 0.44, -60 0. */
export const dbToLevel = (db: number): number => {
	if (db <= -60) return 0
	if (db >= 0) return 1
	for (let i = 1; i < POINTS.length; i++) {
		const [a, la] = POINTS[i - 1]
		const [b, lb] = POINTS[i]
		if (db >= b) return lb + ((db - b) / (a - b)) * (la - lb)
	}
	return 0
}

/** Fader / meter axis: 0..1 from silence up to +MAX_AXIS_DB; 0 dB sits at AXIS_0DB so the bars (which end at 0 dBFS) leave headroom for the fader above it. */
export const AXIS_0DB = 0.8
export const MAX_AXIS_DB = 12
export const dbToAxis = (db: number): number => (db <= 0 ? dbToLevel(db) * AXIS_0DB : AXIS_0DB + (Math.min(db, MAX_AXIS_DB) / MAX_AXIS_DB) * (1 - AXIS_0DB))
/** A meter level on the app scale, placed on the axis. */
export const levelToAxis = (level: number): number => level * AXIS_0DB

/** `bytes` = the 16-byte input report without the report ID. */
export function parseMeter(bytes: Uint8Array): Meter | undefined {
	if (bytes.length < 16 || bytes[7] !== 0xff || bytes[13] !== 0x66 || bytes[14] !== 0x77) return undefined
	if ([0x22, 0x33, 0x20, 0x01, 0x01].some((b, i) => bytes[i] !== b)) return undefined
	const base = BASE[bytes[5] as keyof typeof BASE]
	// item 04 is seen only for the inputs and OTG (21-24 04)
	if (!base || !(bytes[6] === 4 ? bytes[5] >= 0x21 && bytes[5] <= 0x24 : bytes[6] === 1 || bytes[6] === 2)) return undefined
	const db = new DataView(bytes.buffer, bytes.byteOffset, bytes.length).getInt32(8) / 2560
	return { channel: `${base}_${bytes[6] === 2 ? 'B' : 'A'}`, db, level: dbToLevel(db) }
}

/** The firmware sends Mobile R (34 01) mislabelled as a second 33 01 in a row; this tracks that. */
export function createMeterParser(): (bytes: Uint8Array) => Meter | undefined {
	let prev33 = false
	return (bytes) => {
		const is33 = bytes[5] === 0x33 && bytes[6] === 0x01
		const fix = is33 && prev33
		prev33 = is33 && !prev33
		if (!fix) return parseMeter(bytes)
		const b = Uint8Array.from(bytes)
		b[5] = 0x34
		return parseMeter(b)
	}
}
