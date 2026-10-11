// ============================================================
// ROVER: the LINCOLN-1's emergency rover. It fell out of the cargo bay in
// the crash. Lincoln's idea: commandeer a Mars rover and run over aliens,
// with physics like the Mongoose quad bike in Halo 3.
//
//  Physics: a rigid body on four raycast wheels, each on its own spring
//  (stiffness + damping), so it bounces over bumps and dunes. The tires grip
//  sideways up to a limit and the back grips a little less than the front,
//  so hard turns slide into drifts (Space = handbrake for big slides). The
//  game's own Mars gravity (PLAYER.gravity) gives big floaty jumps, with a
//  little pitch/roll control in the air. It can tip over; "Hold E" flips it
//  back with a cartoon hop. Sub-stepped at 240 Hz, so it acts the same at
//  any frame rate up to the game's 0.05 s frame cap.
//
//  Controls (Halo-style): the mouse / right stick turns the camera, W / the
//  left stick drives toward where the camera looks, S brakes and then
//  reverses, the turret on the back fires at the crosshair.
//
//  Running an alien over above ~6 m/s bowls it into the air (BOING... poof),
//  counted just like a blaster kill. Slower bumps shove it. The Alien Captain
//  can't be run over.
//
//  What the level uses (see CLAUDE.md, "Rover"): place(x, z, yaw, { flipped }),
//  driving, pos, speed, found, onFirstFlip, and game.level.onRoverEnter?.()
//  is called whenever Lincoln gets in.
// ============================================================

import * as THREE from 'three';
import { GeoBuilder, vcMat, addOutline } from './toon.js';
import { createAstronaut, SUIT } from './models.js';
import { PLAYER } from './config.js';
import * as LAYOUT from './layout.js';
import { clamp, lerp, damp, wrapAngle, rand, smoothstep, easeInOut, easeOutBack } from './util.js';

// ------------------------------------------------------------
// Tuning
// ------------------------------------------------------------
export const ROVER = {
    mass: 300,                     // kg
    inertia: [340, 430, 250],      // kg m^2 about the body's x (pitch), y (yaw) and z (roll) axes
    gravity: PLAYER.gravity,       // the game's Mars gravity (m/s^2): the same as Lincoln's and the aliens'
    wheelR: 0.56,                  // balloon tire radius (m)
    mountY: 0.05,                  // where the springs hang from (body space; the body's origin is its center of mass)
    rest: 0.62,                    // spring length with no weight on it (mount to wheel center)
    minLen: 0.14,                  // bump stop
    spring: 4600,                  // N/m, each wheel
    dampBump: 380,                 // N s/m, each wheel, while the spring squashes
    dampRebound: 560,              // ... and while it stretches back out
    bumpStop: 42000,               // N/m past the bump stop
    engine: 3300,                  // N, all four wheels together
    curveTop: 25.5,                // m/s where the engine runs out of push
    drag: 0.5,                     // air drag, N per (m/s)^2
    reverseTop: 9,                 // m/s
    brake: 5400,                   // N
    maxSteer: 0.6,                 // steering angle (rad) at a standstill...
    minSteer: 0.2,                 // ...and at top speed
    gripFront: 1.2,                // how hard the tires can push sideways (x the weight on them)
    gripRear: 1.1,
    slideRear: 0.9,                // the back tires once they're sliding (drifts!)
    yawRate: 2.1,                  // the fastest it's helped to turn (rad/s): the drift assist catches spins
    spinCatch: 4.5,                // how hard the drift assist stops it turning further than you're looking
    turnGrip: 24,                  // ...and at speed it's helped to turn at most turnGrip / speed (rad/s)
    handbrakeRear: 0.4,            // ...with the handbrake on
    slipPeak: 0.17,                // slip angle (rad) where the tires grip hardest
    iceGrip: 0.4,                  // on the frozen lake
    airTilt: 0.32,                 // in the air the stick tips it this far (rad) from level...
    airKp: 9,                      // ...and it turns toward that this eagerly (rad/s^2 per rad)
    airKd: 4.5,                    // with this much damping
    airMax: 6,                     // at most this much angular acceleration (rad/s^2): big tumbles still tumble
    runOver: 6,                    // m/s needed to bowl an alien over
    fireRate: 6.5,                 // turret shots per second
    heatPerShot: 0.06,
    coolRate: 0.6,
    overheatTime: 1.6,
};

const WX = 1.12;
const WHEELS = [
    { x: -WX, z: -1.15, front: true }, { x: WX, z: -1.15, front: true },
    { x: -WX, z: 1.12, front: false }, { x: WX, z: 1.12, front: false },
];
// Points on the hull that can hit the ground (body space): belly, bumpers, tub, the outsides of the
// wheels (when it's on its side), the roll cage and the turret (when it's upside down)
const HULL = [
    [-0.62, -0.38, -1.45], [0.62, -0.38, -1.45], [-0.62, -0.38, 1.45], [0.62, -0.38, 1.45],
    [0, -0.12, -1.72], [0, -0.12, 1.72],
    [-0.64, 0.32, -1.4], [0.64, 0.32, -1.4], [-0.64, 0.32, 1.45], [0.64, 0.32, 1.45],
    [-1.42, -0.36, -1.15], [1.42, -0.36, -1.15], [-1.42, -0.36, 1.12], [1.42, -0.36, 1.12],
    [-0.58, 1.55, 0.85], [0.58, 1.55, 0.85], [0, 2.0, 0.85], [0, 2.3, 0.85],
    [-0.52, 1.1, -0.95], [0.52, 1.1, -0.95], [0, 1.48, -0.95],
];
// Circles (body space, at the center of mass height) that keep it out of walls, rocks and force fields
const SIDES = [[0, -1.0, 0.95], [0, 0.95, 0.95], [-0.75, 0, 0.75], [0.75, 0, 0.75]];
// Edges where steep ground counts as a wall
const EDGES = [[0, -1.7], [0, 1.7], [-1.5, -1.1], [1.5, -1.1], [-1.5, 1.1], [1.5, 1.1]];
// Hit box (body space) for aliens, bolts and Lincoln walking into it
const BOX = { x: 1.45, y0: -0.95, y1: 2.35, z: 1.78 };
const SEAT = new THREE.Vector3(0, -0.15, 0.3);   // where Lincoln's "feet" are for the game (chest = +1.15 m)
const PIVOT_Y = 1.45;                             // the chase camera orbits this high above the rover

const WHITE = SUIT.white, ORANGE = SUIT.orange, SLATE = SUIT.slate;
const TIRE = 0x343a4e, TREAD = 0x22263a, GLASS = SUIT.visorMid, GLASS_LIGHT = SUIT.visorLow, CYAN = 0x6ff0ff;
const OUTLINE = 0x2a1424;

const NO_INPUT = { moveX: 0, moveY: 0, fire: false, interact: false, interactHeld: false, jumpHeld: false, callHeld: false };

// temporaries
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _r = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3();
const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _wf = new THREE.Vector3(), _ws = new THREE.Vector3(), _F = new THREE.Vector3(), _tau = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

// ------------------------------------------------------------
// Model: chunky and toy-like in the LINCOLN-1's colors
// ------------------------------------------------------------
// a unit sphere pushed toward a cube: a rounded box
function roundBox(p = 0.45, ws = 24, hs = 14) {
    const g = new THREE.SphereGeometry(1, ws, hs);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
        const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
        a.setXYZ(i, Math.sign(x) * Math.pow(Math.abs(x), p), Math.sign(y) * Math.pow(Math.abs(y), p), Math.sign(z) * Math.pow(Math.abs(z), p));
    }
    g.computeVertexNormals();
    return g;
}

// the middle of the box around the triangle vertex i belongs to: both triangles of a quad get the same
// value, so painted stripes follow the rows of the mesh and have clean, straight edges
function triCenter(pos, i, out) {
    const j = i - (i % 3);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
        const x = pos.getX(j + k), y = pos.getY(j + k), z = pos.getZ(j + k);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    return out.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

// a straight tube from a to b
function tube(b, a, c, r, color, glow = 0) {
    _v.fromArray(a);
    _v2.fromArray(c);
    const len = _v.distanceTo(_v2);
    _q.setFromUnitVectors(Y, _v3.subVectors(_v2, _v).normalize());
    _m.compose(_v4.addVectors(_v, _v2).multiplyScalar(0.5), _q, _p.set(1, len, 1));
    b.add(new THREE.CylinderGeometry(r, r, 1, 10), color, { matrix: _m }, glow);
}

function bodyGeometry() {
    const b = new GeoBuilder();
    const c = new THREE.Vector3();
    // the tub: white, an orange band around it, a racing stripe on the nose and a slate belly
    b.add(roundBox(0.45, 32, 22), [WHITE, (pos, i, col) => {
        triCenter(pos, i, c);
        if (c.y < -0.25) col.set(SLATE);
        else if (c.y > -0.12 && c.y < 0.0) col.set(ORANGE);
        else if (c.y > 0.2 && Math.abs(c.x) < 0.13 && c.z < -0.85) col.set(ORANGE);
        else col.set(WHITE);
    }], { s: [0.68, 0.38, 1.55] });
    // bumpers
    for (const z of [-1.6, 1.6]) b.add(new THREE.CapsuleGeometry(0.11, 1.12, 4, 12), ORANGE, { p: [0, -0.1, z], r: [0, 0, Math.PI / 2] });
    // headlights: blue glass in slate rims
    for (const sx of [-1, 1]) {
        b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 16), SLATE, { p: [sx * 0.36, 0.13, -1.5], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.SphereGeometry(0.12, 14, 8), GLASS_LIGHT, { p: [sx * 0.36, 0.13, -1.55], s: [1, 1, 0.45] }, 1.1);
    }
    // the "L" badge on the nose (like the patch on Lincoln's suit)
    const badge = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.36, -1.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0)), new THREE.Vector3(1, 1, 1));
    b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24), ORANGE, { matrix: badge });
    b.add(new THREE.BoxGeometry(0.05, 0.04, 0.17), WHITE, { p: [-0.035, 0.03, 0], matrix: badge }, 0.15);
    b.add(new THREE.BoxGeometry(0.12, 0.04, 0.05), WHITE, { p: [0.0, 0.03, 0.06], matrix: badge }, 0.15);
    // seat: a slate cushion and an orange backrest
    b.add(roundBox(0.6, 16, 10), SLATE, { p: [0, 0.44, 0.32], s: [0.32, 0.09, 0.3] });
    b.add(roundBox(0.6, 16, 10), ORANGE, { p: [0, 0.74, 0.64], r: [-0.18, 0, 0], s: [0.3, 0.3, 0.07] });
    // dashboard with a little blue screen, the steering column and a blue windscreen
    b.add(roundBox(0.6, 14, 10), SLATE, { p: [0, 0.44, -0.62], r: [0.3, 0, 0], s: [0.42, 0.12, 0.2] });
    b.add(new THREE.BoxGeometry(0.32, 0.11, 0.02), GLASS, { p: [0, 0.55, -0.52], r: [-0.6, 0, 0] }, 0.6);
    tube(b, [0, 0.45, -0.5], [0, 0.72, -0.14], 0.045, SLATE);
    b.add(new THREE.BoxGeometry(0.66, 0.28, 0.03), [GLASS, (pos, i, col) => {
        triCenter(pos, i, c);
        col.set(c.y > 0.78 ? GLASS_LIGHT : GLASS);
    }], { p: [0, 0.74, -0.84], r: [-0.45, 0, 0] }, 0.25);
    // the engine on the back deck, with two little nozzles like Lincoln's backpack
    b.add(roundBox(0.6, 16, 10), SLATE, { p: [0, 0.48, 1.18], s: [0.4, 0.13, 0.26] });
    for (const sx of [-1, 1]) b.add(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 12), SLATE, { p: [sx * 0.24, 0.12, 1.58], r: [Math.PI / 2, 0, 0] });
    // open roll cage: a tall hoop behind the seat, a low one in front, rails between them and braces
    const R1 = 0.6, H1 = 1.38, ZR = 0.85, R2 = 0.58, H2 = 0.9, ZF = -0.95;
    b.add(new THREE.TorusGeometry(R1, 0.055, 8, 22, Math.PI), WHITE, { p: [0, H1, ZR] });
    b.add(new THREE.TorusGeometry(R2, 0.05, 8, 20, Math.PI), WHITE, { p: [0, H2, ZF] });
    const a1 = 0.8, a2 = 0.7;
    for (const sx of [-1, 1]) {
        tube(b, [sx * R1, H1, ZR], [sx * R1, 0.3, ZR], 0.055, WHITE);
        tube(b, [sx * R2, H2, ZF], [sx * 0.6, 0.3, ZF], 0.05, WHITE);
        const top1 = [sx * R1 * Math.cos(a1), H1 + R1 * Math.sin(a1), ZR], top2 = [sx * R2 * Math.cos(a2), H2 + R2 * Math.sin(a2), ZF];
        tube(b, top1, top2, 0.045, WHITE);
        tube(b, [sx * R1, 1.15, ZR], [sx * 0.45, 0.4, 1.45], 0.045, WHITE);
        for (const p of [top1, top2, [sx * R1, H1, ZR], [sx * R2, H2, ZF], [sx * R1, 0.32, ZR], [sx * 0.6, 0.32, ZF]]) {
            b.add(new THREE.SphereGeometry(0.075, 10, 8), ORANGE, { p });
        }
    }
    // the turret's base on top of the rear hoop
    b.add(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 16), SLATE, { p: [0, H1 + R1 + 0.06, ZR] });
    return b.build();
}

