// Shared Property Inspector code. Every PI loads sdpi-components.js, then this file.
// It puts the sync limitation and the recommended workflow at the top of the screen.
const NOTICE = `
<style>
	.notice { margin: 4px 0 12px; padding: 8px 10px; border-left: 3px solid #e2b23a; background: #2d2d2d; color: #d8d8d8; font-size: 9pt; line-height: 1.4; }
	.notice b { color: #e2b23a; }
	.notice details { margin-top: 6px; }
	.notice summary { cursor: pointer; color: #969696; user-select: none; }
	.notice ol { margin: 6px 0 0; padding-left: 18px; }
	.notice.danger { border-left-color: #e5483e; }
	.notice.danger b { color: #e5483e; }
</style>
<div class="notice">
	<b>Heads up:</b> values changed from Stream Deck are not shown in the TOPPING app, and the app can overwrite them
	(it goes back to the values it remembers when you change the Mix view or restart it).
	<details><summary>Recommended workflow</summary>
	<ol>
		<li>In the TOPPING app, set your levels and save the workspace.</li>
		<li>Click the download icon to the right of the workspace name and choose <b>Save the current workspace and download to the device</b>, then OK.</li>
		<li>Press a Stream Deck Workspace load key for that workspace, so the device and this plugin hold the same values.</li>
		<li>After that, use Stream Deck as your main control.</li>
	</ol></details>
</div>`
document.body.insertAdjacentHTML('afterbegin', NOTICE)

/** Custom key name field (empty = the default name, shown as the placeholder). */
const nameField = (placeholder) =>
	`<sdpi-item label="Name"><sdpi-textfield setting="name" maxlength="24" placeholder="${placeholder || 'Channel name'}"></sdpi-textfield></sdpi-item>`

// Fields a page adds from script miss what sdpi picks up while the page loads: sdpi-select only sees options
// added after it is on the page, and saved settings only reach fields that existed at connect. Redo both.
async function initFields(root) {
	for (const s of root.querySelectorAll('sdpi-select, sdpi-checkbox-list')) s.append(...s.querySelectorAll('option'))
	await Promise.all([...root.querySelectorAll('[setting]')].map((e) => e.updateComplete))
	await SDPIComponents.streamDeckClient.getSettings()
}
