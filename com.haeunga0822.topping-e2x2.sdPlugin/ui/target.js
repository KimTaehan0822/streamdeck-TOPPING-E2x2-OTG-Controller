// Shared by the volume PIs (fader.html, vu-dial.html, gain.html); load after common.js.
const MIXES = { 0: 'MIX A', 1: 'MIX B', 2: 'MIX C', 3: 'MIX D' }
const MIX_CH = { in12: 'IN 1/2', otg: 'OTG', pb12: 'PB 1/2', pb34: 'PB 3/4', pb56: 'PB 5/6', pb78: 'PB 7/8' }
const KINDS = { mix: 'Mix channel', loopback: 'Loopback', output: 'Output' }
const CHANNELS = {
	mix: MIX_CH,
	loopback: { lp12: 'Loop 1/2', lp34: 'Loop 3/4', lp56: 'Loop 5/6' },
	output: { out12: 'Out 1/2', mobile: 'Mobile Out', spdif: 'S/PDIF' },
}
const SIDES = { pair: 'Both (pair)', L: 'L only', R: 'R only' }
const INPUTS = { in1: 'IN 1', in2: 'IN 2', mobile: 'Mobile' }

const select = (setting, label, items, extra = '') =>
	`<sdpi-item label="${label}"><sdpi-select setting="${setting}" ${extra}>${Object.entries(items)
		.map(([value, text]) => `<option value="${value}">${text}</option>`)
		.join('')}</sdpi-select></sdpi-item>`
const text = (setting, label, placeholder, def = '') =>
	`<sdpi-item label="${label}"><sdpi-textfield setting="${setting}" placeholder="${placeholder}" ${def ? `default="${def}"` : ''}></sdpi-textfield></sdpi-item>`

/** Target fields (mix kinds only when `mixOnly`). s = the saved settings. */
function targetHtml(s, mixOnly = false) {
	const kind = mixOnly ? 'mix' : (s.kind ?? 'mix')
	let html = mixOnly ? '' : select('kind', 'Target', KINDS, 'default="mix"')
	if (kind === 'mix') html += select('mix', 'Mix', MIXES, 'default="0"')
	return html + select('channel', 'Channel', CHANNELS[kind], 'placeholder="Select channel"') + select('side', 'Side', SIDES, 'default="pair"')
}

/** Draws build(type, settings) into #fields; a change of any `watch` setting saves it and redraws (a new target kind clears the channel). */
async function mountPI(build, watch) {
	const client = SDPIComponents.streamDeckClient
	const { actionInfo } = await client.getConnectionInfo()
	const type = actionInfo.action.split('.').pop()
	const fields = document.getElementById('fields')
	const saved = async () => (await client.getSettings()).settings ?? {}
	let s = await saved()
	const draw = () => {
		fields.innerHTML = build(type, s)
		initFields(fields)
		for (const name of watch) {
			fields.querySelector(`[setting="${name}"]`)?.addEventListener('valuechange', async (e) => {
				if (e.target.value === s[name]) return
				const next = { ...(await saved()), [name]: e.target.value }
				if (name === 'kind') next.channel = undefined
				await client.setSettings(next)
				s = next
				draw()
			})
		}
	}
	draw()
}
