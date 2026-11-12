import { action, type DialDownEvent, type DialRotateEvent, type DialUpEvent, type KeyDownEvent, type TouchTapEvent, type WillDisappearEvent } from '@elgato/streamdeck'
import type { JsonObject } from '@elgato/utils'
import type { E2x2Connection } from '../connection.js'
import { levelToAxis } from '../protocol/meter.js'
import { renderButtonFader, renderValueKey, renderValueStrip, renderVuStrip } from '../render/keys.js'
import { E2x2Action, type RenderContext } from '../runtime/base-action.js'
import { num, pick } from './common.js'
import { dbText, faderOp, faderPos, meterOf, meterView, panOp, panSpec, panText, pressFader, pressPan, roleSign, setMute, setPan, setVol, stepPan, stepVol, volSpec, type Vol } from './fader-spec.js'

const ID = 'com.haeunga0822.topping-e2x2.'
const SETUP_KEY = renderValueKey({ name: '', value: '', overlay: 'setup' })
const SETUP_STRIP = renderVuStrip({ name: '', left: 0, right: 0, faderDb: '', levelDb: '', muted: false, overlay: 'setup' })
const ROLES = { top: 1, bottom: 1, left: 1, right: 1 }
const PEEK_MS = 700
const dbStep = (v: unknown, fallback = 1): number => {
	const n = num(v)
	return Number.isFinite(n) && n !== 0 ? n : fallback
}

/** Value key shared by the fader and the digital gain: dB text plus a fader cap (with output meters when the target has them). */
export abstract class VolKeyAction extends E2x2Action<JsonObject> {
	protected abstract vol(settings: JsonObject): Vol | undefined

	protected render(settings: JsonObject, ctx: RenderContext): string {
		const v = this.vol(settings)
		if (!v || !faderOp(settings)) return SETUP_KEY
		const s = this.connection.state
		const raw = v.raw(s)
		const pair = v.target && meterOf(v.target)
		const [left, right] = pair ? pair.map((c) => this.connection.meters.get(c) ?? 0) : [0, 0]
		return renderValueKey({
			name: ctx.userTitle ? '' : v.name,
			mix: ctx.userTitle ? undefined : v.mix,
			value: v.muted(s) ? 'MUTED' : dbText(raw),
			meter: { left: levelToAxis(left), right: levelToAxis(right), fader: (v.pos ?? faderPos)(raw), muted: v.muted(s) },
			overlay: ctx.overlay,
		})
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const settings = ev.payload.settings
		const v = this.vol(settings)
		const op = faderOp(settings)
		if (!v || !op) return
		if (op.set) pressFader(this.connection, v, op)
		else this.hold(ev.action, () => pressFader(this.connection, v, op))
	}
}

@action({ UUID: ID + 'fader' })
class FaderAction extends VolKeyAction {
	protected vol = volSpec
}

/** Strip with output meters for fader-like actions; adjusting a muted target shows its dB for a moment instead of MUTED. */
abstract class MeterAction extends E2x2Action<JsonObject> {
	private readonly adjusted = new Map<string, number>()
	private peekTimer?: NodeJS.Timeout

	protected view(settings: JsonObject, ctx: RenderContext) {
		const v = volSpec(settings)
		if (!v) return undefined
		const peek = Date.now() - (this.adjusted.get(this.key(settings)) ?? -PEEK_MS) < PEEK_MS
		return { ...meterView(v, this.connection.state, this.connection.meters, peek), overlay: ctx.overlay }
	}

	private key = (s: JsonObject) => JSON.stringify([s.kind, s.mix, s.channel])

	/** Starts the peek window and redraws once more when it ends, so MUTED returns. */
	protected adjust(settings: JsonObject, change: () => void): void {
		change()
		this.adjusted.set(this.key(settings), Date.now())
		clearTimeout(this.peekTimer)
		this.peekTimer = setTimeout(() => this.refresh(), PEEK_MS + 20)
		this.peekTimer.unref()
	}
}

@action({ UUID: ID + 'button-fader' })
class ButtonFaderAction extends MeterAction {
	protected render(settings: JsonObject, ctx: RenderContext): string {
		const view = this.view(settings, ctx)
		const role = pick(settings.role, ROLES)
		return view && role ? renderButtonFader(view, role) : SETUP_KEY
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const settings = ev.payload.settings
		const v = volSpec(settings)
		const role = pick(settings.role, ROLES)
		if (!v || !role) return
		const db = roleSign(role) * Math.abs(dbStep(settings.step))
		this.hold(ev.action, () => this.adjust(settings, () => stepVol(this.connection, v, db)))
	}
}

const MUTE_OPS = { muteToggle: 'toggle', muteOn: 'on', muteOff: 'off' } as const
const PRESS_ACTIONS = { mute: 1, recall: 1 }
const TURN_ACTIONS = { step: 1, muteToggle: 1, muteOn: 1, muteOff: 1, recall: 1 }

