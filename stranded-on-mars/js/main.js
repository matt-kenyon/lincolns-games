// ============================================================
// STRANDED ON MARS — a game by Lincoln Kenyon
// Main bootstrap + game state machine
// ============================================================

import * as THREE from 'three';
import { World } from './world.js';
import { Effects } from './effects.js';
import { shared } from './toon.js';
import { Player } from './player.js';
import { AlienManager } from './aliens.js';
import { Combat } from './combat.js';
import { Level } from './level.js';
import { Mothership } from './mothership.js';
import { ShipLevel } from './shiplevel.js';
import { ZONES as SHIP_ZONES } from './shiplayout.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Cinematics } from './cinematics.js';
import { DIFFICULTY } from './config.js';
import { pathPointAt, SHIP, PART_ORDER, ZONES, GATES } from './layout.js';
import { partSlotWorld } from './ship.js';
import { clamp, damp, lerp, easeInOut } from './util.js';
import { loadSettings, saveSettings, mountSettings } from './settings.js';

const $ = (id) => document.getElementById(id);
const _tp = new THREE.Vector3();
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

class Game {
    constructor() {
        this.canvas = $('game');
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        this.pixelRatio = params.get('quality') === 'low' ? 0.6 : this.maxPixelRatio;
        this.fixedQuality = params.has('quality');
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.25, 4500);
        this.scene.add(this.camera);
        this.settings = loadSettings();
        this.diffKey = this.settings.difficulty;
        this.diff = DIFFICULTY[this.diffKey] || DIFFICULTY.normal;
        this.stats = { aliens: 0, deaths: 0, shots: 0, time: 0 };
        this.state = 'loading';
        this.time = 0;
        this.stateT = 0;
        this.sunView = new THREE.Vector3();
        this.frameInput = {};
        this.perf = { acc: 0, n: 0, t: 0 };
        this.titleS = 30;
    }

    async boot() {
        const bar = $('loadfill'), txt = $('loadtext');
        const progress = (p, msg) => {
            bar.style.width = Math.round(p * 100) + '%';
            if (msg) txt.textContent = msg;
        };
        progress(0.02, 'Warming up the rockets...');
        await nextFrame();
        this.audio = new AudioEngine();
        this.audio.volume = this.settings.volume;
        this.audio.musicVolume = this.settings.music;
        this.audio.classicMusic = this.settings.classicMusic;
        this.input = new Input(this.canvas);
        this.effects = new Effects(this.scene);
        this.hud = new HUD(this);
        this.world = new World(this);
        await nextFrame();
        this.world.build(progress);
        await nextFrame();
        progress(0.9, 'Waking up the aliens...');
        this.aliens = new AlienManager(this, ZONES);
        this.aliens.build();
        this.combat = new Combat(this);
        this.player = new Player(this);
        this.level = new Level(this);
        this.level.build();
        this.stages = { mars: this.captureStage('mars') };
        this.stage = this.stages.mars;
        this.cine = new Cinematics(this);
        this.hud.buildMinimap();
        await nextFrame();
        progress(0.97, 'Compiling shaders...');
        // warm up shaders so the first real frame doesn't hitch
        this.renderer.compile(this.scene, this.camera);
        await nextFrame();
        progress(1, 'Ready!');
        this.bindUI();
        this.input.onLockChange = (locked) => this.onLockChange(locked);
        window.addEventListener('resize', () => this.resize());
        this.resize();
        $('screen-loading').classList.add('hidden');
        this.toTitle();
        this.last = performance.now();
        requestAnimationFrame((t) => this.frame(t));
        window.__ready = true;
    }

    // --------------------------------------------------------
    // UI wiring
    // --------------------------------------------------------
    bindUI() {
        const save = Level.loadSave();
        $('btn-continue').classList.toggle('hidden', !save);
        if (save && save.stage === 2) {
            $('btn-continue').textContent = 'CONTINUE: LEVEL 2';
            $('howto-tip').textContent = 'Aboard the alien mothership: beat every wave of aliens to unlock the doors, '
                + 'find the escape pod... and if something BIG shows up, shoot its EYE!';
        }
        const diffs = document.querySelectorAll('.diff');
        const setDiff = (d) => {
            this.settings.difficulty = d;
            diffs.forEach((b) => b.classList.toggle('on', b.dataset.d === d));
            saveSettings(this.settings);
        };
        setDiff(this.settings.difficulty);
        diffs.forEach((b) => b.addEventListener('click', () => {
            setDiff(b.dataset.d);
            this.audio.init();
            this.audio.play('uiMove');
        }));
        // Chapter select: click a chapter to start it (or pick one with arrows / d-pad + Enter / A)
        this.titleChapter = 1;
        this.titleStick = 0;
        document.querySelectorAll('.chapter').forEach((b) => {
            const n = +b.dataset.ch;
            b.addEventListener('click', () => this.startChapter(n));
            b.addEventListener('pointerenter', () => this.selectChapter(n));
            b.addEventListener('focus', () => this.selectChapter(n));
        });
        $('btn-continue').addEventListener('click', () => this.continueGame());
        $('btn-howto').addEventListener('click', () => {
            this.audio.init();
            this.audio.play('uiSelect');
            $('screen-howto').classList.remove('hidden');
        });
        $('btn-howto-close').addEventListener('click', () => $('screen-howto').classList.add('hidden'));
        $('btn-settings').addEventListener('click', () => {
            this.audio.init();
            this.audio.play('uiSelect');
            $('screen-settings').classList.remove('hidden');
        });
        $('btn-settings-done').addEventListener('click', () => $('screen-settings').classList.add('hidden'));
        $('btn-resume').addEventListener('click', () => this.resume());
        $('click-resume').addEventListener('click', () => this.resume());
        $('btn-checkpoint').addEventListener('click', () => {
            this.hidePause();
            this.level.respawn();
            this.resume();
        });
        $('btn-quit').addEventListener('click', () => {
            location.href = location.pathname + (DEBUG ? '?debug' : '');
        });
        $('btn-again').addEventListener('click', () => {
            location.href = location.pathname + (DEBUG ? '?debug' : '');
        });
        // Sensitivity + sound settings (title SETTINGS screen and pause menu share them)
        const onSetting = (key, value) => {
            if (key === 'volume') this.audio.setVolume(value);
            if (key === 'music') this.audio.setMusicVolume(value);
            if (key === 'classicMusic') this.audio.setClassicMusic(value);
        };
        mountSettings($('settings-title'), this.settings, onSetting);
        mountSettings($('settings-pause'), this.settings, onSetting);
        // touch-only devices
        const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
        $('touch-notice').classList.toggle('hidden', !coarse);
        this.canvas.addEventListener('click', () => {
            if (this.state === 'play' && !this.input.locked && !this.input.usingGamepad) this.input.requestLock();
        });
        // Browsers only allow sound after you click or press a key: start the title music then
        const wake = () => {
            this.audio.init();
            if (this.state === 'title') {
                this.audio.setMusic('title');
                this.audio.setAmbient(0.5);
            }
            window.removeEventListener('pointerdown', wake);
            window.removeEventListener('keydown', wake);
        };
        window.addEventListener('pointerdown', wake);
        window.addEventListener('keydown', wake);
    }

    // --------------------------------------------------------
    // Stages: Mars (level 1) and the alien mothership (level 2). Each one has its
    // own scene, world, effects, aliens, bolts and level logic; switching swaps them.
    // --------------------------------------------------------
    captureStage(key) {
        return { key, scene: this.scene, world: this.world, effects: this.effects, aliens: this.aliens, combat: this.combat, level: this.level };
    }

    useStage(st) {
        this.stage = st;
        this.scene = st.scene;
        this.world = st.world;
        this.effects = st.effects;
        this.aliens = st.aliens;
        this.combat = st.combat;
        this.level = st.level;
        st.scene.add(this.camera);
    }

    // Build the mothership (once). It takes a moment, so it happens behind a dark screen.
    buildShipStage() {
        if (this.stages.ship) return this.stages.ship;
        this.audio.preloadStage('ship');
        const prev = this.stage;
        this.scene = new THREE.Scene();
        this.effects = new Effects(this.scene);
        this.world = new Mothership(this);
        this.world.build();
        this.aliens = new AlienManager(this, SHIP_ZONES);
        this.aliens.build();
        this.combat = new Combat(this);
        this.level = new ShipLevel(this);
        this.level.build();
        const st = this.captureStage('ship');
        this.stages.ship = st;
        // warm up the new shaders now so the first frames don't stutter
        this.useStage(st);
        this.renderer.compile(st.scene, this.camera);
        this.useStage(prev);
        return st;
    }

    enterShipStage() {
        this.useStage(this.buildShipStage());
        this.hud.buildMinimap();
        this.hud.showParts(false);
        this.hud.clearCompassMarkers();
        this.player.vm.setLighting(0xc2acff, 0x3a2456, 2.0);
        this.audio.setAmbience('ship');
    }

    resize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        if (this.cine) {
            this.cine.camera.aspect = w / h;
            this.cine.camera.updateProjectionMatrix();
        }
    }

    setState(s) {
        this.state = s;
        this.stateT = 0;
    }

    // --------------------------------------------------------
    // Flow
    // --------------------------------------------------------
    toTitle() {
        this.setState('title');
        $('screen-title').classList.remove('hidden');
        this.hud.show(false);
        this.camera.fov = 60;
        this.camera.updateProjectionMatrix();
    }

    applyDifficulty() {
        this.diffKey = this.settings.difficulty;
        this.diff = DIFFICULTY[this.diffKey] || DIFFICULTY.normal;
        for (const a of this.aliens.list) if (!a.dead) a.reset();
    }

    selectChapter(n) {
        if (n === this.titleChapter) return;
        this.titleChapter = n;
        document.querySelectorAll('.chapter').forEach((b) => b.classList.toggle('sel', +b.dataset.ch === n));
        if (this.audio.ctx) this.audio.play('uiMove');
    }

    // Chapter 1 = Mars from the very beginning. Chapter 2 = the mothership, starting from the
    // escape off Mars (ship fixed, liftoff, the capture...) and on into level 2.
    startChapter(n) {
        if (this.state !== 'title') return;
        if (n !== 2) return this.newGame();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        this.audio.init();
        this.audio.play('uiSelect');
        Level.clearSave();
        this.applyDifficulty();
        $('screen-title').classList.add('hidden');
        $('screen-howto').classList.add('hidden');
        $('screen-settings').classList.add('hidden');
        this.input.requestLock();
        this.setState('starting');
        // Mars is beaten: every area clear and all 5 parts back on the ship
        this.level.setBeaten();
        this.effects.clearParticles(); // (no leftover crash smoke)
        this.player.vm.visible = false;
        this.hud.show(false);
        // fade to black first (building the mothership takes a moment), then lift off
        this.cine.fadeTo(1, 0.3);
        setTimeout(() => this.startOutro(), 380);
    }

    newGame() {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        this.audio.init();
        this.audio.play('uiSelect');
        Level.clearSave();
        this.applyDifficulty();
        $('screen-title').classList.add('hidden');
        $('screen-howto').classList.add('hidden');
        this.input.requestLock();
        this.setState('intro');
        this.audio.setAmbient(0.5);
        this.cine.playIntro(() => this.startPlay(0, true));
    }

    continueGame() {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        const s = Level.loadSave();
        if (!s) return this.newGame();
        this.audio.init();
        this.audio.play('uiSelect');
        if (s.diff && DIFFICULTY[s.diff]) this.settings.difficulty = s.diff;
        this.applyDifficulty();
        $('screen-title').classList.add('hidden');
        this.input.requestLock();
        if (s.stage === 2) {
            // aboard the mothership
            this.cine.fadeTo(1, 0);
            this.enterShipStage();
        }
        this.level.applySave(s);
        this.startPlay(this.level.checkpoint, false);
    }

    startPlay(cp, fresh) {
        const c = this.level.checkpointAt(cp);
        this.player.spawn(c.x, c.z, c.yaw);
        this.player.locked = false;
        this.player.vm.visible = true;
        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
        this.hud.show(true);
        if (this.stage.key === 'mars') this.hud.setParts(this.level.have, this.level.installed);
        this.level.zone = this.level.currentZone();
        this.level.zoneTimer = this.time;
        this.setState('play');
        this.cine.fadeTo(0, 0.8);
        this.audio.setAmbient(0.9);
        this.audio.setMusic(this.level.exploreMusic);
        const [big, small] = this.level.startBanner(cp);
        setTimeout(() => this.hud.zoneBanner(big, small), 600);
        if (fresh) this.level.save();
        this.level.onStart();
        if (!this.input.locked && !this.input.usingGamepad) $('click-resume').classList.remove('hidden');
    }

    onLockChange(locked) {
        if (locked) {
            $('click-resume').classList.add('hidden');
            if (this.state === 'paused') this.hidePause();
            return;
        }
        if (this.state === 'play' && !this.input.usingGamepad) this.pause();
    }

    pause() {
        if (this.state !== 'play') return;
        this.setState('paused');
        $('click-resume').classList.add('hidden');
        $('screen-pause').classList.remove('hidden');
        this.input.exitLock();
        this.audio.heartbeat(false);
    }

    hidePause() {
        $('screen-pause').classList.add('hidden');
        if (this.state === 'paused') this.setState('play');
    }

    resume() {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        this.audio.init();
        this.hidePause();
        $('click-resume').classList.add('hidden');
        this.input.requestLock();
        setTimeout(() => {
            if (this.state === 'play' && !this.input.locked && !this.input.usingGamepad) $('click-resume').classList.remove('hidden');
        }, 700);
    }

    onAlienDefeated(a) {
        this.level.onAlienDefeated(a);
    }

    onGateBump() {
        this.level.onGateBump();
    }

    onPlayerDown() {
        this.setState('dead');
        this.level.onPlayerDown();
        this.audio.heartbeat(false);
        $('screen-dead').classList.remove('hidden');
        this.player.vm.visible = false;
    }

    // Rebuild the ship (pieces fly in one by one), then the ending
    startRepairSequence(level) {
        this.setState('repair');
        this.player.locked = true;
        this.player.vm.visible = false;
        this.hud.show(false);
        $('letterbox').classList.add('on');
        this.audio.setMusic('explore');
        const from = this.player.eyePos.clone();
        this.repair = {
            parts: PART_ORDER.filter((id) => !level.installed[id]),
            i: 0, t: 0, step: null, from, done: false, endT: 0,
        };
        this.repairCam = this.camera.position.clone();
    }

    updateRepair(dt) {
        const R = this.repair;
        R.t += dt;
        const ship = this.world.ship;
        const gy = this.world.groundAt(SHIP.x, SHIP.z);
        const ang = 0.9 + R.t * 0.18;
        const target = new THREE.Vector3(SHIP.x + Math.cos(ang) * 17, gy + 5.5, SHIP.z + Math.sin(ang) * 17);
        const k = Math.min(1, R.t / 1.5);
        this.camera.position.lerpVectors(this.repairCam, target, easeInOut(k));
        this.camera.lookAt(SHIP.x, gy + 1.5, SHIP.z);
        if (!R.done) {
            if (!R.step && R.t > 1.0 + R.i * 1.15) {
                if (R.i < R.parts.length) {
                    R.step = this.level.repairStep(R.parts[R.i], R.from);
                    R.stepT = 0;
                    this.audio.play('whoosh');
                } else {
                    R.done = true;
                    R.endT = R.t;
                    this.world.setShipRepaired();
                    ship.setEngines(1);
                    this.audio.play('powerUp');
                    this.hud.announce('ALL 5 PARTS INSTALLED!', 'SHIP REPAIRED!');
                    this.hud.el.classList.remove('hidden');
                    for (const id of ['vitals', 'compass', 'objective', 'parts', 'minimap-wrap', 'weapon', 'crosshair']) $(id).style.visibility = 'hidden';
                }
            }
            if (R.step) {
                R.stepT += dt;
                R.step.update(R.stepT / 0.9);
                if (R.stepT >= 0.9) {
                    R.step.finish();
                    R.step = null;
                    R.i++;
                }
            }
        } else {
            ship.setEngines(1, R.t);
            if (R.t - R.endT > 3.2 && !R.fading) {
                R.fading = true;
                this.cine.fadeTo(1, 0.7);
                setTimeout(() => this.startOutro(), 750);
            }
        }
    }

    startOutro() {
        for (const id of ['vitals', 'compass', 'objective', 'parts', 'minimap-wrap', 'weapon', 'crosshair']) $(id).style.visibility = '';
        this.hud.show(false);
        this.setState('outro');
        // Mars is beaten! From now on CONTINUE goes aboard the mothership.
        ShipLevel.saveStart(this);
        this.buildShipStage(); // (while the screen is dark)
        this.cine.playOutro(() => this.startLevel2());
    }

    // ---------------- Level 2: the alien mothership ----------------
    startLevel2() {
        if (this.stage.key !== 'ship') this.enterShipStage();
        this.world.setWreck(true);
        this.player.roll = 0;
        this.player.landDip = 0;
        this.startPlay(0, true);
    }

    startBossIntro(boss) {
        this.setState('cine');
        this.player.vm.visible = false;
        this.hud.show(false);
        this.audio.heartbeat(false);
        this.cine.playBossIntro(boss, () => {
            this.hud.show(true);
            this.player.vm.visible = true;
            this.setState('play');
            boss.startFight();
        });
    }

    startFinale() {
        this.setState('cine');
        this.player.vm.visible = false;
        this.hud.show(false);
        this.audio.heartbeat(false);
        this.audio.alarm(false);
        Level.clearSave();
        this.cine.playFinale(() => this.showEnd());
    }

    showEnd() {
        this.setState('end');
        this.input.exitLock();
        this.audio.engine(0);
        const s = this.stats;
        const mins = Math.floor(s.time / 60), secs = Math.floor(s.time % 60);
        $('end-stats').innerHTML = `
            <div>Aliens poofed</div><div class="v">${s.aliens}</div>
            <div>Ship parts found</div><div class="v">5 / 5</div>
            <div>Creature beaten</div><div class="v">GLORBAX</div>
            <div>Mission time</div><div class="v">${mins}:${String(secs).padStart(2, '0')}</div>
            <div>Knockouts</div><div class="v">${s.deaths}</div>
            <div>Difficulty</div><div class="v">${this.diff.label}</div>`;
        $('screen-end').classList.remove('hidden');
        this.cine.fadeTo(0, 1.2);
    }

    // --------------------------------------------------------
    // Main loop
    // --------------------------------------------------------
    frame(now) {
        requestAnimationFrame((t) => this.frame(t));
        let dt = (now - this.last) / 1000;
        this.last = now;
        if (dt > 0.05) dt = 0.05;
        if (dt <= 0) dt = 0.0001;
        this.stateT += dt;
        shared.uTime.value += dt;
        const inp = this.input.poll(dt);
        this.frameInput = inp;

        if (this.input.wasPressed('KeyM')) {
            const m = this.audio.toggleMute();
            if (this.hud && this.state === 'play') this.hud.toast(m ? 'Sound OFF (M)' : 'Sound ON (M)', 1.2);
        }
        if (DEBUG) this.debugKeys();

        switch (this.state) {
            case 'title': this.updateTitle(dt, inp); break;
            case 'intro':
            case 'outro':
            case 'cine': this.updateCinematic(dt, inp); break;
            case 'play': this.updatePlay(dt, inp); break;
            case 'paused':
                if (this.input.padWasPressed(9) || this.input.padWasPressed(0) || this.input.wasPressed('Enter')) this.resume();
                this.renderWorld(true);
                break;
            case 'dead': this.updateDead(dt); break;
            case 'repair':
                this.updateRepair(dt);
                this.world.update(dt, this.camera, this.world.ship.root.position);
                this.effects.update(dt);
                this.renderWorld(false);
                break;
            case 'end':
                if (this.input.padWasPressed(0) || this.input.padWasPressed(9)) $('btn-again').click();
                this.cine.update(0);
                this.renderCine();
                break;
        }
        this.input.endFrame();
        this.adaptQuality(dt);
    }

    updateTitle(dt, inp) {
        // slow, dreamy flyover of the canyon
        this.titleS += dt * 3.2;
        if (this.titleS > 330) this.titleS = 30;
        const p = pathPointAt(this.titleS);
        const a = pathPointAt(this.titleS + 45);
        const gy = this.world.groundAt(p.x, p.z);
        this.camera.position.set(p.x, gy + 13 + Math.sin(this.titleS * 0.05) * 2, p.z);
        this.camera.lookAt(a.x, this.world.groundAt(a.x, a.z) + 7, a.z);
        this.world.update(dt, this.camera, this.camera.position);
        this.effects.update(dt);
        this.renderWorld(false);
        const menuOpen = !$('screen-howto').classList.contains('hidden') || !$('screen-settings').classList.contains('hidden');
        if (!menuOpen) {
            // pick a chapter: left/right arrows, A/D, the d-pad or a flick of the left stick
            const I = this.input;
            const sx = inp.moveX;
            if (I.anyPressed('ArrowLeft', 'KeyA') || I.padWasPressed(14) || (sx < -0.6 && this.titleStick >= -0.6)) this.selectChapter(1);
            if (I.anyPressed('ArrowRight', 'KeyD') || I.padWasPressed(15) || (sx > 0.6 && this.titleStick <= 0.6)) this.selectChapter(2);
            this.titleStick = sx;
        }
        if (inp.confirm && !menuOpen && this.stateT > 0.5) this.startChapter(this.titleChapter);
    }

    updateCinematic(dt, inp) {
        if (inp.skip && this.stateT > 0.6) this.cine.skip();
        this.cine.update(dt);
        if (this.state !== 'intro' && this.state !== 'outro' && this.state !== 'cine') return; // finished during update
        if (this.cine.worldShot) {
            this.world.update(dt, this.cine.camera, this.cine.focus);
            this.effects.update(dt);
        }
        this.renderCine();
    }

    // A dramatic slow-motion moment (the boss going down)
    slowMo(dur, scale) {
        this.slowT = dur;
        this.slowScale = scale;
    }

    updatePlay(dt, inp) {
        if (inp.pause) {
            this.pause();
            this.renderWorld(true);
            return;
        }
        if (this.slowT > 0) {
            this.slowT -= dt;
            dt *= this.slowScale;
        }
        this.time += dt;
        this.stats.time += dt;
        const P = this.player;
        P.update(dt, inp);
        this.aliens.update(dt);
        this.combat.update(dt);
        this.level.update(dt);
        P.updateCamera(this.camera, dt);
        this.world.update(dt, this.camera, P.pos);
        this.effects.update(dt);
        this.hud.update(dt);
        this.audio.setListener(this.camera.position, P.yaw);
        this.audio.heartbeat(P.health <= 2 && !P.dead);
        this.renderWorld(true);
    }

    updateDead(dt) {
        const P = this.player;
        this.aliens.update(dt);
        this.combat.update(dt);
        this.effects.update(dt);
        P.pitch = damp(P.pitch, -0.25, 2, dt);
        P.roll = damp(P.roll, 0.5, 2, dt);
        P.landDip = damp(P.landDip, 1.1, 2, dt);
        P.updateCamera(this.camera, dt);
        this.world.update(dt, this.camera, P.pos);
        this.hud.update(dt);
        this.renderWorld(false);
        if (this.stateT > 2.8 && !this.respawning) {
            this.respawning = true;
            this.cine.fadeTo(1, 0.4);
            setTimeout(() => {
                $('screen-dead').classList.add('hidden');
                this.level.respawn();
                this.player.roll = 0;
                this.player.landDip = 0;
                this.player.vm.visible = true;
                this.setState('play');
                this.respawning = false;
                this.cine.fadeTo(0, 0.6);
                this.hud.zoneBanner(this.level.zoneName(this.level.checkpoint), 'CHECKPOINT');
            }, 450);
        }
    }

    // --------------------------------------------------------
    // Rendering
    // --------------------------------------------------------
    updateSunView(cam) {
        cam.updateMatrixWorld();
        this.sunView.copy(this.world.sunDir).transformDirection(cam.matrixWorldInverse);
        shared.uSunDirView.value.copy(this.sunView);
    }

    renderWorld(withViewModel) {
        const r = this.renderer;
        this.updateSunView(this.camera);
        r.autoClear = true;
        r.render(this.scene, this.camera);
        if (withViewModel && this.player.vm.visible) {
            r.autoClear = false;
            r.clearDepth();
            this.player.vm.syncSun(this.sunView);
            r.render(this.player.vm.scene, this.player.vm.camera);
            r.autoClear = true;
        }
    }

    renderCine() {
        const c = this.cine;
        this.updateSunView(c.camera);
        this.renderer.render(c.scene || this.scene, c.camera);
    }

    // Lower the resolution on slow computers (keeps it smooth on Chromebooks)
    adaptQuality(dt) {
        if (this.fixedQuality || this.state === 'loading') return;
        const P = this.perf;
        P.acc += dt;
        P.n++;
        P.t += dt;
        if (P.t < 2) return;
        const avg = P.acc / P.n;
        P.acc = 0; P.n = 0; P.t = 0;
        let changed = false;
        if (avg > 0.024 && this.pixelRatio > 0.6) {
            this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.15);
            changed = true;
        } else if (avg > 0.03 && this.pixelRatio <= 0.6 && this.renderer.shadowMap.enabled) {
            this.renderer.shadowMap.enabled = false;
            this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
        } else if (avg < 0.0145 && this.pixelRatio < this.maxPixelRatio) {
            this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
            changed = true;
        }
        if (changed) {
            this.renderer.setPixelRatio(this.pixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    // --------------------------------------------------------
    // Debug helpers (?debug in the URL)
    // --------------------------------------------------------
    debugKeys() {
        const i = this.input;
        if (i.wasPressed('Digit1')) this.debug.teleport(0);
        if (i.wasPressed('Digit2')) this.debug.teleport(1);
        if (i.wasPressed('Digit3')) this.debug.teleport(2);
        if (i.wasPressed('Digit4')) this.debug.teleport(3);
        if (i.wasPressed('Digit5')) this.debug.teleport(4);
        if (i.wasPressed('KeyK')) this.debug.killZone();
        if (i.wasPressed('KeyI')) { this.player.god = !this.player.god; this.hud.toast('God mode ' + (this.player.god ? 'ON' : 'OFF')); }
        if (i.wasPressed('KeyL')) this.debug.allParts();
        if (i.wasPressed('Digit9')) this.debug.stage2();
        if (i.wasPressed('Digit0')) this.debug.stage2(5);
        if (i.wasPressed('KeyM')) {
            if (i.keys.has('ShiftLeft') || i.keys.has('ShiftRight')) {
                // hold one music mode, to hear a song's layers without fighting
                const list = this.stage.key === 'ship' ? [null, 'ship', 'shipCombat', 'boss2'] : [null, 'explore', 'combat', 'boss'];
                const next = list[(list.indexOf(this.audio.forceMode) + 1) % list.length];
                this.audio.forceMusicMode(next);
                this.hud.toast('Music mode: ' + (next || 'automatic'));
            } else {
                this.hud.toast('Music: ' + this.audio.cycleMusicSet());
            }
        }
        if (i.wasPressed('KeyN')) {
            this.audio.setClassicSfx(!this.audio.classicSfx);
            this.hud.toast('Sound effects: ' + (this.audio.classicSfx ? 'classic (synthesized)' : 'new (recorded)'));
        }
    }

    get debug() {
        const g = this;
        return {
            teleport(cp) {
                const c = g.level.checkpointAt(cp);
                g.player.spawn(c.x, c.z, c.yaw);
                g.level.checkpoint = Math.max(g.level.checkpoint, cp);
            },
            killZone(z = g.level.zone) {
                for (const a of g.aliens.byZone[z]) if (!a.dead) { a.root.visible = true; a.die(); }
            },
            openAll() {
                for (let k = 0; k < GATES.length; k++) { g.world.openGate(k, true); g.aliens.clearZone(k); }
                g.world.dropDome(true);
                g.aliens.clearZone(4);
            },
            allParts() {
                for (const id of PART_ORDER) {
                    g.level.have[id] = true;
                    if (g.level.partPickups[id]) g.level.removePickup(g.level.partPickups[id]);
                }
                g.hud.setParts(g.level.have, g.level.installed);
            },
            skipIntro() {
                if (g.state === 'intro') g.cine.skip();
            },
            // Jump straight into level 2 (at checkpoint cp)
            stage2(cp = 0) {
                if (g.cine.shots) g.cine.skip();
                $('screen-title').classList.add('hidden');
                $('screen-dead').classList.add('hidden');
                g.enterShipStage();
                // pretend everything before this checkpoint is done
                g.level.applySave({ cp, cleared: [0, 1, 2, 3].map((k) => k < cp), bossSeen: cp >= 5, boss: cp >= 5, stats: g.stats });
                g.world.setWreck(true);
                g.startPlay(cp, false);
            },
            // fast-forward the running cutscene to shot n (+ seconds into it)
            cineShot(n, into = 0) {
                const c = g.cine;
                let guard = 0;
                while (c.shots && !c.done && (c.idx < n || (c.idx === n && c.t < into)) && guard++ < 20000) {
                    c.update(0.05);
                    if (c.worldShot) { g.world.update(0.05, c.camera, c.focus); g.effects.update(0.05); }
                }
                return { idx: c.idx, t: c.t };
            },
            look(yaw, pitch) {
                g.player.yaw = yaw;
                g.player.pitch = pitch;
            },
            // Run gameplay for N seconds without rendering (for automated tests)
            simulate(seconds, inp = {}, track = null) {
                const dt = 1 / 30;
                const base = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, padLookX: 0, padLookY: 0, jump: false, sprint: false, fire: false, grenade: false, grenadePressed: false, interact: false, pause: false, confirm: false, skip: false };
                let maxY = -1e9;
                for (let t = 0; t < seconds; t += dt) {
                    const i = Object.assign({}, base, inp);
                    if (inp.jumpEvery) i.jump = Math.floor(t / inp.jumpEvery) !== Math.floor((t - dt) / inp.jumpEvery);
                    if (track) {
                        const a = g.aliens.list.find((x) => !x.dead && !x.dormant && x.root.visible && x.zone === g.level.zone);
                        const B = g.aliens.boss;
                        const p = a ? _tp.set(a.pos.x, a.pos.y + 1.1, a.pos.z) : B && B.targetable() ? _tp.copy(B.pos) : null;
                        if (p) {
                            const dx = p.x - g.player.pos.x, dz = p.z - g.player.pos.z;
                            g.player.yaw = Math.atan2(-dx, -dz);
                            g.player.pitch = Math.atan2(p.y - g.player.eyePos.y, Math.hypot(dx, dz));
                        }
                    }
                    g.frameInput = i;
                    g.time += dt;
                    g.stats.time += dt;
                    g.player.update(dt, i);
                    g.aliens.update(dt);
                    g.combat.update(dt);
                    g.level.update(dt);
                    g.player.updateCamera(g.camera, dt);
                    g.world.update(dt, g.camera, g.player.pos);
                    g.effects.update(dt);
                    g.hud.update(dt);
                    maxY = Math.max(maxY, g.player.pos.y);
                    if (g.state !== 'play') break;
                }
                const P = g.player;
                return {
                    state: g.state, pos: P.pos.toArray().map((v) => +v.toFixed(1)), maxY: +maxY.toFixed(2),
                    hp: P.health, shield: +P.shield.toFixed(1), heat: +P.heat.toFixed(2), gren: P.grenades,
                    zone: g.level.zone, stats: { ...g.stats, time: +g.stats.time.toFixed(1) },
                };
            },
        };
    }
}

const game = new Game();
window.game = game;
game.boot().catch((e) => {
    console.error(e);
    $('loadtext').textContent = 'Oops! Something went wrong: ' + e.message;
});
