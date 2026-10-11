// How long the game takes to load (page load to the title screen), in a fresh browser each run (not part of the game).
//   BROWSER=chrome node boot-time.mjs [runs]        (local server running; BASE_URL like run.mjs)
// Prints each run and the median, plus how long the Mars terrain took to build (World.build).
import { chromium, webkit } from 'playwright';
import { MUTE_ARGS, mutePage } from './mute.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8765';
const which = process.env.BROWSER || 'chromium';
const runs = +(process.argv[2] || 3);
const times = [];
for (let i = 0; i < runs; i++) {
    const browser = which === 'webkit'
        ? await webkit.launch()
        : await chromium.launch({ args: MUTE_ARGS, channel: which === 'chrome' ? 'chrome' : undefined });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await mutePage(page);
    const t0 = Date.now();
    await page.goto(BASE + '/stranded-on-mars/?quality=high', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000, polling: 50 });
    const ms = Date.now() - t0;
    times.push(ms);
    console.log(`run ${i + 1}: ${ms} ms`);
    await browser.close();
}
times.sort((a, b) => a - b);
console.log(`median: ${times[Math.floor(times.length / 2)]} ms`);
