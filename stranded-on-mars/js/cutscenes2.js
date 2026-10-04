// ============================================================
// LEVEL 2 CUTSCENES
//  - the capture: the ship goes "grrr" and stops, an alien MOTHERSHIP
//    has it in a tractor beam, Lincoln hits SELF-DESTRUCT and ejects
//    into the hangar bay just before his ship blows up
//  - the creature's big entrance (Ocarina of Time style title card!)
//  - the escape pod finale, all the way home to the Moon
// Each returns a list of shots for the Cinematics runner.
// ============================================================

import * as THREE from 'three';
import { buildShip } from './ship.js';
import { createAlienModel } from './aliens.js';
import { createAstronaut, createSeat, createFlag } from './models.js';
import { createMothership, createTractorBeam, createCockpit, createEscapePod } from './shipmodels.js';
import { glowSprite, GeoBuilder, vcMat, addOutline } from './toon.js';
import { WRECK, POD, CHECKPOINTS } from './shiplayout.js';
import { clamp, lerp, easeInOut, easeOut, easeIn, rand, damp } from './util.js';

const $ = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

// Point an object's nose (-Z) along a direction
function aimNose(obj, dir) {
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, UP);
    obj.quaternion.setFromRotationMatrix(m);
}

// Aim a limb (it hangs down from its pivot) at a point in the world
function pointLimb(limb, target) {
    limb.parent.updateMatrixWorld(true);
    const local = limb.parent.worldToLocal(target.clone()).sub(limb.position).normalize();
    limb.quaternion.setFromUnitVectors(DOWN, local);
}

// Stretch a tractor beam from `from` (its wide end) to `to`
function aimBeam(beam, from, to) {
    beam.position.copy(from);
    _v.subVectors(to, from);
    const len = _v.length();
    beam.quaternion.setFromUnitVectors(UP, _v.normalize());
    beam.scale.y = len;
}

function showCard(id, on) {
    const el = $(id);
    if (el) el.classList.toggle('on', on);
}

