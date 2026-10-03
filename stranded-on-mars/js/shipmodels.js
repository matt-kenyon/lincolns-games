// ============================================================
// SHIP MODELS — things for level 2 and its cutscenes: alien fighters,
// cargo pods, the critters in the specimen tubes (yes, a cow), the
// escape pod, the mothership seen from outside, the tractor beam,
// and the cockpit of Lincoln's ship.
// ============================================================

import * as THREE from 'three';
import { GeoBuilder, vcMat, addOutline, toonMaterial, glowSprite, shared } from './toon.js';
import { makeRng, perlin2 } from './util.js';

const PURPLE = 0x7b4bb0, PURPLE_DARK = 0x4f2d80, PURPLE_LIGHT = 0xa98ae6;
const GOLD = 0xf2c14e, CYAN = 0x6ff0ff, MAGENTA = 0xff6be8, FANG = 0xfffaf2, INK = 0x1b1030;

function mesh(geo, outline = 0.003, mat = vcMat({ rim: 0.5 })) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (outline) addOutline(m, INK, outline);
    return m;
}

// ------------------------------------------------------------
// Alien fighter (a little like a Halo Banshee). Nose toward -Z, ~6m long.
// ------------------------------------------------------------
export function createFighter() {
    const b = new GeoBuilder();
    const sph = (w = 18, h = 12) => new THREE.SphereGeometry(1, w, h);
    // body + belly
    b.add(sph(), [PURPLE, (p, i, c) => c.set(p.getY(i) < 1.25 ? PURPLE_LIGHT : PURPLE)], { p: [0, 1.6, 0], s: [1.0, 0.85, 2.5] });
    b.add(sph(), PURPLE_DARK, { p: [0, 1.25, 1.6], s: [0.8, 0.6, 1.2] });
    // canopy
    b.add(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), CYAN, { p: [0, 2.05, -0.9], s: [0.62, 0.5, 1.15] }, 0.55);
    // fangs on the nose
    for (const sx of [-1, 1]) {
        b.add(new THREE.ConeGeometry(0.16, 1.1, 8), FANG, { p: [sx * 0.42, 1.25, -2.6], r: [-Math.PI / 2 - 0.2, 0, sx * 0.15] });
    }
    // swept wings with gold tips
    for (const sx of [-1, 1]) {
        b.add(sph(14, 8), PURPLE, { p: [sx * 2.1, 2.0, 0.8], s: [2.4, 0.18, 1.0], r: [0, sx * 0.45, sx * -0.28] });
        b.add(sph(10, 6), GOLD, { p: [sx * 4.1, 1.45, 0.05], s: [0.55, 0.22, 0.42], r: [0, sx * 0.45, sx * -0.28] });
        b.add(sph(10, 6), MAGENTA, { p: [sx * 4.3, 1.4, -0.1], s: [0.18, 0.18, 0.18] }, 1.6);
        // engine pods
        b.add(new THREE.CylinderGeometry(0.42, 0.55, 1.6, 12), PURPLE_DARK, { p: [sx * 1.0, 1.4, 2.4], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.CircleGeometry(0.4, 12), MAGENTA, { p: [sx * 1.0, 1.4, 3.21] }, 1.8);
    }
    // landing struts
    for (const [x, z] of [[-0.9, -1.2], [0.9, -1.2], [0, 1.5]]) {
        b.add(new THREE.CylinderGeometry(0.08, 0.12, 1.0, 6), 0x3a2a50, { p: [x, 0.55, z] });
        b.add(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 8), GOLD, { p: [x, 0.05, z] });
    }
    const g = new THREE.Group();
    g.add(mesh(b.build(), 0.0026));
    return g;
}

