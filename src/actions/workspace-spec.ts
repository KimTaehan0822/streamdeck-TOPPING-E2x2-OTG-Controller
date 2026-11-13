import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { E2x2Connection } from '../connection.js'
import { currentWorkspacePath, parseWorkspace, writeWorkspace } from '../workspace/tpwork.js'

// Pure workspace load/save (no Stream Deck SDK). `dir` is the TOPPING folder; tests pass a temp dir.

/** The name becomes a file name: no separators, no '..', no Windows-forbidden characters, trimmed, sane length. */
export function validName(name: unknown): name is string {
	return typeof name === 'string' && name.length > 0 && name.length <= 60 && name === name.trim() && !name.includes('..') && !name.endsWith('.') && !/[\\/:*?"<>|\x00-\x1f]/.test(name)
}

const pathOf = (dir: string, name: string) => join(dir, 'E2X2_OTG', `E2X2_OTG_${name}.TPwork`)
const bakOf = (dir: string, name: string) => join(dir, 'E2X2_OTG', `.E2X2_OTG_${name}.TPwork.bak`)
const same = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase() // Windows paths are case-insensitive

/** A reason the save key would refuse this name, or undefined. */
export function saveProblem(dir: string, name: unknown, restart = false): string | undefined {
	if (!validName(name)) return 'Invalid name: use 1-60 characters without \\ / : * ? " < > | or "..".'
	const current = currentWorkspacePath(dir)
	// the app restart kills the app before it can save over the file, so its open workspace is fine then
	if (!restart && current && same(current, pathOf(dir, name))) return 'The TOPPING app is using this workspace. Pick another name.'
	return undefined
}

/** A notice (not a refusal) when saving would replace another saved workspace. */
export function overwriteNotice(dir: string, name: unknown, restart = false): string | undefined {
	return validName(name) && !saveProblem(dir, name, restart) && existsSync(pathOf(dir, name)) ? 'A workspace with this name exists. Pressing the key replaces it and keeps the old file as .E2X2_OTG_<name>.TPwork.bak.' : undefined
}

export function loadWorkspace(conn: E2x2Connection, dir: string, name: unknown): void {
	if (!validName(name)) throw new Error('invalid workspace name')
	conn.loadState(parseWorkspace(readFileSync(pathOf(dir, name), 'utf8')))
}

/** Writes the plugin's state as a new workspace, using the app's current file as the template for fields we do not model; `store` also keeps the values on the device. */
export function saveWorkspace(conn: E2x2Connection, dir: string, name: unknown, store = true, restart = false): string {
	// without a loaded workspace the state is made-up defaults (all mixes silent)
	if (!conn.loaded) throw new Error('No workspace is loaded yet. Open one in the TOPPING app or press a Workspace load key.')
	const problem = saveProblem(dir, name, restart)
	if (problem) throw new Error(problem)
	const template = currentWorkspacePath(dir)
	if (!template) throw new Error('No workspace is open in the TOPPING app to use as a template.')
	const path = pathOf(dir, name as string)
	mkdirSync(join(dir, 'E2X2_OTG'), { recursive: true })
	// temp file in the same folder, then rename: a crash never leaves a truncated workspace (the dot prefix keeps it out of the list)
	const tmp = join(dir, 'E2X2_OTG', `.E2X2_OTG_${name}.tmp`)
	writeFileSync(tmp, writeWorkspace(conn.state, readFileSync(template, 'utf8')))
	// the version being replaced becomes the backup (dot prefix: not listed); the restart key's "undo" swaps it back
	if (existsSync(path)) copyFileSync(path, bakOf(dir, name as string))
	renameSync(tmp, path)
	// like the app's "Save the current workspace and download to the device"
	if (store && !conn.storeOnDevice()) throw new Error('The workspace file was saved, but the device is not connected, so the values were not stored on it.')
	return path
}

/** The name of the workspace the TOPPING app has open, or undefined. */
export function openWorkspaceName(dir: string): string | undefined {
	const path = currentWorkspacePath(dir)
	return path && /E2X2_OTG_(.+)\.TPwork$/i.exec(path)?.[1]
}

/** Writes the plugin state into the app's open workspace (the restart key, mode "sync") and returns its name. */
export function syncOpenWorkspace(conn: E2x2Connection, dir: string): string {
	if (!conn.loaded) throw new Error('No workspace is loaded yet. Open one in the TOPPING app or press a Workspace load key.')
	const name = openWorkspaceName(dir)
	if (!name) throw new Error('No workspace is open in the TOPPING app to restart with.')
	saveWorkspace(conn, dir, name, false, true)
	return name
}

/** The restart key's "undo": swaps the app's open workspace with its backup (the version before the last save), so pressing again redoes; returns its name. */
export function undoOpenWorkspace(dir: string): string {
	const name = openWorkspaceName(dir)
	if (!name) throw new Error('No workspace is open in the TOPPING app to restart with.')
	const path = pathOf(dir, name)
	const bak = bakOf(dir, name)
	if (!existsSync(bak)) throw new Error('No earlier version of this workspace is saved.')
	const tmp = join(dir, 'E2X2_OTG', `.E2X2_OTG_${name}.tmp`)
	renameSync(bak, tmp)
	renameSync(path, bak)
	renameSync(tmp, path)
	return name
}
