// ============================================================
// LEVEL LAYOUT — the route from the landing site to the crashed ship.
// Everything about *where* things are lives here so it's easy to tweak.
// Units are meters. -Z is "north" (the way to the ship).
// ============================================================

import { segmentT, lerp, clamp } from './util.js';

// The canyon path the player follows: [x, z, halfWidth, floorHeight]
export const PATH = [
    [  0,   70, 34, 0],    // 0  behind the landing site
    [  0,    0, 42, 0],    // 1  LANDING SITE (start)
    [ 14,  -62, 38, 0.5],  // 2  tail fin crater
    [ 28, -112, 10, 1.5],  // 3  FORCE FIELD 1
    [ 22, -150, 18, 2],    // 4
    [ -6, -190, 21, 3],    // 5  RED ROCK CANYON (stone arch)
    [-30, -232, 20, 4],    // 6  wing
    [-36, -272, 10, 5],    // 7  FORCE FIELD 2
    [-60, -322, 48, 5],    // 8  CRYSTAL FOREST (alien camp)
    [-52, -380, 40, 6],    // 9
    [-28, -424, 10, 7],    // 10 FORCE FIELD 3
    [  4, -468, 46, 6],    // 11 FROZEN CRATER (ice lake)
    [ 22, -520, 34, 6],    // 12
    [ 30, -560, 10, 7],    // 13 FORCE FIELD 4
    [ 32, -615, 56, 3],    // 14 THE CRASH SITE
    [ 32, -700, 40, 3],    // 15 behind the ship
];

// Path vertices that have an alien force field across them
export const GATE_INDICES = [3, 7, 10, 13];

// World bounds for the terrain mesh
export const WORLD = { x0: -260, x1: 260, z0: -880, z1: 220, cell: 2 };

export const START = { x: 0, z: 0, yaw: 0 };

export const SHIP = { x: 32, z: -655, yaw: Math.PI * 0.5 + 0.35, tiltX: -0.14, tiltZ: -0.12, sink: 0.7 };

// Where the ship parts landed. The power core is carried by the Alien Captain.
export const PART_SPOTS = {
    tailFin:  { x: 18,  z: -66,  zone: 0 },
    wing:     { x: -27, z: -240, zone: 1 },
    fuelTank: { x: -63, z: -339, zone: 2 },
    thruster: { x: 6,   z: -474, zone: 3 },
    powerCore:{ x: 32,  z: -626, zone: 4 },
};

export const PART_ORDER = ['tailFin', 'wing', 'fuelTank', 'thruster', 'powerCore'];

// Terrain features
export const CRATERS = [
    // x, z, radius, depth, rim
    { x: 18, z: -66, r: 10, depth: 0.8, rim: 0.45 },
    { x: -14, z: 22, r: 6, depth: 0.9, rim: 0.6 },
    { x: 24, z: 8, r: 4, depth: 0.6, rim: 0.4 },
    { x: -22, z: -34, r: 5, depth: 0.7, rim: 0.5 },
    { x: -70, z: -300, r: 5, depth: 0.6, rim: 0.4 },
    { x: 46, z: -600, r: 6, depth: 0.8, rim: 0.6 },
    { x: 32, z: -652, r: 30, depth: 2.6, rim: 2.2 },
];

export const ICE_LAKE = { x: 4, z: -472, r: 23, level: 4.6 };

export const REGIONS = {
    crystal: { x: -56, z: -350, r: 85 },
    frozen:  { x: 6,   z: -485, r: 75 },
    crash:   { x: 32,  z: -652, r: 34 },
};

// ------------------------------------------------------------
// Zones. Each has aliens that guard the way forward.
// Alien types: scout (fast, weak), trooper, major (tough), captain (boss)
// ------------------------------------------------------------
export const ZONES = [
    {
        name: 'LANDING SITE',
        aliens: [
            { type: 'scout',   x: 4,   z: -86 },
            { type: 'scout',   x: 33,  z: -80 },
            { type: 'trooper', x: 24,  z: -100 },
        ],
    },
    {
        name: 'RED ROCK CANYON',
        aliens: [
            { type: 'trooper', x: 19,  z: -163 },
            { type: 'scout',   x: 2,   z: -184 },
            { type: 'trooper', x: -12, z: -204 },
            { type: 'scout',   x: -22, z: -226 },
            { type: 'trooper', x: -36, z: -256 },
        ],
    },
    {
        name: 'CRYSTAL FOREST',
        aliens: [
            { type: 'trooper', x: -46, z: -310 },
            { type: 'trooper', x: -76, z: -318 },
            { type: 'scout',   x: -84, z: -342 },
            { type: 'major',   x: -58, z: -352 },
            { type: 'trooper', x: -40, z: -366 },
            { type: 'scout',   x: -60, z: -398 },
        ],
    },
    {
        name: 'FROZEN CRATER',
        aliens: [
            { type: 'scout',   x: -14, z: -452 },
            { type: 'trooper', x: 24,  z: -452 },
            { type: 'scout',   x: -26, z: -497, tower: true },
            { type: 'major',   x: -12, z: -486 },
            { type: 'trooper', x: 28,  z: -486 },
            { type: 'major',   x: 16,  z: -516 },
            { type: 'trooper', x: 30,  z: -540 },
        ],
    },
    {
        name: 'THE CRASH SITE',
        aliens: [
            { type: 'trooper', x: 12,  z: -600 },
            { type: 'trooper', x: 52,  z: -603 },
            { type: 'major',   x: 10,  z: -638 },
            { type: 'major',   x: 56,  z: -640 },
            { type: 'scout',   x: 18,  z: -676 },
            { type: 'scout',   x: 48,  z: -680 },
            { type: 'captain', x: 32,  z: -626 },
        ],
    },
];

