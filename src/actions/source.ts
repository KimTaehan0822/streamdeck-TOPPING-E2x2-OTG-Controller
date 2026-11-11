import { action, type KeyDownEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import { renderSourceKey } from '../render/keys.js'
import { E2x2Action, type RenderContext } from '../runtime/base-action.js'
import { nameOf } from './common.js'
import { mixIndexOf, SOURCE_NAMES, sourceSpec, TARGET_NAMES } from './source-spec.js'

@action({ UUID: 'com.haeunga0822.topping-e2x2.source' })
class SourceAction extends E2x2Action<JsonObject> {
	protected render(settings: JsonObject, ctx: RenderContext): string {
		const spec = sourceSpec(settings)
		if (!spec) return renderSourceKey({ target: '', source: '', overlay: 'setup' })
		const cur = spec.current(this.connection.state)
		return renderSourceKey({ target: nameOf(settings, TARGET_NAMES[spec.target]), source: cur ? SOURCE_NAMES[cur] : '?', sourceMix: mixIndexOf(cur), overlay: ctx.overlay })
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		sourceSpec(ev.payload.settings)?.press(this.connection, ev.payload.settings)
	}
}

export const sourceActions = (connection: E2x2Connection) => [new SourceAction(connection)]
