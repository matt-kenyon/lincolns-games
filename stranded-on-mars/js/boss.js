// ============================================================
// GLORBAX — the Tentacled Terror of the Mothership. A giant one-eyed
// space kraken that lives in the creature pit. Its skin is too tough
// for blasters, so shoot the big EYE!
// Attacks: tentacle slams (the shockwave can be jumped over), goo spit,
// a slow tracking eye laser (hide behind a pillar!), and alien helpers.
// It gets angrier (and red) as it gets hurt.
// ============================================================

import * as THREE from 'three';
import { GeoBuilder, toonMaterial, outlineMaterial, addOutline, glowSprite } from './toon.js';
import { BOSS, HOLES } from './shiplayout.js';
import { clamp, lerp, damp, dampAngle, rand, easeInOut, easeIn, easeOut, wrapAngle } from './util.js';

const COL = {
    skin: 0x5b45c8, belly: 0x9f8cf2, back: 0x35278a, gold: 0xf2c14e, fang: 0xfffaf2,
    mouth: 0x2a0f2a, sucker: 0xffa6cf, eye: 0xfff6dc, iris: 0xffc23a, pupil: 0x140a1a,
};
const N_TENT = 6;
const N_SEG = 22;
const PIT = HOLES[1];
const RING_IN = PIT.r + 1.5;
const RING_OUT = 26.6;
const BODY_Y = 3.8;
const EYE_R = 1.35;
const EYE_LOCAL = new THREE.Vector3(0, 1.25, 3.45);
const MOUTH_LOCAL = new THREE.Vector3(0, -1.15, 3.55);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _base = new THREE.Vector3();

function bez(p0, p1, p2, p3, u, out) {
    const a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
    return out.set(
        p0.x * a + p1.x * b + p2.x * c + p3.x * d,
        p0.y * a + p1.y * b + p2.y * c + p3.y * d,
        p0.z * a + p1.z * b + p2.z * c + p3.z * d,
    );
}

function bezD(p0, p1, p2, p3, u, out) {
    const a = -3 * (1 - u) ** 2, b = 3 * (1 - u) ** 2 - 6 * u * (1 - u), c = 6 * u * (1 - u) - 3 * u * u, d = 3 * u * u;
    return out.set(
        p0.x * a + p1.x * b + p2.x * c + p3.x * d,
        p0.y * a + p1.y * b + p2.y * c + p3.y * d,
        p0.z * a + p1.z * b + p2.z * c + p3.z * d,
    );
}

// Where does segment a-b first enter a sphere? (t in 0..1, or -1)
function segSphere(a, b, c, r) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
    const A = dx * dx + dy * dy + dz * dz;
    const B = 2 * (fx * dx + fy * dy + fz * dz);
    const Cc = fx * fx + fy * fy + fz * fz - r * r;
    if (Cc <= 0) return 0;
    const disc = B * B - 4 * A * Cc;
    if (disc < 0 || A < 1e-9) return -1;
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    return t >= 0 && t <= 1 ? t : -1;
}

// Closest distance between segment p0-p1 and segment q0-q1
function segSegDist(p0, p1, q0, q1) {
    const d1x = p1.x - p0.x, d1y = p1.y - p0.y, d1z = p1.z - p0.z;
    const d2x = q1.x - q0.x, d2y = q1.y - q0.y, d2z = q1.z - q0.z;
    const rx = p0.x - q0.x, ry = p0.y - q0.y, rz = p0.z - q0.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    let s, t;
    const c = d1x * rx + d1y * ry + d1z * rz;
    const bb = d1x * d2x + d1y * d2y + d1z * d2z;
    const den = a * e - bb * bb;
    s = den > 1e-9 ? clamp((bb * f - c * e) / den, 0, 1) : 0;
    t = (bb * s + f) / e;
    if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((bb - c) / a, 0, 1); }
    const x = p0.x + d1x * s - (q0.x + d2x * t), y = p0.y + d1y * s - (q0.y + d2y * t), z = p0.z + d1z * s - (q0.z + d2z * t);
    return Math.sqrt(x * x + y * y + z * z);
}

// ------------------------------------------------------------
// The model
// ------------------------------------------------------------
function buildModel() {
    const sph = (w = 24, h = 16) => new THREE.SphereGeometry(1, w, h);
    const b = new GeoBuilder();
    // big squishy head/body
    b.add(sph(36, 26), [COL.skin, (p, i, c) => {
        const x = p.getX(i) / 4.2, y = p.getY(i) / 4.6, z = p.getZ(i) / 4.0;
        if (z > 0.55 && y < 0.15) c.set(COL.belly);
        else if (z < -0.35 || y > 0.72) c.set(COL.back);
        else c.set(COL.skin);
        if (Math.sin(x * 9.0 + y * 3.0) * Math.sin(y * 8.0 - z * 5.0) > 0.82 && z < 0.4) c.set(0x8a6ff0);
    }], { s: [4.2, 4.6, 4.0] });
    // eye socket + armored gold brow
    b.add(new THREE.TorusGeometry(1.5, 0.28, 10, 32), COL.back, { p: [EYE_LOCAL.x, EYE_LOCAL.y, EYE_LOCAL.z - 0.25] });
    b.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), COL.gold, { p: [0, EYE_LOCAL.y + 1.15, EYE_LOCAL.z - 0.55], s: [1.9, 0.55, 0.9], r: [0.45, 0, 0] });
    // crown of gold horns
    for (let k = 0; k < 5; k++) {
        const a = -0.9 + (k / 4) * 1.8;
        const x = Math.sin(a) * 2.2, z = Math.cos(a) * 0.4 - 0.6;
        b.add(new THREE.ConeGeometry(0.42, 2.4 - Math.abs(a) * 0.6, 10), COL.gold, { p: [x, 4.2 - Math.abs(a) * 0.5, z], r: [-0.5, 0, -a * 0.5] });
    }
    // fins like ears
    for (const sx of [-1, 1]) {
        b.add(sph(18, 10), COL.back, { p: [sx * 4.1, 1.4, -0.3], s: [0.35, 1.8, 1.2], r: [0, 0, sx * 0.4] });
        b.add(sph(12, 8), 0x6ff0ff, { p: [sx * 4.35, 2.4, -0.2], s: [0.25, 0.25, 0.25] }, 1.4);
    }
    // upper fangs
    for (const x of [-0.95, -0.35, 0.35, 0.95]) {
        b.add(new THREE.ConeGeometry(0.16, 0.7, 8), COL.fang, { p: [x, MOUTH_LOCAL.y + 0.15, MOUTH_LOCAL.z + 0.05], r: [Math.PI + 0.1, 0, 0] });
    }
    const body = new THREE.Mesh(b.build(), toonMaterial({ vertexColors: true, glow: true, rim: 0.65, rimColor: 0xd8c8ff, cache: false }));
    body.castShadow = true;
    addOutline(body, 0x1b1030, 0.0022);
    return body;
}