// Alien cargo pod (a cylinder, so its collider is exact)
export function createCanister(rng = Math.random) {
    const b = new GeoBuilder();
    const h = 1.6 + rng() * 0.6;
    b.add(new THREE.CylinderGeometry(0.85, 0.85, h, 16), PURPLE_DARK, { p: [0, h / 2 + 0.2, 0] });
    b.add(new THREE.SphereGeometry(0.85, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), PURPLE, { p: [0, h + 0.2, 0], s: [1, 0.35, 1] });
    b.add(new THREE.CylinderGeometry(0.75, 0.9, 0.2, 16), 0x2a1c4a, { p: [0, 0.1, 0] });
    for (const y of [0.45, h - 0.05]) b.add(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 16), GOLD, { p: [0, y + 0.2, 0] });
    b.add(new THREE.CylinderGeometry(0.87, 0.87, 0.22, 16), rng() < 0.5 ? CYAN : MAGENTA, { p: [0, h * 0.55 + 0.2, 0] }, 1.4);
    const g = new THREE.Group();
    g.add(mesh(b.build(), 0.0026));
    g.userData.top = h + 0.5;
    return g;
}

// ------------------------------------------------------------
// Specimen-tube critters
// ------------------------------------------------------------
export function createCow() {
    const b = new GeoBuilder();
    const spots = (p, i, c) => {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        c.set(perlin2(x * 2.2 + z * 1.3, y * 2.4 - z * 0.7) > 0.22 ? 0x2a2026 : 0xfbf6ee);
    };
    b.add(new THREE.SphereGeometry(1, 18, 12), [0xfbf6ee, spots], { p: [0, 0, 0], s: [0.55, 0.48, 0.85] });
    // head
    b.add(new THREE.SphereGeometry(1, 16, 12), 0xfbf6ee, { p: [0, 0.22, -0.92], s: [0.32, 0.3, 0.34] });
    b.add(new THREE.SphereGeometry(1, 14, 10), 0xffb3c4, { p: [0, 0.1, -1.2], s: [0.24, 0.17, 0.14] });
    for (const sx of [-1, 1]) {
        b.add(new THREE.SphereGeometry(0.035, 8, 6), 0x5a2a3a, { p: [sx * 0.08, 0.12, -1.33] });
        b.add(new THREE.SphereGeometry(0.075, 10, 8), 0xffffff, { p: [sx * 0.15, 0.33, -1.17] });
        b.add(new THREE.SphereGeometry(0.04, 8, 6), 0x111111, { p: [sx * 0.15, 0.34, -1.23] });
        b.add(new THREE.ConeGeometry(0.05, 0.22, 8), 0xf3e2c0, { p: [sx * 0.2, 0.5, -0.92], r: [0, 0, sx * -0.6] });
        b.add(new THREE.SphereGeometry(1, 10, 8), 0xfbf6ee, { p: [sx * 0.33, 0.33, -0.86], s: [0.14, 0.06, 0.08], r: [0, 0, sx * 0.3] });
    }
    // legs + hooves (dangling in the goo)
    for (const [x, z] of [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]]) {
        b.add(new THREE.CylinderGeometry(0.1, 0.09, 0.62, 8), 0xfbf6ee, { p: [x, -0.55, z] });
        b.add(new THREE.CylinderGeometry(0.1, 0.11, 0.14, 8), 0x3a2a2a, { p: [x, -0.9, z] });
    }
    b.add(new THREE.SphereGeometry(1, 12, 8), 0xffb3c4, { p: [0, -0.4, 0.25], s: [0.2, 0.12, 0.2] });
    b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), 0xfbf6ee, { p: [0, 0.05, 1.05], r: [0.6, 0, 0] });
    b.add(new THREE.SphereGeometry(0.08, 8, 6), 0x2a2026, { p: [0, -0.18, 1.25] });
    const g = new THREE.Group();
    g.add(mesh(b.build(), 0.0035));
    return g;
}

