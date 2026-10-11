// ============================================================
// MISSIONS — the Mars quests around the ship parts:
//  - the Crystal Forest camp raid (the fuel tank is locked in a cage;
//    get close and the alarm calls more aliens out of the tents)
//  - the ship's rover, flipped over at the edge of the camp
//  - the thruster frozen under the ice lake (crack it with grenades)
//  - supply crates (a stash behind Red Rock Canyon's arch, grenades by the lake)
// The level (level.js) owns these and asks them for prompts and objectives.
// ============================================================

import * as THREE from 'three';
import { CAMP, PART_SPOTS, ICE_SLAB, ICE_LAKE, CRATES, ROVER_SPOT, ZONE, CHECKPOINTS } from './layout.js';
import { PLAYER } from './config.js';
import { GeoBuilder, vcMat, toonMaterial, addOutline, glowSprite } from './toon.js';
import { shieldMaterial } from './world.js';
import { buildPartModel } from './ship.js';
import { makeBeam } from './effects.js';
import { makeRng, rand, clamp, smoothstep, easeOut, lerp } from './util.js';

const _v = new THREE.Vector3();

// ------------------------------------------------------------
// The camp raid: a force-bubble cage around the fuel tank
// ------------------------------------------------------------
export class CampRaid {
    constructor(missions) {
        this.m = missions;
        this.game = missions.game;
        this.triggered = false;
        this.done = false;
        this.alarmT = 0;
        this.dropT = -1;
        const g = this.game;
        const s = PART_SPOTS.fuelTank;
        const y = g.world.groundAt(s.x, s.z);
        this.pos = new THREE.Vector3(s.x, y, s.z);
        // base ring with six glowing bars
        const b = new GeoBuilder();
        b.add(new THREE.CylinderGeometry(2.5, 2.7, 0.35, 6), 0x5c2f8a, { p: [0, 0.17, 0] });
        b.add(new THREE.CylinderGeometry(2.56, 2.56, 0.1, 6), 0xf2c14e, { p: [0, 0.38, 0] });
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const x = Math.cos(a) * 2.3, z = Math.sin(a) * 2.3;
            b.add(new THREE.CylinderGeometry(0.11, 0.15, 2.6, 6), 0x4a2a6a, { p: [x, 1.6, z] });
            b.add(new THREE.OctahedronGeometry(0.22, 0), 0xff7cf0, { p: [x, 3.05, z], s: [1, 1.5, 1] }, 1.4, true);
        }
        this.base = new THREE.Mesh(b.build(), vcMat());
        this.base.position.copy(this.pos);
        addOutline(this.base, 0x2a1424, 0.003);
        this.base.castShadow = true;
        g.scene.add(this.base);
        g.world.colliders.add(s.x, s.z, 0.6, y + 0.45); // (the bars don't block, the bubble does: see below)
        // the force bubble
        this.bubbleMat = shieldMaterial(0xb04dff, 9, 5);
        this.bubble = new THREE.Mesh(new THREE.SphereGeometry(2.45, 28, 16), this.bubbleMat);
        this.bubble.position.set(s.x, y + 1.25, s.z);
        this.bubble.renderOrder = 13;
        g.scene.add(this.bubble);
        this.blocker = g.world.colliders.add(s.x, s.z, 2.5, y + 3.6, -1000, 'cage');
        this.glow = glowSprite(0xd77aff, 7, 0.45);
        this.glow.position.set(s.x, y + 1.4, s.z);
        g.scene.add(this.glow);
        // red alarm lights over the tents (hidden until the alarm goes off)
        this.alarmLights = [];
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.5;
            const x = CAMP.x + Math.cos(a) * 12, z = CAMP.z + Math.sin(a) * 12;
            const l = glowSprite(0xff3b3b, 4, 0.9);
            l.position.set(x, g.world.groundAt(x, z) + 4.6, z);
            l.visible = false;
            g.scene.add(l);
            this.alarmLights.push(l);
        }
    }

    raidAliens() {
        return this.game.aliens.byZone[ZONE.crystal].filter((a) => a.wave === 1);
    }

    // Awake aliens in the camp (before the alarm, the tent aliens are still asleep)
    awake() {
        let n = 0;
        for (const a of this.game.aliens.byZone[ZONE.crystal]) if (!a.dead && !a.dormant) n++;
        return n;
    }

    trigger() {
        const g = this.game;
        if (this.triggered || this.done) return;
        this.triggered = true;
        this.alarmT = 3.2;
        g.audio.play('waveAlarm');
        g.audio.play('alienAlert', this.pos);
        g.audio.alarm(true);
        g.hud.announce('ALARM!', 'ALIENS IN THE TENTS!');
        g.hud.toast('Uh oh, the aliens heard you! Beat them ALL to open the cage!', 4);
        // out of the tents they come (staggered a little)
        this.raidAliens().forEach((a, i) => {
            if (a.dead || !a.dormant) return;
            a.rushDelay = 0.35 + i * 0.4;
        });
        // everyone else in the camp wakes up too
        for (const a of g.aliens.byZone[ZONE.crystal]) if (!a.dead && !a.dormant && a.state === 'idle') a.alertTo(rand(0.1, 0.6));
    }

    rushOut(a) {
        const g = this.game;
        a.spawned = true;
        a.dormant = false;
        a.root.visible = g.aliens.activeZones.has(a.zone);
        a.lastSeen.copy(g.player.pos);
        a.vy = 4.5;
        a.alertTo(0);
        g.effects.dust(a.pos.x, a.pos.y, a.pos.z, 8, 0.8);
        g.effects.stars(a.pos.x, a.pos.y + 2.2, a.pos.z, 4, 0xff7cf0, 0.25, 2);
        g.audio.play('alienAlert', a.pos);
    }

    // The camp is clear: drop the cage
    drop(instant = false) {
        if (this.done) return;
        this.done = true;
        this.triggered = true;
        this.blocker.active = false;
        const fuel = this.m.level.partPickups.fuelTank;
        if (fuel) fuel.locked = false;
        if (instant) {
            this.bubble.visible = false;
            this.glow.visible = false;
            return;
        }
        const g = this.game;
        this.dropT = 0;
        g.audio.play('shieldBreak', this.pos);
        g.audio.play('gateDown', this.pos);
        g.effects.sparks(this.pos.x, this.pos.y + 1.5, this.pos.z, 0xd77aff, 30, 8, 0.2);
        g.effects.glowFlash(this.pos.x, this.pos.y + 1.4, this.pos.z, 0xffffff, 5, 0.3);
    }

    // Died during the raid: the tent aliens go back inside, and the alarm can go off again
    onRespawn() {
        if (!this.triggered || this.done) return;
        this.triggered = false;
        for (const a of this.raidAliens()) {
            if (!a.dead) { a.spawned = false; a.rushDelay = 0; }
        }
        this.game.audio.alarm(false);
        this.alarmT = 0;
        for (const l of this.alarmLights) l.visible = false;
    }

    update(dt) {
        const g = this.game;
        const P = g.player;
        if (!this.triggered && !this.done && !P.dead) {
            const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
            if (d < 22) this.trigger();
        }
        if (this.triggered && !this.done) {
            for (const a of this.raidAliens()) {
                if (a.rushDelay > 0) {
                    a.rushDelay -= dt;
                    if (a.rushDelay <= 0 && a.dormant && !a.dead) this.rushOut(a);
                }
            }
        }
        if (!this.done && g.aliens.aliveInZone(ZONE.crystal) === 0) this.drop();
        if (this.alarmT > 0) {
            this.alarmT -= dt;
            const on = Math.sin(g.time * 14) > 0;
            for (const l of this.alarmLights) {
                l.visible = this.alarmT > 0;
                l.material.opacity = on ? 0.95 : 0.25;
            }
            if (this.alarmT <= 0) g.audio.alarm(false);
        }
        // the bubble flickers out
        if (this.dropT >= 0 && this.dropT < 2) {
            this.dropT += dt;
            const k = this.dropT;
            this.bubbleMat.uniforms.uOn.value = k < 1 ? (Math.random() < 0.5 ? 1.4 : 0.2) * (1 - k) : 0;
            this.bubbleMat.uniforms.uFlash.value = Math.max(0, 1 - k * 2.5);
            this.bubble.scale.setScalar(1 + k * 0.35);
            this.glow.material.opacity = Math.max(0, 0.45 * (1 - k));
            if (k >= 1) { this.bubble.visible = false; this.glow.visible = false; this.dropT = 2; }
        } else if (!this.done) {
            this.glow.material.opacity = 0.38 + Math.sin(g.time * 3) * 0.08;
        }
    }
}

