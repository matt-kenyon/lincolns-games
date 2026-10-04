// ============================================================
// ALIENS — blue, fanged cartoon critters with big heads, bug eyes,
// an underbite full of tusks and bouncy antennae. Their armor color
// shows their rank. Cartoon "poof" when defeated.
// ============================================================

import * as THREE from 'three';
import { GeoBuilder, toonMaterial, addOutline, glowSprite } from './toon.js';
import { clamp, lerp, rand, damp, dampAngle, wrapAngle, randSign, smoothstep } from './util.js';

export const ALIEN_TYPES = {
    scout:   { name: 'Scout',   hp: 3,  speed: 5.6, scale: 0.92, armor: 0xb28cff, armorDark: 0x7652c8, burst: 1, cooldown: [1.3, 2.2], prefer: [9, 17],  leash: 30, boltSize: 0.5 },
    trooper: { name: 'Trooper', hp: 4,  speed: 4.2, scale: 1.0,  armor: 0x7b4bb0, armorDark: 0x4f2d80, burst: 2, cooldown: [1.5, 2.5], prefer: [11, 21], leash: 30, boltSize: 0.55 },
    major:   { name: 'Major',   hp: 7,  speed: 4.0, scale: 1.1,  armor: 0xe0483f, armorDark: 0x8a2230, burst: 3, cooldown: [1.8, 2.8], prefer: [11, 21], leash: 32, boltSize: 0.6 },
    captain: { name: 'Alien Captain', hp: 16, shield: 10, speed: 4.6, scale: 1.45, armor: 0xf2c14e, armorDark: 0xb8862a, burst: 4, cooldown: [1.5, 2.3], prefer: [9, 18], leash: 22, boltSize: 0.85, boss: true },
};

// How each rank is built (on top of the shared body plan)
//  w: body width, belly: tummy size, head: head size, ears, ant(ennae), hat, eyes, tusk size,
//  pads: shoulder pads (0 / 1 on the gun arm / 2), boots, pack (backpack), cape
const STYLE = {
    scout:   { w: 0.82, belly: 0.9,  head: 1.12, ears: 'bat',   ant: 'long',  hat: null,     eyes: 2, tusk: 0.85, pads: 1, boots: false, pack: false },
    trooper: { w: 1.0,  belly: 1.0,  head: 1.04, ears: 'fin',   ant: 'short', hat: 'helmet', eyes: 2, tusk: 1.0,  pads: 1, boots: true,  pack: true },
    major:   { w: 1.14, belly: 1.06, head: 1.04, ears: 'spiky', ant: null,    hat: 'mohawk', eyes: 3, tusk: 1.25, pads: 2, boots: true,  pack: true },
    captain: { w: 1.2,  belly: 1.2,  head: 1.08, ears: 'fin',   ant: null,    hat: 'crown',  eyes: 2, tusk: 1.4,  pads: 2, boots: true,  pack: false, cape: true },
};

const SKIN = 0x3f8fe6, SKIN_LIGHT = 0x86c6ff, SKIN_DARK = 0x2a5fb3, BELLY = 0xa9dcff, SPOT = 0x2f72cc;
const EYE = 0xffe14a, PUPIL = 0x1a1030, SHINE = 0xffffff, FANG = 0xfffaf2, MOUTH = 0x2a0f2a, TONGUE = 0xe8638f;
const GUN = 0x5b3592, GUN_DARK = 0x3a2068, GUN_GLOW = 0x7dff6a, GEM = 0xff5bd8;
const CAPE = 0x6a2a8c, OUTLINE = 0x1b1030;

// Body plan (before the type's scale). Feet on the ground at y = 0.
const HIP_Y = 0.62;          // hip joint height (= leg length, so straight legs keep the feet on the ground)
const NECK_Y = 0.66;         // head pivot, above the hips
const JAW_P = [0, 0.13, 0.03]; // jaw hinge, in head space
// Where hits count (x the type's scale): the top of the vertical hit capsule, the headshot line (the mouth),
// and the two points aim assist goes for (the chest, or the head when only the head peeks over cover)
export const ALIEN_CAP_TOP = 1.78, ALIEN_HEAD_LINE = 1.42, ALIEN_HEAD_MID = 1.64, ALIEN_CHEST = 1.15;

// ------------------------------------------------------------
// Shape helpers (smooth, closed shapes so the ink outlines don't crack)
// ------------------------------------------------------------
const _wv = new THREE.Vector3();
// average the normals of vertices that share a position (sphere seams and poles)
function smoothNormals(g) {
    g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal;
    const acc = new Map();
    const key = (i) => Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
    for (let i = 0; i < p.count; i++) {
        const k = key(i);
        let a = acc.get(k);
        if (!a) acc.set(k, (a = [0, 0, 0]));
        a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
    }
    for (let i = 0; i < p.count; i++) {
        const a = acc.get(key(i));
        const l = Math.hypot(a[0], a[1], a[2]) || 1;
        n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
    }
    return g;
}
// unit sphere bent by fn(v)
function blob(fn, ws = 14, hs = 10) {
    const g = new THREE.SphereGeometry(1, ws, hs);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        _wv.fromBufferAttribute(p, i);
        fn(_wv);
        p.setXYZ(i, _wv.x, _wv.y, _wv.z);
    }
    return smoothNormals(g);
}
const sph = (ws = 12, hs = 9) => new THREE.SphereGeometry(1, ws, hs);
// tapered limb hanging down from y = 0 to y = -len, rounded ends
function limb(r0, r1, len, rs = 9) {
    const pts = [];
    const n = 3;
    for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
        pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r1), -len + Math.sin(a) * r1));
    }
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * (Math.PI / 2);
        pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r0), Math.sin(a) * r0));
    }
    return smoothNormals(new THREE.LatheGeometry(pts, rs));
}
// a fang / claw / spike: round base at y = 0, sharp tip at y = 1 (scale it with s)
const fang = (curl = 0, ws = 6, hs = 5) => blob((v) => {
    const t = (v.y + 1) / 2;
    const r = Math.pow(1 - t, 0.9);
    v.x *= r; v.z = v.z * r + curl * t * t;
    v.y = t;
}, ws, hs);
const torus = (r, tube, rs = 6, ts = 18) => new THREE.TorusGeometry(r, tube, rs, ts);
// A patch painted onto a blob (belly, chest plate): a round cap of the unit sphere around `dir`,
// stretched into an oval, bent by the blob's own shaping `fn` and lifted just off its surface.
// It never cuts through the blob, so its edge stays clean.
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
function decal(fn, dir, ang, lift, stretch = [1, 1], ws = 16, hs = 4) {
    const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, ang);
    const p = g.attributes.position;
    _q.setFromUnitVectors(_up, _dir.set(dir[0], dir[1], dir[2]).normalize());
    for (let i = 0; i < p.count; i++) {
        _wv.fromBufferAttribute(p, i);
        _wv.x *= stretch[0]; _wv.z *= stretch[1];
        _wv.normalize().applyQuaternion(_q);
        fn(_wv);
        _wv.multiplyScalar(lift);
        p.setXYZ(i, _wv.x, _wv.y, _wv.z);
    }
    return smoothNormals(g);
}
// a point on a blob's surface (in the blob's unit space) toward `dir`
const onBlob = (fn, dir, lift) => { _wv.set(dir[0], dir[1], dir[2]).normalize(); fn(_wv); return _wv.multiplyScalar(lift).toArray(); };

