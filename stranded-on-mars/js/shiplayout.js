// ============================================================
// MOTHERSHIP LAYOUT — level 2, inside the alien mothership.
// Everything about *where* things are lives here so it's easy to tweak.
// Units are meters. The floor is at y = 0. -Z is "forward" (toward the escape pod).
// ============================================================

import { segmentT } from './util.js';

// Rooms are rounded rectangles ('rect') or circles ('circle'). h = ceiling height.
export const ROOMS = [
    { id: 0, name: 'HANGAR BAY',       shape: 'rect',   x: 0,   z: 0,    hx: 24, hz: 19, r: 3, h: 15 },
    { id: 1, name: 'REACTOR CORE',     shape: 'circle', x: 0,   z: -54,  r: 18, h: 16 },
    { id: 2, name: 'SPECIMEN LAB',     shape: 'rect',   x: -40, z: -100, hx: 15, hz: 12, r: 4, h: 9 },
    { id: 3, name: 'COMMAND BRIDGE',   shape: 'circle', x: -40, z: -150, r: 17, h: 11 },
    { id: 4, name: 'THE CREATURE PIT', shape: 'circle', x: 12,  z: -196, r: 28, h: 20 },
    { id: 5, name: 'ESCAPE POD BAY',   shape: 'rect',   x: 12,  z: -246, hx: 9, hz: 10, r: 2, h: 8 },
];

// Hallways between rooms: a straight piece from (ax, az) to (bx, bz), hw = half width.
// `zone` = the room a hallway belongs to (the one you're leaving).
export const HALLS = [
    { zone: 0, ax: 0,   az: -19,    bx: 0,   bz: -36,    hw: 3.4, h: 5.5 },
    { zone: 1, ax: -18, az: -54,    bx: -40, bz: -54,    hw: 3.4, h: 5.5 },
    { zone: 1, ax: -40, az: -54,    bx: -40, bz: -88,    hw: 3.4, h: 5.53 },
    { zone: 2, ax: -40, az: -112,   bx: -40, bz: -133,   hw: 3.4, h: 5.5 },
    { zone: 3, ax: -23, az: -150,   bx: -3,  bz: -150,   hw: 3.4, h: 5.5 },
    { zone: 3, ax: -3,  az: -150,   bx: 3.3, bz: -169.4, hw: 3.4, h: 5.53 },
    { zone: 4, ax: 12,  az: -224,   bx: 12,  bz: -236,   hw: 3.2, h: 5.5 },
];

// Holes in the floor you can't walk into (a railing goes around them)
export const HOLES = [
    // the reactor's glowing shaft, with the reactor column in the middle
    { zone: 1, x: 0,  z: -54,  r: 6,   floor: -10, rail: 1.1, solidR: 3.2 },
    // the creature's pit (the boss lives down there!)
    { zone: 4, x: 12, z: -196, r: 8.5, floor: -12, rail: 1.0, solidR: 0 },
];

// Force-field doors. Each one opens when its room's aliens are all beaten
// (the creature pit's doors are controlled by the boss fight instead).
// (x, z) = middle of the doorway, (tx, tz) = the way through it.
export const DOORS = [
    { zone: 0, x: 0,     z: -19.6,  tx: 0,     tz: -1,     hw: 3.4, h: 5.5 },
    { zone: 1, x: -18.6, z: -54,    tx: -1,    tz: 0,      hw: 3.4, h: 5.5 },
    { zone: 2, x: -40,   z: -112.6, tx: 0,     tz: -1,     hw: 3.4, h: 5.5 },
    { zone: 3, x: -22.4, z: -150,   tx: 1,     tz: 0,      hw: 3.4, h: 5.5 },
    // creature pit entrance: open until the boss wakes up, then it slams shut behind you
    { zone: 4, x: 3.11,  z: -168.83, tx: 0.309, tz: -0.951, hw: 3.4, h: 5.5, bossIn: true },
    // creature pit exit to the escape pods
    { zone: 4, x: 12,    z: -224.6, tx: 0,     tz: -1,     hw: 3.2, h: 5.5, bossOut: true },
];

