import streamDeck, { action, type KeyDownEvent, type PropertyInspectorDidAppearEvent, type SendToPluginEvent, type DidReceiveSettingsEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import { renderWorkspaceKey } from '../render/keys.js'
import { E2x2Action, type RenderContext } from '../runtime/base-action.js'
import { listWorkspaces, WORKSPACE_DIR } from '../workspace/tpwork.js'
import { loadWorkspace, saveProblem, saveWorkspace } from './workspace-spec.js'

const warn = (text: string) => streamDeck.ui.sendToPropertyInspector({ event: 'warning', text })

@action({ UUID: 'com.haeunga0822.topping-e2x2.workspace' })
class WorkspaceAction extends E2x2Action<JsonObject> {
	/** The workspace file this plugin loaded last (shared by all keys); a key shows it as active. */
	private loaded?: string

	constructor(connection: E2x2Connection, private readonly dir: string) {
		super(connection)
	}

	protected render(settings: JsonObject, ctx: RenderContext): string {
		const mode = settings.mode === 'save' ? 'save' : 'load'
		const name = typeof settings.name === 'string' ? settings.name : ''
		if (!name) return renderWorkspaceKey({ mode, name: '', active: false, overlay: 'setup' })
		return renderWorkspaceKey({ mode, name, active: mode === 'load' && name === this.loaded, overlay: ctx.overlay })
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const { mode, name } = ev.payload.settings
		try {
			if (mode === 'save') saveWorkspace(this.connection, this.dir, name)
			else {
				loadWorkspace(this.connection, this.dir, name) // loadState redraws every key
				this.loaded = name as string
			}
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			void ev.action.showAlert()
			if (mode === 'save') void warn(error instanceof Error ? error.message : String(error))
		}
	}

	private warnAbout(settings: JsonObject): void {
		void warn(settings.mode === 'save' ? (saveProblem(this.dir, settings.name) ?? '') : '')
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): void {
		super.onDidReceiveSettings(ev)
		this.warnAbout(ev.payload.settings)
	}

	override onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<JsonObject>): void {
		void ev.action.getSettings().then((s) => this.warnAbout(s))
	}

	/** The PI's name list (sdpi-select datasource). */
	override onSendToPlugin(ev: SendToPluginEvent<any, JsonObject>): void {
		if (ev.payload?.event === 'workspaces') void streamDeck.ui.sendToPropertyInspector({ event: 'workspaces', items: listWorkspaces(this.dir).map((n) => ({ value: n, label: n })) })
	}
}

export const workspaceActions = (connection: E2x2Connection, dir = WORKSPACE_DIR) => [new WorkspaceAction(connection, dir)]
