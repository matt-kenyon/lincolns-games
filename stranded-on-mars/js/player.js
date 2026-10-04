// ============================================================
// PLAYER — first-person astronaut with a plasma blaster
// ============================================================

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { GeoBuilder, toonMaterial, addOutline } from './toon.js';
import { SUIT, addGlove } from './models.js';
import { clamp, lerp, damp, rand } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// The suit's glove (same one Lincoln wears in the cutscenes) plus a sleeve, with the glove's center
// at `at` and the forearm running back along `dir`
function addArm(b, at, dir, thumb) {
    const d = dir.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_up, d);
    const sc = 0.8;
    addGlove(b, new THREE.Matrix4().compose(at, q, new THREE.Vector3(sc, sc, sc)), thumb);
    const sleeve = at.clone().addScaledVector(d, 0.37);
    b.add(new THREE.CylinderGeometry(0.078, 0.095, 0.5, 14), SUIT.white, { matrix: new THREE.Matrix4().compose(sleeve, q, new THREE.Vector3(1, 1, 1)) });
}

// ------------------------------------------------------------
// First-person view model (rendered in its own scene on top)
// ------------------------------------------------------------
class ViewModel {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
        this.hemi = new THREE.HemisphereLight(0xc9b2e6, 0xa65a43, 1.9);
        this.sun = new THREE.DirectionalLight(0xfff0da, 2.6);
        this.scene.add(this.hemi, this.sun, this.sun.target);

        const mat = toonMaterial({ vertexColors: true, glow: true, rim: 0.5, fog: false, cache: false });
        this.root = new THREE.Group();
        this.scene.add(this.root);
        this.gun = new THREE.Group();
        this.root.add(this.gun);

        // Blaster: a little toy rocket in the LINCOLN-1's colors. Gun space: barrel along -Z,
        // the barrel's axis at y = 0.02, the muzzle (where bolts start) at z = -0.47.
        const AX = 0.02;
        const along = (z) => ({ p: [0, AX, z] }); // a ring/disc centered on the barrel axis
        const b = new GeoBuilder();
        // chunky body with a tapered rocket tail (lathe profile: radius vs. distance toward the muzzle)
        const prof = [[0, -0.15], [0.034, -0.147], [0.054, -0.137], [0.066, -0.123], [0.0665, -0.122], [0.08, -0.1], [0.092, -0.05],
            [0.1, 0.02], [0.1, 0.08], [0.096, 0.13], [0.086, 0.18], [0.068, 0.218], [0.054, 0.236], [0, 0.236]].map(([r, y]) => new THREE.Vector2(r, y));
        b.add(new THREE.LatheGeometry(prof, 24), [SUIT.white, (pos, i, c) => c.set(pos.getZ(i) > 0.1225 ? SUIT.orange : SUIT.white)], { p: [0, AX, 0], r: [-Math.PI / 2, 0, 0] });
        // orange stripes, like the ship's
        b.add(new THREE.TorusGeometry(0.095, 0.014, 8, 28), SUIT.orange, along(0.03));
        b.add(new THREE.TorusGeometry(0.097, 0.014, 8, 28), SUIT.orange, along(-0.13));
        // a slate cradle on top for the energy capsule (the glowing capsule itself is below)
        b.add(new THREE.BoxGeometry(0.074, 0.034, 0.215), SUIT.slate, { p: [0, AX + 0.1, -0.02] });
        // short barrel, collar and a big flared emitter
        b.add(new THREE.CylinderGeometry(0.043, 0.047, 0.2, 16), SUIT.slate, { p: [0, AX, -0.32], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.TorusGeometry(0.064, 0.018, 8, 22), SUIT.orange, along(-0.232));
        b.add(new THREE.CylinderGeometry(0.073, 0.05, 0.065, 20, 1, true), SUIT.slate, { p: [0, AX, -0.424], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.TorusGeometry(0.07, 0.015, 8, 24), SUIT.orange, along(-0.455));
        // grip
        b.add(new THREE.CapsuleGeometry(0.036, 0.1, 4, 12), SUIT.slate, { p: [0, -0.11, 0.085], r: [0.3, 0, 0] });
        const gunMesh = new THREE.Mesh(b.build(), mat);
        addOutline(gunMesh, 0x2a1424, 0.0016);
        this.gun.add(gunMesh);

        // Energy = heat gauge (cyan -> yellow -> red): the glowing capsule on top, two coils on the
        // barrel and the emitter lens all share this color
        this.coilMat = new THREE.MeshBasicMaterial({ color: 0x6ff0ff });
        const e = new GeoBuilder();
        e.add(new THREE.CapsuleGeometry(0.034, 0.17, 4, 16), 0xffffff, { p: [0, AX + 0.128, -0.02], r: [Math.PI / 2, 0, 0] });
        for (const z of [-0.29, -0.355]) e.add(new THREE.TorusGeometry(0.05, 0.012, 6, 18), 0xffffff, along(z));
        e.add(new THREE.CircleGeometry(0.05, 18), 0xffffff, { p: [0, AX, -0.45], r: [0, Math.PI, 0] });
        const energy = new THREE.Mesh(e.build(), this.coilMat);
        addOutline(energy, 0x2a1424, 0.0012);
        this.gun.add(energy);
        // the barrel tip: bolts, the muzzle flash (combat/effects) and overheat smoke start here
        this.muzzle = new THREE.Object3D();
        this.muzzle.position.set(0, 0.02, -0.47);
        this.gun.add(this.muzzle);

        // Glove holding the grip (thumb wrapped round the left side)
        const h = new GeoBuilder();
        addArm(h, new THREE.Vector3(0, -0.138, 0.07), new THREE.Vector3(0.05, -0.38, 0.92), -1);
        const hand = new THREE.Mesh(h.build(), mat);
        addOutline(hand, 0x2a1424, 0.0016);
        this.gun.add(hand);

        // Left hand (appears when throwing a grenade)
        const lh = new GeoBuilder();
        addArm(lh, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.25, 0.97), 1);
        this.leftHand = new THREE.Mesh(lh.build(), mat);
        addOutline(this.leftHand, 0x2a1424, 0.0016);
        this.leftHand.visible = false;
        this.root.add(this.leftHand);
        this.handOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshBasicMaterial({ color: 0x8ff0ff }));
        this.handOrb.position.set(0, 0.07, -0.03);
        this.leftHand.add(this.handOrb);