// ------------------------------------------------------------
// Geometry (cached per alien type)
// ------------------------------------------------------------
const _geoCache = {};
function partGeos(typeId) {
    if (_geoCache[typeId]) return _geoCache[typeId];
    const T = ALIEN_TYPES[typeId];
    const ST = STYLE[typeId];
    const A = T.armor, AD = T.armorDark;
    const W = ST.w, B = ST.belly, H = ST.head;
    const cap = typeId === 'captain', major = typeId === 'major', scout = typeId === 'scout';
    const g = {};
    let b;

    // ---- torso: a pear-shaped tummy (pivot at the hips) ----
    b = new GeoBuilder();
    const bodyT = { p: [0, 0.3, 0], s: [0.34 * W, 0.42, 0.3 * W * B] };
    const bodyFn = (v) => {
        v.x *= 1 - 0.2 * v.y;
        v.z *= 1 - 0.14 * v.y + (v.z > 0 ? 0.12 * (B - 0.85) * (1 - v.y * v.y) : 0);
    };
    const onBody = (dir, lift) => {
        const u = onBlob(bodyFn, dir, lift);
        return [u[0] * bodyT.s[0] + bodyT.p[0], u[1] * bodyT.s[1] + bodyT.p[1], u[2] * bodyT.s[2] + bodyT.p[2]];
    };
    b.add(blob(bodyFn, 16, 12), SKIN, bodyT);
    if (!cap) {
        // pale tummy + belly button (aliens have those)
        b.add(decal(bodyFn, [0, -0.3, 1], 0.78, 1.012, [1.2, 1.15]), BELLY, bodyT);
        b.add(sph(6, 4), SKIN_DARK, { p: onBody([0, -0.45, 1], 1.0), s: [0.026, 0.02, 0.014] });
    }
    if (scout) {
        // a flappy scarf and a stubby tail
        b.add(torus(0.21, 0.05, 5, 14), A, { p: [0, 0.66, 0.0], r: [Math.PI / 2 - 0.15, 0, 0], s: [1.05 * W, 1.0, 1] });
        b.add(blob((v) => { v.z -= 0.25 * v.y * v.y; }, 8, 6), AD, { p: [0.1, 0.52, -0.24], r: [0.5, 0.3, 0.2], s: [0.07, 0.16, 0.035] });
        b.add(fang(0.6), SKIN_DARK, { p: [0, 0.02, -0.2], r: [-1.9, 0, 0], s: [0.08, 0.3, 0.08] });
    } else {
        // chest plate (with a dark trim) + belt with a glowing buckle
        const ang = cap ? 0.95 : major ? 0.85 : 0.74;
        b.add(decal(bodyFn, [0, 0.62, 1], ang, 1.04, [1.45, 0.82]), A, bodyT);
        b.add(decal(bodyFn, [0, 0.62, 1], ang + 0.07, 1.03, [1.45, 0.82]), AD, bodyT);
        b.add(torus(0.3, 0.045, 4, 16), AD, { p: [0, 0.04, 0.01], r: [Math.PI / 2, 0, 0], s: [1.06 * W, 0.98 * W * B, 1] });
        b.add(sph(6, 4), cap ? GEM : GUN_GLOW, { p: [0, 0.05, 0.29 * W * B + 0.03], s: [0.06, 0.045, 0.03] }, 1.4);
    }
    if (ST.pack) {
        b.add(sph(10, 7), AD, { p: [0, 0.42, -0.24 * W], s: [0.2 * W, 0.22, 0.12] });
        b.add(limb(0.04, 0.04, 0.22, 6), GUN_GLOW, { p: [0, 0.58, -0.33 * W] }, 1.2);
    }
    if (cap) {
        // a big medal and a tall royal collar behind the head
        const mp = onBody([0.38, 0.5, 1], 1.06);
        b.add(torus(0.075, 0.022, 4, 12), AD, { p: mp, r: [-0.35, 0.35, 0] });
        b.add(sph(8, 6), GEM, { p: mp, r: [-0.35, 0.35, 0], s: [0.065, 0.065, 0.035] }, 1.5);
        b.add(blob((v) => { v.z += 0.7 * v.x * v.x; v.y += 0.25 * v.x * v.x; }, 14, 8), CAPE, { p: [0, 0.74, -0.2], r: [-0.35, 0, 0], s: [0.4, 0.2, 0.05] });
    }
    g.torso = b.build();

    // ---- head: a big bean with bug eyes (pivot at the neck) ----
    b = new GeoBuilder();
    const sk = { cy: 0.31, rx: 0.37 * H, ry: 0.31 * H, rz: 0.34 * H };
    const onSkull = (x, y, z) => { // push a point out onto the skull surface
        const l = Math.hypot(x / sk.rx, (y - sk.cy) / sk.ry, z / sk.rz);
        return [x / l, sk.cy + (y - sk.cy) / l, z / l];
    };
    b.add(blob((v) => {
        const lower = Math.max(0, -v.y);
        v.x *= 1 + 0.14 * lower;
        v.z *= 1 + 0.06 * lower;
    }, 16, 11), SKIN, { p: [0, sk.cy, 0], s: [sk.rx, sk.ry, sk.rz] });
    // snout / upper lip, with a row of little teeth and two fangs
    b.add(sph(12, 8), SKIN_LIGHT, { p: [0, 0.19, 0.235 * H], s: [0.28 * H, 0.105, 0.175 * H] });
    b.add(sph(6, 4), MOUTH, { p: [0, 0.12, 0.19 * H], s: [0.26 * H, 0.08, 0.17 * H] });
    for (const sx of [-1, 1]) {
        b.add(fang(), FANG, { p: [sx * 0.1 * H, 0.115, 0.355 * H], r: [Math.PI + 0.12, 0, sx * 0.1], s: [0.028, 0.09, 0.028] });
        b.add(fang(), FANG, { p: [sx * 0.035 * H, 0.11, 0.385 * H], r: [Math.PI + 0.12, 0, 0], s: [0.02, 0.045, 0.018] });
        b.add(sph(6, 4), SKIN_DARK, { p: [sx * 0.055, 0.265, 0.395 * H], s: [0.022, 0.015, 0.012] });
    }
    // eyes
    const er0 = scout ? 0.13 : cap ? 0.112 : 0.118;
    const eyes = ST.eyes === 3
        ? [[-0.168, 0.35, 0.108], [0.168, 0.35, 0.108], [0, 0.5, 0.078]]
        : [[-0.155, 0.37, er0], [0.155, 0.37, er0]];
    for (const [ex, ey, er] of eyes) {
        const px = ex * H, py = ey + (H - 1) * 0.3;
        // depth where the eye sits on the skull
        const nx = px / sk.rx, ny = (py - sk.cy) / sk.ry;
        const ez = sk.rz * Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny)) - er * 0.45;
        b.add(sph(10, 8), EYE, { p: [px, py, ez], s: er }, 0.35);
        const toward = -Math.sign(px) * 0.012; // a little cross-eyed: goofy
        b.add(sph(8, 5), PUPIL, { p: [px + toward, py - 0.006, ez + er * 0.82], s: [er * 0.5, er * 0.6, er * 0.3] });
        b.add(sph(6, 4), SHINE, { p: [px + toward + er * 0.22, py + er * 0.26, ez + er * 0.93], s: er * 0.17 }, 1.0);
        if (!scout) {
            // heavy grumpy lid over the top of each eye (inner end lower = angry)
            const tilt = Math.sign(px) * (cap ? 0.45 : 0.36);
            b.add(sph(9, 6), SKIN, { p: [px, py + er * 0.6, ez + er * 0.1], r: [0.3, 0, tilt], s: [er * 1.2, er * 0.52, er * 1.04] });
            b.add(sph(7, 4), SKIN_DARK, { p: [px - Math.sign(px) * er * 0.05, py + er * 1.0, ez + er * 0.42], r: [0.2, 0, tilt], s: [er * (cap ? 1.25 : 1.08), er * (cap ? 0.3 : 0.24), er * 0.32] });
        } else {
            // scouts: wide-open eyes and little angry brows
            const tilt = Math.sign(px) * 0.3;
            b.add(sph(8, 5), SKIN_DARK, { p: [px, py + er * 1.15, ez + er * 0.35], r: [0.2, 0, tilt], s: [er * 0.85, er * 0.2, er * 0.26] });
        }
    }
    // ears: big bat ears (scouts), spiky fins (majors) or pointy swept-back fins
    for (const sx of [-1, 1]) {
        if (ST.ears === 'bat') {
            b.add(blob((v) => { v.y += 0.25 * v.z * v.z; }, 10, 7), SKIN, { p: [sx * 0.36 * H, 0.47, -0.02], r: [0.15, sx * 0.25, sx * -0.7], s: [0.045, 0.27, 0.17] });
            b.add(sph(8, 6), SKIN_LIGHT, { p: [sx * 0.385 * H, 0.47, 0.005], r: [0.15, sx * 0.25, sx * -0.7], s: [0.02, 0.2, 0.11] });
        } else if (ST.ears === 'spiky') {
            for (let k = 0; k < 3; k++) {
                b.add(fang(-0.3), SKIN_DARK, { p: [sx * 0.35, 0.36 - k * 0.07, -0.04 - k * 0.05], r: [-1.35 - k * 0.2, sx * 0.35, sx * -(0.75 - k * 0.1)], s: [0.05, 0.2 - k * 0.04, 0.05] });
            }
        } else {
            b.add(fang(0.5), SKIN, { p: [sx * 0.34 * H, 0.33, -0.04], r: [-0.75, sx * 0.3, sx * -1.15], s: [0.035, 0.26, 0.13] });
            b.add(fang(0.5), SKIN_LIGHT, { p: [sx * 0.345 * H, 0.335, -0.03], r: [-0.75, sx * 0.3, sx * -1.15], s: [0.02, 0.19, 0.08] });
        }
    }
    // hats
    if (ST.hat === 'helmet' || ST.hat === 'mohawk') {
        // a helmet that hugs the skull, cut higher at the front so the eyes peek out
        const hc = [0, sk.cy + 0.01, -0.015], hr = [sk.rx * (major ? 1.045 : 1.08), sk.ry * 1.1, sk.rz * (major ? 1.045 : 1.08)];
        const c0 = major ? 0.86 : 0.6, c1 = major ? 0.05 : -0.05;
        b.add(blob((v) => { const cut = lerp(c1, c0, (v.z + 1) / 2); if (v.y < cut) v.y = cut; }, 14, 10),
            [A, (pos, i, c) => {
                const uy = (pos.getY(i) - hc[1]) / hr[1], uz = (pos.getZ(i) - hc[2]) / hr[2];
                c.set(uy < lerp(c1, c0, (uz + 1) / 2) + 0.09 ? AD : A);
            }], { p: hc, s: hr });
        if (!major) {
            const gp = onSkull(0, 0.6, 0.3);
            b.add(sph(8, 6), GUN_GLOW, { p: [0, gp[1] + 0.05, gp[2] + 0.04], s: [0.05, 0.035, 0.025] }, 1.3);
            b.add(blob(() => {}, 8, 6), AD, { p: [0, 0.68, -0.1], r: [0.3, 0, 0], s: [0.035, 0.07, 0.2] });
        } else {
            // mohawk crest of spikes + two horns
            for (let k = 0; k < 5; k++) {
                const a = -0.55 + k * 0.34;
                const tall = k === 1 || k === 2 ? 0.07 : 0;
                b.add(fang(0), AD, { p: [0, hc[1] + hr[1] * 0.95 * Math.cos(a), hc[2] + hr[2] * 0.95 * Math.sin(a)], r: [a, 0, 0], s: [0.045, 0.18 + tall, 0.08] });
            }
            for (const sx of [-1, 1]) {
                b.add(fang(0.2), FANG, { p: [sx * 0.29, 0.56, -0.02], r: [0.15, 0, sx * -0.8], s: [0.055, 0.24, 0.055] });
            }
        }
    } else if (ST.hat === 'crown') {
        // golden crown with jewels, and a monocle (obviously)
        b.add(torus(0.27 * H, 0.05, 5, 20), A, { p: [0, 0.56, -0.03], r: [Math.PI / 2 - 0.12, 0, 0], s: [1.08, 1.0, 1] });
        for (let k = -2; k <= 2; k++) {
            const a = k * 0.62;
            const big = k === 0 ? 1.4 : Math.abs(k) === 1 ? 1.1 : 0.85;
            const x = Math.sin(a) * 0.29 * H, z = -0.03 + Math.cos(a) * 0.265 * H, y = 0.59 + Math.cos(a) * 0.035;
            b.add(fang(0), A, { p: [x, y, z], r: [0.1 + Math.cos(a) * 0.1, 0, -Math.sin(a) * 0.35], s: [0.06 * big, 0.21 * big, 0.06 * big] });
            if (k % 2 === 0) b.add(sph(6, 5), GEM, { p: [x * 1.04, y - 0.02, z + 0.035], s: 0.042 }, 1.4);
        }
        const ex = 0.155 * H, ey = 0.37 + (H - 1) * 0.3;
        b.add(torus(er0 * 1.1, 0.017, 4, 16), A, { p: [ex, ey, 0.33 * H], r: [0, 0.35, 0] });
    } else {
        // scouts: freckly spots on the bare head
        for (const [x, y, z, r] of [[0.1, 0.58, -0.05, 0.05], [-0.14, 0.55, -0.1, 0.04], [0.02, 0.5, -0.24, 0.06], [-0.05, 0.6, 0.08, 0.03]]) {
            b.add(sph(6, 4), SPOT, { p: onSkull(x, y, z), s: [r, r * 0.5, r] });
        }
    }
    g.head = b.build();

    // ---- jaw: underbite with tusks (pivot at the hinge) ----
    b = new GeoBuilder();
    b.add(blob((v) => { if (v.y > 0) v.y *= 0.5; }, 14, 8), SKIN, { p: [0, -0.04, 0.19 * H], s: [0.29 * H, 0.1, 0.24 * H] });
    b.add(sph(8, 6), TONGUE, { p: [0, 0.015, 0.18 * H], s: [0.17 * H, 0.04, 0.14 * H] });
    const tk = ST.tusk;
    for (const sx of [-1, 1]) {
        b.add(fang(0.25, 8, 6), FANG, { p: [sx * 0.155 * H, 0.0, 0.37 * H], r: [0.05, 0, sx * -0.18], s: [0.042 * tk, 0.17 * tk, 0.042 * tk] });
        if (cap) b.add(fang(0.2), FANG, { p: [sx * 0.07, 0.0, 0.41 * H], r: [0.1, 0, sx * -0.1], s: [0.025, 0.1, 0.025] });
    }
    g.jaw = b.build();

    // ---- antennae: two stalks with glowing bobbles ----
    if (ST.ant) {
        b = new GeoBuilder();
        const len = ST.ant === 'long' ? 0.4 : 0.24, br = ST.ant === 'long' ? 0.065 : 0.05;
        for (const sx of [-1, 1]) {
            const rz = sx * -0.42, rx = -0.25;
            const tip = new THREE.Vector3(0, len, 0).applyEuler(new THREE.Euler(rx, 0, rz));
            b.add(limb(0.018, 0.024, len, 5), SKIN_DARK, { p: [sx * 0.04, 0, 0], r: [rx + Math.PI, 0, rz] });
            b.add(sph(8, 6), GUN_GLOW, { p: [tip.x + sx * 0.04, tip.y, tip.z], s: br }, 1.3);
        }
        g.ant = b.build();
    }

    // ---- arms: upper arm (pivot at shoulder) and forearm + hand (pivot at elbow) ----
    const upper = (sx) => {
        const ub = new GeoBuilder();
        ub.add(sph(8, 6), SKIN, { p: [0, -0.01, 0], s: 0.1 });
        ub.add(limb(0.088, 0.075, 0.25, 7), SKIN, {});
        const armored = ST.pads === 2 || (ST.pads === 1 && sx > 0);
        if (armored) {
            const big = cap ? 1.4 : major ? 1.15 : 1;
            ub.add(blob((v) => { if (v.y < 0) v.y *= 0.35; }, 12, 8), A, { p: [sx * 0.02, 0.04, 0], r: [0, 0, sx * -0.35], s: [0.16 * big, 0.1 * big, 0.15 * big] });
            if (major) {
                for (let k = -1; k <= 1; k++) ub.add(fang(0), FANG, { p: [sx * 0.07, 0.11, k * 0.07], r: [0, 0, sx * -0.6], s: [0.035, 0.1, 0.035] });
            }
            if (cap) {
                // royal trim + a jewel on each pad
                ub.add(torus(0.17, 0.025, 4, 16), AD, { p: [sx * 0.02, 0.025, 0], r: [Math.PI / 2, 0, sx * -0.35], s: [1.32, 1.24, 1] });
                ub.add(sph(6, 5), GEM, { p: [sx * 0.07, 0.15, 0.02], s: 0.04 }, 1.4);
            }
        }
        return ub.build();
    };
    g.upperL = upper(-1);
    g.upperR = upper(1);
    const forearm = (sx, gun) => {
        const fb = new GeoBuilder();
        fb.add(limb(0.072, 0.092, 0.19, 7), SKIN, {});
        if (ST.pads > 0 && (sx > 0 || ST.pads === 2 || scout)) {
            fb.add(torus(0.09, 0.03, 4, 12), sx > 0 || ST.pads === 2 ? A : AD, { p: [0, -0.12, 0], r: [Math.PI / 2, 0, 0] });
        }
        // big mitten hand with three stubby fingers and a thumb
        fb.add(sph(9, 7), SKIN, { p: [0, -0.28, 0.01], s: [0.115, 0.1, 0.095] });
        if (gun) {
            for (let k = -1; k <= 1; k++) fb.add(sph(5, 4), SKIN, { p: [k * 0.05, -0.305, 0.08], s: [0.036, 0.045, 0.034] });
            fb.add(sph(6, 4), SKIN, { p: [sx * -0.08, -0.24, 0.055], s: 0.036 });
            // chunky ray gun, pointing along the forearm
            fb.add(limb(0.052, 0.07, 0.3, 8), GUN, { p: [0, -0.24, 0.02] });
            fb.add(torus(0.07, 0.024, 4, 10), GUN_DARK, { p: [0, -0.46, 0.02], r: [Math.PI / 2, 0, 0] });
            for (const fx of [-1, 1]) fb.add(blob(() => {}, 6, 4), GUN_DARK, { p: [fx * 0.075, -0.36, 0.02], r: [0, 0, fx * 0.5], s: [0.016, 0.1, 0.055] });
            fb.add(sph(10, 8), GUN_GLOW, { p: [0, -0.585, 0.02], s: [0.078, 0.072, 0.078] }, 1.6);
        } else {
            for (let k = -1; k <= 1; k++) fb.add(fang(0.6), SKIN, { p: [k * 0.05, -0.34, 0.04], r: [Math.PI - 0.5, 0, k * 0.2], s: [0.04, 0.1, 0.04] });
            fb.add(sph(6, 4), SKIN, { p: [sx * -0.09, -0.25, 0.04], s: [0.034, 0.05, 0.034] });
        }
        return fb.build();
    };
    g.foreL = forearm(-1, false);
    g.foreR = forearm(1, true);

    // ---- legs: stubby leg + big three-toed foot (pivot at the hip) ----
    b = new GeoBuilder();
    b.add(limb(0.125, 0.095, 0.44, 8), SKIN, {});
    b.add(blob((v) => { if (v.y < 0) v.y *= 0.45; v.x *= 1 + 0.25 * Math.max(0, v.z); }, 12, 8), SKIN, { p: [0, -0.578, 0.07], s: [0.135, 0.088, 0.21] });
    for (let k = -1; k <= 1; k++) {
        b.add(fang(0), FANG, { p: [k * 0.078, -0.6, 0.235], r: [Math.PI / 2 - 0.15, k * 0.25, 0], s: [0.036, 0.1, 0.03] });
    }
    if (ST.boots) b.add(torus(0.105, 0.04, 4, 12), AD, { p: [0, -0.43, 0], r: [Math.PI / 2, 0, 0] });
    if (scout) b.add(torus(0.105, 0.025, 4, 12), A, { p: [0, -0.2, 0], r: [Math.PI / 2, 0, 0] });
    g.leg = b.build();

    // ---- cape (the Captain) ----
    if (ST.cape) {
        b = new GeoBuilder();
        b.add(blob((v) => {
            const t = (1 - v.y) / 2;           // 0 at the top, 1 at the hem
            v.x *= 0.55 + 0.5 * t;
            v.z = v.z * 0.08 + 0.3 * v.x * v.x * (0.4 + 0.6 * t);
        }, 14, 10), [CAPE, (pos, i, c) => c.set(pos.getY(i) < -0.9 ? AD : CAPE)], { p: [0, -0.48, -0.02], s: [0.5, 0.5, 1] });
        g.cape = b.build();
    }

    _geoCache[typeId] = g;
    return g;
}

