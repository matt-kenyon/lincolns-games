// ============================================================
// Headless test runner for Stranded on Mars (not part of the game).
//
//   node run.mjs tests/full.json          (from this folder, with a local server running)
//
// A test is a JSON list of steps, run in order:
//   {"url": "/stranded-on-mars/?debug&quality=low"}   load a page, wait for window.__ready
//   {"eval": "js expression"}                        run in the page; non-null results are printed
//   {"until": "js condition", "timeout": 60000}      wait until the condition is true
//   {"wait": 500}                                    wait (milliseconds)
//   {"key": "KeyW", "hold": 200}                     press (and hold) a key
//   {"click": "#btn-start"}                          click an element
//   {"shot": "name.png"}                             save a screenshot into dev/out/
// Environment: BASE_URL (default http://localhost:8765), HEADED=1 to watch it run,
// BROWSER=chrome (the installed Google Chrome) or BROWSER=webkit (Safari's engine). Default: Playwright's Chromium.
// The game exposes window.game; game.debug has helpers (see CLAUDE.md).
// ============================================================
import { chromium, webkit } from 'playwright';
import { MUTE_ARGS, mutePage } from './mute.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const file = process.argv[2];
if (!file) {
    console.log('Usage: node run.mjs tests/<test>.json');
    process.exit(1);
}
const steps = JSON.parse(fs.readFileSync(file, 'utf8'));

// Linux containers have no GPU: use the SwiftShader software renderer there.
const args = ['--autoplay-policy=no-user-gesture-required', ...MUTE_ARGS];
if (process.platform === 'linux') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
const which = process.env.BROWSER || 'chromium';
const browser = which === 'webkit'
    ? await webkit.launch({ headless: !process.env.HEADED })
    : await chromium.launch({ headless: !process.env.HEADED, args, channel: which === 'chrome' ? 'chrome' : undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await mutePage(page);
const logs = [];
let errors = 0;
page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 600)}`);
});
page.on('pageerror', (e) => { errors++; logs.push(`[pageerror] ${e.message}\n${(e.stack || '').slice(0, 800)}`); });
const flush = () => { if (logs.length) console.log(logs.splice(0).join('\n')); };

for (const s of steps) {
    try {
        if (s.url) {
            await page.goto(s.url.startsWith('http') ? s.url : BASE + s.url, { waitUntil: 'load' });
            await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
        } else if (s.eval) {
            const r = await page.evaluate(s.eval);
            if (r !== undefined && r !== null) logs.push('[eval] ' + JSON.stringify(r).slice(0, 1500));
        } else if (s.until) {
            const t0 = Date.now();
            await page.waitForFunction(s.until, null, { timeout: s.timeout || 60000, polling: 100 });
            logs.push(`[until] ${s.until.slice(0, 60)} after ${Date.now() - t0}ms`);
        } else if (s.wait) {
            await page.waitForTimeout(s.wait);
        } else if (s.shot) {
            const p = path.isAbsolute(s.shot) ? s.shot : path.join(outDir, s.shot);
            await page.screenshot({ path: p });
            logs.push('[shot] ' + path.relative(process.cwd(), p));
        } else if (s.key) {
            await page.keyboard.down(s.key);
            await page.waitForTimeout(s.hold || 100);
            await page.keyboard.up(s.key);
        } else if (s.click) {
            await page.click(s.click);
        }
    } catch (e) {
        errors++;
        logs.push('[step error] ' + JSON.stringify(s).slice(0, 200) + ' :: ' + e.message.slice(0, 400));
    }
    flush();
}
await browser.close();
console.log(errors ? `\n${errors} problem(s) found` : '\nOK, no errors');
process.exit(errors ? 1 : 0);
