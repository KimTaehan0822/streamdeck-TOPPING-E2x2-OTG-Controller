export type Report = { group: number; item: number; value: number }

const UNITY = 0x02000000
const HEAD = [0x22, 0x33, 0x20, 0x01, 0x01]

/** 17 bytes: report ID 00 + 16 data bytes. */
export function encodeReport(r: Report): Buffer {
	const buf = Buffer.alloc(17)
	Buffer.from(HEAD).copy(buf, 1)
	buf[6] = r.group
	buf[7] = r.item
	buf.writeInt32BE(r.value | 0, 8)
	buf[14] = 0x66
	buf[15] = 0x77
	return buf
}

export function decodeReport(buf: Buffer): Report | undefined {
	if (buf.length < 16 || !HEAD.every((b, i) => buf[1 + i] === b) || buf[14] !== 0x66 || buf[15] !== 0x77) return undefined
	return { group: buf[6], item: buf[7], value: buf.readInt32BE(8) }
}

export const dbToRaw = (db: number): number => Math.round(10 ** (db / 20) * UNITY)

export const rawToDb = (raw: number): number => (raw === 0 ? -Infinity : 20 * Math.log10(raw / UNITY))
