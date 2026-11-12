import { type FSWatcher, readFileSync, watch } from 'node:fs'
import { basename, join } from 'node:path'
import type { MixerState } from '../state/mixer-state.js'
import { currentWorkspacePath, parseWorkspace, WORKSPACE_DIR } from './tpwork.js'
import { loggedWorkspace } from './applog.js'

export type WatchDeps = {
	dir: string
	watch: (path: string, cb: (event: string, filename: string | null) => void) => Pick<FSWatcher, 'close' | 'on'>
	setTimeout: (fn: () => void, ms: number) => unknown
	clearTimeout: (t: unknown) => void
	setInterval: (fn: () => void, ms: number) => unknown
	clearInterval: (t: unknown) => void
}

const defaults: WatchDeps = {
	dir: WORKSPACE_DIR,
	watch: (p, cb) => watch(p, cb),
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (t) => clearTimeout(t as NodeJS.Timeout),
	setInterval: (fn, ms) => setInterval(fn, ms),
	clearInterval: (t) => clearInterval(t as NodeJS.Timeout),
}

const SETTLE_MS = 300
/** Windows reports no changes to Run.log while the app holds it open, so it is polled. */
const LOG_POLL_MS = 1000

/** Calls onState with the open workspace each time the app saves it or switches workspace; broken files are skipped. */
export function watchWorkspace(onState: (s: MixerState) => void, deps: Partial<WatchDeps> = {}): () => void {
	const d = { ...defaults, ...deps }
	let timer: unknown
	const changed = () => {
		d.clearTimeout(timer)
		timer = d.setTimeout(() => {
			try {
				const path = currentWorkspacePath(d.dir)
				if (!path) return
				const s = parseWorkspace(readFileSync(path, 'utf8'))
				console.info('workspace read:', basename(path))
				onState(s)
			} catch (err) {
				// half-written file: wait for the next change (logged, so a failing listener is not silent)
				console.error('workspace read failed:', err instanceof Error ? err.message : String(err))
			}
		}, SETTLE_MS)
	}
	const watchers: Pick<FSWatcher, 'close' | 'on'>[] = []
	// only the open workspace file counts: the save key writes other files here, and re-reading the open one would undo unsaved changes
	const isOpen = (name: string | null) => name !== null && name.toLowerCase() === basename(currentWorkspacePath(d.dir) ?? '').toLowerCase()
	// Run.log counts only when it logs a switch to another workspace
	let logged = loggedWorkspace(d.dir)
	const poll = d.setInterval(() => {
		const now = loggedWorkspace(d.dir)
		if (now !== logged) changed()
		logged = now
	}, LOG_POLL_MS)
	// the root folder also holds Run.log etc., so only the config file counts there
	const targets: [string, (name: string | null) => boolean][] = [
		[join(d.dir, 'E2X2_OTG'), isOpen],
		[d.dir, (name) => name === 'sound_card_workspace_file.TPconfig'],
	]
	for (const [path, counts] of targets) {
		try {
			const w = d.watch(path, (_e, name) => counts(name) && changed())
			// folder deleted or EPERM: an unhandled 'error' would kill the plugin
			w.on('error', (err) => {
				console.error('workspace watch failed', path, err)
				w.close()
			})
			watchers.push(w)
		} catch {
			// folder missing (app not installed): nothing to watch
		}
	}
	return () => {
		d.clearTimeout(timer)
		d.clearInterval(poll)
		watchers.forEach((w) => w.close())
	}
}
