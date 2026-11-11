// Writes plugin.svg and category.svg (the sources of imgs/plugin*.png and imgs/category*.png) and the HTML pages used to render them.
// Render: msedge --headless=new --disable-gpu --default-background-color=00000000 --window-size=W,H --screenshot=out.png page.html
import { writeFileSync } from 'node:fs'
const here = new URL('./', import.meta.url)
const KNOB = '#D8D8D8'
const MIX = ['#75CB75', '#309BE8', '#EBCD29', '#FFA500']
let lines = ''
for (let y = 12; y < 246; y += 3) lines += `<line x1="10" y1="${y}" x2="246" y2="${y}" stroke="#fff" stroke-opacity="${y % 9 === 0 ? 0.035 : 0.018}"/>`
const plate = `<defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#303030"/><stop offset=".55" stop-color="#1C1C1C"/><stop offset="1" stop-color="#121212"/></linearGradient><clipPath id="pc"><rect x="8" y="8" width="240" height="240" rx="48"/></clipPath></defs><rect x="8" y="8" width="240" height="240" rx="48" fill="url(#p)"/><g clip-path="url(#pc)">${lines}</g><rect x="8.5" y="8.5" width="239" height="239" rx="47.5" fill="none" stroke="#4A4A4A"/>`
const cap = (x, y) => `<rect x="${x - 19}" y="${y - 8}" width="38" height="16" rx="3" fill="${KNOB}" stroke="#000" stroke-width="2"/><line x1="${x - 13}" y1="${y}" x2="${x + 13}" y2="${y}" stroke="#555" stroke-width="3"/>`
const ys = [148, 98, 172, 120]
let faders = ''
ys.forEach((y, i) => {
	const x = 58 + i * 47
	faders += `<rect x="${x - 5}" y="44" width="10" height="168" rx="5" fill="#0A0A0A"/><rect x="${x - 5}" y="${y}" width="10" height="${212 - y}" rx="5" fill="${MIX[i]}"/>${cap(x, y)}`
})
const plugin = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${plate}${faders}</svg>`
const category = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="56" height="56"><g fill="#fff"><rect x="12" y="8" width="4" height="40" rx="2" opacity=".55"/><rect x="26" y="8" width="4" height="40" rx="2" opacity=".55"/><rect x="40" y="8" width="4" height="40" rx="2" opacity=".55"/><rect x="6" y="30" width="16" height="8" rx="2"/><rect x="20" y="16" width="16" height="8" rx="2"/><rect x="34" y="36" width="16" height="8" rx="2"/></g></svg>`
const page = (svg, px) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`
writeFileSync(new URL('plugin.svg', here), plugin)
writeFileSync(new URL('category.svg', here), category)
for (const [n, svg, px] of [['plugin-256', plugin, 256], ['plugin-512', plugin, 512], ['category-28', category, 28], ['category-56', category, 56]]) writeFileSync(new URL(`${n}.html`, here), page(svg, px))
