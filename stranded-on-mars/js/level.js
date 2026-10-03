// ============================================================
// LEVEL — zones, force fields, ship parts, pickups, objectives,
// checkpoints, saving, and rebuilding the ship
// ============================================================

import * as THREE from 'three';
import {
    ZONES, PART_SPOTS, PART_ORDER, CHECKPOINTS, SHIP, GATES, zoneAtS, START,
} from './layout.js';
import { PLAYER } from './config.js';
import { PART_INFO, buildPartModel, partSlotWorld } from './ship.js';
import { makeBeam } from './effects.js';
import { toonMaterial, addOutline, glowSprite } from './toon.js';
import { rand, store, easeInOut, clamp, lerp } from './util.js';

const SAVE_KEY = 'strandedOnMars.save.v1';
const PART_SCALE = { tailFin: 0.55, wing: 0.4, fuelTank: 0.55, thruster: 0.85, powerCore: 1.2 };

export function heartGeometry() {
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.15, -0.3, -0.55, -0.05, -0.55, 0.22);
    s.bezierCurveTo(-0.55, 0.48, -0.25, 0.6, 0, 0.36);
    s.bezierCurveTo(0.25, 0.6, 0.55, 0.48, 0.55, 0.22);
    s.bezierCurveTo(0.55, -0.05, 0.15, -0.3, 0, -0.5);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 });
    g.center();
    return g;
}

