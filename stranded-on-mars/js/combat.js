// ============================================================
// COMBAT — plasma bolts (yours + the aliens') and sticky grenades
// ============================================================

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { rand, clamp } from './util.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();
const _p = new THREE.Vector3();

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
        this.tally = { alien: 0, ground: 0, prop: 0, shield: 0, expired: 0 };
        this.grenades = [];
        game.effects.addDrawer((glow, smoke) => this.draw(glow, smoke));
        this.grenadeGeo = new THREE.IcosahedronGeometry(0.13, 1);
        this.grenadeMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff });
        this.spikeGeo = new THREE.ConeGeometry(0.035, 0.12, 5);
    }

    clear() {
        for (const b of this.bolts) this.pool.push(b);
        this.bolts.length = 0;
        for (const g of this.grenades) this.game.scene.remove(g.mesh);
        this.grenades.length = 0;
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
        this.bolts.push(b);
        return b;
    }

    playerBolt(origin, dir, dmg = 1, visualOffset = null) {
        const b = this._bolt(origin, dir, PLAYER.boltSpeed, dmg, 'player', 0x56eaff, 0.34);
        if (visualOffset) b.vis.copy(visualOffset);
        return b;
    }

    alienBolt(origin, dir, speed, dmg, color, size) {
        const b = this._bolt(origin, dir, speed, dmg, 'alien', color, size);
        this.game.effects.glowFlash(origin.x, origin.y, origin.z, color, size * 3, 0.12);
        return b;
    }

    throwGrenade(origin, vel) {
        const mesh = new THREE.Group();
        const core = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
        mesh.add(core);
        for (let i = 0; i < 6; i++) {
            const s = new THREE.Mesh(this.spikeGeo, this.grenadeMat);
            const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][i];
            s.position.set(dirs[0] * 0.14, dirs[1] * 0.14, dirs[2] * 0.14);
            s.lookAt(dirs[0] * 2, dirs[1] * 2, dirs[2] * 2);
            s.rotateX(Math.PI / 2);
            mesh.add(s);
        }
        mesh.position.copy(origin);
        this.game.scene.add(mesh);
        this.grenades.push({
            mesh,
            pos: origin.clone(),
            vel: vel.clone(),
            fuse: 1.9,
            stuck: null,
            offset: new THREE.Vector3(),
            resting: false,
            spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        });
    }

    impact(x, y, z, color, kind = 'ground') {
        const fx = this.game.effects;
        fx.sparks(x, y, z, color, kind === 'alien' ? 9 : 6, 5, 0.12);
        fx.glowFlash(x, y, z, color, 1.2, 0.1);
        if (kind === 'ground') fx.dust(x, y - 0.1, z, 2, 0.2, 0xd99a74, 0.35);
    }

    update(dt) {
        const g = this.game;
        const world = g.world;
        const terrain = world.terrain;
        const P = g.player;
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
                this.impact(gh.x, gh.y, gh.z, 0xd77aff, 'shield');
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
                    this.impact(hx, hy, hz, 0xd77aff, 'shield');
                    hit = true;
                }
            }
            // targets
            if (!hit) {
                if (b.owner === 'player') {
                    const res = g.aliens.segmentHit(b.prev, b.pos, 0.3);
                    if (res) {
                        _p.lerpVectors(b.prev, b.pos, res.t);
                        const head = res.alien.isHeadshot(_p);
                        const killed = res.alien.hurt(b.dmg * (head ? 2 : 1), _p, head);
                        this.impact(_p.x, _p.y, _p.z, head ? 0xffd166 : 0x9ff6ff, 'alien');
                        g.hud.hitMarker(killed);
                        hit = true;
                        this.tally.alien++;
                    }
                } else if (!P.dead) {
                    if (P.hitBySegment(b.prev, b.pos, b.size * 0.4)) {
                        P.hurt(b.dmg, b.vel);
                        g.effects.sparks(hx, hy, hz, b.color.getHex(), 8, 4, 0.14);
                        hit = true;
                    }
                }
            }
            // ground
            if (!hit) {
                const gy = terrain.heightAt(hx, hz);
                if (hy < gy) {
                    this.impact(hx, gy + 0.05, hz, b.owner === 'player' ? 0x9ff6ff : b.color.getHex());
                    if (b.owner === 'player') { g.audio.play('boltHit', _p.set(hx, gy, hz)); this.tally.ground++; }
                    hit = true;
                }
            }
            // rocks and props
            if (!hit) {
                const c = world.colliders.pointHit(hx, hy, hz, 0.05);
                if (c) {
                    this.impact(hx, hy, hz, b.owner === 'player' ? 0x9ff6ff : b.color.getHex());
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
            if (b.owner === 'alien' && Math.random() < dt * 30) {
                g.effects.spawn({
                    x: hx, y: hy, z: hz, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(-0.3, 0.3),
                    life: 0.35, size: b.size * 0.5, size1: 0.05, color: b.color.getHex(), alpha: 0.8, alpha1: 0, batch: 1,
                });
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
                    gr.offset.set(0, 1.25 * res.alien.T.scale, 0);
                    gr.vel.set(0, 0, 0);
                    gr.fuse = Math.max(gr.fuse, 1.1);
                    g.audio.play('stick', gr.pos);
                    g.hud.toast('STUCK! 💥', 1.2);
                    res.alien.alertTo(0);
                }
                // force fields stop grenades too
                const gh = world.segmentHitsGate(_a.x, _a.y, _a.z, gr.pos.x, gr.pos.y, gr.pos.z);
                if (gh) {
                    gr.pos.copy(_a);
                    gr.vel.x *= -0.3; gr.vel.z *= -0.3;
                }
                const gy = terrain.heightAt(gr.pos.x, gr.pos.z);
                if (!gr.stuck && gr.pos.y < gy + 0.13) {
                    gr.pos.y = gy + 0.13;
                    const n = terrain.normalAt(gr.pos.x, gr.pos.z, _b);
                    const vn = gr.vel.dot(n);
                    if (vn < 0) gr.vel.addScaledVector(n, -vn * 1.4);
                    gr.vel.multiplyScalar(0.45);
                    if (gr.vel.length() < 1.2) gr.resting = true;
                    else g.audio.play('bounce', gr.pos);
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
            }
            gr.mesh.position.copy(gr.pos);
            gr.mesh.rotation.x += gr.spin.x * dt * (gr.resting || gr.stuck ? 0.2 : 1);
            gr.mesh.rotation.y += gr.spin.y * dt;
            const blink = gr.fuse < 0.6 ? 18 : 8;
            gr.mesh.scale.setScalar(1 + Math.max(0, Math.sin(gr.fuse * blink)) * 0.3);

            if (gr.fuse <= 0) {
                this.explode(gr.pos);
                g.scene.remove(gr.mesh);
                this.grenades.splice(i, 1);
            }
        }
    }

    explode(pos) {
        const g = this.game;
        g.effects.explosion(pos.x, pos.y, pos.z, PLAYER.grenadeRadius, 0x6fd8ff);
        g.audio.play('explosion', pos);
        const kills = g.aliens.damageRadius(pos, PLAYER.grenadeRadius, PLAYER.grenadeDamage);
        if (kills > 1) g.hud.toast(kills >= 3 ? 'TRIPLE POOF!' : 'DOUBLE POOF!', 1.8);
        const d = g.player.pos.distanceTo(pos);
        if (d < 25) g.player.shake(Math.max(0, 0.6 * (1 - d / 25)));
    }

    draw(glow, smoke) {
        for (const b of this.bolts) {
            const c = b.color;
            if (b.owner === 'player') {
                const st = 0.011;
                const k = Math.max(0, 1 - b.age / 0.1);
                const x = b.pos.x + b.vis.x * k, y = b.pos.y + b.vis.y * k, z = b.pos.z + b.vis.z * k;
                glow.push(x, y, z, b.vel.x * st, b.vel.y * st, b.vel.z * st, b.size, 0, c.r, c.g, c.b, 1);
                glow.push(x, y, z, b.vel.x * st * 0.6, b.vel.y * st * 0.6, b.vel.z * st * 0.6, b.size * 0.45, 0, 1, 1, 1, 1);
            } else {
                // solid cartoon plasma ball + soft halo (reads well against orange ground)
                const pulse = 1 + Math.sin(b.age * 30) * 0.12;
                smoke.push(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, b.size * 1.05 * pulse, 0, c.r, c.g, c.b, 1);
                glow.push(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, b.size * 2.4 * pulse, 0, c.r, c.g, c.b, 0.55);
                glow.push(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, b.size * 0.5, 0, 1, 1, 1, 0.9);
            }
        }
        for (const gr of this.grenades) {
            const k = gr.fuse < 0.6 ? 0.5 + 0.5 * Math.sin(gr.fuse * 40) : 0.7;
            glow.push(gr.pos.x, gr.pos.y, gr.pos.z, 0, 0, 0, 1.1 + k * 0.6, 0, 0.3, 0.85, 1, k);
        }
    }
}
