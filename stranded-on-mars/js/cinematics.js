// ============================================================
// CINEMATICS — the intro "pre-show" and the ending
// Each cutscene is a list of shots: { dur, start(), update(t, dt) }
// Press Enter / Space / Esc to skip.
// ============================================================

import * as THREE from 'three';
import { buildShip } from './ship.js';
import { createAlienModel } from './aliens.js';
import { Effects } from './effects.js';
import {
    createAstronaut, createSeat, createParachute, createPlanet, createStars, createNebula, createFlag,
} from './models.js';
import { createMothership, createTractorBeam, createCockpit, createEscapePod } from './shipmodels.js';
import { SHIP, START } from './layout.js';
import { GeoBuilder, toonMaterial, glowSprite } from './toon.js';
import { captureShots, bossIntroShots, finaleShots, buildMoonBase } from './cutscenes2.js';
import { clamp, lerp, easeInOut, easeOut, easeIn, rand, makeRng, perlin2, fbm2, damp } from './util.js';

const $ = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _bp = new THREE.Vector3();
const _bt = new THREE.Vector3();
const _sl = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

function bezier(p0, p1, p2, p3, u, out) {
    const a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
    return out.set(
        p0.x * a + p1.x * b + p2.x * c + p3.x * d,
        p0.y * a + p1.y * b + p2.y * c + p3.y * d,
        p0.z * a + p1.z * b + p2.z * c + p3.z * d,
    );
}

// Point an object's nose (-Z) along a direction
function aimNose(obj, dir) {
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0));
    obj.quaternion.setFromRotationMatrix(m);
}