@action({ UUID: ID + 'vu-dial' })
class VuDialAction extends MeterAction {
	/** Per held dial: whether it turned, and which directions already ran a once-per-hold action. */
	private readonly presses = new Map<string, { turned: boolean; fired: Set<string> }>()

	protected render(settings: JsonObject, ctx: RenderContext): string {
		const view = this.view(settings, ctx)
		return view ? renderVuStrip(view) : SETUP_STRIP
	}

	override onWillDisappear(ev: WillDisappearEvent<JsonObject>): void {
		this.presses.delete(ev.action.id)
		super.onWillDisappear(ev)
	}

	// The press acts on release so a press-and-turn can skip it.
	override onDialDown(ev: DialDownEvent<JsonObject>): void {
		this.presses.set(ev.action.id, { turned: false, fired: new Set() })
	}

	override onDialUp(ev: DialUpEvent<JsonObject>): void {
		const hold = this.presses.get(ev.action.id)
		this.presses.delete(ev.action.id)
		const s = ev.payload.settings
		if (hold && !hold.turned) this.run(s, pick(s.pressAction, PRESS_ACTIONS) === 'recall' ? 'recall' : 'muteToggle', s.pressDb)
	}

	override onDialRotate(ev: DialRotateEvent<JsonObject>): void {
		const s = ev.payload.settings
		const v = volSpec(s)
		const id = ev.action.id
		if (!v || !ev.payload.ticks) return
		// A held turn with no recorded press (e.g. the plugin restarted mid-hold) starts its own hold.
		if (ev.payload.pressed && !this.presses.has(id)) this.presses.set(id, { turned: false, fired: new Set() })
		const hold = ev.payload.pressed ? this.presses.get(id) : undefined
		const dir = ev.payload.ticks < 0 ? 'left' : 'right'
		const chosen = ev.payload.pressed ? (pick(s[dir + 'Action'], TURN_ACTIONS) ?? 'step') : 'step'
		if (hold) hold.turned = true
		if (chosen === 'step') return this.adjust(s, () => stepVol(this.connection, v, ev.payload.ticks * dbStep(s.step)))
		if (hold?.fired.has(dir)) return
		hold?.fired.add(dir)
		this.run(s, chosen, s[dir + 'Db'])
	}

	/** A mute operation or a recall to `db` (nothing when it is not a number). */
	private run(s: JsonObject, chosen: string, db: unknown): void {
		const v = volSpec(s)
		if (!v) return
		if (chosen !== 'recall') return setMute(this.connection, v, MUTE_OPS[chosen as keyof typeof MUTE_OPS] ?? 'toggle')
		const value = num(db)
		if (Number.isFinite(value)) this.adjust(s, () => setVol(this.connection, v, value))
	}

	override onTouchTap(ev: TouchTapEvent<JsonObject>): void {
		const s = ev.payload.settings
		const v = volSpec(s)
		if (v && s.touchMute !== false && s.touchMute !== 'false') setMute(this.connection, v, 'toggle')
	}
}

@action({ UUID: ID + 'pan' })
class PanAction extends E2x2Action<JsonObject> {
	protected render(settings: JsonObject, ctx: RenderContext): string {
		const p = panSpec(settings)
		if (!p || !panOp(settings)) return SETUP_KEY
		const v = p.read(this.connection.state)
		return renderValueKey({ name: ctx.userTitle ? '' : p.name, mix: ctx.userTitle ? undefined : p.mix, value: panText(v), bar: v, overlay: ctx.overlay })
	}

	override onKeyDown(ev: KeyDownEvent<JsonObject>): void {
		const p = panSpec(ev.payload.settings)
		const op = panOp(ev.payload.settings)
		if (!p || !op) return
		if (op.set) pressPan(this.connection, p, op)
		else this.hold(ev.action, () => pressPan(this.connection, p, op))
	}
}

@action({ UUID: ID + 'pan-dial' })
class PanDialAction extends E2x2Action<JsonObject> {
	protected render(settings: JsonObject, ctx: RenderContext): string {
		const p = panSpec(settings)
		if (!p) return renderValueStrip({ name: '', value: '', bar: 0.5, overlay: 'setup' })
		const v = p.read(this.connection.state)
		return renderValueStrip({ mix: p.mix, name: p.name, value: panText(v), bar: v, center: true, overlay: ctx.overlay })
	}

	override onDialRotate(ev: DialRotateEvent<JsonObject>): void {
		const p = panSpec(ev.payload.settings)
		if (p && ev.payload.ticks) stepPan(this.connection, p, ev.payload.ticks * dbStep(ev.payload.settings.step, 5))
	}

	/** Press centres the pan (a LINKed pair keeps its width). */
	override onDialDown(ev: DialDownEvent<JsonObject>): void {
		const p = panSpec(ev.payload.settings)
		if (p) setPan(this.connection, p, 0)
	}
}

export const faderActions = (connection: E2x2Connection) =>
	[FaderAction, ButtonFaderAction, VuDialAction, PanAction, PanDialAction].map((Action) => new Action(connection))
