// Real-time frame timing through every cutscene (not part of the game).
//   BROWSER=chrome|webkit node cutscene-fps.mjs [intro] [outro] [boss] [finale]   (default: all four)
// Each cutscene plays in real time from its start in a freshly launched browser (so no shader is cached
// from an earlier run), in a MacBook-sized window at 2x with the game's normal adaptive quality.
// Every frame's length comes from requestAnimationFrame timestamps, tagged with the shot and the time
// into the shot. For each shot it prints the frame rate, the frames slower than SPIKE ms (default 25),
// the worst frame, the number of compiled shader programs before and after (a jump means a shader was
// compiled mid-shot) and the resolution scale (a change means adaptQuality resized the canvas).
// It also checks the camera's motion (without the shake) for jumps: a frame that moves the camera much
// further than the frames around it, and the jump at each shot change (a cut is fine, a continuous
// camera move that jumps is not).
// Options: SPIKE=25, RUNS=1 (repeat each cutscene), BASE_URL. Raw frames go to out/cutscene-<browser>-<name>.json.
import { chromium, webkit } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const which = process.env.BROWSER || 'chrome';
const SPIKE = +(process.env.SPIKE || 25);
const RUNS = +(process.env.RUNS || 1);

const SHOTS = {
    intro: ['to the Moon', 'energy overload', 'reroute to Mars', 'falling apart', 'EJECT on Mars', 'crash far away', 'aliens take ship', 'parachute+title'],
    outro: ['engines on', 'liftoff', 'fly to the Moon', 'grrr + lurch', 'whip: mothership', 'tractor pull', 'cockpit', 'hangar KA-BOOM', 'LEVEL 2 card'],
    boss: ['rumble', 'tentacles burst', 'creature rises', 'eye opens', 'ROAR + card'],
    finale: ['into the pod', 'BLAST OFF', 'mothership boom', 'to the Moon', 'Moon landing', 'THE END'],
};

// How each cutscene is reached. `prep` runs first (then `warm` ms of normal play), `start` begins the
// cutscene and recording stops once `done` is true. Every prep starts the sound first, like a real
// player's first click or key press on the title screen does (in Chrome that alone takes ~0.35s).
const CUTSCENES = {
    intro: { prep: 'game.audio.init();', warm: 500, start: 'game.newGame()', done: "game.state === 'play'" },
    outro: { prep: 'game.audio.init();', warm: 500, start: 'game.startChapter(2)', done: "game.state === 'play' && game.stage.key === 'ship'" },
    boss: {
        prep: "game.audio.init(); localStorage.clear(); game.debug.stage2(3); document.getElementById('click-resume').classList.add('hidden'); game.player.god = true;",
        warm: 3000,
        start: 'game.player.spawn(3.11 + 0.309 * -2, -168.83 - 0.951 * -2, -0.315); game.debug.simulate(1.2, {moveY: 1});',
        done: "game.state === 'play'",
    },
    finale: {
        prep: "game.audio.init(); localStorage.clear(); game.debug.stage2(5); document.getElementById('click-resume').classList.add('hidden'); game.player.god = true;",
        warm: 3000,
        start: 'game.player.spawn(9.6, -244.6, 0); game.debug.simulate(0.3, {}); game.debug.simulate(0.1, {interact: true});',
        done: "game.state === 'end'",
    },
};