// The hangar is open to space on its south side (an air shield keeps the air in)
export const HANGAR_OPENING = { x0: -18, x1: 18, z: 19, top: 12 };

// The bridge's big window looks out at the Moon (angles around the room's center, radians)
export const BRIDGE_WINDOW = { a0: 1.9, a1: 3.55, sill: 1.2, top: 8.6 };

export const BOSS = { x: 12, z: -196 };
export const POD = { x: 8.5, z: -248.5, yaw: 0 };
// Where you land after jumping out of your ship (and where the wreck burns)
export const WRECK = { x: 3, z: 9 };

// Respawn checkpoints, one at the way into each area
export const CHECKPOINTS = [
    { x: -3,  z: 5,    yaw: 0 },        // 0 hangar bay
    { x: 0,   z: -31,  yaw: 0 },        // 1 hall into the reactor
    { x: -40, z: -80,  yaw: 0 },        // 2 hall into the lab
    { x: -40, z: -127, yaw: 0 },        // 3 hall into the bridge
    { x: 4.4, z: -172.7, yaw: -0.315 }, // 4 just inside the creature pit
    { x: 12,  z: -229, yaw: 0 },        // 5 hall into the pod bay
];

// ------------------------------------------------------------
// Areas and their alien waves. wave 0 is waiting in the room;
// waves 1, 2... teleport in (on glowing pads) when the one before is beaten.
// yaw 0 = looking toward +Z (where the player comes from).
// ------------------------------------------------------------
export const ZONES = [
    {
        name: 'HANGAR BAY',
        aliens: [
            { type: 'scout',   x: -13, z: -5 },
            { type: 'trooper', x: 12,  z: -7 },
            { type: 'scout',   x: 3,   z: -13 },
            { type: 'trooper', x: -12, z: -13, wave: 1 },
            { type: 'trooper', x: 13,  z: -14, wave: 1 },
            { type: 'scout',   x: 0,   z: -9,  wave: 1 },
        ],
    },
    {
        name: 'REACTOR CORE',
        aliens: [
            { type: 'trooper', x: -9,  z: -46 },
            { type: 'scout',   x: 10,  z: -47 },
            { type: 'trooper', x: 11,  z: -62 },
            { type: 'scout',   x: -12, z: -64 },
            { type: 'major',   x: 0,   z: -66, wave: 1 },
            { type: 'scout',   x: -13, z: -50, wave: 1 },
            { type: 'scout',   x: 13,  z: -52, wave: 1 },
            { type: 'trooper', x: -9,  z: -66, wave: 2 },
            { type: 'trooper', x: 9,   z: -67, wave: 2 },
            { type: 'major',   x: 14,  z: -58, wave: 2 },
        ],
    },
    {
        name: 'SPECIMEN LAB',
        aliens: [
            { type: 'trooper', x: -48, z: -96 },
            { type: 'scout',   x: -31, z: -98 },
            { type: 'trooper', x: -36, z: -106 },
            { type: 'scout',   x: -50, z: -106 },
            { type: 'major',   x: -40, z: -107, wave: 1 },
            { type: 'trooper', x: -50, z: -100, wave: 1 },
            { type: 'trooper', x: -30, z: -101, wave: 1 },
            { type: 'scout',   x: -44, z: -94,  wave: 1 },
        ],
    },
    {
        name: 'COMMAND BRIDGE',
        aliens: [
            { type: 'trooper', x: -48, z: -143 },
            { type: 'major',   x: -40, z: -155 },
            { type: 'scout',   x: -31, z: -147 },
            { type: 'trooper', x: -34, z: -158 },
            { type: 'scout',   x: -50, z: -152, wave: 1 },
            { type: 'scout',   x: -30, z: -153, wave: 1 },
            { type: 'major',   x: -45, z: -160, wave: 1 },
            { type: 'trooper', x: -47, z: -148, wave: 2 },
            { type: 'trooper', x: -33, z: -148, wave: 2 },
            { type: 'major',   x: -40, z: -161, wave: 2 },
        ],
    },
    {
        name: 'THE CREATURE PIT',
        // the creature calls these in when it gets mad (waves 1 and 2)
        aliens: [
            { type: 'scout',   x: 27,  z: -186, wave: 1 },
            { type: 'scout',   x: 2,   z: -210, wave: 1 },
            { type: 'trooper', x: 22,  z: -211, wave: 2 },
            { type: 'scout',   x: -3,  z: -186, wave: 2 },
            { type: 'trooper', x: 12,  z: -215, wave: 2 },
        ],
    },
    { name: 'ESCAPE POD BAY', aliens: [] },
];