        this.base = new THREE.Vector3(0.25, -0.25, -0.58);
        this.root.scale.setScalar(0.68);
        this.kick = 0;
        this.throwT = 0;
        this.swayX = 0;
        this.swayY = 0;
        this.visible = true;
    }

    recoil() {
        this.kick = 1;
    }

    throwAnim() {
        this.throwT = 0.55;
        this.leftHand.visible = true;
    }

    update(dt, p) {
        // p: { bob, bobAmt, sprint, lookDX, lookDY, heat, overheated, landDip, aspect, fov }
        this.camera.fov = p.fov;
        this.camera.aspect = p.aspect;
        this.camera.updateProjectionMatrix();
        this.kick = Math.max(0, this.kick - dt * 9);
        this.swayX = damp(this.swayX, clamp(-p.lookDX * 0.0009, -0.05, 0.05), 10, dt);
        this.swayY = damp(this.swayY, clamp(p.lookDY * 0.0009, -0.05, 0.05), 10, dt);
        const bx = Math.cos(p.bob) * 0.012 * p.bobAmt;
        const by = -Math.abs(Math.sin(p.bob)) * 0.016 * p.bobAmt;
        const spr = p.sprint;
        const over = p.overheatK;
        this.root.position.set(
            this.base.x + this.swayX + bx + spr * 0.04,
            this.base.y + this.swayY + by - spr * 0.06 - p.landDip * 0.3 - over * 0.05,
            this.base.z + this.kick * 0.06,
        );
        this.root.rotation.set(this.kick * 0.12 - spr * 0.3 - over * 0.4, spr * 0.5 + over * 0.3, spr * 0.25 + over * 0.2);
        // heat color
        const h = p.heat;
        const c = this.coilMat.color;
        if (p.overheated) c.setRGB(1, 0.25 + Math.sin(performance.now() * 0.03) * 0.15, 0.15);
        else if (h < 0.5) c.setRGB(lerp(0.44, 1, h * 2), lerp(0.94, 0.88, h * 2), lerp(1, 0.4, h * 2));
        else c.setRGB(1, lerp(0.88, 0.3, (h - 0.5) * 2), lerp(0.4, 0.15, (h - 0.5) * 2));
        // grenade throw
        if (this.throwT > 0) {
            this.throwT -= dt;
            const t = 1 - this.throwT / 0.55;
            this.leftHand.position.set(-0.22 + t * 0.05, -0.32 + Math.sin(t * Math.PI) * 0.22, -0.35 - t * 0.3);
            this.leftHand.rotation.set(-0.3 - t * 0.8, 0.2, 0);
            this.handOrb.visible = t < 0.45;
            if (this.throwT <= 0) this.leftHand.visible = false;
        }
        this.root.visible = this.visible;
    }

    syncSun(sunDirView) {
        this.sun.position.copy(sunDirView).multiplyScalar(10);
    }

    // Match the light of the level you're in (Mars dust or alien purple)
    setLighting(sky, ground, intensity) {
        this.hemi.color.set(sky);
        this.hemi.groundColor.set(ground);
        this.hemi.intensity = intensity;
    }
}