// ============================================================
// THE CAPTURE (appended to the ending of the Mars level)
// ctx.ship = the LINCOLN-1 flying in space, ctx.vel = its velocity
// ============================================================
export function captureShots(c, ctx) {
    const S = {}; // this cutscene's own flags
    const g = c.game;
    const A = g.audio;
    const sp = c.space;
    const ship = ctx.ship;
    const heading = new THREE.Vector3();
    const msPos = new THREE.Vector3();
    // built now (the screen is black while the outro is set up), so the whip-round doesn't stop to build them
    const ms = createMothership();
    const beam = createTractorBeam(3.2, 5.4);
    let msPlaced = false;
    const mouth = new THREE.Vector3(), emitter = new THREE.Vector3();
    let speed = 12;
    const greenLight = c.greenLight;
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();

    const setupMothership = () => {
        if (msPlaced) return;
        msPlaced = true;
        // looming up behind the ship, heading the same way (it was chasing us!)
        const sp0 = ship.root.position;
        msPos.copy(sp0).addScaledVector(heading, -190).add(V(0, 30, 0));
        ms.position.copy(msPos);
        aimNose(ms, heading);
        c.addActor(ms, sp);
        ms.updateMatrixWorld(true);
        mouth.copy(ms.userData.bayMouth);
        ms.localToWorld(mouth);
        emitter.copy(ms.userData.emitter);
        ms.localToWorld(emitter);
        c.addActor(beam, sp);
        greenLight.position.copy(emitter);
    };

    // the cockpit set (shot 7)
    let cockpit = null, astro = null;

    return [
        // 4 — "grrr"... the ship lurches and stops
        {
            dur: 5.6,
            blend: 1.2, // the same chase camera as the shot before: settle into place, don't jump
            anchor: () => ship.root.position,
            start: () => {
                heading.copy(ctx.vel).normalize();
                speed = ctx.vel.length();
                c.caption('', '');
                greenLight.intensity = 0;
            },
            update: (t, dt) => {
                const s = ship.root;
                if (t < 1.6) speed = damp(speed, 12, 2, dt);
                else if (t < 1.85) speed = 30; // LURCH!
                else if (t < 2.4) speed = damp(speed, -1.5, 9, dt); // ...and it STOPS
                else speed = damp(speed, -0.6, 3, dt);
                s.position.addScaledVector(heading, speed * dt);
                const struggling = t > 1.0;
                ship.setEngines(t < 1.0 ? 2.2 : t < 1.85 ? 2.6 : Math.random() < 0.45 ? 1.6 + Math.random() : 0.6, t);
                aimNose(s, heading);
                if (struggling) s.rotateZ(Math.sin(t * 37) * 0.02 + Math.sin(t * 13) * 0.015);
                if (t > 1.0 && !S.grr) { S.grr = true; A.play('grrr'); c.shake = 0.08; }
                if (t > 1.6 && !S.lurched) { S.lurched = true; A.play('lurch'); c.shake = 0.35; }
                if (t > 2.4 && !S.saidHuh) {
                    S.saidHuh = true;
                    c.caption('Huh?! What\'s going on?!\nThe ship won\'t MOVE!', '');
                    A.engine(0.25);
                }
                if (t > 3.6 && !S.grr2) { S.grr2 = true; A.play('grrr'); c.shake = 0.12; }
                // something green glows behind us...
                greenLight.position.copy(s.position).addScaledVector(heading, -30).add(V(0, 8, 0));
                greenLight.intensity = clamp((t - 2.0) / 2.5, 0, 1) * 70;
                const p = s.position;
                camPos.copy(p).addScaledVector(heading, -13).add(V(1.5, 3.4, 0));
                camLook.copy(p).addScaledVector(heading, 8).add(V(0, 0.6, 0));
                c.lookFrom(camPos, camLook);
                if (t < 1.85) c.speedLines(dt, 40);
            },
        },
        // 5 — whip around: an ALIEN MOTHERSHIP has us in its tractor beam!
        {
            dur: 6.4,
            fov: 55, // widens to 60 during the whip
            start: () => {
                S.grr = S.lurched = S.saidHuh = S.grr2 = false;
                setupMothership();
                // light the mothership's scary face (from in front, up high, on the camera's side)
                c.sun.position.copy(heading).multiplyScalar(60).add(V(-heading.z * 50, 55, heading.x * 50));
                A.play('sting');
                A.setMusic('intro');
                A.tractor(true);
            },
            update: (t, dt) => {
                const s = ship.root;
                const p = s.position;
                s.position.addScaledVector(heading, -0.8 * dt);
                ship.setEngines(Math.random() < 0.4 ? 1.2 : 0.4, t);
                aimNose(s, heading);
                s.rotateZ(Math.sin(t * 29) * 0.02);
                aimBeam(beam, p, emitter);
                // the whip starts inside the beam: switch it on as the camera swings clear (no green flash)
                beam.material.uniforms.uOn.value = clamp((t - 0.3) / 0.35, 0, 1);
                greenLight.position.copy(p).addScaledVector(heading, -12).add(V(0, 4, 0));
                greenLight.intensity = 80;
                // whip around from behind the ship to low in front of it, looking back... and UP
                const k = easeInOut(clamp(t / 0.8, 0, 1));
                const ang = lerp(Math.PI, 0.6, k);
                const side = V(-heading.z, 0, heading.x);
                const r = lerp(13, 34, k) - Math.max(0, t - 0.8) * 0.8;
                // (it starts exactly where the last shot's camera was: 1.5 to the side, looking 0.6 up)
                camPos.copy(p)
                    .addScaledVector(heading, Math.cos(ang) * r)
                    .addScaledVector(side, Math.sin(ang) * r)
                    .add(V(1.5 * (1 - k), lerp(3.4, 0, k), 0));
                camLook.copy(p).addScaledVector(heading, 8 * (1 - k)).add(V(0, 0.6 * (1 - k), 0)).lerp(_v.copy(p).lerp(msPos, 0.42), k);
                c.lookFrom(camPos, camLook);
                c.camera.fov = lerp(55, 60, k);
                c.camera.updateProjectionMatrix();
                if (t < 0.75) c.speedLines(dt, 120);
                if (t > 0.9 && !S.capt1) { S.capt1 = true; c.caption('AN ALIEN MOTHERSHIP!!', 'big'); c.shake = 0.15; }
                if (t > 3.4 && !S.capt2) { S.capt2 = true; c.caption('We\'re caught in its TRACTOR BEAM!', 'alarm'); }
            },
        },
        // 6 — reeled in toward the hangar
        {
            dur: 6,
            fov: 50,
            start: () => {
                S.capt1 = S.capt2 = false;
                c.caption('Nooo! It\'s pulling us in!', '');
                S.pullFrom = ship.root.position.clone();
                $('alarm-flash').classList.add('on');
                A.alarm(true);
            },
            update: (t, dt) => {
                const s = ship.root;
                const k = easeIn(clamp(t / 5.6, 0, 1));
                s.position.lerpVectors(S.pullFrom, mouth, k * 0.97);
                aimNose(s, heading);
                s.rotateZ(Math.sin(t * 2.3) * 0.35);
                s.rotateX(Math.sin(t * 1.7) * 0.12);
                ship.setEngines(Math.random() < 0.3 ? 1.4 : 0.3, t);
                aimBeam(beam, s.position, emitter);
                greenLight.position.copy(s.position).add(V(0, 6, 0));
                const mid = S.pullFrom.clone().lerp(mouth, 0.5);
                const side = V(-heading.z, 0, heading.x);
                camPos.copy(mid).addScaledVector(side, 100).add(V(0, -6, 0)).addScaledVector(heading, 34);
                camLook.copy(mid).lerp(s.position, 0.45).add(V(0, 8, 0));
                c.lookFrom(camPos, camLook);
                if (t > 5.4 && !S.flashed) { S.flashed = true; c.fadeTo(1, 0.35); }
            },
        },
        // 7 — in the cockpit: SELF-DESTRUCT!
        {
            dur: 8.6,
            fov: 55,
            start: () => {
                S.flashed = false;
                c.fadeTo(0, 0.35);
                c.sun.position.copy(c.sunHome);
                ship.root.visible = false;
                cockpit = createCockpit();
                const cp = cockpit.root;
                const toShip = S.pullFrom.clone().sub(mouth).normalize();
                cp.position.copy(mouth).addScaledVector(toShip, 32);
                aimNose(cp, heading);
                c.addActor(cp, sp);
                const seat = createSeat();
                seat.position.set(0, 0, 0.12);
                seat.rotation.y = Math.PI;
                cp.add(seat);
                astro = createAstronaut();
                astro.root.position.set(0, 0.22, -0.15); // hips on the front of the cushion, boots dangling
                astro.root.rotation.y = Math.PI;
                astro.sit = 1;
                cp.add(astro.root);
                cockpit.screen.draw('warn', 0, false);
                cockpit.alarm = c.redLight;
                greenLight.intensity = 55;
                S.count = 10;
                c.caption('They\'re NOT getting my ship...', '');
            },
            update: (t, dt) => {
                const cp = cockpit.root;
                // still being pulled in
                cp.position.lerp(mouth, dt * 0.07);
                cp.updateMatrixWorld(true);
                const L = (x, y, z) => cp.localToWorld(V(x, y, z));
                aimBeam(beam, L(0, 1, 2.5), emitter);
                greenLight.position.copy(L(0, 3.5, 5));
                cockpit.alarm.position.copy(L(0, 2.0, -0.2));
                astro.animate(dt);
                astro.sit = 1;
                const blink = Math.floor(t * 4) % 2 === 0;
                // a worried look back over his shoulder at the mothership, then get to work
                const look = t > 0.45 && t < 1.45 ? 1.2 : 0;
                astro.head.rotation.y = damp(astro.head.rotation.y, look, 6, dt);
                astro.head.rotation.x = damp(astro.head.rotation.x, t > 2 && t < 5.6 ? 0.4 : 0, 6, dt);
                // lean in, flip the cover, PRESS the big red button
                if (t > 2.0 && t < 6.0) {
                    const k = clamp((t - 2.0) / 0.5, 0, 1);
                    const press = t > 3.9 && t < 4.3 ? Math.sin(((t - 3.9) / 0.4) * Math.PI) : 0;
                    const lift = t > 2.55 && t < 3.25 ? Math.sin(((t - 2.55) / 0.7) * Math.PI) : 0;
                    astro.body.rotation.x = damp(astro.body.rotation.x, 0.3 * k, 8, dt);
                    const target = cockpit.box.localToWorld(V(0, 0.32 + lift * 0.25 - press * 0.17, lift * 0.18));
                    pointLimb(astro.arms[0], L(0.45, 0.6, -0.1).lerp(target, k));
                }
                if (t > 2.7) cockpit.hinge.rotation.x = -Math.min(1, (t - 2.7) / 0.35) * 1.9;
                if (t > 2.75 && !S.clicked) { S.clicked = true; g.audio.play('click'); }
                if (t > 4.05 && !S.pressed) {
                    S.pressed = true;
                    g.audio.play('bigButton');
                    c.caption('SELF-DESTRUCT ACTIVATED!', 'alarm', 'Self destruct activated. Ten seconds.');
                    S.count = 10;
                    S.countT = 0;
                    c.shake = 0.05;
                }
                cockpit.button.position.y = S.pressed && t < 4.5 ? 0.06 : 0.11;
                if (S.pressed) {
                    S.countT += dt;
                    if (S.countT >= 1) { S.countT -= 1; S.count = Math.max(1, S.count - 1); g.audio.play('countBeep'); }
                    cockpit.screen.draw('count', S.count, blink);
                    cockpit.alarm.intensity = blink ? 16 : 3;
                    cockpit.btnGlow.material.opacity = blink ? 0.95 : 0.4;
                } else {
                    cockpit.screen.draw('warn', 0, blink);
                }
                // both hands on the eject handle
                if (t > 6.0) {
                    const h = L(cockpit.ejectHandle.x, cockpit.ejectHandle.y, cockpit.ejectHandle.z);
                    pointLimb(astro.arms[0], h);
                    pointLimb(astro.arms[1], h);
                    astro.body.rotation.x = damp(astro.body.rotation.x, 0.2, 6, dt);
                }
                if (t > 6.2 && !S.capt3) { S.capt3 = true; c.caption('Time to GO!', ''); }
                // cameras: Lincoln's face, over his shoulder at the button, then his face again
                if (t < 2.2 || t >= 5.6) {
                    c.lookFrom(L(0.42, 1.86, -1.85), L(0.03, 1.26, -0.1));
                } else {
                    c.lookFrom(L(1.1, 1.95, -0.3), cockpit.box.localToWorld(V(0.12, 0.08, -0.06)));
                }
                if (t > 8.1 && !S.flashed) { S.flashed = true; c.fadeTo(1, 0.4); }
            },
        },
        // 8 — the hangar bay: EJECT! ...KA-BOOM!
        {
            world: true,
            dur: 9.2,
            fov: 55,
            start: () => {
                S.flashed = false;
                S.clicked = S.pressed = S.capt3 = false;
                $('alarm-flash').classList.remove('on');
                A.alarm(false);
                A.tractor(false);
                // now we're inside the mothership
                c.sun.position.copy(c.sunHome);
                g.enterShipStage();
                g.world.setWreck(false);
                c.fadeTo(0, 0.5);
                A.setMusic('intro');
                const scene = g.scene;
                const hs = buildShip();
                for (const id of Object.keys(hs.ghosts)) hs.setGhost(id, false);
                hs.root.rotation.y = Math.PI; // nose pointing back out to space
                c.addActor(hs.root, scene);
                S.hship = hs;
                S.hbeam = createTractorBeam(1.2, 4.5);
                c.addActor(S.hbeam, scene);
                // curious aliens come over for a look
                S.haliens = [];
                const spots = [[-6, -9, -4.5, 3.5], [8, -10, 8.8, 4.2], [0, -14, 1, 1.8], [-10, 0, -4.6, 8.5], [13, 2, 9.5, 11.5]];
                for (const [fx, fz, tx, tz] of spots) {
                    const m = createAlienModel(Math.random() < 0.3 ? 'major' : Math.random() < 0.5 ? 'scout' : 'trooper');
                    m.root.position.set(fx, 0, fz);
                    c.addActor(m.root, scene);
                    S.haliens.push({ m, from: V(fx, 0, fz), to: V(tx, 0, tz), gone: false });
                }
                S.hastro = createAstronaut();
                S.hastro.root.visible = false;
                c.addActor(S.hastro.root, scene);
                S.hseat = createSeat();
                S.hseat.visible = false;
                c.addActor(S.hseat, scene);
                S.count = 3;
                S.countT = 0;
                c.caption('3...', 'alarm');
                g.audio.play('countBeep');
                S.boomed = false;
                S.ejected = false;
            },
            update: (t, dt) => {
                const W = g.world;
                const hs = S.hship;
                const clampTop = V(WRECK.x, 10.2, WRECK.z);
                // the beam sets the ship down on the landing ring
                const k = easeOut(clamp(t / 2.6, 0, 1));
                hs.root.position.set(lerp(WRECK.x + 1, WRECK.x, k), lerp(6.5, 2.15, k) + Math.sin(t * 2) * 0.08 * (1 - k), lerp(WRECK.z + 14, WRECK.z, k));
                hs.root.rotation.z = Math.sin(t * 1.5) * 0.06 * (1 - k);
                hs.setEngines(0);
                if (!S.boomed) aimBeam(S.hbeam, hs.root.position, clampTop);
                S.hbeam.visible = !S.boomed && t < 3.0;
                // countdown
                S.countT += dt;
                if (S.countT >= 1 && S.count > 1) {
                    S.countT -= 1;
                    S.count--;
                    c.caption(S.count + '...', 'alarm');
                    g.audio.play('countBeep');
                }
                // aliens walk up, then get blown away
                for (const a of S.haliens) {
                    if (a.gone) continue;
                    const ak = clamp((t - 0.4) / 3.2, 0, 1);
                    a.m.root.position.lerpVectors(a.from, a.to, easeOut(ak));
                    const d = hs.root.position.clone().sub(a.m.root.position);
                    a.m.root.rotation.y = Math.atan2(d.x, d.z);
                    a.m.move = ak < 1 ? 1 : 0;
                    a.m.lookPitch = -0.2;
                    if (t > 2.6) a.m.wave = Math.min(1, (t - 2.6) * 2) * (a.from.x < 0 ? 1 : 0);
                    a.m.animate(dt, ak < 1 ? 4 : 0);
                    if (S.boomed && t > S.boomT + 0.15 + a.to.distanceTo(hs.root.position) * 0.02) {
                        a.gone = true;
                        a.m.root.visible = false;
                        g.effects.poof(a.m.root.position.x, a.m.root.position.y + 0.8, a.m.root.position.z, 1);
                    }
                }
                // EJECT at "1"
                const L = S.hastro;
                if (t > 2.9 && !S.ejected) {
                    S.ejected = true;
                    g.audio.play('eject');
                    c.caption('EJECT!', 'big');
                    const top = hs.root.position.clone().add(V(0, 1.6, 2.4));
                    L.root.position.copy(top);
                    L.root.visible = true;
                    S.hseat.position.copy(top);
                    S.hseat.visible = true;
                    S.astroVel = V(-1.9, 11, -1.15);
                    S.seatVel = V(1.5, 8, 2);
                    g.effects.dust(top.x, top.y, top.z, 10, 1, 0xdddddd, 1.2);
                    S.landed = false;
                }
                if (S.ejected) {
                    if (!S.landed) {
                        S.astroVel.y -= 13 * dt;
                        L.root.position.addScaledVector(S.astroVel, dt);
                        L.root.rotation.x -= dt * 5.5; // a big flip!
                        L.float = 1;
                        const cp = CHECKPOINTS[0];
                        if (L.root.position.y <= 0 && S.astroVel.y < 0) {
                            S.landed = true;
                            L.root.position.set(cp.x, 0, cp.z);
                            L.root.rotation.set(0, Math.PI, 0);
                            g.effects.dust(cp.x, 0, cp.z, 10, 1, 0xc8b0ff, 0.8);
                            g.audio.play('land');
                            S.landT = t;
                        }
                    } else {
                        L.float = damp(L.float, 0, 6, dt);
                        const lk = t - S.landT;
                        L.sit = lk < 0.5 ? 0.6 : damp(L.sit, 0, 4, dt); // crouch, then stand up
                        L.root.position.y = 0;
                        if (S.boomed) L.head.rotation.y = Math.sin(t * 2) * 0.4;
                    }
                    L.animate(dt);
                    S.seatVel.y -= 13 * dt;
                    S.hseat.position.addScaledVector(S.seatVel, dt);
                    S.hseat.rotation.x += dt * 3;
                    if (S.hseat.position.y < 0.2) { S.hseat.position.y = 0.2; S.seatVel.set(0, 0, 0); }
                }
                // ...KA-BOOM!
                if (t > 4.1 && !S.boomed) {
                    S.boomed = true;
                    S.boomT = t;
                    const p = hs.root.position;
                    hs.root.visible = false;
                    W.setWreck(true);
                    g.effects.bigBoom(p.x, p.y - 1, p.z, 1.3);
                    g.effects.explosion(p.x, p.y, p.z, 9, 0xffa04a);
                    for (let i = 0; i < 26; i++) {
                        const a = Math.random() * Math.PI * 2;
                        g.effects.spawn({
                            x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * rand(6, 16), vy: rand(4, 12), vz: Math.sin(a) * rand(6, 16),
                            life: rand(0.8, 1.4), size: rand(0.25, 0.5), size1: 0.1, color: Math.random() < 0.5 ? 0xff7a2e : 0xeeeae2,
                            alpha: 1, alpha1: 0, grav: 14, drag: 0.6, batch: 0,
                        });
                    }
                    c.flash(true, 0.6);
                    c.shake = 0.7;
                    g.audio.play('crash');
                    g.audio.play('explosion');
                    c.caption('KA-BOOM!', 'big');
                }
                if (t > 6.4 && !S.capt4) {
                    S.capt4 = true;
                    c.caption('Phew! That was close...', '');
                }
                // camera: low by the opening, then on Lincoln as he lands with the fire behind him
                const cp0 = CHECKPOINTS[0];
                if (!S.landed) {
                    const look = S.ejected ? L.root.position.clone().lerp(hs.root.position, 0.35) : hs.root.position.clone().add(V(0, 1, 0));
                    S.camLook = S.camLook || look.clone();
                    S.camLook.lerp(look, 1 - Math.exp(-6 * dt));
                    c.lookFrom(V(-12, 2.0, 15), S.camLook);
                } else {
                    const lk = clamp((t - S.landT) / 1.2, 0, 1);
                    const from = V(-12, 2.0, 15);
                    const to = V(cp0.x - 1.8, 1.5, cp0.z - 5.5);
                    S.camLook.lerp(V(cp0.x + 1.2, 1.6, cp0.z + 2.5), 1 - Math.exp(-3 * dt));
                    c.lookFrom(from.lerp(to, easeInOut(lk)), S.camLook);
                }
            },
        },
        // 9 — LEVEL 2: THE MOTHERSHIP
        {
            world: true,
            dur: 5.4,
            fov: 52,
            blend: 1.2, // carry on from the last shot's camera instead of jumping to a new spot
            start: () => {
                S.camLook = null;
                S.capt4 = false;
                A.setMusic('ship');
                c.caption('Now I\'m stuck inside an ALIEN MOTHERSHIP...\nI\'ve got to find an ESCAPE POD!', '');
            },
            update: (t, dt) => {
                showCard('level-card', t > 0.6 && t < 4.3); // on the cutscene's own clock
                c.camera.fov = lerp(55, 52, easeInOut(clamp(t / 1.2, 0, 1)));
                c.camera.updateProjectionMatrix();
                const L = S.hastro;
                L.sit = damp(L.sit, 0, 5, dt);
                L.head.rotation.y = Math.sin(t * 1.3) * 0.5 * Math.max(0, 1 - t / 3);
                L.animate(dt);
                const cp0 = CHECKPOINTS[0];
                // swing round to look over Lincoln's shoulder at the door ahead...
                const k = easeInOut(clamp(t / 5.0, 0, 1));
                const a = lerp(-2.4, 0, k);
                const r = lerp(4.5, 0.01, easeIn(clamp((t - 2.5) / 2.7, 0, 1)));
                const eye = V(cp0.x + Math.sin(a) * r, lerp(1.9, 1.62, k), cp0.z + Math.cos(a) * r);
                c.lookFrom(eye, V(cp0.x, 1.5, cp0.z - 12).lerp(V(cp0.x, 1.3, cp0.z), 1 - k));
                // ...and become Lincoln's own eyes
                if (t > 4.6) L.root.visible = false;
                if (t > 4.9 && !S.fading) { S.fading = true; c.fadeTo(1, 0.4); }
            },
        },
    ];
}