export function createDuck() {
    const b = new GeoBuilder();
    b.add(new THREE.SphereGeometry(1, 16, 12), 0xffd23f, { p: [0, 0, 0], s: [0.55, 0.42, 0.7] });
    b.add(new THREE.SphereGeometry(1, 14, 10), 0xffd23f, { p: [0, 0.45, -0.32], s: [0.32, 0.32, 0.32] });
    b.add(new THREE.SphereGeometry(1, 12, 8), 0xff8a2e, { p: [0, 0.4, -0.66], s: [0.17, 0.07, 0.15] });
    b.add(new THREE.ConeGeometry(0.2, 0.4, 8), 0xffd23f, { p: [0, 0.15, 0.68], r: [-1.2, 0, 0] });
    for (const sx of [-1, 1]) {
        b.add(new THREE.SphereGeometry(0.07, 8, 6), 0x111111, { p: [sx * 0.17, 0.55, -0.55] });
        b.add(new THREE.SphereGeometry(1, 10, 8), 0xf5b82a, { p: [sx * 0.45, 0.05, 0.05], s: [0.12, 0.25, 0.42] });
    }
    const g = new THREE.Group();
    g.add(mesh(b.build(), 0.0035));
    return g;
}

export function createFish() {
    const b = new GeoBuilder();
    b.add(new THREE.SphereGeometry(1, 16, 12), [0xff8a3d, (p, i, c) => c.set(Math.sin(p.getZ(i) * 9) > 0.55 ? 0xffffff : 0xff8a3d)], { s: [0.32, 0.5, 0.8] });
    b.add(new THREE.ConeGeometry(0.42, 0.55, 4), 0xff6a2a, { p: [0, 0, 0.95], r: [-Math.PI / 2, 0, 0], s: [0.25, 1, 1] });
    b.add(new THREE.ConeGeometry(0.2, 0.35, 4), 0xff6a2a, { p: [0, 0.5, 0.1], s: [0.2, 1, 1] });
    for (const sx of [-1, 1]) {
        b.add(new THREE.SphereGeometry(0.11, 10, 8), 0xffffff, { p: [sx * 0.25, 0.12, -0.5] });
        b.add(new THREE.SphereGeometry(0.06, 8, 6), 0x111111, { p: [sx * 0.31, 0.12, -0.53] });
    }
    const g = new THREE.Group();
    g.add(mesh(b.build(), 0.0035));
    return g;
}

export function createBlob() {
    const b = new GeoBuilder();
    b.add(new THREE.SphereGeometry(1, 20, 14), 0x7dff6a, { s: [0.75, 0.62, 0.75] }, 0.45);
    for (const [x, y, z, r] of [[-0.22, 0.32, -0.5, 0.17], [0.2, 0.36, -0.52, 0.2], [0.02, 0.58, -0.38, 0.13]]) {
        b.add(new THREE.SphereGeometry(r, 12, 10), 0xffffff, { p: [x, y, z] });
        b.add(new THREE.SphereGeometry(r * 0.5, 10, 8), 0x111111, { p: [x, y, z - r * 0.7] });
    }
    b.add(new THREE.TorusGeometry(0.2, 0.04, 6, 12, Math.PI), 0x1a4a1a, { p: [0, 0.05, -0.68], r: [0, 0, Math.PI] });
    const g = new THREE.Group();
    g.add(mesh(b.build(), 0.0035));
    return g;
}

export function createSpaceRock() {
    const geo = new THREE.IcosahedronGeometry(0.7, 1);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        v.multiplyScalar(1 + perlin2(v.x * 2.1, v.y * 2.3 + v.z) * 0.25);
        p.setXYZ(i, v.x, v.y, v.z);
    }
    const b = new GeoBuilder();
    b.add(geo, [0xd9774c, (pp, i, c) => c.set(pp.getY(i) > 0.3 ? 0xeaa271 : 0xb95b3b)], {}, 0, true);
    const g = new THREE.Group();
    g.add(mesh(b.build(), 0.0035));
    return g;
}

