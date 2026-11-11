// Copies node-hid and its runtime dependencies next to the bundle (it is a native addon, so rollup leaves it external).
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'

const dest = 'com.haeunga0822.topping-e2x2.sdPlugin/bin/node_modules'
const buildOnly = new Set(['node-addon-api']) // only needed to compile node-hid, which ships prebuilt binaries
const seen = new Set()
function copy(name) {
	if (seen.has(name) || buildOnly.has(name)) return
	seen.add(name)
	const dir = `node_modules/${name}`
	if (!existsSync(dir)) throw new Error(`${dir} is missing - run npm install`)
	cpSync(dir, `${dest}/${name}`, {
		recursive: true,
		// the plugin is Windows-only: skip build sources and other platforms' prebuilt binaries
		filter: (src) => {
			const path = src.replaceAll(String.fromCharCode(92), '/')
			return !/\/(src|hidapi)(\/|$)/.test(path) && !/\/prebuilds\/(?!HID-win32)[^/]/.test(path)
		},
	})
	const { dependencies = {} } = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'))
	for (const dep of Object.keys(dependencies)) copy(dep)
}

rmSync(dest, { recursive: true, force: true })
copy('node-hid')
console.log(`copied: ${[...seen].join(', ')}`)