// ============================================================
// THE CREATURE'S ENTRANCE (Ocarina of Time style)
// ============================================================
export function bossIntroShots(c, boss) {
    const S = {};
    const g = c.game;
    const A = g.audio;
    const C = boss.center;
    const P = g.player;
    const start = P.eyePos.clone();
    const yaw = P.yaw;
    const fwd = V(-Math.sin(yaw), 0, -Math.cos(yaw));
    let tentOrder = [0, 3, 1, 4, 2, 5];
    return [
        // 1 — the door slams shut... something rumbles in the pit
        {
            world: true,
            dur: 3.4,
            fov: 70,
            start: () => {
                boss.prepareIntro();
                boss.faceYaw = boss.yaw = Math.atan2(start.x - C.x, start.z - C.z);
                A.setMusic('none');
                A.play('rumble');
                c.caption('', '');
            },
            update: (t, dt) => {
                c.shake = t > 0.6 ? 0.06 + Math.sin(t * 3) * 0.03 : 0;
                boss.lookTarget.copy(c.camera.position);
                boss.update(dt);
                const look = start.clone().addScaledVector(fwd, 10).lerp(V(C.x, 0.5, C.z), clamp(t / 2.5, 0, 1));
                c.lookFrom(start, look);
                if (t > 1.6 && !S.said) { S.said = true; c.caption('...what was THAT?', ''); }
            },
        },
        // 2 — tentacles burst out of the pit!
        {
            world: true,
            dur: 3.4,
            fov: 62,
            start: () => {
                S.said = false;
                c.caption('', '');
                S.burst = 0;
            },
            update: (t, dt) => {
                for (let i = 0; i < 6; i++) {
                    const when = 0.25 + i * 0.4;
                    if (t > when) {
                        const k = tentOrder[i];
                        if (boss.tentOut[k] === 0) {
                            A.play('splash', C);
                            c.shake = 0.25;
                            g.effects.sparks(C.x + Math.cos(boss.tents[k].angle) * 5, 0.5, C.z + Math.sin(boss.tents[k].angle) * 5, 0x9dff5a, 14, 7, 0.22);
                        }
                        boss.tentOut[k] = Math.min(1, (t - when) / 0.45);
                    }
                }
                boss.lookTarget.copy(c.camera.position);
                boss.update(dt);
                // by the railing, looking down into the pit
                const d = V(start.x - C.x, 0, start.z - C.z).normalize();
                const cam = V(C.x, 0, C.z).addScaledVector(d, 14.5).add(V(0, 4.2, 0));
                c.lookFrom(cam, V(C.x, -2 + t * 1.2, C.z));
            },
        },
        // 3 — the creature rises...
        {
            world: true,
            dur: 3.8,
            fov: 55,
            start: () => {
                A.play('bossRise', C);
            },
            update: (t, dt) => {
                boss.rise = easeInOut(clamp(t / 3.4, 0, 1));
                boss.lookTarget.copy(c.camera.position);
                boss.update(dt);
                c.shake = 0.08;
                const d = V(start.x - C.x, 0, start.z - C.z).normalize();
                const cam = V(C.x, 0, C.z).addScaledVector(d, 18 - t * 0.6).add(V(0, 0.8, 0));
                c.lookFrom(cam, V(C.x, lerp(1, 5.5, boss.rise), C.z));
            },
        },
        // 4 — ...and OPENS ITS EYE
        {
            world: true,
            dur: 2.3,
            fov: 30,
            start: () => {
                boss.rise = 1;
                A.play('eyeOpen', boss.pos);
            },
            update: (t, dt) => {
                boss.eyeOpen = t < 0.5 ? 0 : easeOut(clamp((t - 0.5) / 0.25, 0, 1));
                if (t > 0.5 && !S.stung) { S.stung = true; A.play('sting'); c.shake = 0.12; }
                boss.lookTarget.copy(c.camera.position);
                boss.update(dt);
                const e = boss.pos;
                const d = V(start.x - C.x, 0, start.z - C.z).normalize();
                c.lookFrom(e.clone().addScaledVector(d, 9 - t * 0.8).add(V(0, 0.2, 0)), e);
            },
        },
        // 5 — ROAR! + the title card
        {
            world: true,
            dur: 5.2,
            fov: 58,
            start: () => {
                S.stung = false;
                A.play('bossRoar', boss.pos);
                A.setMusic('boss2');
                $('boss-card').querySelector('.bc-small').textContent = boss.title;
                $('boss-card').querySelector('.bc-big').textContent = boss.name;
                g.audio.play('titleSting');
            },
            update: (t, dt) => {
                showCard('boss-card', t > 0.45 && t < 4.6); // on the cutscene's own clock
                boss.mouth = t < 0.25 ? t / 0.25 : t < 2.2 ? 1 : Math.max(0, 1 - (t - 2.2) / 0.5);
                boss.lookTarget.copy(c.camera.position);
                boss.update(dt);
                c.shake = t < 2 ? 0.25 : 0.03;
                if (t < 2 && Math.random() < dt * 30) {
                    const m = boss.mouthParts.group.getWorldPosition(new THREE.Vector3());
                    g.effects.spawn({ x: m.x, y: m.y, z: m.z, vx: rand(-4, 4), vy: rand(-1, 3), vz: rand(2, 8), life: 0.8, size: 0.3, size1: 0.1, color: 0x9dff5a, alpha: 1, alpha1: 0, grav: 8 });
                }
                const d = V(start.x - C.x, 0, start.z - C.z).normalize();
                const side = V(-d.z, 0, d.x);
                const cam = V(C.x, 0, C.z).addScaledVector(d, lerp(12, 19, easeOut(clamp(t / 1.5, 0, 1)))).addScaledVector(side, 3).add(V(0, 2.2, 0));
                c.lookFrom(cam, V(C.x, 4.2, C.z));
            },
        },
    ];
}