function wheelGeometry() {
    const b = new GeoBuilder();
    const c = new THREE.Vector3();
    // a fat balloon tire with chunky treads
    const prof = [[0.25, -0.25], [0.36, -0.27], [0.46, -0.255], [0.53, -0.2], [0.555, -0.1], [0.565, 0], [0.555, 0.1], [0.53, 0.2], [0.46, 0.255], [0.36, 0.27], [0.25, 0.25]]
        .map(([r, y]) => new THREE.Vector2(r, y));
    b.add(new THREE.LatheGeometry(prof, 32), [TIRE, (pos, i, col) => {
        triCenter(pos, i, c);
        const ang = Math.atan2(c.z, c.y), rad = Math.hypot(c.y, c.z);
        col.set(rad > 0.5 && Math.floor((ang / (Math.PI * 2) + 1) * 16) % 2 ? TREAD : TIRE);
    }], { r: [0, 0, Math.PI / 2] });
    // white hubs with orange caps and lug nuts, both sides
    b.add(new THREE.CylinderGeometry(0.26, 0.26, 0.47, 20), WHITE, { r: [0, 0, Math.PI / 2] });
    for (const sx of [-1, 1]) {
        b.add(new THREE.SphereGeometry(0.13, 14, 8), ORANGE, { p: [sx * 0.235, 0, 0], s: [0.45, 1, 1] });
        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            b.add(new THREE.SphereGeometry(0.03, 6, 4), SLATE, { p: [sx * 0.24, Math.cos(a) * 0.19, Math.sin(a) * 0.19] });
        }
    }
    return b.build();
}

// suspension arm: two bars from the hinge (x = 0) to the hub (x = 1)
function armGeometry() {
    const b = new GeoBuilder();
    for (const z of [-0.11, 0.11]) b.add(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), SLATE, { p: [0.5, 0, z], r: [0, 0, Math.PI / 2] });
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10), SLATE, { p: [0.96, 0, 0], r: [Math.PI / 2, 0, 0] });
    return b.build();
}

// spring + shock absorber from y = 0 (top) to y = 1 (bottom): the coil squashes as it's scaled
function shockGeometry() {
    const b = new GeoBuilder();
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), SLATE, { p: [0, 0.5, 0] });
    for (let k = 0; k < 7; k++) b.add(new THREE.TorusGeometry(0.075, 0.02, 5, 14), ORANGE, { p: [0, 0.15 + k * 0.11, 0], r: [Math.PI / 2, 0, 0] });
    return b.build();
}

function handlebarGeometry() {
    const b = new GeoBuilder();
    tube(b, [-0.44, 0.03, 0.08], [-0.16, 0, 0], 0.035, SLATE);
    tube(b, [-0.16, 0, 0], [0.16, 0, 0], 0.035, SLATE);
    tube(b, [0.16, 0, 0], [0.44, 0.03, 0.08], 0.035, SLATE);
    for (const sx of [-1, 1]) b.add(new THREE.CapsuleGeometry(0.05, 0.14, 4, 10), ORANGE, { p: [sx * 0.4, 0.025, 0.065], r: [0, -sx * 0.28, Math.PI / 2] });
    b.add(new THREE.SphereGeometry(0.07, 10, 8), SLATE, {});
    return b.build();
}

function turretGeometry() {
    const b = new GeoBuilder();
    b.add(new THREE.SphereGeometry(0.22, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), WHITE, { p: [0, 0, 0], s: [1, 0.8, 1] });
    b.add(new THREE.TorusGeometry(0.215, 0.03, 6, 22), ORANGE, { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0] });
    b.add(new THREE.SphereGeometry(0.05, 8, 6), CYAN, { p: [0, 0.17, 0.08] }, 1.4);
    return b.build();
}

function barrelGeometry() {
    const b = new GeoBuilder();
    b.add(roundBox(0.6, 12, 8), ORANGE, { p: [0, 0, -0.08], s: [0.17, 0.09, 0.15] });
    for (const sx of [-1, 1]) {
        b.add(new THREE.CylinderGeometry(0.045, 0.05, 0.46, 12), SLATE, { p: [sx * 0.085, 0, -0.36], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.TorusGeometry(0.052, 0.018, 6, 14), CYAN, { p: [sx * 0.085, 0, -0.6] }, 1.5);
        b.add(new THREE.TorusGeometry(0.058, 0.016, 6, 14), ORANGE, { p: [sx * 0.085, 0, -0.42] });
    }
    return b.build();
}

function antennaGeometry() {
    const b = new GeoBuilder();
    b.add(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), SLATE, { p: [0, 0.04, 0] });
    tube(b, [0, 0, 0], [0, 1.25, 0], 0.016, SLATE);
    b.add(new THREE.SphereGeometry(0.06, 10, 8), SUIT.beacon, { p: [0, 1.28, 0] }, 1.3);
    b.add(new THREE.BoxGeometry(0.02, 0.14, 0.24), ORANGE, { p: [0, 1.08, 0.13] });
    return b.build();
}

// Point an astronaut's arm (it hangs down its -Y) at a world position
const _down = new THREE.Vector3(0, -1, 0);
function pointLimb(limb, target) {
    limb.parent.updateMatrixWorld(true);
    _v.copy(target);
    limb.parent.worldToLocal(_v).sub(limb.position).normalize();
    limb.quaternion.setFromUnitVectors(_down, _v);
}

// ------------------------------------------------------------
// Engine and skid sounds: its own loops (cutscenes drive audio.engine())
// ------------------------------------------------------------
class RoverAudio {
    constructor(A) {
        this.A = A;
    }

    ready() {
        const A = this.A;
        if (!A || !A.ctx || !A.sfx) return false;
        const ctx = A.ctx;
        if (!this.bus) {
            this.bus = ctx.createGain();
            this.bus.gain.value = 0;
            this.bus.connect(A.sfx);
            // a synthesized engine (used until the recorded loop has loaded, and with the classic sounds)
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = 45;
            const o2 = ctx.createOscillator();
            o2.type = 'square';
            o2.frequency.value = 22.5;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 400;
            const g = ctx.createGain();
            g.gain.value = 0;
            const g2 = ctx.createGain();
            g2.gain.value = 0.5;
            o.connect(lp);
            o2.connect(g2);
            g2.connect(lp);
            lp.connect(g);
            g.connect(this.bus);
            o.start();
            o2.start();
            this.synth = { o, o2, lp, g };
            // tire skid: hissy noise
            const src = ctx.createBufferSource();
            src.buffer = A.noiseBuf;
            src.loop = true;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 1700;
            bp.Q.value = 0.9;
            const sg = ctx.createGain();
            sg.gain.value = 0;
            src.connect(bp);
            bp.connect(sg);
            sg.connect(this.bus);
            src.start();
            this.skid = { g: sg, bp };
        }
        if (!this.loop && !A.classicSfx && A.bank && A.bank.loopReady('engine')) this.loop = A.bank.loop('engine', this.bus, 0);
        return true;
    }

    // on: engine running; k: speed 0..1; throttle 0..1; skid 0..1
    set(on, k, throttle, skid) {
        if (!this.ready()) return;
        const t = this.A.ctx.currentTime;
        this.bus.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.08 : 0.15);
        if (!on && this.wasOn === false) return;
        this.wasOn = on;
        const files = !!this.loop && !this.A.classicSfx;
        if (this.loop) {
            this.loop.g.gain.setTargetAtTime(files ? this.loop.gain * (0.75 + 0.45 * throttle) : 0, t, 0.08);
            this.loop.src.playbackRate.setTargetAtTime(0.62 + 0.8 * k + 0.12 * throttle, t, 0.08);
        }
        const S = this.synth;
        S.g.gain.setTargetAtTime(files ? 0 : 0.05 + 0.05 * throttle, t, 0.08);
        S.o.frequency.setTargetAtTime(40 + 70 * k + 12 * throttle, t, 0.08);
        S.o2.frequency.setTargetAtTime(20 + 35 * k + 6 * throttle, t, 0.08);
        S.lp.frequency.setTargetAtTime(300 + 900 * k + 300 * throttle, t, 0.1);
        this.skid.g.gain.setTargetAtTime(on ? clamp(skid, 0, 1) * 0.11 : 0, t, 0.05);
        this.skid.bp.frequency.setTargetAtTime(1300 + 900 * clamp(skid, 0, 1), t, 0.1);
    }
}

