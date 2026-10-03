// ============================================================
// DROPS — hearts and sticky grenades that pop out of defeated
// aliens (Minecraft style) and float until you walk into them.
// Used in the mothership (Mars keeps its own in level.js).
// ============================================================

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { heartGeometry } from './level.js';
import { toonMaterial, addOutline, glowSprite } from './toon.js';
import { rand } from './util.js';

const _tmp = new THREE.Vector3();

export class Drops {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.heartGeo = heartGeometry();
        this.heartMat = toonMaterial({ color: 0xff4d5e, rim: 0.7, rimColor: 0xffffff });
        this.grenMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff });
    }

    spawn(kind, pos, spread = 1.5) {
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
        const y = Math.max(0, g.world.groundAt(pos.x, pos.z));
        root.position.set(pos.x, Math.max(pos.y, y) + 0.8, pos.z);
        g.scene.add(root);
        this.list.push({
            kind, root, model: mesh, pos: root.position, t: 0, vy: 4, baseY: y + 0.6,
            vx: rand(-spread, spread), vz: rand(-spread, spread),
        });
    }

    remove(p) {
        this.game.scene.remove(p.root);
        const i = this.list.indexOf(p);
        if (i >= 0) this.list.splice(i, 1);
    }

    clear() {
        for (const p of [...this.list]) this.remove(p);
    }

    update(dt) {
        const g = this.game;
        const P = g.player;
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            p.t += dt;
            if (p.vy !== null) {
                // pop out, bounce off walls, land
                p.vy -= 12 * dt;
                p.pos.x += p.vx * dt;
                p.pos.z += p.vz * dt;
                p.pos.y += p.vy * dt;
                g.world.confineAlien(p.pos, 0.2);
                const gy = Math.max(0, g.world.groundAt(p.pos.x, p.pos.z)) + 0.6;
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
                    this.remove(p);
                } else if (p.kind === 'grenade' && P.grenades < PLAYER.maxGrenades) {
                    P.grenades++;
                    g.audio.play('pickup');
                    g.hud.toast('+1 Sticky Grenade', 1.5);
                    this.remove(p);
                }
            }
        }
    }
}