export class Cinematics {
    constructor(game) {
        this.game = game;
        this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 6000);
        this.space = null;
        this.shots = null;
        this.capText = '';
        this.capShown = 0;
        this.capEl = $('caption');
        this.worldShot = false;
        this.focus = new THREE.Vector3();
        this.lastPos = new THREE.Vector3();  // the camera's last pose (before shake)
        this.lastLook = new THREE.Vector3();
        this.fromPos = new THREE.Vector3();  // ...and where the previous shot left it (see `blend`)
        this.fromLook = new THREE.Vector3();
        this.shake = 0;
        this.actors = [];
    }

    // --------------------------------------------------------
    // Shader warm-up. The first time three.js draws a new kind of material in a scene it compiles a
    // shader, and the GPU finishes linking it when it's first used: a long frame (up to ~0.4s on a
    // Mac) in the middle of a shot. So compile everything the cutscenes will show up front, behind
    // the loading screen or a black screen: the scene itself plus throwaway copies of the props that
    // shots add later (compiled with that scene's lights; the shaders stay cached).
    // --------------------------------------------------------
    warm(scene, props = []) {
        const r = this.game.renderer;
        r.compile(scene, this.camera);
        if (props.length) {
            const tmp = new THREE.Group();
            for (const p of props) tmp.add(p.root || p);
            r.compile(tmp, this.camera, scene);
        }
        for (const p of r.info.programs) p.getUniforms(); // wait for the GPU to link them now, not mid-shot
    }

    // At boot: Mars with the intro's props, and the space scene with everything the cutscenes fly through
    warmUp() {
        const g = this.game;
        this.buildSpace();
        const flare = () => { // the big explosion glows ignore fog
            const s = glowSprite(0xffc070, 1, 1);
            s.material.fog = false;
            return s;
        };
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xa8faff }));
        this.warm(g.scene, [buildShip(), createAstronaut(), createSeat(), createParachute(), createAlienModel('captain'), orb, flare()]);
        const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.warm(this.space, [buildShip(), createMothership(), createTractorBeam(), createCockpit(), createSeat(), createAstronaut(), createEscapePod(), createFlag('LINCOLN'), fire, flare()]);
    }

    // When the mothership level is built (behind a black screen): the hangar's props
    warmShip(scene) {
        this.warm(scene, [buildShip(), createTractorBeam(), createAstronaut(), createSeat()]);
    }

    // --------------------------------------------------------
    // Space scene (built once)
    // --------------------------------------------------------
    buildSpace() {
        if (this.space) return;
        const s = (this.space = new THREE.Scene());
        this.skyGroup = new THREE.Group();
        this.skyGroup.add(createNebula());
        this.stars = createStars();
        this.skyGroup.add(this.stars);
        s.add(this.skyGroup);
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.5);
        sun.position.set(80, 40, 60);
        s.add(sun);
        this.sun = sun;
        this.sunHome = sun.position.clone();
        // spare lights for the level 2 cutscenes (tractor beam green, alarm red). They're always
        // in the scene (just switched off) so turning them on doesn't make the shaders rebuild.
        this.greenLight = new THREE.PointLight(0x7dff9a, 0, 70, 1.2);
        this.redLight = new THREE.PointLight(0xff3030, 0, 9, 1.5);
        s.add(this.greenLight, this.redLight);
        s.add(new THREE.HemisphereLight(0x8a9ad0, 0x2a1830, 0.75));
        this.sunGlow = glowSprite(0xfff0c8, 260, 0.9);
        this.sunGlow.position.set(1200, 600, 900);
        s.add(this.sunGlow);
        this.earth = createPlanet('earth', 40);
        this.moon = createPlanet('moon', 11);
        this.mars = createPlanet('mars', 30);
        s.add(this.earth, this.moon, this.mars);
        this.sfx = new Effects(s);

        // Moon surface for the ending
        const mb = (this.moonBase = new THREE.Group());
        const g = new THREE.PlaneGeometry(500, 500, 160, 160);
        g.rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        const cols = [];
        const c = new THREE.Color();
        const rng = makeRng(4);
        const craters = Array.from({ length: 40 }, () => [rng.range(-200, 200), rng.range(-240, 80), rng.range(4, 26)]);
        craters.push([14, -36, 9], [-16, -8, 6]);
        this.moonH = (x, z) => {
            let h = fbm2(x * 0.02, z * 0.02, 3) * 2.2;
            for (const [cx, cz, r] of craters) {
                const d = Math.hypot(x - cx, z - cz) / r;
                if (d < 1.6) h += (d < 1 ? -0.35 * r * (1 - d * d) : 0) + 0.12 * r * Math.exp(-(((d - 1) / 0.22) ** 2));
            }
            // flatten the landing zone and the walk to the flag
            const lz = Math.hypot(x, z + 16) < 16 ? 1 - Math.hypot(x, z + 16) / 16 : 0;
            return h * (1 - Math.min(1, lz * 1.6));
        };
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), z = p.getZ(i);
            const h = this.moonH(x, z);
            p.setY(i, h);
            const v = 0.62 + perlin2(x * 0.08, z * 0.08) * 0.08 + h * 0.01;
            c.setRGB(v, v * 0.98, v * 1.03);
            cols.push(c.r, c.g, c.b);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        g.computeVertexNormals();
        const ground = new THREE.Mesh(g, toonMaterial({ vertexColors: true, paint: 0.2, cache: false }));
        mb.add(ground);
        this.moonEarth = createPlanet('earth', 34);
        this.moonEarth.position.set(-70, 95, -280);
        mb.add(this.moonEarth);
        mb.visible = false;
        s.add(mb);
        buildMoonBase(this);
    }

    // --------------------------------------------------------
    // Runner
    // --------------------------------------------------------
    run(shots, onDone, finalize) {
        this.shots = shots;
        this.idx = -1;
        this.onDone = onDone;
        this.finalize = finalize;
        this.done = false;
        $('letterbox').classList.add('on');
        $('skip-hint').classList.remove('hidden');
        this.next();
    }

    next() {
        this.idx++;
        if (this.idx >= this.shots.length) return this.finish();
        this.t = 0;
        const shot = this.shots[this.idx];
        // remember where the last shot left the camera (relative to `anchor`, if the shot follows something)
        this.fromPos.copy(this.lastPos);
        this.fromLook.copy(this.lastLook);
        if (shot.anchor) {
            this.fromPos.sub(shot.anchor());
            this.fromLook.sub(shot.anchor());
        }
        this.worldShot = !!shot.world;
        this.camera.fov = shot.fov || 55;
        this.camera.updateProjectionMatrix();
        shot.start && shot.start();
    }

    skip() {
        if (this.done || !this.shots) return;
        this.finish();
    }

    finish() {
        if (this.done) return;
        this.done = true;
        this.caption('');
        $('letterbox').classList.remove('on');
        $('skip-hint').classList.add('hidden');
        $('alarm-flash').classList.remove('on');
        $('title-card').classList.remove('on');
        $('level-card').classList.remove('on');
        $('boss-card').classList.remove('on');
        this.game.audio.alarm(false);
        this.game.audio.engine(0);
        this.game.audio.stopSpeech();
        for (const a of this.actors) a.parent && a.parent.remove(a);
        this.actors = [];
        if (this.sfx) this.sfx.clearParticles();
        this.finalize && this.finalize();
        const cb = this.onDone;
        this.shots = null;
        cb && cb();
    }

    get scene() {
        return this.worldShot ? this.game.scene : this.space;
    }

    caption(text, cls = '', voice = null) {
        this.capText = text;
        this.capShown = 0;
        this.capEl.className = cls;
        this.capEl.textContent = '';
        if (voice) this.game.audio.say(voice);
    }

    flash(white = true, dur = 0.5) {
        const f = $('fade');
        f.classList.toggle('white', white);
        f.style.transition = 'none';
        f.style.opacity = '1';
        void f.offsetWidth;
        f.style.transition = `opacity ${dur}s`;
        f.style.opacity = '0';
    }

    fadeTo(opacity, dur = 0.6, white = false) {
        const f = $('fade');
        f.classList.toggle('white', white);
        f.style.transition = `opacity ${dur}s`;
        f.style.opacity = String(opacity);
    }

    addActor(obj, scene) {
        (scene || this.scene).add(obj);
        this.actors.push(obj);
        return obj;
    }

    // A shot with `blend: secs` eases in from where the previous shot left the camera, so a move that
    // carries on across two shots doesn't jump. With `anchor: () => vec`, that's measured relative to
    // something moving (the ship), so the camera keeps up with it while it blends.
    lookFrom(pos, target) {
        const sh = this.shots && this.shots[this.idx];
        if (sh && sh.blend && this.t < sh.blend) {
            const k = easeInOut(this.t / sh.blend);
            _bp.copy(this.fromPos);
            _bt.copy(this.fromLook);
            if (sh.anchor) {
                _bp.add(sh.anchor());
                _bt.add(sh.anchor());
            }
            pos = _bp.lerp(pos, k);
            target = _bt.lerp(target, k);
        }
        this.lastPos.copy(pos);
        this.lastLook.copy(target);
        this.camera.position.copy(pos);
        if (this.shake > 0) {
            this.camera.position.x += rand(-1, 1) * this.shake;
            this.camera.position.y += rand(-1, 1) * this.shake;
            this.camera.position.z += rand(-1, 1) * this.shake;
        }
        this.camera.lookAt(target);
        this.focus.copy(target);
    }

    speedLines(dt, rate = 60) {
        const cam = this.camera;
        const [fwd, right, up, p] = _sl;
        fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
        right.set(1, 0, 0).applyQuaternion(cam.quaternion);
        up.set(0, 1, 0).applyQuaternion(cam.quaternion);
        const n = Math.floor(rate * dt + Math.random());
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = rand(6, 22);
            p.copy(cam.position).addScaledVector(fwd, rand(40, 90)).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
            this.sfx.spawn({ x: p.x, y: p.y, z: p.z, vx: fwd.x * -160, vy: fwd.y * -160, vz: fwd.z * -160, life: 0.5, size: 0.12, color: 0xcfe8ff, alpha: 0.7, alpha1: 0, batch: 1, stretch: 0.04 });
        }
    }

    update(dt) {
        if (!this.shots || this.done) return;
        this.t += dt;
        const shot = this.shots[this.idx];
        shot.update && shot.update(this.t, dt);
        this.shake = Math.max(0, this.shake - dt * 0.8);
        if (this.boomSprite) {
            this.boomT += dt;
            const k = this.boomT;
            const sz = k < 0.25 ? k / 0.25 * 160 : 160 * Math.max(0, 1 - (k - 0.25) / 1.6);
            this.boomSprite.scale.set(sz, sz, 1);
            if (k > 2) { this.game.scene.remove(this.boomSprite); this.boomSprite = null; }
        }
        if (this.space) {
            this.skyGroup.position.copy(this.camera.position);
            this.sfx.update(dt);
        }
        // typewriter captions
        if (this.capShown < this.capText.length) {
            const before = Math.floor(this.capShown);
            this.capShown = Math.min(this.capText.length, this.capShown + dt * 38);
            const now = Math.floor(this.capShown);
            if (now > before) {
                this.capEl.textContent = this.capText.slice(0, now);
                if (this.capText[now - 1] !== ' ') this.game.audio.play('typing');
            }
        }
        if (this.t >= shot.dur) {
            this.next();
            // pose the new shot right away, or this frame would draw it from the old shot's camera
            const ns = this.shots && this.shots[this.idx];
            if (ns && ns.update) ns.update(0, 0);
        }
    }

    // A huge flash you can see from far away when the ship crashes
    crashFlash() {
        const g = this.game;
        const s = glowSprite(0xffc070, 1, 1);
        s.material.fog = false;
        s.position.set(SHIP.x, g.world.groundAt(SHIP.x, SHIP.z) + 25, SHIP.z);
        g.scene.add(s);
        this.boomSprite = s;
        this.boomT = 0;
        // mushroom cloud
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, r = rand(0, 12);
            g.effects.spawn({
                x: SHIP.x + Math.cos(a) * r, y: s.position.y - 20 + rand(0, 10), z: SHIP.z + Math.sin(a) * r,
                vx: Math.cos(a) * rand(2, 8), vy: rand(10, 22), vz: Math.sin(a) * rand(2, 8),
                life: rand(4, 7), size: rand(10, 18), size1: rand(30, 48),
                color: 0x5a4a4c, color1: 0xa89a9c, alpha: 0.95, alpha1: 0, drag: 0.6, batch: 2, fadeIn: 0.2,
            });
        }
    }

    // ========================================================
    // INTRO
    // ========================================================
    playIntro(onDone) {
        this.buildSpace();
        const g = this.game;
        const W = g.world;
        const A = g.audio;
        const sp = this.space;
        const cam = this.camera;
        const ship = buildShip();
        ship.setEngines(2);
        for (const id of Object.keys(ship.ghosts)) ship.setGhost(id, false);
        sp.add(ship.root);
        this.actors.push(ship.root);
        const shipVel = new THREE.Vector3();
        const tmp = new THREE.Vector3();
        let lost = [];

        // Mars-surface actors
        const fShip = buildShip();
        for (const id of ['tailFin', 'wing', 'fuelTank', 'thruster']) fShip.setPart(id, false);
        for (const id of Object.keys(fShip.ghosts)) fShip.setGhost(id, false);
        fShip.setEngines(1);
        const astro = createAstronaut();
        const seat = createSeat();
        const chute = createParachute();
        const P0 = V(-70, 90, 90), P1 = V(10, 75, -40), P2 = V(45, 65, -400);
        const gyShip = W.groundAt(SHIP.x, SHIP.z);
        const P3 = V(SHIP.x, gyShip + 3, SHIP.z);
        const FLY = 9.5;
        let flyT = 0;
        let ejected = false, chuteOpen = false, crashed = false, crashHeard = false;
        let lookUp = 1.5; // shot 8: how far above Lincoln the camera looks (it settles as he lands)
        const astroVel = new THREE.Vector3();
        const gyStart = W.groundAt(START.x, START.z);
        const aliens = [];

        // world starts "before the crash"
        const hideCrash = () => {
            W.ship.root.visible = false;
            for (const id of Object.keys(W.ship.ghosts)) W.ship.setGhost(id, false);
            W.smokeEmitter.on = false;
            W.fireEmitter.on = false;
            W.dome.mesh.material.uniforms.uOn.value = 0;
            W.alienFlag.visible = false;
            W.parachute.visible = false;
        };
        const flyShip = (dt) => {
            flyT += dt;
            const u = Math.min(1, Math.pow(flyT / FLY, 0.96));
            bezier(P0, P1, P2, P3, u, fShip.root.position);
            const u2 = Math.min(1, u + 0.01);
            bezier(P0, P1, P2, P3, u2, tmp);
            const dir = tmp.sub(fShip.root.position);
            if (dir.lengthSq() > 1e-6) aimNose(fShip.root, dir.normalize());
            fShip.root.rotateZ(Math.sin(flyT * 9) * 0.08);
            fShip.setEngines(1 + Math.random(), flyT);
            const p = fShip.root.position;
            if (u < 1) {
                g.effects.spawn({
                    x: p.x + rand(-0.5, 0.5), y: p.y, z: p.z + rand(-0.5, 0.5), vx: rand(-1, 1), vy: rand(0, 1), vz: rand(-1, 1),
                    life: 4, size: 1.6, size1: 7, color: 0x4a4048, color1: 0x9a8a90, alpha: 0.8, alpha1: 0, drag: 0.5, batch: 2,
                });
                g.effects.spawn({ x: p.x, y: p.y, z: p.z, life: 0.25, size: 3, size1: 1, color: 0xffb04a, alpha: 1, alpha1: 0, batch: 1 });
            }
            if (u >= 1 && !crashed) {
                crashed = true;
                fShip.root.visible = false;
                W.ship.root.visible = true;
                W.smokeEmitter.on = true;
                W.fireEmitter.on = true;
                g.effects.bigBoom(P3.x, P3.y, P3.z, 4);
                this.crashFlash();
            }
            // the boom arrives a moment later (it's really far away)
            if (crashed && !crashHeard && flyT > FLY + 0.9) {
                crashHeard = true;
                A.play('crash');
                this.shake = 0.5;
            }
        };
        const stepAstro = (dt) => {
            if (!ejected) return;
            if (!chuteOpen) {
                astroVel.y -= 14 * dt;
            } else {
                astroVel.y = damp(astroVel.y, -3.2, 3, dt);
                astroVel.x = damp(astroVel.x, 1.0, 1, dt);
                astroVel.z = damp(astroVel.z, -0.6, 1, dt);
            }
            astro.root.position.addScaledVector(astroVel, dt);
            chute.position.copy(astro.root.position);
            astro.root.rotation.z = Math.sin(this.t * 1.6) * 0.08;
            chute.rotation.z = astro.root.rotation.z;
            astro.float = 1;
            astro.animate(dt);
        };

        const shots = [
            // 1 — Heading to the Moon
            {
                dur: 6.5,
                start: () => {
                    A.setMusic('title');
                    this.earth.position.set(-30, -58, 10);
                    this.moon.position.set(70, 22, -300);
                    this.mars.visible = false;
                    this.earth.visible = this.moon.visible = true;
                    ship.root.position.set(0, 0, 8);
                    shipVel.copy(this.moon.position).sub(ship.root.position).normalize().multiplyScalar(7);
                    aimNose(ship.root, shipVel.clone().normalize());
                    this.caption('MISSION LOG: Flying to the Moon!', 'computer', 'Mission log. Flying to the Moon.');
                    A.engine(0.4);
                },
                update: (t, dt) => {
                    ship.root.position.addScaledVector(shipVel, dt);
                    ship.setEngines(2, t);
                    this.earth.rotation.y += dt * 0.02;
                    const sp0 = ship.root.position;
                    const off = V(-12 + t * 0.8, 4.5, 17 - t * 0.6);
                    this.lookFrom(sp0.clone().add(off), sp0.clone().addScaledVector(shipVel, 0.5));
                    this.speedLines(dt, 20);
                },
            },
            // 2 — Energy overload!
            {
                dur: 6,
                start: () => {
                    $('alarm-flash').classList.add('on');
                    A.alarm(true);
                    A.setMusic('intro');
                    this.caption('WARNING! ENERGY OVERLOAD!', 'alarm', 'Warning! Energy overload!');
                },
                update: (t, dt) => {
                    ship.root.position.addScaledVector(shipVel, dt * 0.6);
                    const flick = Math.random() < 0.5;
                    ship.coreGlow.material.color.set(flick ? 0xff3030 : 0xffffff);
                    ship.coreGlow.scale.setScalar(flick ? 4.5 : 3);
                    ship.setEngines(Math.random() < 0.3 ? 0.4 : 2, t);
                    const core = ship.body.localToWorld(V(0, 2.1, 1.4));
                    if (Math.random() < dt * 25) this.sfx.sparks(core.x, core.y, core.z, Math.random() < 0.5 ? 0xff6a3a : 0x9ff8ff, 6, 5, 0.12);
                    ship.root.rotation.z += rand(-1, 1) * 0.01;
                    const camPos = ship.body.localToWorld(V(3.2 - t * 0.15, 3.4, 6.5 - t * 0.2));
                    this.shake = 0.06;
                    this.lookFrom(camPos, core);
                },
            },
            // 3 — Our only hope is Mars
            {
                dur: 5.5,
                start: () => {
                    ship.coreGlow.material.color.set(0xff8040);
                    this.earth.visible = this.moon.visible = false;
                    this.mars.visible = true;
                    this.mars.position.set(30, -25, -260);
                    ship.root.position.set(0, 0, 0);
                    shipVel.set(0.08, -0.06, -1).normalize().multiplyScalar(14);
                    this.caption('The Moon is too far... our only hope is MARS!', 'computer', 'Rerouting to Mars.');
                    A.play('whoosh');
                },
                update: (t, dt) => {
                    ship.root.position.addScaledVector(shipVel, dt);
                    aimNose(ship.root, shipVel.clone().normalize());
                    ship.root.rotateZ(Math.sin(t * 1.4) * 0.6);
                    ship.setEngines(2 + Math.random() * 0.5, t);
                    this.mars.rotation.y += dt * 0.03;
                    const p = ship.root.position;
                    if (Math.random() < dt * 30) {
                        const back = ship.body.localToWorld(V(0, 1.8, 1.6));
                        this.sfx.spawn({ x: back.x, y: back.y, z: back.z, vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(2, 5), life: 1.5, size: 0.6, size1: 2.2, color: 0x5a5058, alpha: 0.8, alpha1: 0 });
                    }
                    this.lookFrom(V(p.x + 2.5, p.y + 2.2, p.z + 11 - t * 0.6), p.clone().add(V(0, -0.5, -8)));
                    this.speedLines(dt, 40);
                },
            },
            // 4 — Falling apart in the atmosphere
            {
                dur: 6.2,
                start: () => {
                    this.mars.visible = true;
                    this.mars.scale.setScalar(7);
                    this.mars.children[1].visible = false; // atmosphere shell would wash out the view
                    this.mars.position.set(0, -232, -60);
                    ship.root.position.set(0, 0, 0);
                    shipVel.set(0, -0.45, -1).normalize().multiplyScalar(16);
                    aimNose(ship.root, shipVel.clone().normalize());
                    this.caption('The ship is falling apart!!', 'alarm');
                    A.engine(0.9);
                    // fiery entry glow
                    const fire = new THREE.Mesh(
                        new THREE.SphereGeometry(1.9, 16, 12),
                        new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
                    );
                    fire.scale.set(1, 1, 2.2);
                    fire.position.set(0, 0, -4.5);
                    ship.body.add(fire);
                    this.entryFire = fire;
                    lost = [];
                },
                update: (t, dt) => {
                    ship.root.position.addScaledVector(shipVel, dt);
                    ship.root.rotation.z += Math.sin(t * 13) * 0.24 * dt;
                    this.entryFire.material.opacity = 0.35 + Math.random() * 0.25;
                    ship.setEngines(1 + Math.random(), t);
                    this.shake = 0.12;
                    const nose = ship.body.localToWorld(V(0, 0, -5));
                    if (Math.random() < dt * 40) this.sfx.spawn({ x: nose.x, y: nose.y, z: nose.z, vx: rand(-3, 3), vy: rand(-1, 3), vz: rand(6, 12), life: 0.6, size: 1.2, size1: 0.3, color: 0xffc070, color1: 0xff4a20, alpha: 1, alpha1: 0, batch: 1 });
                    // parts break off one at a time
                    const order = [['tailFin', 1.0], ['wing', 2.0], ['fuelTank', 2.9], ['thruster', 3.7]];
                    for (const [id, when] of order) {
                        if (t >= when && !lost.find((l) => l.id === id)) {
                            const part = ship.parts[id];
                            sp.attach(part);
                            const v = shipVel.clone().multiplyScalar(0.75).add(V(rand(-4, 4), rand(2, 6), rand(4, 8)));
                            lost.push({ id, part, v, spin: V(rand(-4, 4), rand(-4, 4), rand(-4, 4)) });
                            this.actors.push(part);
                            this.sfx.sparks(part.position.x, part.position.y, part.position.z, 0xffc070, 20, 8, 0.2);
                            A.play('clunk');
                            this.shake = 0.35;
                        }
                    }
                    for (const l of lost) {
                        l.part.position.addScaledVector(l.v, dt);
                        l.part.rotation.x += l.spin.x * dt;
                        l.part.rotation.y += l.spin.y * dt;
                        if (Math.random() < dt * 20) this.sfx.spawn({ x: l.part.position.x, y: l.part.position.y, z: l.part.position.z, life: 1, size: 0.6, size1: 1.8, color: 0x5a5058, alpha: 0.7, alpha1: 0 });
                    }
                    const p = ship.root.position;
                    this.lookFrom(V(p.x - 7, p.y + 2.5, p.z + 4), p.clone().add(V(0, -1, -3)));
                    if (t > 5.7 && !this.flashed) { this.flashed = true; this.fadeTo(1, 0.45, true); }
                },
            },
            // 5 — EJECT! (on Mars)
            {
                world: true,
                dur: 6.5,
                fov: 50,
                start: () => {
                    this.flashed = false;
                    this.fadeTo(0, 0.8, true);
                    A.engine(0.5);
                    A.alarm(false);
                    $('alarm-flash').classList.remove('on');
                    sp.remove(ship.root);
                    hideCrash();
                    this.addActor(fShip.root, g.scene);
                    flyT = 0;
                    flyShip(0);
                    this.caption('EJECT! EJECT!', 'alarm', 'Eject! Eject!');
                },
                update: (t, dt) => {
                    flyShip(dt);
                    if (!ejected && t > 1.6) {
                        ejected = true;
                        A.play('eject');
                        const p = fShip.root.position;
                        astro.root.position.copy(p).add(V(0, 1.5, 0));
                        seat.position.copy(astro.root.position);
                        this.addActor(astro.root, g.scene);
                        this.addActor(seat, g.scene);
                        astroVel.set(1.5, 14, 2);
                        g.effects.dust(p.x, p.y + 1, p.z, 10, 1, 0xdddddd, 1.2);
                        this.seatVel = V(-2, 8, 1);
                    }
                    if (ejected && !chuteOpen && t > 2.5) {
                        chuteOpen = true;
                        A.play('chute');
                        this.addActor(chute, g.scene);
                        this.chuteT = 0;
                    }
                    if (chuteOpen) {
                        this.chuteT += dt;
                        const k = Math.min(1, this.chuteT / 0.5);
                        chute.canopy.scale.setScalar(0.2 + 0.8 * (1 - Math.pow(1 - k, 3)) * (1 + Math.sin(k * 8) * 0.06 * (1 - k)));
                    }
                    if (ejected) {
                        this.seatVel.y -= 13 * dt;
                        seat.position.addScaledVector(this.seatVel, dt);
                        seat.rotation.x += dt * 2;
                        const gy = W.groundAt(seat.position.x, seat.position.z);
                        if (seat.position.y < gy) seat.visible = false;
                    }
                    stepAstro(dt);
                    const target = ejected ? astro.root.position.clone().lerp(fShip.root.position, clamp(1 - (t - 1.6) / 1.5, 0, 1)) : fShip.root.position;
                    this.lookFrom(V(-24, 26 + t * 2, 66), target);
                },
            },
            // 6 — The ship crashes far away
            {
                world: true,
                dur: 6.5,
                fov: 26,
                start: () => {
                    this.caption('Your ship crashed... really, REALLY far away.', '');
                },
                update: (t, dt) => {
                    flyShip(dt);
                    stepAstro(dt);
                    const a = astro.root.position;
                    const lookAt = crashed ? P3.clone().add(V(0, 20 + t * 4, 0)) : fShip.root.position.clone();
                    this.camLook = this.camLook || lookAt.clone();
                    this.camLook.lerp(lookAt, 1 - Math.exp(-4 * dt));
                    this.lookFrom(V(a.x - 3, a.y + 4, a.z + 9), this.camLook);
                    if (crashed) A.engine(0);
                },
            },
            // 7 — Meanwhile... aliens take the ship
            {
                world: true,
                dur: 7.5,
                fov: 50,
                start: () => {
                    this.camLook = null;
                    A.setMusic('combat');
                    W.ship.root.visible = true;
                    W.ship.setPart('powerCore', true);
                    const gy = gyShip;
                    const defs = [
                        ['trooper', V(12, 0, -630), V(22, 0, -641)],
                        ['major', V(55, 0, -640), V(41, 0, -645)],
                        ['scout', V(20, 0, -668), V(26, 0, -659)],
                        ['trooper', V(50, 0, -622), V(40, 0, -634)],
                    ];
                    for (const [type, from, to] of defs) {
                        const m = createAlienModel(type);
                        from.y = W.groundAt(from.x, from.z);
                        to.y = W.groundAt(to.x, to.z);
                        m.root.position.copy(from);
                        this.addActor(m.root, g.scene);
                        aliens.push({ m, from, to });
                    }
                    const cap = createAlienModel('captain');
                    const cpos = V(27, 0, -641);
                    cpos.y = W.groundAt(cpos.x, cpos.z);
                    cap.root.position.copy(cpos);
                    cap.root.rotation.y = Math.atan2(40 - 27, -626 - -641);
                    this.addActor(cap.root, g.scene);
                    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: 0xa8faff }));
                    orb.position.set(0, -0.42, 0.1);
                    orb.add(glowSprite(0x6ff0ff, 1.3, 0.95));
                    orb.visible = false;
                    cap.arms[0].el.add(orb);
                    this.capt = { m: cap, orb };
                    W.alienFlag.visible = true;
                    W.alienFlag.scale.setScalar(0.01);
                    this.caption('Meanwhile... ALIENS took over your ship!', '');
                    A.play('alienAlert', cpos);
                },
                update: (t, dt) => {
                    for (const a of aliens) {
                        const k = clamp(t / 2.2, 0, 1);
                        a.m.root.position.lerpVectors(a.from, a.to, easeOut(k));
                        a.m.root.position.y = W.groundAt(a.m.root.position.x, a.m.root.position.z);
                        const d = a.to.clone().sub(a.from);
                        a.m.root.rotation.y = k < 1 ? Math.atan2(d.x, d.z) : damp(a.m.root.rotation.y, Math.atan2(40 - a.to.x, -626 - a.to.z), 3, dt);
                        a.m.move = k < 1 ? 1 : 0;
                        if (t > 3.2) {
                            a.m.cheer = Math.min(1, (t - 3.2) * 3);
                            a.m.root.position.y += Math.abs(Math.sin(t * 7 + a.from.x)) * 0.5;
                        }
                        a.m.animate(dt, k < 1 ? 4 : 0);
                    }
                    const C = this.capt;
                    if (t > 2.4 && !C.orb.visible) {
                        C.orb.visible = true;
                        W.ship.setPart('powerCore', false);
                        A.play('sparkle');
                        const p = W.ship.body.localToWorld(V(0, 2.1, 1.4));
                        g.effects.sparks(p.x, p.y, p.z, 0x6ff0ff, 25, 6, 0.18);
                        this.caption('...and the Alien Captain stole your POWER CORE!', '');
                    }
                    C.m.cheer = t > 2.6 ? Math.min(1, (t - 2.6) * 2) : 0;
                    C.m.animate(dt, 0);
                    if (t > 3.0 && !this.cheered) { this.cheered = true; A.play('alienCheer', C.m.root.position); }
                    const fk = clamp((t - 1.0) / 0.5, 0, 1);
                    W.alienFlag.scale.setScalar(Math.max(0.01, fk));
                    if (t > 4.5) W.dome.mesh.material.uniforms.uOn.value = clamp((t - 4.5) / 1.5, 0, 1) * (Math.random() < 0.15 ? 0.5 : 1);
                    if (t > 4.5 && !this.domeSnd) { this.domeSnd = true; A.play('shieldUp', V(SHIP.x, 3, SHIP.z)); }
                    const gy = gyShip;
                    this.lookFrom(V(46 - t * 0.6, gy + 2.6 + t * 0.15, -624 + t * 0.3), V(30, gy + 2.4, -648));
                },
            },
            // 8 — Parachute landing + title
            {
                world: true,
                dur: 7,
                fov: 50,
                start: () => {
                    this.cheered = false;
                    this.domeSnd = false;
                    for (const a of aliens) a.m.root.visible = false;
                    this.capt.m.root.visible = false;
                    W.dome.mesh.material.uniforms.uOn.value = 1;
                    A.setMusic('title');
                    this.caption('', '');
                    astro.root.position.set(START.x - 3, gyStart + 24, START.z + 4);
                    astro.root.rotation.y = 2.3; // land facing the camera (3/4), not with his back to it
                    chute.position.copy(astro.root.position);
                    astroVel.set(0.4, -4.6, -0.6);
                    this.landed = false;
                    lookUp = 1.5;
                },
                update: (t, dt) => {
                    const a = astro.root.position;
                    if (!this.landed) {
                        a.addScaledVector(astroVel, dt);
                        chute.position.copy(a);
                        astro.float = 1;
                        if (a.y <= gyStart) {
                            a.y = gyStart;
                            this.landed = true;
                            chute.visible = false;
                            W.parachute.visible = true;
                            g.effects.dust(a.x, a.y, a.z, 10, 1);
                            A.play('land');
                        }
                    } else {
                        astro.float = damp(astro.float, 0, 6, dt);
                        astro.head.rotation.y = Math.sin(t * 1.4) * 0.6;
                    }
                    astro.animate(dt);
                    if (t > 4.2 && !this.capSet) {
                        this.capSet = true;
                        this.caption('Find the missing pieces of your ship... and get back home!', '');
                    }
                    if (t > 6.3 && !this.fading) { this.fading = true; this.fadeTo(1, 0.6); }
                    // the title card, on the cutscene's own clock
                    $('title-card').classList.toggle('on', t > 0.7 && t < 4.8);
                    lookUp = damp(lookUp, this.landed ? 0 : 1.5, 5, dt);
                    // (the camera stands a little left of the crashed seat, so the seat doesn't block the shot)
                    this.lookFrom(V(START.x + 1, gyStart + 1.6, START.z - 9), V(a.x, a.y + 1.6 + lookUp, a.z));
                },
            },
        ];

        this.run(shots, onDone, () => {
            // final state no matter where we skipped from
            this.capSet = false;
            this.fading = false;
            this.flashed = false;
            this.cheered = false;
            this.domeSnd = false;
            if (this.entryFire) { this.entryFire.parent && this.entryFire.parent.remove(this.entryFire); this.entryFire = null; }
            sp.remove(ship.root);
            W.ship.root.visible = true;
            W.ship.setPart('powerCore', false);
            W.smokeEmitter.on = true;
            W.fireEmitter.on = true;
            W.dome.mesh.material.uniforms.uOn.value = 1;
            W.alienFlag.visible = true;
            W.alienFlag.scale.setScalar(1);
            W.parachute.visible = true;
            this.mars.scale.setScalar(1);
            this.mars.children[1].visible = true;
            if (this.boomSprite) { g.scene.remove(this.boomSprite); this.boomSprite = null; }
            g.level.refreshShipGhosts();
            g.effects.clearParticles();
        });
        hideCrash();
    }

    // ========================================================
    // LEVEL 2: the creature's entrance, and the escape-pod finale
    // (the shots themselves are in cutscenes2.js)
    // ========================================================
    playBossIntro(boss, onDone) {
        this.run(bossIntroShots(this, boss), onDone, () => {
            $('boss-card').classList.remove('on');
        });
    }

    playFinale(onDone) {
        this.buildSpace();
        this.run(finaleShots(this), onDone, () => {
            this.sun.position.copy(this.sunHome);
            this.moonBase.visible = false;
            this.mars.visible = this.moon.visible = this.earth.visible = true;
        });
    }

    // ========================================================
    // ENDING OF MARS: fix the ship, blast off... and get caught!
    // ========================================================
    playOutro(onDone) {
        this.buildSpace();
        const g = this.game;
        const W = g.world;
        const A = g.audio;
        const sp = this.space;
        const ws = W.ship;
        const gy = W.groundAt(SHIP.x, SHIP.z);
        const startPos = ws.root.position.clone();
        const startRot = ws.root.rotation.clone();
        const vel = new THREE.Vector3();
        const oShip = buildShip();
        for (const id of Object.keys(oShip.ghosts)) oShip.setGhost(id, false);

        const shots = [
            // 1 — Engines on
            {
                world: true,
                dur: 5,
                start: () => {
                    this.fadeTo(0, 0.8);
                    A.setMusic('theme');
                    A.play('powerUp');
                    this.caption('Ship repaired! All systems... GO!', 'computer', 'All systems go!');
                    W.dome.mesh.visible = false;
                },
                update: (t, dt) => {
                    const k = easeInOut(clamp((t - 1.2) / 3, 0, 1));
                    ws.root.position.set(startPos.x, startPos.y + k * 3.5, startPos.z);
                    ws.root.rotation.set(lerp(startRot.x, 0, k), startRot.y, lerp(startRot.z, 0, k), 'YXZ');
                    ws.setEngines(t > 1.2 ? 1.8 + Math.random() * 0.4 : t / 1.2, t);
                    A.engine(clamp(t / 2, 0, 0.8));
                    if (t > 1.2 && Math.random() < dt * 30) {
                        const a = Math.random() * Math.PI * 2;
                        g.effects.spawn({ x: SHIP.x + Math.cos(a) * 3, y: gy + 0.3, z: SHIP.z + Math.sin(a) * 3, vx: Math.cos(a) * 9, vy: 0.6, vz: Math.sin(a) * 9, life: 1.4, size: 1, size1: 3.5, color: 0xd99a74, alpha: 0.7, alpha1: 0, drag: 1.5 });
                    }
                    this.shake = t > 1.2 ? 0.05 : 0;
                    const a = 0.6 + t * 0.15;
                    this.lookFrom(V(SHIP.x + Math.cos(a) * 17, gy + 4, SHIP.z + Math.sin(a) * 17), V(SHIP.x, gy + 2.5, SHIP.z));
                },
            },
            // 2 — Liftoff!
            {
                world: true,
                dur: 5.5,
                start: () => {
                    this.camLook = null;
                    this.caption('Next stop... THE MOON!', 'big');
                    vel.set(0, 3, 0);
                    this.rise0 = ws.root.position.clone();
                },
                update: (t, dt) => {
                    const r = ws.root;
                    if (t < 1.5) {
                        r.position.y += 4 * dt;
                    } else {
                        const k = clamp((t - 1.5) / 1.2, 0, 1);
                        r.rotation.set(lerp(0, Math.PI / 2 - 0.25, easeInOut(k)), SHIP.yaw, 0, 'YXZ');
                        const fwd = V(0, 0, -1).applyQuaternion(r.quaternion);
                        vel.addScaledVector(fwd, 60 * dt * k);
                        r.position.addScaledVector(vel, dt);
                    }
                    ws.setEngines(2.6, t);
                    A.engine(0.9);
                    const tail = ws.body.localToWorld(V(0, 0, 6.5));
                    g.effects.spawn({ x: tail.x, y: tail.y, z: tail.z, vx: rand(-1, 1), vy: rand(-1, 0), vz: rand(-1, 1), life: 3, size: 1.5, size1: 6, color: 0xffffff, color1: 0xb9b0c0, alpha: 0.8, alpha1: 0, drag: 0.6, batch: 2 });
                    this.shake = t < 2 ? 0.08 : 0.03;
                    const target = r.position.clone();
                    this.camLook = this.camLook || target.clone();
                    this.camLook.lerp(target, 1 - Math.exp(-5 * dt));
                    this.lookFrom(V(SHIP.x + 18, gy + 2.2, SHIP.z + 22), this.camLook);
                    if (t > 5 && !this.flashed) { this.flashed = true; this.fadeTo(1, 0.45, true); }
                },
            },
            // 3 — Flying to the Moon
            {
                dur: 6.5,
                start: () => {
                    this.camLook = null;
                    this.flashed = false;
                    this.fadeTo(0, 0.8, true);
                    ws.root.visible = false;
                    this.mars.visible = this.moon.visible = this.earth.visible = true;
                    this.mars.scale.setScalar(1);
                    this.mars.position.set(40, -36, 120);
                    this.moon.position.set(-24, 12, -230);
                    this.earth.position.set(-180, 70, -820);
                    sp.add(oShip.root);
                    this.actors.push(oShip.root);
                    oShip.root.position.set(0, 0, 0);
                    vel.copy(this.moon.position).normalize().multiplyScalar(12);
                    aimNose(oShip.root, vel.clone().normalize());
                    A.engine(0.5);
                    this.caption('Flying home to the Moon base...', 'computer');
                },
                update: (t, dt) => {
                    oShip.root.position.addScaledVector(vel, dt);
                    oShip.setEngines(2.2, t);
                    oShip.root.rotateZ(Math.sin(t * 2) * 0.24 * dt);
                    const p = oShip.root.position;
                    this.lookFrom(V(p.x + 6 - t * 0.5, p.y + 2.5, p.z + 12), p.clone().addScaledVector(vel, 0.8));
                    this.speedLines(dt, 50);
                },
            },
            // 4... — the alien mothership catches us! (cutscenes2.js)
            ...captureShots(this, { ship: oShip, vel }),
        ];

        this.run(shots, onDone, () => {
            this.fading = this.flashed = false;
            this.camLook = null;
            this.sun.position.copy(this.sunHome);
            if (this.greenLight) this.greenLight.intensity = 0;
            if (this.redLight) this.redLight.intensity = 0;
            this.game.audio.tractor(false);
        });
    }
}