// ============================================================
// THE FINALE: escape pod → KA-BOOM → the Moon → THE END
// ============================================================
export function finaleShots(c) {
    const S = {};
    const g = c.game;
    const A = g.audio;
    const sp = c.space;
    const W = g.world;
    let pod = null, ms = null, spPod = null;
    const vel = new THREE.Vector3();
    const astro = createAstronaut();
    const flag = createFlag('LINCOLN');
    let shock = null;

    return [
        // 1 — Lincoln climbs in, the launch hatch opens
        {
            world: true,
            dur: 4.6,
            fov: 55,
            start: () => {
                pod = W.pod;
                c.caption('Escape pod... READY!', 'computer', 'Launch sequence started.');
                A.play('powerUp');
                A.setMusic('intro');
                c.fadeTo(0, 0.4);
                // Lincoln runs up and hops in through the side
                const P = g.player;
                S.podAstro = createAstronaut();
                S.podAstro.root.position.set(P.pos.x, 0, P.pos.z);
                c.addActor(S.podAstro.root, g.scene);
                S.podFrom = P.pos.clone().setY(0);
            },
            update: (t, dt) => {
                const L = S.podAstro;
                const side = V(pod.root.position.x + 1.9, 0, pod.root.position.z - 0.6);
                const k = clamp(t / 1.3, 0, 1);
                L.root.position.lerpVectors(S.podFrom, side, k);
                L.root.position.y = k < 1 ? Math.abs(Math.sin(t * 9)) * 0.15 : Math.sin(clamp((t - 1.3) / 0.45, 0, 1) * Math.PI) * 1.4;
                const d = side.clone().sub(S.podFrom);
                L.root.rotation.y = k < 1 ? Math.atan2(d.x, d.z) : -Math.PI / 2;
                L.walk = k < 1 ? 1 : 0;
                L.animate(dt);
                if (t > 1.75 && L.root.visible) {
                    L.root.visible = false;
                    A.play('doorOpen', pod.root.position);
                    g.effects.glowFlash(side.x - 0.6, 1.8, side.z, 0x9ff8ff, 2.5, 0.3);
                }
                pod.setThrust(t > 3.0 ? 0.6 : 0.15, t);
                const H = W.podHatch;
                H.open = clamp((t - 2.0) / 1.6, 0, 1);
                for (const b of H.blades) b.scale.setScalar(1 - easeInOut(H.open) * 0.92);
                H.group.rotation.z = H.open * 1.2;
                if (t > 2.0 && !S.hatchSnd) { S.hatchSnd = true; A.play('doorOpen', H.group.position); }
                const p = pod.root.position;
                c.lookFrom(V(p.x + 6.5, 2.5, p.z + 6), V(p.x + 0.2, 1.7, p.z - 3 * clamp((t - 1.6) / 2.5, 0, 1)));
            },
        },
        // 2 — BLAST OFF!
        {
            world: true,
            dur: 2.6,
            fov: 62,
            start: () => {
                S.hatchSnd = false;
                A.play('podLaunch');
                c.caption('BLAST OFF!', 'big');
                S.podZ = pod.root.position.z;
            },
            update: (t, dt) => {
                const p = pod.root.position;
                pod.setThrust(t < 0.5 ? 1.2 + t * 2 : 2.4, t);
                const k = easeIn(clamp((t - 0.5) / 1.5, 0, 1));
                p.z = S.podZ - k * 40;
                p.x = POD.x + (t < 0.5 ? Math.sin(t * 60) * 0.03 : 0);
                c.shake = 0.12;
                if (Math.random() < dt * 40) g.effects.spawn({ x: p.x + rand(-0.5, 0.5), y: p.y, z: p.z + 2.8, vx: rand(-2, 2), vy: rand(0, 2), vz: rand(4, 9), life: 1.4, size: 0.8, size1: 3, color: 0xffffff, color1: 0xb9b0c0, alpha: 0.8, alpha1: 0, drag: 1.2 });
                c.lookFrom(V(POD.x + 4, 1.6, POD.z + 7), V(p.x, p.y, p.z));
                if (t > 2.2 && !S.flashed) { S.flashed = true; c.fadeTo(1, 0.35, true); }
            },
        },
        // 3 — out in space, the mothership goes KA-BOOM
        {
            dur: 7.2,
            fov: 55,
            start: () => {
                S.flashed = false;
                c.fadeTo(0, 0.5, true);
                $('alarm-flash').classList.remove('on');
                A.alarm(false);
                c.mars.visible = c.earth.visible = false;
                c.moon.visible = true;
                c.moon.position.set(-60, 30, -700);
                c.caption('I made it out!', '');
                // the mothership faces us (lit from the front so we can see its angry face one last time)
                c.sun.position.set(-50, 60, -90);
                ms = createMothership();
                ms.position.set(0, 0, 0);
                c.addActor(ms, sp);
                ms.updateMatrixWorld(true);
                S.msFace = ms.localToWorld(V(0, -4, -100));
                const pd = createEscapePod();
                spPod = pd;
                c.addActor(pd.root, sp);
                pd.root.position.set(20, -12, -132);
                vel.set(0.1, 0.05, -1).normalize().multiplyScalar(30);
                aimNose(pd.root, vel.clone().normalize());
                A.engine(0.6);
                S.booms = 0;
            },
            update: (t, dt) => {
                spPod.root.position.addScaledVector(vel, dt);
                spPod.setThrust(2.2, t);
                aimNose(spPod.root, vel.clone().normalize());
                // little explosions popping along the hull, then the big one
                if (t < 3.6 && Math.random() < dt * 10) {
                    const lp = V(rand(-40, 40), rand(-10, 22), rand(-110, 120));
                    ms.localToWorld(lp);
                    c.sfx.spawn({ x: lp.x, y: lp.y, z: lp.z, life: 0.8, size: 6, size1: 18, color: 0xffd36a, color1: 0xff5a2a, alpha: 1, alpha1: 0, batch: 1 });
                    if (Math.random() < 0.3) A.play('explosion');
                }
                if (t > 3.6 && !S.bigBoom) {
                    S.bigBoom = true;
                    A.play('mothershipBoom');
                    c.flash(true, 1.2);
                    c.shake = 0.6;
                    ms.visible = false;
                    const glow = glowSprite(0xffe0a0, 10, 1);
                    glow.material.fog = false;
                    glow.position.copy(ms.position);
                    c.addActor(glow, sp);
                    S.boomGlow = glow;
                    shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffc07a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
                    shock.position.copy(ms.position);
                    shock.rotation.x = Math.PI / 2 - 0.2;
                    c.addActor(shock, sp);
                    for (let i = 0; i < 120; i++) {
                        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
                        const spd = rand(30, 110);
                        c.sfx.spawn({
                            x: ms.position.x, y: ms.position.y, z: ms.position.z,
                            vx: s * Math.cos(a) * spd, vy: u * spd, vz: s * Math.sin(a) * spd,
                            life: rand(1.5, 3.5), size: rand(6, 14), size1: rand(20, 40),
                            color: i % 3 ? 0xffb04a : 0xfff0c8, color1: 0x6a4a8a, alpha: 1, alpha1: 0, drag: 0.8, batch: i % 2,
                        });
                    }
                    c.caption('KA-BOOOOOM!!', 'big');
                }
                if (S.boomGlow) {
                    const k = t - 3.6;
                    const sz = k < 0.3 ? (k / 0.3) * 420 : 420 * Math.max(0, 1 - (k - 0.3) / 2.6);
                    S.boomGlow.scale.set(sz, sz, 1);
                    shock.scale.setScalar(20 + k * 260);
                    shock.material.opacity = Math.max(0, 1 - k / 2.4);
                }
                if (t > 2.0 && !S.byeBye) { S.byeBye = true; c.caption('Bye-bye, mothership!', ''); }
                // camera rides along just ahead of the pod, looking back at the mothership
                const p = spPod.root.position;
                const cam = p.clone().add(V(-15, 5, -30));
                c.lookFrom(cam, p.clone().lerp(S.msFace, 0.6));
            },
        },
        // 4 — next stop: the Moon (for real this time!)
        {
            dur: 6.5,
            start: () => {
                S.bigBoom = S.byeBye = false;
                c.sun.position.copy(c.sunHome);
                if (S.boomGlow) { S.boomGlow.visible = false; S.boomGlow = null; }
                if (shock) shock.visible = false;
                A.setMusic('theme');
                c.moon.visible = c.earth.visible = true;
                c.moon.position.set(-24, 12, -230);
                c.earth.position.set(-180, 70, -820);
                spPod.root.position.set(0, 0, 0);
                vel.copy(c.moon.position).normalize().multiplyScalar(12);
                aimNose(spPod.root, vel.clone().normalize());
                c.caption('Next stop... THE MOON.\nFor real this time!', 'big');
            },
            update: (t, dt) => {
                spPod.root.position.addScaledVector(vel, dt);
                spPod.setThrust(1.8, t);
                spPod.root.rotateZ(dt * 0.4);
                const p = spPod.root.position;
                c.lookFrom(V(p.x + 5 - t * 0.4, p.y + 2, p.z + 9), p.clone().addScaledVector(vel, 0.8));
                c.speedLines(dt, 40);
            },
        },
        // 5 — landing at the Moon base
        {
            dur: 10.5,
            fov: 50,
            start: () => {
                c.moon.visible = c.earth.visible = false;
                c.moonBase.visible = true;
                buildMoonBase(c);
                c.moonBase.add(spPod.root);
                spPod.root.position.set(0, 40, -20);
                spPod.root.rotation.set(Math.PI / 2, 0.6, 0, 'YXZ'); // nose up, landing on its thruster
                c.moonBase.add(astro.root);
                astro.root.visible = false;
                c.moonBase.add(flag);
                flag.position.set(-3.2, -0.5, -12);
                flag.scale.setScalar(0.01);
                c.actors.push(astro.root, flag);
                S.landedM = false;
                S.lookUp = 1.1; // the camera looks a little above the pad until the pod lands
                A.engine(0.6);
                c.caption('', '');
            },
            update: (t, dt) => {
                const s = spPod.root;
                const groundY = c.moonH(0, -20) + 2.35;
                if (!S.landedM) {
                    const k = clamp(t / 4, 0, 1);
                    s.position.y = lerp(40, groundY, easeOut(k));
                    spPod.setThrust(1.6, t);
                    if (Math.random() < dt * 25) {
                        const a = Math.random() * Math.PI * 2;
                        c.sfx.spawn({ x: Math.cos(a) * 2, y: 0.2, z: -20 + Math.sin(a) * 2, vx: Math.cos(a) * 6, vy: 0.5, vz: Math.sin(a) * 6, life: 1.5, size: 0.8, size1: 3, color: 0xbfbfc6, alpha: 0.7, alpha1: 0, drag: 1.2 });
                    }
                    if (k >= 1) {
                        S.landedM = true;
                        spPod.setThrust(0);
                        A.engine(0);
                        A.play('land');
                        for (let i = 0; i < 30; i++) {
                            const a = Math.random() * Math.PI * 2;
                            c.sfx.spawn({ x: Math.cos(a) * 2.5, y: 0.3, z: -20 + Math.sin(a) * 2.5, vx: Math.cos(a) * rand(3, 7), vy: rand(0.5, 2), vz: Math.sin(a) * rand(3, 7), life: 2.5, size: 1, size1: 3.5, color: 0xc8c8d0, alpha: 0.8, alpha1: 0, drag: 0.8, grav: 0.4 });
                        }
                        S.landT = t;
                    }
                } else {
                    const lt = t - S.landT;
                    if (lt > 0.8) {
                        astro.root.visible = true;
                        const k = clamp((lt - 0.8) / 2.2, 0, 1);
                        const ax = lerp(-1.2, -2.2, k), az = lerp(-18, -11.5, k);
                        astro.root.position.set(ax, c.moonH(ax, az) + Math.abs(Math.sin(lt * 5)) * 0.35 * (k >= 1 ? 0 : 1), az);
                        astro.root.rotation.y = 0.2;
                        astro.walk = k < 1 ? 1 : 0;
                    }
                    if (lt > 3.2) {
                        const fk = clamp((lt - 3.2) / 0.6, 0, 1);
                        flag.scale.setScalar(Math.max(0.01, easeOut(fk)));
                        flag.position.y = c.moonH(flag.position.x, flag.position.z) + lerp(-0.5, 0, fk);
                        if (!S.flagSnd) { S.flagSnd = true; A.play('fanfare'); c.caption('MISSION COMPLETE!', 'big'); }
                        astro.wave = Math.min(1, (lt - 3.6) * 2);
                    }
                    if (lt > 5.4 && !S.homeSaid) { S.homeSaid = true; c.caption('Home sweet Moon base!', ''); }
                    flag.cloth.rotation.y = Math.sin(t * 1.5) * 0.1;
                }
                astro.animate(dt);
                c.moonEarth.rotation.y += dt * 0.05;
                const camT = clamp(t / 10.5, 0, 1);
                S.lookUp = damp(S.lookUp, S.landedM ? 0 : 1.1, 4, dt);
                c.lookFrom(V(7 - camT * 2, 2.6 + camT * 1.2, -2 + camT * 4), V(-1, 2.2 + S.lookUp, -15));
            },
        },
        // 6 — THE END
        {
            dur: 4.5,
            fov: 50,
            start: () => {
                c.caption('THE END', 'big');
            },
            update: (t, dt) => {
                astro.animate(dt);
                flag.cloth.rotation.y = Math.sin(t * 1.5) * 0.1;
                const k = easeInOut(clamp(t / 4.5, 0, 1));
                c.lookFrom(V(5 - k * 2, 3.8 + k * 10, 2 + k * 14), V(-1, 2.2 + k * 6, -15 - k));
                if (t > 3.8 && !S.fading) { S.fading = true; c.fadeTo(1, 0.6); }
            },
        },
    ];
}

