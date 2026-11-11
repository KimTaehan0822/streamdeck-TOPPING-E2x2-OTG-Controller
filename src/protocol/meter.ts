// Meter reports do not fit decodeReport: the value is bytes 8..11 of the 16-byte report (no report ID).
const BASE = { 0x31: 'out1L', 0x32: 'out2R', 0x33: 'mobileL', 0x34: 'mobileR', 0x5a: 'spdifL', 0x5b: 'spdifR', 0x41: 'aux41L', 0x42: 'aux42R' } as const // shortcut: 41/42 meaning unknown, rename once identified
type Base = (typeof BASE)[keyof typeof BASE]
/** Suffix A = item 01, B = item 02. shortcut: unknown difference (maybe pre/post output volume), identical in the capture. */
export type MeterChannel = `${Base}_${'A' | 'B'}`

export type Meter = { channel: MeterChannel; db: number; level: number }

/** 0 at -90 dB or below, otherwise -60 dB..0 dB mapped to 0..1. */
export const dbToLevel = (db: number): number => (db <= -90 ? 0 : Math.min(1, Math.max(0, (db + 60) / 60)))

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