// ------------------------------------------------------------
// Escape pod (nose toward -Z, ~4.6m long)
// ------------------------------------------------------------
export function createEscapePod() {
    const b = new GeoBuilder();
    const prof = [
        [0, -2.4], [0.55, -2.32], [0.95, -2.05], [1.2, -1.6], [1.3, -1.0], [1.3, 1.1], [1.18, 1.7], [0.95, 2.1], [0.7, 2.25],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const lathe = new THREE.LatheGeometry(prof, 28);
    lathe.rotateX(-Math.PI / 2);
    b.add(lathe, [0xf2eef8, (p, i, c) => {
        const z = p.getZ(i);
        if (z < -2.05) c.set(MAGENTA);
        else if (Math.abs(z + 0.2) < 0.18 || Math.abs(z - 1.3) < 0.14) c.set(GOLD);
        else if (p.getY(i) < -0.85) c.set(0xc9bfe0);
        else c.set(0xf2eef8);
    }]);
    // portholes
    b.add(new THREE.CircleGeometry(0.62, 20), CYAN, { p: [1.29, 0.25, -0.75], r: [0, Math.PI / 2, 0] }, 0.6);
    b.add(new THREE.TorusGeometry(0.66, 0.08, 8, 24), GOLD, { p: [1.3, 0.25, -0.75], r: [0, Math.PI / 2, 0] });
    b.add(new THREE.CircleGeometry(0.62, 20), CYAN, { p: [-1.29, 0.25, -0.75], r: [0, -Math.PI / 2, 0] }, 0.6);
    b.add(new THREE.TorusGeometry(0.66, 0.08, 8, 24), GOLD, { p: [-1.3, 0.25, -0.75], r: [0, -Math.PI / 2, 0] });
    b.add(new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), CYAN, { p: [0, 0.85, -1.55], s: [1.1, 0.9, 1], r: [-0.9, 0, 0] }, 0.55);
    // fins
    for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
        b.add(new THREE.BoxGeometry(0.12, 0.9, 1.3), PURPLE, { p: [Math.cos(a) * 1.35, Math.sin(a) * 1.35, 1.6], r: [0, 0, a - Math.PI / 2] });
    }
    // thruster
    b.add(new THREE.CylinderGeometry(0.5, 0.7, 0.6, 18, 1, true), 0x3a2a50, { p: [0, 0, 2.45], r: [Math.PI / 2, 0, 0] });
    b.add(new THREE.CircleGeometry(0.48, 18), 0x5a3a2a, { p: [0, 0, 2.5] }, 0.3);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    body.add(mesh(b.build(), 0.003));
    const glow = glowSprite(0xffa04a, 2.6, 0);
    glow.position.set(0, 0, 2.9);
    body.add(glow);
    const flameG = new THREE.ConeGeometry(0.5, 3.2, 14, 1, true);
    flameG.translate(0, 1.6, 0);
    const flame = new THREE.Mesh(flameG, new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, 0, 2.6);
    flame.visible = false;
    body.add(flame);
    return {
        root, body, glow, flame,
        setThrust(k, t = 0) {
            const f = 0.85 + Math.sin(t * 40) * 0.1;
            glow.material.opacity = Math.min(1, k) * f;
            glow.scale.setScalar(2.4 + k * 2 * f);
            flame.visible = k > 0.2;
            flame.scale.set(1, k * f, 1);
        },
    };
}