// ============================================================
// SHAPE MATH (signed distances: negative = inside)
// ============================================================
function sdRect(px, pz, s) {
    const qx = Math.abs(px - s.x) - (s.hx - s.r);
    const qz = Math.abs(pz - s.z) - (s.hz - s.r);
    const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0) - s.r;
}

function sdCircle(px, pz, s) {
    const dx = px - s.x, dz = pz - s.z;
    return Math.sqrt(dx * dx + dz * dz) - s.r;
}

function sdHall(px, pz, s) {
    const t = segmentT(px, pz, s.ax, s.az, s.bx, s.bz);
    const dx = px - (s.ax + (s.bx - s.ax) * t), dz = pz - (s.az + (s.bz - s.az) * t);
    return Math.sqrt(dx * dx + dz * dz) - s.hw;
}

// Every walkable shape (rooms + halls) with its own distance function
export const SHAPES = [
    ...ROOMS.map((r) => ({ ...r, kind: r.shape, zone: r.id, sd: (x, z) => (r.shape === 'rect' ? sdRect(x, z, r) : sdCircle(x, z, r)) })),
    ...HALLS.map((h, i) => ({ ...h, kind: 'hall', id: 'hall' + i, sd: (x, z) => sdHall(x, z, h) })),
];
SHAPES.forEach((s, i) => (s.index = i));

export const BOUNDS = { x0: -72, x1: 52, z0: -268, z1: 32 };

// Query the mothership at (x, z):
//  sd   = distance to the nearest wall (negative = you can walk here)
//  zone = which area you're in, shape = the room/hall you're deepest inside
//  hole = the hole you're over (if any)
const _q = { sd: 0, sdU: 0, zone: 0, shape: null, hole: null, holeD: 0 };
export function shipQuery(x, z, out = _q) {
    let best = Infinity, bestS = SHAPES[0];
    for (const s of SHAPES) {
        const d = s.sd(x, z);
        if (d < best) { best = d; bestS = s; }
    }
    out.sdU = best;
    out.shape = bestS;
    out.zone = bestS.zone;
    out.hole = null;
    out.holeD = 0;
    let sd = best;
    for (const h of HOLES) {
        const dx = x - h.x, dz = z - h.z;
        const hd = h.r - Math.sqrt(dx * dx + dz * dz); // > 0 inside the hole
        if (hd > sd) sd = hd;
        if (hd > 0) { out.hole = h; out.holeD = hd; }
    }
    out.sd = sd;
    return out;
}

// Ceiling height at (x, z): the highest ceiling of the shapes you're under
export function ceilingAt(x, z) {
    let h = 0, best = Infinity, bestH = 5.5;
    for (const s of SHAPES) {
        const d = s.sd(x, z);
        if (d < 0.3 && s.h > h) h = s.h;
        if (d < best) { best = d; bestH = s.h; }
    }
    return h || bestH;
}

// Which area (zone) a point is in
export function zoneAt(x, z) {
    return shipQuery(x, z).zone;
}
