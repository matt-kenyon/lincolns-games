// Top-down map of Mars with the route drawn on it (not part of the game).
//   node map.mjs [out/mars-map.png]          (local server running; BASE_URL / BROWSER like run.mjs)
//   MAP_SCALE=4 MAP_BOX=-380,-740,-80,-380 node map.mjs out/plains-map.png   (zoom: pixels per 2 m, world x0,z0,x1,z1)
// Draws the minimap picture of the whole terrain, tints every walkable spot by the zone the game thinks it's in,
// and marks the path, force fields, checkpoints, ship parts, aliens and the set pieces. It also checks that the
// force fields really seal each area: it floods the walkable ground from the start with every field closed, then
// opens them one at a time, and prints which zones each flood reached (each step should add exactly one zone).
import { chromium, webkit } from 'playwright';
import { MUTE_ARGS, mutePage } from './mute.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, 'out', 'mars-map.png'));
fs.mkdirSync(path.dirname(out), { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const which = process.env.BROWSER || 'chromium';
const browser = which === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({ args: MUTE_ARGS, channel: which === 'chrome' ? 'chrome' : undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await mutePage(page);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(BASE + '/stranded-on-mars/?debug&quality=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });

const opts = { scale: +(process.env.MAP_SCALE || 2), box: process.env.MAP_BOX ? process.env.MAP_BOX.split(',').map(Number) : null };
const res = await page.evaluate(async ({ scale, box }) => {
    const L = await import('./js/layout.js');
    const g = window.game;
    const W = g.world, T = W.terrain;
    const map = W.mapImage();
    const S = scale; // pixels per grid cell (2 m)
    const c = document.createElement('canvas');
    c.width = T.W * S;
    c.height = T.H * S;
    const x = c.getContext('2d');
    x.drawImage(map.canvas, 0, 0, c.width, c.height);
    const px = (wx) => ((wx - T.x0) / T.cell) * S;
    const pz = (wz) => ((wz - T.z0) / T.cell) * S;
    const zoneCols = ['#ff4d4d', '#ffa53d', '#3dff8a', '#ffe14d', '#4dc3ff', '#d77aff', '#ffffff'];
    // zone tint on walkable cells
    const q = {};
    const zoneOf = new Int8Array(T.W * T.H).fill(-1);
    for (let j = 0; j < T.H; j++) {
        for (let i = 0; i < T.W; i++) {
            const k = j * T.W + i;
            if (T.sd[k] > 1) continue;
            const wx = T.x0 + i * T.cell, wz = T.z0 + j * T.cell;
            L.pathQuery(wx, wz, q);
            const z = L.zoneAtS(q.s);
            zoneOf[k] = z;
            x.fillStyle = zoneCols[z] + '30';
            x.fillRect(i * S, j * S, S, S);
        }
    }
    // a 50 m grid with labels
    x.strokeStyle = 'rgba(255,255,255,0.18)';
    x.lineWidth = 1;
    x.font = '9px sans-serif';
    x.fillStyle = 'rgba(255,255,255,0.6)';
    for (let gx = Math.ceil(T.x0 / 50) * 50; gx < T.x0 + T.W * T.cell; gx += 50) {
        x.beginPath(); x.moveTo(px(gx), 0); x.lineTo(px(gx), c.height); x.stroke();
        for (let gz = Math.ceil(T.z0 / 50) * 50; gz < T.z0 + T.H * T.cell; gz += 50) x.fillText(gx + ',' + gz, px(gx) + 2, pz(gz) - 2);
    }
    for (let gz = Math.ceil(T.z0 / 50) * 50; gz < T.z0 + T.H * T.cell; gz += 50) {
        x.beginPath(); x.moveTo(0, pz(gz)); x.lineTo(c.width, pz(gz)); x.stroke();
    }
    // flood fill the walkable cells with gates closed, then open them one by one
    const gateBlocked = new Uint8Array(T.W * T.H);
    const markGate = (gd, val) => {
        for (let k2 = 0; k2 < T.W * T.H; k2++) {
            const i = k2 % T.W, j = (k2 / T.W) | 0;
            const wx = T.x0 + i * T.cell, wz = T.z0 + j * T.cell;
            const dx = wx - gd.x, dz = wz - gd.z;
            const along = dx * gd.tx + dz * gd.tz, lat = dx * gd.nx + dz * gd.nz;
            if (Math.abs(along) < 1.6 && Math.abs(lat) <= gd.halfSpan) gateBlocked[k2] = val;
        }
    };
    const flood = () => {
        const seen = new Uint8Array(T.W * T.H);
        const i0 = Math.round((L.START.x - T.x0) / T.cell), j0 = Math.round((L.START.z - T.z0) / T.cell);
        const st = [j0 * T.W + i0];
        seen[st[0]] = 1;
        const zones = new Set();
        while (st.length) {
            const k2 = st.pop();
            zones.add(zoneOf[k2]);
            const i = k2 % T.W, j = (k2 / T.W) | 0;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const ii = i + di, jj = j + dj;
                if (ii < 0 || jj < 0 || ii >= T.W || jj >= T.H) continue;
                const n = jj * T.W + ii;
                if (seen[n] || zoneOf[n] < 0 || gateBlocked[n]) continue;
                seen[n] = 1;
                st.push(n);
            }
        }
        return [...zones].sort().join(',');
    };
    for (const gd of L.GATES) markGate(gd, 1);
    const floods = [flood()];
    for (const gd of L.GATES) { markGate(gd, 0); floods.push(flood()); }

    // path
    x.strokeStyle = 'rgba(255,255,255,0.5)';
    x.lineWidth = 1;
    x.beginPath();
    L.PATH.forEach((p, i) => (i ? x.lineTo(px(p[0]), pz(p[1])) : x.moveTo(px(p[0]), pz(p[1]))));
    x.stroke();
    x.font = '9px sans-serif';
    L.PATH.forEach((p, i) => {
        x.fillStyle = '#fff';
        x.fillText(String(i), px(p[0]) + 2, pz(p[1]) - 2);
    });
    // gates
    for (const gd of L.GATES) {
        x.strokeStyle = '#d77aff';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(px(gd.x - gd.nx * gd.halfSpan), pz(gd.z - gd.nz * gd.halfSpan));
        x.lineTo(px(gd.x + gd.nx * gd.halfSpan), pz(gd.z + gd.nz * gd.halfSpan));
        x.stroke();
    }
    const dot = (wx, wz, r, col, label) => {
        x.beginPath();
        x.arc(px(wx), pz(wz), r, 0, Math.PI * 2);
        x.fillStyle = col;
        x.fill();
        x.strokeStyle = '#000';
        x.lineWidth = 1;
        x.stroke();
        if (label) {
            x.font = 'bold 11px sans-serif';
            x.fillStyle = '#000';
            x.fillText(label, px(wx) + r + 2, pz(wz) + 4);
            x.fillStyle = '#fff';
            x.fillText(label, px(wx) + r + 1, pz(wz) + 3);
        }
    };
    L.ZONES.forEach((zn, zi) => zn.aliens.forEach((a) => dot(a.x, a.z, a.wave ? 2 : 2.5, zoneCols[zi], '')));
    L.CHECKPOINTS.forEach((cp, i) => dot(cp.x, cp.z, 4, '#00ffff', 'CP' + i));
    for (const [id, s] of Object.entries(L.PART_SPOTS)) dot(s.x, s.z, 4, '#ffd166', id);
    for (const [k, v] of Object.entries(L.MAP_MARKS || {})) dot(v.x, v.z, 3, '#ff66cc', k);
    if (L.PLAINS) {
        const P = L.PLAINS;
        P.rockRamps.forEach((r, i) => dot(r.x, r.z, 3, '#c0703a', 'R' + i));
        P.metalRamps.forEach((r, i) => dot(r.x, r.z, 3, '#9a5cff', 'M' + i));
        P.arches.forEach((r, i) => dot(r.x, r.z, 3, '#ffffff', 'A' + i));
        P.buttes.forEach((r, i) => dot(r.x, r.z, 3, '#663322', 'B' + i));
    }
    let outC = c;
    if (box) {
        outC = document.createElement('canvas');
        outC.width = Math.round(px(box[2]) - px(box[0]));
        outC.height = Math.round(pz(box[3]) - pz(box[1]));
        outC.getContext('2d').drawImage(c, -px(box[0]), -pz(box[1]));
    }
    return { url: outC.toDataURL('image/png'), floods, size: [outC.width, outC.height], cps: L.CHECKPOINTS.map((p) => [Math.round(p.x), Math.round(p.z)]) };
}, opts);
fs.writeFileSync(out, Buffer.from(res.url.split(',')[1], 'base64'));
console.log('wrote', path.relative(process.cwd(), out), res.size.join('x'));
console.log('flood fill (zones reachable with gates 0..k-1 open):');
res.floods.forEach((f, k) => console.log(`  ${k} open: ${f}`));
console.log('checkpoints', JSON.stringify(res.cps));
await browser.close();
