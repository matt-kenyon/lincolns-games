// Contact sheet: put several screenshots side by side in one image (handy for reviewing cutscenes).
//   node grid.mjs out/sheet.png 3 out/a.png out/b.png out/c.png ...
// TILE=320 sets the tile width (default 640). A "-" leaves a tile empty.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const [out, cols, ...imgs] = process.argv.slice(2);
if (!out || !imgs.length) {
    console.log('Usage: node grid.mjs <out.png> <columns> <image.png>...');
    process.exit(1);
}
const c = +cols || 2;
const w = +(process.env.TILE || 640), h = Math.round(w * 9 / 16);
const html = `<html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${c},${w}px);gap:2px">`
    + imgs.map((f) => f === '-' ? '<div></div>' : `<div style="position:relative"><img style="width:${w}px;height:${h}px;display:block" src="${pathToFileURL(path.resolve(f)).href}">`
        + `<span style="position:absolute;left:6px;top:4px;color:#ff0;font:bold ${w < 500 ? 12 : 16}px sans-serif;text-shadow:0 0 3px #000">${path.basename(f)}</span></div>`).join('')
    + '</body></html>';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: c * (w + 2), height: Math.ceil(imgs.length / c) * (h + 2) } });
// The page loads the images as files (embedding a big batch of screenshots as base64 can crash it).
const tmp = path.resolve(out) + '.tmp.html';
fs.writeFileSync(tmp, html);
await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
fs.unlinkSync(tmp);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('wrote', out);
