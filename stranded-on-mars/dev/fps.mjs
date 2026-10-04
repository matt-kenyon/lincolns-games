// Real-time frame rate in each area of both levels, rendered on this machine's GPU (not part of the game).
//   BROWSER=chrome|webkit node fps.mjs        (local server on :8765 running)
// Uses a MacBook-sized window at 2x (Retina) and the game's normal adaptive quality, holds the trigger
// and slowly turns while aliens attack, then reports average fps, the slowest 1% of frames and the
// resolution scale the game settled on.
import { chromium, webkit } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:8765';
const which = process.env.BROWSER || 'chrome';
const browser = which === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({ channel: which === 'chrome' ? 'chrome' : undefined });
const page = await browser.newPage({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(BASE + '/stranded-on-mars/?debug', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });

const sample = (label, setup, secs = 5) => page.evaluate(async ([label, setup, secs]) => {
    const g = window.game;
    new Function('game', setup)(g);
    g.player.god = true;
    g.input.mouseL = true;
    const times = [];
    let last = performance.now();
    const t0 = last;
    await new Promise((done) => {
        const f = (now) => {
            times.push(now - last); last = now;
            g.input.mdx += 3;                      // keep turning so different things are on screen
            if (now - t0 < secs * 1000) requestAnimationFrame(f); else done();
        };
        requestAnimationFrame(f);
    });
    g.input.mouseL = false;
    const warm = times.slice(Math.floor(times.length * 0.4));   // skip the first 40% while quality adapts
    const avg = warm.reduce((a, b) => a + b, 0) / warm.length;
    const sorted = [...warm].sort((a, b) => b - a);
    const p99 = sorted[Math.floor(sorted.length * 0.01)];
    return { label, state: g.state, fps: +(1000 / avg).toFixed(0), worstFrameMs: +sorted[0].toFixed(0),
        slow1pctMs: +p99.toFixed(0), res: +g.pixelRatio.toFixed(2), calls: g.renderer.info.render.calls,
        shadows: g.renderer.shadowMap.enabled };
}, [label, setup, secs]);

const areas = [
    ['mars-start', 'game.newGame(); game.debug.skipIntro(); game.player.spawn(0,0,0);'],
    ['mars-fight1', 'game.player.spawn(14,-62,0.1);'],
    ['mars-crash', 'game.debug.openAll(); game.player.spawn(33,-600,0);'],
    ['ship-hangar', 'game.debug.stage2(0);'],
    ['ship-reactor', 'game.debug.teleport(1);'],
    ['ship-lab', 'game.debug.teleport(2);'],
    ['ship-bridge', 'game.debug.teleport(3);'],
    ['ship-pit-boss', 'game.debug.stage2(4); game.cine.skip(); game.player.spawn(4.4,-172.7,-0.315);'],
    ['ship-pod', 'game.debug.stage2(5);'],
];
console.log(`${which}: 1512x945 at 2x`);
for (const [label, setup] of areas) console.log(JSON.stringify(await sample(label, setup)));
await browser.close();