// "!" alert sprite
let _alertTex = null;
function alertTexture() {
    if (_alertTex) return _alertTex;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const x = c.getContext('2d');
    x.font = 'bold 110px "Russo One", Arial Black, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 14;
    x.strokeStyle = '#2a1424';
    x.strokeText('!', 32, 66);
    x.fillStyle = '#ffd166';
    x.fillText('!', 32, 66);
    _alertTex = new THREE.CanvasTexture(c);
    _alertTex.colorSpace = THREE.SRGBColorSpace;
    return _alertTex;
}

// ------------------------------------------------------------
// Model with procedural animation (used in game + cutscenes)
//
// Pose controls (all optional; cutscenes set only some of them):
//   move 0..1, aim 0..1, flinch, cheer, wave, crouch, lookYaw, lookPitch  (as before)
//   fwd / side   travel speed in the alien's own frame (leans, side-steps)
//   air          true while hopping            windup 0..1  getting ready to shoot
//   beam 0..1    beaming in (1 = just started) dying  seconds since defeat (-1 = alive)
// Impulses: kick('fire' | 'hurt' | 'shield' | 'alert' | 'die' | 'land', amount)
// ------------------------------------------------------------
export function createAlienModel(typeId) {
    const T = ALIEN_TYPES[typeId];
    const ST = STYLE[typeId];
    const G = partGeos(typeId);
    const mat = toonMaterial({ vertexColors: true, glow: true, rim: 0.6, rimColor: 0xd8f0ff, cache: false });
    const outlines = [];
    const mk = (geo, parent, shadow = true) => {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = shadow;
        outlines.push(addOutline(m, OUTLINE, 0.0042));
        parent.add(m);
        return m;
    };

    const root = new THREE.Group();
    const body = new THREE.Group();        // the type's scale x squash & stretch (origin at the feet)
    root.add(body);
    body.scale.setScalar(T.scale);

    const hips = new THREE.Group();
    hips.position.y = HIP_Y;
    body.add(hips);

    const torso = new THREE.Group();
    hips.add(torso);
    mk(G.torso, torso);

    const head = new THREE.Group();
    head.position.set(0, NECK_Y, 0.02);
    torso.add(head);
    mk(G.head, head);

    const jaw = new THREE.Group();
    jaw.position.set(JAW_P[0], JAW_P[1], JAW_P[2] * ST.head);
    head.add(jaw);
    mk(G.jaw, jaw, false);

    const ant = new THREE.Group();
    ant.position.set(0, ST.hat === 'helmet' ? 0.66 : 0.6 + (ST.head - 1) * 0.6, -0.04);
    head.add(ant);
    if (G.ant) mk(G.ant, ant, false);

    const arms = [];
    const shX = 0.3 * ST.w + 0.06;
    for (const sx of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(sx * shX, 0.53, 0.0);
        torso.add(sh);
        mk(sx < 0 ? G.upperL : G.upperR, sh);
        const el = new THREE.Group();
        el.position.y = -0.27;
        sh.add(el);
        mk(sx < 0 ? G.foreL : G.foreR, el);
        arms.push({ sh, el, side: sx });
    }

    const legs = [];
    for (const sx of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(sx * 0.17 * ST.w, 0, 0);
        hips.add(hip);
        mk(G.leg, hip);
        legs.push({ hip, side: sx });
    }

    let cape = null;
    if (G.cape) {
        cape = new THREE.Group();
        cape.position.set(0, 0.64, -0.23 * ST.w);
        torso.add(cape);
        mk(G.cape, cape);
    }

    // Gun-tip glow (charges up before firing)
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, -0.64, 0.02);
    arms[1].el.add(muzzle);
    const muzzleGlow = glowSprite(GUN_GLOW, 0.5, 0.0);
    muzzle.add(muzzleGlow);

    const alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTexture(), transparent: true, depthWrite: false }));
    alert.scale.set(0, 0, 1);
    alert.position.set(0, 2.55, 0);
    body.add(alert);

    alert.visible = false;
    muzzleGlow.visible = false;
    const q = Math.random();
    const model = {
        typeId, root, body, hips, torso, head, jaw, ant, cape, arms, legs, mat, muzzle, muzzleGlow, alert, outlines,
        outlinesOn: true,
        setOutlines(on) {
            if (on === this.outlinesOn) return;
            this.outlinesOn = on;
            for (const o of outlines) o.visible = on;
        },
        phase: q * 10,
        t: q * 10,
        alertT: 0,
        // pose controls
        move: 0, aim: 0, flinch: 0, cheer: 0, crouch: 0, lookYaw: 0, lookPitch: 0, wave: 0,
        fwd: 0, side: 0, air: false, windup: 0, beam: 0, dying: -1,
        // springs + internal state
        sq: 0, sqV: 0, rec: 0, recV: 0, pop: 0, popV: 0, anX: 0, anXV: 0, anZ: 0, anZV: 0,
        fk: 1, sk: 0, airK: 0, wasAir: false, yell: 0, surpT: 0, flinchSide: 1, prevY: null, prevVY: 0, prevYaw: null, prevYawV: 0,
        kick(kind, amt = 1) {
            const m = this;
            switch (kind) {
                case 'fire': m.recV += 9; m.sqV += 1.2; m.yell = Math.max(m.yell, 0.7); m.anXV -= 3; break;
                case 'hurt': m.sqV -= 3.4; m.anXV += 7; m.yell = 1; m.flinchSide = Math.random() < 0.5 ? -1 : 1; break;
                case 'shield': m.sqV -= 1.4; m.anXV += 3; m.flinchSide = Math.random() < 0.5 ? -1 : 1; break;
                case 'alert': m.popV += 6; m.sqV += 2.2; m.anXV -= 9; m.surpT = 0.55; m.yell = 1; break;
                case 'die': m.popV += 5; m.sqV += 4; m.anXV -= 8; m.yell = 1; break;
                case 'land': m.sqV -= Math.min(4, 1 + amt * 0.45); m.anXV += amt * 1.5; break;
            }
        },
        animate(dt, speed) {
            const m = this;
            const S = T.scale;
            dt = Math.min(dt, 0.05);
            m.t += dt;
            m.phase += dt * (2 + speed * 1.9);
            const s = Math.sin(m.phase), c = Math.cos(m.phase);
            const mv = m.move, aim = m.aim, wu = m.windup;

            // travel direction in the alien's own frame (cutscenes don't set it: forward)
            const sp = Math.hypot(m.fwd, m.side);
            m.fk = damp(m.fk, sp > 0.4 ? m.fwd / sp : 1, 8, dt);
            m.sk = damp(m.sk, sp > 0.4 ? m.side / sp : 0, 8, dt);
            m.airK = damp(m.airK, m.air ? 1 : 0, 10, dt);
            if (m.air && !m.wasAir) m.sqV += 2.0;
            m.wasAir = m.air;

            // body motion drives the antennae and bobbles
            const y = root.position.y + hips.position.y * S;
            if (m.prevY === null) { m.prevY = y; m.prevYaw = root.rotation.y; }
            const vy = (y - m.prevY) / Math.max(dt, 1e-4);
            const ay = clamp((vy - m.prevVY) / Math.max(dt, 1e-4), -150, 150);
            const yawV = wrapAngle(root.rotation.y - m.prevYaw) / Math.max(dt, 1e-4);
            const yawA = clamp((yawV - m.prevYawV) / Math.max(dt, 1e-4), -150, 150);
            m.prevY = y; m.prevVY = vy; m.prevYaw = root.rotation.y; m.prevYawV = yawV;

            // springs, sub-stepped so they act the same at any frame rate
            const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
            for (let i = 0; i < n; i++) {
                m.sqV += (-m.sq * 160 - m.sqV * 8) * h; m.sq += m.sqV * h;
                m.recV += (-m.rec * 230 - m.recV * 15) * h; m.rec += m.recV * h;
                m.popV += (-m.pop * 170 - m.popV * 9) * h; m.pop += m.popV * h;
                m.anXV += (-m.anX * 80 - m.anXV * 4.5 + ay * 0.06) * h; m.anX += m.anXV * h;
                m.anZV += (-m.anZ * 80 - m.anZV * 4.5 - yawA * 0.05) * h; m.anZ += m.anZV * h;
            }
            m.anX = clamp(m.anX, -0.9, 0.9); m.anZ = clamp(m.anZ, -0.8, 0.8);
            m.yell = Math.max(0, m.yell - dt * 3.2);
            m.surpT = Math.max(0, m.surpT - dt);
            const surp = m.surpT > 0 ? Math.sin((1 - m.surpT / 0.55) * Math.PI) : 0;
            const dy = m.dying;
            const dead = dy >= 0;
            const bm = m.beam;
            const breath = Math.sin(m.t * 2.3 + q * 6);
            const relax = (1 - mv) * (1 - aim);
            const run = clamp((speed - 2.5) / 2.5, 0, 1); // faster = bigger, bouncier strides

            // ---- squash & stretch (feet stay planted) ----
            let sy = 1 + clamp(m.sq, -0.35, 0.4);
            sy *= 1 + (0.05 + 0.04 * run) * mv * (2 * c * c - 1) + 0.018 * breath * (1 - mv) - 0.12 * wu - 0.12 * m.crouch;
            // defeated: lands with a squash, then stretches up tall... POOF
            const dLand = dead ? smoothstep(0.56, 0.68, dy) : 0, dUp = dead ? smoothstep(0.7, 0.84, dy) : 0;
            if (dead) sy *= dy < 0.69 ? lerp(1, 0.55, dLand) : lerp(0.55, 1.5, dUp);
            const sxz = 1 / Math.sqrt(sy);
            body.scale.set(S * sxz, S * sy, S * sxz);

            // ---- legs + hips: a bouncy waddle ----
            const swing = s * (0.5 + 0.18 * run) * mv * (1 - m.airK);
            hips.position.y = HIP_Y * Math.cos(swing) + (0.045 + 0.05 * run) * mv * c * c;
            hips.position.z = -m.flinch * 0.06;
            hips.rotation.z = s * 0.07 * mv + Math.sin(m.t * 0.55 + q * 6) * 0.03 * relax;
            hips.rotation.y = s * 0.12 * mv * m.fk;
            for (const L of legs) {
                const sw = swing * L.side;
                let rx = -sw * m.fk + m.airK * (L.side > 0 ? -0.55 : 0.4);
                let rz = sw * m.sk * 0.7 + L.side * (0.04 + m.airK * 0.12 + bm * 0.1);
                if (dead) { rx += Math.sin(dy * 30 + L.side) * 0.5 * (1 - smoothstep(0.3, 0.6, dy)); rz += L.side * 0.4 * smoothstep(0.1, 0.4, dy); }
                L.hip.rotation.set(rx, L.side * 0.1, rz);
            }

            // ---- torso ----
            torso.rotation.x = (0.16 + 0.14 * run) * mv * Math.max(0, m.fk) - m.flinch * 0.45 - wu * 0.2 - m.rec * 0.22 - m.cheer * 0.12 + breath * 0.02 * (1 - mv) - surp * 0.15;
            torso.rotation.z = -0.2 * mv * m.sk - hips.rotation.z * 0.5 + Math.sin(m.t * 45) * 0.025 * wu * wu + m.flinch * 0.15 * m.flinchSide;
            torso.rotation.y = -0.28 * aim + s * 0.12 * mv * (1 - aim);
            if (dead) {
                hips.rotation.z = Math.sin(dy * 15) * 0.35 * smoothstep(0, 0.25, dy);
                torso.rotation.x = -0.3 * (1 - smoothstep(0.1, 0.3, dy));
            }

            // ---- head ----
            head.rotation.y = m.lookYaw + 0.28 * aim;
            head.rotation.x = m.lookPitch * 0.85 - torso.rotation.x * 0.6 - m.flinch * 0.3 + wu * 0.15 - m.cheer * 0.3 +
                breath * 0.025 * (1 - mv) + (c * c - 0.5) * 0.08 * mv - surp * 0.2 + m.rec * 0.1;
            head.rotation.z = Math.sin(m.t * 0.7 + q * 5) * 0.13 * relax - torso.rotation.z * 0.5 + m.flinch * 0.25 * m.flinchSide;
            if (dead) { head.rotation.x = -0.35; head.rotation.z = Math.sin(dy * 20) * 0.3; }
            head.scale.setScalar(1 + clamp(m.pop, -0.2, 0.45) * 0.45);
            // jaw: grumbles, gasps, PEW!, ouch, laughs
            let jt = 0.1 + 0.04 * breath + wu * 0.28 + m.yell * 0.55 + m.flinch * 0.5 + surp * 0.4 +
                m.cheer * (0.35 + 0.25 * Math.sin(m.t * 17)) + bm * 0.5;
            if (dead) jt = 0.8;
            jaw.rotation.x = damp(jaw.rotation.x, clamp(jt, 0, 0.8), 25, dt);
            // antennae flop around
            ant.rotation.x = m.anX - 0.3 * mv * Math.max(0, m.fk) + Math.sin(m.t * 1.9 + q * 4) * 0.06 - surp * 0.2 - wu * 0.25;
            ant.rotation.z = m.anZ + Math.sin(m.t * 1.4 + q * 7) * 0.07 + 0.25 * mv * m.sk;

            // ---- arms ----
            const R = arms[1], Lf = arms[0];
            const armSw = swing * 0.9;
            // gun arm: relaxed (gun low, ready) -> aimed at you; wind-up raises it, firing kicks it
            const aimX = -Math.PI / 2 + m.lookPitch - torso.rotation.x - wu * 0.4 - m.rec * 0.5;
            let rx = lerp(-0.35 + armSw * R.side, aimX, aim);
            let rz = lerp(0.22, 0.28 + m.lookYaw * 0.6, aim);
            let ex = lerp(-0.9 - 0.4 * mv, -0.1 - wu * 0.45 + m.rec * 0.25, aim);
            // free hand: swings, or a shaking fist (the Captain shows off your power core instead)
            const boss = !!T.boss;
            const toss = boss ? Math.pow(Math.max(0, Math.sin(m.t * 3.4 + q)), 3) * 0.45 * (1 - mv) : 0;
            let lx = lerp(boss ? -0.35 + armSw * 0.4 : 0.1 + armSw * Lf.side, boss ? -0.5 : -0.75, aim);
            let lz = lerp(-0.3, boss ? -0.15 : -0.32, aim);
            let le = lerp(boss ? -1.2 - toss : -0.55 - 0.5 * mv, boss ? -1.3 - toss * 0.5 : -1.55, aim) + Math.sin(m.t * 30) * 0.12 * wu * (boss ? 0 : 1);
            // in the air: arms out
            rz += 0.35 * m.airK * (1 - aim); rx -= 0.4 * m.airK * (1 - aim);
            lz -= 0.55 * m.airK; lx -= 0.5 * m.airK;
            // ouch: arms fling out
            rz += 0.5 * m.flinch; lz -= 0.6 * m.flinch; lx -= 0.4 * m.flinch;
            // surprise: both hands up
            rx = lerp(rx, -2.1, surp * 0.8); rz = lerp(rz, 0.5, surp); ex = lerp(ex, -0.5, surp);
            lx = lerp(lx, -2.3, surp); lz = lerp(lz, -0.5, surp); le = lerp(le, -0.5, surp);
            // beaming in: ta-da!
            rz = lerp(rz, 1.25, bm); rx = lerp(rx, -0.2, bm); lz = lerp(lz, -1.25, bm); lx = lerp(lx, -0.2, bm);
            if (m.cheer > 0) {
                const w = Math.sin(m.t * 9) * 0.4;
                lx = lerp(lx, -2.75 + w, m.cheer); lz = lerp(lz, -0.4, m.cheer); le = lerp(le, -0.35, m.cheer);
                rx = lerp(rx, -2.6 - w, m.cheer); rz = lerp(rz, 0.4, m.cheer); ex = lerp(ex, -0.3, m.cheer);
            }
            if (m.wave > 0) {
                lx = lerp(lx, -2.85, m.wave); lz = lerp(lz, -0.35 + Math.sin(m.t * 10) * 0.35, m.wave); le = lerp(le, -0.45, m.wave);
            }
            if (dead) {
                const k = smoothstep(0.12, 0.3, dy);
                const fl = Math.sin(dy * 28) * 0.5;
                rx = lerp(lerp(-2.5 + fl, -0.1, k), -3.0, dUp); rz = lerp(lerp(0.4, 1.45, k), 0.2, dUp); ex = -0.3;
                lx = lerp(lerp(-2.5 - fl, -0.1, k), -3.0, dUp); lz = lerp(lerp(-0.4, -1.45, k), -0.2, dUp); le = -0.3;
            }
            R.sh.rotation.set(rx, 0, rz);
            R.el.rotation.set(ex, 0, 0);
            Lf.sh.rotation.set(lx, 0, lz);
            Lf.el.rotation.set(le, 0, 0);

            // ---- cape ----
            if (cape) {
                cape.rotation.x = 0.1 + 0.35 * mv * Math.max(0, m.fk) + 0.45 * m.airK + Math.sin(m.t * 2.1) * 0.04 + Math.abs(s) * 0.08 * mv - torso.rotation.x * 0.8;
                cape.rotation.z = -0.15 * mv * m.sk + Math.sin(m.t * 1.6) * 0.03 - hips.rotation.z;
            }

            // "!" pop
            if (m.alertT > 0) {
                m.alertT -= dt;
                const t = 1.4 - m.alertT;
                const k = t < 0.15 ? t / 0.15 * 1.3 : t < 0.25 ? 1.3 - (t - 0.15) * 3 : m.alertT < 0.2 ? m.alertT / 0.2 : 1;
                alert.visible = true;
                alert.scale.set(0.45 * k, 0.9 * k, 1);
                alert.position.y = 2.5 + Math.sin(t * 8) * 0.04;
            } else if (alert.visible) {
                alert.visible = false;
            }
        },
        showAlert() {
            this.alertT = 1.4;
            this.kick('alert');
        },
        muzzleWorld(out) {
            return muzzle.getWorldPosition(out);
        },
        // Minecraft-style red flash: darken toward red, then glow red
        setTint(k) {
            mat.color.setRGB(1, 1 - k * 0.72, 1 - k * 0.72);
            mat.emissive.setRGB(k * 0.62, k * 0.02, k * 0.04);
        },
        // Teleport shimmer: glow cyan while materializing
        setBeamGlow(k) {
            mat.color.setRGB(1, 1, 1);
            mat.emissive.setRGB(k * 0.08, k * 0.5, k * 0.62);
        },
    };
    return model;
}

