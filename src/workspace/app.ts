import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The TOPPING app saves what it remembers over its open workspace when it exits, and sends that file to the device when it
// starts (Run.log 2026-11-14). A forced kill skips the exit save, so the app comes back with the file this plugin wrote.

export type AppDeps = {
	running: () => boolean
	kill: () => void
	launch: (exe: string, cwd: string) => void
	sleep: (ms: number) => Promise<void>
}

const EXE = 'ToppingPro.exe'
const CONFIG = 'sound_card_workspace_file.TPconfig'
const WAIT_STEP_MS = 100
const WAIT_MAX_MS = 5000

const defaults: AppDeps = {
	running: () => execFileSync('tasklist', ['/FI', `IMAGENAME eq ${EXE}`, '/NH'], { encoding: 'utf8', windowsHide: true }).includes(EXE),
	kill: () => void execFileSync('taskkill', ['/F', '/IM', EXE], { windowsHide: true, stdio: 'ignore' }),
	launch: (exe, cwd) => spawn(exe, ['--autostart'], { cwd, detached: true, stdio: 'ignore' }).unref(),
	sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
}

/** Names `name` as the E2x2 OTG workspace the app opens next; every other field (and the app's 4-space layout) is kept. */
export function setLastWorkspace(dir: string, name: string): void {
	const path = join(dir, CONFIG)
	const config = JSON.parse(readFileSync(path, 'utf8'))
	config.LastWorkspaceOpened_E2x2_OTG = name
	const tmp = path + '.tmp'
	writeFileSync(tmp, JSON.stringify(config, null, 4))
	renameSync(tmp, path)
}

/** Force-closes the TOPPING app (no exit save), points its config at `name`, and starts it again in the tray. */
export async function restartApp(dir: string, name: string, deps: Partial<AppDeps> = {}): Promise<void> {
	const d = { ...defaults, ...deps }
	if (d.running()) {
		d.kill()
		let waited = 0
		while (d.running()) {
			if (waited >= WAIT_MAX_MS) throw new Error('The TOPPING app did not close, so it was not restarted.')
			await d.sleep(WAIT_STEP_MS)
			waited += WAIT_STEP_MS
		}
	}
	setLastWorkspace(dir, name)
	d.launch(join(dir, EXE), dir)
}