export const TOWER = { x: -26, z: -497, height: 7.5 };
export const ARCH = { x: -6, z: -190 };
export const CAMP = { x: -60, z: -330 };

// ============================================================
// PATH MATH
// ============================================================
const segLen = [];
export const pathS = [0]; // arc length at each vertex
for (let i = 0; i < PATH.length - 1; i++) {
    const dx = PATH[i + 1][0] - PATH[i][0];
    const dz = PATH[i + 1][1] - PATH[i][1];
    const l = Math.sqrt(dx * dx + dz * dz);
    segLen.push(l);
    pathS.push(pathS[i] + l);
}
export const PATH_LENGTH = pathS[pathS.length - 1];
export const GATE_S = GATE_INDICES.map(i => pathS[i]);

// Query the corridor at (x, z).
// sd = signed distance to the corridor edge (negative = inside the canyon floor)
const _q = { sd: 0, d: 0, hw: 0, floor: 0, s: 0, seg: 0, t: 0, tx: 0, tz: -1, cx: 0, cz: 0 };
export function pathQuery(x, z, out = _q) {
    let best = Infinity, bestI = 0, bestT = 0, bestD = 0, bestHw = 0;
    // soft blend of floor heights to avoid creases at bends
    let wSum = 0, fSum = 0;
    const sds = pathQuery._sds || (pathQuery._sds = new Float32Array(PATH.length));
    const fls = pathQuery._fls || (pathQuery._fls = new Float32Array(PATH.length));
    for (let i = 0; i < PATH.length - 1; i++) {
        const a = PATH[i], b = PATH[i + 1];
        const t = segmentT(x, z, a[0], a[1], b[0], b[1]);
        const cx = a[0] + (b[0] - a[0]) * t;
        const cz = a[1] + (b[1] - a[1]) * t;
        const dx = x - cx, dz = z - cz;
        const d = Math.sqrt(dx * dx + dz * dz);
        const hw = lerp(a[2], b[2], t);
        const sd = d - hw;
        sds[i] = sd;
        fls[i] = lerp(a[3], b[3], t);
        if (sd < best) {
            best = sd; bestI = i; bestT = t; bestD = d; bestHw = hw;
        }
    }
    for (let i = 0; i < PATH.length - 1; i++) {
        const w = Math.exp(-(sds[i] - best) / 3);
        wSum += w;
        fSum += fls[i] * w;
    }
    const a = PATH[bestI], b = PATH[bestI + 1];
    const len = segLen[bestI] || 1;
    out.sd = best;
    out.d = bestD;
    out.hw = bestHw;
    out.floor = fSum / wSum;
    out.seg = bestI;
    out.t = bestT;
    out.s = pathS[bestI] + bestT * len;
    out.tx = (b[0] - a[0]) / len;
    out.tz = (b[1] - a[1]) / len;
    out.cx = a[0] + (b[0] - a[0]) * bestT;
    out.cz = a[1] + (b[1] - a[1]) * bestT;
    return out;
}

// Point on the path at arc length s
export function pathPointAt(s, out = { x: 0, z: 0, tx: 0, tz: -1, hw: 0, floor: 0 }) {
    s = clamp(s, 0, PATH_LENGTH);
    let i = 0;
    while (i < segLen.length - 1 && pathS[i + 1] < s) i++;
    const t = segLen[i] > 0 ? (s - pathS[i]) / segLen[i] : 0;
    const a = PATH[i], b = PATH[i + 1];
    out.x = lerp(a[0], b[0], t);
    out.z = lerp(a[1], b[1], t);
    out.tx = (b[0] - a[0]) / segLen[i];
    out.tz = (b[1] - a[1]) / segLen[i];
    out.hw = lerp(a[2], b[2], t);
    out.floor = lerp(a[3], b[3], t);
    return out;
}

// Yaw (camera convention: 0 looks toward -Z) for a direction
export const yawFromDir = (dx, dz) => Math.atan2(-dx, -dz);

// Gate geometry: center, tangent (direction of travel), and half-span
export const GATES = GATE_INDICES.map((idx, k) => {
    const p = PATH[idx], prev = PATH[idx - 1], next = PATH[idx + 1];
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const l = Math.sqrt(tx * tx + tz * tz);
    tx /= l; tz /= l;
    return { k, x: p[0], z: p[1], tx, tz, nx: -tz, nz: tx, halfSpan: p[2] + 9, s: pathS[idx] };
});

// Respawn checkpoints: index 0 is the start, k+1 is just past gate k
export const CHECKPOINTS = [
    { x: START.x, z: START.z, yaw: START.yaw },
    ...GATE_S.map(s => {
        const p = pathPointAt(s + 12);
        return { x: p.x, z: p.z, yaw: yawFromDir(p.tx, p.tz) };
    }),
];

// Which zone (0..4) an arc-length position belongs to
export function zoneAtS(s) {
    let z = 0;
    for (let k = 0; k < GATE_S.length; k++) if (s > GATE_S[k]) z = k + 1;
    return z;
}