// ------------------------------------------------------------
// Ray / capsule helpers
// ------------------------------------------------------------
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3();
// Closest distance^2 between segments P0-P1 and Q0-Q1. Returns {s, t, d2}
function segSeg(p0, p1, q0, q1, out) {
    _d1.subVectors(p1, p0);
    _d2.subVectors(q1, q0);
    _r.subVectors(p0, q0);
    const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
    let s, t;
    if (a <= 1e-8 && e <= 1e-8) { s = t = 0; }
    else if (a <= 1e-8) { s = 0; t = clamp(f / e, 0, 1); }
    else {
        const c = _d1.dot(_r);
        if (e <= 1e-8) { t = 0; s = clamp(-c / a, 0, 1); }
        else {
            const b = _d1.dot(_d2);
            const den = a * e - b * b;
            s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
            t = (b * s + f) / e;
            if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
            else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
        }
    }
    const cx = p0.x + _d1.x * s - (q0.x + _d2.x * t);
    const cy = p0.y + _d1.y * s - (q0.y + _d2.y * t);
    const cz = p0.z + _d1.z * s - (q0.z + _d2.z * t);
    out.s = s; out.t = t; out.d2 = cx * cx + cy * cy + cz * cz;
    return out;
}

// ------------------------------------------------------------
// Alien (gameplay)
// ------------------------------------------------------------
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _seg = { s: 0, t: 0, d2: 0 };

