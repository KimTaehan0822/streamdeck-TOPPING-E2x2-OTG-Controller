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
const same = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase() // Windows paths are case-insensitive

/** A reason the save key would refuse this name, or undefined. */
export function saveProblem(dir: string, name: unknown): string | undefined {
	if (!validName(name)) return 'Invalid name: use 1-60 characters without \\ / : * ? " < > | or "..".'
	const current = currentWorkspacePath(dir)
	if (current && same(current, pathOf(dir, name))) return 'The TOPPING app is using this workspace. Pick another name.'
	return undefined
}

/** A notice (not a refusal) when saving would replace another saved workspace. */
export function overwriteNotice(dir: string, name: unknown): string | undefined {
	return validName(name) && !saveProblem(dir, name) && existsSync(pathOf(dir, name)) ? 'A workspace with this name exists. Pressing the key replaces it and keeps the old file as .E2X2_OTG_<name>.TPwork.bak. The TOPPING app records its open workspace only when it exits, so do not use the name it has open.' : undefined
}

export function loadWorkspace(conn: E2x2Connection, dir: string, name: unknown): void {
	if (!validName(name)) throw new Error('invalid workspace name')
	conn.loadState(parseWorkspace(readFileSync(pathOf(dir, name), 'utf8')))
}

/** Writes the plugin's state as a new workspace, using the app's current file as the template for fields we do not model. */
export function saveWorkspace(conn: E2x2Connection, dir: string, name: unknown): string {
	// without a loaded workspace the state is made-up defaults (all mixes silent)
	if (!conn.loaded) throw new Error('No workspace is loaded yet. Open one in the TOPPING app or press a Workspace load key.')
	const problem = saveProblem(dir, name)
	if (problem) throw new Error(problem)
	const template = currentWorkspacePath(dir)
	if (!template) throw new Error('No workspace is open in the TOPPING app to use as a template.')
	const path = pathOf(dir, name as string)
	mkdirSync(join(dir, 'E2X2_OTG'), { recursive: true })
	// temp file in the same folder, then rename: a crash never leaves a truncated workspace (the dot prefix keeps it out of the list)
	const tmp = join(dir, 'E2X2_OTG', `.E2X2_OTG_${name}.tmp`)
	writeFileSync(tmp, writeWorkspace(conn.state, readFileSync(template, 'utf8')))
	// the app's config only names its open workspace after it exits, so this may be a file the app still has open: keep the old one (dot prefix: not listed).
	// The first backup is never replaced, so repeated saves cannot destroy the original.
	const bak = join(dir, 'E2X2_OTG', `.E2X2_OTG_${name}.TPwork.bak`)
	if (existsSync(path) && !existsSync(bak)) copyFileSync(path, bak)
	renameSync(tmp, path)
	return path
}
