import { action, type KeyDownEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import { renderRestartKey } from '../render/keys.js'
import { E2x2Action, type RenderContext } from '../runtime/base-action.js'
import { restartApp } from '../workspace/app.js'
import { WORKSPACE_DIR } from '../workspace/tpwork.js'
import { openWorkspaceName, syncOpenWorkspace } from './workspace-spec.js'

const mode = (s: JsonObject): 'sync' | 'plain' => (s.mode === 'plain' ? 'plain' : 'sync')

/** Restarts the TOPPING app: "sync" saves the Stream Deck values into its open workspace first, "plain" just restarts it. */
@action({ UUID: 'com.haeunga0822.topping-e2x2.app-restart' })
class AppRestartAction extends E2x2Action<JsonObject> {
	constructor(connection: E2x2Connection, private readonly dir: string) {
		super(connection)
	}

	protected render(settings: JsonObject, ctx: RenderContext): string {
		// a plain restart does not need a loaded workspace, so it never shows that overlay
		return renderRestartKey({ mode: mode(settings), overlay: mode(settings) === 'plain' && ctx.overlay === 'config' ? 'none' : ctx.overlay })
	}

	override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
		try {
			const name = mode(ev.payload.settings) === 'sync' ? syncOpenWorkspace(this.connection, this.dir) : openWorkspaceName(this.dir)
			if (!name) throw new Error('No workspace is open in the TOPPING app to restart with.')
			await restartApp(this.dir, name)
			void ev.action.showOk()
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			void ev.action.showAlert()
		}
	}
}

export const appRestartActions = (connection: E2x2Connection, dir = WORKSPACE_DIR) => [new AppRestartAction(connection, dir)]
