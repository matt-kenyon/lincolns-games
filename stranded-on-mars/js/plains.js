// ============================================================
// THE GREAT DUST PLAINS — the big open area for driving the rover:
// rolling dunes, the launch ridge + the wing's mesa, rock and alien
// metal ramps, stone arches, buttes and wandering dust devils.
// The shapes are part of the terrain heightfield (plainsShape, used by
// terrain.js), so the player, the rover, aliens and grenades all stand on
// them; buildPlains() adds the meshes and colliders on top.
// ============================================================

import * as THREE from 'three';
import { JUMP, PLAINS, MESA_HEIGHT, GATE_S, PATH, pathQuery } from './layout.js';
import { GeoBuilder, vcMat, toonMaterial, addOutline, glowSprite, shared } from './toon.js';
import { fbm2, perlin2, smoothstep, clamp, lerp, makeRng } from './util.js';

const J = JUMP;

// ------------------------------------------------------------
// Shapes
// ------------------------------------------------------------
// A wedge you drive up: low end at (x0, z0), rising along (dx, dz)
function prepRamp(r, metal) {
    const dx = -Math.sin(r.yaw), dz = -Math.cos(r.yaw);
    return {
        ...r, metal, dx, dz, sx: -dz, sz: dx,
        x0: r.x - dx * r.len / 2, z0: r.z - dz * r.len / 2,
        // the heightfield wedge sits a little inside a metal ramp's mesh (so its 2 m grid edges stay hidden)
        hw: r.halfW - 0.7, sideW: 0.8, endW: 0.8,
        // the ground under a metal ramp is leveled to this height (so the mesh and the terrain line up)
        base: pathQuery(r.x, r.z, {}).floor,
    };
}
export const RAMPS = [
    ...PLAINS.rockRamps.map((r) => prepRamp(r, false)),
    ...PLAINS.metalRamps.map((r) => prepRamp(r, true)),
];

function rampH(r, x, z) {
    const dx = x - r.x0, dz = z - r.z0;
    const u = dx * r.dx + dz * r.dz;
    if (u < -1 || u > r.len + r.endW + 1) return 0;
    const v = Math.abs(dx * r.sx + dz * r.sz);
    if (v > r.hw + r.sideW + 1) return 0;
    let h = r.h * clamp(u / r.len, 0, 1);
    h *= 1 - smoothstep(r.len, r.len + r.endW, u);
    h *= 1 - smoothstep(r.hw, r.hw + r.sideW, v);
    return Math.max(0, h);
}

// Local coordinates of the jump: u = meters past the lip (along the jump), v = sideways (+ = right)
export function jumpUV(x, z, out = { u: 0, v: 0 }) {
    const dx = x - J.lip.x, dz = z - J.lip.z;
    out.u = dx * J.dir.x + dz * J.dir.z;
    out.v = dx * J.side.x + dz * J.side.z;
    return out;
}

const U_START = -(J.kickLen + J.crestLen + J.inclineLen);
const U_CREST = -(J.kickLen + J.crestLen);

// The launch ridge: a gentle incline, a flat crest (the run-up) and the alien kicker ramp at the end
function ridgeH(u, v, x, z) {
    if (u < U_START - 4 || u > 4) return 0;
    let h, hw;
    if (u < U_CREST) {
        const t = clamp((u - U_START) / J.inclineLen, 0, 1);
        h = J.crestH * t;
        hw = lerp(J.inclineHalfW + 3, J.ridgeHalfW, t);
    } else {
        h = J.crestH;
        hw = J.ridgeHalfW;
    }
    const av = Math.abs(v) + fbm2(x * 0.09, z * 0.09, 2) * 1.2 * smoothstep(J.ridgeHalfW - 3, J.ridgeHalfW, Math.abs(v));
    h *= 1 - smoothstep(hw, hw + 2 + h * 0.3, av);
    // the cliff under the lip (a little rock step under the kicker's end first: the terrain grid is 2 m, so
    // this keeps the kicker's last meter from being smoothed down into the cliff, while a jump on foot from the
    // step still falls well short of the mesa)
    const kv = Math.abs(v) < J.kickHalfW - 0.7;
    h *= 1 - smoothstep(kv ? 2.2 : 0, kv ? 3.6 : 1.6, u);
    if (kv && u > -J.kickLen && u <= 2.2) {
        h = Math.max(h, u <= 0 ? J.crestH + J.kickH * (u + J.kickLen) / J.kickLen : J.lipH - 1);
    }
    return h;
}

