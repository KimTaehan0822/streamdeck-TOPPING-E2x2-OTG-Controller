import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { restartApp } from '../dist/workspace/app.js'

const CONFIG = { AutoSaveWorkspace: true, LastWorkspaceOpened: 'New1', LastWorkspaceOpened_E2x2_OTG: 'Streaming', TIME: '2026年11月11日' }

function setup(runningFor) {
	const dir = mkdtempSync(join(tmpdir(), 'tpapp-'))
	writeFileSync(join(dir, 'sound_card_workspace_file.TPconfig'), JSON.stringify(CONFIG, null, 4))
	const calls = []
	let left = runningFor // how many running() checks still say true
	const config = () => JSON.parse(readFileSync(join(dir, 'sound_card_workspace_file.TPconfig'), 'utf8'))
	const deps = {
		running: () => (calls.push('running'), left-- > 0),
		kill: () => calls.push('kill'),
		launch: (exe, cwd) => calls.push(['launch', exe, cwd, config().LastWorkspaceOpened_E2x2_OTG]),
		sleep: async () => {},
	}
	return { dir, calls, deps, config, done: () => rmSync(dir, { recursive: true }) }
}

test('restartApp kills the app, names the workspace in the config, then starts it in the tray', async () => {
	const { dir, calls, deps, config, done } = setup(3)
	try {
		await restartApp(dir, 'test', deps)
		assert.deepEqual(calls, ['running', 'kill', 'running', 'running', 'running', ['launch', join(dir, 'ToppingPro.exe'), dir, 'test']])
		assert.deepEqual(config(), { ...CONFIG, LastWorkspaceOpened_E2x2_OTG: 'test' })
		assert.match(readFileSync(join(dir, 'sound_card_workspace_file.TPconfig'), 'utf8'), /^\{\n {4}"AutoSaveWorkspace": true,/)
	} finally {
		done()
	}
})

test('restartApp starts the app when it was not running', async () => {
	const { dir, calls, deps, done } = setup(0)
	try {
		await restartApp(dir, 'Streaming', deps)
		assert.deepEqual(calls, ['running', ['launch', join(dir, 'ToppingPro.exe'), dir, 'Streaming']])
	} finally {
		done()
	}
})

test('restartApp gives up when the app does not exit, leaving the config alone', async () => {
	const { dir, calls, deps, config, done } = setup(Infinity)
	try {
		await assert.rejects(restartApp(dir, 'test', deps))
		assert.deepEqual(config(), CONFIG)
		assert.ok(!calls.some((c) => Array.isArray(c)))
	} finally {
		done()
	}
})
