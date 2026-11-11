import { devices, HID } from 'node-hid'

export interface HidPort {
	write(buf: Buffer): void
	onData(cb: (buf: Buffer) => void): void
	onError(cb: (err: unknown) => void): void
	close(): void
}

const VID = 0x152a
const PID = 0x8756
const INTERFACE = 4

/** Opens the E2x2's vendor interface (shared with the TOPPING app), or undefined when it is not there. */
export function openE2x2(): HidPort | undefined {
	try {
		const info = devices(VID, PID).find((d) => d.interface === INTERFACE && d.path)
		if (!info?.path) return undefined
		const hid = new HID(info.path)
		return {
			write: (buf) => void hid.write([...buf]),
			onData: (cb) => void hid.on('data', cb),
			onError: (cb) => void hid.on('error', cb),
			close: () => hid.close(),
		}
	} catch {
		return undefined
	}
}