// The mesa (flat top, steep cliffs, a rubble apron) and the ledge path down its right side
function mesaDist(u, v, x, z) {
    const M = J.mesa;
    const a = M.len / 2, b = M.halfW;
    const du = u - (M.u0 + a);
    const e = Math.pow(Math.pow(Math.abs(du) / a, 4) + Math.pow(Math.abs(v) / b, 4), 0.25);
    let sd = (e - 1) * Math.min(a, b);
    // ragged edges, but a clean, straight edge where the rover lands and where the way down starts
    let rag = 1 - (1 - smoothstep(8, 14, Math.abs(v))) * (1 - smoothstep(24, 30, u));
    if (v > 12 && u > 32) rag *= 0.25;
    sd += fbm2(x * 0.07, z * 0.07, 2) * 2.2 * rag;
    return sd;
}

function mesaH(u, v, x, z) {
    const M = J.mesa;
    if (u < M.u0 - 12 || u > M.u0 + M.len + 12 || Math.abs(v) > M.halfW + 14) return 0;
    const sd = mesaDist(u, v, x, z);
    const H = MESA_HEIGHT;
    let h = Math.max(H * (1 - smoothstep(-0.4, 1.3, sd)), 2.6 * (1 - smoothstep(0.8, 8, sd)));
    const D = J.down;
    if (u > D.u0 - 2 && u < D.u1 + 3 && v > D.v0 - 2 && v < D.v1 + 3) {
        const t = clamp((u - D.u0) / (D.u1 - D.u0), 0, 1);
        let hd = H - (H - D.endH) * t;
        hd *= 1 - smoothstep(D.u1, D.u1 + 1.1, u);
        hd *= 1 - smoothstep(D.v1, D.v1 + 1.1, v);
        h = Math.max(h, hd);
    }
    return h;
}

function butteH(b, x, z) {
    const dx = x - b.x, dz = z - b.z;
    const d = Math.hypot(dx, dz);
    if (d > b.r + 12) return 0;
    const a = Math.atan2(dz, dx);
    const r = b.r * (1 + perlin2(Math.cos(a) * 1.3 + b.x, Math.sin(a) * 1.3 + b.z) * 0.16);
    const sd = d - r;
    return Math.max(b.h * (1 - smoothstep(-0.6, 1.6, sd)), 3 * (1 - smoothstep(0.5, 9, sd)));
}

// How far into the plains an arc length along the path is (0 outside, 1 well inside)
const S_IN = GATE_S[2], S_OUT = GATE_S[3];
export function plainsWeight(s) {
    return smoothstep(S_IN + 18, S_IN + 60, s) * (1 - smoothstep(S_OUT - 60, S_OUT - 18, s));
}

// Distance from the jump's center line (ridge start to the mesa's far end)
function jumpLineDist(u, v) {
    const uu = clamp(u, U_START, J.mesa.u0 + J.mesa.len);
    return Math.hypot(u - uu, v);
}

/**
 * Shape the plains floor. Called for every terrain grid point inside the plains' bounding box.
 * floor: the canyon floor height there, q: pathQuery result. Returns the new floor height and fills
 * out.rock (0..1, paint it as rock) and out.dune (-1..1, dune shading).
 */
