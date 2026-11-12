import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'

// The TOPPING app writes its open workspace to the TPconfig only when it exits. Its Run.log, though, records every start and
// switch: the save path of the workspace it leaves (".../E2X2_OTG/E2X2_OTG_<old>.TPwork"), then a line ending in "<new>".
// A plain save logs the path without the name line. Seen in Run.log 2026-11-13; the log is in the system code page (CP949 here).

const PATH_LINE = /E2X2_OTG\/E2X2_OTG_[^"/]*\.TPwork"\s*$/
const NAME_LINE = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d .*"([^"/\\]+)"\s*$/

/** The last workspace name the log says the app opened, or undefined. */
export function lastOpenedInLog(text: string): string | undefined {
	const lines = text.split(/\r?\n/)
	for (let i = lines.length - 1; i > 0; i--) {
		const m = NAME_LINE.exec(lines[i])
		if (m && PATH_LINE.test(lines[i - 1])) return m[1]
	}
	return undefined
}

let decoder: TextDecoder
try {
	decoder = new TextDecoder('euc-kr')
} catch {
	decoder = new TextDecoder('latin1') // shortcut: a Node without ICU reads non-ASCII names wrongly; ASCII names still work
}

/** How far back each read looks: the first read finds the switch made at app start, later reads the recent ones. */
const FIRST_READ = 512 * 1024
// About five minutes of the app's once-a-second lines. The tail is read again every time, not only the new bytes: a second app
// instance's start-up lines can be overwritten in place by the running app, and the text can land after the file has grown (zeros).
const RECENT_READ = 16 * 1024
const names = new Map<string, string>()

/** The workspace the app opened last, per Run.log in `dir`; it keeps the last one found while newer lines hold none. */
export function loggedWorkspace(dir: string): string | undefined {
	let fd: number
	try {
		fd = openSync(join(dir, 'Run.log'), 'r')
	} catch {
		return names.get(dir)
	}
	try {
		// the size from the open handle: the folder entry lags while the app keeps the log open
		const size = fstatSync(fd).size
		const len = Math.min(size, names.has(dir) ? RECENT_READ : FIRST_READ)
		const buf = Buffer.alloc(len)
		readSync(fd, buf, 0, len, size - len)
		const zero = buf.indexOf(0)
		const name = lastOpenedInLog(decoder.decode(zero < 0 ? buf : buf.subarray(0, zero)))
		if (name !== undefined) names.set(dir, name)
		else if (!names.has(dir)) names.set(dir, '') // read once: later reads only look at the recent tail
	} finally {
		closeSync(fd)
	}
	return names.get(dir) || undefined
}