export class Alien {
    constructor(game, def, zone, index, mgr) {
        this.game = game;
        this.mgr = mgr;
        this.def = def;
        this.zone = zone;
        this.index = index;
        // Aliens in wave 1, 2... teleport in later (see AlienManager.startWave)
        this.wave = def.wave || 0;
        this.spawned = this.wave === 0;
        this.typeId = def.type;
        this.T = ALIEN_TYPES[def.type];
        this.model = createAlienModel(def.type);
        this.root = this.model.root;
        this.pos = new THREE.Vector3();
        this.vel = new THREE.Vector3();
        this.home = new THREE.Vector3();
        this.capA = new THREE.Vector3();
        this.capB = new THREE.Vector3();
        this.aimAt = new THREE.Vector3();
        this.tower = !!def.tower;
        this.dead = false;
        this.gone = false;
        if (this.T.boss) {
            // The Captain is holding your ship's power core!
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: 0xa8faff }));
            core.position.set(0, -0.42, 0.1);
            this.model.arms[0].el.add(core);
            core.add(glowSprite(0x6ff0ff, 1.3, 0.95));
            this.core = core;
            // energy shield shell (flares gold when hit, like Halo)
            const shell = new THREE.Mesh(
                new THREE.SphereGeometry(1, 22, 16),
                new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
            );
            shell.scale.set(0.78, 1.25, 0.78);
            shell.position.y = 1.15;
            this.model.body.add(shell);
            this.shell = shell;
        }
        this.reset();
    }

    get diff() {
        return this.game.diff;
    }

    reset() {
        const g = this.game;
        const d = this.def;
        this.pos.set(d.x, g.world.groundAt(d.x, d.z), d.z);
        if (this.tower) this.pos.y = g.world.towerTop;
        this.home.copy(this.pos);
        this.vel.set(0, 0, 0);
        this.vy = 0;
        this.maxHp = Math.round(this.T.hp * g.diff.alienHp);
        this.hp = this.maxHp;
        this.maxShield = this.T.shield ? Math.round(this.T.shield * g.diff.alienHp) : 0;
        this.shield = this.maxShield;
        this.shieldDelay = 0;
        this.state = 'idle';
        this.stateT = 0;
        // face roughly south (toward where the player comes from) unless the level says otherwise
        this.yaw = d.yaw != null ? d.yaw + rand(-0.4, 0.4) : rand(-0.9, 0.9);
        this.wanderTarget = null;
        this.wanderT = rand(1, 4);
        this.cooldown = rand(1.0, 2.0);
        this.burstLeft = 0;
        this.burstT = 0;
        this.charge = 0;
        this.strafeDir = randSign();
        this.strafeT = rand(1, 2.5);
        this.lastSeen = new THREE.Vector3();
        this.seeT = 0;
        this.canSee = false;
        this.losT = Math.random() * 0.3;
        this.dodgeT = rand(3, 7);
        this.hurtT = 0;
        this.dead = false;
        this.dyingT = 0;
        this.gone = false;
        this.taunt = 0;
        this.shieldFlare = 0;
        this.model.setTint(0);
        this.root.rotation.set(0, this.yaw, 0);
        this.root.scale.setScalar(1);
        this.spawnT = 0;
        this.airT = 0;
        this.dormant = !this.spawned;
        this.root.visible = !this.dormant && this.mgr.activeZones.has(this.zone);
        const m = this.model;
        m.move = 0;
        m.aim = 0;
        m.flinch = 0;
        m.cheer = 0;
        m.windup = 0;
        m.beam = 0;
        m.dying = -1;
        m.air = false;
        m.prevY = null; // moved: don't fling the antennae
        this.updateTransform();
    }

    updateTransform() {
        this.root.position.copy(this.pos);
        if (!this.dead) this.root.rotation.y = this.yaw;
        const s = this.T.scale;
        // hit capsule: from the knees to the middle of the head (its radius covers the rest)
        this.capA.set(this.pos.x, this.pos.y + 0.35 * s, this.pos.z);
        this.capB.set(this.pos.x, this.pos.y + ALIEN_CAP_TOP * s, this.pos.z);
    }

    get radius() {
        return 0.48 * this.T.scale;
    }

    // Segment hit test (for bolts). Returns t along the segment or -1.
    hitSegment(a, b, pad) {
        if (this.dead || this.dormant || this.spawnT > 0) return -1;
        const r = this.radius + pad;
        segSeg(a, b, this.capA, this.capB, _seg);
        if (_seg.d2 < r * r) return _seg.s;
        return -1;
    }

    // Above the mouth = a bonk on the head
    isHeadshot(point) {
        return point.y > this.pos.y + ALIEN_HEAD_LINE * this.T.scale;
    }

    alertTo(delay = 0) {
        if (this.dead || this.dormant || this.state === 'combat' || this.state === 'alert') return;
        this.state = 'alert';
        this.stateT = -delay;
        this.alertShown = false;
    }

    hurt(amount, point, headshot = false) {
        if (this.dead) return false;
        const g = this.game;
        if (this.shield > 0) {
            this.shield -= amount;
            this.shieldDelay = 4.5;
            this.shieldFlare = 1;
            this.model.kick('shield');
            g.effects.sparks(point.x, point.y, point.z, 0xffe08a, 6, 4, 0.12);
            if (this.shield <= 0) {
                this.shield = 0;
                g.effects.sparks(this.pos.x, this.pos.y + 1.5 * this.T.scale, this.pos.z, 0xffd166, 30, 9, 0.2);
                g.effects.glowFlash(this.pos.x, this.pos.y + 1.4 * this.T.scale, this.pos.z, 0xffd166, 5, 0.3);
                g.audio.play('shieldBreak', this.pos);
            } else {
                g.audio.play('shieldHit', this.pos);
            }
        } else {
            this.hp -= amount;
            this.hurtT = 0.14;
            this.model.flinch = 1;
            this.model.kick('hurt');
            g.audio.play(headshot ? 'bonk' : 'alienHurt', this.pos);
            if (this.hp <= 0) {
                this.die();
                return true;
            }
        }
        if (this.state === 'idle' || this.state === 'alert') {
            this.state = 'combat';
            this.stateT = 0;
            this.lastSeen.copy(g.player.pos);
            this.model.showAlert();
        }
        this.mgr.alertNearby(this, 30);
        return false;
    }

    // Beam in from a teleport pad (wave aliens)
    teleportIn() {
        const g = this.game;
        this.spawned = true;
        this.dormant = false;
        this.spawnT = 0.9;
        this.root.visible = this.mgr.activeZones.has(this.zone);
        this.root.scale.set(0.06, 1.7, 0.06);
        this.model.beam = 1;
        this.model.setBeamGlow(1);
        g.effects.beamColumn(this.pos.x, this.pos.y, this.pos.z, 0x9ff6ff, 1.1, 7, 1.0);
        g.effects.sparks(this.pos.x, this.pos.y + 1.2, this.pos.z, 0x9ff6ff, 18, 5, 0.16);
        g.effects.ring(this.pos.x, this.pos.y + 0.08, this.pos.z, 0x9ff6ff, 3.2, 0.6);
        g.audio.play('teleport', this.pos);
    }

    die() {
        const g = this.game;
        this.dead = true;
        this.dyingT = 0;
        this.state = 'dead';
        this.fallDir = Math.random() < 0.5 ? 1 : -1;
        const m = this.model;
        m.setTint(1);
        m.aim = 0;
        m.alertT = 0;
        m.windup = 0;
        m.beam = 0;
        m.dying = 0;
        m.kick('die');
        g.audio.play('alienDie', this.pos);
        g.onAlienDefeated(this);
    }

    update(dt) {
        const g = this.game;
        const m = this.model;
        const T = this.T;

        if (this.dormant) return;
        if (this.spawnT > 0) {
            // materializing: a thin streak of light pops out into an alien and spins into place
            this.spawnT -= dt;
            const k = clamp(1 - this.spawnT / 0.9, 0, 1);
            const wide = smoothstep(0, 0.42, k);
            const wob = k > 0.42 ? Math.exp(-(k - 0.42) * 8) * Math.sin((k - 0.42) * 32) : 0;
            const sxz = lerp(0.06, 1, wide) * (1 + wob * 0.2);
            this.root.scale.set(sxz, lerp(1.7, 1, smoothstep(0, 0.5, k)) * (1 - wob * 0.16), sxz);
            m.beam = 1 - smoothstep(0.5, 1, k);
            m.setBeamGlow((1 - k) * (1 - k));
            m.animate(dt, 0);
            if (this.spawnT <= 0) {
                this.root.scale.setScalar(1);
                m.beam = 0;
                m.setTint(0);
                this.alertTo(0);
                this.lastSeen.copy(g.player.pos);
            }
            this.updateTransform();
            if (this.spawnT > 0) this.root.rotation.y = this.yaw + (1 - k) * (1 - k) * 7;
            return;
        }
        if (this.dead) {
            // pop up, spin like a top, go splat... then POOF
            this.dyingT += dt;
            const d = this.dyingT;
            m.dying = d;
            m.flinch = Math.max(0, m.flinch - dt * 5);
            const sd = Math.max(0, d - 0.1);
            this.root.rotation.y = this.yaw + this.fallDir * sd * (8 + sd * 10);
            this.root.rotation.z = Math.sin(d * 13) * 0.16 * smoothstep(0.1, 0.35, d) * (1 - smoothstep(0.55, 0.7, d));
            this.root.position.y = this.pos.y + Math.sin(clamp(d / 0.58, 0, 1) * Math.PI) * 0.45 * T.scale;
            m.setTint(lerp(1, 0.45, smoothstep(0.06, 0.3, d)));
            m.animate(dt, 0);
            if (this.dyingT > 0.85 && !this.gone) {
                this.gone = true;
                this.root.visible = false;
                const s = T.scale;
                _v.set(0, 0.85 * s, 0).applyEuler(this.root.rotation).add(this.pos);
                g.effects.poof(_v.x, _v.y, _v.z, s * (T.boss ? 1.6 : 1));
                g.audio.play('poof', this.pos);
            }
            return;
        }

        const P = g.player;
        const diff = g.diff;
        this.stateT += dt;
        if (this.hurtT > 0) {
            this.hurtT -= dt;
            m.setTint(this.hurtT > 0 ? 1 : 0);
        }
        m.flinch = Math.max(0, m.flinch - dt * 5);

        // shield regen (captain)
        if (this.maxShield > 0) {
            if (this.shieldDelay > 0) this.shieldDelay -= dt;
            else if (this.shield < this.maxShield) {
                const before = this.shield;
                this.shield = Math.min(this.maxShield, this.shield + dt * 3);
                if (before === 0) g.audio.play('shieldUp', this.pos);
            }
            this.shieldFlare = Math.max(0, this.shieldFlare - dt * 3);
            this.shell.material.opacity = this.shield > 0 ? 0.06 + this.shieldFlare * 0.55 : 0;
        }

        // perception
        const eyeY = this.pos.y + 1.85 * T.scale;
        const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        this.losT -= dt;
        if (this.losT <= 0) {
            this.losT = 0.25;
            const pe = P.eyePos;
            const gunY = this.pos.y + 1.45 * T.scale;
            const chestY = P.pos.y + 1.15;
            // can I actually hit you from here? (same line my plasma would fly along)
            this.canSee = !P.dead && dist < diff.sight * (this.state === 'combat' ? 1.6 : 1) &&
                g.world.lineOfSight(this.pos.x, gunY, this.pos.z, P.pos.x, chestY, P.pos.z) &&
                !g.world.segmentHitsGate(this.pos.x, eyeY, this.pos.z, pe.x, pe.y, pe.z);
        }
        if (this.canSee) {
            this.lastSeen.copy(P.pos);
            this.seeT = 0;
        } else {
            this.seeT += dt;
        }

        let wantX = 0, wantZ = 0, speed = 0;
        const toPlayerYaw = Math.atan2(dx, dz);

        if (P.dead) {
            // cheer and hop when the player gets knocked out
            m.aim = damp(m.aim, 0, 6, dt);
            m.cheer = damp(m.cheer, this.state === 'combat' ? 1 : 0, 4, dt);
            this.taunt += dt;
            if (this.state === 'combat' && this.onGround && Math.random() < dt * 1.5) this.vy = 3.5;
        } else {
            m.cheer = damp(m.cheer, 0, 6, dt);
            switch (this.state) {
                case 'idle': {
                    if (this.canSee) {
                        this.alertTo(0);
                        this.mgr.alertNearby(this, 26, 0.6);
                        break;
                    }
                    m.aim = damp(m.aim, 0, 4, dt);
                    if (this.tower) break;
                    this.wanderT -= dt;
                    if (this.wanderT <= 0) {
                        this.wanderT = rand(2.5, 6);
                        const a = Math.random() * Math.PI * 2, r = rand(1, 6);
                        this.wanderTarget = Math.random() < 0.7 ? { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r } : null;
                    }
                    if (this.wanderTarget) {
                        const wx = this.wanderTarget.x - this.pos.x, wz = this.wanderTarget.z - this.pos.z;
                        const wd = Math.hypot(wx, wz);
                        if (wd > 0.6) {
                            wantX = wx / wd; wantZ = wz / wd; speed = T.speed * 0.35;
                            this.yaw = dampAngle(this.yaw, Math.atan2(wantX, wantZ), 4, dt); // face where it's strolling
                        } else this.wanderTarget = null;
                    }
                    break;
                }
                case 'alert': {
                    this.yaw = dampAngle(this.yaw, toPlayerYaw, 8, dt);
                    if (this.stateT >= 0 && !this.alertShown) {
                        this.alertShown = true;
                        m.showAlert();
                        g.audio.play('alienAlert', this.pos);
                        if (this.onGround) this.vy = 3.2;
                        this.lastSeen.copy(P.pos);
                    }
                    if (this.stateT > diff.reaction) {
                        this.state = 'combat';
                        this.stateT = 0;
                        this.cooldown = rand(0.3, 0.9) / diff.fireRate;
                    }
                    break;
                }
                case 'combat': {
                    m.aim = damp(m.aim, 1, 6, dt);
                    const tx = (this.canSee ? P.pos.x : this.lastSeen.x) - this.pos.x;
                    const tz = (this.canSee ? P.pos.z : this.lastSeen.z) - this.pos.z;
                    const td = Math.hypot(tx, tz) || 1;
                    const nx = tx / td, nz = tz / td;
                    if (!this.tower) {
                        const [pmin, pmax] = T.prefer;
                        let fwd = 0;
                        if (!this.canSee && this.seeT > 2) fwd = 1;
                        else if (td > pmax) fwd = 1;
                        else if (td < pmin) fwd = -0.8;
                        this.strafeT -= dt;
                        if (this.strafeT <= 0) {
                            this.strafeT = rand(1.0, 2.6);
                            this.strafeDir = Math.random() < 0.25 ? 0 : randSign();
                        }
                        wantX = nx * fwd + -nz * this.strafeDir * 0.9;
                        wantZ = nz * fwd + nx * this.strafeDir * 0.9;
                        const wl = Math.hypot(wantX, wantZ);
                        if (wl > 0.01) { wantX /= wl; wantZ /= wl; speed = T.speed * (fwd > 0 && this.seeT > 2 ? 1 : 0.75); }
                        // occasional dodge hop
                        this.dodgeT -= dt;
                        if (this.dodgeT <= 0 && this.onGround) {
                            this.dodgeT = rand(3, 7);
                            this.vy = 4;
                            this.strafeDir = -this.strafeDir || 1;
                        }
                    }
                    this.yaw = dampAngle(this.yaw, Math.atan2(tx, tz), 7, dt);
                    this.updateShooting(dt, td);
                    break;
                }
            }
        }

        // ----- movement -----
        const accel = 18;
        this.vel.x = damp(this.vel.x, wantX * speed, accel / Math.max(speed, 1) + 4, dt);
        this.vel.z = damp(this.vel.z, wantZ * speed, accel / Math.max(speed, 1) + 4, dt);
        if (this.tower) { this.vel.x = 0; this.vel.z = 0; }
        this.pos.x += this.vel.x * dt;
        this.pos.z += this.vel.z * dt;

        if (!this.tower) {
            // leash to home
            const hx = this.pos.x - this.home.x, hz = this.pos.z - this.home.z;
            const hd = Math.hypot(hx, hz);
            if (hd > T.leash) {
                this.pos.x = this.home.x + (hx / hd) * T.leash;
                this.pos.z = this.home.z + (hz / hd) * T.leash;
            }
            // stay in the canyon (or the mothership's rooms)
            g.world.confineAlien(this.pos, this.radius);
            g.world.colliders.resolve(this.pos, this.radius, 2, -1);
            g.world.blockByGates(this.pos, 0.7);
            g.world.domeBlocks(this.pos, 0.7);
            this.mgr.separate(this);
            // gravity / hop
            const ground = g.world.groundAt(this.pos.x, this.pos.z);
            this.vy -= 13 * dt;
            this.pos.y += this.vy * dt;
            if (this.pos.y <= ground) {
                if (!this.onGround && this.vy < -3) g.effects.dust(this.pos.x, ground, this.pos.z, 4, 0.5);
                if (!this.onGround && this.vy < -1.5) m.kick('land', -this.vy);
                this.pos.y = ground;
                this.vy = 0;
                this.onGround = true;
            } else {
                this.onGround = false;
            }
        } else {
            this.onGround = true;
        }

        // ----- animation -----
        const sp = Math.hypot(this.vel.x, this.vel.z);
        this.airT = this.onGround ? 0 : this.airT + dt;
        m.air = this.airT > 0.06;
        m.move = damp(m.move, m.air ? 0 : clamp(sp / 3, 0, 1), 8, dt);
        // travel direction in the alien's own frame (for leaning and side-stepping)
        const fy = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        m.fwd = this.vel.x * fy + this.vel.z * fz;
        m.side = this.vel.x * fz - this.vel.z * fy;
        // getting ready to shoot (before a burst; the burst itself kicks with each shot)
        m.windup = this.burstLeft > 0 ? 0 : this.charge;
        // head + aim pitch toward the player
        const relYaw = wrapAngle(toPlayerYaw - this.yaw);
        const pdy = P.eyePos.y - 0.4 - (this.pos.y + 1.6 * T.scale);
        const pitch = Math.atan2(pdy, Math.max(dist, 1));
        const engaged = this.state === 'combat' || this.state === 'alert';
        m.lookYaw = damp(m.lookYaw, engaged ? clamp(relYaw, -0.8, 0.8) : Math.sin(this.stateT * 0.6) * 0.5, 5, dt);
        m.lookPitch = damp(m.lookPitch, engaged ? clamp(-pitch, -0.6, 0.6) : 0, 5, dt);
        m.muzzleGlow.visible = this.charge > 0.01;
        m.muzzleGlow.material.opacity = this.charge;
        m.muzzleGlow.scale.setScalar(0.3 + this.charge * 0.9);
        // outlines only matter up close
        m.setOutlines(dist < 45);
        m.animate(dt, sp);
        this.updateTransform();
    }

    updateShooting(dt, dist) {
        const g = this.game;
        const diff = g.diff;
        if (this.burstLeft > 0) {
            this.burstT -= dt;
            this.charge = Math.max(this.charge, 0.8);
            if (this.burstT <= 0) {
                this.fire(dist);
                this.burstLeft--;
                this.burstT = 0.24;
                if (this.burstLeft === 0) {
                    this.cooldown = rand(this.T.cooldown[0], this.T.cooldown[1]) / diff.fireRate;
                    this.charge = 0;
                }
            }
            return;
        }
        if (!this.canSee || g.player.dead) {
            this.charge = Math.max(0, this.charge - dt * 2);
            return;
        }
        this.cooldown -= dt;
        // telegraph: gun glows for half a second before the burst
        if (this.cooldown < 0.5) this.charge = clamp(1 - this.cooldown / 0.5, 0, 1);
        if (this.cooldown <= 0) {
            this.burstLeft = this.T.burst;
            this.burstT = 0;
        }
    }

    fire(dist) {
        const g = this.game;
        const diff = g.diff;
        const P = g.player;
        const muzzle = this.model.muzzleWorld(_v);
        const speed = diff.boltSpeed * (this.T.boss ? 0.9 : 1);
        const tt = dist / speed;
        _v2.copy(P.pos);
        _v2.y += 1.15;
        _v2.x += P.vel.x * tt * diff.lead;
        _v2.z += P.vel.z * tt * diff.lead;
        _v2.sub(muzzle).normalize();
        const sp = diff.spread * (this.T.boss ? 0.7 : 1);
        _v2.x += rand(-sp, sp);
        _v2.y += rand(-sp, sp) * 0.6;
        _v2.z += rand(-sp, sp);
        _v2.normalize();
        g.combat.alienBolt(muzzle, _v2, speed, diff.damage + (this.T.boss ? 1 : 0), this.T.boss ? 0xff5bd8 : 0x7dff6a, this.T.boltSize);
        this.model.kick('fire');
        g.audio.play(this.T.boss ? 'bossShoot' : 'alienShoot', this.pos);
    }
}