function buildEye() {
    const g = new THREE.Group();
    const mat = toonMaterial({ vertexColors: true, glow: true, rim: 0.4, rimColor: 0xffffff, cache: false });
    const b = new GeoBuilder();
    b.add(new THREE.SphereGeometry(EYE_R, 28, 20), COL.eye, {});
    const iris = new THREE.SphereGeometry(EYE_R + 0.02, 28, 10, 0, Math.PI * 2, 0, 0.62);
    iris.rotateX(Math.PI / 2);
    b.add(iris, [COL.iris, (p, i, c) => c.set(p.getZ(i) > EYE_R * 0.93 ? 0xffe27a : COL.iris)], {});
    const pupil = new THREE.SphereGeometry(EYE_R + 0.04, 20, 8, 0, Math.PI * 2, 0, 0.5);
    pupil.rotateX(Math.PI / 2);
    pupil.scale(0.3, 1, 1);
    b.add(pupil, COL.pupil, {});
    const eye = new THREE.Mesh(b.build(), mat);
    addOutline(eye, 0x1b1030, 0.002);
    g.add(eye);
    // a shiny cartoon highlight (hidden when the eye shuts)
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(-0.42, 0.46, EYE_R - 0.08);
    g.add(shine);
    // eyelids (half shells that swing shut)
    const lidMat = toonMaterial({ color: COL.skin, rim: 0.5, rimColor: 0xd8c8ff, cache: false, side: THREE.DoubleSide });
    const upper = new THREE.Mesh(new THREE.SphereGeometry(EYE_R + 0.12, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(EYE_R + 0.1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat);
    g.add(upper, lower);
    return { group: g, eye, mat, upper, lower, lidMat, shine };
}

function buildMouth() {
    const g = new THREE.Group();
    const inside = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), toonMaterial({ color: COL.mouth }));
    inside.scale.set(1.45, 0.3, 0.45);
    g.add(inside);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), toonMaterial({ color: 0xff7aa8 }));
    tongue.scale.set(0.75, 0.22, 0.35);
    tongue.position.set(0, -0.15, 0.05);
    g.add(tongue);
    const jaw = new THREE.Group();
    const jb = new GeoBuilder();
    for (const x of [-0.7, 0, 0.7]) jb.add(new THREE.ConeGeometry(0.15, 0.6, 8), COL.fang, { p: [x, 0.1, 0.12] });
    jb.add(new THREE.SphereGeometry(1, 20, 10), COL.belly, { p: [0, -0.25, -0.1], s: [1.55, 0.35, 0.6] });
    const jawMesh = new THREE.Mesh(jb.build(), toonMaterial({ vertexColors: true, glow: true, rim: 0.5, rimColor: 0xd8c8ff }));
    addOutline(jawMesh, 0x1b1030, 0.002);
    jaw.add(jawMesh);
    g.add(jaw);
    const glow = glowSprite(0x9dff5a, 2.5, 0);
    glow.position.z = 0.4;
    g.add(glow);
    return { group: g, inside, jaw, glow };
}

// ============================================================
export class Boss {
    constructor(game) {
        this.game = game;
        this.name = 'GLORBAX';
        this.title = 'TENTACLED TERROR OF THE MOTHERSHIP';
        this.center = new THREE.Vector3(BOSS.x, 0, BOSS.z);
        this.pos = new THREE.Vector3(BOSS.x, 5, BOSS.z + 3); // the eye (aim here!)
        this.vel = new THREE.Vector3();
        this.aimAt = new THREE.Vector3();
        this.gone = false;
        this.dead = false;
        this.active = false;
        this.visible = false;
        this.t = 0;
        this.state = 'hidden';
        this.stateT = 0;
        this.phase = 1;
        this.rise = 0;
        this.eyeOpen = 0;
        this.mouth = 0;
        this.yaw = 0;
        this.faceYaw = 0;
        this.hurtT = 0;
        this.blinkT = 3;
        this.armorToasts = 0;
        this.armorToastT = 0;
        this.lookTarget = new THREE.Vector3();
        this.lookYaw = 0;
        this.lookPitch = 0;
        this.tentOut = new Array(N_TENT).fill(0);
        this.build();
        this.resetStats();
    }

    resetStats() {
        const diff = this.game.diff;
        this.maxHp = Math.round(110 * diff.alienHp);
        this.hp = this.maxHp;
        this.phase = 1;
    }

