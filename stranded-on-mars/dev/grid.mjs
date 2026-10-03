// Contact sheet: put several screenshots side by side in one image (handy for reviewing cutscenes).
//   node grid.mjs out/sheet.png 3 out/a.png out/b.png out/c.png ...
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const [out, cols, ...imgs] = process.argv.slice(2);
if (!out || !imgs.length) {
    console.log('Usage: node grid.mjs <out.png> <columns> <image.png>...');
    process.exit(1);
}
const c = +cols || 2;
const w = 640, h = 360;
const html = `<html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${c},${w}px);gap:2px">`
    + imgs.map((f) => `<div style="position:relative"><img style="width:${w}px;height:${h}px;display:block" src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">`
        + `<span style="position:absolute;left:6px;top:4px;color:#ff0;font:bold 16px sans-serif;text-shadow:0 0 3px #000">${path.basename(f)}</span></div>`).join('')
    + '</body></html>';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: c * (w + 2), height: Math.ceil(imgs.length / c) * (h + 2) } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('wrote', out);
