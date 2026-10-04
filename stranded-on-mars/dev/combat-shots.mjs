// Frame-by-frame screenshots of combat effects (not part of the game).
//   BROWSER=chrome node combat-shots.mjs <label> [scenario ...]      (local server running, see README)
// Each scenario sets up one moment of a fight, pauses the real game loop and then advances the game itself in
// small steps (dt), screenshotting every step, so short effects (bolts, impacts, poofs, the grenade blast) can be
// looked at frame by frame. Math.random is seeded so runs are repeatable.
// Writes out/combat-<label>/<scenario>_NN.png, one sheet per scenario (out/combat-<label>/<scenario>.png) and an
// overview with one row per scenario (out/combat-<label>.png).
import { chromium, webkit } from 'playwright';
import { MUTE_ARGS, mutePage } from './mute.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const label = process.argv[2] || 'shots';
const only = process.argv.slice(3);
const outDir = path.join(here, 'out', 'combat-' + label);
fs.mkdirSync(outDir, { recursive: true });

// Per-frame time steps. Each listed dt is one screenshot (long steps are split into 1/60 s sub-steps).
const rep = (n, dt) => Array(n).fill(dt);

// setup: JS run once after the page loads (fx helpers below are available).
// frames: list of dt (or {dt, inp}) to step + screenshot. inp: input held for the whole scenario unless a frame overrides it.
const SCENARIOS = [
    {
        name: 'mars_bolts', // your bolts flying down the canyon
        setup: `fx.mars(); fx.aimAhead(70, 1.2);`,
        inp: { fire: true }, frames: rep(10, 1 / 30),
    },
    {
        name: 'mars_hit_alien', // body shots on a trooper 10 m away
        setup: `fx.mars(); const a = fx.subject('trooper', 10); a.hp = a.maxHp = 99; fx.track = () => fx.chest(a);`,
        inp: { fire: true }, frames: rep(10, 1 / 30),
    },
    {
        name: 'mars_headshot', // aim at the head, no aim assist
        setup: `fx.mars(); const a = fx.subject('scout', 9); a.hp = a.maxHp = 99; game.diff = Object.assign({}, game.diff, {aimAssist: 0}); fx.track = () => fx.head(a);`,
        inp: { fire: true }, frames: rep(10, 1 / 30),
    },
    {
        name: 'mars_hit_ground', // shots into the dirt 7 m ahead
        setup: `fx.mars(); fx.aimGround(7);`,
        inp: { fire: true }, frames: rep(10, 1 / 30),
    },
    {
        name: 'mars_captain_shield', // the Captain's gold shield shell
        setup: `fx.mars(4); const a = fx.subject('captain', 12); fx.track = () => fx.chest(a);`,
        inp: { fire: true }, frames: rep(10, 1 / 30),
    },
    {
        name: 'mars_alien_bolts', // a trooper shoots at you (you can get hit)
        setup: `fx.mars(); const a = fx.subject('trooper', 13, 2); fx.attack(a); game.player.god = false; game.player.invuln = 0; fx.track = () => fx.chest(a);`,
        frames: [...rep(5, 0.15), ...rep(7, 1 / 30), 0.1, 0.15],
    },
    {
        name: 'mars_poof', // a trooper is beaten: hit, fall, poof
        setup: `fx.mars(); const a = fx.subject('trooper', 7); fx.track = () => fx.chest(a); window.__a = a;`,
        frames: [{ dt: 1 / 30, inp: { fire: true }, pre: 'window.__a.hp = 1' }, 1 / 30, 0.2, 0.3, 0.25, 1 / 30, 1 / 30, 1 / 20, 1 / 20, 0.1, 0.15, 0.25],
    },
    {
        name: 'mars_grenade', // throw, bounce, boom next to two aliens
        setup: `fx.mars(); const a = fx.subject('trooper', 10, -1.2); const b = fx.subject('scout', 11, 1.6); a.hp = b.hp = 99; fx.aimAt(fx.feet(a, 8.5), -0.2);`,
        frames: [{ dt: 0.05, inp: { grenade: true, grenadePressed: true } }, 0.1, 0.15, 0.3, 0.4, 0.4, 0.35, 0.1, 1 / 30, 1 / 30, 1 / 30, 0.05, 0.1, 0.2],
    },
    {
        name: 'mars_boom_close', // a grenade blast on the ground 8 m away
        setup: `fx.mars(); fx.aimAhead(30, 1.2); const p = fx.ahead(8, 1); window.__boom = new game.player.pos.constructor(p.x, game.world.groundAt(p.x, p.z) + 0.13, p.z);`,
        frames: [{ dt: 1 / 60, pre: 'game.combat.explode(window.__boom)' }, ...rep(5, 1 / 30), 0.05, 0.1, 0.15, 0.2, 0.3, 0.4],
    },
    {
        name: 'mars_overheat', // fire until the blaster overheats, then it vents
        setup: `fx.mars(); fx.aimAhead(70, 1.2); fx.run(1.95, {fire: true});`,
        inp: { fire: true }, frames: rep(10, 1 / 15),
    },
    {
        name: 'ship_bolts_wall', // shots hitting a mothership wall
        setup: `fx.ship(0); game.player.spawn(-3, 5, 0); fx.aimAtXYZ(-24, 3, 8);`,
        inp: { fire: true }, frames: rep(10, 1 / 30),
    },
    {
        name: 'ship_hit_alien', // hits on an alien in the hangar
        setup: `fx.ship(0); game.player.spawn(-3, 5, 0); const a = fx.subject('trooper', 9); a.hp = a.maxHp = 99; fx.track = () => fx.chest(a);`,
        inp: { fire: true }, frames: rep(10, 1 / 30),
    },
    {
        name: 'ship_alien_bolts', // incoming fire in the mothership
        setup: `fx.ship(0); game.player.spawn(-3, 5, 0); const a = fx.subject('major', 13, -2); fx.attack(a); game.player.god = false; game.player.invuln = 0; fx.track = () => fx.chest(a);`,
        frames: [...rep(5, 0.15), ...rep(7, 1 / 30), 0.1, 0.15],
    },
    {
        name: 'ship_poof_drops', // a kill in the mothership, with heart + grenade drops
        setup: `fx.ship(0); game.player.spawn(-3, 5, 0); const a = fx.subject('trooper', 7); fx.track = () => fx.chest(a); window.__a = a;`,
        frames: [{ dt: 1 / 30, inp: { fire: true }, pre: 'window.__a.hp = 1' }, 1 / 30, 0.2, 0.3, 0.25, 1 / 30, 1 / 30, { dt: 1 / 20, pre: "const a = window.__a; game.level.drops.spawn('heart', a.pos.clone().setY(1)); game.level.drops.spawn('grenade', a.pos.clone().setY(1))" }, 1 / 20, 0.1, 0.25, 0.4],
    },
    {
        name: 'ship_grenade', // a grenade in the hangar, three aliens nearby
        setup: `fx.ship(0); game.player.spawn(-3, 5, 0); const a = fx.subject('trooper', 10, -1.5); const b = fx.subject('scout', 11, 1.5); const c = fx.subject('trooper', 12.5, 0); a.hp = b.hp = c.hp = 99; fx.aimAt(fx.feet(a, 9.5), -0.16);`,
        frames: [{ dt: 0.05, inp: { grenade: true, grenadePressed: true } }, 0.1, 0.15, 0.3, 0.4, 0.4, 0.35, 0.1, 1 / 30, 1 / 30, 1 / 30, 0.05, 0.1, 0.2],
    },
    {
        name: 'ship_boom_close', // a grenade blast on the hangar floor 8 m away
        setup: `fx.ship(0); game.player.spawn(-3, 5, 0.6); fx.aimAhead(30, 1.2); const p = fx.ahead(8, 1); window.__boom = new game.player.pos.constructor(p.x, 0.13, p.z);`,
        frames: [{ dt: 1 / 60, pre: 'game.combat.explode(window.__boom)' }, ...rep(5, 1 / 30), 0.05, 0.1, 0.15, 0.2, 0.3, 0.4],
    },
    {
        name: 'ship_glorbax_skin', // bolts clanking off GLORBAX's skin
        setup: `fx.boss(); game.player.spawn(12, -182.5, 0); const B = game.level.boss; fx.track = () => B.pos.clone().add(new B.pos.constructor(0.6, -2.4, 1.2));`,
        inp: { fire: true }, frames: rep(10, 1 / 30),
    },
    {
        name: 'ship_big_fight', // every Reactor Core wave at once, fighting back
        setup: `fx.ship(1); game.player.spawn(0, -40, 0); fx.step(0.5, {}); game.aliens.startWave(1, 1); game.aliens.startWave(1, 2); fx.unfreezeAll(); for (const a of game.aliens.byZone[1]) a.hp *= 4; fx.run(1.5, {}); fx.trackNearest();`,
        inp: { fire: true }, frames: rep(10, 1 / 12),
    },
];

