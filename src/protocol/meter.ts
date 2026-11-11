// Meter reports do not fit decodeReport: the value is bytes 8..11 of the 16-byte report (no report ID).
// group = channel (ruling from the pb12/pb34 captures). shortcut: 45-48 (PB 5/6, 7/8) and 53-56 (Loopback 3/4, 5/6) are inferred, not yet seen on the device
const BASE = {
	0x31: 'out1L', 0x32: 'out2R', 0x33: 'mobileL', 0x34: 'mobileR', 0x5a: 'spdifL', 0x5b: 'spdifR',
	0x41: 'pb12L', 0x42: 'pb12R', 0x43: 'pb34L', 0x44: 'pb34R', 0x45: 'pb56L', 0x46: 'pb56R', 0x47: 'pb78L', 0x48: 'pb78R',
	0x51: 'lp12L', 0x52: 'lp12R', 0x53: 'lp34L', 0x54: 'lp34R', 0x55: 'lp56L', 0x56: 'lp56R',
} as const
type Base = (typeof BASE)[keyof typeof BASE]
/** Suffix A = item 01 (the one shown), B = item 02. shortcut: item 02 is an unknown variant, parsed but not displayed. */
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

/** `bytes` = the 16-byte input report without the report ID. */
export function parseMeter(bytes: Uint8Array): Meter | undefined {
	if (bytes.length < 16 || bytes[7] !== 0xff || bytes[13] !== 0x66 || bytes[14] !== 0x77) return undefined
	if ([0x22, 0x33, 0x20, 0x01, 0x01].some((b, i) => bytes[i] !== b)) return undefined
	const base = BASE[bytes[5] as keyof typeof BASE]
	if (!base || (bytes[6] !== 1 && bytes[6] !== 2)) return undefined
	const db = new DataView(bytes.buffer, bytes.byteOffset, bytes.length).getInt32(8) / 2560
	return { channel: `${base}_${bytes[6] === 1 ? 'A' : 'B'}`, db, level: dbToLevel(db) }
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