// ------------------------------------------------------------
// The alien MOTHERSHIP seen from outside (huge! nose toward -Z)
// Its hangar opening is at the front, underneath.
// ------------------------------------------------------------
export function createMothership() {
    const b = new GeoBuilder();
    const rng = makeRng(77);
    // light on top, dark underneath (cy/sy = the part's center height and size)
    const hull = (cy, sy) => [PURPLE, (p, i, c) => {
        const y = (p.getY(i) - cy) / sy;
        c.set(y > 0.38 ? PURPLE_LIGHT : y < -0.42 ? 0x4a2e7e : PURPLE);
    }];
    const HG = 0.12; // a little self-glow so the shady side still reads against space
    // long main hull + the bulbous head
    b.add(new THREE.SphereGeometry(1, 40, 24), hull(0, 22), { p: [0, 0, 20], s: [42, 22, 120] }, HG);
    b.add(new THREE.SphereGeometry(1, 36, 24), hull(6, 24), { p: [0, 6, -85], s: [36, 24, 44] }, HG);
    // two big angry glowing "eyes" (the bridge windows) on the head
    for (const sx of [-1, 1]) {
        b.add(new THREE.SphereGeometry(1, 20, 10), 0x2a1040, { p: [sx * 11.2, 9.6, -126.4], s: [9.6, 4.4, 3.4], r: [-0.12, sx * 0.3, sx * 0.24] });
        b.add(new THREE.SphereGeometry(1, 20, 10), 0xffd84a, { p: [sx * 11.4, 9.3, -127.5], s: [8.2, 3.0, 2.8], r: [-0.12, sx * 0.3, sx * 0.24] }, 1.9);
    }
    // swept-back arms
    for (const sx of [-1, 1]) {
        b.add(new THREE.SphereGeometry(1, 28, 16), hull(-4, 9), { p: [sx * 58, -4, 40], s: [46, 9, 70], r: [0, sx * -0.35, sx * 0.12] }, HG);
        b.add(new THREE.SphereGeometry(1, 20, 12), GOLD, { p: [sx * 96, -8, 92], s: [8, 5, 22], r: [0, sx * -0.35, 0] });
        b.add(new THREE.SphereGeometry(1, 16, 10), MAGENTA, { p: [sx * 97, -8, 113], s: [5, 3, 3] }, 1.8);
    }
    // top fin + belly keel
    b.add(new THREE.SphereGeometry(1, 20, 12), PURPLE_DARK, { p: [0, 26, 40], s: [4, 16, 60] });
    b.add(new THREE.SphereGeometry(1, 20, 12), PURPLE_DARK, { p: [0, -22, 30], s: [10, 8, 70] });
    // engines at the back
    for (const [x, y] of [[-16, 2], [16, 2], [0, -8]]) {
        b.add(new THREE.CylinderGeometry(8, 10, 14, 20), 0x2a1c4a, { p: [x, y, 138], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.CircleGeometry(7.5, 20), CYAN, { p: [x, y, 145.2] }, 1.8);
    }
    // the hangar bay mouth (front, underneath the head)
    b.add(new THREE.BoxGeometry(34, 14, 4), [0x2a1450, (p, i, c) => c.set(p.getY(i) < -16 ? 0x5a3aa0 : 0x1c0c38)], { p: [0, -14, -112] }, 0.9);
    b.add(new THREE.BoxGeometry(38, 1.6, 5), GOLD, { p: [0, -6.4, -112] });
    b.add(new THREE.BoxGeometry(38, 1.6, 5), GOLD, { p: [0, -21.6, -112] });
    b.add(new THREE.BoxGeometry(36, 0.8, 4.4), CYAN, { p: [0, -20.5, -113] }, 1.6);
    // ...with FANGS (it really does want to eat you)
    for (let i = 0; i < 6; i++) {
        const x = -14 + i * 5.6;
        b.add(new THREE.ConeGeometry(1.5, 4.6, 8), FANG, { p: [x, -9.4, -114.2], r: [Math.PI, 0, 0] });
        if (i < 5) b.add(new THREE.ConeGeometry(1.2, 3.4, 8), FANG, { p: [x + 2.8, -18.9, -114.2] });
    }
    // tractor beam emitter
    b.add(new THREE.SphereGeometry(1, 16, 10), 0x2a1c4a, { p: [0, -24, -100], s: [9, 5, 9] });
    b.add(new THREE.SphereGeometry(1, 16, 10), 0x7dff9a, { p: [0, -27, -100], s: [5, 3, 5] }, 1.8);
    // glowing stripes down the sides, and rows of window lights
    for (const sx of [-1, 1]) {
        b.add(new THREE.SphereGeometry(1, 12, 6), CYAN, { p: [sx * 41.6, 3, 12], s: [1.2, 1.2, 92] }, 1.6);
        b.add(new THREE.SphereGeometry(1, 12, 6), MAGENTA, { p: [sx * 39.5, -9, 18], s: [1.0, 1.0, 80] }, 1.6);
    }
    for (let i = 0; i < 120; i++) {
        const z = rng.range(-90, 110);
        const side = rng.sign();
        const ang = rng.range(-0.25, 0.55);
        const zz = (z - 20) / 120;
        const rr = Math.sqrt(Math.max(0, 1 - zz * zz));
        if (rr < 0.3) continue;
        const x = side * Math.cos(ang) * 42 * rr * 1.01, y = Math.sin(ang) * 22 * rr * 1.01;
        b.add(new THREE.BoxGeometry(2.4, 2.0, 5), rng() < 0.75 ? CYAN : 0xffe08a, { p: [x, y, z], r: [0, 0, side * ang] }, 1.7);
    }
    // lights all around the hangar mouth and the beam emitter
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        b.add(new THREE.SphereGeometry(1.1, 8, 6), 0x7dff9a, { p: [Math.cos(a) * 11, -25 + Math.sin(a) * 4, -100 + Math.sin(a) * 6] }, 1.8);
    }
    const g = new THREE.Group();
    const m = new THREE.Mesh(b.build(), vcMat({ rim: 0.6, rimColor: 0xd8c8ff }));
    g.add(m);
    addOutline(m, INK, 0.0008);
    g.userData.bayMouth = new THREE.Vector3(0, -14, -114);
    g.userData.emitter = new THREE.Vector3(0, -27, -100);
    return g;
}

