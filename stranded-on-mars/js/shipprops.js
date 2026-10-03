// ============================================================
// SHIP PROPS — everything that fills the mothership's rooms:
// alien fighters, cargo pods, the burning wreck of your ship,
// the reactor, specimen tubes (with a cow!), the bridge, the
// creature pit's pillars and the escape pod.
// ============================================================

import * as THREE from 'three';
import { GeoBuilder, toonMaterial, vcMat, addOutline, glowSprite } from './toon.js';
import { HOLES, HALLS, BRIDGE_WINDOW, POD, WRECK, ROOMS } from './shiplayout.js';
import { emblemTexture } from './world.js';
import { buildPartModel } from './ship.js';
import {
    createFighter, createCanister, createCow, createDuck, createFish, createBlob, createSpaceRock, createEscapePod,
} from './shipmodels.js';
import { makeRng, rand } from './util.js';

const GOLD = 0xf2c14e, CYAN = 0x6ff0ff, MAGENTA = 0xff6be8, DARK = 0x3e2b6e, PURPLE = 0x6a4fb0;

export function buildShipProps(ms) {
    hangar(ms);
    reactor(ms);
    lab(ms);
    bridge(ms);
    pit(ms);
    podBay(ms);
    halls(ms);
}

function place(ms, obj, x, z, yaw = 0, y = 0) {
    obj.position.set(x, y, z);
    obj.rotation.y = yaw;
    ms.scene.add(obj);
    return obj;
}

// A glowing ring painted on the floor
function floorRing(b, x, z, r0, r1, color, glow = 1.2, segs = 48) {
    b.add(new THREE.RingGeometry(r0, r1, segs), color, { p: [x, 0.015, z], r: [-Math.PI / 2, 0, 0] }, glow);
}

// ------------------------------------------------------------
// HANGAR BAY
// ------------------------------------------------------------
function hangar(ms) {
    const rng = makeRng(11);
    const deco = new GeoBuilder();
    // alien fighters parked on their pads, noses toward the opening
    for (const [x, z, yaw] of [[-17, 2, Math.PI - 0.35], [17.5, -2, Math.PI + 0.45]]) {
        floorRing(deco, x, z, 4.2, 4.6, CYAN, 1.2);
        floorRing(deco, x, z, 2.6, 2.75, CYAN, 0.9);
        place(ms, createFighter(), x, z, yaw);
        ms.colliders.add(x, z, 2.1, 2.7, -10, 'fighter');
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        for (const sx of [-1, 1]) ms.colliders.add(x + cy * 3.6 * sx, z - sy * 3.6 * sx, 0.9, 2.4, 1.0, 'wing');
    }
    // the landing spot your ship got dragged onto
    floorRing(deco, WRECK.x, WRECK.z, 5.6, 5.8, 0xb88cff, 0.5, 64);
    // cargo pods stacked around the edges
    const spots = [
        [-20, -14], [-17.6, -15.6], [-20.6, -11.2], [19.5, -15], [21.2, -12.4], [20.4, 12.2], [17.8, 14.6],
        [21.6, 9.6], [-21, 14], [-18.4, 15.6], [-21.6, 10.8],
    ];
    for (const [x, z] of spots) {
        const c = createCanister(rng);
        place(ms, c, x, z, rng() * 6);
        ms.colliders.add(x, z, 0.95, c.userData.top, -10, 'crate');
    }
    ms.addMesh(deco.build(), ms.archMat);

    // big alien banners on the side walls
    const bannerMat = new THREE.MeshToonMaterial({ map: emblemTexture(), side: THREE.DoubleSide });
    for (const [x, z, yaw] of [[-23.7, -7, Math.PI / 2], [-23.7, 7, Math.PI / 2], [23.7, -7, -Math.PI / 2], [23.7, 7, -Math.PI / 2]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.2), bannerMat);
        m.position.set(x, 6.6, z);
        m.rotation.y = yaw;
        ms.scene.add(m);
    }

    // the docking clamp that held your ship (hangs from the ceiling)
    const cl = new GeoBuilder();
    cl.add(new THREE.CylinderGeometry(0.7, 0.9, 4.5, 10), DARK, { p: [WRECK.x, 12.75, WRECK.z] });
    cl.add(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 16), GOLD, { p: [WRECK.x, 10.4, WRECK.z] });
    for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        cl.add(new THREE.BoxGeometry(0.5, 3.2, 0.7), PURPLE, { p: [WRECK.x + Math.cos(a) * 2.3, 9, WRECK.z + Math.sin(a) * 2.3], r: [0, -a, 0.35], order: 'YXZ' });
    }
    cl.add(new THREE.SphereGeometry(0.6, 12, 8), 0x7dff9a, { p: [WRECK.x, 10, WRECK.z] }, 1.6);
    const clamp = ms.addMesh(cl.build(), ms.propMat, { cast: false });
    addOutline(clamp, 0x1b1030, 0.002);

    buildWreck(ms);
}

