import { type FSWatcher, readFileSync, watch } from 'node:fs'
import { join } from 'node:path'
import type { MixerState } from '../state/mixer-state.js'
import { currentWorkspacePath, parseWorkspace, WORKSPACE_DIR } from './tpwork.js'

export type WatchDeps = {
	dir: string
	watch: (path: string, cb: (event: string, filename: string | null) => void) => Pick<FSWatcher, 'close'>
	setTimeout: (fn: () => void, ms: number) => unknown
	clearTimeout: (t: unknown) => void
}

const defaults: WatchDeps = {
	dir: WORKSPACE_DIR,
	watch: (p, cb) => watch(p, cb),
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (t) => clearTimeout(t as NodeJS.Timeout),
}

const SETTLE_MS = 300

/** Calls onState with the open workspace each time the app saves it or switches workspace; broken files are skipped. */
export function watchWorkspace(onState: (s: MixerState) => void, deps: Partial<WatchDeps> = {}): () => void {
	const d = { ...defaults, ...deps }
	let timer: unknown
	const changed = () => {
		d.clearTimeout(timer)
		timer = d.setTimeout(() => {
			try {
				const path = currentWorkspacePath(d.dir)
				if (path) onState(parseWorkspace(readFileSync(path, 'utf8')))
			} catch {
				// half-written file: wait for the next change
			}
		}, SETTLE_MS)
	}
	const watchers: Pick<FSWatcher, 'close'>[] = []
	// the root folder also holds Run.log etc., so only the config file counts there
	const targets: [string, string | undefined][] = [
		[join(d.dir, 'E2X2_OTG'), undefined],
		[d.dir, 'sound_card_workspace_file.TPconfig'],
	]
	for (const [path, only] of targets) {
		try {
			watchers.push(d.watch(path, (_e, name) => (only === undefined || name === only) && changed()))
		} catch {
			// folder missing (app not installed): nothing to watch
		}
	}
	return () => {
		d.clearTimeout(timer)
		watchers.forEach((w) => w.close())
	}
}
