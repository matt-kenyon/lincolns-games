// ============================================================
// ALIENS — blue, fanged, thin backward-bending legs (Halo-ish),
// armor color shows their rank. Cartoon "poof" when defeated.
// ============================================================

import * as THREE from 'three';
import { GeoBuilder, toonMaterial, addOutline, glowSprite } from './toon.js';
import { pathQuery, ZONES, TOWER } from './layout.js';
import { clamp, lerp, rand, damp, dampAngle, wrapAngle, randSign } from './util.js';

export const ALIEN_TYPES = {
    scout:   { name: 'Scout',   hp: 3,  speed: 5.6, scale: 0.92, armor: 0xb28cff, armorDark: 0x7652c8, burst: 1, cooldown: [1.3, 2.2], prefer: [9, 17],  leash: 30, boltSize: 0.5 },
    trooper: { name: 'Trooper', hp: 4,  speed: 4.2, scale: 1.0,  armor: 0x7b4bb0, armorDark: 0x4f2d80, burst: 2, cooldown: [1.5, 2.5], prefer: [11, 21], leash: 30, boltSize: 0.55 },
    major:   { name: 'Major',   hp: 7,  speed: 4.0, scale: 1.1,  armor: 0xe0483f, armorDark: 0x8a2230, burst: 3, cooldown: [1.8, 2.8], prefer: [11, 21], leash: 32, boltSize: 0.6 },
    captain: { name: 'Alien Captain', hp: 16, shield: 10, speed: 4.6, scale: 1.45, armor: 0xf2c14e, armorDark: 0xb8862a, burst: 4, cooldown: [1.5, 2.3], prefer: [9, 18], leash: 22, boltSize: 0.85, boss: true },
};

const SKIN = 0x3f8fe6, SKIN_LIGHT = 0x86c6ff, SKIN_DARK = 0x2a5fb3;
const EYE = 0xffe14a, PUPIL = 0x1a1030, FANG = 0xfffaf2, MOUTH = 0x2a0f2a;
const GUN = 0x5b3592, GUN_GLOW = 0x7dff6a;

// Rest pose angles for the digitigrade (backward-knee) legs
const THIGH0 = -0.38, KNEE0 = 0.78, TORSO0 = 0.26;