// The burning wreck of the LINCOLN-1 (shown after it blows up in the cutscene)
function buildWreck(ms) {
    const g = new THREE.Group();
    const rng = makeRng(3);
    const charred = toonMaterial({ vertexColors: true, glow: true, color: 0x8a7f88, rim: 0.3 });
    // scorch mark
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(20,10,16,0.95)');
    grd.addColorStop(0.55, 'rgba(30,14,26,0.7)');
    grd.addColorStop(1, 'rgba(30,14,26,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(WRECK.x, 0.02, WRECK.z);
    g.add(scorch);
    // big broken pieces of the ship
    const pieces = [
        ['tailFin', 6.5, 12.5, 0.9, [0.3, 0.6, 1.1]],
        ['wing', -1.5, 13, 0.4, [0.1, 2.2, 0.15]],
        ['thruster', 8, 6.5, 0.6, [1.2, 0.3, 0.2]],
        ['fuelTank', 0.2, 5.6, 0.7, [0.2, 1.1, 1.57]],
    ];
    for (const [id, px, pz, y, r] of pieces) {
        const m = buildPartModel(id, 0.9);
        m.traverse((o) => { if (o.isMesh && o.material.vertexColors) o.material = charred; });
        m.position.set(px, y, pz);
        m.rotation.set(r[0], r[1], r[2]);
        g.add(m);
        ms.colliders.add(px, pz, 1.0, y + 0.6, -10, 'wreck');
    }
    // hull chunks + the nose cone
    const b = new GeoBuilder();
    for (let i = 0; i < 10; i++) {
        const a = rng() * Math.PI * 2, d = rng.range(2, 7);
        const cx = WRECK.x + Math.cos(a) * d, cz = WRECK.z + Math.sin(a) * d;
        b.add(new THREE.BoxGeometry(rng.range(0.6, 1.6), 0.12, rng.range(0.5, 1.2)), rng() < 0.6 ? 0xeeeae2 : 0xff7a2e,
            { p: [cx, 0.1, cz], r: [rng.range(-0.3, 0.3), rng() * 3, rng.range(-0.3, 0.3)] }, 0, true);
    }
    b.add(new THREE.ConeGeometry(0.95, 2.2, 16), [0xeeeae2, (p, i, col) => col.set(p.getY(i) > 0.55 ? 0xff7a2e : 0xeeeae2)], { p: [3.8, 0.75, 10.8], r: [0, 0.5, 1.75], order: 'YXZ' });
    const chunks = new THREE.Mesh(b.build(), charred);
    chunks.castShadow = true;
    addOutline(chunks, 0x2a1424, 0.003);
    g.add(chunks);
    ms.colliders.add(3.8, 10.8, 0.9, 1.5, -10, 'wreck');
    // "LINCOLN-1" name panel lying on the floor
    const nc = document.createElement('canvas');
    nc.width = 256;
    nc.height = 64;
    const nx = nc.getContext('2d');
    nx.fillStyle = '#e8e2d8';
    nx.fillRect(0, 0, 256, 64);
    nx.font = 'bold 44px "Russo One", Arial Black, sans-serif';
    nx.textAlign = 'center';
    nx.textBaseline = 'middle';
    nx.fillStyle = '#ff7a2e';
    nx.fillText('LINCOLN-1', 128, 34);
    const ntex = new THREE.CanvasTexture(nc);
    ntex.colorSpace = THREE.SRGBColorSpace;
    const name = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshToonMaterial({ map: ntex, color: 0xb8aeb4 }));
    name.rotation.set(-Math.PI / 2 + 0.12, 0, 0.5);
    name.position.set(-0.6, 0.12, 9.6);
    g.add(name);
    ms.scene.add(g);
    ms.wreck = g;

    // flames + smoke
    const fx = ms.game.effects;
    ms.wreckFires = [];
    for (const [fx0, fz0, s] of [[5.5, 11.5, 1.2], [1.0, 8.4, 1.0], [7.2, 7.4, 0.8], [2.6, 12.8, 0.7]]) {
        ms.wreckFires.push(fx.addEmitter({
            rate: 12 * s, on: false,
            emit: (e) => e.spawn({
                x: fx0 + rand(-0.5, 0.5), y: 0.4, z: fz0 + rand(-0.5, 0.5),
                vx: rand(-0.3, 0.3), vy: rand(1.5, 3), vz: rand(-0.3, 0.3),
                life: rand(0.5, 0.9), size: rand(0.7, 1.2) * s, size1: 0.2,
                color: 0xffd36a, color1: 0xff5a2a, alpha: 1, alpha1: 0, batch: 1,
            }),
        }));
        ms.wreckFires.push(fx.addEmitter({
            rate: 3 * s, on: false,
            emit: (e) => e.spawn({
                x: fx0 + rand(-0.4, 0.4), y: 1.2, z: fz0 + rand(-0.4, 0.4),
                vx: rand(-0.4, 0.4), vy: rand(1.6, 2.6), vz: rand(-0.4, 0.4),
                life: rand(3.5, 5), size: rand(0.8, 1.2) * s, size1: rand(4, 6) * s,
                color: 0x3e3640, color1: 0x8a7a90, alpha: 0.75, alpha1: 0, drag: 0.4, grav: -0.1, fadeIn: 0.4,
            }),
        }));
    }
    ms.setWreck = (on) => {
        g.visible = on;
        for (const e of ms.wreckFires) e.on = on;
    };
    ms.setWreck(true);
}