// ------------------------------------------------------------
// Tractor beam: a glowing green cone with rings sliding up it
// (points along +Y from its base; scale.y = length)
// ------------------------------------------------------------
export function createTractorBeam(r0 = 4, r1 = 14) {
    const geo = new THREE.CylinderGeometry(r0, r1, 1, 32, 1, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color(0x7dff9a) }, uOn: { value: 1 } },
        vertexShader: /* glsl */`
            varying vec2 vUv;
            varying vec3 vN;
            varying vec3 vV;
            void main() {
                vUv = uv;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vN = normalize(normalMatrix * normal);
                vV = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            varying vec2 vUv;
            varying vec3 vN;
            varying vec3 vV;
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uOn;
            void main() {
                float edge = 1.0 - abs(dot(vN, vV));
                float rings = smoothstep(0.75, 1.0, sin(vUv.y * 40.0 - uTime * 9.0));
                float streak = smoothstep(0.85, 1.0, sin(vUv.x * 60.0 + vUv.y * 4.0 - uTime * 2.0)) * 0.4;
                float a = (0.05 + edge * 0.38 + rings * 0.28 + streak * 0.8) * uOn;
                gl_FragColor = vec4(uColor * a, 1.0);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 12;
    return m;
}

// ------------------------------------------------------------
// The cockpit of the LINCOLN-1 (for the self-destruct scene).
// Lincoln sits facing -Z. Returns handles for the animated bits.
// ------------------------------------------------------------
export function screenTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ctx = c.getContext('2d');
    return {
        tex,
        draw(mode, n = 10, blink = false) {
            ctx.fillStyle = mode === 'count' ? (blink ? '#5a0a14' : '#2a0610') : '#081a2a';
            ctx.fillRect(0, 0, 256, 160);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (mode === 'count') {
                ctx.fillStyle = '#ff5b5b';
                ctx.font = 'bold 30px "Russo One", Arial Black, sans-serif';
                ctx.fillText('SELF-DESTRUCT', 128, 34);
                ctx.font = 'bold 86px "Russo One", Arial Black, sans-serif';
                ctx.fillStyle = blink ? '#ffffff' : '#ffd166';
                ctx.fillText(String(n), 128, 104);
            } else if (mode === 'warn') {
                ctx.fillStyle = '#7dff9a';
                ctx.font = 'bold 26px "Russo One", Arial Black, sans-serif';
                ctx.fillText('TRACTOR BEAM', 128, 50);
                ctx.fillText('DETECTED', 128, 84);
                ctx.fillStyle = blink ? '#ff5b5b' : '#ffd166';
                ctx.fillText('ENGINES: 0%', 128, 124);
            } else {
                ctx.fillStyle = '#6ff0ff';
                ctx.font = 'bold 28px "Russo One", Arial Black, sans-serif';
                ctx.fillText('LINCOLN-1', 128, 60);
                ctx.font = 'bold 20px sans-serif';
                ctx.fillText('ALL SYSTEMS GO', 128, 104);
            }
            tex.needsUpdate = true;
        },
    };
}

export function createCockpit() {
    const root = new THREE.Group();
    const b = new GeoBuilder();
    const WHITE = 0xe8e4dc, ORANGE = 0xff7a2e, METAL = 0x5d6672, DARK = 0x3a4250;
    // tub: floor, side walls, back wall
    b.add(new THREE.BoxGeometry(2.8, 0.2, 3.4), DARK, { p: [0, -0.1, 0.1] });
    for (const sx of [-1, 1]) {
        b.add(new THREE.BoxGeometry(0.25, 1.3, 3.2), WHITE, { p: [sx * 1.38, 0.55, 0.1], r: [0, 0, sx * -0.12] });
        // side consoles: a dark panel with blinky lights, and an orange stripe on top
        b.add(new THREE.BoxGeometry(0.06, 0.62, 2.2), METAL, { p: [sx * 1.235, 0.66, 0.15], r: [0, 0, sx * -0.12] });
        b.add(new THREE.BoxGeometry(0.28, 0.09, 3.22), ORANGE, { p: [sx * 1.46, 1.2, 0.1], r: [0, 0, sx * -0.12] });
        for (let i = 0; i < 5; i++) {
            const col = [0x6ff0ff, 0x7dff6a, 0xffd166, 0x6ff0ff, 0xff6b6b][i];
            b.add(new THREE.SphereGeometry(0.04, 8, 6), col, { p: [sx * 1.2, 0.8 - (i % 2) * 0.16, -0.55 + i * 0.3] }, 1.4);
        }
    }
    b.add(new THREE.BoxGeometry(2.8, 1.4, 0.25), WHITE, { p: [0, 0.6, 1.7] });
    // the dashboard: a panel sloping up away from the pilot, on a support block
    const tilt = 0.55;
    b.add(new THREE.BoxGeometry(2.4, 0.8, 0.55), METAL, { p: [0, 0.45, -1.15] });
    b.add(new THREE.BoxGeometry(2.4, 0.12, 0.95), METAL, { p: [0, 1.0, -0.9], r: [tilt, 0, 0] });
    b.add(new THREE.BoxGeometry(2.5, 0.16, 0.18), ORANGE, { p: [0, 1.28, -1.33], r: [tilt, 0, 0] });
    b.add(new THREE.BoxGeometry(2.5, 0.1, 0.12), ORANGE, { p: [0, 0.74, -0.49], r: [tilt, 0, 0] });
    // a spot on the panel: u = left/right, w = toward the pilot
    const n = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
    const down = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
    const top = new THREE.Vector3(0, 1.0, -0.9).addScaledVector(n, 0.06);
    const P = (u, w, h = 0) => top.clone().add(new THREE.Vector3(u, 0, 0)).addScaledVector(down, w).addScaledVector(n, h);
    const btnCols = [0xff4040, 0x40c0ff, 0x7dff6a, 0xffd166, ORANGE];
    const rng = makeRng(5);
    for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 5; i++) {
            for (const side of [-1, 1]) {
                if (side > 0 && row < 2 && i > 0) continue; // the right side has the big red button
                const p = P(side * (0.62 + i * 0.12), -0.25 + row * 0.16, 0.02);
                b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), rng.pick(btnCols), { p: [p.x, p.y, p.z], r: [tilt, 0, 0] }, 1.3);
            }
        }
    }
    // throttle lever
    const lv = P(-0.75, 0.25, 0.1);
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), DARK, { p: [lv.x, lv.y, lv.z], r: [tilt - 0.5, 0, 0] });
    b.add(new THREE.SphereGeometry(0.06, 10, 8), ORANGE, { p: [lv.x, lv.y + 0.13, lv.z + 0.07] });
    // canopy frame (the glass is see-through)
    b.add(new THREE.TorusGeometry(1.42, 0.07, 8, 24, Math.PI), WHITE, { p: [0, 1.15, -1.45] });
    b.add(new THREE.TorusGeometry(1.42, 0.07, 8, 24, Math.PI), WHITE, { p: [0, 1.15, 1.1] });
    b.add(new THREE.BoxGeometry(0.1, 0.1, 2.6), WHITE, { p: [0, 2.57, -0.18] });
    // eject handle (yellow + black) at the front of the seat
    b.add(new THREE.TorusGeometry(0.12, 0.028, 6, 16, Math.PI), 0xffd166, { p: [0, 0.5, -0.32], r: [-0.3, 0, 0] });
    const shell = new THREE.Mesh(b.build(), vcMat({ rim: 0.4 }));
    shell.receiveShadow = true;
    root.add(shell);
    addOutline(shell, 0x2a1424, 0.0022);

    // the big screen in the middle of the dashboard
    const screen = screenTexture();
    screen.draw('ok');
    const sp = P(-0.05, -0.05, 0.012);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ map: screen.tex }));
    scr.position.copy(sp);
    scr.rotation.x = -(Math.PI / 2 - tilt);
    root.add(scr);
    const glass = new THREE.Mesh(
        new THREE.SphereGeometry(1.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
    );
    glass.scale.set(1, 0.95, 1.4);
    glass.position.set(0, 1.15, -0.18);
    root.add(glass);

    // the SELF-DESTRUCT box: a big red button under a flip-up cover
    const box = new THREE.Group();
    box.position.copy(P(0.66, 0.16, 0.0));
    box.rotation.x = tilt;
    root.add(box);
    const bb = new GeoBuilder();
    bb.add(new THREE.BoxGeometry(0.44, 0.07, 0.44), 0x2a2a30, { p: [0, 0.035, 0] });
    for (let i = 0; i < 6; i++) bb.add(new THREE.BoxGeometry(0.075, 0.075, 0.46), i % 2 ? 0x111111 : 0xffd166, { p: [-0.19 + i * 0.075, 0.037, 0] });
    box.add(new THREE.Mesh(bb.build(), vcMat()));
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 18), toonMaterial({ color: 0xff2a2a, rim: 0.6, rimColor: 0xffffff }));
    button.position.y = 0.11;
    box.add(button);
    const btnGlow = glowSprite(0xff3030, 0.7, 0.45);
    btnGlow.position.y = 0.2;
    box.add(btnGlow);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.08, -0.22);
    box.add(hinge);
    const cover = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.18, 0.42),
        new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    cover.position.set(0, 0.09, 0.21);
    hinge.add(cover);
    // a little label
    const lc = document.createElement('canvas');
    lc.width = 256;
    lc.height = 64;
    const lx = lc.getContext('2d');
    lx.fillStyle = '#ffd166';
    lx.fillRect(0, 0, 256, 64);
    lx.fillStyle = '#c81e1e';
    lx.font = 'bold 34px "Russo One", Arial Black, sans-serif';
    lx.textAlign = 'center';
    lx.textBaseline = 'middle';
    lx.fillText('SELF-DESTRUCT', 128, 34);
    const ltex = new THREE.CanvasTexture(lc);
    ltex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.115), new THREE.MeshBasicMaterial({ map: ltex }));
    label.position.copy(P(0.66, -0.15, 0.015));
    label.rotation.x = -(Math.PI / 2 - tilt);
    root.add(label);

    return { root, screen, button, btnGlow, hinge, cover, box, ejectHandle: new THREE.Vector3(0, 0.55, -0.32) };
}
