// ============================================================
// COMBAT — plasma bolts (yours + the aliens') and sticky grenades,
// plus how hits look and feel: muzzle flash, tracers, impacts,
// hit markers, a smooth screen shake and FOV kick on blasts, and a
// tiny hit-stop on kills. (All gameplay numbers live in config.js
// and are unchanged by the effects here.)
// ============================================================

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { rand, clamp } from './util.js';
import { FX } from './effects.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Vector3();

const TRAIL = 0.034;          // seconds of flight a player bolt's tracer shows (about 4 m)
const GRENADE_POOL = 6;
const PLAYER_HIT = 0x9ff6ff;

class Bolt {
    constructor() {
        this.pos = new THREE.Vector3();
        this.prev = new THREE.Vector3();
        this.vel = new THREE.Vector3();
        this.color = new THREE.Color();
        this.vis = new THREE.Vector3();
    }
}

export class Combat {
    constructor(game) {
        this.game = game;
        this.bolts = [];
        this.pool = [];
        for (let i = 0; i < 48; i++) this.pool.push(new Bolt());
        this.tally = { alien: 0, ground: 0, prop: 0, shield: 0, expired: 0 };
        this.grenades = [];
        game.effects.addDrawer((glow, smoke) => this.draw(glow, smoke));
        this.grenadeGeo = new THREE.IcosahedronGeometry(0.13, 1);
        this.grenadeMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff });
        this.spikeGeo = new THREE.ConeGeometry(0.035, 0.12, 5);
        // grenade meshes are made once and reused
        this.grenadePool = [];
        for (let i = 0; i < GRENADE_POOL; i++) this.grenadePool.push(this.makeGrenade());

        // feel
        this.muzzleT = 0;         // muzzle flash timer
        this.muzzleRot = 0;
        this.muzzleN = 0;
        this.shake = 0;           // smooth camera shake (0..1)
        this.shakeTime = 0;
        this.fovKick = 0;         // degrees added to the FOV
        this.roll = 0;            // camera roll kick (radians)
        this.wasOverheated = false;
    }

    makeGrenade() {
        const mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(this.grenadeGeo, this.grenadeMat));
        const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (const d of dirs) {
            const s = new THREE.Mesh(this.spikeGeo, this.grenadeMat);
            s.position.set(d[0] * 0.14, d[1] * 0.14, d[2] * 0.14);
            s.lookAt(d[0] * 2, d[1] * 2, d[2] * 2);
            s.rotateX(Math.PI / 2);
            mesh.add(s);
        }
        mesh.visible = false;
        this.game.scene.add(mesh);
        return {
            mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), offset: new THREE.Vector3(), spin: new THREE.Vector3(),
            fuse: 0, stuck: null, resting: false, trailT: 0,
        };
    }

    clear() {
        for (const b of this.bolts) this.pool.push(b);
        this.bolts.length = 0;
        for (const g of this.grenades) this.freeGrenade(g);
        this.grenades.length = 0;
        this.shake = 0;
        this.fovKick = 0;
        this.roll = 0;
        this.muzzleT = 0;
    }

    freeGrenade(gr) {
        gr.mesh.visible = false;
        gr.stuck = null;
        if (!this.grenadePool.includes(gr)) this.grenadePool.push(gr);
    }

    _bolt(origin, dir, speed, dmg, owner, color, size) {
        const b = this.pool.pop() || new Bolt();
        b.vis.set(0, 0, 0);
        b.pos.copy(origin);
        b.prev.copy(origin);
        b.vel.copy(dir).multiplyScalar(speed);
        b.dmg = dmg;
        b.owner = owner;
        b.color.set(color);
        b.size = size;
        b.life = owner === 'player' ? 1.6 : 6;
        b.age = 0;
        b.trailT = 0;
        this.bolts.push(b);
        return b;
    }

    playerBolt(origin, dir, dmg = 1, visualOffset = null) {
        const b = this._bolt(origin, dir, PLAYER.boltSpeed, dmg, 'player', 0x56eaff, 0.34);
        if (visualOffset) b.vis.copy(visualOffset);
        // muzzle flash (drawn at the gun every frame while it lasts) + a little light on the surroundings
        const fx = this.game.effects;
        fx.eatGlow = 1;
        this.muzzleT = 0.065;
        this.muzzleRot = rand(-0.5, 0.5);
        this.muzzleN++;
        _p.copy(origin).add(b.vis);
        fx.lightFlash(_p.x, _p.y, _p.z, 0x6ff0ff, 7, 0.07);
        // a tiny camera roll kick (roll never changes where you aim)
        this.roll += (this.muzzleN % 2 ? 1 : -1) * 0.0035;
        if (this.fovKick <= 0.02) this.fovKick = Math.min(this.fovKick, -0.45);
        return b;
    }

    alienBolt(origin, dir, speed, dmg, color, size) {
        const b = this._bolt(origin, dir, speed, dmg, 'alien', color, size);
        const fx = this.game.effects;
        fx.glowFlash(origin.x, origin.y, origin.z, color, size * 3, 0.12);
        fx.bang(origin.x, origin.y, origin.z, color, size * 1.5, 0.08, 6);
        return b;
    }

    throwGrenade(origin, vel) {
        const gr = this.grenadePool.pop() || this.makeGrenade();
        gr.mesh.position.copy(origin);
        gr.mesh.visible = true;
        gr.mesh.scale.setScalar(1);
        gr.pos.copy(origin);
        gr.vel.copy(vel);
        gr.fuse = 1.9;
        gr.stuck = null;
        gr.offset.set(0, 0, 0);
        gr.resting = false;
        gr.trailT = 0;
        gr.spin.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
        this.grenades.push(gr);
    }

    // ---------- How hits look ----------

    // Impacts grow with distance so they stay easy to see far away
    distScale(x, y, z) {
        const c = this.game.camera.position;
        return clamp(Math.hypot(x - c.x, y - c.y, z - c.z) / 12, 1, 3.2);
    }

    // The direction a surface faces where a bolt hit it (into out)
    surfaceNormal(x, y, z, b, kind, collider, out) {
        const W = this.game.world;
        if (kind === 'ground') return W.normalAt(x, z, out);
        if (kind === 'prop' && collider) {
            if (y > collider.top - 0.3) return out.set(0, 1, 0);
            out.set(x - collider.x, 0, z - collider.z);
            return out.lengthSq() > 1e-6 ? out.normalize() : out.copy(b.vel).normalize().negate();
        }
        if (kind === 'wall' && W.isSolid) {
            // step back out of the wall and probe which sides are solid
            _m.copy(b.vel).normalize();
            const px = x - _m.x * 0.06, py = y - _m.y * 0.06, pz = z - _m.z * 0.06;
            const e = 0.14;
            out.set(
                (W.isSolid(px - e, py, pz) ? 1 : 0) - (W.isSolid(px + e, py, pz) ? 1 : 0),
                (W.isSolid(px, py - e, pz) ? 1 : 0) - (W.isSolid(px, py + e, pz) ? 1 : 0),
                (W.isSolid(px, py, pz - e) ? 1 : 0) - (W.isSolid(px, py, pz + e) ? 1 : 0),
            );
            if (out.lengthSq() > 0) return out.normalize();
        }
        return out.copy(b.vel).normalize().negate();
    }

    impact(x, y, z, color, kind = 'ground', b = null, collider = null) {
        const fx = this.game.effects;
        const k = this.distScale(x, y, z);
        const n = b ? this.surfaceNormal(x, y, z, b, kind, collider, _n) : _n.set(0, 1, 0);
        // the flash sits just off the surface so the surface doesn't cut it in half
        const ox = x + n.x * 0.14 * k, oy = y + n.y * 0.14 * k, oz = z + n.z * 0.14 * k;
        const mine = b && b.owner === 'player';
        if (kind === 'shield') {
            // force fields: a ripple facing the shot
            fx.bang(ox, oy, oz, 0xf2d2ff, 0.5 * k, 0.08, 6);
            fx.burstRing(ox, oy, oz, color, 0.12 * k, 0.75 * k, 0.26, 0.16, 0.45, n.x, n.y, n.z);
            fx.spray(ox, oy, oz, n.x, n.y, n.z, color, 6, 5, 0.1 * Math.sqrt(k), 0.35);
            return;
        }
        fx.bang(ox, oy, oz, mine ? 0x56eaff : color, (mine ? 0.55 : 0.45) * k, 0.09, 7);
        fx.burstRing(x + n.x * 0.05, y + n.y * 0.05, z + n.z * 0.05, color, 0.08 * k, 0.6 * k, 0.2, 0.22, 0.6, n.x, n.y, n.z);
        fx.spray(ox, oy, oz, n.x, n.y, n.z, color, mine ? 7 : 5, 6, 0.11 * Math.sqrt(k), 0.38);
        if (kind === 'ground') {
            fx.dust(x, y - 0.1, z, 2, 0.2, 0xd99a74, 0.38);
            for (let j = 0; j < 3; j++) {
                const ch = fx.emit(0, x, y + 0.1, z, n.x * 2 + rand(-1.5, 1.5), rand(2.5, 4.5), n.z * 2 + rand(-1.5, 1.5),
                    rand(0.45, 0.65), rand(0.08, 0.13) * k, 0.06 * k, 0xb8664a, 0xb8664a, 1, 1);
                ch.shape = FX.CHUNK; ch.grav = 16; ch.rotV = rand(-10, 10); ch.param = Math.random(); ch.aPow = 5;
            }
        }
        // scorch mark (not on rocks and props: their colliders are only rough cylinders)
        if (kind !== 'prop') fx.decal(x, y, z, n.x, n.y, n.z, mine ? 0.5 : 0.42, color, 1.8, mine ? 0.5 : 0.35);
    }

    // Where a bolt entered a prop's collider (the bolt can end its step well inside it) (looks only)
    propPoint(b, c, out) {
        let lo = 0, hi = 1;
        for (let k = 0; k < 7; k++) {
            const m = (lo + hi) * 0.5;
            out.lerpVectors(b.prev, b.pos, m);
            const dx = out.x - c.x, dz = out.z - c.z;
            if (dx * dx + dz * dz < c.r * c.r && out.y < c.top && out.y > c.bottom) hi = m; else lo = m;
        }
        return out.lerpVectors(b.prev, b.pos, hi);
    }

    // Your shot landed on an alien (or the boss's eye)
    hitAlien(p, b, head, killed) {
        const fx = this.game.effects;
        const k = this.distScale(p.x, p.y, p.z);
        _m.copy(b.vel).normalize().negate();
        const ox = p.x + _m.x * 0.25, oy = p.y + _m.y * 0.25, oz = p.z + _m.z * 0.25;
        if (head) {
            fx.bang(ox, oy, oz, 0xffd166, 0.95 * k, 0.11, 8);
            fx.burstRing(ox, oy, oz, 0xffe7a3, 0.1 * k, 0.8 * k, 0.2, 0.18, 0.6);
            fx.stars(p.x, p.y + 0.25, p.z, 3, 0xffd23a, 0.28 * Math.sqrt(k), 2.4);
            fx.spray(ox, oy, oz, _m.x, _m.y, _m.z, 0xffd166, 8, 6, 0.12 * Math.sqrt(k), 0.4);
        } else {
            fx.bang(ox, oy, oz, 0xffffff, 0.68 * k, 0.085, 8);
            fx.spray(ox, oy, oz, _m.x, _m.y, _m.z, PLAYER_HIT, 8, 6, 0.11 * Math.sqrt(k), 0.38);
        }
        if (killed) {
            fx.burstRing(ox, oy, oz, 0xffffff, 0.2 * k, 1.5 * k, 0.26, 0.12, 0.7);
            fx.sparkle(ox, oy, oz, 0xfff1a8, 1.1 * k, 0.22);
            this.hitStop();
        }
    }

    // A bolt bounced off armor: GLORBAX's skin (no damage) — a "ting" and a ricochet
    hitArmor(p, b) {
        const fx = this.game.effects;
        const k = this.distScale(p.x, p.y, p.z);
        _m.copy(b.vel).normalize().negate();
        const ox = p.x + _m.x * 0.3, oy = p.y + _m.y * 0.3, oz = p.z + _m.z * 0.3;
        fx.bang(ox, oy, oz, 0xfff6d8, 0.6 * k, 0.09, 5);
        fx.sparkle(ox, oy, oz, 0xfffbe8, 1.1 * k, 0.26, 0.9);
        fx.burstRing(ox, oy, oz, 0xffffff, 0.1 * k, 0.6 * k, 0.2, 0.18, 0.5);
        fx.spray(ox, oy, oz, _m.x, _m.y + 0.6, _m.z, 0xfff1c0, 5, 9, 0.13 * Math.sqrt(k), 0.45);
        const s = fx.emit(0, ox, oy, oz, _m.x, 0.6, _m.z, 0.4, 0.2 * k, 0.5 * k, 0xd9d2e6, 0xb9b0c8, 0.7, 0);
        s.drag = 3;
    }

    // The Alien Captain's gold shield shell soaked up the shot
    hitShield(p, b, alien) {
        const fx = this.game.effects;
        const k = this.distScale(p.x, p.y, p.z);
        _m.copy(b.vel).normalize().negate();
        const ox = p.x + _m.x * 0.15, oy = p.y + _m.y * 0.15, oz = p.z + _m.z * 0.15;
        fx.bang(ox, oy, oz, 0xfffbe8, 0.6 * k, 0.09, 6);
        fx.burstRing(ox, oy, oz, 0xffffff, 0.12 * k, 0.95 * k, 0.3, 0.16, 0.75, _m.x, _m.y, _m.z);
        fx.burstRing(ox, oy, oz, 0xffb02e, 0.2 * k, 1.3 * k, 0.36, 0.1, 0.5, _m.x, _m.y, _m.z);
        fx.spray(ox, oy, oz, _m.x, _m.y, _m.z, 0xffd166, 6, 6, 0.11 * Math.sqrt(k), 0.35);
    }

    // A couple of frames of freeze-frame when an alien goes down
    hitStop() {
        const g = this.game;
        if (g.slowMo && !(g.slowT > 0)) g.slowMo(0.055, 0.1);
    }

    // Smooth camera shake + FOV kick (strength 0..1)
    kick(strength, fov = 0) {
        this.shake = Math.min(1, Math.max(this.shake, strength));
        this.fovKick = Math.max(this.fovKick, fov);
    }

    update(dt) {
        const g = this.game;
        const world = g.world;
        const P = g.player;
        const fx = g.effects;

        // feel: everything settles back quickly
        this.shake *= Math.exp(-dt * 5.5);
        this.fovKick *= Math.exp(-dt * (this.fovKick < 0 ? 26 : 8));
        this.roll *= Math.exp(-dt * 20);
        this.shakeTime += dt;
        this.muzzleT -= dt;

        for (let i = this.bolts.length - 1; i >= 0; i--) {
            const b = this.bolts[i];
            b.age += dt;
            b.life -= dt;
            b.prev.copy(b.pos);
            b.pos.addScaledVector(b.vel, dt);
            let hit = false;
            const hx = b.pos.x, hy = b.pos.y, hz = b.pos.z;

            // force fields
            const gh = world.segmentHitsGate(b.prev.x, b.prev.y, b.prev.z, hx, hy, hz);
            if (gh) {
                this.impact(gh.x, gh.y, gh.z, 0xd77aff, 'shield', b);
                g.audio.play('shieldZap', _p.set(gh.x, gh.y, gh.z));
                hit = true;
                if (b.owner === 'player') this.tally.shield++;
            }
            // ship dome
            if (!hit && world.dome.on) {
                const d = world.dome;
                const r1 = Math.hypot(b.prev.x - d.x, b.prev.y - d.y, b.prev.z - d.z);
                const r2 = Math.hypot(hx - d.x, hy - d.y, hz - d.z);
                if ((r1 - d.r) * (r2 - d.r) < 0 && hy > d.y) {
                    this.impact(hx, hy, hz, 0xd77aff, 'shield', b);
                    hit = true;
                }
            }
            // targets
            if (!hit) {
                if (b.owner === 'player') {
                    const res = g.aliens.segmentHit(b.prev, b.pos, 0.3);
                    if (res) {
                        _p.lerpVectors(b.prev, b.pos, res.t);
                        if (res.alien.isArmored?.(_p)) {
                            // the boss's tough skin: bolts bounce off
                            res.alien.armorHit(_p);
                            this.hitArmor(_p, b);
                            g.hud.hitMarker(false, 'armor');
                        } else {
                            const head = res.alien.isHeadshot(_p);
                            const shielded = res.alien.shield > 0;
                            const killed = res.alien.hurt(b.dmg * (head ? 2 : 1), _p, head);
                            if (shielded) this.hitShield(_p, b, res.alien);
                            else this.hitAlien(_p, b, head, killed);
                            g.hud.hitMarker(killed, shielded ? 'shield' : head ? 'head' : 'body');
                        }
                        hit = true;
                        this.tally.alien++;
                    }
                } else if (!P.dead) {
                    if (P.hitBySegment(b.prev, b.pos, b.size * 0.4)) {
                        const hurts = !P.god && P.invuln <= 0;
                        P.hurt(b.dmg, b.vel);
                        if (hurts) {
                            // knocked a little: roll away from the side it came from + a small FOV pulse
                            const side = Math.sign(b.vel.x * Math.cos(P.yaw) - b.vel.z * Math.sin(P.yaw)) || 1;
                            this.roll += side * 0.035;
                            this.kick(0.32, 2.2);
                        }
                        hit = true;
                    }
                }
            }
            // ground (and the mothership's walls)
            if (!hit) {
                const sh = world.solidHit(b.prev, b.pos);
                if (sh) {
                    if (sh.dust) this.groundPoint(b, sh);
                    this.impact(sh.x, sh.y, sh.z, b.owner === 'player' ? PLAYER_HIT : b.color.getHex(), sh.dust ? 'ground' : 'wall', b);
                    if (b.owner === 'player') { g.audio.play('boltHit', _p.set(sh.x, sh.y, sh.z)); this.tally.ground++; }
                    hit = true;
                }
            }
            // rocks and props
            if (!hit) {
                const c = world.colliders.pointHit(hx, hy, hz, 0.05);
                if (c) {
                    this.propPoint(b, c, _a);
                    this.impact(_a.x, _a.y, _a.z, b.owner === 'player' ? PLAYER_HIT : b.color.getHex(), 'prop', b, c);
                    hit = true;
                    if (b.owner === 'player') this.tally.prop++;
                }
            }
            if (!hit && b.life <= 0 && b.owner === 'player') this.tally.expired++;
            if (hit || b.life <= 0) {
                this.bolts.splice(i, 1);
                this.pool.push(b);
                continue;
            }
            // alien plasma leaves a little sparkle trail
            if (b.owner === 'alien') {
                b.trailT -= dt;
                if (b.trailT <= 0 && b.pos.distanceToSquared(g.camera.position) > 9) {
                    b.trailT = 0.035;
                    const s = fx.emit(1, hx, hy, hz, rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4), 0.38, b.size * 0.75, 0.05,
                        b.color.getHex(), b.color.getHex(), 0.9, 0);
                    s.shape = FX.SPARKLE; s.solid = 0.4; s.rot = rand(-0.6, 0.6);
                }
            }
        }

        // grenades
        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const gr = this.grenades[i];
            gr.fuse -= dt;
            if (gr.stuck) {
                if (gr.stuck.gone) {
                    gr.stuck = null;
                    gr.resting = false;
                } else {
                    gr.pos.copy(gr.stuck.pos).add(gr.offset);
                }
            } else if (!gr.resting) {
                gr.vel.y -= PLAYER.gravity * dt;
                _a.copy(gr.pos);
                gr.pos.addScaledVector(gr.vel, dt);
                // stick to aliens!
                const res = g.aliens.segmentHit(_a, gr.pos, 0.25);
                if (res) {
                    gr.stuck = res.alien;
                    if (res.alien.stickOffset) res.alien.stickOffset(_b.lerpVectors(_a, gr.pos, res.t), gr.offset);
                    else gr.offset.set(0, 1.25 * res.alien.T.scale, 0);
                    gr.vel.set(0, 0, 0);
                    gr.fuse = Math.max(gr.fuse, 1.1);
                    g.audio.play('stick', gr.pos);
                    g.hud.toast('STUCK! 💥', 1.2);
                    res.alien.alertTo(0);
                    fx.burstRing(gr.pos.x, gr.pos.y, gr.pos.z, 0x8ff0ff, 0.1, 0.8, 0.25, 0.2, 0.5);
                    fx.sparkle(gr.pos.x, gr.pos.y, gr.pos.z, 0xffffff, 0.7, 0.2);
                }
                // force fields stop grenades too
                const gh = world.segmentHitsGate(_a.x, _a.y, _a.z, gr.pos.x, gr.pos.y, gr.pos.z);
                if (gh) {
                    gr.pos.copy(_a);
                    gr.vel.x *= -0.3; gr.vel.z *= -0.3;
                }
                // walls + ceiling (mothership)
                if (!gr.stuck && world.wallBounce) world.wallBounce(gr.pos, gr.vel, 0.13);
                const gy = world.groundAt(gr.pos.x, gr.pos.z);
                if (!gr.stuck && gr.pos.y < gy + 0.13) {
                    gr.pos.y = gy + 0.13;
                    const n = world.normalAt(gr.pos.x, gr.pos.z, _b);
                    const vn = gr.vel.dot(n);
                    if (vn < 0) gr.vel.addScaledVector(n, -vn * 1.4);
                    gr.vel.multiplyScalar(0.45);
                    if (gr.vel.length() < 1.2) gr.resting = true;
                    else {
                        g.audio.play('bounce', gr.pos);
                        fx.dust(gr.pos.x, gy, gr.pos.z, 2, 0.15, this.inShip() ? 0xb9a6e0 : 0xd99a74, 0.3);
                        fx.spray(gr.pos.x, gy + 0.05, gr.pos.z, 0, 1, 0, 0x8ff0ff, 3, 3, 0.08, 0.3);
                    }
                }
                const c = world.colliders.pointHit(gr.pos.x, gr.pos.y, gr.pos.z, 0.1);
                if (c && !gr.stuck) {
                    const dx = gr.pos.x - c.x, dz = gr.pos.z - c.z;
                    const d = Math.hypot(dx, dz) || 1;
                    if (gr.pos.y > c.top - 0.3) {
                        gr.pos.y = c.top + 0.13;
                        gr.vel.y = Math.abs(gr.vel.y) * 0.3;
                        gr.vel.x *= 0.5; gr.vel.z *= 0.5;
                    } else {
                        gr.pos.x = c.x + (dx / d) * (c.r + 0.15);
                        gr.pos.z = c.z + (dz / d) * (c.r + 0.15);
                        const vn = (gr.vel.x * dx + gr.vel.z * dz) / d;
                        if (vn < 0) { gr.vel.x -= 1.5 * vn * dx / d; gr.vel.z -= 1.5 * vn * dz / d; }
                    }
                }
                // a sparkly trail while it flies
                if (!gr.stuck && !gr.resting) {
                    gr.trailT -= dt;
                    if (gr.trailT <= 0) {
                        gr.trailT = 0.03;
                        const s = fx.emit(1, gr.pos.x, gr.pos.y, gr.pos.z, 0, 0.3, 0, 0.3, 0.22, 0.04, 0xbff8ff, 0x6fd8ff, 0.9, 0);
                        s.shape = FX.SPARKLE; s.solid = 0.3;
                    }
                }
            }
            gr.mesh.position.copy(gr.pos);
            gr.mesh.rotation.x += gr.spin.x * dt * (gr.resting || gr.stuck ? 0.2 : 1);
            gr.mesh.rotation.y += gr.spin.y * dt;
            const blink = gr.fuse < 0.6 ? 18 : 8;
            gr.mesh.scale.setScalar(1 + Math.max(0, Math.sin(gr.fuse * blink)) * 0.3);

            if (gr.fuse <= 0) {
                this.explode(gr.pos);
                this.grenades.splice(i, 1);
                this.freeGrenade(gr);
            }
        }

        // overheating: the blaster vents steam and heat sparkles from the muzzle
        if (P && P.vm && P.vm.muzzle) {
            if (P.overheated && !this.wasOverheated) {
                this.muzzleWorld(_p);
                for (let j = 0; j < 5; j++) {
                    const s = fx.emit(0, _p.x, _p.y, _p.z, rand(-0.6, 0.6), rand(0.8, 2), rand(-0.6, 0.6), rand(0.5, 0.7), 0.04, rand(0.12, 0.18),
                        0xffffff, 0xf2eeff, 0.8, 0.8);
                    s.pop = 0.25; s.drag = 3; s.grav = -1;
                }
                fx.bang(_p.x, _p.y, _p.z, 0xffb070, 0.22, 0.08, 7);
            }
            if (P.overheated && Math.random() < dt * 9) {
                this.muzzleWorld(_p);
                const s = fx.emit(1, _p.x + rand(-0.04, 0.04), _p.y, _p.z + rand(-0.04, 0.04), rand(-0.2, 0.2), rand(0.4, 0.9), rand(-0.2, 0.2),
                    rand(0.35, 0.55), rand(0.05, 0.08), 0.01, 0xffc27a, 0xff6a3a, 1, 0);
                s.shape = FX.SPARKLE; s.solid = 0.5; s.twinkle = 30;
            }
            if (!P.overheated && this.wasOverheated) {
                this.muzzleWorld(_p);
                fx.sparkle(_p.x, _p.y, _p.z, 0x9ff8ff, 0.16, 0.25, 0.5);
            }
            this.wasOverheated = P.overheated;
        }
    }

    inShip() {
        return this.game.stage?.key === 'ship' || this.game.world.constructor.name === 'Mothership';
    }

    // world.solidHit() on Mars reports where the bolt ended its step (up to 2 m past the ground);
    // find where it really crossed the ground so the impact shows up where you aimed (looks only)
    groundPoint(b, sh) {
        const W = this.game.world;
        let lo = 0, hi = 1;
        for (let k = 0; k < 8; k++) {
            const m = (lo + hi) * 0.5;
            _m.lerpVectors(b.prev, b.pos, m);
            if (_m.y < W.groundAt(_m.x, _m.z)) hi = m; else lo = m;
        }
        _m.lerpVectors(b.prev, b.pos, hi);
        sh.x = _m.x; sh.z = _m.z; sh.y = W.groundAt(_m.x, _m.z) + 0.05;
    }

    // Where the blaster's muzzle is in the world right now
    muzzleWorld(out) {
        const P = this.game.player;
        P.vm.muzzle.getWorldPosition(out);
        return P.vmToWorld(out);
    }

    explode(pos) {
        const g = this.game;
        const gy = g.world.groundAt(pos.x, pos.z);
        g.effects.explosion(pos.x, pos.y, pos.z, PLAYER.grenadeRadius, 0x6fd8ff, {
            debris: this.inShip() ? 0x5a4a86 : 0x8a4a3a, groundY: gy, scorch: pos.y - gy < 0.6,
        });
        g.audio.play('explosion', pos);
        const kills = g.aliens.damageRadius(pos, PLAYER.grenadeRadius, PLAYER.grenadeDamage);
        if (kills > 1) g.hud.toast(kills >= 3 ? 'TRIPLE POOF!' : 'DOUBLE POOF!', 1.8);
        if (kills > 0) this.hitStop();
        const d = g.player.pos.distanceTo(pos);
        if (d < 25) {
            const k = 1 - d / 25;
            this.kick(0.25 + 0.75 * k, 1 + 5 * k);
        }
    }

    // Camera feel, applied after the player has placed the camera this frame (it never changes where you aim:
    // the shake moves the camera a few centimeters and rolls it, the FOV kick only zooms)
    applyCamera() {
        const g = this.game;
        if (g.state !== 'play') return;
        const cam = g.camera;
        let changed = false;
        if (this.shake > 0.002) {
            const t = this.shakeTime, a = this.shake * this.shake;
            cam.translateX((Math.sin(t * 47) * 0.6 + Math.sin(t * 29 + 1.3) * 0.4) * a * 0.09);
            cam.translateY((Math.sin(t * 53 + 0.7) * 0.6 + Math.sin(t * 31 + 2.1) * 0.4) * a * 0.07);
            cam.rotation.z += Math.sin(t * 37 + 0.4) * a * 0.022;
            changed = true;
        }
        if (Math.abs(this.roll) > 1e-4) { cam.rotation.z += this.roll; changed = true; }
        if (Math.abs(this.fovKick) > 0.02) {
            cam.fov += this.fovKick;
            cam.updateProjectionMatrix();
        }
        if (changed) cam.updateMatrixWorld();
    }

    draw(glow, smoke) {
        const g = this.game;
        this.applyCamera();
        const cam = g.camera.position;
        for (const b of this.bolts) {
            const c = b.color;
            if (b.owner === 'player') {
                // a tracer from where the bolt was TRAIL seconds ago to where it is (both drawn sliding from the
                // muzzle onto the aim line during the first 0.1 s)
                const k = Math.max(0, 1 - b.age / 0.1);
                const hx = b.pos.x + b.vis.x * k, hy = b.pos.y + b.vis.y * k, hz = b.pos.z + b.vis.z * k;
                const tl = Math.min(b.age, TRAIL);
                const k2 = Math.max(0, 1 - (b.age - tl) / 0.1);
                const tx = b.pos.x - b.vel.x * tl + b.vis.x * k2;
                const ty = b.pos.y - b.vel.y * tl + b.vis.y * k2;
                const tz = b.pos.z - b.vel.z * tl + b.vis.z * k2;
                const ds = clamp(Math.hypot(hx - cam.x, hy - cam.y, hz - cam.z) / 14, 1, 3);
                glow.push(hx, hy, hz, hx - tx, hy - ty, hz - tz, 0.52 * ds, 0, c.r, c.g, c.b, 1, FX.BOLT, 1, 0, 0.8);
            } else {
                // a solid cartoon plasma ball with an ink rim and a white core, a soft halo and a short tail
                // (shrunk when it's right in front of you, so it never fills the screen)
                const x = b.pos.x, y = b.pos.y, z = b.pos.z;
                const near = Math.min(1, Math.hypot(x - cam.x, y - cam.y, z - cam.z) / 4);
                const pulse = (1 + Math.sin(b.age * 30) * 0.08) * near;
                const tl = Math.min(b.age, 0.07);
                glow.push(x, y, z, b.vel.x * tl, b.vel.y * tl, b.vel.z * tl, b.size * 1.3 * near, 0, c.r, c.g, c.b, 0.7, FX.ORB, 0, 0, 0.75);
                glow.push(x, y, z, 0, 0, 0, b.size * 2.5 * pulse, 0, c.r, c.g, c.b, 1, FX.BOLT, 1, 0, 0);
            }
        }
        // grenades: a blinking glow (cyan, then red-orange just before it goes off), kept small near the camera
        for (const gr of this.grenades) {
            const late = gr.fuse < 0.6;
            const k = late ? 0.5 + 0.5 * Math.sin(gr.fuse * 40) : 0.7;
            const d = Math.hypot(gr.pos.x - cam.x, gr.pos.y - cam.y, gr.pos.z - cam.z);
            const s = Math.min(1, d * 0.3);
            if (late && k > 0.5) _c.setRGB(1, 0.42, 0.25); else _c.setRGB(0.3, 0.85, 1);
            glow.push(gr.pos.x, gr.pos.y, gr.pos.z, 0, 0, 0, (0.9 + k * 0.5) * s, 0, _c.r, _c.g, _c.b, 0.5 + k * 0.5, FX.ORB, 0, 0, 0);
            glow.push(gr.pos.x, gr.pos.y, gr.pos.z, 0, 0, 0, (0.45 + k * 0.25) * s, gr.fuse * 3, 1, 1, 1, k, FX.SPARKLE, 0.4, 0, 0);
        }
        // muzzle flash: follows the gun for a few frames
        const P = g.player;
        if (this.muzzleT > 0 && P && P.vm && P.vm.muzzle && g.state === 'play') {
            const t = this.muzzleT / 0.065;
            this.muzzleWorld(_a);
            const big = this.muzzleN % 2 ? 1 : 0.85;
            glow.push(_a.x, _a.y, _a.z, 0, 0, 0, 0.22 * big * (0.6 + 0.4 * t), this.muzzleRot, 0.35, 0.92, 1, t, FX.SPARKLE, 0.6, 0, 0);
            glow.push(_a.x, _a.y, _a.z, 0, 0, 0, 0.2 * (0.7 + 0.3 * t), 0, 0.2, 0.75, 1, 0.5 * t, FX.ORB, 0, 0, 0);
        }
    }
}