const _uv = { u: 0, v: 0 };
export function plainsShape(x, z, floor, q, out) {
    out.rock = 0;
    out.dune = 0;
    const w = plainsWeight(q.s);
    if (w <= 0) return floor;
    jumpUV(x, z, _uv);
    const { u, v } = _uv;
    // flat ground around the jump, so its heights are exact
    const jd = jumpLineDist(u, v);
    const flatJump = 1 - smoothstep(J.mesa.halfW + 16, J.mesa.halfW + 40, jd);
    let f = lerp(floor, J.base, flatJump * w);
    // keep the ground around the other set pieces calm (and level under the metal ramps)
    let calm = flatJump;
    for (const r of RAMPS) {
        const d = Math.hypot(x - r.x, z - r.z);
        const k = 1 - smoothstep(r.len * 0.6 + 4, r.len * 0.6 + 18, d);
        calm = Math.max(calm, k);
        if (k > 0) f = lerp(f, r.base, (1 - smoothstep(r.len * 0.6 + 2, r.len * 0.6 + 10, d)) * w);
    }
    for (const b of PLAINS.buttes) calm = Math.max(calm, 1 - smoothstep(b.r + 4, b.r + 16, Math.hypot(x - b.x, z - b.z)));
    for (const a of PLAINS.arches) calm = Math.max(calm, 1 - smoothstep(a.r + 4, a.r + 14, Math.hypot(x - a.x, z - a.z)));
    // rolling dunes (wind from the south-west), and dune banks piled against the cliffs
    const s = x * 0.83 + z * 0.56 + fbm2(x * 0.007, z * 0.007, 2) * 24;
    const amp = 3.2 * (0.65 + 0.35 * perlin2(x * 0.012 + 5, z * 0.012 - 3));
    const ph = s / 44 * Math.PI * 2;
    const dune = 0.5 - 0.5 * Math.cos(ph + 0.6 * Math.sin(ph));
    const dw = w * (1 - calm);
    f += dune * amp * dw;
    const bank = smoothstep(-28, -2, q.sd);
    f += bank * bank * 6.5 * w;
    out.dune = (dune - 0.5) * 2 * dw;
    // the ground sinks into a shallow basin around the mesa (so it towers over you)
    const M = J.mesa;
    if (u > M.u0 - 45 && u < M.u0 + M.len + 45 && Math.abs(v) < M.halfW + 45) {
        f -= 3 * (1 - smoothstep(4, 32, mesaDist(u, v, x, z))) * w;
    }
    // set pieces: the ridge and the mesa stand on the jump's own level ground (J.base), the rest on the floor
    let h = 0;
    for (const r of RAMPS) h = Math.max(h, rampH(r, x, z));
    for (const b of PLAINS.buttes) h = Math.max(h, butteH(b, x, z));
    let y = f + h * w;
    const jh = Math.max(ridgeH(u, v, x, z), mesaH(u, v, x, z));
    if (jh > 0) y = Math.max(y, lerp(f, J.base + jh, w));
    const rock = Math.max(h, jh > 0 ? y - f : 0);
    if (rock > 0.05) out.rock = smoothstep(0.05, 1.2, rock);
    return y;
}

// Should the scenery scatter (rocks, plants) stay away from this spot? (the ridge, the mesa, ramps, arches...)
const _kc = { u: 0, v: 0 };
export function plainsKeepClear(x, z, r) {
    if (x < PLAINS_BOX.x0 || x > PLAINS_BOX.x1 || z < PLAINS_BOX.z0 || z > PLAINS_BOX.z1) return false;
    jumpUV(x, z, _kc);
    if (jumpLineDist(_kc.u, _kc.v) < J.mesa.halfW + 12 + r) return true;
    for (const p of RAMPS) if (Math.hypot(x - p.x, z - p.z) < p.len * 0.6 + 6 + r) return true;
    for (const a of PLAINS.arches) if (Math.hypot(x - a.x, z - a.z) < a.r + 5 + r) return true;
    for (const b of PLAINS.buttes) if (Math.hypot(x - b.x, z - b.z) < b.r + 3 + r) return true;
    return false;
}

// Bounding box of everything plainsShape can touch
export const PLAINS_BOX = (() => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 11; i <= 16; i++) {
        const [x, z, hw] = PATH[i];
        x0 = Math.min(x0, x - hw - 32); x1 = Math.max(x1, x + hw + 32);
        z0 = Math.min(z0, z - hw - 32); z1 = Math.max(z1, z + hw + 32);
    }
    return { x0, x1, z0, z1 };
})();

// ------------------------------------------------------------
// Meshes and colliders
// ------------------------------------------------------------
const C_METAL = 0x4a2a6a, C_METAL2 = 0x5c2f8a, C_GOLD = 0xf2c14e, C_GLOW = 0x6ff0ff, C_PINK = 0xff7cf0;