// In-page helpers (window.fx)
const HELPERS = `
window.fx = (() => {
  const g = game;
  // captures only: hide the click-to-play button, and optionally the old square muzzle plane (HIDE_VM_FLASH=1)
  document.getElementById('click-resume')?.style.setProperty('display', 'none', 'important');
  if (window.__hideVmFlash && g.player.vm.flash) g.player.vm.flash.visible = false;
  const base = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, padLookX: 0, padLookY: 0, jump: false, sprint: false, fire: false,
    grenade: false, grenadePressed: false, interact: false, pause: false, confirm: false, skip: false };
  const V = g.player.pos.constructor;
  const fx = {
    track: null,
    // advance the game by dt (the real loop is held in 'paused', which only re-renders)
    step(dt, inp = {}) {
      let left = dt;
      while (left > 1e-6) {
        const d = Math.min(left, 1 / 60);
        left -= d;
        g.state = 'play';
        if (fx.track) { const p = fx.track(); if (p) fx.lookAt(p); }
        g.updatePlay(d, Object.assign({}, base, inp));
        inp = Object.assign({}, inp, { grenadePressed: false, grenade: false });
        if (g.state === 'play') g.state = 'paused';
      }
    },
    run(sec, inp = {}) { fx.step(sec, inp); },
    lookAt(p) {
      const P = g.player;
      const dx = p.x - P.pos.x, dz = p.z - P.pos.z;
      P.yaw = Math.atan2(-dx, -dz);
      P.pitch = Math.atan2(p.y - P.eyePos.y, Math.hypot(dx, dz));
    },
    fwd() { const P = g.player; return { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) }; },
    ahead(dist, side = 0) {
      const P = g.player, f = fx.fwd();
      return { x: P.pos.x + f.x * dist - f.z * side, z: P.pos.z + f.z * dist + f.x * side };
    },
    aimAhead(dist, h) { const p = fx.ahead(dist); fx.lookAt(new V(p.x, g.world.groundAt(p.x, p.z) + h, p.z)); g.player.updateEye(); },
    aimGround(dist) { const p = fx.ahead(dist); fx.lookAt(new V(p.x, g.world.groundAt(p.x, p.z), p.z)); },
    aimAtXYZ(x, y, z) { fx.lookAt(new V(x, y, z)); },
    aimAt(p, up = 0) { fx.lookAt(p); g.player.pitch += up; },
    chest(a) { return new V(a.pos.x, a.pos.y + 1.25 * a.T.scale, a.pos.z); },
    head(a) { return new V(a.pos.x, a.pos.y + 1.95 * a.T.scale, a.pos.z); },
    feet(a, dist) { const p = fx.ahead(dist); return new V(p.x, g.world.groundAt(p.x, p.z), p.z); },
    freeze(a) { a.tower = true; a.losT = 1e9; a.canSee = false; a.state = 'idle'; a.wanderT = 1e9; a.cooldown = 1e9; a.vel.set(0, 0, 0); a.vy = 0; },
    freezeAll() { for (const a of g.aliens.list) fx.freeze(a); },
    unfreezeAll() { for (const a of g.aliens.list) { a.tower = !!a.def.tower; a.losT = 0; a.cooldown = Math.random(); a.wanderT = 1; } },
    attack(a) { a.tower = true; a.losT = 0; a.state = 'combat'; a.stateT = 0; a.cooldown = 0.02; a.burstLeft = 0; },
    // an alien of this type from the current area, moved dist meters in front of you (side = meters to the right)
    subject(type, dist, side = 0) {
      const z = g.level.zone;
      let a = g.aliens.list.find((x) => x.typeId === type && x.zone === z && !x.dead && !x.dormant && !x.__used)
        || g.aliens.list.find((x) => x.zone === z && !x.dead && !x.dormant && !x.__used);
      a.__used = true;
      const p = fx.ahead(dist, side);
      a.pos.set(p.x, g.world.groundAt(p.x, p.z), p.z);
      a.home.copy(a.pos);
      a.root.visible = true;
      const P = g.player;
      a.yaw = Math.atan2(P.pos.x - a.pos.x, P.pos.z - a.pos.z);
      fx.freeze(a);
      a.updateTransform();
      return a;
    },
    trackNearest() {
      fx.track = () => {
        const P = g.player;
        let best = null, bd = 1e9;
        for (const a of g.aliens.list) {
          if (a.dead || a.dormant || !a.root.visible || a.zone !== g.level.zone) continue;
          const d = a.pos.distanceTo(P.pos);
          if (d < bd) { bd = d; best = a; }
        }
        return best ? fx.chest(best) : null;
      };
    },
    settle() { g.player.god = true; fx.freezeAll(); fx.step(0.5, {}); fx.freezeAll(); },
    mars(zone = 0) {
      g.newGame(); g.debug.skipIntro();
      if (zone === 4) { for (let k = 0; k < g.world.gates.length; k++) g.world.openGate(k, true); g.world.dropDome(true); g.player.spawn(32, -604, 0); }
      else g.player.spawn(14, -62, 0.1);
      fx.settle();
    },
    ship(cp) { g.debug.stage2(cp); fx.settle(); },
    boss() {
      g.debug.stage2(4); g.cine.skip(); g.player.spawn(4.4, -172.7, -0.315);
      g.player.god = true; fx.step(2.0, {}); g.player.god = true;
    },
  };
  return fx;
})();
`;