// ------------------------------------------------------------
// Player
// ------------------------------------------------------------
export class Player {
    constructor(game) {
        this.game = game;
        this.pos = new THREE.Vector3();
        this.vel = new THREE.Vector3();
        this.eyePos = new THREE.Vector3();
        this.forward = new THREE.Vector3(0, 0, -1);
        this.yaw = 0;
        this.pitch = 0;
        this.vm = new ViewModel();
        this.maxHealth = PLAYER.hearts * 2;
        this.health = this.maxHealth;
        this.maxShield = 6;
        this.shield = this.maxShield;
        this.shieldDelay = 0;
        this.heat = 0;
        this.overheated = false;
        this.overheatT = 0;
        this.fireT = 0;
        this.sinceFire = 1;
        this.grenades = PLAYER.grenades;
        this.grenadeCd = 0;
        this.dead = false;
        this.locked = false;
        this.god = false;
        this.bob = 0;
        this.bobAmt = 0;
        this.stepDist = 0;
        this.shakeAmt = 0;
        this.landDip = 0;
        this.recoilPitch = 0;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.fov = 75;
        this.sprintK = 0;
        this.overheatK = 0;
        this.roll = 0;
        this.onGround = true;
        this.lookDX = 0;
        this.lookDY = 0;
        this.invuln = 0;
        this.airTime = 0;
    }

    spawn(x, z, yaw) {
        const g = this.game;
        this.pos.set(x, g.world.groundAt(x, z), z);
        this.vel.set(0, 0, 0);
        this.yaw = yaw;
        this.pitch = -0.05;
        this.dead = false;
        this.maxShield = g.diff.shield;
        this.health = this.maxHealth;
        this.shield = this.maxShield;
        this.heat = 0;
        this.overheated = false;
        this.invuln = 1.5;
        this.updateEye();
    }

    updateEye() {
        this.eyePos.set(this.pos.x, this.pos.y + PLAYER.eye, this.pos.z);
    }

    shake(a) {
        this.shakeAmt = Math.min(1, this.shakeAmt + a);
    }

    // Is a segment (e.g. an alien bolt) hitting the player's capsule?
    hitBySegment(a, b, pad) {
        const r = PLAYER.radius + pad;
        // closest point on segment ab to the vertical axis segment
        const p0y = this.pos.y + 0.3, p1y = this.pos.y + PLAYER.height - 0.1;
        // sample the segment (short at bolt speeds)
        for (let k = 0; k <= 4; k++) {
            _seg.lerpVectors(a, b, k / 4);
            const y = clamp(_seg.y, p0y, p1y);
            const dx = _seg.x - this.pos.x, dy = _seg.y - y, dz = _seg.z - this.pos.z;
            if (dx * dx + dy * dy + dz * dz < r * r) return true;
        }
        return false;
    }

    hurt(dmg, fromVel) {
        const g = this.game;
        if (this.dead || this.god || this.invuln > 0) return;
        this.shieldDelay = PLAYER.shieldDelay;
        this.shieldCharging = false;
        if (this.shield > 0) {
            const absorbed = Math.min(this.shield, dmg);
            this.shield -= absorbed;
            dmg -= absorbed;
            g.hud.shieldHit();
            g.audio.play('playerShieldHit');
            if (this.shield <= 0) g.audio.play('shieldDown');
        }
        if (dmg > 0) {
            this.health = Math.max(0, this.health - dmg);
            g.hud.damage();
            g.audio.play('playerHurt');
        }
        if (fromVel) g.hud.damageFrom(fromVel, this.yaw);
        this.shake(0.22);
        if (this.health <= 0) this.die();
    }