// A ramp: an alien metal one (a plated deck with a gold rim and glowing chevrons) or a natural slab of rock.
// u along the ramp from its low end (0) to the lip (len), rising h. Built in local space (deck along -Z).
function rampGeo(len, halfW, h, chevrons = 3, rock = false) {
    const b = new GeoBuilder();
    const ang = Math.atan2(h, len);
    const L = Math.hypot(len, h);
    const deck = rock ? 0xc8643f : C_METAL2, side = rock ? 0x8f3b26 : C_METAL;
    // deck plate (tilted box)
    b.add(new THREE.BoxGeometry(halfW * 2, rock ? 0.5 : 0.22, L, rock ? 4 : 1, 1, rock ? 5 : 1), deck,
        { p: [0, h / 2 - (rock ? 0.2 : 0.08), -len / 2], r: [ang, 0, 0] });
    // side skirts: a sloped plate each side from the deck edge out to the ground (hides the terrain under it)
    for (const s of [-1, 1]) {
        const o = halfW + Math.max(0.5, h * 0.95); // where the skirt meets the ground, at the high end
        const A = [s * halfW, 0, 0.05], B = [s * halfW, h, -len], C = [s * o, -0.4, -len - 0.2], D = [s * (halfW + 0.4), -0.4, 0.3];
        const tri = s > 0 ? [A, C, B, A, D, C] : [A, B, C, A, C, D];
        const sk = new THREE.BufferGeometry();
        sk.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
        // face normals, pointing out and up
        const nrm = [];
        for (let t = 0; t < 2; t++) {
            const [p, q, r] = [tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]];
            const n = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2])
                .cross(new THREE.Vector3(r[0] - p[0], r[1] - p[1], r[2] - p[2])).normalize();
            if (n.x * s < 0) n.negate();
            for (let k = 0; k < 3; k++) nrm.push(n.x, n.y, n.z);
        }
        sk.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        b.add(sk, side);
    }
    // the end wall under the lip
    b.add(new THREE.BoxGeometry(halfW * 2, h, 0.3), side, { p: [0, h / 2 - 0.1, -len - 0.1] });
    if (rock) {
        // roughen it up: chunky stones along the edges and the lip
        const g = b.build();
        const rb = new GeoBuilder();
        const P = g.attributes.position;
        for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
            if (y > 0.3) P.setY(i, y + perlin2(x * 0.9 + 3, z * 0.9) * 0.18);
        }
        g.computeVertexNormals();
        rb.chunks.push({ g, col: g.attributes.color.array, gl: g.attributes.glow.array });
        const rng = makeRng(Math.round(len * 31 + h * 7));
        for (let i = 0; i < 7; i++) {
            const t = rng.range(0.15, 1), sd = rng.sign();
            rb.add(new THREE.DodecahedronGeometry(rng.range(0.35, 0.7), 0), rng() < 0.5 ? 0xb4563a : 0xe39c6b,
                { p: [sd * (halfW + rng.range(-0.1, 0.4)), h * t * 0.7, -len * t], s: [1, 0.7, 1], r: [rng() * 3, rng() * 3, 0] }, 0, true);
        }
        return rb.build();
    }
    // gold rails along the edges
    for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.26, 0.3, L), C_GOLD, { p: [s * (halfW - 0.05), h / 2 + 0.06, -len / 2], r: [ang, 0, 0] });
    // glowing chevrons pointing up the ramp
    for (let i = 0; i < chevrons; i++) {
        const t = (i + 0.7) / (chevrons + 0.4);
        const y = h * t + 0.06, zc = -len * t;
        for (const s of [-1, 1]) {
            b.add(new THREE.BoxGeometry(halfW * 0.75, 0.06, 0.32), C_GLOW,
                { p: [s * halfW * 0.33, y, zc + 0.35], r: [ang, s * 0.55, 0] }, 1.2);
        }
    }
    // a glowing lip bar
    b.add(new THREE.BoxGeometry(halfW * 2 + 0.2, 0.24, 0.3), C_PINK, { p: [0, h + 0.02, -len + 0.05] }, 1.3);
    return b.build();
}

// A natural stone arch (like Red Rock Canyon's, smaller) to drive through
function archGeo(R, thick, seed) {
    const g = new THREE.TorusGeometry(R, thick, 8, 28, Math.PI);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = perlin2(v.x * 0.22 + seed, v.y * 0.22 + v.z * 0.3) * thick * 0.35;
        const len = Math.hypot(v.x, v.y);
        const k = (len + n) / (len || 1);
        p.setXYZ(i, v.x * k, v.y * k, v.z * (1 + n * 0.12));
    }
    const b = new GeoBuilder();
    b.add(g, [0xb4502f, (pp, i, c) => {
        const y = pp.getY(i);
        const band = Math.floor((y + perlin2(pp.getX(i) * 0.2, seed) * 1.2) / 1.8);
        c.set([0xb24f2f, 0xd27243, 0x9b3f28, 0xe59a66, 0xc25f39][((band % 5) + 5) % 5]);
    }], {}, 0, true);
    return b.build();
}

