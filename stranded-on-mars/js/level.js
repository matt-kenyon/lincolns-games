// ============================================================
// LEVEL — zones, force fields, ship parts, pickups, objectives,
// checkpoints, saving, and rebuilding the ship
// The quests around the parts (camp raid, rover, ice, crates) are in missions.js.
// ============================================================

import * as THREE from 'three';
import {
    ZONES, ZONE, PART_SPOTS, PART_ORDER, CHECKPOINTS, SHIP, GATES, zoneAtS, START, JUMP, ICE_LAKE,
} from './layout.js';
import { PLAYER } from './config.js';
import { PART_INFO, buildPartModel, partSlotWorld } from './ship.js';
import { makeBeam } from './effects.js';
import { toonMaterial, addOutline, glowSprite } from './toon.js';
import { rand, store, easeInOut, clamp, lerp } from './util.js';
import { Missions } from './missions.js';
import { jumpUV } from './plains.js';

const SAVE_KEY = 'strandedOnMars.save.v1';
// Mars save format version. v1 = the five-area Mars (before the Great Dust Plains); loadSave() migrates it.
const SAVE_V = 2;
const CRASH = ZONES.length - 1; // the last area: the crash site, where the Alien Captain is
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
            if (id === 'powerCore' || id === 'thruster') continue; // the Captain has one, the other is frozen in the ice
            const s = PART_SPOTS[id];
            this.spawnPart(id, s.x, s.z);
        }
        this.partPickups.fuelTank.locked = true; // in the camp's cage until every alien there is beaten
        this.missions = new Missions(this);
        this.refreshShipGhosts();
    }

    spawnPart(id, x, z, y = this.game.world.groundAt(x, z)) {
        const g = this.game;
        const model = buildPartModel(id, PART_SCALE[id]);
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
        if (id === 'thruster' && !this.missions.ice.broken) return this.missions.ice.frozen.position;
        if (id === 'powerCore') {
            const cap = this.game.aliens.captain();
            if (cap && !cap.dead && this.zone >= CRASH - 1) return cap.pos;
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

    onStart() {
        this.missions.placeRover(this.checkpoint);
    }

    // The rover (js/rover.js) calls this every time you get in
    onRoverEnter() {
        this.missions.onRoverEnter();
    }

    // A grenade went off (combat.js)
    onExplosion(pos, radius) {
        this.missions.ice.hit(pos, radius);
    }

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
        if (this.missions.rover && !this.missions.roverFound && this.missions.raid.done) {
            const r = this.missions.roverPos();
            icon(r.x, r.z, 3, '#6ff0ff');
        }
        icon(SHIP.x, SHIP.z, 4.2, '#ff8a3d');
    }

    // --------------------------------------------------------
    // Save / load
    // --------------------------------------------------------
    save() {
        const g = this.game;
        store.set(SAVE_KEY, {
            v: SAVE_V,
            diff: g.diffKey,
            cp: this.checkpoint,
            have: this.have,
            gates: g.world.gates.map((x) => x.open),
            dome: !g.world.dome.on,
            captain: this.captainDown,
            stats: g.stats,
            ...this.missions.save(),
        });
    }

    // The saved game (Mars or level 2), with an old Mars save brought up to date
    static loadSave() {
        const s = store.get(SAVE_KEY);
        if (!s) return null;
        if (s.stage === 2) return s.v === 1 ? s : null; // aboard the mothership (shiplevel.js)
        if (s.v === 1) return Level.migrate(s);
        return s.v === SAVE_V ? s : null;
    }

    // A v1 save is from before the Great Dust Plains: five areas, four force fields, the wing in Red Rock Canyon
    // and the thruster lying by the ice lake. Map it onto the new route so CONTINUE carries on from the same place.
    static migrate(s) {
        const old = s.gates || [];
        const have = { ...(s.have || {}) };
        const oldCp = s.cp || 0;
        // old checkpoints: 0 start, 1 Red Rock Canyon, 2 Crystal Forest, 3 Frozen Crater, 4 Crash Site
        const cp = [0, 1, 2, 4, 5][Math.min(4, oldCp)];
        const campDone = !!old[2]; // the Crystal Forest was cleared
        return {
            v: SAVE_V,
            diff: s.diff,
            cp,
            have,
            // the new plains force field is open for anyone already past it (so they can go back for the wing)
            gates: [!!old[0], !!old[1], campDone, campDone && (oldCp >= 3 || !!have.wing), !!old[3]],
            dome: !!s.dome,
            captain: !!s.captain,
            stats: s.stats,
            raid: campDone,
            ice: have.thruster ? -1 : 0,
            crates: [],
            rover: campDone, // past the camp: the rover is waiting, upright, by the checkpoint
            migrated: 1,
        };
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
            g.aliens.clearZone(CRASH);
        }
        this.captainDown = !!s.captain || !!s.dome;
        for (const id of PART_ORDER) {
            if (s.have[id]) {
                this.have[id] = true;
                if (this.partPickups[id]) this.removePickup(this.partPickups[id]);
            }
        }
        this.missions.applySave(s);
        if (this.missions.ice.broken && !this.have.thruster && !this.partPickups.thruster) {
            const S = PART_SPOTS.thruster;
            this.spawnPart('thruster', S.x - 6, S.z + 3, ICE_LAKE.level);
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
        this.missions.onRespawn();
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
        if (p.id === 'wing') setTimeout(() => g.hud.toast('The force field to the FROZEN CRATER is down! (Hop off the mesa, or take the ledge path down.)', 5), 2600);
        this.save();
    }

    // --------------------------------------------------------
    // Objective text
    // --------------------------------------------------------
    objectiveText() {
        const g = this.game;
        const z = this.zone;
        const M = this.missions;
        const missing = PART_ORDER.filter((id) => !this.have[id]);
        if (this.repairing) return 'Rebuilding your ship...';
        if (z < CRASH) {
            const here = PART_ORDER.find((id) => PART_SPOTS[id].zone === z && id !== 'powerCore');
            const missedEarlier = PART_ORDER.find((id) => PART_SPOTS[id].zone < z && !this.have[id] && id !== 'powerCore');
            const alive = g.aliens.aliveInZone(z);
            const gateOpen = g.world.gates[z].open;
            const fresh = g.time - this.zoneTimer < 12;
            // the Crystal Forest: raid the camp, free the fuel tank, find the rover
            if (z === ZONE.crystal) {
                if (!M.raid.done) {
                    if (!M.raid.triggered) return `Raid the alien camp and free your FUEL TANK from the cage! <b>(${M.raid.awake()} aliens around)</b>`;
                    return `ALARM! Beat every alien in the camp to open the cage! <b>(${alive} left)</b>`;
                }
                if (!this.have.fuelTank) return 'The cage is open! Grab your FUEL TANK!';
                if (M.rover && !M.roverFound) return "That's your ship's ROVER! <b>Hold E</b> to flip it over.";
                if (M.rover && !M.roverRode) return 'Hop in the rover (<b>E</b>) and drive west through the force field!';
            }
            // the Great Dust Plains: the wing is on the mesa
            if (z === ZONE.plains && !this.have.wing) {
                if (!M.rover) return 'The WING is on top of the tall mesa! Jump the rover off the ramp at the end of the long ridge.';
                if (!M.roverFound) return 'The WING is on the mesa: too high to climb! Go back and get the ROVER from the alien camp.';
                if (!M.rover.driving) return 'The WING is on the mesa: too high to climb! Drive the rover up the long ridge and JUMP! <b>(Hold R</b> calls the rover<b>)</b>';
                return 'Drive up the long ridge FAST and jump off the ramp onto the mesa!';
            }
            // the Frozen Crater: the thruster is frozen in the ice lake
            if (z === ZONE.frozen && !this.have.thruster && !M.ice.broken && (alive === 0 || fresh)) {
                return 'Your THRUSTER is frozen under the ice lake! Crack the ice with <b>grenades</b>.';
            }
            if (here && !this.have[here] && here !== 'fuelTank' && (alive === 0 || fresh)) {
                return `Find the ${PART_INFO[here].name} &mdash; look for the beam of light!`;
            }
            if (!gateOpen && alive > 0) return `Beat the aliens to shut down the force field! <b>(${alive} left)</b>`;
            if (z === ZONE.frozen && !this.have.thruster && !M.ice.broken) return 'Your THRUSTER is frozen under the ice lake! Crack the ice with <b>grenades</b>.';
            if (here && !this.have[here]) return `Find the ${PART_INFO[here].name} &mdash; look for the beam of light!`;
            if (missedEarlier) return `You missed the ${PART_INFO[missedEarlier].name}! Follow its beam back (check your map).`;
            if (z === ZONE.canyon && !M.crates[0].opened) return 'Keep going! (Psst: there\'s a supply crate behind the stone arch.)';
            return 'Keep going! Follow the smoke to your ship.';
        }
        const alive = g.aliens.aliveInZone(CRASH);
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
        this.missions.update(dt);
        g.world.gates.forEach((gate, k) => {
            if (gate.open) return;
            // the plains' force field opens when you have the wing; the others when their area's aliens are beaten
            const ready = k === ZONE.plains ? !!this.have.wing : g.aliens.aliveInZone(k) === 0;
            if (!ready) return;
            g.world.openGate(k);
            g.audio.play('gateDown', new THREE.Vector3(gate.def.x, gate.y + 2, gate.def.z));
            if (k === ZONE.crystal) g.hud.announce('CAMP RAIDED!', 'THE CAGE IS OPEN');
            else if (k !== ZONE.plains) g.hud.announce('ALL ALIENS BEATEN!', 'FORCE FIELD DOWN');
            this.save();
        });
        if (g.world.dome.on && g.aliens.aliveInZone(CRASH) === 0) {
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
                const near = d < 4 && Math.abs(P.pos.y - p.root.position.y) < 3;
                if (p.locked) {
                    if (d < 5.5 && !P.dead) prompt = { key: '', text: `The ${PART_INFO[p.id].name} is locked in the cage! Beat every alien in the camp.`, act: null, d };
                } else if (near && !P.dead) prompt = { key: 'E', text: `Pick up the ${PART_INFO[p.id].name}`, act: () => this.collectPart(p), d };
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

        // ----- supply crates -----
        if (!P.dead) {
            const cp = this.missions.prompt(P);
            if (cp && (!prompt || cp.d < prompt.d)) prompt = cp;
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
        const Ms = this.missions;
        if (Ms.rover && !Ms.roverFound && Ms.raid.done && this.zone <= ZONE.plains) {
            const r = Ms.roverPos();
            g.hud.setCompassMarker('rover', r.x, r.z, '#6ff0ff');
        } else g.hud.clearCompassMarker('rover');

        g.hud.objective(this.objectiveText());

        // ----- music -----
        const fighting = g.aliens.anyInCombat();
        if (fighting) this.combatT = 5;
        else this.combatT -= dt;
        const cap = g.aliens.captain();
        const bossFight = cap && !cap.dead && (cap.state === 'combat' || cap.state === 'alert');
        const driving = g.rover && g.rover.driving;
        g.audio.setMusic(bossFight ? 'boss' : this.combatT > 0 ? 'combat' : driving ? 'drive' : 'explore');

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
        const plains = this.zone === ZONE.plains && !this.have.wing;
        this.game.hud.toast(plains ? 'The force field blocks the way! Get the WING from the top of the mesa first.'
            : 'The force field blocks the way! Beat the aliens nearby.', 3);
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

    // --------------------------------------------------------
    // Debug helpers (with ?debug these join game.debug)
    // --------------------------------------------------------
    debugHelpers() {
        const g = this.game, L = this, J = JUMP;
        const face = (dx, dz) => Math.atan2(-dx, -dz);
        // everything before area z done: force fields open, aliens gone (the camp's cage too)
        const doneBefore = (z) => {
            for (let k = 0; k < z; k++) { g.world.openGate(k, true); g.aliens.clearZone(k); }
            if (z > ZONE.crystal) L.missions.raid.drop(true);
            L.checkpoint = Math.max(L.checkpoint, z);
        };
        return {
            // Stand somewhere in the Great Dust Plains (with everything before them done):
            // 'gate' (the way in), 'ridge' (the foot of the launch ridge), 'crest' (the run-up), 'lip' (the top of
            // the kicker ramp), 'mesa' (on top, next to the wing), 'down' (the ledge path down), 'exit' (the far gate)
            plains(spot = 'gate') {
                doneBefore(ZONE.plains);
                const U0 = -(J.kickLen + J.crestLen + J.inclineLen);
                const spots = {
                    ridge: [J.at(U0 - 8, 0), J.dir],
                    crest: [J.at(-J.kickLen - 10, 0), J.dir],
                    lip: [J.at(-0.6, 0), J.dir],
                    mesa: [J.at(J.mesa.u0 + 32, -4), J.dir],
                    down: [J.at(J.down.u0 + 14, (J.down.v0 + J.down.v1) / 2 + 1), J.dir],
                };
                if (spot === 'gate' || spot === 'exit') {
                    const c = CHECKPOINTS[spot === 'gate' ? ZONE.plains : ZONE.frozen];
                    const G = GATES[ZONE.plains];
                    const p = spot === 'gate' ? c : { x: G.x - G.tx * 14, z: G.z - G.tz * 14, yaw: face(G.tx, G.tz) };
                    g.player.spawn(p.x, p.z, p.yaw);
                } else {
                    const [p, d] = spots[spot] || spots.ridge;
                    g.player.spawn(p.x, p.z, face(d.x, d.z));
                }
                return { spot, pos: g.player.pos.toArray().map((v) => +v.toFixed(1)) };
            },
            // Set off the Crystal Forest camp's alarm
            raid() {
                doneBefore(ZONE.crystal);
                L.missions.raid.trigger();
                return { triggered: L.missions.raid.triggered };
            },
            // n grenade blasts on the ice slab over the thruster
            crackIce(n = 1) {
                const S = L.missions.ice;
                for (let i = 0; i < n; i++) {
                    S.lastHit = -9;
                    S.hit(new THREE.Vector3(S.slab.position.x, S.top + 0.2, S.slab.position.z), PLAYER.grenadeRadius);
                }
                return { hits: S.hits, broken: S.broken };
            },
            // Where you are in the jump's own coordinates (u: meters past the ramp's lip, v: sideways)
            jumpUV() {
                const o = jumpUV(g.player.pos.x, g.player.pos.z);
                return { u: +o.u.toFixed(1), v: +o.v.toFixed(1), y: +(g.player.pos.y - J.base).toFixed(1) };
            },
        };
    }

    // Chapter 2 starts right after Mars is beaten: every area clear, all 5 parts back on the ship
    setBeaten() {
        const g = this.game;
        for (let k = 0; k < GATES.length; k++) g.world.openGate(k, true);
        for (let z = 0; z < ZONES.length; z++) g.aliens.clearZone(z);
        g.world.dropDome(true);
        this.missions.setBeaten();
        for (const id of PART_ORDER) {
            this.have[id] = true;
            this.installed[id] = true;
            if (this.partPickups[id]) this.removePickup(this.partPickups[id]);
        }
        this.captainDown = true;
        this.refreshShipGhosts();
        g.world.setShipRepaired();
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