    // --------------------------------------------------------
    build() {
        const g = this.game;
        const root = new THREE.Group();
        root.visible = false;
        const body = new THREE.Group();
        root.add(body);
        body.add(buildModel());
        this.bodyMesh = body.children[0];
        const eye = buildEye();
        eye.group.position.copy(EYE_LOCAL);
        body.add(eye.group);
        const mouth = buildMouth();
        mouth.group.position.copy(MOUTH_LOCAL);
        body.add(mouth.group);
        g.scene.add(root);
        this.root = root;
        this.body = body;
        this.eye = eye;
        this.mouthParts = mouth;

        // tentacles: one instanced mesh (+ outline) for every segment
        const segGeo = new GeoBuilder();
        segGeo.add(new THREE.SphereGeometry(1, 12, 9), [COL.skin, (p, i, c) => {
            const y = p.getY(i), z = p.getZ(i);
            if (y < -0.35) c.set(Math.cos(z * 9) > 0.55 ? 0xffd0e4 : COL.sucker);
            else if (y > 0.6) c.set(COL.back);
            else c.set(COL.skin);
        }], {});
        const geo = segGeo.build();
        this.tentMat = toonMaterial({ vertexColors: true, glow: true, rim: 0.55, rimColor: 0xd8c8ff, cache: false });
        const count = N_TENT * N_SEG;
        this.tentMesh = new THREE.InstancedMesh(geo, this.tentMat, count);
        this.tentMesh.castShadow = true;
        this.tentMesh.frustumCulled = false;
        this.tentLine = new THREE.InstancedMesh(geo, outlineMaterial(0x1b1030, 0.0024), count);
        this.tentLine.instanceMatrix = this.tentMesh.instanceMatrix;
        this.tentLine.frustumCulled = false;
        // tentacle segments are placed in world space, so they hang off the scene, not the body
        g.scene.add(this.tentMesh, this.tentLine);

        this.tents = [];
        for (let k = 0; k < N_TENT; k++) {
            const angle = (k / N_TENT) * Math.PI * 2 + 0.3;
            this.tents.push({
                k, angle, mode: 'idle', t: 0, windup: 1,
                P1: new THREE.Vector3(), P2: new THREE.Vector3(), T: new THREE.Vector3(),
                target: new THREE.Vector3(), from: { P1: new THREE.Vector3(), P2: new THREE.Vector3(), T: new THREE.Vector3() },
                spheres: Array.from({ length: N_SEG }, () => ({ c: new THREE.Vector3(), r: 0.5 })),
                flail: Math.random() * 6,
            });
        }

        // warning circles on the floor (where a tentacle is about to slam)
        this.warnings = [];
        for (let i = 0; i < 3; i++) {
            const grp = new THREE.Group();
            const mat = new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
            const ring = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.9, 40), mat);
            ring.rotation.x = -Math.PI / 2;
            const fillMat = mat.clone();
            const fill = new THREE.Mesh(new THREE.CircleGeometry(2.45, 40), fillMat);
            fill.rotation.x = -Math.PI / 2;
            grp.add(ring, fill);
            grp.visible = false;
            g.scene.add(grp);
            this.warnings.push({ grp, mat, fillMat, fill, on: false, t: 0, life: 1 });
        }
        // shockwave rings rolling across the floor
        this.waves = [];
        for (let i = 0; i < 3; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xff9a5a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
            const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 64), mat);
            m.rotation.x = Math.PI / 2;
            m.visible = false;
            g.scene.add(m);
            this.waves.push({ m, mat, on: false, r: 0, x: 0, z: 0, hit: false });
        }
        // the eye laser (an aiming line, then the real beam)
        const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
        beamGeo.translate(0, 0.5, 0);
        this.laser = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff3a5a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.laserCore = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.laser.add(this.laserCore);
        this.laser.visible = false;
        this.laser.renderOrder = 12;
        g.scene.add(this.laser);
        this.laserGlow = glowSprite(0xff4a6a, 3, 0);
        g.scene.add(this.laserGlow);
        this.laserHit = new THREE.Vector3();
        this.laserDir = new THREE.Vector3(0, 0, 1);
        this.eyeGlow = glowSprite(0xff3a3a, 5, 0);
        this.eye.group.add(this.eyeGlow);
        this.eyeGlow.position.z = 1.2;
        this.animate(0);
    }

    // --------------------------------------------------------
    // The hit-test interface used by bolts, grenades and aim assist
    // --------------------------------------------------------
    get eyeIsOpen() {
        return this.eyeOpen > 0.6 && this.lidClose < 0.4;
    }

    targetable() {
        return this.active && !this.dead && this.visible && this.rise > 0.9;
    }

    aimPoint(out) {
        return out.copy(this.pos);
    }

    showBar() {
        return (this.active || this.state === 'dying') && this.visible;
    }

    info() {
        return { name: this.name, hp: this.hp, maxHp: this.maxHp, rage: this.phase >= 3 };
    }

    hitSegment(a, b, pad) {
        if (!this.visible || this.rise < 0.5 || this.state === 'dead') return -1;
        let best = -1;
        const take = (t) => { if (t >= 0 && (best < 0 || t < best)) best = t; };
        take(segSphere(a, b, this.pos, EYE_R + pad));
        this.body.getWorldPosition(_v3);
        take(segSphere(a, b, _v3, 3.9 + pad * 0.5));
        for (const tn of this.tents) {
            for (let s = 2; s < N_SEG; s += 2) {
                const sp = tn.spheres[s];
                take(segSphere(a, b, sp.c, sp.r * 0.8));
            }
        }
        return best;
    }

    isHeadshot() {
        return false;
    }

    // Bolts bounce off everything but the open eye
    isArmored(p) {
        if (!this.active) return true;
        return !this.eyeIsOpen || p.distanceTo(this.pos) > EYE_R + 0.45;
    }

    armorHit(p) {
        const g = this.game;
        g.effects.sparks(p.x, p.y, p.z, 0xfff1c0, 5, 4, 0.12);
        g.audio.play('armorClank', p);
        if (this.active && this.armorToastT <= 0 && this.armorToasts < 4) {
            this.armorToastT = 9;
            this.armorToasts++;
            g.hud.toast(this.eyeIsOpen ? 'Its skin is too tough! Shoot the big EYE!' : 'Wait for the eye to open!', 2.6);
        }
    }

    stickOffset(point, out) {
        out.copy(point).sub(this.pos);
        if (out.length() < EYE_R + 0.6) out.setLength(EYE_R + 0.05);
        return out;
    }

    alertTo() {}

    hurt(amount, point) {
        if (!this.active || this.dead) return false;
        const g = this.game;
        this.hp -= amount;
        this.hurtT = 0.16;
        this.flinch = 1;
        g.audio.play('bossHurt', this.pos);
        g.effects.sparks(point.x, point.y, point.z, 0xffe27a, 8, 5, 0.16);
        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
            return true;
        }
        if (this.phase === 1 && this.hp <= this.maxHp * 0.66) this.enterPhase(2);
        else if (this.phase === 2 && this.hp <= this.maxHp * 0.33) this.enterPhase(3);
        return false;
    }

    // Grenade explosions: big damage if it's right on the eye
    blast(pos, radius, dmg) {
        if (!this.active || this.dead) return;
        const d = pos.distanceTo(this.pos);
        if (d < radius * 0.75 + EYE_R && this.eyeIsOpen) {
            const k = clamp(1 - (d - EYE_R) / (radius * 0.75), 0.35, 1);
            this.hurt(Math.max(1, Math.round(dmg * 1.2 * k)), _v.copy(this.pos));
            this.game.hud.toast('BULLSEYE! 💥', 1.4);
        }
    }

    dmg(n) {
        return n * this.game.diff.damage;
    }

    // --------------------------------------------------------
    // Flow
    // --------------------------------------------------------
    // The intro cutscene drives rise / eyeOpen / mouth / tentOut itself
    prepareIntro() {
        this.visible = true;
        this.root.visible = true;
        this.rise = 0;
        this.eyeOpen = 0;
        this.mouth = 0;
        this.tentOut.fill(0);
        this.state = 'intro';
        this.lookTarget.set(this.center.x, 2, this.center.z + 20);
    }

    startFight() {
        this.visible = true;
        this.root.visible = true;
        this.active = true;
        this.rise = 1;
        this.eyeOpen = 1;
        this.tentOut.fill(1);
        this.state = 'idle';
        this.stateT = 0;
        this.cooldown = 1.6;
        this.last = '';
    }

    onPlayerRespawn() {
        if (!this.active || this.dead) return;
        // keep the damage you did (kid-friendly!), just take a breather
        this.cancelAttacks();
        this.state = 'idle';
        this.stateT = 0;
        this.cooldown = 3;
    }

    setDefeated() {
        this.dead = true;
        this.active = false;
        this.visible = false;
        this.root.visible = false;
        this.state = 'dead';
        this.hp = 0;
    }

    cancelAttacks() {
        for (const tn of this.tents) if (tn.mode !== 'idle') this.setTentMode(tn, 'retract');
        for (const w of this.warnings) { w.on = false; w.grp.visible = false; }
        for (const w of this.waves) { w.on = false; w.m.visible = false; }
        this.laser.visible = false;
        this.laserGlow.material.opacity = 0;
        this.laserOn = false;
        this.mouth = 0;
        this.game.audio.loop?.('laser', false);
    }

    enterPhase(p) {
        const g = this.game;
        this.phase = p;
        this.cancelAttacks();
        this.state = 'roar';
        this.stateT = 0;
        this.summoned = false;
        g.hud.announce(p === 2 ? 'GLORBAX IS GETTING MAD!' : 'GLORBAX IS FURIOUS!', p === 2 ? 'PHASE 2' : 'FINAL PHASE');
    }

    die() {
        const g = this.game;
        this.dead = true;
        this.active = false;
        this.cancelAttacks();
        this.state = 'dying';
        this.stateT = 0;
        this.poofT = 0;
        g.audio.play('bossDie', this.pos);
        g.slowMo?.(1.4, 0.35);
        for (const tn of this.tents) this.setTentMode(tn, 'flail');
    }

    // --------------------------------------------------------
    // AI
    // --------------------------------------------------------
    update(dt) {
        if (!this.visible) return;
        this.t += dt;
        this.stateT += dt;
        this.armorToastT -= dt;
        const g = this.game;
        const P = g.player;
        if (this.state !== 'intro') {
            // watch the player, and turn to face them (slowly — circle around it to dodge!)
            this.lookTarget.copy(P.eyePos);
            this.faceYaw = Math.atan2(P.pos.x - this.center.x, P.pos.z - this.center.z);
        }
        if (this.state === 'dying') {
            this.updateDying(dt);
        } else if (this.active) {
            this.think(dt);
        }
        this.updateTentacles(dt);
        this.updateHazards(dt);
        this.animate(dt);
    }

    think(dt) {
        const g = this.game;
        const fr = g.diff.fireRate;
        const rage = this.phase >= 3 ? 1.25 : 1;
        switch (this.state) {
            case 'idle': {
                this.cooldown -= dt * rage * Math.min(1.2, 0.6 + fr * 0.5);
                if (this.cooldown <= 0 && !this.game.player.dead) {
                    let pick;
                    const r = Math.random();
                    if (this.phase === 1) pick = r < 0.6 ? 'slam' : 'spit';
                    else pick = r < 0.4 ? 'slam' : r < 0.68 ? 'spit' : 'laser';
                    if (pick === 'laser' && this.last === 'laser') pick = 'slam';
                    this.last = pick;
                    this.state = pick;
                    this.stateT = 0;
                    if (pick === 'slam') {
                        this.startSlam(0);
                        if (this.phase >= 3) this.startSlam(0.55);
                    }
                    if (pick === 'spit') g.audio.play('bossGurgle', this.pos);
                    if (pick === 'laser') { g.audio.play('laserCharge', this.pos); this.laserBegin(); }
                }
                break;
            }
            case 'slam': {
                if (this.stateT > 1.6 && this.tents.every((tn) => tn.mode === 'idle' || tn.mode === 'stuck' || tn.mode === 'retract')) this.toIdle();
                break;
            }
            case 'spit': {
                const charge = 0.75;
                this.mouth = this.stateT < charge ? easeOut(this.stateT / charge) : Math.max(0, 1 - (this.stateT - charge) / 0.5);
                if (this.stateT >= charge && !this.spat) {
                    this.spat = true;
                    this.spit();
                }
                if (this.stateT > charge + 0.6) { this.spat = false; this.toIdle(); }
                break;
            }
            case 'laser': {
                this.updateLaser(dt);
                break;
            }
            case 'roar': {
                const P = g.player;
                this.mouth = this.stateT < 0.3 ? this.stateT / 0.3 : this.stateT < 1.8 ? 1 : Math.max(0, 1 - (this.stateT - 1.8) / 0.4);
                if (this.stateT > 0.25 && !this.roared) {
                    this.roared = true;
                    g.audio.play('bossRoar', this.pos);
                    P.shake(0.6);
                }
                if (this.stateT > 1.1 && !this.summoned) {
                    this.summoned = true;
                    g.aliens.startWave(4, this.phase - 1);
                    g.hud.toast('GLORBAX called for help! Alien helpers incoming!', 3);
                }
                if (this.stateT > 2.3) { this.roared = false; this.toIdle(1.2); }
                break;
            }
        }
    }

    toIdle(extra = 0) {
        this.state = 'idle';
        this.stateT = 0;
        const base = this.phase === 1 ? rand(1.6, 2.5) : this.phase === 2 ? rand(1.2, 2.1) : rand(0.9, 1.6);
        this.cooldown = base + extra;
    }

    // ----- tentacle slam -----
    slamWindup() {
        const d = this.game.diffKey;
        return (d === 'easy' ? 1.35 : d === 'hard' ? 0.75 : 1.0) * (this.phase >= 3 ? 0.85 : 1);
    }

    startSlam(delay) {
        const P = this.game.player;
        const C = this.center;
        // aim where you are (a little ahead if you're running)
        _v.set(P.pos.x + P.vel.x * 0.25, 0, P.pos.z + P.vel.z * 0.25);
        let dx = _v.x - C.x, dz = _v.z - C.z;
        const d = Math.hypot(dx, dz) || 1;
        const r = clamp(d, RING_IN, RING_OUT);
        dx /= d; dz /= d;
        const tx = C.x + dx * r, tz = C.z + dz * r;
        const ang = Math.atan2(dz, dx);
        let best = null, bestD = 99;
        for (const tn of this.tents) {
            if (tn.mode !== 'idle') continue;
            const da = Math.abs(wrapAngle(tn.angle - ang));
            if (da < bestD) { bestD = da; best = tn; }
        }
        if (!best) return;
        best.target.set(tx, 0, tz);
        best.windup = this.slamWindup();
        best.delay = delay;
        this.setTentMode(best, 'raise');
        best.t = -delay;
        this.showWarning(best.target, best.windup + delay + 0.16);
        setTimeout(() => this.active && this.game.audio.play('bossSlamWarn', best.target), delay * 1000);
    }

    showWarning(p, life) {
        const w = this.warnings.find((x) => !x.on) || this.warnings[0];
        w.on = true;
        w.t = 0;
        w.life = life;
        w.grp.position.set(p.x, 0.05, p.z);
        w.grp.visible = true;
    }

    impact(tn) {
        const g = this.game;
        const P = g.player;
        const Q = tn.target;
        g.effects.dust(Q.x, 0.1, Q.z, 14, 2.2, 0xc8b0ff, 1.1);
        g.effects.sparks(Q.x, 0.4, Q.z, 0xffb07a, 16, 8, 0.2);
        g.effects.ring(Q.x, 0.12, Q.z, 0xff9a6a, 4.6, 0.45);
        g.audio.play('bossSlam', Q);
        const d = Math.hypot(P.pos.x - Q.x, P.pos.z - Q.z);
        if (d < 2.9 && P.pos.y < 1.4) P.hurt(this.dmg(2), _v.set(P.pos.x - Q.x, 0, P.pos.z - Q.z).normalize());
        P.shake(clamp(0.55 - d * 0.025, 0.08, 0.55));
        const w = this.waves.find((x) => !x.on) || this.waves[0];
        w.on = true;
        w.r = 0.6;
        w.x = Q.x;
        w.z = Q.z;
        w.hit = d < 2.9;
        w.m.visible = true;
    }

    // ----- goo spit -----
    spit() {
        const g = this.game;
        const P = g.player;
        const diff = g.diff;
        const n = this.phase === 1 ? 3 : this.phase === 2 ? 4 : 5;
        const origin = this.mouthParts.group.getWorldPosition(_v2);
        origin.addScaledVector(_v3.set(P.pos.x - origin.x, 0, P.pos.z - origin.z).normalize(), 1.2);
        const speed = 9 + diff.boltSpeed * 0.3;
        const tx = P.pos.x + P.vel.x * 0.4 * diff.lead, tz = P.pos.z + P.vel.z * 0.4 * diff.lead;
        const base = Math.atan2(tx - origin.x, tz - origin.z);
        const dist = Math.hypot(tx - origin.x, tz - origin.z);
        const pitch = Math.atan2(P.pos.y + 1.0 - origin.y, dist);
        for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.17;
            _v.set(Math.sin(a) * Math.cos(pitch), Math.sin(pitch), Math.cos(a) * Math.cos(pitch));
            g.combat.alienBolt(origin, _v, speed, diff.damage, 0x9dff5a, 0.85);
        }
        g.audio.play('bossSpit', origin);
        g.effects.sparks(origin.x, origin.y, origin.z, 0x9dff5a, 14, 6, 0.2);
    }

    // ----- eye laser -----
    laserBegin() {
        const P = this.game.player;
        this.laserOn = false;
        this.laserTick = 0;
        this.laserYaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        this.laserPitch = -0.3;
    }

    updateLaser(dt) {
        const g = this.game;
        const P = g.player;
        const charge = 1.3, fire = 1.7;
        const t = this.stateT;
        // aim at your legs, but turn slowly (keep running sideways, or hide!)
        const wantYaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        const flat = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        const wantPitch = Math.atan2(P.pos.y + 0.7 - this.pos.y, flat);
        const d = this.game.diffKey;
        const turn = (this.phase >= 3 ? 0.4 : 0.32) * (d === 'easy' ? 0.75 : d === 'hard' ? 1.3 : 1) * (t < charge ? 1.6 : 1);
        this.laserYaw += clamp(wrapAngle(wantYaw - this.laserYaw), -turn * dt, turn * dt);
        this.laserPitch = damp(this.laserPitch, wantPitch, 5, dt);
        const cp = Math.cos(this.laserPitch);
        this.laserDir.set(Math.sin(this.laserYaw) * cp, Math.sin(this.laserPitch), Math.cos(this.laserYaw) * cp);
        this.laserCast();
        const firing = t >= charge && t < charge + fire;
        if (firing && !this.laserOn) {
            this.laserOn = true;
            g.audio.play('laserFire', this.pos);
        }
        this.eyeGlow.material.opacity = t < charge ? (t / charge) * 0.9 : firing ? 0.95 : Math.max(0, 0.95 - (t - charge - fire) * 3);
        this.eyeGlow.scale.setScalar(4 + Math.sin(this.t * 30) * 0.4);
        const L = this.laser;
        L.visible = t < charge + fire + 0.25;
        const len = this.pos.distanceTo(this.laserHit);
        L.position.copy(this.pos);
        L.quaternion.setFromUnitVectors(_up, this.laserDir);
        const w = t < charge ? 0.05 + (t / charge) * 0.05 : firing ? 0.32 + Math.sin(this.t * 40) * 0.05 : 0.32 * Math.max(0, 1 - (t - charge - fire) * 4);
        L.scale.set(w, len, w);
        L.material.opacity = t < charge ? 0.55 : 0.85;
        this.laserCore.scale.set(0.4, 1, 0.4);
        this.laserCore.visible = firing;
        this.laserGlow.position.copy(this.laserHit);
        this.laserGlow.material.opacity = firing ? 0.9 : t < charge ? 0.3 : 0;
        if (firing) {
            this.laserTick -= dt;
            if (Math.random() < dt * 40) g.effects.sparks(this.laserHit.x, this.laserHit.y + 0.1, this.laserHit.z, 0xff7a5a, 2, 5, 0.14);
            if (Math.random() < dt * 8) g.audio.play('laserBuzz', this.laserHit);
            // does the beam touch you?
            _v.set(P.pos.x, P.pos.y + 0.25, P.pos.z);
            _v2.set(P.pos.x, P.pos.y + 1.6, P.pos.z);
            if (!P.dead && this.laserTick <= 0 && segSegDist(this.pos, this.laserHit, _v, _v2) < 0.6) {
                this.laserTick = 0.6;
                P.hurt(this.dmg(1), _v3.copy(this.laserDir));
            }
        }
        if (t > charge + fire + 0.35) {
            this.laserOn = false;
            this.laser.visible = false;
            this.laserGlow.material.opacity = 0;
            this.eyeGlow.material.opacity = 0;
            this.toIdle();
        }
    }

    // March the beam until it hits a wall, the floor or a pillar
    laserCast() {
        const W = this.game.world;
        const o = this.pos, d = this.laserDir;
        let t = 1.5;
        for (; t < 70; t += 0.35) {
            const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
            if (y < 0.02 || W.isSolid(x, y, z) || W.colliders.pointHit(x, y, z, 0)) break;
        }
        this.laserHit.copy(o).addScaledVector(d, t);
    }

    // ----- dying -----
    updateDying(dt) {
        const g = this.game;
        const t = this.stateT;
        this.poofT -= dt;
        this.mouth = 0.6 + Math.sin(t * 9) * 0.3;
        if (this.poofT <= 0 && t < 3.4) {
            this.poofT = 0.16;
            this.body.getWorldPosition(_v);
            _v.x += rand(-4, 4);
            _v.y += rand(-2, 4);
            _v.z += rand(-4, 4);
            g.effects.poof(_v.x, _v.y, _v.z, rand(1.4, 2.4));
            if (Math.random() < 0.4) g.audio.play('poof', _v);
        }
        if (t > 2.0) this.rise = Math.max(0, 1 - (t - 2.0) / 1.5);
        if (t > 3.5 && !this.bigPoof) {
            this.bigPoof = true;
            const c = this.center;
            for (let i = 0; i < 5; i++) g.effects.poof(c.x + rand(-3, 3), 1 + rand(0, 4), c.z + rand(-3, 3), 4);
            g.effects.sparks(c.x, 4, c.z, 0xffd166, 40, 12, 0.25);
            g.effects.glowFlash(c.x, 4, c.z, 0xffffff, 16, 0.5);
            g.audio.play('bigPoof', c);
            g.player.shake(0.5);
        }
        if (t > 4.0 && this.state === 'dying') {
            this.state = 'dead';
            this.visible = false;
            this.root.visible = false;
            g.level.onBossDefeated();
        }
    }

    // --------------------------------------------------------
    // Tentacles
    // --------------------------------------------------------
    setTentMode(tn, mode) {
        tn.from.P1.copy(tn.P1);
        tn.from.P2.copy(tn.P2);
        tn.from.T.copy(tn.T);
        tn.mode = mode;
        tn.t = 0;
    }

    poseIdle(tn, out) {
        const C = this.center;
        const t = this.t;
        const k = tn.k;
        const sway = Math.sin(t * 0.55 + k * 1.7) * 0.22;
        const a = tn.angle + sway;
        const ca = Math.cos(a), sa = Math.sin(a);
        const reach = 12.4 + Math.sin(t * 0.7 + k) * 1.3;
        const out1 = this.tentOut[k];
        const base = this.baseOf(tn, _v3);
        out.T.set(C.x + ca * reach, 0.5 + Math.max(0, Math.sin(t * 1.3 + k * 2.1)) * 0.7, C.z + sa * reach);
        out.P1.set(base.x + ca * 1.4, base.y + 2.8, base.z + sa * 1.4);
        out.P2.set(C.x + Math.cos(a * 0.98) * 8.3, 2.1 + Math.sin(t * 1.1 + k) * 0.35, C.z + Math.sin(a * 0.98) * 8.3);
        if (out1 < 1) {
            // still coming out of the pit (intro)
            const e = easeOut(out1);
            out.T.lerpVectors(_v.set(base.x, base.y - 3, base.z), out.T, e);
            out.P2.lerpVectors(_v.set(base.x, base.y - 2, base.z), out.P2, e);
            out.P1.lerpVectors(_v.set(base.x, base.y - 1, base.z), out.P1, e);
        }
        return out;
    }

    poseRaise(tn, out, lift = 1) {
        const C = this.center, Q = tn.target;
        const dx = Q.x - C.x, dz = Q.z - C.z;
        const r = Math.hypot(dx, dz) || 1;
        const ux = dx / r, uz = dz / r;
        const base = this.baseOf(tn, _v3);
        const wob = Math.sin(this.t * 14) * 0.25 * lift;
        out.T.set(Q.x - ux * 1.6, 9.5 * lift + wob, Q.z - uz * 1.6);
        out.P1.set(base.x + ux * 1.0, base.y + 6.5, base.z + uz * 1.0);
        out.P2.set(C.x + ux * r * 0.5, 11.5, C.z + uz * r * 0.5);
        return out;
    }

    poseSlam(tn, out) {
        const C = this.center, Q = tn.target;
        const dx = Q.x - C.x, dz = Q.z - C.z;
        const r = Math.hypot(dx, dz) || 1;
        const ux = dx / r, uz = dz / r;
        const base = this.baseOf(tn, _v3);
        const wig = tn.mode === 'stuck' ? Math.sin(this.t * 9 + tn.k) * 0.25 : 0;
        out.T.set(Q.x, 0.5, Q.z);
        out.P1.set(base.x + ux * 1.4, base.y + 5.2, base.z + uz * 1.4);
        out.P2.set(C.x + ux * r * 0.58 - uz * wig, 5.2 + wig, C.z + uz * r * 0.58 + ux * wig);
        return out;
    }

    baseOf(tn, out) {
        const by = this.root.position.y - 1.9;
        return out.set(this.center.x + Math.cos(tn.angle) * 2.5, by, this.center.z + Math.sin(tn.angle) * 2.5);
    }

    updateTentacles(dt) {
        const pose = this._pose || (this._pose = { P1: new THREE.Vector3(), P2: new THREE.Vector3(), T: new THREE.Vector3() });
        const pose2 = this._pose2 || (this._pose2 = { P1: new THREE.Vector3(), P2: new THREE.Vector3(), T: new THREE.Vector3() });
        for (const tn of this.tents) {
            tn.t += dt;
            switch (tn.mode) {
                case 'idle': {
                    this.poseIdle(tn, pose);
                    const r = 6;
                    tn.P1.x = damp(tn.P1.x, pose.P1.x, r, dt); tn.P1.y = damp(tn.P1.y, pose.P1.y, r, dt); tn.P1.z = damp(tn.P1.z, pose.P1.z, r, dt);
                    tn.P2.x = damp(tn.P2.x, pose.P2.x, r, dt); tn.P2.y = damp(tn.P2.y, pose.P2.y, r, dt); tn.P2.z = damp(tn.P2.z, pose.P2.z, r, dt);
                    tn.T.x = damp(tn.T.x, pose.T.x, r, dt); tn.T.y = damp(tn.T.y, pose.T.y, r, dt); tn.T.z = damp(tn.T.z, pose.T.z, r, dt);
                    if (this.state === 'intro' || this.tentOut[tn.k] < 1) { tn.P1.copy(pose.P1); tn.P2.copy(pose.P2); tn.T.copy(pose.T); }
                    break;
                }
                case 'raise': {
                    if (tn.t < 0) { this.poseIdle(tn, pose); tn.P1.copy(pose.P1); tn.P2.copy(pose.P2); tn.T.copy(pose.T); tn.from.P1.copy(pose.P1); tn.from.P2.copy(pose.P2); tn.from.T.copy(pose.T); break; }
                    const k = easeOut(clamp(tn.t / tn.windup, 0, 1));
                    this.poseRaise(tn, pose, 1);
                    tn.P1.lerpVectors(tn.from.P1, pose.P1, k);
                    tn.P2.lerpVectors(tn.from.P2, pose.P2, k);
                    tn.T.lerpVectors(tn.from.T, pose.T, k);
                    if (tn.t >= tn.windup) this.setTentMode(tn, 'slam');
                    break;
                }
                case 'slam': {
                    const k = easeIn(clamp(tn.t / 0.16, 0, 1));
                    this.poseSlam(tn, pose);
                    tn.P1.lerpVectors(tn.from.P1, pose.P1, k);
                    tn.P2.lerpVectors(tn.from.P2, pose.P2, k);
                    tn.T.lerpVectors(tn.from.T, pose.T, k);
                    if (tn.t >= 0.16) {
                        this.impact(tn);
                        this.setTentMode(tn, 'stuck');
                    }
                    break;
                }
                case 'stuck': {
                    this.poseSlam(tn, pose);
                    tn.P1.copy(pose.P1); tn.P2.copy(pose.P2); tn.T.copy(pose.T);
                    if (tn.t > 1.25) this.setTentMode(tn, 'retract');
                    break;
                }
                case 'retract': {
                    const k = easeInOut(clamp(tn.t / 0.7, 0, 1));
                    this.poseIdle(tn, pose);
                    tn.P1.lerpVectors(tn.from.P1, pose.P1, k);
                    tn.P2.lerpVectors(tn.from.P2, pose.P2, k);
                    tn.T.lerpVectors(tn.from.T, pose.T, k);
                    if (tn.t >= 0.7) tn.mode = 'idle';
                    break;
                }
                case 'flail': {
                    // dying: wave around wildly, then droop into the pit
                    this.poseIdle(tn, pose);
                    const f = this.t * 7 + tn.flail;
                    pose.T.y += 3 + Math.sin(f) * 3;
                    pose.T.x += Math.cos(f * 0.7) * 2;
                    pose.T.z += Math.sin(f * 0.9) * 2;
                    pose2.T.copy(pose.T);
                    tn.P1.lerp(pose.P1, 0.2);
                    tn.P2.lerp(pose.P2, 0.2);
                    tn.T.lerp(pose2.T, 0.2);
                    break;
                }
            }
        }
    }

    writeTentacles() {
        const mesh = this.tentMesh;
        let idx = 0;
        const t = this.t;
        for (const tn of this.tents) {
            const B = this.baseOf(tn, _base);
            for (let s = 0; s < N_SEG; s++) {
                const u = (s + 0.5) / N_SEG;
                bez(B, tn.P1, tn.P2, tn.T, u, _v);
                bezD(B, tn.P1, tn.P2, tn.T, u, _bz);
                const segLen = _bz.length() / N_SEG;
                _bz.normalize();
                _bx.crossVectors(_up, _bz);
                if (_bx.lengthSq() < 1e-6) _bx.set(1, 0, 0);
                _bx.normalize();
                _by.crossVectors(_bz, _bx);
                const r = lerp(1.0, 0.26, u) * (1 + Math.sin(t * 3 + s * 0.7 + tn.k) * 0.06);
                _m.makeBasis(_bx.multiplyScalar(r), _by.multiplyScalar(r), _bz.multiplyScalar(Math.max(segLen * 0.95, r * 0.9)));
                _m.setPosition(_v);
                mesh.setMatrixAt(idx++, _m);
                const sp = tn.spheres[s];
                sp.c.copy(_v);
                sp.r = r * 1.05;
            }
        }
        mesh.instanceMatrix.needsUpdate = true;
    }

    // --------------------------------------------------------
    // Warnings, shockwaves
    // --------------------------------------------------------
    updateHazards(dt) {
        const g = this.game;
        const P = g.player;
        for (const w of this.warnings) {
            if (!w.on) continue;
            w.t += dt;
            const k = w.t / w.life;
            const pulse = 0.5 + 0.5 * Math.sin(w.t * (10 + k * 20));
            w.mat.opacity = 0.35 + pulse * 0.5;
            w.fillMat.opacity = 0.12 + k * 0.3;
            w.fill.scale.setScalar(Math.min(1, k));
            if (w.t >= w.life) { w.on = false; w.grp.visible = false; }
        }
        for (const w of this.waves) {
            if (!w.on) continue;
            w.r += dt * 10.5;
            w.m.position.set(w.x, 0.25, w.z);
            w.m.scale.set(w.r, w.r, 3.5);
            w.mat.opacity = Math.max(0, 0.95 - w.r / 13);
            if (!w.hit && !P.dead) {
                const d = Math.hypot(P.pos.x - w.x, P.pos.z - w.z);
                if (Math.abs(d - w.r) < 0.65 && P.pos.y < 0.55) {
                    w.hit = true;
                    P.hurt(this.dmg(1), _v.set(P.pos.x - w.x, 0, P.pos.z - w.z).normalize());
                    g.hud.toast('JUMP over the shockwaves!', 2);
                }
            }
            if (Math.random() < dt * 30) {
                const a = Math.random() * Math.PI * 2;
                g.effects.spawn({ x: w.x + Math.cos(a) * w.r, y: 0.2, z: w.z + Math.sin(a) * w.r, vy: 1.2, life: 0.4, size: 0.5, size1: 1.2, color: 0xffb07a, alpha: 0.6, alpha1: 0, batch: 1 });
            }
            if (w.r > 12.5) { w.on = false; w.m.visible = false; }
        }
    }

    // --------------------------------------------------------
    // Pose the model
    // --------------------------------------------------------
    animate(dt) {
        const t = this.t;
        const C = this.center;
        this.hurtT = Math.max(0, this.hurtT - dt);
        this.flinch = Math.max(0, (this.flinch || 0) - dt * 4);
        const bob = Math.sin(t * 1.25) * 0.35;
        const y = lerp(-16, BODY_Y, easeOut(clamp(this.rise, 0, 1))) + bob * this.rise;
        this.root.position.set(C.x, y, C.z);
        this.root.updateMatrixWorld();
        // turn toward the target (slowly)
        const turn = this.state === 'intro' ? 3 : 1.4;
        this.yaw = dampAngle(this.yaw, this.faceYaw, turn, dt);
        this.body.rotation.set(-this.flinch * 0.18 - (this.state === 'roar' ? 0.25 * Math.min(1, this.stateT * 3) : 0), this.yaw, Math.sin(t * 0.8) * 0.04);
        const breathe = 1 + Math.sin(t * 2.1) * 0.025;
        this.body.scale.set(breathe, 1 / breathe, breathe);
        if (this.state === 'dying') {
            this.body.rotation.z += Math.sin(t * 25) * 0.06;
            this.body.position.x = Math.sin(t * 31) * 0.15;
        }

        // eyelids: open/closed (closed while roaring, blinking now and then)
        this.blinkT -= dt;
        let close = 1 - this.eyeOpen;
        if (this.state === 'roar') close = Math.max(close, this.stateT < 2.0 ? 1 : 1 - (this.stateT - 2.0) / 0.3);
        if (this.state === 'dying') close = 0.45;
        if (this.blinkT < 0) {
            close = Math.max(close, 1 - Math.abs(this.blinkT + 0.09) / 0.09);
            if (this.blinkT < -0.18) this.blinkT = rand(2.5, 5);
        }
        if (this.hurtT > 0) close = Math.max(close, 0.35);
        this.lidClose = clamp(close, 0, 1);
        const lc = this.lidClose;
        this.eye.upper.rotation.x = lerp(-1.15, 0.55, lc);
        this.eye.lower.rotation.x = lerp(1.05, -0.55, lc);
        this.eye.shine.visible = lc < 0.45;
        // the eye follows its target
        this.body.updateMatrixWorld();
        this.eye.group.getWorldPosition(this.pos);
        _v.copy(this.lookTarget).sub(this.pos);
        const localYaw = wrapAngle(Math.atan2(_v.x, _v.z) - this.yaw);
        const pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
        this.lookYaw = damp(this.lookYaw, clamp(localYaw, -0.8, 0.8), 10, dt);
        this.lookPitch = damp(this.lookPitch, clamp(-pitch, -0.6, 0.6), 10, dt);
        if (this.state === 'dying') { this.lookYaw = Math.sin(t * 12) * 0.6; this.lookPitch = Math.cos(t * 12) * 0.4; }
        this.eye.eye.rotation.set(this.lookPitch, this.lookYaw, 0);
        // colors: flash white when hurt, red when furious
        const rage = this.phase >= 3 ? 1 : 0;
        const em = this.eye.mat.emissive;
        if (this.hurtT > 0) em.setRGB(0.8, 0.8, 0.8);
        else em.setRGB(rage * 0.35, 0, 0);
        const bm = this.bodyMesh.material;
        bm.emissive.setRGB(rage * (0.22 + Math.sin(t * 6) * 0.08) + (this.hurtT > 0 ? 0.3 : 0), this.hurtT > 0 ? 0.25 : 0, this.hurtT > 0 ? 0.3 : 0);
        this.tentMat.emissive.copy(bm.emissive);
        // mouth
        const m = this.mouthParts;
        const mo = clamp(this.mouth, 0, 1);
        m.inside.scale.y = 0.3 + mo * 0.75;
        m.jaw.position.y = -0.15 - mo * 0.8;
        m.glow.material.opacity = this.state === 'spit' ? mo * 0.9 : 0;
        m.glow.scale.setScalar(1.5 + mo * 2);
        this.tentMesh.visible = this.tentLine.visible = this.root.visible;
        this.writeTentacles();
    }
}
