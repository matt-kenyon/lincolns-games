// ============================================================
// THE MOTHERSHIP — level 2's world: curvy alien halls, force-field
// doors, the reactor, the specimen lab, the bridge, the creature pit
// and the escape pod bay. It has the same "world" interface as
// world.js (Mars), so the player, aliens and bolts work in both.
// ============================================================

import * as THREE from 'three';
import { Colliders } from './terrain.js';
import { toonMaterial, GeoBuilder, vcMat, addOutline, glowSprite } from './toon.js';
import {
    SHAPES, HALLS, HOLES, DOORS, HANGAR_OPENING, BRIDGE_WINDOW, BOUNDS, ZONES,
    shipQuery, ceilingAt,
} from './shiplayout.js';
import { shieldMaterial } from './world.js';
import { createNebula, createStars, createPlanet } from './models.js';
import { buildShipProps } from './shipprops.js';
import { clamp } from './util.js';

// Light comes from "above" (the ceiling lights)
export const SHIP_SUN = new THREE.Vector3(0.32, 1, 0.22).normalize();

// Alien purples, gold trim, glowing cyan
export const SHIP_COLORS = {
    base: 0x2a1c4a,
    dark: 0x3e2b6e,
    panel: 0x6a4fb0,
    cove: 0x8a70d4,
    rib: 0x4b3584,
    ceiling: 0x3c2d6c,
    gold: 0xf2c14e,
    cyan: 0x6ff0ff,
    magenta: 0xff6be8,
    floor: 0x5a4c8c,
};
// The creature pit is redder and spookier
const PIT_COLORS = { base: 0x2e1430, dark: 0x4a1d4a, panel: 0x7a2f6e, cove: 0x9a4a86, glow: 0xff7a4a };

const _q = {};
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

// Distance to the nearest wall, ignoring holes (negative = inside a room or hall)
function sdUnion(x, z) {
    let best = Infinity;
    for (const s of SHAPES) {
        const d = s.sd(x, z);
        if (d < best) best = d;
    }
    return best;
}

// Turn a geometry inside out (so you see it from the inside)
export function insideOut(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i += 3) {
        for (const a of [p, n, uv]) {
            if (!a) continue;
            for (let c = 0; c < a.itemSize; c++) {
                const t = a.array[(i + 1) * a.itemSize + c];
                a.array[(i + 1) * a.itemSize + c] = a.array[(i + 2) * a.itemSize + c];
                a.array[(i + 2) * a.itemSize + c] = t;
            }
        }
    }
    for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
    return g;
}

// ------------------------------------------------------------
// Collects triangles (position, normal, color, glow) for one merged mesh
// ------------------------------------------------------------
class MeshAcc {
    constructor() {
        this.p = [];
        this.n = [];
        this.c = [];
        this.g = [];
    }

    // Quad a-b-c-d with per-corner normals. Flips the winding so the front faces along the normals.
    quad(a, b, c, d, na, nb, nc, nd, color, glow = 0) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const flip = cx * (na[0] + nc[0]) + cy * (na[1] + nc[1]) + cz * (na[2] + nc[2]) < 0;
        _c.set(color);
        const push = (p, n) => {
            this.p.push(p[0], p[1], p[2]);
            this.n.push(n[0], n[1], n[2]);
            this.c.push(_c.r, _c.g, _c.b);
            this.g.push(glow);
        };
        if (!flip) {
            push(a, na); push(b, nb); push(c, nc);
            push(a, na); push(c, nc); push(d, nd);
        } else {
            push(a, na); push(c, nc); push(b, nb);
            push(a, na); push(d, nd); push(c, nc);
        }
    }

    get empty() {
        return this.p.length === 0;
    }

    build() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
        geo.setAttribute('glow', new THREE.Float32BufferAttribute(this.g, 1));
        geo.computeBoundingSphere();
        return geo;
    }
}

// ------------------------------------------------------------
// Outlines: points around a room/hall with the normal pointing into it
// ------------------------------------------------------------
function outlineOf(s, step = 0.8) {
    const pts = [];
    const add = (x, z, nx, nz) => pts.push({ x, z, nx, nz });
    if (s.kind === 'circle') {
        const n = Math.max(24, Math.ceil((Math.PI * 2 * s.r) / step));
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            add(s.x + Math.cos(a) * s.r, s.z + Math.sin(a) * s.r, -Math.cos(a), -Math.sin(a));
        }
    } else if (s.kind === 'rect') {
        const ix = s.hx - s.r, iz = s.hz - s.r;
        const corners = [[ix, iz], [-ix, iz], [-ix, -iz], [ix, -iz]];
        for (let k = 0; k < 4; k++) {
            const [cx, cz] = corners[k];
            const arcN = Math.max(3, Math.ceil((s.r * Math.PI / 2) / step));
            for (let i = 0; i < arcN; i++) {
                const a = (k + i / arcN) * Math.PI / 2;
                add(s.x + cx + Math.cos(a) * s.r, s.z + cz + Math.sin(a) * s.r, -Math.cos(a), -Math.sin(a));
            }
            // straight edge to the next corner
            const a1 = (k + 1) * Math.PI / 2;
            const [nx2, nz2] = corners[(k + 1) % 4];
            const sx = s.x + cx + Math.cos(a1) * s.r, sz = s.z + cz + Math.sin(a1) * s.r;
            const ex = s.x + nx2 + Math.cos(a1) * s.r, ez = s.z + nz2 + Math.sin(a1) * s.r;
            const len = Math.hypot(ex - sx, ez - sz);
            const m = Math.max(1, Math.ceil(len / step));
            for (let i = 0; i < m; i++) {
                const t = i / m;
                add(sx + (ex - sx) * t, sz + (ez - sz) * t, -Math.cos(a1), -Math.sin(a1));
            }
        }
    } else {
        // hall: two long sides + round caps
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const L = Math.hypot(dx, dz);
        const ux = dx / L, uz = dz / L;
        const px = -uz, pz = ux;
        const m = Math.max(1, Math.ceil(L / step));
        const capN = Math.max(6, Math.ceil((Math.PI * s.hw) / step));
        for (let i = 0; i < m; i++) {
            const t = (i / m) * L;
            add(s.ax + ux * t + px * s.hw, s.az + uz * t + pz * s.hw, -px, -pz);
        }
        const a0 = Math.atan2(pz, px);
        for (let i = 0; i < capN; i++) {
            const a = a0 - (i / capN) * Math.PI;
            add(s.bx + Math.cos(a) * s.hw, s.bz + Math.sin(a) * s.hw, -Math.cos(a), -Math.sin(a));
        }
        for (let i = 0; i < m; i++) {
            const t = L - (i / m) * L;
            add(s.ax + ux * t - px * s.hw, s.az + uz * t - pz * s.hw, px, pz);
        }
        const a1 = Math.atan2(-pz, -px);
        for (let i = 0; i < capN; i++) {
            const a = a1 - (i / capN) * Math.PI;
            add(s.ax + Math.cos(a) * s.hw, s.az + Math.sin(a) * s.hw, -Math.cos(a), -Math.sin(a));
        }
    }
    return pts;
}