const SEED = `
(() => {
  let s = 1234567;
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__seed = (n) => { s = n | 0; };
})();
`;

const which = process.env.BROWSER || 'chrome';
const browser = which === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({ channel: which === 'chrome' ? 'chrome' : which === 'chromium' ? undefined : which, args: MUTE_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await mutePage(page);
await page.addInitScript(SEED);
if (process.env.HIDE_VM_FLASH) await page.addInitScript('window.__hideVmFlash = true;');
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });

// node combat-shots.mjs probe --eval "<js>": load the game with the fx helpers, run the JS, print what it returns
if (only[0] === '--eval') {
    await page.goto(BASE + '/stranded-on-mars/?debug&quality=high', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
    await page.evaluate(HELPERS);
    console.log(JSON.stringify(await page.evaluate(`window.__seed(4242); (async () => { ${only[1]} })()`), null, 1));
    await browser.close();
    process.exit(0);
}

// node combat-shots.mjs perf --perf: the heaviest fight (every Reactor Core wave at once, rapid fire, a grenade
// every 1.5 s), 600 steps of 1/60 s. Times the game update and the render (with gl.finish) separately.
if (only[0] === '--perf') {
    await page.goto(BASE + '/stranded-on-mars/?debug&quality=high', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
    await page.evaluate(HELPERS);
    const res = await page.evaluate(() => {
        window.__seed(777);
        const g = game;
        fx.ship(1);
        g.player.spawn(0, -40, 0);
        fx.step(0.5, {});
        g.aliens.startWave(1, 1); g.aliens.startWave(1, 2);
        fx.unfreezeAll();
        for (const a of g.aliens.byZone[1]) { a.hp *= 4; a.maxHp *= 4; }
        g.player.god = true;
        fx.trackNearest();
        fx.step(1.5, {});
        const gl = g.renderer.getContext();
        const rw = g.renderWorld.bind(g);
        const upd = [], ren = [];
        // time spent in the effects + combat code alone
        let fxMs = 0;
        const wrap = (o, k) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f(...a); fxMs += performance.now() - t; return r; }; };
        wrap(g.effects, 'update'); wrap(g.combat, 'update');
        // render cost of the particle batches: render the same frame with and without them every 30 frames
        let fxRender = 0, fxRenderN = 0;
        const batches = [g.effects.glow, g.effects.smoke, g.effects.far, g.effects.ground].filter(Boolean).map((b) => b.mesh);
        let maxGlow = 0, maxSmoke = 0, maxBolts = 0, calls = 0, maxCalls = 0;
        for (let i = 0; i < 600; i++) {
            const gren = i % 90 === 0;
            g.player.grenades = 4;
            g.renderWorld = () => {};
            const t0 = performance.now();
            fx.step(1 / 60, { fire: true, grenade: gren, grenadePressed: gren });
            const t1 = performance.now();
            g.renderWorld = rw;
            g.renderer.info.autoReset = false; g.renderer.info.reset();
            rw(true); gl.finish();
            const t2 = performance.now();
            g.renderer.info.autoReset = true;
            upd.push(t1 - t0); ren.push(t2 - t1);
            maxGlow = Math.max(maxGlow, g.effects.glow.count);
            maxSmoke = Math.max(maxSmoke, g.effects.smoke.count);
            maxBolts = Math.max(maxBolts, g.combat.bolts.length);
            calls += g.renderer.info.render.calls; maxCalls = Math.max(maxCalls, g.renderer.info.render.calls);
            if (i % 30 === 15) {
                const time = (n) => { gl.finish(); const t = performance.now(); for (let j = 0; j < n; j++) rw(true); gl.finish(); return (performance.now() - t) / n; };
                const vis = batches.map((m) => m.visible);
                const on = time(8);
                batches.forEach((m) => (m.visible = false));
                const off = time(8);
                batches.forEach((m, j) => (m.visible = vis[j]));
                fxRender += on - off; fxRenderN++;
            }
        }
        const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2) }; };
        return { updateMs: stat(upd), renderMs: stat(ren), fxUpdateMs: +(fxMs / 600).toFixed(3), fxRenderMs: +(fxRender / fxRenderN).toFixed(3), maxGlow, maxSmoke, maxBolts, avgCalls: Math.round(calls / 600), maxCalls,
            alive: g.aliens.byZone[1].filter((a) => !a.dead).length, programs: g.renderer.info.programs.length, tally: g.combat.tally };
    });
    console.log(JSON.stringify(res));
    await browser.close();
    process.exit(0);
}