    heal(n) {
        this.health = Math.min(this.maxHealth, this.health + n);
    }

    die() {
        this.dead = true;
        this.vel.set(0, 0, 0);
        this.game.onPlayerDown();
    }

    update(dt, input) {
        const g = this.game;
        const world = g.world;
        this.invuln = Math.max(0, this.invuln - dt);

        // ---------------- look ----------------
        // Mouse sensitivity scales the mouse, look sensitivity scales a controller's stick,
        // and "up/down speed" scales vertical looking for both.
        const S = g.settings;
        const mouseSens = S.sensitivity * 0.0022;
        const padSens = S.lookSensitivity * 0.0022;
        const inv = S.invert ? -1 : 1;
        const padX = input.padLookX || 0, padY = input.padLookY || 0;
        const dYaw = input.lookX * mouseSens + padX * padSens;
        const dPitch = (input.lookY * mouseSens + padY * padSens) * S.verticalLook * inv;
        if (!this.locked && !this.dead) {
            this.yaw -= dYaw;
            this.pitch -= dPitch;
            this.pitch = clamp(this.pitch, -1.48, 1.48);
        }
        this.lookDX = input.lookX + padX;
        this.lookDY = input.lookY + padY;
        this.recoilPitch = damp(this.recoilPitch, 0, 10, dt);

        // ---------------- move ----------------
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        let mx = 0, mz = 0;
        let sprint = false;
        if (!this.locked && !this.dead) {
            const f = input.moveY, r = input.moveX;
            mx = -sy * f + cy * r;
            mz = -cy * f - sy * r;
            const ml = Math.hypot(mx, mz);
            if (ml > 1) { mx /= ml; mz /= ml; }
            sprint = input.sprint && f > 0.2;
        }
        const maxSpeed = sprint ? PLAYER.sprint : PLAYER.walk;
        this.sprintK = damp(this.sprintK, sprint && Math.hypot(this.vel.x, this.vel.z) > 7 ? 1 : 0, 8, dt);

        if (this.onGround) {
            const tx = mx * maxSpeed, tz = mz * maxSpeed;
            const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
            const dl = Math.hypot(dvx, dvz);
            const acc = (mx || mz ? PLAYER.accel : PLAYER.friction * 6) * dt;
            if (dl <= acc) { this.vel.x = tx; this.vel.z = tz; }
            else { this.vel.x += (dvx / dl) * acc; this.vel.z += (dvz / dl) * acc; }
        } else {
            this.vel.x += mx * PLAYER.airAccel * dt;
            this.vel.z += mz * PLAYER.airAccel * dt;
            const hs = Math.hypot(this.vel.x, this.vel.z);
            const cap = Math.max(maxSpeed, PLAYER.walk);
            if (hs > cap) { this.vel.x *= cap / hs; this.vel.z *= cap / hs; }
        }

        // jumping (with a little coyote time + buffering so it feels forgiving)
        this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);
        if (input.jump && !this.locked && !this.dead) this.jumpBuffer = 0.12;
        else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
        if (this.jumpBuffer > 0 && this.coyote > 0) {
            this.vel.y = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);
            this.onGround = false;
            this.coyote = 0;
            this.jumpBuffer = 0;
            g.audio.play('jump');
        }

        // steep slopes: can't walk up them, and you slide down
        world.normalAt(this.pos.x, this.pos.z, _n);
        if (_n.y < 0.66) {
            let ux = -_n.x, uz = -_n.z;
            const ul = Math.hypot(ux, uz) || 1;
            ux /= ul; uz /= ul;
            const up = this.vel.x * ux + this.vel.z * uz;
            if (up > 0) { this.vel.x -= up * ux; this.vel.z -= up * uz; }
            if (this.onGround) { this.vel.x -= ux * 12 * dt; this.vel.z -= uz * 12 * dt; }
        }

        this.vel.y -= PLAYER.gravity * dt;
        const prevY = this.pos.y;
        this.pos.x += this.vel.x * dt;
        this.pos.z += this.vel.z * dt;
        this.pos.y += this.vel.y * dt;

        // stay inside the canyon (or the mothership's rooms)
        this.pathS = world.confinePlayer(this.pos, PLAYER.radius);

        // rocks/props, force fields, ship dome
        const top = world.colliders.resolve(this.pos, PLAYER.radius, PLAYER.height, 0.55);
        if (world.blockByGates(this.pos, PLAYER.radius + 0.2)) g.onGateBump?.();
        world.domeBlocks(this.pos, PLAYER.radius + 0.2);

        // ceiling (inside the mothership)
        const ceil = world.ceilingAt(this.pos.x, this.pos.z) - PLAYER.height - 0.1;
        if (this.pos.y > ceil) {
            this.pos.y = ceil;
            if (this.vel.y > 0) this.vel.y = 0;
        }

        // ground
        let ground = world.groundAt(this.pos.x, this.pos.z);
        if (top > ground) ground = top;
        const wasGround = this.onGround;
        const snap = wasGround && this.vel.y <= 0 ? 0.45 : 0;
        if (this.pos.y <= ground + snap) {
            const fallSpeed = -this.vel.y;
            if (!wasGround) {
                if (fallSpeed > 5) {
                    this.landDip = Math.min(0.18, fallSpeed * 0.018);
                    g.effects.dust(this.pos.x, ground, this.pos.z, 7, 0.8);
                    g.audio.play('land');
                }
            }
            this.pos.y = ground;
            if (this.vel.y < 0) this.vel.y = 0;
            this.onGround = true;
            this.airTime = 0;
        } else {
            this.onGround = false;
            this.airTime += dt;
        }
        this.landDip = damp(this.landDip, 0, 7, dt);

        // footsteps
        const hspeed = Math.hypot(this.vel.x, this.vel.z);
        if (this.onGround && hspeed > 0.5) {
            this.stepDist += hspeed * dt;
            this.bob += hspeed * dt * 1.25;
            this.bobAmt = damp(this.bobAmt, clamp(hspeed / PLAYER.walk, 0, 1.3), 8, dt);
            const stride = sprint ? 2.9 : 2.2;
            if (this.stepDist > stride) {
                this.stepDist = 0;
                g.audio.play('step');
                if (sprint) g.effects.dust(this.pos.x, this.pos.y, this.pos.z, 2, 0.3, 0xd99a74, 0.35);
            }
        } else {
            this.bobAmt = damp(this.bobAmt, 0, 6, dt);
        }

        // ---------------- shield regen ----------------
        if (!this.dead) {
            if (this.shieldDelay > 0) this.shieldDelay -= dt;
            else if (this.shield < this.maxShield) {
                if (!this.shieldCharging) {
                    this.shieldCharging = true;
                    g.audio.play('shieldCharge');
                }
                this.shield = Math.min(this.maxShield, this.shield + PLAYER.shieldRate * dt);
            } else this.shieldCharging = false;
        }

        // ---------------- weapons ----------------
        this.fireT -= dt;
        this.grenadeCd -= dt;
        this.sinceFire += dt;
        if (this.overheated) {
            this.overheatT -= dt;
            if (Math.random() < dt * 14) {
                this.vm.muzzle.getWorldPosition(_v);
                this.vmToWorld(_v);
                g.effects.spawn({
                    x: _v.x, y: _v.y, z: _v.z, vx: rand(-0.3, 0.3), vy: rand(0.8, 1.6), vz: rand(-0.3, 0.3),
                    life: 0.8, size: 0.1, size1: 0.45, color: 0xffffff, alpha: 0.5, alpha1: 0, drag: 2,
                });
            }
            if (this.overheatT <= 0) {
                this.overheated = false;
                this.heat = 0.35;
                g.audio.play('vented');
            }
        } else if (this.sinceFire > 0.18) {
            this.heat = Math.max(0, this.heat - PLAYER.coolRate * dt);
        }
        this.overheatK = damp(this.overheatK, this.overheated ? 1 : 0, 8, dt);

        const canAct = !this.locked && !this.dead;
        if (canAct && input.fire && this.fireT <= 0 && !this.overheated && this.sprintK < 0.5) this.shoot();
        if (canAct && input.grenade && this.grenadeCd <= 0) {
            if (this.grenades > 0) this.throwGrenade();
            else if (input.grenadePressed) { g.audio.play('empty'); g.hud.toast('No grenades! Defeat aliens to find more.', 1.6); }
        }

        this.updateEye();
    }

    // Convert a point from view-model space (camera-relative) into the world
    vmToWorld(v) {
        return v.applyMatrix4(this.game.camera.matrixWorld);
    }

    shoot() {
        const g = this.game;
        this.fireT = 1 / PLAYER.fireRate;
        this.sinceFire = 0;
        this.heat += PLAYER.heatPerShot;
        if (this.heat >= 1) {
            this.heat = 1;
            this.overheated = true;
            this.overheatT = PLAYER.overheatTime;
            g.audio.play('overheat');
            g.hud.toast('OVERHEATED! Let it cool...', 1.4);
        }
        const cam = g.camera;
        const origin = _v.copy(cam.position);
        const dir = _v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
        // gentle aim assist (leads moving aliens a little so kids can hit them)
        const t = g.aliens.aimTarget(origin, dir, g.diff.aimAssist + (g.input.usingGamepad ? 0.04 : 0), 90, true);
        if (t) {
            const tp = t.aimAt.clone();
            const travel = tp.distanceTo(origin) / PLAYER.boltSpeed;
            tp.x += t.vel.x * travel;
            tp.z += t.vel.z * travel;
            dir.copy(tp.sub(origin).normalize());
        }
        // The bolt really flies along the crosshair ray (so what you aim at is what you hit);
        // it's just drawn starting at the gun's muzzle and slides onto that ray.
        const muzzle = this.vm.muzzle.getWorldPosition(new THREE.Vector3());
        this.vmToWorld(muzzle);
        const start = origin.clone().addScaledVector(dir, 0.3);
        g.combat.playerBolt(start, dir, 1, muzzle.clone().sub(start));
        g.effects.glowFlash(muzzle.x, muzzle.y, muzzle.z, 0x6ff0ff, 0.6, 0.06);
        this.vm.recoil();
        this.recoilPitch += 0.01;
        g.audio.play('blaster');
        g.stats.shots++;
    }

    throwGrenade() {
        const g = this.game;
        this.grenades--;
        this.grenadeCd = 0.7;
        const cam = g.camera;
        const fwd = _v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
        const origin = cam.position.clone().addScaledVector(fwd, 0.6);
        origin.y -= 0.15;
        const vel = fwd.clone().multiplyScalar(20);
        vel.y += 5.5;
        vel.x += this.vel.x * 0.5;
        vel.z += this.vel.z * 0.5;
        g.combat.throwGrenade(origin, vel);
        this.vm.throwAnim();
        g.audio.play('throw');
    }

    // Position + orient the camera
    updateCamera(camera, dt) {
        this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
        const sh = this.shakeAmt * this.shakeAmt;
        const bobY = Math.sin(this.bob * 2) * 0.045 * this.bobAmt;
        const bobX = Math.cos(this.bob) * 0.03 * this.bobAmt;
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        camera.position.set(
            this.eyePos.x + cy * bobX + rand(-1, 1) * sh * 0.15,
            this.eyePos.y + bobY - this.landDip + rand(-1, 1) * sh * 0.15,
            this.eyePos.z - sy * bobX + rand(-1, 1) * sh * 0.15,
        );
        this.roll = damp(this.roll, 0, 6, dt);
        camera.rotation.set(this.pitch + this.recoilPitch, this.yaw, this.roll + rand(-1, 1) * sh * 0.03, 'YXZ');
        const targetFov = 75 + this.sprintK * 8;
        this.fov = damp(this.fov, targetFov, 6, dt);
        if (Math.abs(camera.fov - this.fov) > 0.01) {
            camera.fov = this.fov;
            camera.updateProjectionMatrix();
        }
        this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        this.vm.update(dt, {
            bob: this.bob, bobAmt: this.bobAmt, sprint: this.sprintK, lookDX: this.lookDX, lookDY: this.lookDY,
            heat: this.heat, overheated: this.overheated, overheatK: this.overheatK, landDip: this.landDip,
            aspect: camera.aspect, fov: camera.fov,
        });
    }
}