// ------------------------------------------------------------
// REACTOR CORE
// ------------------------------------------------------------
function reactor(ms) {
    const H = HOLES[0];
    const prof = [
        [2.2, -10], [2.9, -8], [3.0, -1.2], [3.2, 0], [3.2, 1.4], [2.55, 1.6], [2.55, 4.2], [3.2, 4.4], [3.2, 5.8],
        [2.55, 6.0], [2.55, 8.6], [3.2, 8.8], [3.2, 10.6], [2.55, 10.8], [2.55, 13.2], [3.2, 13.4], [3.5, 15], [4.4, 16.05],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const b = new GeoBuilder();
    b.add(new THREE.LatheGeometry(prof, 40), [DARK, (p, i, c) => {
        const r = Math.hypot(p.getX(i) - H.x, p.getZ(i) - H.z);
        if (r < 2.62) c.set(0x9ff8ff);
        else if (Math.abs(r - 3.2) < 0.02) c.set(GOLD);
        else c.set(DARK);
    }], { p: [H.x, 0, H.z] });
    // the glowing bands are the energy inside
    const geo = b.build();
    const glow = geo.attributes.glow;
    const col = geo.attributes.color;
    for (let i = 0; i < glow.count; i++) if (col.getY(i) > 0.8 && col.getZ(i) > 0.8) glow.setX(i, 1.8);
    const coreMat = toonMaterial({ vertexColors: true, glow: true, glowStrength: 1.4, cache: false });
    const column = ms.addMesh(geo, coreMat, { cast: false });
    column.receiveShadow = false;
    ms.glowPulse = { mat: coreMat, base: 1.4, amp: 0.45, speed: 3.2 };
    ms.colliders.add(H.x, H.z, H.solidR + 0.1, 40, -20, 'reactor');
    // spinning rings
    const ringMat = vcMat({ rim: 0.6 });
    for (const [y, tilt, speed] of [[2.9, 0.18, 0.9], [7.3, -0.22, -1.2], [11.9, 0.14, 0.7]]) {
        const rb = new GeoBuilder();
        rb.add(new THREE.TorusGeometry(4.4, 0.22, 8, 64), GOLD, {});
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            rb.add(new THREE.SphereGeometry(0.3, 10, 8), CYAN, { p: [Math.cos(a) * 4.4, Math.sin(a) * 4.4, 0] }, 1.6);
        }
        const ring = new THREE.Mesh(rb.build(), ringMat);
        const holder = new THREE.Group();
        holder.position.set(H.x, y, H.z);
        holder.rotation.x = Math.PI / 2 + tilt;
        holder.add(ring);
        ms.scene.add(holder);
        ms.spinners.push({ obj: ring, axis: 'z', speed });
    }
    // energy sparkles rising out of the shaft
    ms.game.effects.addEmitter({
        rate: 22,
        emit: (e) => {
            const a = Math.random() * Math.PI * 2, r = rand(3.4, 5.6);
            e.spawn({
                x: H.x + Math.cos(a) * r, y: -8, z: H.z + Math.sin(a) * r,
                vx: 0, vy: rand(3, 6), vz: 0,
                life: rand(2, 3.2), size: rand(0.12, 0.25), size1: 0.05,
                color: 0x9ff8ff, color1: 0x6f9bff, alpha: 1, alpha1: 0, batch: 1, stretch: 0.06,
            });
        },
    });
    // big conduits from the column to the walls
    const cb = new GeoBuilder();
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.26;
        const r0 = 3.6, r1 = 17.5, y = 13.6;
        const len = r1 - r0;
        const mx = H.x + Math.cos(a) * (r0 + len / 2), mz = H.z + Math.sin(a) * (r0 + len / 2);
        cb.add(new THREE.CylinderGeometry(0.45, 0.45, len, 10), DARK, { p: [mx, y, mz], r: [0, -a, Math.PI / 2], order: 'YXZ' });
        for (let j = 1; j < 4; j++) {
            const rr = r0 + (len * j) / 4;
            cb.add(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 10), GOLD, { p: [H.x + Math.cos(a) * rr, y, H.z + Math.sin(a) * rr], r: [0, -a, Math.PI / 2], order: 'YXZ' });
        }
        cb.add(new THREE.CylinderGeometry(0.2, 0.2, len, 8), CYAN, { p: [mx, y - 0.48, mz], r: [0, -a, Math.PI / 2], order: 'YXZ' }, 1.3);
    }
    // glowing rings on the floor
    floorRing(cb, H.x, H.z, 8.8, 9.1, CYAN, 1.1, 96);
    floorRing(cb, H.x, H.z, 14.4, 14.6, CYAN, 0.9, 96);
    ms.addMesh(cb.build(), ms.archMat, { cast: false });
    // control consoles by the walls
    for (const deg of [35, -30, -90, -150, 145]) {
        const a = (deg * Math.PI) / 180;
        const r = 16;
        const x = H.x + Math.cos(a) * r, z = H.z + Math.sin(a) * r;
        place(ms, makeConsole(), x, z, Math.atan2(-Math.cos(a), -Math.sin(a)));
        ms.colliders.add(x, z, 0.95, 1.15, -10, 'console');
    }
}

