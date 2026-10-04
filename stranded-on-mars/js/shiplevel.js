// ============================================================
// SHIP LEVEL — level 2 inside the alien mothership: waves of aliens
// in every room, force-field doors, checkpoints, saving, the big
// creature boss, and the escape pod home.
// ============================================================

import * as THREE from 'three';
import { ZONES, CHECKPOINTS, DOORS, POD, ROOMS } from './shiplayout.js';
import { PLAYER } from './config.js';
import { Drops } from './drops.js';
import { Boss } from './boss.js';
import { store } from './util.js';

const SAVE_KEY = 'strandedOnMars.save.v1';
const BOSS_ZONE = 4;
const POD_ZONE = 5;

export class ShipLevel {
    constructor(game) {
        this.game = game;
        this.zone = 0;
        this.maxZone = 0;
        this.checkpoint = 0;
        this.cleared = ZONES.map((z) => z.aliens.length === 0);
        this.wave = ZONES.map(() => 0);
        this.waveT = ZONES.map(() => -1);
        this.hints = {};
        this.bumpT = 0;
        this.combatT = 0;
        this.zoneTimer = 0;
        this.bossSeen = false;
        this.bossDown = false;
        this.launching = false;
        this.exploreMusic = 'ship';
    }

    build() {
        const g = this.game;
        this.drops = new Drops(g);
        this.boss = new Boss(g);
        g.aliens.boss = this.boss;
    }

    // --------------------------------------------------------
    // What main.js and the HUD ask every level
    // --------------------------------------------------------
    checkpointAt(cp) {
        return CHECKPOINTS[cp];
    }

    zoneName(z) {
        return ZONES[z].name;
    }

    startBanner(cp) {
        return [ZONES[cp].name, cp === 0 ? 'LEVEL 2 — THE MOTHERSHIP' : 'CHECKPOINT'];
    }

    currentZone() {
        return this.game.world.zoneAt(this.game.player.pos.x, this.game.player.pos.z);
    }

    bossInfo() {
        return this.boss && this.boss.showBar() ? this.boss.info() : null;
    }

    drawMapIcons(icon) {
        const d = this.nextDoor();
        if (d) icon(d.x, d.z, 2.6, '#6ff0ff');
        icon(POD.x, POD.z, 3.6, '#7dff9a');
    }

    // The door you should head for next (null once you're at the pod)
    nextDoor() {
        const z = this.zone;
        if (z >= POD_ZONE) return null;
        if (z === BOSS_ZONE) return this.bossDown ? DOORS[5] : null;
        return DOORS[z];
    }

    // --------------------------------------------------------
    // Save / load (same save slot as Mars, marked stage 2)
    // --------------------------------------------------------
    save() {
        const g = this.game;
        store.set(SAVE_KEY, {
            v: 1,
            stage: 2,
            diff: g.diffKey,
            cp: this.checkpoint,
            cleared: this.cleared,
            bossSeen: this.bossSeen,
            boss: this.bossDown,
            stats: g.stats,
        });
    }

    // Saved the moment Mars is beaten, so CONTINUE takes you aboard the mothership
    static saveStart(game) {
        store.set(SAVE_KEY, { v: 1, stage: 2, diff: game.diffKey, cp: 0, cleared: [], bossSeen: false, boss: false, stats: game.stats });
    }

    applySave(s) {
        const g = this.game;
        (s.cleared || []).forEach((done, k) => {
            if (!done || k >= BOSS_ZONE) return;
            this.cleared[k] = true;
            g.aliens.clearZone(k);
            g.world.openGate(k, true);
        });
        this.bossSeen = !!s.bossSeen;
        if (s.boss) {
            this.bossDown = true;
            this.bossSeen = true;
            this.boss.setDefeated();
            g.aliens.clearZone(BOSS_ZONE);
            g.world.openGate(5, true);
        }
        Object.assign(g.stats, s.stats || {});
        this.checkpoint = s.cp || 0;
        this.maxZone = this.checkpoint;
        this.zone = this.checkpoint;
    }

    // --------------------------------------------------------
    // Events
    // --------------------------------------------------------
    onStart() {
        // continuing right at the creature pit: the fight is on again
        const z = this.currentZone();
        if (z === BOSS_ZONE && !this.bossDown && !this.boss.active) this.wakeBoss();
    }