// ------------------------------------------------------------
// The rover
// ------------------------------------------------------------
export class Rover {
    constructor(game) {
        this.game = game;
        // ---- what the level can read ----
        this.placed = false;           // in the world (it's hidden until the level places it)
        this.driving = false;          // Lincoln is in it
        this.found = false;            // flipped upright / driven at least once (then "Hold R" can call it)
        this.pos = new THREE.Vector3(); // center of the body (about 0.9 m above the ground at rest)
        this.speed = 0;                // m/s
        this.onFirstFlip = null;       // called when the player flips a not-yet-found rover upright
        // ---- physics ----
        this.vel = new THREE.Vector3();
        this.q = new THREE.Quaternion();
        this.angVel = new THREE.Vector3();
        this.invI = new THREE.Vector3(1 / ROVER.inertia[0], 1 / ROVER.inertia[1], 1 / ROVER.inertia[2]);
        this.wheels = WHEELS.map((w) => ({ ...w, len: ROVER.rest, comp: 0, contact: false, was: false, spin: 0, spinV: 0, slip: 0, load: 0, gy: 0 }));
        this.steer = 0;
        this.throttle = 0;
        this.onGround = 0;             // wheels touching
        this.airT = 0;
        this.upsideT = 0;
        this.flipped = false;          // on its side or upside down: "Hold E" to flip it
        this.flip = null;              // the flip-back hop in progress
        this.popT = 0;                 // materializing after being called
        this.pathS = 0;
        this.lastSafe = { x: 0, z: 0, yaw: 0, ok: false };
        // ---- turret ----
        this.heat = 0;
        this.overheated = false;
        this.overheatT = 0;
        this.fireT = 0;
        this.sinceFire = 1;
        this.barrel = 0;
        this.kickT = 0;
        // ---- feel ----
        this.holdE = 0;
        this.holdR = 0;
        this.cam = { mode: 'off', t: 0, from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), fromFov: 75, pivot: new THREE.Vector3(), pivotV: new THREE.Vector3(), dist: 6, fov: 75 };
        this.landT = 0;
        this.bonkT = 0;
        this.dustT = 0;
        this.skidK = 0;
        this.exitHintT = 0;
        this.bowls = [];
        this.shoves = new Map();
        this.diveRolls = new Map();
        this.ant = { x: 0, z: 0, vx: 0, vz: 0 };
        this.prevVel = new THREE.Vector3();
        this.accel = new THREE.Vector3();
        this.seatK = 0;
        this.hidVM = false;
        this.sound = new RoverAudio(game.audio);
    }

    // --------------------------------------------------------
    // Building the model (added to the Mars scene once, hidden)
    // --------------------------------------------------------
    build() {
        const g = this.game;
        const mat = vcMat();
        const mk = (geo, parent, outline = true, shadow = true) => {
            const m = new THREE.Mesh(geo, mat);
            m.castShadow = shadow;
            if (outline) addOutline(m, OUTLINE, 0.0035);
            parent.add(m);
            return m;
        };
        this.root = new THREE.Group();
        this.root.visible = false;
        g.scene.add(this.root);
        this.body = new THREE.Group();
        this.root.add(this.body);
        mk(bodyGeometry(), this.body);

        // wheels on suspension arms with springs
        const wheelGeo = wheelGeometry(), armGeo = armGeometry(), shockGeo = shockGeometry();
        for (const w of this.wheels) {
            const sx = Math.sign(w.x);
            w.group = new THREE.Group();
            this.body.add(w.group);
            w.mesh = mk(wheelGeo, w.group);
            w.hinge = new THREE.Vector3(sx * 0.48, -0.16, w.z);
            w.arm = new THREE.Group();
            w.arm.position.copy(w.hinge);
            this.body.add(w.arm);
            mk(armGeo, w.arm, true, false);
            w.top = new THREE.Vector3(sx * 0.46, 0.3, w.z);
            w.shock = new THREE.Group();
            w.shock.position.copy(w.top);
            this.body.add(w.shock);
            mk(shockGeo, w.shock, false, false);
        }
        // handlebars (they turn with the front wheels)
        this.bars = new THREE.Group();
        this.bars.position.set(0, 0.72, -0.12);
        this.bars.rotation.x = -0.35;
        this.body.add(this.bars);
        mk(handlebarGeometry(), this.bars, true, false);
        this.grips = [-1, 1].map((sx) => {
            const o = new THREE.Object3D();
            o.position.set(sx * 0.4, 0.03, 0.07);
            this.bars.add(o);
            return o;
        });
        // the swiveling blaster turret on the back (on top of the roll cage)
        this.turret = new THREE.Group();
        this.turret.position.set(0, 2.06, 0.85);
        this.body.add(this.turret);
        mk(turretGeometry(), this.turret);
        this.gun = new THREE.Group();
        this.gun.position.set(0, 0.12, 0);
        this.turret.add(this.gun);
        mk(barrelGeometry(), this.gun);
        this.muzzles = [-1, 1].map((sx) => {
            const o = new THREE.Object3D();
            o.position.set(sx * 0.085, 0, -0.64);
            this.gun.add(o);
            return o;
        });
        this.turretYaw = 0;
        this.turretPitch = 0;
        // a little antenna that wobbles
        this.antenna = new THREE.Group();
        this.antenna.position.set(0.5, 0.36, 1.38);
        this.body.add(this.antenna);
        mk(antennaGeometry(), this.antenna, true, false);

        // Lincoln, riding it out in the open like the Mongoose
        const a = createAstronaut();
        a.sit = 1;
        a.root.position.set(0, 0.14, 0.32);
        a.root.rotation.y = Math.PI;
        a.root.visible = false;
        this.body.add(a.root);
        this.astro = a;
        this.updateVisuals(0);
    }

    // --------------------------------------------------------
    // The level's interface
    // --------------------------------------------------------
    // Put the rover in the world (yaw: 0 faces -Z, like the camera). flipped = upside down, waiting for "Hold E"
    place(x, z, yaw = 0, opts = {}) {
        const g = this.game;
        if (this.driving) this.dismount(true);
        this.placed = true;
        this.root.visible = true;
        this.root.scale.setScalar(1);
        this.popT = 0;
        this.flip = null;
        this.q.setFromAxisAngle(Y, yaw);
        if (opts.flipped) this.q.multiply(_q.setFromAxisAngle(Z, Math.PI));
        const gy = g.world.groundAt(x, z);
        this.pos.set(x, gy + (opts.flipped ? 2.45 : 0.95), z);
        this.vel.set(0, 0, 0);
        this.angVel.set(0, 0, 0);
        this.steer = this.throttle = 0;
        for (const w of this.wheels) { w.comp = 0; w.contact = w.was = false; w.len = ROVER.rest; w.spinV = 0; }
        this.found = !opts.flipped;
        this.flipped = !!opts.flipped;
        this.upsideT = opts.flipped ? 1 : 0;
        this.cam.pivot.set(x, gy + PIVOT_Y + 0.9, z);
        this.cam.pivotV.set(0, 0, 0);
        // let it settle onto the ground before anyone sees it
        this.landHit = 0;
        for (let i = 0; i < 150; i++) this.step(1 / 120, null);
        this.landHit = 0;
        this.bonk = 0;
        this.vel.set(0, 0, 0);
        this.angVel.set(0, 0, 0);
        this.speed = 0;
        this.checkUpright(1);
        if (!this.flipped) this.saveSafe();
        this.updateVisuals(0);
        return this;
    }

    get yaw() {
        _fwd.set(0, 0, -1).applyQuaternion(this.q);
        return Math.atan2(-_fwd.x, -_fwd.z);
    }

    // --------------------------------------------------------
    // Per frame (before the aliens and bolts)
    // --------------------------------------------------------
    update(dt, inp) {
        if (!this.placed) return;
        const g = this.game;
        const P = g.player;
        inp = inp || NO_INPUT;
        this.prevVel.copy(this.vel);
        const ctl = this.driving && !P.dead ? this.controls(inp, dt) : null;
        if (!ctl) {
            this.steer = damp(this.steer, 0, 4, dt);
            this.throttle = damp(this.throttle, 0, 8, dt);
        }
        if (this.flip) this.updateFlip(dt);
        // physics, sub-stepped at 240 Hz
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / n;
        this.landHit = 0;
        for (let i = 0; i < n; i++) this.step(h, ctl);
        this.speed = this.vel.length();
        _t.copy(this.pos);
        this.pathS = g.world.confinePlayer(_t, 1);
        this.accel.subVectors(this.vel, this.prevVel).divideScalar(Math.max(dt, 1e-4));
        this.checkUpright(dt);
        this.recover();
        if (this.landHit > 0) this.onLanding(this.landHit);

        if (this.driving) {
            if (ctl) this.updateTurret(dt, inp);
            // Lincoln rides along: the game treats him as being in the seat
            P.pos.copy(SEAT).applyQuaternion(this.q).add(this.pos);
            P.vel.copy(this.vel);
            P.onGround = true;
            P.pathS = this.pathS;
            P.updateEye();
            P.pitch = clamp(P.pitch, -1.0, 0.42);
        } else {
            this.coolTurret(dt);
            if (!P.dead) this.pushPlayer(P);
        }
        this.hitAliens(dt);
        this.effectsAndSound(dt, ctl);
        this.updateVisuals(dt);
        this.updateCam(dt);
    }

    // --------------------------------------------------------
    // Controls: Halo style. The stick (or WASD) points where to go, relative to the camera.
    // --------------------------------------------------------
    controls(inp, dt) {
        const P = this.game.player;
        const T = ROVER;
        _fwd.set(0, 0, -1).applyQuaternion(this.q);
        const vF = this.vel.dot(_fwd);
        const heading = Math.atan2(-_fwd.x, -_fwd.z);
        const mx = inp.moveX || 0, my = inp.moveY || 0;
        const mag = Math.min(1, Math.hypot(mx, my));
        let throttle = 0, brake = 0, steer = 0, e = 0;
        if (mag > 0.15) {
            if (my < -0.3 && Math.abs(mx) < -my * 1.2) {
                // pulling back: brake, then reverse (the front still swings toward the camera)
                if (vF > 1.2) brake = mag;
                else throttle = -mag;
                e = wrapAngle(P.yaw - heading);
                steer = vF < 0.5 ? -clamp(e * 1.4, -1, 1) : clamp(e * 1.4, -1, 1);
            } else {
                const want = P.yaw - Math.atan2(mx, my);
                e = wrapAngle(want - heading);
                steer = clamp(e * 1.5, -1, 1);
                if (vF < -1.5) brake = mag;       // rolling backwards: stop first
                else throttle = mag * (Math.abs(e) > 2.0 && vF > 8 ? 0.4 : 1);
            }
        }
        const k = clamp(Math.abs(vF) / 24, 0, 1);
        const maxSteer = lerp(T.maxSteer, T.minSteer, k);
        this.steer = damp(this.steer, steer * maxSteer, 9, dt);
        this.throttle = damp(this.throttle, Math.abs(throttle), 8, dt);
        // engine push falls off near top speed (and in reverse)
        let drive = 0;
        if (throttle > 0) drive = throttle * T.engine * Math.max(0, 1 - Math.pow(Math.max(0, vF) / T.curveTop, 4));
        else if (throttle < 0) drive = throttle * T.engine * 0.7 * Math.max(0, 1 - Math.pow(Math.max(0, -vF) / T.reverseTop, 2));
        // how fast it should be turning to face where you want to go (the drift assist works toward this)
        // (slower at high speed, about what the tires can follow, so the slide stays a drift and not a spin)
        const yawRate = clamp(e * 2.4, -1, 1) * Math.min(T.yawRate, 0.3 + Math.abs(vF) * 0.25, T.turnGrip / Math.max(1, this.speed));
        return { drive, brake: brake * T.brake, handbrake: !!inp.jumpHeld, coast: !throttle && !brake, pitch: my, roll: mx, yawRate };
    }

    // --------------------------------------------------------
    // One physics sub-step
    // --------------------------------------------------------
    step(h, ctl) {
        const T = ROVER;
        const W = this.game.world;
        const M = T.mass;
        const q = this.q, pos = this.pos, vel = this.vel, w = this.angVel;
        _up.set(0, 1, 0).applyQuaternion(q);
        _fwd.set(0, 0, -1).applyQuaternion(q);
        _right.set(1, 0, 0).applyQuaternion(q);
        const F = _F.set(0, -M * T.gravity, 0);
        const tau = _tau.set(0, 0, 0);
        const flipping = !!this.flip;
        let ground = 0, gySum = 0;
        const ice = this.onIce();

        // ---- wheels: springs + tires ----
        for (const wh of this.wheels) {
            wh.was = wh.contact;
            wh.contact = false;
            if (flipping) { wh.len = damp(wh.len, T.rest, 10, h); continue; }
            // the ray down from the spring's mount (along the body's down) to the ground
            const mx = pos.x + _right.x * wh.x + _up.x * T.mountY + _fwd.x * -wh.z;
            const my = pos.y + _right.y * wh.x + _up.y * T.mountY + _fwd.y * -wh.z;
            const mz = pos.z + _right.z * wh.x + _up.z * T.mountY + _fwd.z * -wh.z;
            const dy = -_up.y;
            if (dy > -0.3) { wh.len = damp(wh.len, T.rest, 10, h); wh.comp = 0; continue; }
            let t = (my - W.groundAt(mx, mz)) / -dy;
            for (let k = 0; k < 2; k++) {
                const px = mx - _up.x * t, pz = mz - _up.z * t;
                t = (my - W.groundAt(px, pz)) / -dy;
            }
            const reach = T.rest + T.wheelR;
            if (!(t < reach) || t < -1.5) { wh.len = damp(wh.len, T.rest, 12, h); wh.comp = 0; continue; }
            const len = t - T.wheelR;
            const comp = T.rest - len;
            // how fast the spring is squashing (from the last step, or the mount's speed on first touch)
            _r.set(mx - pos.x, my - pos.y, mz - pos.z);
            const pv = this.pointVel(_r, _v);
            const cv = wh.was ? (comp - wh.comp) / h : -pv.dot(_up);
            wh.comp = comp;
            wh.len = Math.max(len, T.minLen * 0.5);
            let Fs = T.spring * comp + (cv > 0 ? T.dampBump : T.dampRebound) * cv;
            if (len < T.minLen) Fs += T.bumpStop * (T.minLen - len) + 1500 * Math.max(0, cv);
            Fs = Math.max(0, Fs);
            if (!wh.was && cv > 4.5) this.landHit = Math.max(this.landHit, cv);
            wh.contact = true;
            wh.load = Fs;
            ground++;
            // contact point on the ground
            const cx = mx - _up.x * t, cy = my - _up.y * t, cz = mz - _up.z * t;
            wh.gy = cy;
            gySum += cy;
            F.addScaledVector(_up, Fs);
            tau.add(_v2.copy(_r).cross(_v3.copy(_up).multiplyScalar(Fs)));
            // the tire's own forward and sideways directions, flat on the ground
            W.normalAt(cx, cz, _n);
            const st = wh.front ? this.steer : 0;
            _wf.copy(_fwd).multiplyScalar(Math.cos(st)).addScaledVector(_right, -Math.sin(st));
            _wf.addScaledVector(_n, -_wf.dot(_n)).normalize();
            _ws.crossVectors(_wf, _n);
            _r.set(cx - pos.x, cy - pos.y, cz - pos.z);
            const cvel = this.pointVel(_r, _v);
            const vLong = cvel.dot(_wf), vLat = cvel.dot(_ws);
            wh.spinV = vLong / T.wheelR;
            const surf = ice ? T.iceGrip : 1;
            // sideways grip (slip angle, so it gets slidey at speed); the back lets go first -> drifts
            const alpha = Math.atan2(vLat, Math.max(Math.abs(vLong), 3));
            const ratio = alpha / T.slipPeak;
            let mu = wh.front ? T.gripFront : lerp(T.gripRear, T.slideRear, smoothstep(1.3, 2.6, Math.abs(ratio)));
            if (!wh.front && ctl && ctl.handbrake) mu = T.handbrakeRear;
            mu *= surf;
            const mEff = M / 4;
            let Fy = -clamp(ratio, -1, 1) * mu * Fs;
            const maxFy = Math.abs(vLat) * mEff / h;
            if (Math.abs(Fy) > maxFy) Fy = Math.sign(Fy) * maxFy;
            // forward push / brakes / rolling
            let Fx = 0;
            if (ctl) {
                Fx += ctl.drive / 4;
                const stopF = Math.abs(vLong) * mEff / h;
                if (ctl.brake > 0) Fx -= Math.sign(vLong) * Math.min(ctl.brake / 4, stopF);
                if (ctl.handbrake && !wh.front) Fx -= Math.sign(vLong) * Math.min(0.9 * Fs * surf, stopF);
                Fx -= vLong * (ctl.coast ? 9 : 2);
            } else {
                // nobody driving: it rolls to a stop
                Fx -= Math.sign(vLong) * Math.min(Fs * 0.5 * surf, Math.abs(vLong) * mEff / h);
            }
            // one tire can only push so hard in total (pushing hard on the back tires makes them slide)
            const lim = Math.max(mu, 0.35 * surf) * Fs * 1.1;
            const tot = Math.hypot(Fx, Fy);
            if (tot > lim && tot > 0) { Fx *= lim / tot; Fy *= lim / tot; }
            wh.slip = Math.abs(vLat) + (tot >= lim ? Math.abs(Fx) / Math.max(Fs, 1) * 2 : 0);
            // apply it a little above the ground (tires pushing right at the ground roll it over too easily)
            const lift = _r.dot(_up) * -0.5;
            _r.addScaledVector(_up, lift);
            _v2.copy(_wf).multiplyScalar(Fx).addScaledVector(_ws, Fy);
            F.add(_v2);
            tau.add(_v3.copy(_r).cross(_v2));
        }
        this.onGround = ground;
        this.groundY = ground ? gySum / ground : W.groundAt(pos.x, pos.z);

        // ---- air drag ----
        const sp = vel.length();
        F.addScaledVector(vel, -T.drag * sp);

        // ---- integrate ----
        vel.addScaledVector(F, h / M);
        this.applyInvI(tau, _v);
        w.addScaledVector(_v, h);
        if (!ground && !flipping) {
            // In the air it leans back toward level, like a cat, so a kid holding W lands on the wheels. The stick
            // tips it a little: W / S nose down / up, A / D roll. Only pitch and roll: a spin keeps spinning.
            const tp = ctl ? clamp(ctl.pitch, -1, 1) * T.airTilt : 0, tr = ctl ? clamp(ctl.roll, -1, 1) * T.airTilt : 0;
            const fl = Math.hypot(_fwd.x, _fwd.z);
            if (fl > 0.2) {
                const fx = _fwd.x / fl, fz = _fwd.z / fl;
                // the "up" it wants: world up tipped forward by tp and toward its right side by tr...
                _v2.set(fx * Math.sin(tp) - fz * Math.sin(tr), Math.cos(tp) * Math.cos(tr), fz * Math.sin(tp) + fx * Math.sin(tr)).normalize();
                // ...and, coming down onto a slope (a dune, a ramp), lined up with the ground it's about to land on
                const above = pos.y - W.groundAt(pos.x, pos.z);
                if (above < 3.5) {
                    this.slopeAt(pos.x, pos.z, _n);
                    _v2.lerp(_n, clamp(1 - (above - 1) / 2.5, 0, 1) * 0.8).normalize();
                }
                const k = _up.y > -0.2 ? 1 : 0.35;    // (much weaker once it's upside down)
                _v.crossVectors(_up, _v2).multiplyScalar(T.airKp * k);
                const wy = w.dot(_up);
                _v3.copy(w).addScaledVector(_up, -wy);
                _v.addScaledVector(_v3, -T.airKd * k);
                const al = _v.length();
                if (al > T.airMax) _v.multiplyScalar(T.airMax / al);
                w.addScaledVector(_v, h);
            }
        } else if (ground >= 2 && !flipping) {
            // drift assist: the back slides out in hard turns, but it's caught before it spins round
            // (unless you hold the handbrake), and it straightens out once it faces where you look
            const wy = w.dot(_up);
            const want = ctl ? ctl.yawRate : 0;
            const over = Math.sign(wy) !== Math.sign(want) || Math.abs(wy) > Math.abs(want);
            const k = ctl && ctl.handbrake ? 0.6 : over ? T.spinCatch : 0.8;
            w.addScaledVector(_up, clamp((want - wy) * k, -7, 7) * h);
        }
        if (flipping) w.set(0, 0, 0);
        pos.addScaledVector(vel, h);
        if (!flipping) {
            _q.set(w.x * h * 0.5, w.y * h * 0.5, w.z * h * 0.5, 0).multiply(q);
            q.set(q.x + _q.x, q.y + _q.y, q.z + _q.z, q.w + _q.w).normalize();
        }

        // ---- the hull hitting the ground ----
        this.hullContacts(h);
        // ---- walls, rocks, force fields, the ship's dome ----
        this.walls();
    }

    // velocity of a body point (r = point - center of mass)
    pointVel(r, out) {
        return out.crossVectors(this.angVel, r).add(this.vel);
    }

    // world inverse inertia times v
    applyInvI(v, out) {
        _qi.copy(this.q).invert();
        out.copy(v).applyQuaternion(_qi);
        out.x *= this.invI.x; out.y *= this.invI.y; out.z *= this.invI.z;
        return out.applyQuaternion(this.q);
    }

    impulse(J, r) {
        this.vel.addScaledVector(J, 1 / ROVER.mass);
        this.applyInvI(_v4.crossVectors(r, J), _v4);
        this.angVel.add(_v4);
    }

    // how hard it is to change the speed of point r along direction n
    effMass(r, n) {
        _v4.crossVectors(r, n);
        this.applyInvI(_v4, _v4);
        _v4.cross(r);
        return 1 / ROVER.mass + n.dot(_v4);
    }

    hullContacts() {
        const W = this.game.world;
        const pos = this.pos;
        let deepest = 0;
        const nd = _t.set(0, 1, 0);
        for (const hp of HULL) {
            _r.set(hp[0], hp[1], hp[2]).applyQuaternion(this.q);
            const px = pos.x + _r.x, py = pos.y + _r.y, pz = pos.z + _r.z;
            const gy = W.groundAt(px, pz);
            if (py >= gy) continue;
            W.normalAt(px, pz, _n);
            const pen = (gy - py) * _n.y;
            const pv = this.pointVel(_r, _v);
            const vn = pv.dot(_n);
            if (vn < 0) {
                if (vn < -4) this.landHit = Math.max(this.landHit, -vn);
                const jn = -(1.2 * vn) / this.effMass(_r, _n);
                this.impulse(_v2.copy(_n).multiplyScalar(jn), _r);
                // friction: it slides on its roof / side, slowing down
                const pv2 = this.pointVel(_r, _v);
                _v3.copy(pv2).addScaledVector(_n, -pv2.dot(_n));
                const vt = _v3.length();
                if (vt > 1e-4) {
                    _v3.divideScalar(vt);
                    const jt = Math.min(vt / this.effMass(_r, _v3), 0.6 * jn);
                    this.impulse(_v2.copy(_v3).multiplyScalar(-jt), _r);
                }
            }
            if (pen > deepest) { deepest = pen; nd.copy(_n); }
        }
        if (deepest > 0) pos.addScaledVector(nd, deepest * 0.85);
    }

    // Keep the rover out of the canyon walls, rocks, closed force fields and the ship's dome: it bounces off
    walls() {
        const g = this.game;
        const W = g.world;
        const pos = this.pos;
        const yaw = this.yaw;
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const bottom = this.groundY;
        for (let i = 0; i < SIDES.length; i++) {
            const [sx, sz, rad] = SIDES[i];
            // flat (yaw only) so the samples stay at the body's height
            const px = pos.x + cy * sx + sy * sz, pz = pos.z - sy * sx + cy * sz;
            _p.set(px, pos.y, pz);
            // the canyon (the same bounds that keep Lincoln in)
            _t.copy(_p);
            W.confinePlayer(_t, rad);
            this.wallPush(_p, _t.x - px, _t.z - pz);
            // force fields + the dome
            _t.copy(_p);
            if (W.blockByGates(_t, rad)) {
                this.wallPush(_p, _t.x - px, _t.z - pz);
                if (this.driving) g.onGateBump?.();
            }
            _t.copy(_p);
            if (W.domeBlocks && W.domeBlocks(_t, rad)) this.wallPush(_p, _t.x - px, _t.z - pz);
            // rocks and props taller than a bump (and not below it when it flies over them)
            W.colliders.query(px, pz, rad + 6, (c) => {
                if (c.top < Math.max(bottom + 0.75, pos.y - 1.0) || c.bottom > pos.y + 2.2) return;
                const dx = px - c.x, dz = pz - c.z;
                const d = Math.hypot(dx, dz), minD = c.r + rad;
                if (d >= minD || d < 1e-5) return;
                this.wallPush(_p, (dx / d) * (minD - d), (dz / d) * (minD - d));
            });
        }
        // steep ground rising up beside the rover counts as a wall (cliffs, mesa sides). Not when the rover
        // is itself on steep ground (tumbling down a cliff): then the hull and the wheels deal with it.
        W.normalAt(pos.x, pos.z, _n);
        if (_n.y < 0.6) return;
        for (const [ex, ez] of EDGES) {
            const ox = cy * ex + sy * ez, oz = -sy * ex + cy * ez;
            const px = pos.x + ox, pz = pos.z + oz;
            const gy = W.groundAt(px, pz);
            // measured from the rover itself, not the ground under it: flying over a cliff top isn't a wall
            const rise = gy - Math.max(bottom, pos.y - 1.0) - 0.9;
            if (rise <= 0) continue;
            W.normalAt(px, pz, _n);
            if (_n.y > 0.6 || _n.x * ox + _n.z * oz > 0) continue;
            const hl = Math.hypot(_n.x, _n.z) || 1;
            const pen = Math.min(0.05, rise * _n.y / hl);
            _p.set(px, pos.y, pz);
            this.wallPush(_p, (_n.x / hl) * pen, (_n.z / hl) * pen);
        }
    }

    // push the body by (dx, dz) and bounce off whatever pushed point p
    wallPush(p, dx, dz) {
        const d = Math.hypot(dx, dz);
        if (d < 1e-5) return;
        const nx = dx / d, nz = dz / d;
        this.pos.x += dx;
        this.pos.z += dz;
        _r.subVectors(p, this.pos);
        _n.set(nx, 0, nz);
        const pv = this.pointVel(_r, _v);
        const vn = pv.dot(_n);
        if (vn < 0) {
            const j = -(1.35 * vn) / this.effMass(_r, _n);
            this.impulse(_v2.copy(_n).multiplyScalar(j), _r);
            // scrape: lose a little speed along the wall
            const pv2 = this.pointVel(_r, _v);
            _v3.copy(pv2).addScaledVector(_n, -pv2.dot(_n));
            _v3.y = 0;
            const vt = _v3.length();
            if (vt > 1e-4) {
                _v3.divideScalar(vt);
                const jt = Math.min(vt / this.effMass(_r, _v3), 0.15 * j);
                this.impulse(_v2.copy(_v3).multiplyScalar(-jt), _r);
            }
            if (vn < -3) this.bonk = Math.max(this.bonk || 0, -vn);
        }
    }

    // the ground's tilt under the whole rover (a smoothed normal: single triangles can be steps or rocks)
    slopeAt(x, z, out, span = 1.6) {
        const W = this.game.world;
        const gx = (W.groundAt(x + span, z) - W.groundAt(x - span, z)) / (2 * span);
        const gz = (W.groundAt(x, z + span) - W.groundAt(x, z - span)) / (2 * span);
        return out.set(-gx, 1, -gz).normalize();
    }

    onIce() {
        const L = LAYOUT.ICE_LAKE;
        if (!L) return false;
        const dx = this.pos.x - L.x, dz = this.pos.z - L.z;
        return dx * dx + dz * dz < L.r * L.r && Math.abs(this.groundY - L.level) < 0.6;
    }

    // --------------------------------------------------------
    // Tipping over and flipping back
    // --------------------------------------------------------
    checkUpright(dt) {
        _up.set(0, 1, 0).applyQuaternion(this.q);
        if (this.flip) return;
        if (_up.y < 0.35 && this.speed < 2.5 && this.onGround < 3) this.upsideT += dt;
        else if (_up.y > 0.6) this.upsideT = 0;
        const was = this.flipped;
        this.flipped = this.upsideT > 0.6;
        if (this.flipped && !was && this.driving) this.game.hud.toast('Uh oh! HOLD E to flip the rover', 2.4);
    }

    startFlip() {
        const g = this.game;
        if (this.flip) return;
        // keep facing the same way, wheels down
        _fwd.set(0, 0, -1).applyQuaternion(this.q);
        let fx = _fwd.x, fz = _fwd.z;
        if (Math.hypot(fx, fz) < 0.2) { _right.set(1, 0, 0).applyQuaternion(this.q); fx = -_right.z; fz = _right.x; }
        const yaw = Math.atan2(-fx, -fz);
        this.vel.set(this.vel.x * 0.3, 7.5, this.vel.z * 0.3);
        // on a slope, hop a little downhill so it lands somewhere flatter (and doesn't just roll over again),
        // and come down lined up with the ground there
        const W = g.world;
        this.slopeAt(this.pos.x, this.pos.z, _n, 2.2);
        let lx = this.pos.x, lz = this.pos.z;
        if (_n.y < 0.97) {
            const hl = Math.hypot(_n.x, _n.z) || 1;
            this.vel.x += (_n.x / hl) * 4.5;
            this.vel.z += (_n.z / hl) * 4.5;
            lx += this.vel.x * 1.15;
            lz += this.vel.z * 1.15;
        }
        this.slopeAt(lx, lz, _n, 2.2);
        const q1 = new THREE.Quaternion().setFromUnitVectors(Y, _n).multiply(_q.setFromAxisAngle(Y, yaw));
        this.flip = { t: 0, q0: this.q.clone(), q1 };
        this.angVel.set(0, 0, 0);
        this.holdE = 0;
        g.audio.play('boing', this.pos);
        g.audio.play('whoosh', this.pos);
        g.effects.dust(this.pos.x, this.groundY, this.pos.z, 10, 1.4, this.dustColor(), 0.8);
        g.effects.sparkle(this.pos.x, this.pos.y + 0.5, this.pos.z, 0xfff1a8, 1.6, 0.3);
    }

    updateFlip(dt) {
        const F = this.flip;
        F.t += dt;
        const k = clamp(F.t / 0.75, 0, 1);
        this.q.slerpQuaternions(F.q0, F.q1, easeOutBack(k));
        this.q.normalize();
        // never sink into the ground while it spins round
        const gy = this.game.world.groundAt(this.pos.x, this.pos.z);
        if (this.pos.y < gy + 1.2) { this.pos.y = gy + 1.2; if (this.vel.y < 0) this.vel.y = 0; }
        if (k >= 1) {
            this.flip = null;
            this.q.copy(F.q1);
            this.angVel.set(0, 0, 0);
            this.upsideT = 0;
            this.flipped = false;
            for (const w of this.wheels) { w.comp = 0; w.was = false; }
            if (!this.found) {
                this.found = true;
                this.game.hud.toast('The rover is back on its wheels! Press E to drive it', 3.5);
                if (this.onFirstFlip) this.onFirstFlip();
            }
        }
    }

    // Fell somewhere it shouldn't be (through the ground, or way out of bounds): put it back where it was safe
    recover() {
        const g = this.game;
        const gy = g.world.groundAt(this.pos.x, this.pos.z);
        const bad = this.pos.y < gy - 3 || !Number.isFinite(this.pos.x + this.pos.y + this.pos.z + this.q.w);
        if (bad && this.lastSafe.ok) {
            const S = this.lastSafe;
            const was = this.driving;
            this.driving = false;
            this.place(S.x, S.z, S.yaw);
            if (was) { this.driving = true; this.astro.root.visible = true; }
            return;
        }
        // remember a safe spot: upright, all four wheels down, slow
        if (this.onGround === 4 && this.speed < 8 && _up.set(0, 1, 0).applyQuaternion(this.q).y > 0.9) {
            this.safeT = (this.safeT || 0) + 1;
            if (this.safeT > 30) { this.safeT = 0; this.saveSafe(); }
        }
    }

    saveSafe() {
        const S = this.lastSafe;
        S.x = this.pos.x; S.z = this.pos.z; S.yaw = this.yaw; S.ok = true;
    }

    // --------------------------------------------------------
    // Getting in and out
    // --------------------------------------------------------
    mount() {
        const g = this.game;
        const P = g.player;
        if (this.driving || P.dead || !this.placed) return;
        this.driving = true;
        this.found = true;
        this.flipped = false;
        this.exitHintT = 4;
        this.seatK = 0;
        this.astro.root.visible = true;
        this.camIn();
        P.vel.set(0, 0, 0);
        P.pitch = clamp(P.pitch, -0.6, 0.1) - 0.12;
        g.audio.play('clunk', this.pos);
        g.audio.play('powerUp');
        g.effects.dust(this.pos.x, this.groundY, this.pos.z, 6, 1.5, this.dustColor(), 0.6);
        if (!this.toldHow) {
            this.toldHow = true;
            g.hud.toast('W drives where you look! CLICK fires the turret', 3.5);
            setTimeout(() => this.driving && g.hud.toast('SPACE = handbrake for big drifts', 3), 3800);
        }
        g.level.onRoverEnter?.();
    }

    // instant: no camera move (respawns, cutscenes)
    dismount(instant = false) {
        const g = this.game;
        const P = g.player;
        if (!this.driving) return;
        this.driving = false;
        this.astro.root.visible = false;
        this.holdE = 0;
        const spot = this.exitSpot();
        P.pos.copy(spot);
        P.vel.set(this.vel.x * 0.3, 0, this.vel.z * 0.3);
        P.onGround = true;
        P.updateEye();
        if (instant) this.camOff();
        else {
            this.camOut();
            g.audio.play('jump');
        }
        g.hud.hidePrompt();
    }

    // somewhere safe beside the rover to put Lincoln
    exitSpot() {
        const W = this.game.world;
        const yaw = this.yaw;
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const tries = [[-2.3, 0], [2.3, 0], [0, 2.9], [0, -3], [-2.3, 2], [2.3, 2], [-2.6, -1.5], [2.6, -1.5], [-3.5, 0], [3.5, 0]];
        for (const [ox, oz] of tries) {
            const x = this.pos.x + cy * ox + sy * oz, z = this.pos.z - sy * ox + cy * oz;
            if (this.spotOK(x, z, this.groundY, 0.5, this.pos)) return _p.set(x, W.groundAt(x, z), z);
        }
        return _p.set(this.pos.x, W.groundAt(this.pos.x, this.pos.z) + 0.2, this.pos.z);
    }

    // Is (x, z) a fair place to stand (or, with a big radius, to park the rover)? from: no force field in between
    spotOK(x, z, refY, rad, from) {
        const W = this.game.world;
        const gy = W.groundAt(x, z);
        if (Math.abs(gy - refY) > 2.6) return false;
        W.normalAt(x, z, _n);
        if (_n.y < (rad > 1 ? 0.85 : 0.7)) return false;
        _t.set(x, gy, z);
        W.confinePlayer(_t, rad);
        if (Math.hypot(_t.x - x, _t.z - z) > 0.05) return false;
        _t.set(x, gy, z);
        if (W.blockByGates(_t, rad)) return false;
        _t.set(x, gy, z);
        if (W.domeBlocks && W.domeBlocks(_t, rad)) return false;
        if (from && W.segmentHitsGate(from.x, gy + 1, from.z, x, gy + 1, z)) return false;
        let blocked = false;
        W.colliders.query(x, z, rad + 6, (c) => {
            if (c.top < gy + 0.6 || c.bottom > gy + 2.5) return;
            if (Math.hypot(x - c.x, z - c.z) < c.r + rad) { blocked = true; return true; }
        });
        if (blocked) return false;
        if (rad > 1) {
            // room for the whole rover: the ground around it is drivable too
            for (const [ox, oz] of [[1.6, 1.8], [-1.6, 1.8], [1.6, -1.8], [-1.6, -1.8]]) {
                const gx = W.groundAt(x + ox, z + oz);
                if (Math.abs(gx - gy) > 0.9) return false;
                _t.set(x + ox, gx, z + oz);
                W.confinePlayer(_t, 0.5);
                if (Math.hypot(_t.x - x - ox, _t.z - z - oz) > 0.05) return false;
            }
        }
        return true;
    }

    // a safe parking spot near (x, z), in front of yaw if possible
    spotNear(x, z, yaw, refY) {
        const dists = [6, 8, 5, 10, 4];
        const angs = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI];
        for (const d of dists) {
            for (const a of angs) {
                const ya = yaw + a;
                const px = x - Math.sin(ya) * d, pz = z - Math.cos(ya) * d;
                if (this.spotOK(px, pz, refY, 1.8, _v3.set(x, refY, z))) return { x: px, z: pz };
            }
        }
        return null;
    }

    // "Hold R": the rover beams in next to Lincoln
    callTo(P) {
        const g = this.game;
        const S = this.spotNear(P.pos.x, P.pos.z, P.yaw, P.pos.y);
        if (!S) {
            g.hud.toast('No room for the rover here! Find a flat, open spot.', 2.2);
            g.audio.play('empty');
            return false;
        }
        const fx = this.pos.x, fy = this.groundY, fz = this.pos.z;
        g.effects.beamColumn(fx, fy, fz, 0x9ff6ff, 1.8, 8, 0.8);
        g.effects.sparks(fx, fy + 1.2, fz, 0x9ff6ff, 16, 5, 0.16);
        // facing the way Lincoln is looking
        this.place(S.x, S.z, P.yaw);
        this.popT = 0.55;
        const gy = this.groundY;
        g.effects.beamColumn(S.x, gy, S.z, 0x9ff6ff, 2.0, 9, 1.0);
        g.effects.sparks(S.x, gy + 1.2, S.z, 0x9ff6ff, 24, 6, 0.18);
        g.effects.ring(S.x, gy + 0.1, S.z, 0x9ff6ff, 4, 0.6);
        g.audio.play('teleport', this.pos);
        return true;
    }

    // --------------------------------------------------------
    // After the level's update (so its prompts win): prompts, getting in/out, flipping, calling
    // --------------------------------------------------------
    lateUpdate(dt, inp) {
        const g = this.game;
        const P = g.player;
        const hud = g.hud;
        inp = inp || NO_INPUT;
        this.exitHintT -= dt;
        if (!this.placed || P.dead || g.state !== 'play') { this.holdE = 0; this.holdR = 0; return; }
        // a prompt the level is showing with a key (pick up a part, rebuild the ship) has priority
        const levelPrompt = !hud.promptEl.classList.contains('hidden') && !!hud.promptEl.querySelector('.key');
        const eHeld = !!inp.interactHeld, ePressed = !!inp.interact;
        const bar = (k) => ` <span style="display:inline-block;width:70px;height:9px;border-radius:5px;background:rgba(255,255,255,.25);overflow:hidden;vertical-align:middle"><span style="display:block;height:100%;width:${Math.round(clamp(k, 0, 1) * 100)}%;background:#6ff0ff"></span></span>`;
        if (this.flip) return;
        if (this.driving) {
            if (levelPrompt) { this.holdE = 0; return; }
            if (this.flipped) {
                // stuck upside down: hold E to flip back over, tap E to hop out
                if (ePressed) this.holdE = 1e-4;
                if (this.holdE > 0) {
                    if (eHeld) {
                        this.holdE += dt;
                        if (this.holdE >= 0.6) { this.startFlip(); return; }
                    } else {
                        if (this.holdE < 0.3) this.dismount();
                        this.holdE = 0;
                        return;
                    }
                }
                hud.prompt('E', 'Hold to flip the rover' + bar(this.holdE / 0.6));
                return;
            }
            if (ePressed) { this.dismount(); return; }
            if (this.exitHintT > 0 || this.speed < 1.2) hud.prompt('E', 'Get out');
            return;
        }
        // on foot
        _v.subVectors(P.pos, this.pos);
        const dist = Math.hypot(_v.x, _v.z);
        _qi.copy(this.q).invert();
        _v.applyQuaternion(_qi);
        const bx = Math.max(0, Math.abs(_v.x) - BOX.x), bz = Math.max(0, Math.abs(_v.z) - BOX.z);
        const near = Math.hypot(bx, bz) < 2.0 && Math.abs(P.pos.y - this.groundY) < 2.5 && this.popT <= 0;
        if (near && !levelPrompt) {
            if (this.flipped) {
                this.holdE = eHeld ? this.holdE + dt : 0;
                if (this.holdE >= 0.6) { this.startFlip(); return; }
                hud.prompt('E', 'Hold to flip the rover' + bar(this.holdE / 0.6));
            } else {
                this.holdE = 0;
                hud.prompt('E', 'Drive the rover');
                if (ePressed) this.mount();
            }
        } else {
            this.holdE = 0;
        }
        // "Hold R": call the rover (once it's been found). A reminder shows for a few seconds each time
        // Lincoln wanders 40 m away from it.
        if (!this.found || near) { this.holdR = 0; return; }
        if (dist < 25) this.farHint = false;
        else if (dist > 40 && !this.farHint) { this.farHint = true; this.farHintT = 4; }
        this.farHintT = (this.farHintT || 0) - dt;
        if (inp.callHeld && dist > 6) {
            this.holdR += dt;
            hud.prompt('R', 'Calling the rover...' + bar(this.holdR / 0.8));
            if (this.holdR >= 0.8) { this.holdR = 0; this.farHintT = 0; this.callTo(P); }
        } else {
            this.holdR = 0;
            if (this.farHintT > 0 && !levelPrompt && hud.promptEl.classList.contains('hidden')) hud.prompt('R', 'Hold to call the rover');
        }
    }

    // --------------------------------------------------------
    // Lincoln and the game around him
    // --------------------------------------------------------
    // Player.spawn (respawn at a checkpoint, a teleport): out of the seat; if he was riding, the rover comes too
    onPlayerSpawn(x, z, yaw) {
        if (!this.placed) return;
        const wasRiding = this.driving || this.riderDown;
        if (this.driving) {
            this.driving = false;
            this.astro.root.visible = false;
        }
        this.riderDown = false;
        this.holdE = this.holdR = 0;
        this.camOff();
        if (wasRiding) {
            const gy = this.game.world.groundAt(x, z);
            const S = this.spotNear(x, z, yaw - 0.7, gy) || this.spotNear(x, z, yaw, gy);
            if (S) this.place(S.x, S.z, yaw);
        }
    }

    // knocked out while driving: he slumps over the handlebars; the rover rolls to a stop
    onPlayerDown() {
        if (!this.driving) return;
        this.driving = false;
        this.riderDown = true;
        this.game.hud.hidePrompt();
    }

    // Lincoln walking into the parked rover gets pushed out (it's solid)
    pushPlayer(P) {
        _v.subVectors(P.pos, this.pos);
        _qi.copy(this.q).invert();
        _v.applyQuaternion(_qi);
        const r = PLAYER.radius;
        const ox = BOX.x + r - Math.abs(_v.x), oz = BOX.z + r - Math.abs(_v.z);
        if (ox <= 0 || oz <= 0 || _v.y < -2 || _v.y > 1.8) return;
        if (ox < oz) _v.x += Math.sign(_v.x || 1) * ox;
        else _v.z += Math.sign(_v.z || 1) * oz;
        _v.applyQuaternion(this.q).add(this.pos);
        P.pos.x = _v.x;
        P.pos.z = _v.z;
        P.updateEye();
    }

    // Is a bolt (segment a-b) hitting the rover or Lincoln on it?
    hitBySegment(a, b, pad) {
        const P = this.game.player;
        if (P.hitBySegment(a, b, pad)) return true;
        _qi.copy(this.q).invert();
        for (let k = 0; k <= 4; k++) {
            _v.lerpVectors(a, b, k / 4).sub(this.pos).applyQuaternion(_qi);
            if (Math.abs(_v.x) < BOX.x * 0.85 + pad && Math.abs(_v.z) < BOX.z * 0.9 + pad && _v.y > BOX.y0 + 0.3 - pad && _v.y < 1.0 + pad) {
                this.game.effects.sparks(_v2.lerpVectors(a, b, k / 4).x, _v2.y, _v2.z, 0x9ff6ff, 6, 4, 0.1);
                return true;
            }
        }
        return false;
    }

    // --------------------------------------------------------
    // Running aliens over (and aliens diving out of the way)
    // --------------------------------------------------------
    hitAliens(dt) {
        const g = this.game;
        const A = g.aliens;
        if (!A || !A.list) return;
        const now = g.time;
        _qi.copy(this.q).invert();
        const sp = Math.hypot(this.vel.x, this.vel.z);
        const vdx = this.vel.x / (sp || 1), vdz = this.vel.z / (sp || 1);
        for (const a of A.list) {
            if (a.dead || a.dormant || a.spawnT > 0 || !a.root.visible) continue;
            const s = a.T.scale;
            const rx = a.pos.x - this.pos.x, rz = a.pos.z - this.pos.z;
            const d2 = rx * rx + rz * rz;
            if (d2 > 26 * 26) continue;
            // a rover coming fast: aliens that have noticed yell and dive out of the way (not all of them...)
            if (this.driving && sp > 8 && !a.T.boss && (a.state !== 'idle' || a.canSee)) {
                const along = rx * vdx + rz * vdz;
                const lat = -rx * vdz + rz * vdx;
                if (along > 1 && along < sp * 0.95 && Math.abs(lat) < 2.4 + a.radius) {
                    if (!(this.diveRolls.get(a) > now)) {
                        this.diveRolls.set(a, now + 2.5);
                        const chance = { easy: 0.3, normal: 0.45, hard: 0.6 }[g.diffKey] ?? 0.45;
                        if (Math.random() < chance && a.dive) {
                            const side = Math.sign(lat) || (Math.random() < 0.5 ? -1 : 1);
                            a.dive(-vdz * side, vdx * side);
                        }
                    }
                }
            }
            // touching the rover?
            _v.set(rx, a.pos.y + 0.9 * s - this.pos.y, rz).applyQuaternion(_qi);
            const r = a.radius;
            if (Math.abs(_v.x) > BOX.x + r || Math.abs(_v.z) > BOX.z + r || _v.y < BOX.y0 - 0.9 * s || _v.y > BOX.y1 + 0.4) continue;
            const d = Math.sqrt(d2) || 1;
            _n.set(rx / d, 0, rz / d);
            _r.set(rx, a.pos.y + 0.9 * s - this.pos.y, rz);
            const pv = this.pointVel(_r, _v2);
            // how fast the rover itself is driving into it (an alien walking into a parked rover isn't hit)
            const ram = pv.dot(_n);
            const closing = ram - a.vel.dot(_n);
            if (a.T.boss && ram > 2) {
                // the Alien Captain is too big to bowl over: everybody bounces
                if (this.shoves.get(a) > now) continue;
                this.shoves.set(a, now + 0.6);
                a.knock?.(_n.x * 13, _n.z * 13, 6, 0.5);
                this.vel.addScaledVector(_n, -(Math.max(closing, 0) * 1.3 + 5));
                this.vel.y += 2;
                this.angVel.y += rand(-1.5, 1.5);
                g.effects.sparks(a.pos.x, a.pos.y + 1.4 * s, a.pos.z, 0xffd166, 18, 7, 0.16);
                g.effects.burstRing(a.pos.x, a.pos.y + 1.2 * s, a.pos.z, 0xffd166, 0.3, 2.2, 0.3, 0.16, 0.6);
                g.audio.play('shieldHit', a.pos);
                g.audio.play('clunk', this.pos);
                g.combat.kick(0.5, 2.5);
                g.hud.toast('WHOA! The Captain is too tough to run over!', 2);
            } else if (!a.T.boss && ram > ROVER.runOver && closing > ROVER.runOver) {
                // STRIKE! It flies off spinning like a bowling pin, then POOF
                const up = 7 + sp * 0.3;
                _v3.copy(this.vel).multiplyScalar(0.55).addScaledVector(_n, 4);
                _v3.y = up;
                const px = a.pos.x, py = a.pos.y + 1.0 * s, pz = a.pos.z;
                if (a.launch) a.launch(_v3);
                else { a.hurt(99, a.pos); }
                g.effects.bang(px, py, pz, 0xffffff, 1.4, 0.12, 9);
                g.effects.stars(px, py + 0.4, pz, 5, 0xffd23a, 0.4, 4);
                g.effects.burstRing(px, py, pz, 0xffffff, 0.3, 2.4, 0.3, 0.14, 0.7);
                g.combat.hitStop();
                g.combat.kick(0.3, 2);
                g.hud.hitMarker(true, 'body');
                this.vel.addScaledVector(_n, -0.6);
                this.bowled(now);
            } else if (!a.T.boss && ram > 1) {
                // a slow bump: shove it (and the rover feels it)
                if (this.shoves.get(a) > now) continue;
                this.shoves.set(a, now + 0.35);
                const push = Math.max(closing, ram) + 3;
                if (a.knock) a.knock(_n.x * push, _n.z * push, 3, 0.3);
                else { a.vel.x += _n.x * push; a.vel.z += _n.z * push; }
                a.pos.x += _n.x * 0.25;
                a.pos.z += _n.z * 0.25;
                this.vel.addScaledVector(_n, -Math.min(ram, 4) * 0.5);
                a.alertTo?.(0);
                g.audio.play('bounce', a.pos);
                g.combat.kick(0.12, 0);
            } else {
                // standing still or walking into it: step back out (it's solid)
                a.pos.x += _n.x * 0.08;
                a.pos.z += _n.z * 0.08;
            }
        }
    }

    bowled(now) {
        const g = this.game;
        this.bowls = this.bowls.filter((t) => now - t < 1.6);
        this.bowls.push(now);
        const n = this.bowls.length;
        if (now - (this.toastT || -9) > 0.5 || n > 1) {
            this.toastT = now;
            g.hud.toast(n >= 3 ? 'TURKEY! 3 STRIKES!' : n === 2 ? 'DOUBLE STRIKE!' : 'STRIKE!', 1.3);
        }
    }

    // --------------------------------------------------------
    // The turret: fires the blaster's bolts where the crosshair aims
    // --------------------------------------------------------
    coolTurret(dt) {
        this.fireT -= dt;
        this.sinceFire += dt;
        if (this.overheated) {
            this.overheatT -= dt;
            if (this.overheatT <= 0) {
                this.overheated = false;
                this.heat = 0.35;
                if (this.driving) this.game.audio.play('vented');
            }
        } else if (this.sinceFire > 0.18) {
            this.heat = Math.max(0, this.heat - ROVER.coolRate * dt);
        }
    }

    updateTurret(dt, inp) {
        const g = this.game;
        this.coolTurret(dt);
        this.kickT = Math.max(0, this.kickT - dt * 8);
        if (this.overheated && Math.random() < dt * 12) {
            this.muzzleWorld(_v);
            const s = g.effects.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: rand(-0.3, 0.3), vy: rand(0.8, 1.6), vz: rand(-0.3, 0.3),
                life: 0.8, size: 0.12, size1: 0.5, color: 0xffffff, alpha: 0.5, alpha1: 0, drag: 2 });
            void s;
        }
        if (inp.fire && this.fireT <= 0 && !this.overheated && this.cam.mode === 'on') this.fire();
    }

    fire() {
        const g = this.game;
        const cam = g.camera;
        this.fireT = 1 / ROVER.fireRate;
        this.sinceFire = 0;
        this.heat += ROVER.heatPerShot;
        if (this.heat >= 1) {
            this.heat = 1;
            this.overheated = true;
            this.overheatT = ROVER.overheatTime;
            g.audio.play('overheat');
            g.hud.toast('TURRET OVERHEATED! Let it cool...', 1.4);
        }
        // the bolt flies along the crosshair ray (what you aim at is what you hit), drawn from the turret's barrel
        const origin = _v.copy(cam.position);
        const dir = _v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
        const t = g.aliens.aimTarget(origin, dir, g.diff.aimAssist + (g.input.usingGamepad ? 0.04 : 0), 90, true);
        if (t) {
            const tp = _v3.copy(t.aimAt);
            const travel = tp.distanceTo(origin) / PLAYER.boltSpeed;
            tp.x += t.vel.x * travel;
            tp.z += t.vel.z * travel;
            dir.copy(tp.sub(origin).normalize());
        }
        this.barrel = 1 - this.barrel;
        const muzzle = this.muzzles[this.barrel].getWorldPosition(new THREE.Vector3());
        const along = Math.max(0.3, _v4.subVectors(muzzle, origin).dot(dir));
        const start = origin.clone().addScaledVector(dir, along);
        g.combat.playerBolt(start, dir, 1, muzzle.clone().sub(start));
        this.kickT = 1;
        g.audio.play('blaster');
        g.stats.shots++;
    }

    // where the turret's barrel is (for the muzzle flash)
    muzzleWorld(out) {
        return this.muzzles[this.barrel].getWorldPosition(out);
    }

    // --------------------------------------------------------
    // Dust, bumps, sounds
    // --------------------------------------------------------
    dustColor() {
        return this.onIce() ? 0xe8f2ff : 0xd99a74;
    }

    onLanding(v) {
        const g = this.game;
        if (this.landT > 0) return;
        this.landT = 0.25;
        g.audio.play('land', this.pos);
        if (v > 9) g.audio.play('clunk', this.pos);
        if (this.driving) g.combat.kick(clamp(v / 22, 0.1, 0.55), clamp(v / 6, 0, 3));
        for (const w of this.wheels) {
            if (!w.contact) continue;
            _v.set(w.x, -0.9, w.z).applyQuaternion(this.q).add(this.pos);
            g.effects.dust(_v.x, w.gy, _v.z, Math.round(clamp(v / 2, 2, 7)), 0.8, this.dustColor(), 0.7);
        }
        this.ant.vx += 4;
    }

    effectsAndSound(dt, ctl) {
        const g = this.game;
        this.landT -= dt;
        this.bonkT -= dt;
        if (this.bonk && this.bonkT <= 0) {
            this.bonkT = 0.3;
            g.audio.play(this.bonk > 7 ? 'clunk' : 'bounce', this.pos);
            if (this.driving) g.combat.kick(clamp(this.bonk / 25, 0.1, 0.5), 0);
        }
        this.bonk = 0;
        // dust from the tires when going fast or sliding
        let slip = 0;
        for (const w of this.wheels) if (w.contact) slip = Math.max(slip, w.slip);
        this.skidK = damp(this.skidK, this.onGround >= 2 ? smoothstep(2.5, 7, slip) : 0, 10, dt);
        this.dustT -= dt;
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (this.dustT <= 0 && this.onGround && (hs > 7 || this.skidK > 0.2)) {
            this.dustT = 0.05;
            for (const w of this.wheels) {
                if (!w.contact || (w.front && this.skidK < 0.3 && Math.random() < 0.6)) continue;
                _v.set(w.x, -0.9, w.z + 0.3).applyQuaternion(this.q).add(this.pos);
                const k = Math.max(this.skidK, (hs - 7) / 20);
                if (Math.random() < 0.3 + k) g.effects.dust(_v.x, w.gy, _v.z, 1, 0.3, this.dustColor(), 0.3 + k * 0.25);
            }
        }
    }

    // Engine and skid loops (main.js calls this every frame, in every state, so they go quiet in menus)
    updateAudio(active) {
        const on = active && this.driving && this.placed;
        if (!on && !this.soundOn) return;
        this.soundOn = on;
        const fwd = Math.abs(this.vel.dot(_fwd.set(0, 0, -1).applyQuaternion(this.q)));
        this.sound.set(on, clamp(fwd / 24, 0, 1.15), this.throttle, this.skidK);
    }

    // --------------------------------------------------------
    // Visuals: wheels, springs, steering, Lincoln, turret, antenna
    // --------------------------------------------------------
    updateVisuals(dt) {
        const g = this.game;
        this.root.position.copy(this.pos);
        this.root.quaternion.copy(this.q);
        if (this.popT > 0) {
            // materializing: a streak of light that pops out into the rover
            this.popT -= dt;
            const k = clamp(1 - this.popT / 0.55, 0, 1);
            const wide = smoothstep(0, 0.5, k);
            const wob = k > 0.5 ? Math.exp(-(k - 0.5) * 9) * Math.sin((k - 0.5) * 30) : 0;
            const sxz = lerp(0.05, 1, wide) * (1 + wob * 0.15);
            this.root.scale.set(sxz, lerp(1.8, 1, smoothstep(0, 0.6, k)) * (1 - wob * 0.12), sxz);
            if (this.popT <= 0) this.root.scale.setScalar(1);
        }
        const T = ROVER;
        for (const w of this.wheels) {
            const hubY = T.mountY - w.len;
            w.group.position.set(w.x, hubY, w.z);
            w.group.rotation.y = w.front ? this.steer : 0;
            if (w.contact) w.spin = w.spinV;
            else w.spinV *= Math.exp(-dt * 0.8);
            w.mesh.rotation.x -= (w.contact ? w.spinV : w.spinV) * dt;
            // arm from the hinge to the hub
            _v.set(w.x - w.hinge.x, hubY - w.hinge.y, 0);
            const len = _v.length();
            w.arm.quaternion.setFromUnitVectors(X, _v.normalize());
            w.arm.scale.set(len, 1, 1);
            // spring from the top mount to 70% of the way down the arm
            _v2.set(w.hinge.x + (w.x - w.hinge.x) * 0.72, w.hinge.y + (hubY - w.hinge.y) * 0.72, w.z).sub(w.top);
            const sl = _v2.length();
            w.shock.quaternion.setFromUnitVectors(Y, _v2.normalize());
            w.shock.scale.set(1, sl, 1);
        }
        this.bars.rotation.y = this.steer * 1.3;

        // the turret swivels to where the crosshair aims (or rests facing forward)
        let ty = 0, tp = 0;
        if (this.driving && this.cam.mode !== 'off') {
            _v.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
            _qi.copy(this.q).invert();
            _v.applyQuaternion(_qi);
            ty = Math.atan2(-_v.x, -_v.z);
            tp = Math.asin(clamp(_v.y, -1, 1)) + 0.04;
        }
        this.turretYaw += wrapAngle(ty - this.turretYaw) * (1 - Math.exp(-14 * dt));
        this.turretPitch = damp(this.turretPitch, clamp(tp, -0.35, 0.8), 14, dt);
        this.turret.rotation.y = this.turretYaw;
        this.gun.rotation.x = this.turretPitch;
        this.gun.position.z = this.kickT * 0.06;

        // antenna wobbles with the bumps
        _qi.copy(this.q).invert();
        _v.copy(this.accel).applyQuaternion(_qi);
        const A = this.ant;
        const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
        for (let i = 0; i < n; i++) {
            A.vx += (-A.x * 90 - A.vx * 5 - clamp(_v.z, -40, 40) * 0.02) * h;
            A.vz += (-A.z * 90 - A.vz * 5 + clamp(_v.x, -40, 40) * 0.02) * h;
            A.x += A.vx * h;
            A.z += A.vz * h;
        }
        A.x = clamp(A.x, -0.7, 0.7);
        A.z = clamp(A.z, -0.7, 0.7);
        this.antenna.rotation.set(A.x + 0.12, 0, A.z);

        // Lincoln on the seat: hands on the bars, leaning into the turns
        const a = this.astro;
        if (a.root.visible && dt > 0) {
            this.seatK = Math.min(1, this.seatK + dt * 4);
            const pop = this.seatK < 1 ? easeOutBack(this.seatK) : 1;
            a.root.scale.setScalar(lerp(0.6, 1, pop));
            a.root.position.y = 0.14 + (1 - this.seatK) * 0.5;
            const lat = clamp(_v.x / 25, -1, 1), lon = clamp(_v.z / 25, -1, 1);
            a.animate(dt);
            const slump = this.riderDown ? 1 : 0;
            a.body.rotation.x = damp(a.body.rotation.x, 0.22 + lon * 0.25 + slump * 0.5, 8, dt);
            a.body.rotation.z = damp(a.body.rotation.z, lat * 0.3, 8, dt);
            // look where the camera looks
            let look = 0;
            if (this.driving) {
                _v.set(0, 0, -1).applyQuaternion(g.camera.quaternion).applyQuaternion(_qi);
                look = clamp(Math.atan2(-_v.x, -_v.z), -1.0, 1.0);
            }
            a.head.rotation.y = damp(a.head.rotation.y, look, 8, dt);
            a.head.rotation.x = damp(a.head.rotation.x, -0.15 - slump * 0.4, 8, dt);
            if (!this.riderDown) {
                this.root.updateMatrixWorld(true);
                for (let i = 0; i < 2; i++) pointLimb(a.arms[i], this.grips[i === 0 ? 1 : 0].getWorldPosition(_v3));
            } else {
                for (const arm of a.arms) arm.rotation.set(0.3, 0, 0);
            }
        }
    }

    // --------------------------------------------------------
    // Chase camera
    // --------------------------------------------------------
    camIn() {
        const c = this.cam, cam = this.game.camera;
        c.from.copy(cam.position);
        c.fromQ.copy(cam.quaternion);
        c.fromFov = cam.fov;
        c.mode = 'in';
        c.t = 0;
        c.pivot.set(this.pos.x, this.pos.y + PIVOT_Y, this.pos.z);
        c.pivotV.set(0, 0, 0);
        c.dist = 6;
        c.fov = cam.fov;
    }

    camOut() {
        const c = this.cam, cam = this.game.camera;
        c.from.copy(cam.position);
        c.fromQ.copy(cam.quaternion);
        c.fromFov = cam.fov;
        c.mode = 'out';
        c.t = 0;
    }

    camOff() {
        this.cam.mode = 'off';
        this.cam.t = 0;
    }

    updateCam(dt) {
        const c = this.cam;
        const P = this.game.player;
        if (c.mode === 'in') { c.t += dt / 0.6; if (c.t >= 1) { c.mode = 'on'; c.t = 1; } }
        else if (c.mode === 'out') { c.t += dt / 0.45; if (c.t >= 1) this.camOff(); }
        // the first-person blaster shows only when the camera is (nearly) back in Lincoln's helmet
        const hide = c.mode === 'in' || c.mode === 'on' || (c.mode === 'out' && c.t < 0.75);
        if (hide && P.vm.visible) { P.vm.visible = false; this.hidVM = true; }
        else if (!hide && this.hidVM) { this.hidVM = false; if (!P.dead && this.game.state === 'play') P.vm.visible = true; }
    }

    // Player.updateCamera places the first-person camera, then calls this. Third person while driving,
    // blending to and from the first-person view when Lincoln gets in or out.
    applyCamera(camera, dt) {
        const c = this.cam;
        if (c.mode === 'off' || !this.placed) return;
        const g = this.game;
        const W = g.world;
        const P = g.player;
        if (c.mode !== 'out') {
            // the pivot follows the rover on a spring that also matches its speed: no lag cruising along, but the
            // camera drops back a little when it speeds up, swings out in turns and soaks up bumps
            _v.set(this.pos.x, this.pos.y + PIVOT_Y, this.pos.z);
            const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
            const kx = 14, ky = 30, cx = 2 * Math.sqrt(kx), cy = 1.6 * Math.sqrt(ky);
            for (let i = 0; i < n; i++) {
                c.pivotV.x += ((_v.x - c.pivot.x) * kx + (this.vel.x - c.pivotV.x) * cx) * h;
                c.pivotV.z += ((_v.z - c.pivot.z) * kx + (this.vel.z - c.pivotV.z) * cx) * h;
                c.pivotV.y += ((_v.y - c.pivot.y) * ky + (this.vel.y - c.pivotV.y) * cy) * h;
                c.pivot.addScaledVector(c.pivotV, h);
            }
            // never let it fall too far behind (a teleport, a big crash)
            if (c.pivot.distanceTo(_v) > 6) { c.pivot.copy(_v); c.pivotV.set(0, 0, 0); }
            const k = clamp(this.speed / 24, 0, 1.1);
            const yaw = P.yaw, pitch = P.pitch;
            const cp = Math.cos(pitch);
            const dir = _v2.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
            const want = 5.2 + 1.0 * k;
            // pull in when a canyon wall or a dune is in the way
            let free = want;
            const steps = 12;
            for (let i = 1; i <= steps; i++) {
                const d = (i / steps) * want;
                const px = c.pivot.x - dir.x * d, py = c.pivot.y - dir.y * d + 0.35 * (d / want), pz = c.pivot.z - dir.z * d;
                if (py < W.groundAt(px, pz) + 0.55) { free = Math.max(1.2, ((i - 1) / steps) * want); break; }
            }
            c.dist = free < c.dist ? damp(c.dist, free, 30, dt) : damp(c.dist, free, 3, dt);
            const tp = _v3.copy(c.pivot).addScaledVector(dir, -c.dist);
            tp.y += 0.35 * (c.dist / want);
            const gy = W.groundAt(tp.x, tp.z) + 0.5;
            if (tp.y < gy) tp.y = gy;
            _e.set(pitch, yaw, 0, 'YXZ');
            _q2.setFromEuler(_e);
            c.fov = damp(c.fov, 75 + 13 * k, 4, dt);
            if (c.mode === 'in') {
                const e = easeInOut(clamp(c.t, 0, 1));
                camera.position.lerpVectors(c.from, tp, e);
                camera.quaternion.slerpQuaternions(c.fromQ, _q2, e);
                camera.fov = lerp(c.fromFov, c.fov, e);
            } else {
                camera.position.copy(tp);
                camera.quaternion.copy(_q2);
                camera.fov = c.fov;
            }
        } else {
            // getting out: from where the chase camera was back into Lincoln's helmet
            const e = easeInOut(clamp(c.t, 0, 1));
            camera.position.lerpVectors(c.from, camera.position, e);
            _q2.copy(camera.quaternion);
            camera.quaternion.slerpQuaternions(c.fromQ, _q2, e);
            camera.fov = lerp(c.fromFov, camera.fov, e);
        }
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
    }
}