// Alien control console with a glowing screen of squiggly alien writing
let _glyphTex = null;
function glyphTexture() {
    if (_glyphTex) return _glyphTex;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#0d1430';
    x.fillRect(0, 0, 128, 96);
    const rng = makeRng(9);
    x.strokeStyle = '#6ff0ff';
    x.lineWidth = 3;
    for (let row = 0; row < 5; row++) {
        let px = 10;
        while (px < 110) {
            const w = rng.range(6, 16);
            x.beginPath();
            x.moveTo(px, 16 + row * 16);
            x.quadraticCurveTo(px + w / 2, 6 + row * 16 + rng.range(0, 12), px + w, 16 + row * 16);
            x.stroke();
            px += w + rng.range(4, 9);
        }
    }
    x.fillStyle = '#ff6be8';
    x.fillRect(96, 70, 22, 16);
    _glyphTex = new THREE.CanvasTexture(c);
    _glyphTex.colorSpace = THREE.SRGBColorSpace;
    return _glyphTex;
}

function makeConsole() {
    const b = new GeoBuilder();
    b.add(new THREE.CylinderGeometry(0.55, 0.75, 0.9, 8), DARK, { p: [0, 0.45, 0] });
    b.add(new THREE.BoxGeometry(1.5, 0.16, 0.9), PURPLE, { p: [0, 0.98, -0.05], r: [0.35, 0, 0] });
    b.add(new THREE.BoxGeometry(1.56, 0.06, 0.12), GOLD, { p: [0, 1.06, -0.48], r: [0.35, 0, 0] });
    for (let i = 0; i < 4; i++) b.add(new THREE.SphereGeometry(0.06, 8, 6), [CYAN, MAGENTA, 0x7dff9a, GOLD][i], { p: [-0.5 + i * 0.33, 1.12, 0.25], s: [1, 0.5, 1] }, 1.5);
    const g = new THREE.Group();
    const m = new THREE.Mesh(b.build(), vcMat({ rim: 0.4 }));
    m.castShadow = true;
    addOutline(m, 0x1b1030, 0.0025);
    g.add(m);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshBasicMaterial({ map: glyphTexture() }));
    scr.position.set(0, 1.55, -0.32);
    scr.rotation.x = -0.25;
    g.add(scr);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 0.08), toonMaterial({ color: DARK }));
    back.position.set(0, 1.55, -0.37);
    back.rotation.x = -0.25;
    g.add(back);
    return g;
}