    onAlienDefeated(a) {
        const g = this.game;
        g.stats.aliens++;
        const P = g.player;
        const pos = a.pos.clone();
        const wantHeart = P.health < P.maxHealth ? 0.4 : 0.12;
        const wantGren = P.grenades < PLAYER.maxGrenades ? 0.3 : 0.05;
        setTimeout(() => {
            if (g.level !== this) return;
            if (Math.random() < wantHeart) this.drops.spawn('heart', pos);
            if (Math.random() < wantGren) this.drops.spawn('grenade', pos);
        }, 850);
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
        this.boss.onPlayerRespawn();
        // the creature's helpers beam back out, so you get a fair fresh start
        if (this.boss.active) {
            for (const a of g.aliens.byZone[BOSS_ZONE]) {
                if (a.dead || a.dormant) continue;
                a.dead = a.gone = true;
                a.root.visible = false;
            }
        }
        g.player.spawn(cp.x, cp.z, cp.yaw);
        g.player.grenades = Math.max(g.player.grenades, PLAYER.grenades);
    }

    onGateBump() {
        if (this.bumpT > 0) return;
        this.bumpT = 4;
        const g = this.game;
        if (this.zone === BOSS_ZONE && !this.bossDown) g.hud.toast('The door is sealed! Beat the creature!', 3);
        else g.hud.toast('This door is locked! Beat all the aliens in this room.', 3);
        g.audio.play('shieldZap');
    }

    // The creature wakes up: the door slams shut behind you
    wakeBoss() {
        const g = this.game;
        g.world.closeGate(4);
        g.audio.play('doorSlam');
        if (!this.bossSeen) {
            this.bossSeen = true;
            this.save();
            g.startBossIntro(this.boss);
        } else {
            this.boss.startFight();
            g.hud.announce('ROUND 2!', this.boss.name);
        }
    }