export class Level {
    constructor(game) {
        this.game = game;
        this.have = {};
        this.installed = {};
        this.zone = 0;
        this.maxZone = 0;
        this.checkpoint = 0;
        this.pickups = [];
        this.partPickups = {};
        this.captainDown = false;
        this.repairing = false;
        this.hints = {};
        this.bumpT = 0;
        this.combatT = 0;
        this.zoneTimer = 0;
        this.exploreMusic = 'explore';
        this.heartGeo = heartGeometry();
        this.heartMat = toonMaterial({ color: 0xff4d5e, rim: 0.7, rimColor: 0xffffff });
        this.grenMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff });
    }

    // --------------------------------------------------------
    // Setup
    // --------------------------------------------------------
    build() {
        for (const id of PART_ORDER) {
            if (id === 'powerCore') continue;
            const s = PART_SPOTS[id];
            this.spawnPart(id, s.x, s.z);
        }
        this.refreshShipGhosts();
    }

    spawnPart(id, x, z) {
        const g = this.game;
        const model = buildPartModel(id, PART_SCALE[id]);
        const y = g.world.groundAt(x, z);
        const root = new THREE.Group();
        root.position.set(x, y, z);
        model.position.y = 1.3;
        root.add(model);
        const beam = makeBeam(0xffc45e, 70, 0.8);
        root.add(beam);
        const glow = glowSprite(0xffe7a8, 3.2, 0.55);
        glow.position.y = 1.3;
        root.add(glow);
        g.scene.add(root);
        const p = { kind: 'part', id, root, model, beam, glow, pos: new THREE.Vector3(x, y + 1.3, z), t: Math.random() * 6 };
        this.pickups.push(p);
        this.partPickups[id] = p;
        return p;
    }

    spawnDrop(kind, pos) {
        const g = this.game;
        const root = new THREE.Group();
        let mesh;
        if (kind === 'heart') {
            mesh = new THREE.Mesh(this.heartGeo, this.heartMat);
            mesh.scale.setScalar(0.55);
            addOutline(mesh, 0x2a1424, 0.004);
        } else {
            mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 1), this.grenMat);
            for (let i = 0; i < 6; i++) {
                const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), this.grenMat);
                const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][i];
                sp.position.set(d[0] * 0.2, d[1] * 0.2, d[2] * 0.2);
                sp.lookAt(d[0] * 2, d[1] * 2, d[2] * 2);
                sp.rotateX(Math.PI / 2);
                mesh.add(sp);
            }
        }
        root.add(mesh);
        const glow = glowSprite(kind === 'heart' ? 0xff7a8a : 0x6ff0ff, 1.6, 0.7);
        root.add(glow);
        const y = g.world.groundAt(pos.x, pos.z);
        root.position.set(pos.x, y + 0.8, pos.z);
        g.scene.add(root);
        this.pickups.push({
            kind, root, model: mesh, pos: root.position, t: 0, vy: 4, baseY: y + 0.8, ground: y,
            vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5),
        });
    }

    removePickup(p) {
        this.game.scene.remove(p.root);
        const i = this.pickups.indexOf(p);
        if (i >= 0) this.pickups.splice(i, 1);
        if (p.kind === 'part') delete this.partPickups[p.id];
    }

    refreshShipGhosts() {
        const ship = this.game.world.ship;
        for (const id of PART_ORDER) {
            ship.setPart(id, !!this.installed[id]);
            ship.setGhost(id, !this.installed[id]);
        }
        this.game.hud.setParts(this.have, this.installed);
    }

    // World position of a part that still needs collecting (for map + compass)
    partWorldPos(id) {
        if (this.have[id]) return null;
        const p = this.partPickups[id];
        if (p) return p.pos;
        if (id === 'powerCore') {
            const cap = this.game.aliens.captain();
            if (cap && !cap.dead && this.zone >= 3) return cap.pos;
        }
        return null;
    }

    // --------------------------------------------------------
    // What main.js and the HUD ask every level (the mothership level has these too)
    // --------------------------------------------------------
    checkpointAt(cp) {
        return CHECKPOINTS[cp];
    }

    zoneName(z) {
        return ZONES[z].name;
    }

    startBanner(cp) {
        return [ZONES[cp].name, cp === 0 ? 'MARS' : 'CHECKPOINT'];
    }

    onStart() {}

    currentZone() {
        return zoneAtS(this.game.player.pathS ?? 0);
    }

    // Boss health bar (the Alien Captain, once he's fighting you)
    bossInfo() {
        const cap = this.game.aliens.captain();
        if (!cap || cap.dead || !cap.root.visible || (cap.state !== 'combat' && cap.state !== 'alert')) return null;
        return { name: 'ALIEN CAPTAIN', hp: cap.hp, maxHp: cap.maxHp, shield: cap.shield, maxShield: cap.maxShield };
    }

    // Ship parts and the ship on the minimap
    drawMapIcons(icon) {
        for (const id of PART_ORDER) {
            const p = this.partWorldPos(id);
            if (p) icon(p.x, p.z, 3.2, '#ffd166');
        }
        icon(SHIP.x, SHIP.z, 4.2, '#ff8a3d');
    }

    // --------------------------------------------------------
    // Save / load
    // --------------------------------------------------------
    save() {
        const g = this.game;
        store.set(SAVE_KEY, {
            v: 1,
            diff: g.diffKey,
            cp: this.checkpoint,
            have: this.have,
            gates: g.world.gates.map((x) => x.open),
            dome: !g.world.dome.on,
            captain: this.captainDown,
            stats: g.stats,
        });
    }

    static loadSave() {
        const s = store.get(SAVE_KEY);
        return s && s.v === 1 ? s : null;
    }

    static clearSave() {
        store.remove(SAVE_KEY);
    }

    applySave(s) {
        const g = this.game;
        s.gates.forEach((open, k) => {
            if (open) {
                g.world.openGate(k, true);
                g.aliens.clearZone(k);
            }
        });
        if (s.dome) {
            g.world.dropDome(true);
            g.aliens.clearZone(4);
        }
        this.captainDown = !!s.captain || !!s.dome;
        for (const id of PART_ORDER) {
            if (s.have[id]) {
                this.have[id] = true;
                if (this.partPickups[id]) this.removePickup(this.partPickups[id]);
            }
        }
        if (this.captainDown && !this.have.powerCore) {
            const p = PART_SPOTS.powerCore;
            this.spawnPart('powerCore', p.x, p.z);
        }
        Object.assign(g.stats, s.stats || {});
        this.checkpoint = s.cp || 0;
        this.maxZone = this.checkpoint;
        this.zone = this.checkpoint;
        this.refreshShipGhosts();
    }

    // --------------------------------------------------------
    // Events
    // --------------------------------------------------------
    onAlienDefeated(a) {
        const g = this.game;
        g.stats.aliens++;
        const P = g.player;
        const pos = a.pos.clone();
        if (a.T.boss) {
            this.captainDown = true;
            setTimeout(() => {
                const p = this.spawnPart('powerCore', pos.x, pos.z);
                p.pop = 1;
                g.effects.sparks(pos.x, pos.y + 1.5, pos.z, 0x6ff0ff, 30, 8, 0.2);
                g.hud.announce('THE CAPTAIN DROPPED IT!', 'POWER CORE');
                g.audio.play('sparkle');
            }, 900);
            this.spawnDrop('heart', pos);
            this.spawnDrop('heart', pos);
            this.save();
            return;
        }
        // Minecraft-style drops
        const wantHeart = P.health < P.maxHealth ? 0.45 : 0.15;
        const wantGren = P.grenades < PLAYER.maxGrenades ? 0.3 : 0.05;
        setTimeout(() => {
            if (Math.random() < wantHeart) this.spawnDrop('heart', pos);
            if (Math.random() < wantGren) this.spawnDrop('grenade', pos);
        }, 850);
        if (!this.hints.grenade && g.stats.aliens >= 2) {
            this.hints.grenade = true;
            setTimeout(() => g.hud.toast('TIP: Right-click (or G) throws a STICKY grenade!', 4), 1500);
        }
    }

    onPlayerDown() {
        const g = this.game;
        g.stats.deaths++;
        g.audio.play('alienCheer', g.player.pos);
    }

    respawn() {
        const g = this.game;
        const cp = CHECKPOINTS[this.checkpoint];
        g.combat.clear();
        for (let z = 0; z < ZONES.length; z++) g.aliens.resetZone(z);
        g.player.spawn(cp.x, cp.z, cp.yaw);
        g.player.grenades = Math.max(g.player.grenades, PLAYER.grenades);
    }

    collectPart(p) {
        const g = this.game;
        this.have[p.id] = true;
        this.removePickup(p);
        g.audio.play('fanfare');
        g.hud.announce('YOU FOUND A SHIP PART!', PART_INFO[p.id].name);
        g.hud.setParts(this.have, this.installed);
        g.hud.popSlot(p.id);
        g.effects.sparks(p.pos.x, p.pos.y, p.pos.z, 0xffd166, 24, 6, 0.18);
        const n = Object.keys(this.have).length;
        g.hud.toast(`${n} of 5 ship parts`, 2.5);
        this.save();
    }

    // --------------------------------------------------------
    // Objective text
    // --------------------------------------------------------
    objectiveText() {
        const g = this.game;
        const z = this.zone;
        const missing = PART_ORDER.filter((id) => !this.have[id]);
        if (this.repairing) return 'Rebuilding your ship...';
        if (z < 4) {
            const here = PART_ORDER.find((id) => PART_SPOTS[id].zone === z && id !== 'powerCore');
            const missedEarlier = PART_ORDER.find((id) => PART_SPOTS[id].zone < z && !this.have[id] && id !== 'powerCore');
            const alive = g.aliens.aliveInZone(z);
            const gateOpen = g.world.gates[z].open;
            if (here && !this.have[here] && (alive === 0 || g.time - this.zoneTimer < 12)) {
                return `Find the ${PART_INFO[here].name} &mdash; look for the beam of light!`;
            }
            if (!gateOpen && alive > 0) return `Beat the aliens to shut down the force field! <b>(${alive} left)</b>`;
            if (here && !this.have[here]) return `Find the ${PART_INFO[here].name} &mdash; look for the beam of light!`;
            if (missedEarlier) return `You missed the ${PART_INFO[missedEarlier].name}! Follow its beam back (check your map).`;
            return 'Keep going! Follow the smoke to your ship.';
        }
        const alive = g.aliens.aliveInZone(4);
        if (g.world.dome.on) {
            const cap = g.aliens.captain();
            if (cap && !cap.dead && alive <= 3) return `Beat the <b>Alien Captain</b> and get your Power Core back! <b>(${alive} left)</b>`;
            return `The aliens took your ship! Beat them all! <b>(${alive} left)</b>`;
        }
        if (!this.have.powerCore) return 'Grab the POWER CORE the Captain dropped!';
        if (missing.length) return 'Still missing: ' + missing.map((id) => PART_INFO[id].name).join(', ') + ' &mdash; go back and find them!';
        return 'Walk up to your ship and press <b>E</b> to rebuild it!';
    }

    // --------------------------------------------------------
    // Per-frame
    // --------------------------------------------------------
    update(dt) {
        const g = this.game;
        const P = g.player;
        const t = g.time;

        // ----- zones -----
        const z = zoneAtS(P.pathS ?? 0);
        if (z !== this.zone) {
            this.zone = z;
            this.zoneTimer = t;
            if (z > this.maxZone) {
                this.maxZone = z;
                this.checkpoint = z;
                this.save();
            }
            g.hud.zoneBanner(ZONES[z].name);
        }
        for (let k = 0; k < ZONES.length; k++) {
            const want = Math.abs(k - z) <= 1;
            if (want !== g.aliens.activeZones.has(k)) g.aliens.setZoneActive(k, want);
        }

        // ----- force fields drop when their zone is clear -----
        g.world.gates.forEach((gate, k) => {
            if (!gate.open && g.aliens.aliveInZone(k) === 0) {
                g.world.openGate(k);
                g.audio.play('gateDown', new THREE.Vector3(gate.def.x, gate.y + 2, gate.def.z));
                g.hud.announce('ALL ALIENS BEATEN!', 'FORCE FIELD DOWN');
                this.save();
            }
        });
        if (g.world.dome.on && g.aliens.aliveInZone(4) === 0) {
            g.world.dropDome();
            g.audio.play('gateDown', new THREE.Vector3(SHIP.x, 4, SHIP.z));
            setTimeout(() => g.hud.announce('YOUR SHIP IS FREE!', 'SHIELD DOWN'), 1200);
            this.save();
        }
        this.bumpT -= dt;

        // ----- pickups -----
        let prompt = null;
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const p = this.pickups[i];
            p.t += dt;
            if (p.kind === 'part') {
                p.model.rotation.y += dt * 0.9;
                p.model.position.y = 1.3 + Math.sin(p.t * 2) * 0.18;
                p.beam.material.uniforms.uTime.value = p.t;
                if (p.pop) {
                    p.pop = Math.max(0, p.pop - dt * 2);
                    p.model.scale.setScalar(1 - p.pop * 0.8);
                }
                const d = P.pos.distanceTo(_tmp.set(p.root.position.x, P.pos.y, p.root.position.z));
                // the beam is for finding it from far away — fade it when you're close
                p.beam.material.uniforms.uFade.value = Math.min(1, Math.max(0, (d - 5) / 18));
                if (d < 4 && !P.dead) prompt = { key: 'E', text: `Pick up the ${PART_INFO[p.id].name}`, act: () => this.collectPart(p), d };
            } else {
                // drops pop out then float
                if (p.vy !== undefined && p.vy !== null) {
                    p.vy -= 12 * dt;
                    p.pos.x += p.vx * dt;
                    p.pos.z += p.vz * dt;
                    p.pos.y += p.vy * dt;
                    const gy = g.world.groundAt(p.pos.x, p.pos.z) + 0.6;
                    if (p.pos.y < gy) { p.pos.y = gy; p.vy = null; p.baseY = gy; }
                } else {
                    p.pos.y = p.baseY + Math.sin(p.t * 3) * 0.12;
                }
                p.model.rotation.y += dt * 2.2;
                const d = P.pos.distanceTo(_tmp.set(p.pos.x, P.pos.y, p.pos.z));
                if (d < 1.9 && !P.dead && p.t > 0.5) {
                    if (p.kind === 'heart' && P.health < P.maxHealth) {
                        P.heal(2);
                        g.audio.play('heart');
                        g.hud.toast('+1 Heart ❤', 1.5);
                        this.removePickup(p);
                    } else if (p.kind === 'grenade' && P.grenades < PLAYER.maxGrenades) {
                        P.grenades++;
                        g.audio.play('pickup');
                        g.hud.toast('+1 Sticky Grenade', 1.5);
                        this.removePickup(p);
                    }
                }
            }
        }

        // ----- the ship -----
        const sd = Math.hypot(P.pos.x - SHIP.x, P.pos.z - SHIP.z);
        if (!this.repairing && sd < 13 && !g.world.dome.on && !P.dead) {
            const missing = PART_ORDER.filter((id) => !this.have[id]);
            if (!missing.length) prompt = { key: 'E', text: 'Rebuild your ship!', act: () => this.startRepair(), d: 0 };
            else prompt = { key: '', text: `Your ship still needs: ${missing.map((id) => PART_INFO[id].name).join(', ')}`, act: null, d: 0 };
        }

        if (prompt && !this.repairing) {
            g.hud.prompt(prompt.key, prompt.text);
            if (prompt.act && g.frameInput.interact) prompt.act();
        } else {
            g.hud.hidePrompt();
        }

        // ----- compass markers -----
        g.hud.setCompassMarker('ship', SHIP.x, SHIP.z, '#ff8a3d');
        for (const id of PART_ORDER) {
            const p = this.partWorldPos(id);
            const show = p && (PART_SPOTS[id].zone <= this.zone || id === 'powerCore');
            if (show) g.hud.setCompassMarker(id, p.x, p.z, '#ffd166');
            else g.hud.clearCompassMarker(id);
        }

        g.hud.objective(this.objectiveText());

        // ----- music -----
        const fighting = g.aliens.anyInCombat();
        if (fighting) this.combatT = 5;
        else this.combatT -= dt;
        const cap = g.aliens.captain();
        const bossFight = cap && !cap.dead && (cap.state === 'combat' || cap.state === 'alert');
        g.audio.setMusic(bossFight ? 'boss' : this.combatT > 0 ? 'combat' : 'explore');

        // ----- hints for new players -----
        if (!this.hints.move && t > 2) {
            this.hints.move = true;
            g.hud.toast('W A S D to walk, mouse to look around', 4);
            setTimeout(() => g.hud.toast('SPACE to jump — gravity on Mars is low!', 4), 4500);
        }
        if (!this.hints.shoot && fighting) {
            this.hints.shoot = true;
            g.hud.toast('Aliens! CLICK to shoot your blaster!', 3.5);
        }
    }

    onGateBump() {
        if (this.bumpT > 0) return;
        this.bumpT = 4;
        this.game.hud.toast('The force field blocks the way! Beat the aliens nearby.', 3);
        this.game.audio.play('shieldZap');
    }

    // --------------------------------------------------------
    // Rebuilding the ship
    // --------------------------------------------------------
    startRepair() {
        const g = this.game;
        if (this.repairing) return;
        this.repairing = true;
        g.hud.hidePrompt();
        g.startRepairSequence(this);
    }

    // Called by main during the repair cutscene
    repairStep(id, from) {
        const g = this.game;
        const ship = g.world.ship;
        const model = buildPartModel(id, PART_SCALE[id]);
        model.position.copy(from);
        g.scene.add(model);
        const to = partSlotWorld(ship, id, new THREE.Vector3());
        const start = from.clone();
        const q0 = model.quaternion.clone();
        const q1 = new THREE.Quaternion();
        ship.body.getWorldQuaternion(q1);
        const s0 = PART_SCALE[id], s1 = 1;
        return {
            update: (k) => {
                const e = easeInOut(clamp(k, 0, 1));
                model.position.lerpVectors(start, to, e);
                model.position.y += Math.sin(e * Math.PI) * 5;
                model.quaternion.slerpQuaternions(q0, q1, e);
                model.scale.setScalar(lerp(s0, s1, e));
                model.rotation.z += 0;
            },
            finish: () => {
                g.scene.remove(model);
                this.installed[id] = true;
                ship.setPart(id, true);
                ship.setGhost(id, false);
                g.effects.sparks(to.x, to.y, to.z, 0xffd166, 22, 6, 0.18);
                g.effects.glowFlash(to.x, to.y, to.z, 0xffffff, 3, 0.25);
                g.audio.play('clunk', to);
                g.hud.setParts(this.have, this.installed);
            },
        };
    }
}

const _tmp = new THREE.Vector3();