// ------------------------------------------------------------
// Manager
// ------------------------------------------------------------
export class AlienManager {
    // zones: [{ name, aliens: [{ type, x, z, wave?, yaw?, tower? }] }]
    constructor(game, zones) {
        this.game = game;
        this.zones = zones;
        this.list = [];
        this.byZone = zones.map(() => []);
        this.activeZones = new Set();
        this.boss = null; // the mothership's big boss joins the hit tests (see boss.js)
    }

    build() {
        this.zones.forEach((zn, zi) => {
            zn.aliens.forEach((def, i) => {
                const a = new Alien(this.game, def, zi, i, this);
                a.root.visible = false;
                this.game.scene.add(a.root);
                this.list.push(a);
                this.byZone[zi].push(a);
            });
        });
    }

    // Remove aliens of zones already cleared (when continuing a save)
    clearZone(zi) {
        for (const a of this.byZone[zi]) {
            a.dead = true;
            a.gone = true;
            a.spawned = true;
            a.dormant = false;
            a.root.visible = false;
        }
    }

    resetZone(zi) {
        for (const a of this.byZone[zi]) if (!a.dead) a.reset();
    }

    aliveInZone(zi) {
        let n = 0;
        for (const a of this.byZone[zi]) if (!a.dead) n++;
        return n;
    }