// A few domes, a landing pad and an antenna: the Moon base (made once, with the space scene)
export function buildMoonBase(c) {
    if (c.moonDomes) return;
    const b = new GeoBuilder();
    const H = (x, z) => c.moonH(x, z);
    for (const [x, z, r] of [[-15, -38, 5], [-25, -30, 3.6], [-8, -52, 4.2], [12, -46, 3.2]]) {
        const y = H(x, z) - 0.3;
        b.add(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2f0ea, { p: [x, y, z] });
        b.add(new THREE.CylinderGeometry(r * 1.02, r * 1.05, 0.5, 24), 0xff7a2e, { p: [x, y + 0.2, z] });
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            b.add(new THREE.SphereGeometry(0.35, 10, 8), 0x9fe8ff, { p: [x + Math.cos(a) * r * 0.82, y + r * 0.45, z + Math.sin(a) * r * 0.82] }, 1.2);
        }
    }
    // tunnels between the domes
    b.add(new THREE.CylinderGeometry(0.9, 0.9, 8, 12), 0xd8d4cc, { p: [-20, H(-20, -34) + 0.6, -34], r: [0, 0.6, Math.PI / 2], order: 'YXZ' });
    // landing pad + antenna
    b.add(new THREE.CylinderGeometry(4.5, 4.7, 0.25, 32), 0x8a8f99, { p: [0, H(0, -20) + 0.05, -20] });
    b.add(new THREE.TorusGeometry(3.6, 0.12, 6, 40), 0xffd166, { p: [0, H(0, -20) + 0.2, -20], r: [Math.PI / 2, 0, 0] }, 1.2);
    const ay = H(-30, -46);
    b.add(new THREE.CylinderGeometry(0.15, 0.25, 9, 8), 0xd8d4cc, { p: [-30, ay + 4.5, -46] });
    b.add(new THREE.SphereGeometry(0.4, 10, 8), 0xff4040, { p: [-30, ay + 9.2, -46] }, 1.8);
    b.add(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2f0ea, { p: [-30, ay + 7, -46], r: [0.8, 0, 0] });
    const m = new THREE.Mesh(b.build(), vcMat({ rim: 0.5 }));
    addOutline(m, 0x2a1424, 0.002);
    c.moonBase.add(m);
    c.moonDomes = m;
}
