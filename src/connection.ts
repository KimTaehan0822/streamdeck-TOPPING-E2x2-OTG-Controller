import { readFileSync } from 'node:fs'
import { createMeterParser, type MeterChannel } from './protocol/meter.js'
import { encodeReport } from './protocol/report.js'
import { diffReports, stateReports } from './state/crosspoints.js'
import { emptyState, type MixerState } from './state/mixer-state.js'
import { openE2x2, type HidPort } from './usb/hid-device.js'
import { currentWorkspacePath, parseWorkspace } from './workspace/tpwork.js'
import { watchWorkspace } from './workspace/watch.js'

export type ConnectionDeps = {
	open?: () => HidPort | undefined
	setInterval?: (fn: () => void, ms: number) => unknown
	setTimeout?: (fn: () => void, ms: number) => unknown
	now?: () => number
	/** Reports the workspace the TOPPING app has open; returns the stop function. */
	/** Reads the workspace the app has open right now; undefined when there is none. */
	read?: () => MixerState | undefined
	watch?: (onState: (s: MixerState) => void) => () => void
}

const RECONNECT_MS = 5000
const WRITE_GAP_MS = 2
const METER_TIMEOUT_MS = 500
const METER_CHECK_MS = 100

export class E2x2Connection {
	state: MixerState = emptyState()
	online = false
	readonly meters = new Map<MeterChannel, number>()
	private readonly listeners = new Set<() => void>()
	private port?: HidPort
	private queue: Buffer[] = []
	private pumping = false
	private timers: unknown[] = []
	// false until a real workspace is known: pushing defaults would overwrite the device's mix
	private loaded = false
	private stopWatch?: () => void
	private lastMeterAt = 0
	private parse = createMeterParser()
	private readonly open: NonNullable<ConnectionDeps['open']>
	private readonly setIntervalFn: NonNullable<ConnectionDeps['setInterval']>
	private readonly setTimeoutFn: NonNullable<ConnectionDeps['setTimeout']>
	private readonly now: () => number
	private readonly read: NonNullable<ConnectionDeps['read']>
	private readonly watch: NonNullable<ConnectionDeps['watch']>

	constructor(deps: ConnectionDeps = {}) {
		this.open = deps.open ?? openE2x2
		this.setIntervalFn = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms))
		this.setTimeoutFn = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
		this.now = deps.now ?? Date.now
		this.read =
			deps.read ??
			(() => {
				const path = currentWorkspacePath()
				return path ? parseWorkspace(readFileSync(path, 'utf8')) : undefined
			})
		this.watch = deps.watch ?? ((cb) => watchWorkspace(cb))
	}

	onChange(cb: () => void): () => void {
		this.listeners.add(cb)
		return () => this.listeners.delete(cb)
	}

	/** Connects, then follows the app's workspace; the device already holds what the app sent, so that state is not sent. */
	start(): void {
		this.stop()
		try {
			const s = this.read()
			if (s) (this.state = s), (this.loaded = true)
		} catch (err) {
			console.error('could not read the workspace', err)
		}
		this.connect()
		this.stopWatch = this.watch((s) => {
			// the app wrote its file (save or exit): make the device match it, as the keys will; a first read is what the device already holds
			if (this.loaded) this.send(diffReports(this.state, s))
			this.state = s
			this.loaded = true
			this.emit()
		})
		this.timers.push(
			this.setIntervalFn(() => !this.port && this.connect() && this.loaded && this.send(stateReports(this.state)), RECONNECT_MS),
			this.setIntervalFn(() => this.checkMeters(), METER_CHECK_MS),
		)
	}

	stop(): void {
		for (const t of this.timers) clearInterval(t as NodeJS.Timeout)
		this.timers = []
		this.stopWatch?.()
		this.stopWatch = undefined
		this.offline()
	}

	loadState(s: MixerState): void {
		this.state = s
		this.loaded = true
		this.send(stateReports(s))
		this.emit()
	}

	update(mutator: (s: MixerState) => void): void {
		const next = structuredClone(this.state)
		mutator(next)
		this.send(diffReports(this.state, next))
		this.state = next
		this.emit()
	}

	private connect(): boolean {
		const port = this.open()
		if (!port) return false
		this.port = port
		this.online = true
		this.lastMeterAt = this.now()
		port.onData((buf) => this.port === port && this.onData(buf))
		port.onError(() => this.port === port && this.offline())
		this.emit()
		return true
	}

	private offline(): void {
		const was = this.online
		try {
			this.port?.close()
		} catch {
			// already gone
		}
		this.port = undefined
		this.online = false
		this.queue = []
		if (was) this.emit()
	}

	private send(reports: Parameters<typeof encodeReport>[0][]): void {
		this.queue.push(...reports.map(encodeReport))
		this.pump()
	}

	private pump(): void {
		if (this.pumping || !this.port) return
		const buf = this.queue.shift()
		if (!buf) return
		try {
			this.port.write(buf)
		} catch {
			return this.offline()
		}
		this.pumping = true
		this.setTimeoutFn(() => {
			this.pumping = false
			this.pump()
		}, WRITE_GAP_MS)
	}

	private onData(buf: Buffer): void {
		const m = this.parse(buf)
		if (!m) return
		this.lastMeterAt = this.now()
		this.meters.set(m.channel, m.level)
		this.emit()
	}

	// Meters only flow while the audio stream runs: silence the bars when they stop.
	private checkMeters(): void {
		if (this.now() - this.lastMeterAt <= METER_TIMEOUT_MS) return
		let changed = false
		for (const [ch, v] of this.meters) if (v !== 0) (this.meters.set(ch, 0), (changed = true))
		if (changed) this.emit()
	}

	private emit(): void {
		for (const cb of this.listeners) cb()
	}
}