    // Aliens of one wave still standing (or still waiting to teleport in)
    aliveInWave(zi, wave) {
        let n = 0;
        for (const a of this.byZone[zi]) if (!a.dead && a.wave === wave) n++;
        return n;
    }

    waveCount(zi) {
        let n = 0;
        for (const a of this.byZone[zi]) n = Math.max(n, a.wave + 1);
        return n;
    }

    // Teleport in every alien of a wave
    startWave(zi, wave) {
        for (const a of this.byZone[zi]) {
            if (a.wave === wave && !a.dead && a.dormant) a.teleportIn();
        }
    }

    captain() {
        return this.list.find((a) => a.T.boss);
    }

    alertNearby(src, radius, delayMax = 0.4) {
        for (const a of this.byZone[src.zone]) {
            if (a === src || a.dead || a.dormant || a.state !== 'idle') continue;
            if (a.pos.distanceTo(src.pos) < radius) a.alertTo(rand(0.1, delayMax));
        }
    }

    separate(a) {
        for (const b of this.byZone[a.zone]) {
            if (b === a || b.dead || b.dormant) continue;
            const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
            const d = Math.hypot(dx, dz);
            const min = a.radius + b.radius + 0.3;
            if (d < min && d > 0.001) {
                const k = (min - d) * 0.5;
                a.pos.x += (dx / d) * k;
                a.pos.z += (dz / d) * k;
            }
        }
    }