// ------------------------------------------------------------
// The thruster frozen under the ice
// ------------------------------------------------------------
function crackTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { c, ctx: c.getContext('2d'), tex };
}

export class IceSlab {
    constructor(missions) {
        this.m = missions;
        this.game = missions.game;
        this.hits = 0;
        this.broken = false;
        this.hintT = 0;
        this.popT = -1;
        this.lastHit = -9;
        const g = this.game;
        const S = ICE_SLAB, L = ICE_LAKE;
        this.top = L.level + 0.45; // the slab sticks up out of the lake a little, so you can spot it
        // the hole's ice well: blue walls fading darker toward the bottom
        const wb = new GeoBuilder();
        const wellY = L.level + 0.02;
        wb.add(new THREE.CylinderGeometry(S.r + 0.05, S.r - 0.25, S.depth, 40, 3, true), [0x9fd6f2, (pp, i, c) => {
            const k = clamp((wellY - pp.getY(i)) / S.depth, 0, 1);
            c.setHex(0x9fd6f2).lerp(new THREE.Color(0x24507a), k);
        }], { p: [S.x, wellY - S.depth / 2, S.z] });
        wb.add(new THREE.CircleGeometry(S.r - 0.2, 32), 0x1f4670, { p: [S.x, wellY - S.depth + 0.02, S.z], r: [-Math.PI / 2, 0, 0] });
        this.well = new THREE.Mesh(wb.build(), toonMaterial({ vertexColors: true, side: THREE.BackSide, rim: 0.3, cache: false }));
        this.well.material.side = THREE.DoubleSide;
        g.scene.add(this.well);
        // the thruster, frozen in the well under the slab, tilted like it sank
        this.frozen = buildPartModel('thruster', 0.85);
        this.frozen.position.set(S.x + 0.3, L.level - 1.25, S.z - 0.2);
        this.frozen.rotation.set(0.5, 0.8, -0.3);
        g.scene.add(this.frozen);
        this.frozenGlow = glowSprite(0xffd28a, 4, 0.6);
        this.frozenGlow.position.set(S.x + 0.3, L.level - 0.9, S.z - 0.2);
        g.scene.add(this.frozenGlow);
        this.beam = makeBeam(0xffc45e, 70, 0.8);
        this.beam.position.set(S.x, L.level, S.z);
        g.scene.add(this.beam);
        // the slab: a see-through disc of ice with a frosty rim
        const slabMat = toonMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.55, rim: 0.8, rimColor: 0xffffff, cache: false });
        slabMat.depthWrite = false;
        this.slab = new THREE.Mesh(new THREE.CylinderGeometry(S.r + 0.25, S.r + 0.45, 0.75, 40), slabMat);
        this.slab.position.set(S.x, this.top - 0.375, S.z);
        this.slab.renderOrder = 2;
        g.scene.add(this.slab);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(S.r + 0.25, 0.14, 6, 40), toonMaterial({ color: 0xf2fbff, rim: 0.5 }));
        rim.rotation.x = Math.PI / 2;
        rim.position.set(S.x, this.top - 0.02, S.z);
        g.scene.add(rim);
        this.rim = rim;
        // cracks are drawn onto this disc after each blast
        this.cr = crackTexture();
        this.cracks = new THREE.Mesh(new THREE.CircleGeometry(S.r + 0.25, 40),
            new THREE.MeshBasicMaterial({ map: this.cr.tex, transparent: true, depthWrite: false }));
        this.cracks.rotation.x = -Math.PI / 2;
        this.cracks.position.set(S.x, this.top + 0.015, S.z);
        this.cracks.renderOrder = 3;
        g.scene.add(this.cracks);
        this.drawCracks();
        // slushy water once it's broken
        this.water = new THREE.Mesh(new THREE.CircleGeometry(S.r + 0.1, 40), toonMaterial({ color: 0x2f74a8, rim: 0.4, rimColor: 0xbfeaff, cache: false }));
        this.water.rotation.x = -Math.PI / 2;
        this.water.position.set(S.x, L.level - 0.35, S.z);
        this.water.visible = false;
        g.scene.add(this.water);
        // (you stand on the slab through world.groundAt, which knows where it is)
        g.world.slabTop = this.top;
        // flying ice chunks for the shatter
        const shardGeo = new THREE.OctahedronGeometry(0.32, 0);
        const shardMat = toonMaterial({ color: 0xd8f4ff, rim: 0.8, rimColor: 0xffffff, flat: true });
        this.shards = [];
        for (let i = 0; i < 14; i++) {
            const m = new THREE.Mesh(shardGeo, shardMat);
            m.visible = false;
            g.scene.add(m);
            this.shards.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0 });
        }
    }

    drawCracks() {
        const { ctx, c, tex } = this.cr;
        const W = c.width, R = W / 2;
        ctx.clearRect(0, 0, W, W);
        // frost speckles
        const r0 = makeRng(5);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = 0; i < 40; i++) {
            const a = r0() * Math.PI * 2, d = Math.sqrt(r0()) * R * 0.9;
            ctx.beginPath();
            ctx.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, r0.range(2, 6), 0, Math.PI * 2);
            ctx.fill();
        }
        // each hit adds a star of cracks from somewhere near the middle
        for (let h = 0; h < this.hits; h++) {
            const r = makeRng(31 + h * 17);
            const cx = R + r.range(-40, 40), cy = R + r.range(-40, 40);
            const n = 7 + h * 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let k = 0; k < n; k++) {
                let a = (k / n) * Math.PI * 2 + r.range(-0.3, 0.3);
                const pts = [[cx, cy]];
                let x = cx, y = cy;
                const len = r.range(60, 120) + h * 25;
                for (let s = 0; s < 5; s++) {
                    a += r.range(-0.45, 0.45);
                    x += Math.cos(a) * len / 5;
                    y += Math.sin(a) * len / 5;
                    pts.push([x, y]);
                }
                // a dark crack with a bright edge beside it
                for (const [col, w, o] of [['rgba(255,255,255,0.9)', 7 - h, 1.5], ['rgba(22,64,110,0.95)', 4.5 - h * 0.6, 0]]) {
                    ctx.strokeStyle = col;
                    ctx.lineWidth = w;
                    ctx.beginPath();
                    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + o, py + o) : ctx.moveTo(px + o, py + o)));
                    ctx.stroke();
                }
            }
            // a dark bruise at the impact
            const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30 + h * 10);
            grd.addColorStop(0, 'rgba(60,120,170,0.55)');
            grd.addColorStop(1, 'rgba(60,120,170,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, W, W);
        }
        // keep everything inside the disc
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(R, R, R - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        tex.needsUpdate = true;
    }

    // A grenade went off somewhere
    hit(pos, radius) {
        if (this.broken) return false;
        const S = ICE_SLAB;
        const d = Math.hypot(pos.x - S.x, pos.z - S.z);
        if (d > S.r + radius * 0.75 || pos.y > this.top + 4) return false;
        const g = this.game;
        if (g.time - this.lastHit < 0.12) return false; // two grenades at once still count as one blast... mostly
        this.lastHit = g.time;
        this.hits++;
        g.effects.spray(S.x, this.top + 0.1, S.z, 0, 1, 0, 0xd8f4ff, 16, 9, 0.22, 0.6);
        g.audio.play('shieldHit', _v.set(S.x, this.top, S.z));
        if (this.hits >= S.hits) {
            this.shatter();
        } else {
            this.drawCracks();
            const left = S.hits - this.hits;
            g.hud.toast(left === 1 ? 'CRACK! One more blast!' : `CRACK! The ice is breaking! (${left} more)`, 2.2);
        }
        return true;
    }

    shatter(instant = false) {
        if (this.broken) return;
        this.broken = true;
        this.hits = Math.max(this.hits, ICE_SLAB.hits);
        const g = this.game;
        const S = ICE_SLAB;
        this.slab.visible = false;
        this.cracks.visible = false;
        this.water.visible = true;
        g.world.slabTop = ICE_LAKE.level - 0.35;
        this.beam.visible = false;
        this.rim.position.y = ICE_LAKE.level + 0.04;
        if (instant) {
            this.frozen.visible = false;
            this.frozenGlow.visible = false;
            return;
        }
        g.audio.play('shieldBreak', _v.set(S.x, this.top, S.z));
        g.effects.sparks(S.x, this.top + 0.5, S.z, 0xd8f4ff, 34, 9, 0.2);
        g.effects.glowFlash(S.x, this.top + 0.5, S.z, 0xffffff, 6, 0.3);
        for (const sh of this.shards) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * S.r * 0.8;
            sh.m.position.set(S.x + Math.cos(a) * r, this.top, S.z + Math.sin(a) * r);
            sh.v.set(Math.cos(a) * rand(2, 6), rand(5, 10), Math.sin(a) * rand(2, 6));
            sh.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
            sh.m.scale.setScalar(rand(0.6, 1.4));
            sh.t = 0;
            sh.m.visible = true;
        }
        // the thruster pops up out of the hole and lands on the ice next to it, toward the player
        const P = g.player;
        let dx = P.pos.x - S.x, dz = P.pos.z - S.z;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        // on the far side of the hole from you, a little to the left (so you see it fly over)
        const ex = -dx * 0.87 - dz * 0.5, ez = -dz * 0.87 + dx * 0.5;
        this.popFrom = this.frozen.position.clone();
        this.popTo = new THREE.Vector3(S.x + ex * (S.r + 2.8), ICE_LAKE.level + 1.3, S.z + ez * (S.r + 2.8));
        this.popT = 0;
        this.frozenGlow.visible = false;
        g.hud.announce('THE ICE BROKE!', 'THRUSTER');
    }

    update(dt) {
        const g = this.game;
        const P = g.player;
        const S = ICE_SLAB;
        // ice chunks fly and fall
        for (const sh of this.shards) {
            if (!sh.m.visible) continue;
            sh.t += dt;
            sh.v.y -= PLAYER.gravity * dt;
            sh.m.position.addScaledVector(sh.v, dt);
            sh.m.rotation.x += sh.spin.x * dt;
            sh.m.rotation.y += sh.spin.y * dt;
            const gy = g.world.groundAt(sh.m.position.x, sh.m.position.z);
            if (sh.m.position.y < gy + 0.1 && sh.v.y < 0) {
                sh.m.position.y = gy + 0.1;
                sh.v.multiplyScalar(0.3);
                sh.v.y = Math.abs(sh.v.y) * 0.4;
            }
            if (sh.t > 1.6) sh.m.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
            if (sh.t > 2.4) sh.m.visible = false;
        }
        // the thruster pops out
        if (this.popT >= 0) {
            this.popT += dt;
            const k = clamp(this.popT / 0.9, 0, 1);
            this.frozen.position.lerpVectors(this.popFrom, this.popTo, easeOut(k));
            this.frozen.position.y += Math.sin(k * Math.PI) * 3.5;
            this.frozen.rotation.x = lerp(0.5, 0, k);
            this.frozen.rotation.z = lerp(-0.3, 0, k);
            this.frozen.rotation.y += dt * 8;
            if (k >= 1) {
                this.popT = -1;
                this.frozen.visible = false;
                const p = this.m.level.spawnPart('thruster', this.popTo.x, this.popTo.z, ICE_LAKE.level);
                p.pop = 1;
                g.effects.sparks(this.popTo.x, this.popTo.y, this.popTo.z, 0xffd166, 20, 6, 0.18);
                g.audio.play('sparkle');
            }
        }
        if (!this.broken) {
            this.frozenGlow.material.opacity = 0.5 + Math.sin(g.time * 2.4) * 0.12;
            this.beam.material.uniforms.uTime.value = g.time;
            const bd = Math.hypot(P.pos.x - S.x, P.pos.z - S.z);
            this.beam.material.uniforms.uFade.value = clamp((bd - 5) / 18, 0, 1);
            // standing on it? tell them how to get it out
            const d = Math.hypot(P.pos.x - S.x, P.pos.z - S.z);
            this.hintT -= dt;
            if (d < S.r + 2 && this.hintT <= 0 && !P.dead) {
                this.hintT = 9;
                if (P.grenades > 0) g.hud.toast(this.hits ? 'Cracks! Keep throwing grenades at it!' : 'Your THRUSTER is frozen in the ice! Crack it with a GRENADE (right-click or G)!', 4.5);
                else g.hud.toast('No grenades? Get some from the supply crate by the lake!', 4.5);
            }
        }
    }
}

