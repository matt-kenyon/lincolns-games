// Real-time frame rate while driving Lincoln's rover flat out (not part of the game).
//   BROWSER=chrome|webkit node rover-fps.mjs        (local server on :8765 running; BASE_URL to change it)
// MacBook-sized window at 2x with the game's normal adaptive quality, like fps.mjs. The rover drives itself
// along the canyon path at full throttle (W held, the camera steered at a point 25 m up the path) from the
// landing site through Red Rock Canyon and the Crystal Forest, firing the turret now and then. Prints the
// average fps, the slowest 1% of frames, the worst frame, the resolution scale the game settled on and how
// many shader programs got compiled during the drive (a jump there is a stutter).
import { chromium, webkit } from 'playwright';
import { MUTE_ARGS, mutePage } from './mute.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8765';
const which = process.env.BROWSER || 'chrome';
const SECS = +(process.env.SECS || 24);
const browser = which === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({ channel: which === 'chrome' ? 'chrome' : undefined, args: MUTE_ARGS });
const page = await browser.newPage({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 });
await mutePage(page);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(BASE + '/stranded-on-mars/?debug', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });

const result = await page.evaluate(async (secs) => {
    const g = window.game;
    const v = [...document.querySelectorAll('script[type=importmap]')].map((s) => JSON.parse(s.textContent).imports['./js/layout.js'])[0];
    const L = await import(new URL(v, location.href).href);
    g.newGame();
    g.debug.skipIntro();
    await new Promise((r) => setTimeout(r, 300));
    g.debug.openAll();
    g.player.god = true;
    const frames = (n) => new Promise((r) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); });
    await frames(5);
    // the rover's first appearance shouldn't need any new shaders (it's compiled with Mars at boot)
    const pBefore = g.renderer.info.programs.length;
    const start = L.pathPointAt(40);
    g.debug.rover(start.x, start.z, Math.atan2(-start.tx, -start.tz));
    g.player.spawn(start.x + 2.6, start.z, 0);
    await frames(3);
    g.input.pressed.add('KeyE');
    await frames(40);
    const firstDrawPrograms = g.renderer.info.programs.length - pBefore;
    const R = g.rover;
    if (!R.driving) return { error: 'could not get in' };
    const q = {};
    // like a kid would: aim up the path, and when it's wedged against rocks, back up a bit turning, then go again
    let slowT = 0, backT = 0, backs = 0, side = 1;
    const steer = (dt) => {
        L.pathQuery(R.pos.x, R.pos.z, q);
        const t = L.pathPointAt(q.s + 25);
        let dx = t.x - R.pos.x, dz = t.z - R.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        // swerve round boulders in the way
        let push = 0;
        g.world.colliders.query(R.pos.x, R.pos.z, 18, (c) => {
            if (c.top < R.groundY + 0.75) return;
            const rx = c.x - R.pos.x, rz = c.z - R.pos.z;
            const along = rx * dx + rz * dz, lat = rx * -dz + rz * dx;
            if (along > 0 && along < 16 && Math.abs(lat) < c.r + 2.2) push += (lat > 0 ? -1 : 1) * (c.r + 2.4 - Math.abs(lat)) / Math.max(along, 3);
        });
        // (push > 0 steers right: the right of (dx, dz) is (-dz, dx))
        const ndx = dx - dz * push * 3, ndz = dz + dx * push * 3;
        g.player.yaw = Math.atan2(-ndx, -ndz);
        g.player.pitch = -0.18;
        slowT = R.speed < 2.5 ? slowT + dt : 0;
        if (slowT > 0.8 && backT <= 0) { backT = 1.1; backs++; side = -side; }
        if (backT > 0) {
            backT -= dt;
            g.player.yaw += side * 0.9;
            g.input.keys.delete('KeyW');
            g.input.keys.add('KeyS');
        } else {
            g.input.keys.delete('KeyS');
            g.input.keys.add('KeyW');
        }
    };
    g.input.keys.add('KeyW');
    const times = [];
    let last = performance.now();
    const t0 = last;
    const p0 = g.renderer.info.programs.length;
    let maxSpeed = 0, s0 = null, speedSum = 0, flips = 0;
    await new Promise((done) => {
        const f = (now) => {
            times.push(now - last);
            steer(Math.min(0.05, (now - last) / 1000));
            last = now;
            maxSpeed = Math.max(maxSpeed, R.speed);
            speedSum += R.speed;
            // tipped over on a wall? hold E to flip it back, like a player would
            if (R.flipped && !R.flip) {
                if (!g.input.keys.has('KeyE')) { flips++; g.input.pressed.add('KeyE'); }
                g.input.keys.add('KeyE');
            } else g.input.keys.delete('KeyE');
            if (s0 === null) s0 = q.s;
            g.input.mouseL = Math.floor((now - t0) / 1500) % 2 === 1;   // fire the turret every other 1.5 s
            if (now - t0 < secs * 1000) requestAnimationFrame(f); else done();
        };
        requestAnimationFrame(f);
    });
    g.input.keys.delete('KeyW');
    g.input.keys.delete('KeyS');
    g.input.mouseL = false;
    const warm = times.slice(Math.floor(times.length * 0.15));
    const avg = warm.reduce((a, b) => a + b, 0) / warm.length;
    const sorted = [...warm].sort((a, b) => b - a);
    return {
        fps: +(1000 / avg).toFixed(1), slow1pctMs: +sorted[Math.floor(sorted.length * 0.01)].toFixed(1), worstFrameMs: +sorted[0].toFixed(1),
        over25ms: warm.filter((t) => t > 25).length, frames: warm.length, res: +g.pixelRatio.toFixed(2),
        firstDrawPrograms, newPrograms: g.renderer.info.programs.length - p0, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles,
        maxSpeed: +maxSpeed.toFixed(1), avgSpeed: +(speedSum / times.length).toFixed(1), flips, backUps: backs, metersDriven: Math.round(q.s - s0), endedIn: g.level.zoneName(g.level.zone), shots: g.stats.shots, aliens: g.stats.aliens,
    };
}, SECS);
console.log(`${which}: 1512x945 at 2x, ${SECS}s at full throttle`);
console.log(JSON.stringify(result));
await browser.close();
