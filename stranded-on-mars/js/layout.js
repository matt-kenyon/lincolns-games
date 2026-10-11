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
    [-30, -232, 20, 4],    // 6  supply crate
    [-36, -272, 10, 5],    // 7  FORCE FIELD 2
    [-60, -322, 48, 5],    // 8  CRYSTAL FOREST (alien camp)
    [-60, -374, 34, 6],    // 9
    [-100, -404, 10, 7],   // 10 FORCE FIELD 3 (west, out of the forest)
    [-136, -428, 26, 7],   // 11
    [-190, -470, 78, 6],   // 12 THE GREAT DUST PLAINS
    [-252, -552, 104, 5],  // 13   (the launch ridge and the wing's mesa)
    [-232, -640, 84, 5],   // 14
    [-156, -624, 26, 6],   // 15
    [-108, -598, 10, 7],   // 16 FORCE FIELD 4 (opens when you have the wing)
    [-70, -566, 24, 6],    // 17
    [  4, -468, 46, 6],    // 18 FROZEN CRATER (ice lake)
    [ 22, -520, 34, 6],    // 19
    [ 30, -560, 10, 7],    // 20 FORCE FIELD 5
    [ 32, -615, 56, 3],    // 21 THE CRASH SITE
    [ 32, -700, 40, 3],    // 22 behind the ship
];

// Path vertices that have an alien force field across them
export const GATE_INDICES = [3, 7, 10, 16, 20];

// World bounds for the terrain mesh
export const WORLD = { x0: -420, x1: 260, z0: -880, z1: 220, cell: 2 };

export const START = { x: 0, z: 0, yaw: 0 };

export const SHIP = { x: 32, z: -655, yaw: Math.PI * 0.5 + 0.35, tiltX: -0.14, tiltZ: -0.12, sink: 0.7 };

// ------------------------------------------------------------
// The wing jump in the Great Dust Plains. The wing sits on top of a tall mesa that you can only reach by
// driving the rover up the launch ridge and off the alien kicker ramp at its end, over a gap. Retune the jump
// with these three numbers (everything else about the ridge and the mesa follows from them).
// Sized for the rover leaving the lip at 18-24 m/s (speed along the ramp), gravity 13 m/s^2 (PLAYER.gravity):
// with the lip 0.5 m below the mesa top, 18 m/s lands ~18 m past the lip, 24 m/s ~33 m, and 16 m/s or slower
// falls short of the 15 m gap. On foot the longest possible jump (sprint + jump at the lip) is ~13 m.
// ------------------------------------------------------------
export const RAMP_ANGLE = 25;   // degrees: the alien kicker ramp at the end of the launch ridge
export const MESA_GAP = 15;     // meters (level ground) from the ramp's lip to the mesa's near edge
export const MESA_HEIGHT = 17;  // meters: the mesa's flat top above the plains floor

export const JUMP = (() => {
    const lip = { x: -232, z: -555 };
    const dir = { x: -0.2425, z: -0.9701 };       // the way you jump (north-north-west)
    const side = { x: -dir.z, z: dir.x };          // +v: to your right when you jump (east)
    const base = 5;                                // the plains floor around the jump
    const lipH = MESA_HEIGHT - 0.5;                // lip height above the floor
    const kickH = 2.5;                             // the alien kicker ramp's rise
    const kickLen = kickH / Math.tan(RAMP_ANGLE * Math.PI / 180);
    const crestH = lipH - kickH;                   // the ridge's flat crest (the run-up)
    const crestLen = 34;
    const inclineLen = crestH / Math.tan(13 * Math.PI / 180);   // a gentle 13 degree climb from the floor
    const mesa = { u0: MESA_GAP, len: 48, halfW: 18 };          // u: meters past the lip, v: sideways
    // the gentle way down: a ledge path along the mesa's right side that ends in a ~6 m drop into the basin
    // around the mesa (too high to jump or climb back up, fine to drive or hop off)
    const down = { u0: 30, u1: 58, v0: 17, v1: 25, endH: 6 };
    const at = (u, v) => ({ x: lip.x + dir.x * u + side.x * v, z: lip.z + dir.z * u + side.z * v });
    return {
        lip, dir, side, base, lipH, kickH, kickLen, crestH, crestLen, inclineLen,
        ridgeHalfW: 7, inclineHalfW: 9, kickHalfW: 3.6, mesa, down, at,
        mesaCenter: at(mesa.u0 + mesa.len / 2, 0),
        start: at(-(kickLen + crestLen + inclineLen), 0),
        wing: at(mesa.u0 + 31, -3),
    };
})();

// Where the ship parts are. The power core is carried by the Alien Captain.
export const PART_SPOTS = {
    tailFin:  { x: 18,  z: -66,  zone: 0 },
    fuelTank: { x: -61.5, z: -336, zone: 2 },  // locked in a cage in the middle of the alien camp
    wing:     { x: JUMP.wing.x, z: JUMP.wing.z, zone: 3 },  // on top of the mesa
    thruster: { x: 6,   z: -474, zone: 4 },    // frozen under the ice lake
    powerCore:{ x: 32,  z: -626, zone: 5 },
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
    // the Great Dust Plains: big rims to jump the rover off
    { x: -168, z: -512, r: 11, depth: 1.6, rim: 1.7 },
    { x: -306, z: -500, r: 14, depth: 2.0, rim: 2.0 },
    { x: -190, z: -662, r: 10, depth: 1.4, rim: 1.6 },
    { x: -318, z: -628, r: 8, depth: 1.2, rim: 1.4 },
];