// Wall cross-section: bands from the floor up to the ceiling
// (o = how far the surface sits back into the wall, y = height)
function wallProfile(H, pit) {
    const k = Math.min(1, H / 9);
    const C = pit ? PIT_COLORS : SHIP_COLORS;
    const glowCol = pit ? PIT_COLORS.glow : SHIP_COLORS.cyan;
    return [
        { o0: 0, y0: 0, o1: 0, y1: 0.42, color: C.base },
        { o0: 0, y0: 0.42, o1: 0.14, y1: 0.56, color: C.base },
        { o0: 0.14, y0: 0.56, o1: 0.14, y1: 0.98, color: C.dark },
        { o0: 0.14, y0: 0.98, o1: 0.14, y1: 1.16, color: glowCol, glow: 1.5 },
        { o0: 0.14, y0: 1.16, o1: 0.02, y1: H * 0.56, color: C.panel },
        { o0: 0.02, y0: H * 0.56, o1: -0.08, y1: H * 0.56 + 0.22, color: C.dark },
        { o0: -0.08, y0: H * 0.56 + 0.22, o1: -0.75 * k, y1: H * 0.82, color: C.cove },
        { o0: -0.75 * k, y0: H * 0.82, o1: -1.7 * k, y1: H, color: C.cove },
    ];
}

// Clip a profile band to a height range
function clipBand(b, lo, hi) {
    if (b.y1 <= lo || b.y0 >= hi) return null;
    const t0 = b.y0 < lo ? (lo - b.y0) / (b.y1 - b.y0) : 0;
    const t1 = b.y1 > hi ? (hi - b.y0) / (b.y1 - b.y0) : 1;
    return {
        ...b,
        o0: b.o0 + (b.o1 - b.o0) * t0, y0: b.y0 + (b.y1 - b.y0) * t0,
        o1: b.o0 + (b.o1 - b.o0) * t1, y1: b.y0 + (b.y1 - b.y0) * t1,
    };
}