export function buildPlains(world) {
    const scene = world.scene;
    const metalMat = vcMat({ rim: 0.45 });
    const rockMat = toonMaterial({ vertexColors: true, flat: true, paint: 0.15, rim: 0.2 });
    const parts = new GeoBuilder();     // all the metal ramps in one mesh
    const rocks = new GeoBuilder();     // arches and loose boulders in one mesh
    const _q = {};

    // the metal ramps, including the kicker at the end of the launch ridge
    const kick = { x: J.lip.x - J.dir.x * J.kickLen / 2, z: J.lip.z - J.dir.z * J.kickLen / 2 };
    const metal = [
        ...RAMPS.map((r) => ({ x0: r.x0, z0: r.z0, yaw: r.yaw, len: r.len, halfW: r.halfW, h: r.h, y: r.base, rock: !r.metal })),
        {
            x0: J.lip.x - J.dir.x * J.kickLen, z0: J.lip.z - J.dir.z * J.kickLen, yaw: Math.atan2(-J.dir.x, -J.dir.z),
            len: J.kickLen, halfW: J.kickHalfW, h: J.kickH, y: J.base + J.crestH, chev: 2,
        },
    ];
    const m4 = new THREE.Matrix4();
    for (const r of metal) {
        const g = rampGeo(r.len, r.halfW, r.h, r.chev || 3, r.rock);
        m4.makeRotationY(r.yaw).setPosition(r.x0, r.y + 0.04, r.z0);
        g.applyMatrix4(m4);
        (r.rock ? rocks : parts).chunks.push({ g, col: g.attributes.color.array, gl: g.attributes.glow.array });
    }
    // alien posts with glowing tips beside the kicker (they say "jump here!")
    for (const s of [-1, 1]) {
        const px = kick.x + J.side.x * s * (J.kickHalfW + 1.6), pz = kick.z + J.side.z * s * (J.kickHalfW + 1.6);
        const py = J.base + J.crestH;
        parts.add(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 6), C_METAL, { p: [px, py + 1.6, pz] });
        parts.add(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 6), C_GOLD, { p: [px, py + 3.2, pz] });
        parts.add(new THREE.OctahedronGeometry(0.42, 0), C_PINK, { p: [px, py + 3.8, pz], s: [1, 1.5, 1] }, 1.4, true);
        world.colliders.add(px, pz, 0.35, py + 3.4);
        const gl = glowSprite(C_PINK, 2.6, 0.7);
        gl.position.set(px, py + 3.8, pz);
        scene.add(gl);
    }
    const metalMesh = new THREE.Mesh(parts.build(), metalMat);
    world.addStatic(metalMesh, true, 0.0025);

    // stone arches
    PLAINS.arches.forEach((a, i) => {
        const thick = a.r * 0.26;
        const g = archGeo(a.r, thick, i * 7.3);
        const gy = world.groundAt(a.x, a.z);
        // the arch spans across the way through: rotate so its legs sit to either side
        m4.makeRotationY(a.yaw).setPosition(a.x, gy - thick * 0.7, a.z);
        g.applyMatrix4(m4);
        rocks.chunks.push({ g, col: g.attributes.color.array, gl: g.attributes.glow.array });
        const sx = Math.cos(a.yaw), sz = -Math.sin(a.yaw); // sideways (perpendicular to the way through)
        for (const s of [-1, 1]) world.colliders.add(a.x + sx * a.r * s, a.z + sz * a.r * s, thick * 1.05, gy + a.r);
    });

    // boulders on the mesa top near the far rim (bumpers for a fast landing) and around the plains
    const rng = makeRng(404);
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const boulder = (x, z, s, y = world.groundAt(x, z)) => {
        const g = rockGeo.clone();
        const p = g.attributes.position;
        const vv = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
            vv.fromBufferAttribute(p, i);
            vv.multiplyScalar(1 + perlin2(vv.x * 1.7 + x, vv.z * 1.7 + vv.y + z) * 0.25);
            vv.y *= 0.7;
            p.setXYZ(i, vv.x, vv.y, vv.z);
        }
        rocks.add(g, [0xb4563a, (pp, i, c) => c.set(pp.getY(i) > y + s * 0.3 ? 0xe39c6b : pp.getY(i) < y - s * 0.05 ? 0x8a3f2c : 0xb4563a)],
            { p: [x, y + s * 0.25, z], s: [s, s * rng.range(0.8, 1.2), s], r: [0, rng() * 6, 0] }, 0, true);
        world.colliders.add(x, z, s * 0.9, y + s * 0.8);
    };
    const M = J.mesa;
    for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const v = lerp(-M.halfW + 6, M.halfW - 8, t);
        const u = M.u0 + M.len - 5 - Math.abs(v) * 0.12 + rng.range(-1.5, 1.5);
        const p = J.at(u, v);
        boulder(p.x, p.z, rng.range(1.1, 1.8), J.base + MESA_HEIGHT);
    }
    for (let i = 0; i < 5; i++) {
        const p = J.at(rng.range(M.u0 + 8, M.u0 + 30), rng.range(-M.halfW + 3, -M.halfW + 7));
        boulder(p.x, p.z, rng.range(0.6, 1.0), J.base + MESA_HEIGHT);
    }
    // boulder clusters out on the plains (something to steer around)
    let clusters = 0;
    for (let tries = 0; tries < 400 && clusters < 22; tries++) {
        const x = rng.range(PLAINS_BOX.x0, PLAINS_BOX.x1), z = rng.range(PLAINS_BOX.z0, PLAINS_BOX.z1);
        const q = pathQuery(x, z, _q);
        if (q.sd > -10 || plainsWeight(q.s) < 0.9 || plainsKeepClear(x, z, 6)) continue;
        clusters++;
        const n = rng.int(2, 4);
        for (let k = 0; k < n; k++) {
            const bx = x + rng.range(-3.5, 3.5), bz = z + rng.range(-3.5, 3.5);
            boulder(bx, bz, k === 0 ? rng.range(1.6, 2.8) : rng.range(0.8, 1.6));
        }
    }
    const rockMesh = new THREE.Mesh(rocks.build(), rockMat);
    world.addStatic(rockMesh, false);

    // a layered rock "skin" over the mesa's cliffs: the 2 m terrain grid makes tall cliffs look
    // crumpled up close, so these clean banded walls sit just over them (looks only: the terrain is what you stand on)
    const skins = new GeoBuilder();
    const STRATA = [0xb24f2f, 0xd27243, 0x9b3f28, 0xe59a66, 0xc25f39, 0xa94a2d];
    // edge(a, sd) -> {x, z}: the point at signed distance sd from the cliff, in direction a from the center
    const addSkin = (edge, yTop, yBot, seed, N = 200) => {
        const bandH = 2.3;
        // a flat rim over the top's rounded edge, then bands of rock down to below the ground, each jutting out or
        // tucking in a little; the wall leans out from 0.5 m past the edge at the top to 2.6 m at the bottom
        const rings = [{ y: yTop, sd: -0.7, b: 0 }, { y: yTop, sd: 0.55, b: 0 }];
        const nb = Math.ceil((yTop - yBot) / bandH);
        for (let b = 1; b <= nb; b++) {
            const y = Math.max(yBot, yTop - b * bandH);
            const t = (yTop - y) / (yTop - yBot);
            const jut = perlin2(b * 0.9 + seed, seed) * 0.3 + 0.1;
            const sd = 0.5 + 2.1 * t + jut;
            rings.push({ y: y + 0.4, sd: sd + 0.25, b }, { y, sd, b });
        }
        const pos = [], col = [];
        const P = (i, r) => {
            const p = edge((i / N) * Math.PI * 2, r.sd);
            return [p.x, r.y, p.z];
        };
        const c = new THREE.Color();
        for (let k = 0; k < rings.length - 1; k++) {
            const r0 = rings[k], r1 = rings[k + 1];
            c.setHex(k === 0 ? 0xdc8d5c : STRATA[((r1.b + seed) % 6 + 6) % 6]);
            for (let i = 0; i < N; i++) {
                const a0 = P(i, r0), b0 = P(i + 1, r0), a1 = P(i, r1), b1 = P(i + 1, r1);
                pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
                for (let q = 0; q < 6; q++) col.push(c.r, c.g, c.b);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        skins.chunks.push({ g, col: new Float32Array(col), gl: new Float32Array(pos.length / 3) });
    };
    {
        const cu = M.u0 + M.len / 2;
        addSkin((a, sd) => {
            // march out from the middle to where the mesa's edge distance reaches sd
            let r = 0;
            for (let k = 0; k < 90; k++) {
                const u = cu + Math.cos(a) * r, v = Math.sin(a) * r;
                const p = J.at(u, v);
                if (mesaDist(u, v, p.x, p.z) >= sd) break;
                r += 0.5;
            }
            // refine
            let lo = Math.max(0, r - 0.5), hi = r;
            for (let k = 0; k < 6; k++) {
                const m = (lo + hi) / 2, u = cu + Math.cos(a) * m, v = Math.sin(a) * m;
                const p = J.at(u, v);
                if (mesaDist(u, v, p.x, p.z) >= sd) hi = m; else lo = m;
            }
            return J.at(cu + Math.cos(a) * hi, Math.sin(a) * hi);
        }, J.base + MESA_HEIGHT + 0.04, J.base - 3.4, 0);
    }
    const skinMesh = new THREE.Mesh(skins.build(), toonMaterial({ vertexColors: true, paint: 0.15, rim: 0.2 }));
    world.addStatic(skinMesh, true, 0.0022);

    // colliders around the mesa's cliffs (so nothing climbs them) and at the bottom of the way down
    const H = J.base + MESA_HEIGHT;
    const uv = { u: 0, v: 0 };
    let last = null;
    for (let i = 0; i < 720; i++) {
        const a = (i / 720) * Math.PI * 2;
        // walk out from the center until we leave the mesa top
        const cx = M.u0 + M.len / 2;
        let r = 0;
        for (let k = 0; k < 60; k++) {
            const u = cx + Math.cos(a) * r, v = Math.sin(a) * r;
            const p = J.at(u, v);
            if (mesaDist(u, v, p.x, p.z) > -1.8) break;
            r += 0.6;
        }
        const u = cx + Math.cos(a) * r, v = Math.sin(a) * r;
        const p = J.at(u, v);
        if (last && Math.hypot(p.x - last.x, p.z - last.z) < 2.6) continue;
        last = p;
        // skip where the way down leaves the top (the ledge path is at the mesa's height there)
        jumpUV(p.x, p.z, uv);
        if (uv.v > J.down.v0 - 4 && uv.u > J.down.u0 - 1 && uv.u < J.down.u0 + 6) continue;
        world.colliders.add(p.x, p.z, 1.9, H, -1000, 'mesa');
    }
    // the ledge path: its bottom end and its outer side are walls from below (their tops sit just under the
    // path, so walking down it you step right over them), and so is the edge where it leaves the top
    const D = J.down;
    const ledgeH = (u) => J.base + MESA_HEIGHT - (MESA_HEIGHT - D.endH) * clamp((u - D.u0) / (D.u1 - D.u0), 0, 1);
    for (let v = D.v0 + 0.5; v <= D.v1 + 0.6; v += 2.2) {
        const p = J.at(D.u1 + 1.4, v);
        world.colliders.add(p.x, p.z, 1.3, J.base + D.endH - 0.5, -1000, 'mesa');
    }
    for (let u = D.u0 - 1; u <= D.u1 + 0.5; u += 2.2) {
        const p = J.at(u, D.v1 + 1.4);
        world.colliders.add(p.x, p.z, 1.3, ledgeH(u) - 0.5, -1000, 'mesa');
    }
    for (let v = D.v0 + 1; v <= D.v1 + 1.4; v += 2.2) {
        const p = J.at(D.u0 - 3.2, v);
        world.colliders.add(p.x, p.z, 1.3, H - 0.5, -1000, 'mesa');
    }
    // buttes block like the mesa
    for (const b of PLAINS.buttes) {
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            world.colliders.add(b.x + Math.cos(a) * (b.r - 1.2), b.z + Math.sin(a) * (b.r - 1.2), 2.2, world.groundAt(b.x, b.z) + b.h, -1000, 'butte');
        }
    }

    // dust devils: a twisting column of dust that wanders around, plus dust kicked up at its foot
    const devilMat = new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uDark: { value: new THREE.Color(0xc4855c) }, uLight: { value: new THREE.Color(0xf6d6b6) } },
        vertexShader: /* glsl */`
            varying vec2 vUv;
            varying float vFog;
            varying vec3 vN;
            varying vec3 vV;
            uniform float uTime;
            void main() {
                vUv = uv;
                vec3 p = position;
                float h = uv.y;
                // lean and wobble
                p.x += sin(uTime * 1.3 + h * 4.0) * h * 2.2;
                p.z += cos(uTime * 1.1 + h * 3.0) * h * 1.6;
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                vN = normalize(normalMatrix * normal);
                vV = normalize(-mv.xyz);
                vFog = smoothstep(120.0, 480.0, -mv.z);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            varying vec2 vUv;
            varying float vFog;
            varying vec3 vN;
            varying vec3 vV;
            uniform float uTime;
            uniform vec3 uDark, uLight;
            void main() {
                float h = vUv.y;
                float edge = 1.0 - abs(dot(normalize(vN), normalize(vV)));
                float sw = sin(vUv.x * 6.2832 * 4.0 + h * 16.0 - uTime * 9.0);
                float streak = smoothstep(-0.3, 0.9, sw);
                float body = smoothstep(0.0, 0.05, h) * (1.0 - smoothstep(0.4, 1.0, h));
                float a = body * (0.2 + 0.8 * edge) * (0.4 + 0.6 * streak) * mix(0.75, 0.35, h) * (1.0 - vFog);
                gl_FragColor = vec4(mix(uDark, uLight, streak * 0.55 + h * 0.35), a);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const devilGeo = new THREE.CylinderGeometry(4.2, 0.55, 30, 24, 8, true);
    devilGeo.translate(0, 15, 0);
    const devils = PLAINS.devils.map((d, i) => {
        const m = new THREE.Mesh(devilGeo, devilMat);
        m.renderOrder = 10;
        m.frustumCulled = true;
        scene.add(m);
        return { ...d, m, a: i * 2.1, sp: 0.07 + i * 0.015, x: d.x, z: d.z };
    });
    const fx = world.game.effects;
    const P = () => world.game.player;
    fx.addEmitter({
        rate: 18,
        emit: (e) => {
            const pl = P();
            if (!pl) return;
            for (const d of devils) {
                if (Math.hypot(pl.pos.x - d.x, pl.pos.z - d.z) > 140) continue;
                const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2;
                const y = world.groundAt(d.x, d.z);
                e.spawn({
                    x: d.x + Math.cos(a) * r, y: y + 0.3, z: d.z + Math.sin(a) * r,
                    vx: -Math.sin(a) * 4, vy: 1.5 + Math.random() * 3, vz: Math.cos(a) * 4,
                    life: 1.6, size: 0.9, size1: 3.6, color: 0xd9956a, color1: 0xeec0a0, alpha: 0.6, alpha1: 0, drag: 0.6,
                });
            }
        },
    });
    // drifting dust across the plains around the player
    fx.addEmitter({
        rate: 3,
        emit: (e) => {
            const pl = P();
            if (!pl || plainsWeight(pathQuery(pl.pos.x, pl.pos.z, _q).s) < 0.5) return;
            const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 30;
            const x = pl.pos.x + Math.cos(a) * r, z = pl.pos.z + Math.sin(a) * r;
            e.spawn({
                x, y: world.groundAt(x, z) + 0.4 + Math.random(), z,
                vx: 3.5 + Math.random() * 2, vy: 0.2, vz: 2.2 + Math.random(),
                life: 4, size: 2, size1: 6, color: 0xe7b08a, color1: 0xf2d0b0, alpha: 0.22, alpha1: 0, fadeIn: 1,
            });
        },
    });

    return {
        devils,
        update(dt) {
            for (const d of devils) {
                d.a += dt * d.sp;
                const cx = PLAINS.devils[devils.indexOf(d)];
                d.x = cx.x + Math.cos(d.a) * cx.r + Math.sin(d.a * 2.3) * cx.r * 0.3;
                d.z = cx.z + Math.sin(d.a * 1.3) * cx.r;
                d.m.position.set(d.x, world.groundAt(d.x, d.z) - 0.5, d.z);
                d.m.rotation.y += dt * 2.5;
            }
        },
    };
}
