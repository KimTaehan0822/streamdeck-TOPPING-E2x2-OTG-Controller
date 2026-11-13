import { action, type KeyDownEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import { renderToggleKey } from '../render/keys.js'
import { E2x2Action, type RenderContext } from '../runtime/base-action.js'
import { inputOptionSpec, linkSpec, muteSpec, operation, outputRoomSpec, pressToggle, soloSpec, type ToggleSpec } from './toggle-spec.js'

const ID = 'com.haeunga0822.topping-e2x2.'

/** One on/off key; spec() returning undefined means the settings are incomplete (setup hint). */
abstract class ToggleAction extends E2x2Action<JsonObject> {
	protected abstract spec(settings: JsonObject): ToggleSpec | undefined

	protected override keyState(settings: JsonObject): 0 | 1 | undefined {
		const spec = this.spec(settings)
		return spec && (spec.read(this.connection.state) ? 1 : 0)
	}

	protected render(settings: JsonObject, ctx: RenderContext): string {
		const spec = this.spec(settings)
		if (!spec) return renderToggleKey({ title: '', label: '', on: false, color: 'blue', overlay: 'setup' })
		const on = spec.read(this.connection.state)
		return renderToggleKey({
			title: spec.title,
			mix: spec.mix,
			label: spec.labelOf?.(on) ?? spec.label,
			free: ctx.titleAlign, // a Stream Deck title leaves only its own row free
			on,
			color: spec.color,
			overlay: ctx.overlay,
		})
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const s = ev.payload.settings
		const spec = this.spec(s)
		if (spec) pressToggle(this.connection, spec, operation(s.op))
	}
}

@action({ UUID: ID + 'mute' })
class MuteAction extends ToggleAction {
	protected spec = muteSpec
}

@action({ UUID: ID + 'solo' })
class SoloAction extends ToggleAction {
	protected spec = soloSpec
}

@action({ UUID: ID + 'input-option' })
class InputOptionAction extends ToggleAction {
	protected spec = inputOptionSpec
}

@action({ UUID: ID + 'link' })
class LinkAction extends ToggleAction {
	protected spec = linkSpec
}

@action({ UUID: ID + 'output-room' })
class OutputRoomAction extends ToggleAction {
	protected spec = outputRoomSpec
}

export const toggleActions = (connection: E2x2Connection) =>
	[MuteAction, SoloAction, InputOptionAction, LinkAction, OutputRoomAction].map((Action) => new Action(connection))