// ------------------------------------------------------------
// SPECIMEN LAB: glass tubes full of goo and very confused critters
// ------------------------------------------------------------
function lab(ms) {
    const R = ROOMS[2];
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const gooMat = new THREE.MeshBasicMaterial({ color: 0x5aff9a, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending });
    const tubes = [
        [R.x - 12, R.z - 6, createBlob, 0x7dff6a],
        [R.x - 12, R.z, createCow, 0x6fd8ff],
        [R.x - 12, R.z + 6, createSpaceRock, 0xffa64a],
        [R.x + 12, R.z - 6, createDuck, 0xffe066],
        [R.x + 12, R.z, createFish, 0x6fd8ff],
        [R.x + 12, R.z + 6, createBlob, 0xff6be8],
    ];
    const b = new GeoBuilder();
    for (const [x, z, make, tint] of tubes) {
        b.add(new THREE.CylinderGeometry(1.45, 1.6, 0.6, 20), DARK, { p: [x, 0.3, z] });
        b.add(new THREE.CylinderGeometry(1.5, 1.5, 0.14, 20), GOLD, { p: [x, 0.62, z] });
        b.add(new THREE.CylinderGeometry(1.35, 1.45, 0.5, 20), DARK, { p: [x, 4.95, z] });
        b.add(new THREE.CylinderGeometry(1.4, 1.4, 0.12, 20), GOLD, { p: [x, 4.66, z] });
        b.add(new THREE.CircleGeometry(1.15, 20), tint, { p: [x, 0.7, z], r: [-Math.PI / 2, 0, 0] }, 1.4);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4.0, 24, 1, true), glassMat);
        glass.position.set(x, 2.7, z);
        glass.renderOrder = 14;
        ms.scene.add(glass);
        const goo = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 3.9, 20, 1, true), gooMat);
        goo.position.set(x, 2.68, z);
        goo.renderOrder = 13;
        ms.scene.add(goo);
        const critter = make();
        const holder = new THREE.Group();
        holder.position.set(x, 2.6, z);
        holder.add(critter);
        holder.rotation.y = Math.random() * 6;
        ms.scene.add(holder);
        if (make === createCow) critter.scale.setScalar(1.05);
        ms.spinners.push({ obj: holder, axis: 'y', speed: 0.25 + Math.random() * 0.2 });
        ms.bobbers = ms.bobbers || [];
        ms.bobbers.push({ obj: holder, y: 2.6, amp: 0.18, speed: 0.8 + Math.random() * 0.4, phase: Math.random() * 6 });
        const gl = glowSprite(tint, 3.2, 0.35);
        gl.position.set(x, 2.4, z);
        ms.scene.add(gl);
        ms.colliders.add(x, z, 1.55, 5.2, -10, 'tube');
        ms.game.effects.addEmitter({
            rate: 2.5,
            emit: (e) => e.spawn({
                x: x + rand(-0.8, 0.8), y: 0.9, z: z + rand(-0.8, 0.8), vy: rand(0.6, 1.0),
                life: 3.6, size: rand(0.06, 0.14), size1: 0.18, color: 0xd8fff4, alpha: 0.7, alpha1: 0.2, batch: 1,
            }),
        });
    }
    // lab tables with bubbling beakers, and a hologram of home
    for (const [x, z] of [[R.x - 4.5, R.z - 1], [R.x + 4.5, R.z + 1]]) {
        b.add(new THREE.CylinderGeometry(1.5, 1.2, 1.0, 16), DARK, { p: [x, 0.5, z] });
        b.add(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 16), PURPLE, { p: [x, 1.06, z] });
        b.add(new THREE.TorusGeometry(1.6, 0.05, 6, 32), CYAN, { p: [x, 1.1, z], r: [Math.PI / 2, 0, 0] }, 1.3);
        for (let k = 0; k < 4; k++) {
            const a = k * 1.7 + x;
            const bx = x + Math.cos(a) * 0.9, bz = z + Math.sin(a) * 0.9;
            b.add(new THREE.CylinderGeometry(0.14, 0.16, 0.45, 10), 0xd8f6ff, { p: [bx, 1.35, bz] }, 0.2);
            b.add(new THREE.CylinderGeometry(0.13, 0.15, 0.26, 10), [0x7dff6a, 0xff6be8, CYAN, 0xffd166][k], { p: [bx, 1.25, bz] }, 1.4);
        }
        ms.colliders.add(x, z, 1.65, 1.15, -10, 'table');
    }
    ms.addMesh(b.build(), ms.propMat);
    // hologram: Earth and the Moon, spinning
    const holo = new THREE.Group();
    holo.position.set(R.x + 4.5, 2.5, R.z + 1);
    const hmat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
    const earth = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), hmat(0x6fd8ff));
    holo.add(earth);
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 1), hmat(0xd8e8ff));
    moon.position.set(1.1, 0.2, 0);
    holo.add(moon);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.3, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = -0.75;
    beam.rotation.x = Math.PI;
    holo.add(beam);
    ms.scene.add(holo);
    ms.spinners.push({ obj: holo, axis: 'y', speed: 0.6 });
}