// ------------------------------------------------------------
// Supply crates
// ------------------------------------------------------------
export class SupplyCrate {
    constructor(missions, def, index) {
        this.m = missions;
        this.game = missions.game;
        this.def = def;
        this.index = index;
        this.opened = false;
        this.lidK = 0;
        this.lidTarget = 0;
        this.cool = 0;
        const g = this.game;
        const y = g.world.groundAt(def.x, def.z);
        this.pos = new THREE.Vector3(def.x, y, def.z);
        const root = new THREE.Group();
        root.position.copy(this.pos);
        root.rotation.y = def.yaw || 0;
        const b = new GeoBuilder();
        b.add(new THREE.BoxGeometry(1.7, 0.95, 1.1), 0x5c2f8a, { p: [0, 0.5, 0] });
        b.add(new THREE.BoxGeometry(1.76, 0.12, 1.16), 0xf2c14e, { p: [0, 0.08, 0] });
        b.add(new THREE.BoxGeometry(1.76, 0.1, 1.16), 0xf2c14e, { p: [0, 0.92, 0] });
        for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.12, 0.9, 1.16), 0xf2c14e, { p: [s * 0.82, 0.5, 0] });
        // a glowing symbol: a heart (stash) or a grenade orb (refill)
        const col = def.kind === 'reward' ? 0xff4d5e : 0x6ff0ff;
        b.add(new THREE.SphereGeometry(0.17, 10, 8), col, { p: [0, 0.55, 0.57], s: [1, 1, 0.4] }, 1.4);
        b.add(new THREE.BoxGeometry(1.2, 0.08, 0.06), 0x6ff0ff, { p: [0, 0.3, 0.56] }, 1.2);
        const body = new THREE.Mesh(b.build(), vcMat());
        body.castShadow = true;
        addOutline(body, 0x2a1424, 0.003);
        root.add(body);
        const lb = new GeoBuilder();
        lb.add(new THREE.BoxGeometry(1.8, 0.26, 1.2), 0x6a3a9a, { p: [0, 0.13, -0.6] });
        lb.add(new THREE.BoxGeometry(1.82, 0.08, 1.22), 0xf2c14e, { p: [0, 0.27, -0.6] });
        lb.add(new THREE.OctahedronGeometry(0.16, 0), 0xff7cf0, { p: [0, 0.42, -0.6], s: [1, 1.4, 1] }, 1.4, true);
        this.lid = new THREE.Mesh(lb.build(), vcMat());
        addOutline(this.lid, 0x2a1424, 0.003);
        this.lid.position.set(0, 0.98, 0.6); // hinged at the back edge
        root.add(this.lid);
        this.glow = glowSprite(col, 2.4, 0.5);
        this.glow.position.set(0, 1.3, 0);
        root.add(this.glow);
        g.scene.add(root);
        this.root = root;
        g.world.colliders.add(def.x, def.z, 0.95, y + 1.1, -1000, 'crate');
    }

    // The E prompt when you're close (or null)
    prompt(P) {
        const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        if (d > 2.8) return null;
        if (this.def.kind === 'reward') {
            if (this.opened) return null;
            return { key: 'E', text: 'Open the supply crate', act: () => this.open(), d };
        }
        if (P.grenades >= PLAYER.maxGrenades) return { key: '', text: 'Grenade crate (you have all the grenades you can carry)', act: null, d };
        return { key: 'E', text: 'Grab grenades', act: () => this.open(), d };
    }

    open() {
        const g = this.game;
        const P = g.player;
        if (this.cool > 0) return;
        this.cool = 1.2;
        this.lidTarget = 1;
        g.audio.play('clunk', this.pos);
        g.audio.play('sparkle');
        const top = _v.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
        g.effects.stars(top.x, top.y, top.z, 6, 0xffd23a, 0.28, 2.5);
        if (this.def.kind === 'reward') {
            this.opened = true;
            // pop out a little stash
            const fwd = new THREE.Vector3(-Math.sin(this.def.yaw || 0), 0, -Math.cos(this.def.yaw || 0));
            for (const kind of ['heart', 'heart', 'grenade', 'grenade']) {
                const p = top.clone().addScaledVector(fwd, -1.2);
                this.m.level.spawnDrop(kind, p);
            }
            g.hud.toast('A secret stash! Hearts and grenades!', 3);
            this.m.level.save();
        } else {
            const before = P.grenades;
            P.grenades = PLAYER.maxGrenades;
            g.audio.play('pickup');
            g.hud.toast(`+${P.grenades - before} Sticky Grenades!`, 2);
        }
    }

    update(dt) {
        this.cool -= dt;
        if (this.def.kind !== 'reward' && this.lidTarget === 1 && this.cool < -0.4) this.lidTarget = 0; // the refill crate closes again
        this.lidK += (this.lidTarget - this.lidK) * Math.min(1, dt * 8);
        this.lid.rotation.x = -this.lidK * 1.9;
        this.glow.material.opacity = this.opened ? 0.15 : 0.4 + Math.sin(this.game.time * 3 + this.index) * 0.12;
    }
}