// ============================================================
export class Mothership {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.colliders = new Colliders(10);
        this.gates = [];
        this.dome = { on: false };
        this.time = 0;
        this.spinners = [];
        this.pulsers = [];
        this.doorLights = [];
    }

    get sunDir() {
        return SHIP_SUN;
    }

    build(progress = () => {}) {
        progress(0.1, 'Boarding the mothership...');
        this.buildSpace();
        this.buildLights();
        this.wallMat = toonMaterial({ vertexColors: true, glow: true, glowStrength: 1.2 });
        this.floorMat = toonMaterial({ color: SHIP_COLORS.floor, hex: 0.7, hexGlow: 0x3fb8ff });
        this.pitFloorMat = toonMaterial({ color: 0x6a3a72, hex: 0.7, hexGlow: 0xff6a3a });
        this.ceilMat = toonMaterial({ vertexColors: true, glow: true, glowStrength: 1.3 });
        // flat architecture has no rim light (it would wash out flat tops); props get some
        this.archMat = toonMaterial({ vertexColors: true, glow: true, glowStrength: 1.3 });
        this.propMat = vcMat({ rim: 0.45 });
        progress(0.3, 'Building alien hallways...');
        this.buildFloors();
        this.buildWalls();
        this.buildCeilings();
        this.buildHoles();
        progress(0.6, 'Powering up force fields...');
        this.buildDoors();
        this.buildHangarMouth();
        this.buildPads();
        progress(0.75, 'Filling the specimen lab...');
        buildShipProps(this);
        progress(0.95, 'Almost there...');
    }

    // --------------------------------------------------------
    // The "world" interface (same methods as world.js)
    // --------------------------------------------------------
    groundAt(x, z) {
        const q = shipQuery(x, z, _q);
        return q.hole && !(q.hole.solidR && q.hole.r - q.holeD < q.hole.solidR) ? q.hole.floor : 0;
    }

    normalAt(x, z, out = new THREE.Vector3()) {
        return out.set(0, 1, 0);
    }

    ceilingAt(x, z) {
        return ceilingAt(x, z);
    }

    zoneAt(x, z) {
        return shipQuery(x, z, _q).zone;
    }

    // Push a circle back inside the rooms (and out of holes). Returns the area it's in.
    confinePlayer(pos, radius) {
        this.confine(pos, radius + 0.05);
        return shipQuery(pos.x, pos.z, _q).zone;
    }

    confineAlien(pos, radius) {
        this.confine(pos, radius + 0.6);
    }

    confine(pos, r) {
        for (let it = 0; it < 4; it++) {
            const sd = shipQuery(pos.x, pos.z, _q).sd;
            if (sd <= -r) return;
            const e = 0.02;
            const gx = shipQuery(pos.x + e, pos.z, _q).sd - shipQuery(pos.x - e, pos.z, _q).sd;
            const gz = shipQuery(pos.x, pos.z + e, _q).sd - shipQuery(pos.x, pos.z - e, _q).sd;
            const gl = Math.hypot(gx, gz);
            if (gl < 1e-6) return;
            const push = sd + r;
            pos.x -= (gx / gl) * push;
            pos.z -= (gz / gl) * push;
        }
    }

    // Is this point inside a wall, the floor, the ceiling or the reactor?
    isSolid(x, y, z) {
        const q = shipQuery(x, z, _q);
        if (q.sdU > 0) return true;
        if (q.hole) {
            const h = q.hole;
            if (h.solidR && h.r - q.holeD < h.solidR) return true;
            if (y < h.floor) return true;
            if (y < h.rail && q.holeD < 0.4) return true;
            return y > ceilingAt(x, z);
        }
        return y < 0 || y > ceilingAt(x, z);
    }

    // Where something flying from a to b hits a wall/floor/ceiling (or null)
    solidHit(a, b) {
        if (!this.isSolid(b.x, b.y, b.z)) return null;
        let lo = 0, hi = 1;
        for (let k = 0; k < 9; k++) {
            const m = (lo + hi) * 0.5;
            if (this.isSolid(a.x + (b.x - a.x) * m, a.y + (b.y - a.y) * m, a.z + (b.z - a.z) * m)) hi = m;
            else lo = m;
        }
        return { x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo, z: a.z + (b.z - a.z) * lo, dust: false };
    }

    // Can you see from a to b? (walls, ceilings, the reactor and tall props block it)
    lineOfSight(ax, ay, az, bx, by, bz) {
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const steps = Math.ceil(len / 0.7);
        for (let k = 1; k < steps; k++) {
            const t = k / steps;
            if (this.isSolid(ax + dx * t, ay + dy * t, az + dz * t)) return false;
        }
        // pillars, crates, consoles
        for (const c of this.colliders.list) {
            if (!c.active || c.r < 0.5) continue;
            const t = clamp(((c.x - ax) * dx + (c.z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
            const px = ax + dx * t - c.x, pz = az + dz * t - c.z;
            if (px * px + pz * pz < c.r * c.r * 0.8) {
                const y = ay + dy * t;
                if (y < c.top - 0.15 && y > c.bottom) return false;
            }
        }
        return true;
    }

    // Grenades bounce off walls and the ceiling
    wallBounce(pos, vel, r) {
        const sd = sdUnion(pos.x, pos.z);
        if (sd > -r) {
            const e = 0.02;
            let nx = sdUnion(pos.x + e, pos.z) - sdUnion(pos.x - e, pos.z);
            let nz = sdUnion(pos.x, pos.z + e) - sdUnion(pos.x, pos.z - e);
            const nl = Math.hypot(nx, nz) || 1;
            nx /= nl; nz /= nl;
            pos.x -= nx * (sd + r);
            pos.z -= nz * (sd + r);
            const vn = vel.x * nx + vel.z * nz;
            if (vn > 0) { vel.x -= 1.6 * vn * nx; vel.z -= 1.6 * vn * nz; }
        }
        // the reactor column
        const q = shipQuery(pos.x, pos.z, _q);
        if (q.hole && q.hole.solidR) {
            const h = q.hole;
            const dx = pos.x - h.x, dz = pos.z - h.z;
            const d = Math.hypot(dx, dz) || 1;
            if (d < h.solidR + r) {
                pos.x = h.x + (dx / d) * (h.solidR + r);
                pos.z = h.z + (dz / d) * (h.solidR + r);
                const vn = (vel.x * dx + vel.z * dz) / d;
                if (vn < 0) { vel.x -= 1.6 * vn * dx / d; vel.z -= 1.6 * vn * dz / d; }
            }
        }
        const top = ceilingAt(pos.x, pos.z) - r;
        if (pos.y > top) {
            pos.y = top;
            if (vel.y > 0) vel.y *= -0.4;
        }
    }

    // --------------------------------------------------------
    // Force-field doors (same shape of data as the force fields on Mars)
    // --------------------------------------------------------
    blockByGates(pos, radius) {
        let hit = false;
        for (const g of this.gates) {
            if (g.open) continue;
            const dx = pos.x - g.def.x, dz = pos.z - g.def.z;
            const along = dx * g.def.tx + dz * g.def.tz;
            const lat = dx * g.def.nx + dz * g.def.nz;
            if (Math.abs(lat) > g.def.halfSpan) continue;
            if (Math.abs(along) < radius) {
                const side = along < 0 ? -1 : 1;
                const push = radius - Math.abs(along);
                pos.x += g.def.tx * push * side;
                pos.z += g.def.tz * push * side;
                hit = true;
            }
        }
        return hit;
    }

    segmentHitsGate(ax, ay, az, bx, by, bz) {
        for (const g of this.gates) {
            if (g.open) continue;
            const da = (ax - g.def.x) * g.def.tx + (az - g.def.z) * g.def.tz;
            const db = (bx - g.def.x) * g.def.tx + (bz - g.def.z) * g.def.tz;
            if ((da > 0) === (db > 0)) continue;
            const t = da / (da - db);
            const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
            const lat = (x - g.def.x) * g.def.nx + (z - g.def.z) * g.def.nz;
            if (Math.abs(lat) <= g.def.halfSpan && y < g.y + g.h) return { t, gate: g, x, y, z };
        }
        return null;
    }

    domeBlocks() {
        return false;
    }

    openGate(k, instant = false) {
        const gate = this.gates[k];
        if (!gate || gate.open) return;
        gate.open = true;
        gate.anim = instant ? 2 : 0;
        if (instant) gate.mesh.visible = false;
        this.setDoorLight(gate, true);
    }

    // Slam a door shut (the creature pit)
    closeGate(k) {
        const gate = this.gates[k];
        if (!gate || !gate.open) return;
        gate.open = false;
        gate.anim = 2;
        gate.mesh.visible = true;
        gate.mat.uniforms.uOn.value = 1;
        gate.mat.uniforms.uFlash.value = 1;
        gate.flashT = 0.6;
        this.setDoorLight(gate, false);
    }

    setDoorLight(gate, open) {
        for (const l of gate.lights) {
            l.mesh.material.color.set(open ? 0x7dff9a : 0xff4d6a);
            l.glow.material.color.set(open ? 0x7dff9a : 0xff4d6a);
        }
    }

    // --------------------------------------------------------
    // Space outside (seen through the hangar opening and the bridge window)
    // --------------------------------------------------------
    buildSpace() {
        const g = new THREE.Group();
        g.add(createNebula());
        g.add(createStars());
        const noFog = (o) => o.traverse((m) => { if (m.material) m.material.fog = false; });
        const moon = createPlanet('moon', 70);
        moon.planet.material.emissive.set(0x2a2a36); // the Moon is home: make it glow a little
        moon.position.set(-0.6, 0.12, 0.79).normalize().multiplyScalar(1000);
        noFog(moon);
        g.add(moon);
        const earth = createPlanet('earth', 40);
        earth.position.set(-0.15, 0.32, 0.94).normalize().multiplyScalar(2300);
        noFog(earth);
        g.add(earth);
        this.moon = moon;
        this.earth = earth;
        this.skyGroup = g;
        this.scene.add(g);
        this.scene.background = new THREE.Color(0x05030c);
    }

    buildLights() {
        // lots of bounced purple light inside the ship (so ceilings aren't black)
        this.hemi = new THREE.HemisphereLight(0xd8caff, 0x6e52a4, 1.8);
        this.scene.add(this.hemi);
        const sun = new THREE.DirectionalLight(0xf4ecff, 2.2);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera;
        sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45;
        sc.near = 1; sc.far = 300;
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.05;
        sun.shadow.radius = 2;
        this.sun = sun;
        this.scene.add(sun, sun.target);
        this.scene.fog = new THREE.Fog(0x241640, 50, 210);
        this._lz = SHIP_SUN.clone();
        this._lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), this._lz).normalize();
        this._ly = new THREE.Vector3().crossVectors(this._lz, this._lx);
    }

    followShadow(focus) {
        const sc = this.sun.shadow.camera;
        const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
        const u = Math.round(focus.dot(this._lx) / texel) * texel;
        const v = Math.round(focus.dot(this._ly) / texel) * texel;
        const w = focus.dot(this._lz);
        const t = this.sun.target.position;
        t.copy(this._lx).multiplyScalar(u).addScaledVector(this._ly, v).addScaledVector(this._lz, w);
        this.sun.position.copy(t).addScaledVector(SHIP_SUN, 150);
        this.sun.target.updateMatrixWorld();
    }

    addMesh(geo, mat, { cast = false, receive = true } = {}) {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = cast;
        m.receiveShadow = receive;
        this.scene.add(m);
        return m;
    }

    // --------------------------------------------------------
    // Floors: one per room/hall (halls sit a hair higher so they don't flicker)
    // --------------------------------------------------------
    buildFloors() {
        for (const s of SHAPES) {
            let geo;
            const hole = HOLES.find((h) => h.zone === s.zone && s.kind === 'circle' && h.x === s.x && h.z === s.z);
            if (s.kind === 'circle') {
                geo = hole ? new THREE.RingGeometry(hole.r - 0.02, s.r, 96, 2) : new THREE.CircleGeometry(s.r, 96);
                geo.rotateX(-Math.PI / 2);
                geo.translate(s.x, 0, s.z);
            } else if (s.kind === 'rect') {
                const sh = new THREE.Shape();
                const ix = s.hx - s.r, iz = s.hz - s.r;
                sh.moveTo(-ix, -s.hz);
                sh.lineTo(ix, -s.hz);
                sh.absarc(ix, -iz, s.r, -Math.PI / 2, 0, false);
                sh.lineTo(s.hx, iz);
                sh.absarc(ix, iz, s.r, 0, Math.PI / 2, false);
                sh.lineTo(-ix, s.hz);
                sh.absarc(-ix, iz, s.r, Math.PI / 2, Math.PI, false);
                sh.lineTo(-s.hx, -iz);
                sh.absarc(-ix, -iz, s.r, Math.PI, Math.PI * 1.5, false);
                geo = new THREE.ShapeGeometry(sh, 8);
                geo.rotateX(-Math.PI / 2);
                geo.translate(s.x, 0, s.z);
            } else {
                geo = this.hallStrip(s, 0.004 + (s.h - 5.5) * 0.15);
            }
            const mat = s.zone === 4 && s.kind === 'circle' ? this.pitFloorMat : this.floorMat;
            this.addMesh(geo, mat);
        }
    }

    // Flat strip along a hall (floor or ceiling). Ends reach a bit into the rooms,
    // or all the way around the bend where two halls meet.
    hallStrip(s, y, down = false) {
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const L = Math.hypot(dx, dz);
        const ux = dx / L, uz = dz / L;
        const ext = (x, z) => (HALLS.some((o) => o !== s && Math.hypot(x - o.ax, z - o.az) < 0.1 || o !== s && Math.hypot(x - o.bx, z - o.bz) < 0.1) ? s.hw : 0.4);
        const e0 = ext(s.ax, s.az), e1 = ext(s.bx, s.bz);
        const geo = new THREE.PlaneGeometry(L + e0 + e1, s.hw * 2);
        geo.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
        geo.rotateY(Math.atan2(-uz, ux));
        const mid = (L + e1 - e0) / 2;
        geo.translate(s.ax + ux * mid, y, s.az + uz * mid);
        return geo;
    }

    // --------------------------------------------------------
    // Walls: walk around every room and hall. Where the outline runs
    // inside another room/hall it's a doorway, so the wall only goes
    // above that doorway (a lintel) — or not at all.
    // --------------------------------------------------------
    wallSpans(s, x, z) {
        let cov = 0;
        for (const o of SHAPES) {
            if (o === s) continue;
            if (o.sd(x, z) < -0.02 && o.h > cov) cov = o.h;
        }
        if (cov >= s.h - 0.3) return [];
        const lo = cov;
        // the hangar is open to space on its south side
        if (s.zone === 0 && s.kind === 'rect') {
            const H = HANGAR_OPENING;
            if (z > H.z - 0.6 && x > H.x0 && x < H.x1) return [[H.top, s.h]];
        }
        // the bridge window
        if (s.zone === 3 && s.kind === 'circle') {
            let a = Math.atan2(z - s.z, x - s.x);
            if (a < 0) a += Math.PI * 2;
            const W = BRIDGE_WINDOW;
            if (a > W.a0 && a < W.a1 && lo === 0) return [[0, W.sill], [W.top, s.h]];
        }
        return [[lo, s.h]];
    }

    buildWalls() {
        this.wallRuns = [];
        for (const s of SHAPES) {
            const pts = outlineOf(s);
            const spans = pts.map((p) => this.wallSpans(s, p.x, p.z));
            const key = (sp) => sp.map((r) => r[0].toFixed(2) + '-' + r[1].toFixed(2)).join('|');
            // split the loop into runs with the same spans, finding the exact doorway edges
            const segs = [];
            const n = pts.length;
            for (let i = 0; i < n; i++) {
                const a = pts[i], b = pts[(i + 1) % n];
                const ka = key(spans[i]), kb = key(spans[(i + 1) % n]);
                if (ka === kb) {
                    segs.push({ a, b, spans: spans[i], k: ka });
                    continue;
                }
                let lo = 0, hi = 1;
                for (let it = 0; it < 12; it++) {
                    const m = (lo + hi) / 2;
                    const kx = key(this.wallSpans(s, a.x + (b.x - a.x) * m, a.z + (b.z - a.z) * m));
                    if (kx === ka) lo = m; else hi = m;
                }
                const t = (lo + hi) / 2;
                const mid = {
                    x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
                    nx: a.nx + (b.nx - a.nx) * t, nz: a.nz + (b.nz - a.nz) * t,
                };
                const ml = Math.hypot(mid.nx, mid.nz) || 1;
                mid.nx /= ml; mid.nz /= ml;
                segs.push({ a, b: mid, spans: spans[i], k: ka });
                segs.push({ a: mid, b, spans: spans[(i + 1) % n], k: kb });
            }
            // group consecutive segments into runs (rotate so we start at a change)
            let start = segs.findIndex((sg, i) => sg.k !== segs[(i - 1 + segs.length) % segs.length].k);
            if (start < 0) start = 0;
            const runs = [];
            let cur = null;
            for (let j = 0; j < segs.length; j++) {
                const sg = segs[(start + j) % segs.length];
                if (!cur || cur.k !== sg.k) {
                    cur = { k: sg.k, spans: sg.spans, pts: [sg.a] };
                    runs.push(cur);
                }
                cur.pts.push(sg.b);
            }
            const acc = new MeshAcc();
            const ribs = new GeoBuilder();
            const pit = s.zone === 4;
            for (const run of runs) {
                if (!run.spans.length) continue;
                this.extrudeRun(acc, run.pts, wallProfile(s.h, pit), run.spans);
                if (run.spans.length === 1 && run.spans[0][0] === 0) {
                    this.addRibs(ribs, run.pts, s, pit);
                    this.wallRuns.push({ shape: s, pts: run.pts });
                }
            }
            if (!acc.empty) this.addMesh(acc.build(), this.wallMat);
            if (ribs.chunks.length) {
                const rm = this.addMesh(ribs.build(), this.archMat, { cast: false });
                rm.userData.ribs = true;
            }
        }
    }

    extrudeRun(acc, pts, prof, spans) {
        for (const [lo, hi] of spans) {
            for (const band of prof) {
                const b = clipBand(band, lo, hi);
                if (!b) continue;
                const dO = b.o1 - b.o0, dY = b.y1 - b.y0;
                const len = Math.hypot(dO, dY) || 1;
                const n2o = -dY / len, n2y = dO / len;
                for (let i = 0; i < pts.length - 1; i++) {
                    const p = pts[i], q = pts[i + 1];
                    const A = [p.x - p.nx * b.o0, b.y0, p.z - p.nz * b.o0];
                    const B = [q.x - q.nx * b.o0, b.y0, q.z - q.nz * b.o0];
                    const Cc = [q.x - q.nx * b.o1, b.y1, q.z - q.nz * b.o1];
                    const D = [p.x - p.nx * b.o1, b.y1, p.z - p.nz * b.o1];
                    const np = [-p.nx * n2o, n2y, -p.nz * n2o];
                    const nq = [-q.nx * n2o, n2y, -q.nz * n2o];
                    acc.quad(A, B, Cc, D, np, nq, nq, np, b.color, b.glow || 0);
                }
            }
            // a glowing trim along the bottom edge of lintels (doorway tops)
            if (lo > 0) {
                for (let i = 0; i < pts.length - 1; i++) {
                    const p = pts[i], q = pts[i + 1];
                    const A = [p.x, lo, p.z], B = [q.x, lo, q.z];
                    const Cc = [q.x + q.nx * 0.12, lo + 0.18, q.z + q.nz * 0.12], D = [p.x + p.nx * 0.12, lo + 0.18, p.z + p.nz * 0.12];
                    acc.quad(A, B, Cc, D, [p.nx, -0.3, p.nz], [q.nx, -0.3, q.nz], [q.nx, -0.3, q.nz], [p.nx, -0.3, p.nz], SHIP_COLORS.gold, 0.6);
                }
            }
        }
    }

    // Arched ribs along the walls (the "inside of a giant creature" look)
    addRibs(b, pts, s, pit) {
        let dist = 0;
        const spacing = s.kind === 'hall' ? 3.2 : 5.4;
        let next = spacing * 0.5;
        // total run length (skip ribs right at the ends of a run)
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        const prof = wallProfile(s.h, pit);
        const C = pit ? PIT_COLORS : SHIP_COLORS;
        const m4 = new THREE.Matrix4();
        const xA = new THREE.Vector3(), yA = new THREE.Vector3(), zA = new THREE.Vector3();
        for (let i = 0; i < pts.length - 1; i++) {
            const p = pts[i], q = pts[i + 1];
            const sl = Math.hypot(q.x - p.x, q.z - p.z);
            while (next <= dist + sl) {
                const t = (next - dist) / (sl || 1);
                next += spacing;
                const along = next - spacing;
                if (along < 1.2 || along > total - 1.2) continue;
                const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
                let nx = p.nx + (q.nx - p.nx) * t, nz = p.nz + (q.nz - p.nz) * t;
                const nl = Math.hypot(nx, nz) || 1;
                nx /= nl; nz /= nl;
                // tangent along the wall
                const tx = -nz, tz = nx;
                // one box per profile band, sitting a little out from the wall
                for (const band of prof) {
                    if (band.y1 <= 1.16) continue;
                    const o0 = band.o0 - 0.26, o1 = band.o1 - 0.26;
                    const ax = x - nx * o0, az = z - nz * o0, bx = x - nx * o1, bz = z - nz * o1;
                    const cx = (ax + bx) / 2, cy = (band.y0 + band.y1) / 2, cz = (az + bz) / 2;
                    yA.set(bx - ax, band.y1 - band.y0, bz - az);
                    const segLen = yA.length();
                    yA.normalize();
                    xA.set(tx, 0, tz);
                    zA.crossVectors(xA, yA).normalize();
                    m4.makeBasis(xA, yA, zA).setPosition(cx, cy, cz);
                    b.add(new THREE.BoxGeometry(s.kind === 'hall' ? 0.42 : 0.62, segLen + 0.12, 0.34), pit ? C.dark : SHIP_COLORS.rib, { matrix: m4.clone() });
                }
                // base block + a glowing node
                m4.makeBasis(_v.set(tx, 0, tz), _n.set(0, 1, 0), new THREE.Vector3(-nx, 0, -nz)).setPosition(x + nx * 0.12, 0.6, z + nz * 0.12);
                b.add(new THREE.BoxGeometry(s.kind === 'hall' ? 0.6 : 0.85, 1.2, 0.5), SHIP_COLORS.gold, { matrix: m4.clone() });
                m4.setPosition(x + nx * 0.3, s.h * 0.42, z + nz * 0.3);
                b.add(new THREE.SphereGeometry(0.11, 8, 6), pit ? PIT_COLORS.glow : SHIP_COLORS.cyan, { matrix: m4.clone(), s: [1, 1.8, 1] }, 1.1);
            }
            dist += sl;
        }
    }

    // --------------------------------------------------------
    // Ceilings with glowing light panels
    // --------------------------------------------------------
    buildCeilings() {
        for (const s of SHAPES) {
            const acc = new GeoBuilder();
            const y = s.h;
            const pit = s.zone === 4 && s.kind === 'circle';
            const col = pit ? 0x4a1d4a : SHIP_COLORS.ceiling;
            const light = pit ? 0xd86a5a : 0x9fc8ee;
            const self = 0.3; // a little self-glow so ceilings read as purple, not black
            if (s.kind === 'circle') {
                acc.add(new THREE.CircleGeometry(s.r, 64), col, { p: [s.x, y, s.z], r: [Math.PI / 2, 0, 0] }, self);
                const n = Math.max(6, Math.round(s.r / 2.4));
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * Math.PI * 2;
                    const rr = s.r * 0.55;
                    acc.add(new THREE.CircleGeometry(0.9, 6), light, { p: [s.x + Math.cos(a) * rr, y - 0.05, s.z + Math.sin(a) * rr], r: [Math.PI / 2, 0, a] }, 1.0);
                }
                acc.add(new THREE.RingGeometry(s.r * 0.22, s.r * 0.25, 48), light, { p: [s.x, y - 0.05, s.z], r: [Math.PI / 2, 0, 0] }, pit ? 0.4 : 1.0);
            } else if (s.kind === 'rect') {
                acc.add(new THREE.PlaneGeometry(s.hx * 2, s.hz * 2), col, { p: [s.x, y, s.z], r: [Math.PI / 2, 0, 0] }, self);
                const nx = Math.max(1, Math.round(s.hx / 6)), nz = Math.max(1, Math.round(s.hz / 6));
                for (let i = 0; i < nx; i++) {
                    for (let j = 0; j < nz; j++) {
                        const px = s.x - s.hx + (i + 0.5) * (s.hx * 2 / nx);
                        const pz = s.z - s.hz + (j + 0.5) * (s.hz * 2 / nz);
                        acc.add(new THREE.CircleGeometry(1.0, 6), light, { p: [px, y - 0.05, pz], r: [Math.PI / 2, 0, 0] }, 1.0);
                    }
                }
            } else {
                const geo = this.hallStrip(s, y, true);
                acc.add(geo, col, {}, self);
                // a glowing strip down the middle
                const dx = s.bx - s.ax, dz = s.bz - s.az;
                const L = Math.hypot(dx, dz);
                acc.add(new THREE.PlaneGeometry(L, 0.3), light, { p: [(s.ax + s.bx) / 2, y - 0.06, (s.az + s.bz) / 2], r: [Math.PI / 2, 0, Math.atan2(dz, dx)] }, 0.9);
            }
            this.addMesh(acc.build(), this.ceilMat, { receive: false });
        }
    }

    // --------------------------------------------------------
    // Holes: the reactor shaft and the creature pit, with railings
    // --------------------------------------------------------
    buildHoles() {
        for (const h of HOLES) {
            const pit = h.zone === 4;
            const b = new GeoBuilder();
            const segs = 72;
            // shaft wall going down (seen from inside)
            const shaft = insideOut(new THREE.CylinderGeometry(h.r, h.r, -h.floor, segs, 4, true));
            b.add(shaft, [pit ? 0x3a1438 : 0x2c2050, (p, i, c) => {
                const y = p.getY(i);
                c.set(pit ? 0x3a1438 : 0x2c2050);
                if (Math.abs(y + (-h.floor) * 0.1) < 0.4) c.set(pit ? 0xff7a4a : SHIP_COLORS.cyan);
            }], { p: [h.x, h.floor / 2, h.z] });
            // railing: outer + inner face + glowing top
            const railR = h.r;
            const outer = new THREE.CylinderGeometry(railR, railR, h.rail, segs, 1, true);
            b.add(outer, pit ? 0x5a2450 : SHIP_COLORS.dark, { p: [h.x, h.rail / 2, h.z] });
            const inner = insideOut(new THREE.CylinderGeometry(railR - 0.35, railR - 0.35, h.rail, segs, 1, true));
            b.add(inner, pit ? 0x5a2450 : SHIP_COLORS.dark, { p: [h.x, h.rail / 2, h.z] });
            const top = new THREE.RingGeometry(railR - 0.4, railR + 0.05, segs, 1);
            b.add(top, pit ? PIT_COLORS.glow : SHIP_COLORS.cyan, { p: [h.x, h.rail, h.z], r: [-Math.PI / 2, 0, 0] }, 1.4);
            // posts
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                b.add(new THREE.BoxGeometry(0.5, h.rail + 0.3, 0.6), SHIP_COLORS.gold, {
                    p: [h.x + Math.cos(a) * (railR - 0.17), (h.rail + 0.3) / 2, h.z + Math.sin(a) * (railR - 0.17)], r: [0, -a, 0],
                });
            }
            this.addMesh(b.build(), this.archMat);
            // glowing bottom
            const bottom = new THREE.Mesh(
                new THREE.CircleGeometry(h.r, 48),
                new THREE.MeshBasicMaterial({ color: pit ? 0x6dff5a : 0x5ae8ff, fog: false }),
            );
            bottom.rotation.x = -Math.PI / 2;
            bottom.position.set(h.x, h.floor + 0.05, h.z);
            this.scene.add(bottom);
            const glow = glowSprite(pit ? 0x8dff6a : 0x6ff0ff, h.r * 3.2, 0.55);
            glow.position.set(h.x, h.floor + 1.5, h.z);
            this.scene.add(glow);
            this.pulsers.push({ obj: glow.material, base: 0.5, amp: 0.15, speed: pit ? 1.3 : 2.4 });
            if (pit) this.pitGoo = bottom;
            else this.shaftGlow = bottom;
        }
    }

    // --------------------------------------------------------
    // Doors: a frame at every hall end + force fields where locked
    // --------------------------------------------------------
    buildDoors() {
        const frameMat = this.archMat;
        // frames at both ends of every hall where it meets a room
        for (const h of HALLS) {
            const L = Math.hypot(h.bx - h.ax, h.bz - h.az);
            const ux = (h.bx - h.ax) / L, uz = (h.bz - h.az) / L;
            for (const [ex, ez, dir] of [[h.ax, h.az, 1], [h.bx, h.bz, -1]]) {
                // only where a room is on the other side
                const inRoom = SHAPES.some((o) => o.kind !== 'hall' && o.sd(ex - ux * dir * 1.0, ez - uz * dir * 1.0) < 0);
                if (!inRoom) continue;
                const x = ex + ux * dir * 0.6, z = ez + uz * dir * 0.6;
                this.addFrame(frameMat, x, z, ux, uz, h.hw, h.h);
            }
        }
        DOORS.forEach((d, k) => {
            const nx = -d.tz, nz = d.tx;
            const width = d.hw * 2 + 0.6;
            const geo = new THREE.PlaneGeometry(width, d.h);
            geo.translate(0, d.h / 2, 0);
            const mat = shieldMaterial(d.bossIn || d.bossOut ? 0xff5a3a : 0xff5be0, width / 1.3, d.h / 1.3);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(d.x, 0, d.z);
            mesh.rotation.y = Math.atan2(d.tx, d.tz);
            mesh.renderOrder = 13;
            this.scene.add(mesh);
            const halfSpan = d.hw + 0.5;
            const gate = {
                def: { x: d.x, z: d.z, tx: d.tx, tz: d.tz, nx, nz, halfSpan, k },
                door: d,
                mesh, mat, open: false, anim: 0, flashT: 0,
                ax: d.x - nx * halfSpan, az: d.z - nz * halfSpan,
                bx: d.x + nx * halfSpan, bz: d.z + nz * halfSpan,
                y: 0, h: d.h, lights: [],
            };
            // red/green lights on both sides of the doorway
            for (const sgn of [-1, 1]) {
                const lx = d.x + nx * (d.hw + 0.25) * sgn - d.tx * 0.35, lz = d.z + nz * (d.hw + 0.25) * sgn - d.tz * 0.35;
                const lm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4d6a }));
                lm.position.set(lx, d.h - 0.9, lz);
                this.scene.add(lm);
                const gl = glowSprite(0xff4d6a, 1.6, 0.8);
                gl.position.copy(lm.position);
                this.scene.add(gl);
                gate.lights.push({ mesh: lm, glow: gl });
            }
            this.gates.push(gate);
            // the creature pit's entrance starts open (it shuts when the boss wakes up)
            if (d.bossIn) this.openGate(k, true);
        });
    }

    addFrame(mat, x, z, ux, uz, hw, h) {
        const b = new GeoBuilder();
        const yaw = Math.atan2(ux, uz);
        const m4 = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
        // side posts (lean in a little at the top) + a beam with a glowing emblem
        for (const sx of [-1, 1]) {
            b.add(new THREE.BoxGeometry(0.7, h, 0.9), SHIP_COLORS.dark, { p: [sx * (hw + 0.1), h / 2, 0], matrix: m4 });
            b.add(new THREE.BoxGeometry(0.76, 0.5, 0.96), SHIP_COLORS.gold, { p: [sx * (hw + 0.1), 0.25, 0], matrix: m4 });
            b.add(new THREE.BoxGeometry(0.2, h * 0.7, 0.3), SHIP_COLORS.cyan, { p: [sx * (hw - 0.22), h * 0.45, 0], matrix: m4 }, 1.3);
        }
        b.add(new THREE.BoxGeometry(hw * 2 + 1.0, 0.8, 1.0), SHIP_COLORS.dark, { p: [0, h - 0.2, 0], matrix: m4 });
        b.add(new THREE.BoxGeometry(hw * 2 + 1.1, 0.18, 1.06), SHIP_COLORS.gold, { p: [0, h - 0.62, 0], matrix: m4 });
        b.add(new THREE.OctahedronGeometry(0.42, 0), SHIP_COLORS.magenta, { p: [0, h - 0.2, 0.55], s: [1, 0.7, 0.4], matrix: m4 }, 1.4);
        b.add(new THREE.OctahedronGeometry(0.42, 0), SHIP_COLORS.magenta, { p: [0, h - 0.2, -0.55], s: [1, 0.7, 0.4], matrix: m4 }, 1.4);
        const mesh = this.addMesh(b.build(), mat, { cast: false });
        addOutline(mesh, 0x1b1030, 0.0022);
    }

    // --------------------------------------------------------
    // The hangar's open side: the outside of the ship and an air shield
    // --------------------------------------------------------
    buildHangarMouth() {
        const H = HANGAR_OPENING;
        const w = H.x1 - H.x0;
        // air shield (you can see space through it, but can't walk out)
        const mat = shieldMaterial(0x6fc8ff, w / 3.2, H.top / 3.2);
        mat.uniforms.uOn.value = 0.13;
        const geo = new THREE.PlaneGeometry(w, H.top);
        geo.translate(0, H.top / 2, 0);
        const field = new THREE.Mesh(geo, mat);
        field.position.set((H.x0 + H.x1) / 2, 0, H.z + 0.05);
        field.renderOrder = 13;
        this.scene.add(field);
        this.airShield = field;
        // the hull outside: a landing lip sloping away under the opening
        const b = new GeoBuilder();
        const lip = new THREE.PlaneGeometry(w + 8, 14, 1, 1);
        lip.rotateX(-Math.PI / 2 + 0.32);
        b.add(lip, 0x4a3584, { p: [0, -2.1, H.z + 6.6] });
        b.add(new THREE.BoxGeometry(w + 8, 0.5, 0.6), SHIP_COLORS.cyan, { p: [0, -0.1, H.z + 0.4] }, 1.2);
        for (let i = 0; i < 7; i++) {
            b.add(new THREE.BoxGeometry(0.5, 0.12, 3), SHIP_COLORS.cyan, { p: [-15 + i * 5, -0.8, H.z + 3.2], r: [0.32, 0, 0] }, 1.2);
        }
        for (const sx of [-1, 1]) {
            b.add(new THREE.BoxGeometry(0.4, H.top + 2, 0.4), SHIP_COLORS.cyan, { p: [sx * (w / 2 + 0.2), H.top / 2, H.z + 0.6] }, 1.4);
            // big posts framing the opening
            b.add(new THREE.BoxGeometry(2.2, H.top + 1, 1.6), SHIP_COLORS.dark, { p: [sx * (w / 2 + 1.1), (H.top + 1) / 2, H.z - 0.2] });
            b.add(new THREE.BoxGeometry(2.4, 0.6, 1.8), SHIP_COLORS.gold, { p: [sx * (w / 2 + 1.1), 0.3, H.z - 0.2] });
        }
        b.add(new THREE.BoxGeometry(w + 4.4, 1.4, 1.6), SHIP_COLORS.dark, { p: [0, H.top + 0.5, H.z - 0.2] });
        b.add(new THREE.BoxGeometry(w + 4.6, 0.3, 1.7), SHIP_COLORS.gold, { p: [0, H.top - 0.1, H.z - 0.2] });
        this.addMesh(b.build(), this.archMat, { cast: false });
    }

    // --------------------------------------------------------
    // Teleport pads where alien waves beam in
    // --------------------------------------------------------
    buildPads() {
        const b = new GeoBuilder();
        for (const zn of ZONES) {
            for (const a of zn.aliens) {
                if (!a.wave) continue;
                b.add(new THREE.CylinderGeometry(1.45, 1.6, 0.12, 6), SHIP_COLORS.dark, { p: [a.x, 0.06, a.z] });
                b.add(new THREE.RingGeometry(0.95, 1.25, 6), SHIP_COLORS.cyan, { p: [a.x, 0.13, a.z], r: [-Math.PI / 2, 0, Math.PI / 6] }, 1.5);
                b.add(new THREE.CircleGeometry(0.5, 6), SHIP_COLORS.magenta, { p: [a.x, 0.13, a.z], r: [-Math.PI / 2, 0, 0] }, 0.9);
            }
        }
        if (b.chunks.length) this.addMesh(b.build(), this.archMat, { cast: false });
    }

    // --------------------------------------------------------
    // Top-down picture for the minimap (made once)
    // --------------------------------------------------------
    mapImage() {
        if (this._map) return this._map;
        const B = BOUNDS, S = 2;
        const W = Math.round((B.x1 - B.x0) * S), H = Math.round((B.z1 - B.z0) * S);
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(W, H);
        const tint = [[96, 80, 160], [80, 96, 170], [70, 110, 150], [96, 84, 170], [130, 70, 120], [90, 90, 160]];
        const q = {};
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const x = B.x0 + (i + 0.5) / S, z = B.z0 + (j + 0.5) / S;
                shipQuery(x, z, q);
                const k = (j * W + i) * 4;
                let r = 0, g = 0, bl = 0, a = 0;
                if (q.sdU < 0.9) {
                    a = 255;
                    if (q.sdU > -0.15) { r = 222; g = 206; bl = 255; } // walls
                    else if (q.hole) {
                        if (q.holeD < 0.7) { r = 255; g = 150; bl = 230; } else { r = 20; g = 12; bl = 36; }
                    } else {
                        const t = tint[q.zone] || tint[0];
                        const hex = ((Math.floor(x * 0.7) + Math.floor(z * 0.7)) & 1) ? 1 : 0.92;
                        r = t[0] * hex; g = t[1] * hex; bl = t[2] * hex;
                    }
                    const HO = HANGAR_OPENING;
                    if (Math.abs(z - HO.z) < 0.6 && x > HO.x0 && x < HO.x1) { r = 111; g = 208; bl = 255; }
                }
                img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = bl; img.data[k + 3] = a;
            }
        }
        ctx.putImageData(img, 0, 0);
        this._map = { canvas: c, x0: B.x0, z0: B.z0, scale: S, bg: '#120a20', range: 55 };
        return this._map;
    }

    // --------------------------------------------------------
    update(dt, camera, focus) {
        this.time += dt;
        const t = this.time;
        this.skyGroup.position.copy(camera.position);
        if (focus) this.followShadow(focus);
        for (const s of this.spinners) {
            s.obj.rotation[s.axis || 'y'] += dt * s.speed;
        }
        for (const p of this.pulsers) {
            p.obj.opacity = p.base + Math.sin(t * p.speed + (p.phase || 0)) * p.amp;
        }
        if (this.pitGoo) this.pitGoo.material.color.setHSL(0.3 + Math.sin(t * 0.7) * 0.03, 1, 0.5 + Math.sin(t * 2.1) * 0.06);
        if (this.bobbers) for (const b of this.bobbers) b.obj.position.y = b.y + Math.sin(t * b.speed + b.phase) * b.amp;
        const gp = this.glowPulse;
        if (gp && gp.mat.userData.shader) gp.mat.userData.shader.uniforms.uGlowStrength.value = gp.base + Math.sin(t * gp.speed) * gp.amp;
        // door fields fade out when they open (and flash when they slam shut)
        for (const g of this.gates) {
            if (g.open && g.anim < 2) {
                g.anim += dt;
                const k = g.anim;
                g.mat.uniforms.uOn.value = k < 1.2 ? (Math.random() < 0.5 ? 1.4 : 0.2) * (1 - k / 1.2) : 0;
                g.mat.uniforms.uFlash.value = Math.max(0, 1 - k * 2);
                if (k >= 1.2) g.mesh.visible = false;
                if (k >= 2) g.anim = 2;
            }
            if (g.flashT > 0) {
                g.flashT -= dt;
                g.mat.uniforms.uFlash.value = Math.max(0, g.flashT / 0.6);
            }
        }
        if (this.onUpdate) this.onUpdate(dt, t);
    }
}
