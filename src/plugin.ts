import streamDeck, { type SingletonAction } from '@elgato/streamdeck'
import { appRestartActions } from './actions/app-restart.js'
import { faderActions } from './actions/faders.js'
import { gainActions } from './actions/gain.js'
import { sourceActions } from './actions/source.js'
import { toggleActions } from './actions/toggles.js'
import { workspaceActions } from './actions/workspace.js'
import { E2x2Connection } from './connection.js'

// The Stream Deck app keeps no console output; send errors to the plugin's logs folder instead.
console.error = (...args: unknown[]) => streamDeck.logger.error(args.map(String).join(' '))
console.info = (...args: unknown[]) => streamDeck.logger.info(args.map(String).join(' '))

export const connection = new E2x2Connection()

// Every action group is listed here (and in the manifest).
export const actions: SingletonAction[] = [...toggleActions(connection), ...faderActions(connection), ...gainActions(connection), ...sourceActions(connection), ...workspaceActions(connection), ...appRestartActions(connection)]

for (const action of actions) streamDeck.actions.registerAction(action)
await streamDeck.connect()
connection.start()
process.on('exit', () => connection.stop())