// ------------------------------------------------------------
// All of the above, plus the rover hooks
// ------------------------------------------------------------
export class Missions {
    constructor(level) {
        this.level = level;
        this.game = level.game;
        this.roverFound = false;
        this.roverHintT = -1;
        this.roverRode = false;
        this.raid = new CampRaid(this);
        this.ice = new IceSlab(this);
        this.crates = CRATES.map((c, i) => new SupplyCrate(this, c, i));
    }

    // ---------- the rover (js/rover.js; game.rover only exists on Mars) ----------
    get rover() {
        return this.game.rover || null;
    }

    // Put the rover where it belongs at the start (flipped over at the camp, or upright by you once found)
    placeRover(cp) {
        const R = this.rover;
        if (R) {
            R.onFirstFlip = () => this.onRoverFound();
            if (this.roverFound) {
                const c = CHECKPOINTS[cp] || CHECKPOINTS[0];
                const sx = Math.cos(c.yaw) * 5, sz = -Math.sin(c.yaw) * 5; // 5 m to the right of the checkpoint
                R.place(c.x + sx, c.z + sz, c.yaw);
            } else {
                R.place(ROVER_SPOT.x, ROVER_SPOT.z, ROVER_SPOT.yaw, { flipped: true });
            }
        } else {
            this.placeholder(!this.roverFound);
        }
    }

