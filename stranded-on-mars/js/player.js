// ============================================================
// PLAYER — first-person astronaut with a plasma blaster
// ============================================================

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { pathQuery } from './layout.js';
import { GeoBuilder, toonMaterial, addOutline } from './toon.js';
import { clamp, lerp, damp, rand } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = {};
const _seg = new THREE.Vector3();

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

        // Blaster
        const b = new GeoBuilder();
        b.add(new THREE.BoxGeometry(0.11, 0.13, 0.4), 0xf6f2ea, { p: [0, 0, 0] });
        b.add(new THREE.BoxGeometry(0.115, 0.04, 0.3), 0xff7a2e, { p: [0, 0.035, -0.02] });
        b.add(new THREE.CylinderGeometry(0.075, 0.075, 0.4, 14), 0xf6f2ea, { p: [0, 0.04, -0.05], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.CylinderGeometry(0.034, 0.04, 0.22, 12), 0x8d97a3, { p: [0, 0.02, -0.32], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.TorusGeometry(0.045, 0.014, 8, 16), 0xff7a2e, { p: [0, 0.02, -0.43] });
        b.add(new THREE.BoxGeometry(0.07, 0.17, 0.09), 0x3a4250, { p: [0, -0.12, 0.08], r: [0.3, 0, 0] });
        b.add(new THREE.BoxGeometry(0.02, 0.08, 0.14), 0xff7a2e, { p: [0.065, 0.09, 0.08] });
        b.add(new THREE.BoxGeometry(0.02, 0.08, 0.14), 0xff7a2e, { p: [-0.065, 0.09, 0.08] });
        b.add(new THREE.BoxGeometry(0.06, 0.03, 0.08), 0x3a4250, { p: [0, 0.135, 0.12] });
        const gunMesh = new THREE.Mesh(b.build(), mat);
        addOutline(gunMesh, 0x2a1424, 0.0016);
        this.gun.add(gunMesh);

        // Energy coil = heat gauge (cyan -> yellow -> red)
        this.coilMat = new THREE.MeshBasicMaterial({ color: 0x6ff0ff });
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.016, 8, 18), this.coilMat);
            ring.position.set(0, 0.04, 0.03 - i * 0.075);
            this.gun.add(ring);
        }
        this.muzzle = new THREE.Object3D();
        this.muzzle.position.set(0, 0.02, -0.47);
        this.gun.add(this.muzzle);
        this.flash = new THREE.Mesh(
            new THREE.PlaneGeometry(0.28, 0.28),
            new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        this.flash.position.copy(this.muzzle.position);
        this.gun.add(this.flash);

        // Glove holding the grip
        const h = new GeoBuilder();
        h.add(new THREE.SphereGeometry(0.075, 12, 10), 0xf6f2ea, { p: [0, -0.12, 0.08], s: [1.1, 1.2, 1.25] });
        h.add(new THREE.CylinderGeometry(0.07, 0.072, 0.07, 12), 0xff7a2e, { p: [0, -0.15, 0.17], r: [1.2, 0, 0] });
        h.add(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 12), 0xf6f2ea, { p: [0.02, -0.25, 0.4], r: [1.15, 0, 0] });
        const hand = new THREE.Mesh(h.build(), mat);
        addOutline(hand, 0x2a1424, 0.0016);
        this.gun.add(hand);

        // Left hand (appears when throwing a grenade)
        const lh = new GeoBuilder();
        lh.add(new THREE.SphereGeometry(0.075, 12, 10), 0xf6f2ea, { s: [1.1, 1.0, 1.2] });
        lh.add(new THREE.CylinderGeometry(0.07, 0.072, 0.07, 12), 0xff7a2e, { p: [0, -0.02, 0.09], r: [1.3, 0, 0] });
        lh.add(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 12), 0xf6f2ea, { p: [0, -0.1, 0.33], r: [1.3, 0, 0] });
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
        this.flash.material.opacity = 1;
        this.flash.rotation.z = Math.random() * Math.PI;
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
        this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 22);
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
        const T = world.terrain;
        this.invuln = Math.max(0, this.invuln - dt);

        // ---------------- look ----------------
        const sens = g.settings.sensitivity * 0.0022;
        const inv = g.settings.invert ? -1 : 1;
        if (!this.locked && !this.dead) {
            this.yaw -= input.lookX * sens;
            this.pitch -= input.lookY * sens * inv;
            this.pitch = clamp(this.pitch, -1.48, 1.48);
        }
        this.lookDX = input.lookX;
        this.lookDY = input.lookY;
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
        T.normalAt(this.pos.x, this.pos.z, _n);
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

        // stay inside the canyon
        const q = pathQuery(this.pos.x, this.pos.z, _q);
        if (q.sd > 1.0) {
            const ox = this.pos.x - q.cx, oz = this.pos.z - q.cz;
            const ol = Math.hypot(ox, oz) || 1;
            const lim = q.hw + 1.0;
            this.pos.x = q.cx + (ox / ol) * lim;
            this.pos.z = q.cz + (oz / ol) * lim;
        }
        this.pathS = q.s;

        // rocks/props, force fields, ship dome
        const top = world.colliders.resolve(this.pos, PLAYER.radius, PLAYER.height, 0.55);
        if (world.blockByGates(this.pos, PLAYER.radius + 0.2)) g.onGateBump?.();
        world.domeBlocks(this.pos, PLAYER.radius + 0.2);

        // ground
        let ground = T.heightAt(this.pos.x, this.pos.z);
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
            const tp = new THREE.Vector3(t.pos.x, t.pos.y + (t.aimY || 1.25) * t.T.scale, t.pos.z);
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