    onBossDefeated() {
        const g = this.game;
        this.bossDown = true;
        // its helpers run away
        for (const a of g.aliens.byZone[BOSS_ZONE]) {
            if (!a.dead && !a.dormant) a.die();
        }
        g.aliens.clearZone(BOSS_ZONE);
        g.world.openGate(4);
        g.world.openGate(5);
        g.audio.play('gateDown', new THREE.Vector3(12, 3, -224));
        g.hud.announce('YOU BEAT GLORBAX!', 'THE CREATURE IS DOWN');
        const c = this.boss.center;
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            this.drops.spawn(i % 2 ? 'grenade' : 'heart', new THREE.Vector3(c.x + Math.cos(a) * 12, 1, c.z + Math.sin(a) * 12), 0.6);
        }
        setTimeout(() => {
            if (g.level !== this) return;
            g.hud.announce('WARNING! THE MOTHERSHIP IS FALLING APART!', 'GET TO THE ESCAPE POD!');
            g.audio.alarm(true);
            this.alarmOn = true;
        }, 3200);
        this.save();
    }

    // --------------------------------------------------------
    // Objective text
    // --------------------------------------------------------
    objectiveText() {
        const g = this.game;
        const z = this.zone;
        if (this.launching) return 'Blast off!';
        if (z >= POD_ZONE) return 'Climb into the <b>ESCAPE POD</b> and press <b>E</b>!';
        if (z === BOSS_ZONE) {
            if (this.bossDown) return 'HURRY! Run through the door to the <b>ESCAPE POD</b>!';
            if (this.boss.state === 'dying') return 'Whoa! <b>GLORBAX</b> is going down!';
            if (this.boss.active) return 'Defeat <b>GLORBAX</b>! Shoot its big <b>EYE</b>!';
            return 'Something BIG is down in that pit...';
        }
        if (this.cleared[z]) {
            const next = ROOMS[z + 1];
            return `Door unlocked! Head to the <b>${next.name}</b>.`;
        }
        const w = this.wave[z];
        const waves = g.aliens.waveCount(z);
        const alive = g.aliens.aliveInWave(z, w);
        if (z === 0 && w === 0 && g.time - this.zoneTimer < 10 && alive === 3) return 'You\'re inside the alien MOTHERSHIP! Find an escape pod to get home!';
        if (this.waveT[z] >= 0) return 'Get ready... <b>MORE ALIENS ARE BEAMING IN!</b>';
        const label = waves > 1 ? `Wave ${w + 1} of ${waves} &mdash; ` : '';
        return `${label}Beat the aliens to unlock the door! <b>(${alive} left)</b>`;
    }

    // --------------------------------------------------------
    // Per-frame
    // --------------------------------------------------------
    update(dt) {
        const g = this.game;
        const P = g.player;
        const t = g.time;

        // ----- areas -----
        const z = this.currentZone();
        if (z !== this.zone) {
            this.zone = z;
            this.zoneTimer = t;
            if (z > this.maxZone) {
                this.maxZone = z;
                this.checkpoint = z;
                this.save();
            }
            g.hud.zoneBanner(ZONES[z].name);
            if (z === BOSS_ZONE && !this.bossDown && !this.boss.active) this.wakeBoss();
            if (z === POD_ZONE && !this.hints.pod) {
                this.hints.pod = true;
                g.hud.toast('There it is... an ESCAPE POD!', 3);
            }
        }
        for (let k = 0; k < ZONES.length; k++) {
            const want = Math.abs(k - z) <= 1;
            if (want !== g.aliens.activeZones.has(k)) g.aliens.setZoneActive(k, want);
        }

        // ----- waves: when one is beaten the next beams in, then the door opens -----
        for (let k = 0; k < BOSS_ZONE; k++) {
            if (this.cleared[k]) continue;
            const w = this.wave[k];
            if (g.aliens.aliveInWave(k, w) > 0) continue;
            const waves = g.aliens.waveCount(k);
            if (w + 1 < waves) {
                if (z !== k && z !== k - 1) continue; // the next wave waits until you're nearby
                if (this.waveT[k] < 0) {
                    this.waveT[k] = 2.2;
                    g.hud.announce(`WAVE ${w + 1} BEATEN!`, `WAVE ${w + 2}`);
                    g.audio.play('waveAlarm');
                }
                this.waveT[k] -= dt;
                if (this.waveT[k] <= 0) {
                    this.waveT[k] = -1;
                    this.wave[k] = w + 1;
                    g.aliens.startWave(k, w + 1);
                }
            } else {
                this.cleared[k] = true;
                g.world.openGate(k);
                const d = DOORS[k];
                g.audio.play('gateDown', new THREE.Vector3(d.x, 3, d.z));
                g.hud.announce('ALL CLEAR!', 'DOOR UNLOCKED');
                this.save();
            }
        }
        this.bumpT -= dt;

        // ----- the boss -----
        this.boss.update(dt);

        // ----- drops -----
        this.drops.update(dt);

        // ----- the escape pod -----
        const pd = Math.hypot(P.pos.x - POD.x, P.pos.z - POD.z);
        if (pd < 5 && !P.dead && !this.launching) {
            g.hud.prompt('E', 'Launch the escape pod!');
            if (g.frameInput.interact) {
                this.launching = true;
                g.hud.hidePrompt();
                g.startFinale();
            }
        } else {
            g.hud.hidePrompt();
        }

        // ----- compass: the next door, and the pod -----
        const d = this.nextDoor();
        if (d) g.hud.setCompassMarker('door', d.x, d.z, '#6ff0ff');
        else g.hud.clearCompassMarker('door');
        if (this.bossDown || z >= BOSS_ZONE) g.hud.setCompassMarker('pod', POD.x, POD.z, '#7dff9a');
        else g.hud.clearCompassMarker('pod');

        g.hud.objective(this.objectiveText());

        // ----- music -----
        const fighting = g.aliens.anyInCombat();
        if (fighting) this.combatT = 5;
        else this.combatT -= dt;
        let music = this.combatT > 0 ? 'shipCombat' : 'ship';
        if (this.boss.active) music = this.boss.phase >= 3 ? 'boss2Rage' : this.boss.phase === 2 ? 'boss2Mad' : 'boss2';
        else if (this.bossDown) music = 'shipCombat';
        g.audio.setMusic(music);

        // ----- hints -----
        if (!this.hints.waves && z === 0 && t - this.zoneTimer > 4) {
            this.hints.waves = true;
            g.hud.toast('Beat every wave of aliens to unlock the doors!', 4);
        }
    }
}