    // Until js/rover.js is merged there is no rover: show a stand-in where it lies (never when game.rover exists)
    placeholder(show) {
        if (this.rover) show = false;
        if (show && !this.stub) {
            const b = new GeoBuilder();
            b.add(new THREE.BoxGeometry(2.2, 0.8, 3.4), 0xf6f2ea, { p: [0, 0.7, 0] });
            b.add(new THREE.BoxGeometry(2.24, 0.2, 3.44), 0xff7a2e, { p: [0, 0.9, 0] });
            for (const [x, z] of [[-1.25, -1.2], [1.25, -1.2], [-1.25, 1.2], [1.25, 1.2]]) {
                b.add(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12), 0x30353d, { p: [x, 1.5, z], r: [0, 0, Math.PI / 2] });
            }
            const m = new THREE.Mesh(b.build(), vcMat());
            const y = this.game.world.groundAt(ROVER_SPOT.x, ROVER_SPOT.z);
            m.position.set(ROVER_SPOT.x, y + 0.1, ROVER_SPOT.z);
            m.rotation.set(0, ROVER_SPOT.yaw, 0.12);
            addOutline(m, 0x2a1424, 0.003);
            this.game.scene.add(m);
            this.stub = m;
        }
        if (this.stub) this.stub.visible = show;
    }

    roverPos() {
        const R = this.rover;
        return R && R.pos ? R.pos : ROVER_SPOT;
    }

    onRoverFound() {
        if (this.roverFound) return;
        const g = this.game;
        this.roverFound = true;
        g.audio.play('fanfare');
        g.hud.zoneBanner('YOU FOUND THE ROVER!', 'LINCOLN-1 ROVER');
        g.hud.toast('Press E to hop in!', 3);
        this.level.save();
    }

    onRoverEnter() {
        const g = this.game;
        if (!this.roverFound) this.onRoverFound();
        if (this.roverRode) return;
        this.roverRode = true;
        g.hud.toast('W to drive, mouse to steer, SPACE to slide, CLICK to fire the turret!', 5);
    }

    // ---------- per frame ----------
    update(dt) {
        const g = this.game;
        this.raid.update(dt);
        this.ice.update(dt);
        for (const c of this.crates) c.update(dt);
        // after the camp is cleared, point out the rover
        if (this.raid.done && !this.roverFound && this.rover && this.roverHintT < 0) this.roverHintT = 3;
        if (this.roverHintT > 0) {
            this.roverHintT -= dt;
            if (this.roverHintT <= 0) {
                this.roverHintT = 0;
                if (!this.roverFound) g.hud.toast("Hey, that's your ship's ROVER! Hold E to flip it over!", 5);
            }
        }
    }

    // E prompts from the crates
    prompt(P) {
        let best = null;
        for (const c of this.crates) {
            const p = c.prompt(P);
            if (p && (!best || p.d < best.d)) best = p;
        }
        return best;
    }

    onRespawn() {
        this.raid.onRespawn();
    }

    // ---------- saving ----------
    save() {
        return {
            raid: this.raid.done,
            ice: this.ice.broken ? -1 : this.ice.hits,
            crates: this.crates.map((c) => c.opened),
            rover: this.roverFound,
        };
    }

    applySave(s) {
        if (s.raid) this.raid.drop(true);
        if (s.ice === -1) this.ice.shatter(true);
        else if (s.ice > 0) { this.ice.hits = s.ice; this.ice.drawCracks(); }
        (s.crates || []).forEach((o, i) => {
            const c = this.crates[i];
            if (c && o && c.def.kind === 'reward') { c.opened = true; c.lidTarget = c.lidK = 1; }
        });
        this.roverFound = !!s.rover;
    }

    // Chapter 2 starts with Mars beaten
    setBeaten() {
        this.raid.drop(true);
        this.ice.shatter(true);
        this.roverFound = true;
    }
}