for (const sc of SCENARIOS) {
    if (only.length && !only.includes(sc.name)) continue;
    if (process.env.SHEET_ONLY) continue;
    await page.goto(BASE + '/stranded-on-mars/?debug&quality=high', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
    await page.evaluate(HELPERS);
    await page.evaluate(`window.__seed(4242); ${sc.setup}; 0`);
    const files = [];
    let i = 0;
    for (const f of sc.frames) {
        const fr = typeof f === 'number' ? { dt: f } : f;
        const inp = fr.inp || sc.inp || {};
        if (fr.pre) await page.evaluate(fr.pre);
        await page.evaluate(([dt, inp]) => fx.step(dt, inp), [fr.dt, inp]);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const file = path.join(outDir, `${sc.name}_${String(i++).padStart(2, '0')}.png`);
        await page.screenshot({ path: file });
        files.push(file);
    }
    const info = await page.evaluate(() => ({ calls: game.renderer.info.render.calls, tally: game.combat.tally, hp: game.player.health, parts: game.effects.parts.length }));
    console.log(sc.name, JSON.stringify(info));
    execFileSync('node', [path.join(here, 'grid.mjs'), path.join(outDir, sc.name + '.png'), '5', ...files], { stdio: 'ignore' });
}
await browser.close();

// overview: one row per scenario (whatever frames are on disk for this label), small tiles
const rows = SCENARIOS.map((sc) => fs.readdirSync(outDir).filter((f) => new RegExp(`^${sc.name}_\\d+\\.png$`).test(f)).sort()
    .map((f) => path.join(outDir, f))).filter((r) => r.length);
const cols = Math.max(...rows.map((r) => r.length));
const padded = [];
for (const r of rows) for (let k = 0; k < cols; k++) padded.push(r[k] || '-');
execFileSync('node', [path.join(here, 'grid.mjs'), path.join(here, 'out', `combat-${label}.png`), String(cols), ...padded], {
    stdio: ['ignore', 'inherit', 'pipe'], env: { ...process.env, TILE: '320' },
});