    // Closest alien (or the boss) hit by a segment
    segmentHit(a, b, pad = 0.15) {
        let best = null, bestT = 2;
        for (const al of this.list) {
            if (al.dead || !al.root.visible) continue;
            const t = al.hitSegment(a, b, pad);
            if (t >= 0 && t < bestT) { bestT = t; best = al; }
        }
        if (this.boss) {
            const t = this.boss.hitSegment(a, b, pad);
            if (t >= 0 && t < bestT) { bestT = t; best = this.boss; }
        }
        return best ? { alien: best, t: bestT } : null;
    }

    // For aim assist: alien nearest to the aim ray within maxAngle.
    // Sets target.aimAt to the chest, or the head if only the head peeks over a rock/ridge.
    aimTarget(origin, dir, maxAngle, maxDist = 90, checkCover = false) {
        let best = null, bestA = maxAngle;
        const W = this.game.world;
        const test = (p) => {
            if (checkCover && !W.lineOfSight(origin.x, origin.y, origin.z, p.x, p.y, p.z)) return -1;
            _v2.subVectors(p, origin);
            const d = _v2.length();
            if (d > maxDist || d < 1) return 9;
            return Math.acos(clamp(_v2.dot(dir) / d, -1, 1));
        };
        for (const al of this.list) {
            if (al.dead || al.dormant || al.spawnT > 0 || !al.root.visible) continue;
            for (const h of [ALIEN_CHEST, ALIEN_HEAD_MID]) {
                _v.set(al.pos.x, al.pos.y + h * al.T.scale, al.pos.z);
                const ang = test(_v);
                if (ang < 0) continue;
                if (ang < bestA) { bestA = ang; best = al; al.aimAt.copy(_v); }
                break;
            }
        }
        const B = this.boss;
        if (B && B.targetable()) {
            B.aimPoint(_v);
            const ang = test(_v);
            // the boss's eye is big: be a bit more generous with it
            if (ang >= 0 && ang < Math.max(bestA, maxAngle * 1.3) && (!best || ang < bestA)) { best = B; B.aimAt.copy(_v); }
        }
        return best;
    }

    damageRadius(pos, radius, dmg) {
        let kills = 0;
        for (const al of this.list) {
            if (al.dead || al.dormant || al.spawnT > 0 || !al.root.visible) continue;
            const d = _v.set(al.pos.x, al.pos.y + 1, al.pos.z).distanceTo(pos);
            if (d < radius) {
                const amt = Math.max(1, Math.round(dmg * (1 - (d / radius) * 0.6)));
                _v2.copy(al.pos);
                _v2.y += 1;
                if (al.hurt(amt, _v2)) kills++;
                // knock back
                const k = (1 - d / radius) * 6;
                al.vel.x += (al.pos.x - pos.x) / (d || 1) * k;
                al.vel.z += (al.pos.z - pos.z) / (d || 1) * k;
                if (al.onGround) al.vy = 3;
            }
        }
        if (this.boss) this.boss.blast(pos, radius, dmg);
        return kills;
    }

    setZoneActive(zi, on) {
        for (const a of this.byZone[zi]) {
            if (!a.gone && !a.dormant) a.root.visible = on;
        }
        if (on) this.activeZones.add(zi); else this.activeZones.delete(zi);
    }

    anyInCombat() {
        for (const zi of this.activeZones) {
            for (const a of this.byZone[zi]) if (!a.dead && !a.dormant && (a.state === 'combat' || a.state === 'alert')) return true;
        }
        return false;
    }

    update(dt) {
        for (const zi of this.activeZones) {
            for (const a of this.byZone[zi]) {
                if (a.gone || a.dormant) continue;
                a.update(dt);
            }
        }
    }
}