// ------------------------------------------------------------
// COMMAND BRIDGE
// ------------------------------------------------------------
function bridge(ms) {
    const R = ROOMS[3];
    const W = BRIDGE_WINDOW;
    // glass + window frame bars
    const ang0 = W.a0, ang1 = W.a1;
    // build the glass strip by hand (an arc of quads)
    const pts = [];
    const segs = 40;
    for (let i = 0; i <= segs; i++) {
        const a = ang0 + ((ang1 - ang0) * i) / segs;
        pts.push([R.x + Math.cos(a) * (R.r + 0.04), R.z + Math.sin(a) * (R.r + 0.04)]);
    }
    const pos = [];
    for (let i = 0; i < segs; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        pos.push(x0, W.sill, z0, x1, W.sill, z1, x1, W.top, z1, x0, W.sill, z0, x1, W.top, z1, x0, W.top, z0);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const glass = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    glass.renderOrder = 14;
    ms.scene.add(glass);
    const b = new GeoBuilder();
    const nBars = 7;
    for (let i = 0; i <= nBars; i++) {
        const a = ang0 + ((ang1 - ang0) * i) / nBars;
        const x = R.x + Math.cos(a) * (R.r - 0.1), z = R.z + Math.sin(a) * (R.r - 0.1);
        b.add(new THREE.BoxGeometry(0.4, W.top - W.sill, 0.5), GOLD, { p: [x, (W.top + W.sill) / 2, z], r: [0, -a, 0] });
    }
    for (const y of [W.sill + 0.05, (W.sill + W.top) * 0.55]) {
        for (let i = 0; i < 24; i++) {
            const a = ang0 + ((ang1 - ang0) * (i + 0.5)) / 24;
            const x = R.x + Math.cos(a) * (R.r - 0.1), z = R.z + Math.sin(a) * (R.r - 0.1);
            b.add(new THREE.BoxGeometry(0.2, 0.22, (R.r * (ang1 - ang0)) / 24 + 0.05), DARK, { p: [x, y, z], r: [0, -a, 0] });
        }
    }
    // captain's dais + big throne, facing the window
    const mid = (ang0 + ang1) / 2;
    const fx = Math.cos(mid), fz = Math.sin(mid);
    b.add(new THREE.CylinderGeometry(3.2, 3.4, 0.25, 32), DARK, { p: [R.x, 0.12, R.z] });
    b.add(new THREE.CylinderGeometry(2.6, 2.8, 0.25, 32), PURPLE, { p: [R.x, 0.37, R.z] });
    b.add(new THREE.TorusGeometry(3.25, 0.06, 6, 48), CYAN, { p: [R.x, 0.26, R.z], r: [Math.PI / 2, 0, 0] }, 1.3);
    const yaw = Math.atan2(-fx, -fz);
    const m4 = new THREE.Matrix4().makeRotationY(yaw).setPosition(R.x, 0.5, R.z);
    b.add(new THREE.BoxGeometry(1.4, 0.5, 1.3), PURPLE, { p: [0, 0.45, 0], matrix: m4 });
    b.add(new THREE.BoxGeometry(1.5, 2.8, 0.35), DARK, { p: [0, 1.8, 0.62], r: [-0.12, 0, 0], matrix: m4 });
    b.add(new THREE.ConeGeometry(0.22, 0.9, 6), GOLD, { p: [-0.55, 3.5, 0.75], r: [-0.1, 0, 0.25], matrix: m4 });
    b.add(new THREE.ConeGeometry(0.22, 0.9, 6), GOLD, { p: [0.55, 3.5, 0.75], r: [-0.1, 0, -0.25], matrix: m4 });
    b.add(new THREE.ConeGeometry(0.28, 1.2, 6), GOLD, { p: [0, 3.7, 0.72], r: [-0.1, 0, 0], matrix: m4 });
    b.add(new THREE.OctahedronGeometry(0.3, 0), MAGENTA, { p: [0, 2.6, 0.42], matrix: m4 }, 1.5);
    for (const sx of [-1, 1]) {
        b.add(new THREE.BoxGeometry(0.3, 0.7, 1.2), DARK, { p: [sx * 0.85, 0.85, 0.05], matrix: m4 });
        b.add(new THREE.SphereGeometry(0.12, 8, 6), CYAN, { p: [sx * 0.85, 1.25, -0.45], matrix: m4 }, 1.5);
    }
    const throne = ms.addMesh(b.build(), ms.propMat, { cast: true });
    addOutline(throne, 0x1b1030, 0.0018);
    ms.colliders.add(R.x, R.z, 3.3, 0.5, -10, 'dais');
    ms.colliders.add(R.x - fx * 0.3, R.z - fz * 0.3, 1.0, 3.0, 0.4, 'throne');
    // consoles in a curve facing the window
    for (let i = 0; i < 5; i++) {
        const a = ang0 + 0.3 + ((ang1 - ang0 - 0.6) * i) / 4;
        const x = R.x + Math.cos(a) * 13.5, z = R.z + Math.sin(a) * 13.5;
        place(ms, makeConsole(), x, z, Math.atan2(-Math.cos(a), -Math.sin(a)));
        ms.colliders.add(x, z, 0.95, 1.15, -10, 'console');
    }
}

// ------------------------------------------------------------
// THE CREATURE PIT: big organic pillars and bone tusks around the pit
// ------------------------------------------------------------
function pit(ms) {
    const H = HOLES[1];
    const R = ROOMS[4];
    const b = new GeoBuilder();
    const prof = [
        [2.3, 0], [1.8, 0.8], [1.5, 2.5], [1.75, 5], [1.45, 8], [1.6, 11], [1.4, 14], [1.8, 17.5], [2.6, 20.05],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    for (const deg of [-145, -35, 20, 62, 160]) {
        const a = (deg * Math.PI) / 180;
        const x = R.x + Math.cos(a) * 19.5, z = R.z + Math.sin(a) * 19.5;
        b.add(new THREE.LatheGeometry(prof, 30), [0x5a2050, (p, i, c) => {
            const ang = Math.atan2(p.getZ(i) - z, p.getX(i) - x);
            const vein = Math.sin(ang * 3 + p.getY(i) * 0.3);
            c.set(vein > 0.975 ? 0xff8a4a : p.getY(i) < 0.9 ? 0x3a1438 : 0x5a2050);
        }], { p: [x, 0, z] });
        b.add(new THREE.TorusGeometry(1.75, 0.16, 8, 24), GOLD, { p: [x, 5, z], r: [Math.PI / 2, 0, 0] });
        ms.colliders.add(x, z, 1.85, 30, -10, 'pillar');
    }
    const geo = b.build();
    const gl = geo.attributes.glow, col = geo.attributes.color;
    for (let i = 0; i < gl.count; i++) if (col.getX(i) > 0.9 && col.getY(i) > 0.2 && col.getY(i) < 0.4) gl.setX(i, 1.5);
    ms.addMesh(geo, ms.propMat, { cast: true });
    // bone tusks curling over the pit
    const t = new GeoBuilder();
    for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const x = H.x + Math.cos(a) * (H.r - 0.1), z = H.z + Math.sin(a) * (H.r - 0.1);
        t.add(new THREE.ConeGeometry(0.22, 1.6, 8), 0xf3e8d8, { p: [x - Math.cos(a) * 0.3, H.rail + 0.55, z - Math.sin(a) * 0.3], r: [0, -a, 0.7], order: 'YXZ' });
    }
    const tusks = ms.addMesh(t.build(), ms.propMat, { cast: false });
    addOutline(tusks, 0x1b1030, 0.002);
    // goo bubbles down in the pit
    ms.game.effects.addEmitter({
        rate: 7,
        emit: (e) => {
            const a = Math.random() * Math.PI * 2, r = Math.random() * (H.r - 1);
            e.spawn({
                x: H.x + Math.cos(a) * r, y: H.floor + 0.3, z: H.z + Math.sin(a) * r, vy: rand(1, 2.4),
                life: rand(1.2, 2), size: rand(0.4, 0.9), size1: 1.4, color: 0x9dff6a, color1: 0x4ac83a, alpha: 0.9, alpha1: 0,
            });
        },
    });
}

// ------------------------------------------------------------
// ESCAPE POD BAY
// ------------------------------------------------------------
function podBay(ms) {
    const R = ROOMS[5];
    const pod = createEscapePod();
    pod.root.position.set(POD.x, 1.75, POD.z);
    ms.scene.add(pod.root);
    ms.pod = pod;
    ms.colliders.add(POD.x, POD.z - 1, 1.5, 3.1, -10, 'pod');
    ms.colliders.add(POD.x, POD.z + 1.2, 1.5, 3.1, -10, 'pod');
    const b = new GeoBuilder();
    // launch cradle rails
    for (const sx of [-1, 1]) {
        b.add(new THREE.BoxGeometry(0.35, 0.5, 8.5), DARK, { p: [POD.x + sx * 0.9, 0.25, POD.z - 1.5] });
        b.add(new THREE.BoxGeometry(0.4, 0.1, 8.5), CYAN, { p: [POD.x + sx * 0.9, 0.52, POD.z - 1.5] }, 1.3);
        b.add(new THREE.BoxGeometry(0.4, 1.2, 0.5), GOLD, { p: [POD.x + sx * 1.1, 0.75, POD.z + 0.8], r: [0, 0, sx * -0.4] });
        b.add(new THREE.BoxGeometry(0.4, 1.2, 0.5), GOLD, { p: [POD.x + sx * 1.1, 0.75, POD.z - 1.2], r: [0, 0, sx * -0.4] });
    }
    // the round launch hatch in the end wall
    const hz = R.z - R.hz + 0.15;
    b.add(new THREE.TorusGeometry(2.6, 0.38, 10, 40), GOLD, { p: [POD.x, 2.75, hz] });
    b.add(new THREE.TorusGeometry(2.25, 0.1, 6, 40), 0x7dff9a, { p: [POD.x, 2.75, hz + 0.1] }, 1.5);
    ms.addMesh(b.build(), ms.propMat);
    const hatch = new THREE.Group();
    hatch.position.set(POD.x, 2.75, hz);
    const blades = [];
    for (let k = 0; k < 6; k++) {
        const bl = new THREE.Mesh(new THREE.CircleGeometry(2.3, 3, 0, Math.PI / 3), toonMaterial({ color: k % 2 ? 0x5a4294 : 0x4a3584 }));
        bl.rotation.z = (k / 6) * Math.PI * 2;
        hatch.add(bl);
        blades.push(bl);
    }
    ms.scene.add(hatch);
    // the launch tube behind the hatch (dark, with lights going away into it)
    const tube = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), new THREE.MeshBasicMaterial({ color: 0x07040f }));
    tube.position.set(POD.x, 2.75, hz - 0.06);
    ms.scene.add(tube);
    for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.4 - i * 0.35, 1.5 - i * 0.35, 32), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.8 - i * 0.25 }));
        ring.position.set(POD.x, 2.75, hz - 0.04);
        ms.scene.add(ring);
    }
    ms.podHatch = { group: hatch, blades, open: 0 };
    // arrows on the floor pointing at the pod, and a beacon above it
    const fa = new GeoBuilder();
    for (let i = 0; i < 4; i++) {
        const z = R.z + R.hz - 2.2 - i * 1.7;
        const sh = new THREE.Shape();
        sh.moveTo(-0.9, 0); sh.lineTo(0, -0.8); sh.lineTo(0.9, 0); sh.lineTo(0.9, 0.35); sh.lineTo(0, -0.45); sh.lineTo(-0.9, 0.35);
        sh.closePath();
        fa.add(new THREE.ShapeGeometry(sh), 0x7dff9a, { p: [POD.x, 0.02, z], r: [-Math.PI / 2, 0, 0] }, 1.2);
    }
    ms.addMesh(fa.build(), ms.archMat, { cast: false });
    const beacon = glowSprite(0x7dff9a, 3.4, 0.6);
    beacon.position.set(POD.x, 4.6, POD.z);
    ms.scene.add(beacon);
    ms.pulsers.push({ obj: beacon.material, base: 0.5, amp: 0.3, speed: 4 });
}

// ------------------------------------------------------------
// HALLS: a glowing guide line down the middle of the floor
// ------------------------------------------------------------
function halls(ms) {
    const b = new GeoBuilder();
    for (const h of HALLS) {
        const dx = h.bx - h.ax, dz = h.bz - h.az;
        const L = Math.hypot(dx, dz);
        b.add(new THREE.PlaneGeometry(L, 0.16), CYAN, { p: [(h.ax + h.bx) / 2, 0.02, (h.az + h.bz) / 2], r: [-Math.PI / 2, 0, -Math.atan2(dz, dx)] }, 1.1);
        for (const sx of [-1, 1]) {
            const px = -dz / L, pz = dx / L;
            b.add(new THREE.PlaneGeometry(L, 0.08), MAGENTA, { p: [(h.ax + h.bx) / 2 + px * sx * 1.6, 0.02, (h.az + h.bz) / 2 + pz * sx * 1.6], r: [-Math.PI / 2, 0, -Math.atan2(dz, dx)] }, 0.8);
        }
    }
    ms.addMesh(b.build(), ms.archMat, { cast: false });
}