// Runs in the page: record every frame. The game's own rAF callback runs first in each frame, so this
// sees the state it just drew. lookFrom() is wrapped to get the camera pose before the shake is added.
function installRecorder() {
    const g = window.game, c = g.cine;
    const frames = [];
    let pose = null, last = null, on = true;
    const orig = c.lookFrom;
    c.lookFrom = function (pos, target) {
        const r = orig.call(this, pos, target);
        // the pose actually used (after any blend from the previous shot), before the shake
        const p = c.lastPos || pos, q = c.lastLook || target;
        pose = [p.x, p.y, p.z, q.x, q.y, q.z];
        return r;
    };
    const f = (now) => {
        if (!on) return;
        const work = performance.now() - now;
        if (last !== null) {
            const inCine = !!c.shots && !c.done && (g.state === 'intro' || g.state === 'outro' || g.state === 'cine');
            frames.push({
                ms: +(now - last).toFixed(2), work: +work.toFixed(1), st: g.state, i: inCine ? c.idx : -1,
                t: inCine ? +c.t.toFixed(3) : 0, prog: g.renderer.info.programs.length, pr: +g.pixelRatio.toFixed(2),
                fov: c.camera.fov, pose,
            });
        }
        pose = null;
        last = now;
        requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    window.__rec = { frames, stop() { on = false; c.lookFrom = orig; } };
}

async function record(name) {
    const cs = CUTSCENES[name];
    const browser = which === 'webkit'
        ? await webkit.launch()
        : await chromium.launch({ channel: which === 'chrome' ? 'chrome' : undefined, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 });
    // Mute the game (Matt can hear tests through his speakers): route all WebAudio into a silent gain node, no speech.
    await page.addInitScript(() => { const P = (window.BaseAudioContext || window.AudioContext || window.webkitAudioContext).prototype; const d = Object.getOwnPropertyDescriptor(P, 'destination'); if (d && d.get) Object.defineProperty(P, 'destination', { configurable: true, get() { if (!this.__mute) { this.__mute = this.createGain(); this.__mute.gain.value = 0; this.__mute.connect(d.get.call(this)); } return this.__mute; } }); if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + '/stranded-on-mars/?debug', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
    await page.waitForTimeout(1500); // let the title screen settle
    if (cs.prep) await page.evaluate(cs.prep);
    if (cs.warm) await page.waitForTimeout(cs.warm);
    await page.evaluate(installRecorder);
    await page.evaluate(cs.start);
    await page.waitForFunction(cs.done, null, { timeout: 180000, polling: 200 });
    await page.waitForTimeout(800);
    const frames = await page.evaluate(() => { window.__rec.stop(); return window.__rec.frames; });
    await browser.close();
    return { frames, errors };
}

const fmt = (n, w) => String(n).padStart(w);
const median = (a) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
};

function analyse(name, frames) {
    const labels = SHOTS[name];
    const lines = [];
    const cine = frames.filter((f) => f.i >= 0);
    const total = cine.reduce((a, f) => a + f.ms, 0);
    const spikes = cine.filter((f) => f.ms > SPIKE);
    const worst = cine.reduce((a, f) => (f.ms > a.ms ? f : a), { ms: 0 });
    const lost = cine.reduce((a, f) => a + Math.max(0, f.ms - 50), 0);
    lines.push(`${which} ${name}: ${(total / 1000).toFixed(1)}s, ${cine.length} frames, ${(cine.length / (total / 1000)).toFixed(1)} fps, `
        + `${spikes.length} frames > ${SPIKE}ms, worst ${worst.ms.toFixed(0)}ms (shot ${worst.i + 1} at ${worst.t}s), `
        + `${lost.toFixed(0)}ms of animation time lost to the 50ms dt cap`);
    lines.push('  shot                 frames   fps  >' + SPIKE + 'ms  worst(ms @ shot time)   programs        res');
    const groups = new Map();
    let pre = null;
    for (let k = 0; k < frames.length; k++) {
        const f = frames[k];
        const key = f.i >= 0 ? f.i : pre === null ? 'pre' : 'post';
        if (f.i >= 0) pre = 1;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(f);
    }
    for (const [key, fs_] of groups) {
        const ms = fs_.reduce((a, f) => a + f.ms, 0);
        const w = fs_.reduce((a, f) => (f.ms > a.ms ? f : a), { ms: 0 });
        const sp = fs_.filter((f) => f.ms > SPIKE).length;
        const label = typeof key === 'number' ? `${key + 1} ${labels[key] || ''}` : key;
        const p0 = fs_[0].prog, p1 = fs_[fs_.length - 1].prog;
        const res = [...new Set(fs_.map((f) => f.pr))].join('>');
        lines.push(`  ${label.padEnd(20)} ${fmt(fs_.length, 6)} ${fmt((fs_.length / (ms / 1000)).toFixed(0), 5)} ${fmt(sp, 5)}`
            + `   ${fmt(w.ms.toFixed(0), 5)} @ ${String(w.t).padEnd(7)}      ${fmt(p0, 3)} > ${fmt(p1, 3)}${p1 > p0 ? ` (+${p1 - p0})` : '     '}   ${res}`);
    }
    // every slow frame, with what was happening
    if (spikes.length) {
        lines.push('  slow frames: ' + frames.map((f, k) => ({ f, k })).filter(({ f }) => f.ms > SPIKE).map(({ f, k }) => {
            const prev = frames[k - 1];
            const comp = prev && f.prog > prev.prog ? ` +${f.prog - prev.prog}prog` : '';
            const res = prev && f.pr !== prev.pr ? ` res ${prev.pr}>${f.pr}` : '';
            const where = f.i >= 0 ? `s${f.i + 1}@${f.t}` : f.st;
            return `${where} ${f.ms.toFixed(0)}ms(work ${f.work})${comp}${res}`;
        }).join(', '));
    }
    // camera motion: jumps relative to the neighbouring frames
    const pops = [];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const dir = (p) => {
        const d = [p[3] - p[0], p[4] - p[1], p[5] - p[2]];
        const l = Math.hypot(...d) || 1;
        return d.map((v) => v / l);
    };
    const ang = (a, b) => {
        const da = dir(a), db = dir(b);
        return (Math.acos(Math.min(1, Math.max(-1, da[0] * db[0] + da[1] * db[1] + da[2] * db[2]))) * 180) / Math.PI;
    };
    const step = frames.map((f, k) => {
        const p = frames[k - 1];
        if (!f.pose || !p || !p.pose || f.i < 0 || p.i < 0) return null;
        return { d: dist(f.pose, p.pose), a: ang(f.pose, p.pose), boundary: f.i !== p.i, fov: f.fov !== p.fov };
    });
    for (let k = 0; k < frames.length; k++) {
        const s = step[k];
        if (!s) continue;
        const f = frames[k];
        const near = [];
        for (let j = k - 8; j <= k + 8; j++) if (j !== k && step[j] && !step[j].boundary && frames[j].i === (s.boundary ? frames[k - 1].i : f.i)) near.push(step[j]);
        const md = median(near.map((x) => x.d)), ma = median(near.map((x) => x.a));
        const rd = s.d / Math.max(md, 1e-4), ra = s.a / Math.max(ma, 1e-3);
        if (s.boundary) {
            pops.push(`  shot ${f.i}>${f.i + 1}: camera jumps ${s.d.toFixed(2)} (${rd.toFixed(1)}x a normal frame), turns ${s.a.toFixed(1)}deg (${ra.toFixed(1)}x)${s.fov ? `, fov ${frames[k - 1].fov}>${f.fov}` : ''}`);
        } else if ((rd > 3.5 && s.d > 0.05) || (ra > 3.5 && s.a > 0.6)) {
            pops.push(`  shot ${f.i + 1} @${f.t}s: camera jumps ${s.d.toFixed(2)} (${rd.toFixed(1)}x), turns ${s.a.toFixed(1)}deg (${ra.toFixed(1)}x), frame ${f.ms.toFixed(0)}ms`);
        }
    }
    if (pops.length) lines.push('  camera jumps (cuts between shots are expected; a jump inside a shot or in a continuous move is a stutter):', ...pops);
    return lines.join('\n');
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CUTSCENES);
console.log(`${which}: 1512x945 at 2x, adaptive quality, real time`);
for (const name of names) {
    for (let r = 0; r < RUNS; r++) {
        const { frames, errors } = await record(name);
        fs.writeFileSync(path.join(outDir, `cutscene-${which}-${name}${RUNS > 1 ? '-' + (r + 1) : ''}.json`), JSON.stringify(frames));
        console.log(analyse(name, frames));
        if (errors.length) console.log('  page errors:', errors.join(' | '));
        console.log('');
    }
}
