import { action, type DialDownEvent, type DialRotateEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import { renderValueStrip } from '../render/keys.js'
import { E2x2Action, type RenderContext } from '../runtime/base-action.js'
import { num } from './common.js'
import { dbText, gainBar, gainSpec, setMute, stepVol } from './fader-spec.js'
import { VolKeyAction } from './faders.js'

const ID = 'com.haeunga0822.topping-e2x2.'

@action({ UUID: ID + 'gain' })
class GainAction extends VolKeyAction {
	protected vol = gainSpec
}

@action({ UUID: ID + 'gain-dial' })
class GainDialAction extends E2x2Action<JsonObject> {
	protected render(settings: JsonObject, ctx: RenderContext): string {
		const v = gainSpec(settings)
		if (!v) return renderValueStrip({ name: '', value: '', bar: 0, overlay: 'setup' })
		const s = this.connection.state
		const raw = v.raw(s)
		return renderValueStrip({ name: v.name, value: dbText(raw), bar: gainBar(raw), muted: v.muted(s), overlay: ctx.overlay })
	}

	override onDialRotate(ev: DialRotateEvent<JsonObject>): void {
		const v = gainSpec(ev.payload.settings)
		const step = num(ev.payload.settings.step)
		if (v && ev.payload.ticks) stepVol(this.connection, v, ev.payload.ticks * (Number.isFinite(step) && step !== 0 ? step : 1))
	}

	/** Press mutes the input (the plugin sends gain 0 for it). */
	override onDialDown(ev: DialDownEvent<JsonObject>): void {
		const v = gainSpec(ev.payload.settings)
		if (v) setMute(this.connection, v, 'toggle')
	}
}

export const gainActions = (connection: E2x2Connection) => [GainAction, GainDialAction].map((Action) => new Action(connection))