export const ICE_LAKE = { x: 4, z: -472, r: 23, level: 4.6 };
// The thruster is frozen under this slab of the lake. Three grenade blasts crack it open.
export const ICE_SLAB = { x: 6, z: -474, r: 3.6, depth: 2.2, hits: 3 };

export const REGIONS = {
    crystal: { x: -56, z: -350, r: 85 },
    frozen:  { x: 6,   z: -485, r: 75 },
    crash:   { x: 32,  z: -652, r: 34 },
    plains:  { x: -232, z: -560, r: 175 },
};

// ------------------------------------------------------------
// The Great Dust Plains: set pieces for driving (shaped into the terrain, with meshes on top)
// ------------------------------------------------------------
export const PLAINS = {
    // natural rock ramps: tilted slabs you can drive up and launch off. yaw = the way up (0 = -Z)
    rockRamps: [
        { x: -150, z: -560, yaw: 2.4, len: 16, halfW: 5, h: 3.2 },
        { x: -296, z: -560, yaw: -0.4, len: 18, halfW: 6, h: 3.6 },
        { x: -280, z: -672, yaw: 1.2, len: 14, halfW: 5, h: 2.8 },
    ],
    // alien-built metal ramps (the launch ridge's kicker is a third one)
    metalRamps: [
        { x: -206, z: -520, yaw: -2.2, len: 12, halfW: 4, h: 3.4 },
        { x: -170, z: -606, yaw: 0.9, len: 11, halfW: 4, h: 3 },
    ],
    // stone arches to drive through: center, yaw (the way through), radius
    arches: [
        { x: -150, z: -470, yaw: 0.6, r: 9 },
        { x: -322, z: -580, yaw: 0.1, r: 10 },
        { x: -208, z: -696, yaw: 1.6, r: 8 },
    ],
    // freestanding buttes (steep rock towers, not climbable)
    buttes: [
        { x: -292, z: -470, r: 10, h: 22 },
        { x: -300, z: -664, r: 9, h: 26 },
        { x: -156, z: -538, r: 7, h: 16 },
    ],
    // dust devils wander around these spots
    devils: [
        { x: -190, z: -560, r: 30 },
        { x: -290, z: -520, r: 25 },
        { x: -250, z: -680, r: 25 },
    ],
};

// Supply crates: open with E. kind 'reward' = a one-time stash (hearts + grenades),
// 'grenades' = refills your grenades whenever you're low
export const CRATES = [
    { x: 2, z: -208, yaw: 0.6, kind: 'reward' },       // Red Rock Canyon, behind the stone arch
    { x: -24, z: -480, yaw: 1.2, kind: 'grenades' },   // Frozen Crater, by the lake
];

// Your ship's rover: the aliens dragged it to the edge of their camp and flipped it over
export const ROVER_SPOT = { x: -80, z: -360, yaw: 2.2 };

// ------------------------------------------------------------
// Zones. Each has aliens that guard the way forward.
// Alien types: scout (fast, weak), trooper, major (tough), captain (boss)
// wave: 1 = waits inside a tent until the camp alarm goes off (the Crystal Forest raid)
// ------------------------------------------------------------
export const CAMP = { x: -60, z: -330 };
// tent doors (the four tents face the campfire): the raid aliens rush out of these
const tentDoor = (i, type) => {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    const x = CAMP.x + Math.cos(a) * 9.2, z = CAMP.z + Math.sin(a) * 9.2;
    return { type, x, z, wave: 1, yaw: Math.atan2(CAMP.x - x, CAMP.z - z) };
};

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
            tentDoor(0, 'trooper'),
            tentDoor(1, 'scout'),
            tentDoor(2, 'trooper'),
            tentDoor(3, 'scout'),
        ],
    },
    {
        name: 'GREAT DUST PLAINS',
        aliens: [
            { type: 'scout',   x: -196, z: -500 },
            { type: 'trooper', x: -214, z: -530 },
            { type: 'trooper', x: -268, z: -610 },
            { type: 'scout',   x: -176, z: -598 },
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

// Zone numbers the level logic needs by name
export const ZONE = { landing: 0, canyon: 1, crystal: 2, plains: 3, frozen: 4, crash: 5 };

export const TOWER = { x: -26, z: -497, height: 7.5 };
export const ARCH = { x: -6, z: -190 };

// Spots the dev map (dev/map.mjs) marks
export const MAP_MARKS = {
    lip: JUMP.lip, ridge: JUMP.start, mesa: JUMP.mesaCenter, rover: ROVER_SPOT, slab: ICE_SLAB,
    crate0: CRATES[0], crate1: CRATES[1],
};

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