// ------------------------------------------------------------
// Geometry (cached per alien type)
// ------------------------------------------------------------
const _geoCache = {};
function partGeos(typeId) {
    if (_geoCache[typeId]) return _geoCache[typeId];
    const T = ALIEN_TYPES[typeId];
    const A = T.armor, AD = T.armorDark;
    const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8);
    const sph = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
    const g = {};

    let b = new GeoBuilder();
    b.add(sph(1), SKIN_DARK, { p: [0, 0.02, 0], s: [0.25, 0.15, 0.2] });
    b.add(new THREE.CylinderGeometry(0.24, 0.31, 0.22, 8), A, { p: [0, -0.06, 0] });
    b.add(new THREE.CylinderGeometry(0.255, 0.255, 0.06, 8), AD, { p: [0, 0.06, 0] });
    g.pelvis = b.build();

    b = new GeoBuilder();
    b.add(sph(1), SKIN_LIGHT, { p: [0, 0.24, 0.03], s: [0.27, 0.3, 0.23] });
    b.add(sph(1), SKIN, { p: [0, 0.48, 0], s: [0.36, 0.3, 0.27] });
    b.add(sph(1), A, { p: [0, 0.5, 0.1], s: [0.33, 0.25, 0.2] });
    b.add(sph(1), AD, { p: [0, 0.37, 0.15], s: [0.2, 0.08, 0.1] });
    for (const sx of [-1, 1]) {
        b.add(sph(1), A, { p: [sx * 0.37, 0.64, -0.01], s: [0.18, 0.12, 0.18], r: [0, 0, sx * -0.4] });
        b.add(sph(1), AD, { p: [sx * 0.4, 0.6, -0.01], s: [0.16, 0.06, 0.16], r: [0, 0, sx * -0.4] });
    }
    b.add(new THREE.BoxGeometry(0.42, 0.42, 0.18), AD, { p: [0, 0.5, -0.25] });
    b.add(new THREE.BoxGeometry(0.28, 0.08, 0.04), GUN_GLOW, { p: [0, 0.52, -0.345] }, 1.2);
    b.add(new THREE.CylinderGeometry(0.075, 0.09, 0.26, 8), SKIN, { p: [0, 0.7, 0.07], r: [0.5, 0, 0] });
    g.torso = b.build();

    b = new GeoBuilder();
    b.add(sph(1, 18, 14), SKIN, { p: [0, 0.16, 0.06], s: [0.25, 0.24, 0.31] });
    b.add(sph(1), SKIN_LIGHT, { p: [0, 0.05, 0.22], s: [0.21, 0.13, 0.2] });
    b.add(sph(1), MOUTH, { p: [0, 0.055, 0.34], s: [0.17, 0.05, 0.08] });
    for (const sx of [-1, 1]) {
        // big fangs (down) + little fangs (up)
        b.add(new THREE.ConeGeometry(0.032, 0.13, 6), FANG, { p: [sx * 0.075, 0.02, 0.385], r: [Math.PI, 0, 0] });
        b.add(new THREE.ConeGeometry(0.022, 0.07, 6), FANG, { p: [sx * 0.12, 0.035, 0.36] });
        // eyes
        b.add(sph(0.08, 12, 10), EYE, { p: [sx * 0.115, 0.22, 0.29] }, 0.35);
        b.add(sph(0.036, 8, 8), PUPIL, { p: [sx * 0.115, 0.22, 0.362], s: [0.75, 1.6, 0.6] });
        // angry brows
        b.add(new THREE.BoxGeometry(0.13, 0.035, 0.05), SKIN_DARK, { p: [sx * 0.11, 0.315, 0.32], r: [0, 0, sx * 0.38] });
        // cheek mandible plates (Halo-style)
        b.add(sph(1), SKIN_DARK, { p: [sx * 0.17, 0.05, 0.22], s: [0.06, 0.09, 0.12], r: [0, sx * 0.4, 0] });
    }
    b.add(sph(1, 14, 8), A, { p: [0, 0.25, -0.02], s: [0.27, 0.2, 0.33] });
    b.add(new THREE.BoxGeometry(0.05, 0.14, 0.34), AD, { p: [0, 0.4, -0.04] });
    b.add(new THREE.BoxGeometry(0.06, 0.05, 0.06), GUN_GLOW, { p: [0, 0.3, 0.24] }, 1.4);
    g.head = b.build();

    b = new GeoBuilder();
    b.add(cap(0.066, 0.26), SKIN, { p: [0, -0.16, 0] });
    b.add(sph(1), A, { p: [0, -0.04, 0], s: [0.1, 0.1, 0.1] });
    g.upperArm = b.build();

    const forearm = (gun) => {
        const fb = new GeoBuilder();
        fb.add(cap(0.058, 0.24), SKIN, { p: [0, -0.15, 0] });
        fb.add(new THREE.CylinderGeometry(0.078, 0.07, 0.13, 8), A, { p: [0, -0.13, 0] });
        fb.add(sph(0.075), SKIN_DARK, { p: [0, -0.33, 0.01] });
        if (gun) {
            fb.add(new THREE.BoxGeometry(0.1, 0.3, 0.14), GUN, { p: [0, -0.44, 0.05] });
            fb.add(new THREE.ConeGeometry(0.06, 0.16, 6), GUN, { p: [-0.05, -0.62, 0.05], r: [0, 0, 0.3] });
            fb.add(new THREE.ConeGeometry(0.06, 0.16, 6), GUN, { p: [0.05, -0.62, 0.05], r: [0, 0, -0.3] });
            fb.add(sph(0.06), GUN_GLOW, { p: [0, -0.58, 0.05] }, 1.6);
        }
        return fb.build();
    };
    g.forearmL = forearm(false);
    g.forearmR = forearm(true);

    b = new GeoBuilder();
    b.add(cap(0.085, 0.36), SKIN, { p: [0, -0.24, 0] });
    b.add(sph(1), A, { p: [0, -0.14, 0.06], s: [0.11, 0.19, 0.1] });
    g.thigh = b.build();

    b = new GeoBuilder();
    b.add(cap(0.058, 0.36), SKIN, { p: [0, -0.23, 0] });
    // foot points forward when the leg is in its rest pose
    const footAng = THIGH0 + KNEE0;
    const fd = new THREE.Vector3(0, Math.sin(footAng), Math.cos(footAng));
    const ank = new THREE.Vector3(0, -0.46, 0);
    b.add(sph(1), AD, { p: [0, -0.44, 0], s: [0.085, 0.085, 0.085] });
    const fc = ank.clone().addScaledVector(fd, 0.12);
    b.add(cap(0.06, 0.2), A, { p: [fc.x, fc.y, fc.z], r: [Math.atan2(fd.z, fd.y), 0, 0] });
    for (const sx of [-1, 1]) {
        const tc = ank.clone().addScaledVector(fd, 0.28);
        b.add(new THREE.ConeGeometry(0.03, 0.1, 5), FANG, { p: [tc.x + sx * 0.04, tc.y, tc.z], r: [Math.atan2(fd.z, fd.y), 0, 0] });
    }
    g.shin = b.build();

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
// ------------------------------------------------------------
export function createAlienModel(typeId) {
    const T = ALIEN_TYPES[typeId];
    const G = partGeos(typeId);
    const mat = toonMaterial({ vertexColors: true, glow: true, rim: 0.6, rimColor: 0xd8f0ff, cache: false });
    const outlines = [];
    const mk = (geo, parent, outline = true) => {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        if (outline) outlines.push(addOutline(m, 0x1b1030, 0.0042));
        parent.add(m);
        return m;
    };

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    body.scale.setScalar(T.scale);

    const hips = new THREE.Group();
    hips.position.y = 1.0;
    body.add(hips);
    mk(G.pelvis, hips);

    const torso = new THREE.Group();
    torso.rotation.x = TORSO0;
    hips.add(torso);
    mk(G.torso, torso);

    const head = new THREE.Group();
    head.position.set(0, 0.78, 0.13);
    torso.add(head);
    mk(G.head, head);

    const arms = [];
    for (const sx of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(sx * 0.4, 0.58, 0.0);
        torso.add(sh);
        mk(G.upperArm, sh);
        const el = new THREE.Group();
        el.position.y = -0.3;
        sh.add(el);
        mk(sx < 0 ? G.forearmL : G.forearmR, el);
        arms.push({ sh, el, side: sx });
    }

    const legs = [];
    for (const sx of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(sx * 0.17, 0, 0);
        hips.add(hip);
        mk(G.thigh, hip);
        const knee = new THREE.Group();
        knee.position.y = -0.5;
        hip.add(knee);
        mk(G.shin, knee);
        legs.push({ hip, knee, side: sx });
    }

    // Gun-tip glow (charges up before firing)
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, -0.6, 0.05);
    arms[1].el.add(muzzle);
    const muzzleGlow = glowSprite(GUN_GLOW, 0.5, 0.0);
    muzzle.add(muzzleGlow);

    const alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTexture(), transparent: true, depthWrite: false }));
    alert.scale.set(0, 0, 1);
    alert.position.set(0, 2.55, 0);
    body.add(alert);

    alert.visible = false;
    muzzleGlow.visible = false;
    const model = {
        typeId, root, body, hips, torso, head, arms, legs, mat, muzzle, muzzleGlow, alert, outlines,
        outlinesOn: true,
        setOutlines(on) {
            if (on === this.outlinesOn) return;
            this.outlinesOn = on;
            for (const o of outlines) o.visible = on;
        },
        phase: Math.random() * 10,
        alertT: 0,
        // pose controls
        move: 0, aim: 0, flinch: 0, cheer: 0, crouch: 0, lookYaw: 0, lookPitch: 0, wave: 0,
        animate(dt, speed) {
            const m = this;
            m.phase += dt * (2 + speed * 1.9);
            const s = Math.sin(m.phase), c = Math.cos(m.phase);
            const mv = m.move;
            // legs
            for (const L of legs) {
                const ph = L.side > 0 ? s : -s;
                L.hip.rotation.x = THIGH0 + ph * 0.55 * mv - m.crouch * 0.4;
                L.knee.rotation.x = KNEE0 + Math.max(0, (L.side > 0 ? c : -c)) * 0.55 * mv + m.crouch * 0.6;
            }
            hips.position.y = 1.0 + Math.abs(s) * 0.07 * mv - m.crouch * 0.12 + Math.sin(m.phase * 0.5) * 0.01;
            hips.rotation.z = s * 0.06 * mv;
            torso.rotation.x = TORSO0 + mv * 0.12 - m.flinch * 0.5 + Math.sin(m.phase * 0.7) * 0.02 * (1 - mv);
            torso.rotation.y = Math.sin(m.phase * 0.5) * 0.05 * mv;
            // head looks toward target
            head.rotation.y = m.lookYaw;
            head.rotation.x = -TORSO0 * 0.6 + m.lookPitch + m.flinch * 0.3;
            // arms: aiming right arm, left arm swings (or cheers)
            const R = arms[1], Lf = arms[0];
            const aimX = -1.35 + m.lookPitch * 0.8;
            R.sh.rotation.x = lerp(s * 0.5 * mv - 0.1, aimX - TORSO0, m.aim);
            R.sh.rotation.z = lerp(0.12, 0.05, m.aim);
            R.el.rotation.x = lerp(-0.4, -0.1, m.aim);
            Lf.sh.rotation.x = -s * 0.5 * mv - 0.1 - m.aim * 0.35;
            Lf.sh.rotation.z = -0.15;
            Lf.el.rotation.x = -0.5 - m.aim * 0.4;
            if (m.cheer > 0) {
                const w = Math.sin(m.phase * 4) * 0.4;
                Lf.sh.rotation.x = lerp(Lf.sh.rotation.x, -2.8 + w, m.cheer);
                Lf.sh.rotation.z = lerp(Lf.sh.rotation.z, -0.3, m.cheer);
                R.sh.rotation.x = lerp(R.sh.rotation.x, -2.6 - w, m.cheer);
                Lf.el.rotation.x = lerp(Lf.el.rotation.x, -0.3, m.cheer);
            }
            if (m.wave > 0) {
                Lf.sh.rotation.x = lerp(Lf.sh.rotation.x, -2.9, m.wave);
                Lf.el.rotation.x = lerp(Lf.el.rotation.x, -0.2, m.wave);
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
        },
        muzzleWorld(out) {
            return muzzle.getWorldPosition(out);
        },
        // Minecraft-style red flash: darken toward red, then glow red
        setTint(k) {
            mat.color.setRGB(1, 1 - k * 0.72, 1 - k * 0.72);
            mat.emissive.setRGB(k * 0.62, k * 0.02, k * 0.04);
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
const _q = {};

export class Alien {
    constructor(game, def, zone, index) {
        this.game = game;
        this.def = def;
        this.zone = zone;
        this.index = index;
        this.typeId = def.type;
        this.T = ALIEN_TYPES[def.type];
        this.model = createAlienModel(def.type);
        this.root = this.model.root;
        this.pos = new THREE.Vector3();
        this.vel = new THREE.Vector3();
        this.home = new THREE.Vector3();
        this.capA = new THREE.Vector3();
        this.capB = new THREE.Vector3();
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
        this.yaw = rand(-0.9, 0.9); // face roughly south, toward where the player comes from
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
        this.root.visible = this.game.aliens ? this.game.aliens.activeZones.has(this.zone) : false;
        this.model.move = 0;
        this.model.aim = 0;
        this.model.flinch = 0;
        this.model.cheer = 0;
        this.updateTransform();
    }

    updateTransform() {
        this.root.position.copy(this.pos);
        if (!this.dead) this.root.rotation.y = this.yaw;
        const s = this.T.scale;
        this.capA.set(this.pos.x, this.pos.y + 0.35 * s, this.pos.z);
        this.capB.set(this.pos.x, this.pos.y + 1.95 * s, this.pos.z);
    }

    get radius() {
        return 0.48 * this.T.scale;
    }

    // Segment hit test (for bolts). Returns t along the segment or -1.
    hitSegment(a, b, pad) {
        if (this.dead) return -1;
        const r = this.radius + pad;
        segSeg(a, b, this.capA, this.capB, _seg);
        if (_seg.d2 < r * r) return _seg.s;
        return -1;
    }

    isHeadshot(point) {
        return point.y > this.pos.y + 1.68 * this.T.scale;
    }

    alertTo(delay = 0) {
        if (this.dead || this.state === 'combat' || this.state === 'alert') return;
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
        g.aliens.alertNearby(this, 30);
        return false;
    }

    die() {
        const g = this.game;
        this.dead = true;
        this.dyingT = 0;
        this.state = 'dead';
        this.fallDir = Math.random() < 0.5 ? 1 : -1;
        this.model.setTint(1);
        this.model.aim = 0;
        this.model.alertT = 0;
        g.audio.play('alienDie', this.pos);
        g.onAlienDefeated(this);
    }

    update(dt) {
        const g = this.game;
        const m = this.model;
        const T = this.T;

        if (this.dead) {
            this.dyingT += dt;
            const k = Math.min(this.dyingT / 0.4, 1);
            const bounce = k < 1 ? k * k : 1;
            this.root.rotation.z = this.fallDir * bounce * Math.PI * 0.5;
            this.root.position.y = this.pos.y + Math.sin(k * Math.PI) * 0.15;
            m.animate(dt * 0.3, 0);
            if (this.dyingT > 0.85 && !this.gone) {
                this.gone = true;
                this.root.visible = false;
                const s = T.scale;
                _v.set(0, 0.6 * s, 0).applyEuler(this.root.rotation).add(this.pos);
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
                g.world.terrain.lineOfSight(this.pos.x, gunY, this.pos.z, P.pos.x, chestY, P.pos.z) &&
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
                        g.aliens.alertNearby(this, 26, 0.6);
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
                        if (wd > 0.6) { wantX = wx / wd; wantZ = wz / wd; speed = T.speed * 0.35; }
                        else this.wanderTarget = null;
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
            // stay in the canyon
            const q = pathQuery(this.pos.x, this.pos.z, _q);
            if (q.sd > -1.5) {
                const cx = q.cx, cz = q.cz;
                const ox = this.pos.x - cx, oz = this.pos.z - cz;
                const ol = Math.hypot(ox, oz) || 1;
                const lim = q.hw - 1.5;
                this.pos.x = cx + (ox / ol) * lim;
                this.pos.z = cz + (oz / ol) * lim;
            }
            g.world.colliders.resolve(this.pos, this.radius, 2, -1);
            g.world.blockByGates(this.pos, 0.7);
            g.world.domeBlocks(this.pos, 0.7);
            g.aliens.separate(this);
            // gravity / hop
            const ground = g.world.groundAt(this.pos.x, this.pos.z);
            this.vy -= 13 * dt;
            this.pos.y += this.vy * dt;
            if (this.pos.y <= ground) {
                if (!this.onGround && this.vy < -3) g.effects.dust(this.pos.x, ground, this.pos.z, 4, 0.5);
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
        m.move = damp(m.move, clamp(sp / 3, 0, 1), 8, dt);
        if (!this.onGround) m.move *= 0.5;
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
        g.audio.play(this.T.boss ? 'bossShoot' : 'alienShoot', this.pos);
    }
}

// ------------------------------------------------------------
// Manager
// ------------------------------------------------------------
export class AlienManager {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.byZone = ZONES.map(() => []);
        this.activeZones = new Set();
    }

    build() {
        ZONES.forEach((zn, zi) => {
            zn.aliens.forEach((def, i) => {
                const a = new Alien(this.game, def, zi, i);
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

    captain() {
        return this.list.find((a) => a.T.boss);
    }

    alertNearby(src, radius, delayMax = 0.4) {
        for (const a of this.byZone[src.zone]) {
            if (a === src || a.dead || a.state !== 'idle') continue;
            if (a.pos.distanceTo(src.pos) < radius) a.alertTo(rand(0.1, delayMax));
        }
    }

    separate(a) {
        for (const b of this.byZone[a.zone]) {
            if (b === a || b.dead) continue;
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

    // Closest alien hit by a segment
    segmentHit(a, b, pad = 0.15) {
        let best = null, bestT = 2;
        for (const al of this.list) {
            if (al.dead || !al.root.visible) continue;
            const t = al.hitSegment(a, b, pad);
            if (t >= 0 && t < bestT) { bestT = t; best = al; }
        }
        return best ? { alien: best, t: bestT } : null;
    }

    // For aim assist: alien nearest to the aim ray within maxAngle.
    // Sets alien.aimY to the chest, or the head if only the head peeks over a rock/ridge.
    aimTarget(origin, dir, maxAngle, maxDist = 90, checkCover = false) {
        let best = null, bestA = maxAngle;
        const T = this.game.world.terrain;
        for (const al of this.list) {
            if (al.dead || !al.root.visible) continue;
            for (const h of [1.25, 1.85]) {
                _v.set(al.pos.x, al.pos.y + h * al.T.scale, al.pos.z);
                if (checkCover && !T.lineOfSight(origin.x, origin.y, origin.z, _v.x, _v.y, _v.z)) continue;
                _v.sub(origin);
                const d = _v.length();
                if (d > maxDist || d < 1) break;
                const ang = Math.acos(clamp(_v.dot(dir) / d, -1, 1));
                if (ang < bestA) { bestA = ang; best = al; al.aimY = h; }
                break;
            }
        }
        return best;
    }

    damageRadius(pos, radius, dmg) {
        let kills = 0;
        for (const al of this.list) {
            if (al.dead || !al.root.visible) continue;
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
        return kills;
    }

    setZoneActive(zi, on) {
        for (const a of this.byZone[zi]) {
            if (!a.gone) a.root.visible = on;
        }
        if (on) this.activeZones.add(zi); else this.activeZones.delete(zi);
    }

    anyInCombat() {
        for (const zi of this.activeZones) for (const a of this.byZone[zi]) if (!a.dead && (a.state === 'combat' || a.state === 'alert')) return true;
        return false;
    }

    update(dt) {
        for (const zi of this.activeZones) {
            for (const a of this.byZone[zi]) {
                if (a.gone) continue;
                a.update(dt);
            }
        }
    }
}
