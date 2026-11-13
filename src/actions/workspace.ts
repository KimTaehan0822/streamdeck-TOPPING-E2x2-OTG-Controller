import streamDeck, { action, type KeyDownEvent, type PropertyInspectorDidAppearEvent, type SendToPluginEvent, type DidReceiveSettingsEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import { renderWorkspaceKey } from '../render/keys.js'
import { E2x2Action, type RenderContext } from '../runtime/base-action.js'
import { restartApp } from '../workspace/app.js'
import { listWorkspaces, WORKSPACE_DIR } from '../workspace/tpwork.js'
import { loadWorkspace, overwriteNotice, saveProblem, saveWorkspace } from './workspace-spec.js'

/** "Restart the TOPPING app to match": on unless unticked. */
const restartOn = (s: JsonObject) => s.restart !== false && s.restart !== 'false'

const warn = (text: string, level: 'danger' | 'info' = 'danger') => streamDeck.ui.sendToPropertyInspector({ event: 'warning', text, level })

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
		// a load key is the way out of "no workspace loaded", so it does not show that overlay
		const overlay = mode === 'load' && ctx.overlay === 'config' ? 'none' : ctx.overlay
		return renderWorkspaceKey({ mode, name, active: mode === 'load' && name === this.loaded, overlay })
	}

	override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
		const { mode, name } = ev.payload.settings
		const restart = restartOn(ev.payload.settings)
		try {
			if (mode === 'save') {
				saveWorkspace(this.connection, this.dir, name, ev.payload.settings.store !== false && ev.payload.settings.store !== 'false', restart)
			} else {
				loadWorkspace(this.connection, this.dir, name) // loadState redraws every key
				this.loaded = name as string
			}
			// the app comes back with this workspace, so it shows what the keys show
			if (restart) await restartApp(this.dir, name as string)
			if (mode === 'save') void ev.action.showOk()
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			void ev.action.showAlert()
			if (mode === 'save') void warn(error instanceof Error ? error.message : String(error))
		}
	}

	private warnAbout(settings: JsonObject): void {
		if (settings.mode !== 'save') return void warn('')
		const problem = saveProblem(this.dir, settings.name, restartOn(settings))
		const notice = overwriteNotice(this.dir, settings.name, restartOn(settings))
		void warn(problem ?? notice ?? '', problem ? 'danger' : 'info')
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
