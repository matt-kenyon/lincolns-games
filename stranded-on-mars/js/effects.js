// ============================================================
// EFFECTS — cel-shaded smoke puffs, glowing sparks, poofs,
// explosions, shockwaves. All particles are drawn with two
// instanced billboard batches (one draw call each).
// ============================================================

import * as THREE from 'three';
import { rand, clamp } from './util.js';

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

// ------------------------------------------------------------
// Instanced billboard batch
// ------------------------------------------------------------
const BB_VERT = /* glsl */`
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec2 iSize;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
#include <common>
#include <fog_pars_vertex>
void main() {
    vUv = position.xy + 0.5;
    vColor = iColor;
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    float vl = length(vv.xy);
    vec2 corner = position.xy;
    if (vl > 0.0001) {
        vec2 ax = vv.xy / vl;
        vec2 ay = vec2(-ax.y, ax.x);
        mvPosition.xy += ax * (corner.x * (vl + iSize.x) - vl * 0.5) + ay * corner.y * iSize.x;
    } else {
        float s = sin(iSize.y), c = cos(iSize.y);
        mvPosition.xy += vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iSize.x;
    }
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}`;

const GLOW_FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vColor;
#include <common>
#include <fog_pars_fragment>
void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    a *= a;
    float core = 1.0 - smoothstep(0.0, 0.32, d);
    vec3 col = (vColor.rgb * a + vec3(core) * 0.55) * vColor.a;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #ifdef USE_FOG
    gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
}`;

const SMOKE_FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vColor;
uniform float uFogScale;
#include <common>
#include <fog_pars_fragment>
void main() {
    vec2 p = vUv - 0.5;
    float d = length(p) * 2.0;
    if (d > 1.0) discard;
    float hl = 1.0 - smoothstep(0.6, 0.68, length(p * 2.0 - vec2(-0.26, 0.3)));
    vec3 col = mix(vColor.rgb * 0.74, vColor.rgb, hl);
    col *= mix(1.0, 0.86, smoothstep(0.84, 0.96, d));
    float a = vColor.a * (1.0 - smoothstep(0.92, 1.0, d));
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
    #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear * uFogScale, fogFar * uFogScale, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.85);
    #endif
}`;

export class BillboardBatch {
    constructor(max, mode, { fogScale = 1 } = {}) {
        this.max = max;
        this.count = 0;
        const geo = new THREE.InstancedBufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
        ]), 3));
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        const mk = (n) => {
            const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
            a.setUsage(THREE.DynamicDrawUsage);
            return a;
        };
        this.aPos = mk(3);
        this.aVel = mk(3);
        this.aSize = mk(2);
        this.aColor = mk(4);
        geo.setAttribute('iPos', this.aPos);
        geo.setAttribute('iVel', this.aVel);
        geo.setAttribute('iSize', this.aSize);
        geo.setAttribute('iColor', this.aColor);
        geo.instanceCount = 0;
        this.geo = geo;

        const glow = mode === 'glow';
        const mat = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFogScale: { value: fogScale } }]),
            vertexShader: BB_VERT,
            fragmentShader: glow ? GLOW_FRAG : SMOKE_FRAG,
            transparent: true,
            depthWrite: false,
            blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
            fog: true,
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = glow ? 12 : 10;
    }

    begin() {
        this.count = 0;
    }

    push(x, y, z, vx, vy, vz, size, rot, r, g, b, a) {
        if (this.count >= this.max) return;
        const i = this.count++;
        const P = this.aPos.array, V = this.aVel.array, S = this.aSize.array, C = this.aColor.array;
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
        V[i * 3] = vx; V[i * 3 + 1] = vy; V[i * 3 + 2] = vz;
        S[i * 2] = size; S[i * 2 + 1] = rot;
        C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a;
    }

    end() {
        const n = this.count;
        this.geo.instanceCount = n;
        for (const [attr, w] of [[this.aPos, 3], [this.aVel, 3], [this.aSize, 2], [this.aColor, 4]]) {
            attr.clearUpdateRanges();
            if (n > 0) attr.addUpdateRange(0, n * w);
            attr.needsUpdate = true;
        }
    }
}

// ------------------------------------------------------------
// Particle simulation
// ------------------------------------------------------------
class Particle {
    constructor() {
        this.x = this.y = this.z = 0;
        this.vx = this.vy = this.vz = 0;
        this.life = 0; this.max = 1;
        this.s0 = 1; this.s1 = 1;
        this.r0 = 1; this.g0 = 1; this.b0 = 1;
        this.r1 = 1; this.g1 = 1; this.b1 = 1;
        this.a0 = 1; this.a1 = 0;
        this.grav = 0; this.drag = 0;
        this.stretch = 0;
        this.rot = 0; this.rotV = 0;
        this.batch = 0;
        this.fadeIn = 0;
    }
}

export class Effects {
    constructor(scene) {
        this.scene = scene;
        this.smoke = new BillboardBatch(900, 'smoke');
        this.glow = new BillboardBatch(1200, 'glow');
        this.far = new BillboardBatch(260, 'smoke', { fogScale: 3.2 }); // big smoke column (visible from far)
        scene.add(this.smoke.mesh, this.glow.mesh, this.far.mesh);
        this.parts = [];
        this.pool = [];
        this.emitters = [];
        this.extra = []; // per-frame billboards pushed by other systems (bolts, etc.)

        // Flash light for explosions / muzzle
        this.flash = new THREE.PointLight(0xffc27a, 0, 22, 1.6);
        scene.add(this.flash);
        this.flashT = 0;

        // Shockwave / flash spheres
        this.rings = [];
        this.ringGeo = new THREE.RingGeometry(0.82, 1.0, 40);
        this.ringGeo.rotateX(-Math.PI / 2);
        this.sphereGeo = new THREE.SphereGeometry(1, 20, 14);
        this.columnGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
        this.columnGeo.translate(0, 0.5, 0);
    }

    // Generic particle spawn. Colors are hex numbers.
    spawn(o) {
        const p = this.pool.pop() || new Particle();
        p.x = o.x; p.y = o.y; p.z = o.z;
        p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
        p.life = 0;
        p.max = o.life || 1;
        p.s0 = o.size != null ? o.size : 1;
        p.s1 = o.size1 != null ? o.size1 : p.s0;
        _c1.set(o.color != null ? o.color : 0xffffff);
        _c2.set(o.color1 != null ? o.color1 : (o.color != null ? o.color : 0xffffff));
        p.r0 = _c1.r; p.g0 = _c1.g; p.b0 = _c1.b;
        p.r1 = _c2.r; p.g1 = _c2.g; p.b1 = _c2.b;
        p.a0 = o.alpha != null ? o.alpha : 1;
        p.a1 = o.alpha1 != null ? o.alpha1 : 0;
        p.grav = o.grav || 0;
        p.drag = o.drag || 0;
        p.stretch = o.stretch || 0;
        p.rot = o.rot || 0;
        p.rotV = o.rotV || 0;
        p.batch = o.batch || 0; // 0 smoke, 1 glow, 2 far smoke
        p.fadeIn = o.fadeIn || 0;
        this.parts.push(p);
        return p;
    }

    // ---------- Presets ----------

    // Minecraft-style "poof" when an alien is defeated
    poof(x, y, z, scale = 1) {
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(1.2, 3.2) * scale;
            this.spawn({
                x: x + rand(-0.4, 0.4) * scale, y: y + rand(0, 1.6) * scale, z: z + rand(-0.4, 0.4) * scale,
                vx: Math.cos(a) * sp, vy: rand(0.6, 2.6) * scale, vz: Math.sin(a) * sp,
                life: rand(0.7, 1.2), size: rand(0.5, 0.9) * scale, size1: rand(1.0, 1.6) * scale,
                color: 0xffffff, color1: 0xd8d0d8, alpha: 0.95, alpha1: 0, drag: 2.6, grav: -0.6,
            });
        }
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            this.spawn({
                x, y: y + rand(0.4, 1.6) * scale, z,
                vx: Math.cos(a) * rand(2, 5), vy: rand(1, 4), vz: Math.sin(a) * rand(2, 5),
                life: rand(0.4, 0.8), size: rand(0.18, 0.32), size1: 0.05,
                color: 0x9fe8ff, color1: 0x6fa8ff, alpha: 1, alpha1: 0, drag: 1.5, grav: 3, batch: 1,
            });
        }
    }

    sparks(x, y, z, color = 0xffd27a, count = 10, speed = 6, size = 0.12) {
        for (let i = 0; i < count; i++) {
            const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
            const s = Math.sqrt(1 - u * u);
            const sp = rand(0.4, 1) * speed;
            this.spawn({
                x, y, z,
                vx: s * Math.cos(th) * sp, vy: u * sp + speed * 0.3, vz: s * Math.sin(th) * sp,
                life: rand(0.25, 0.55), size, size1: size * 0.3, color, color1: color,
                alpha: 1, alpha1: 0, grav: 12, drag: 1.2, batch: 1, stretch: 0.045,
            });
        }
    }

    dust(x, y, z, count = 6, spread = 0.6, color = 0xd99a74, size = 0.5) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(0.6, 2.2);
            this.spawn({
                x: x + Math.cos(a) * spread * Math.random(), y: y + 0.15, z: z + Math.sin(a) * spread * Math.random(),
                vx: Math.cos(a) * sp, vy: rand(0.3, 1.2), vz: Math.sin(a) * sp,
                life: rand(0.6, 1.1), size: size * rand(0.6, 1), size1: size * rand(1.4, 2.2),
                color, color1: color, alpha: 0.7, alpha1: 0, drag: 2.5,
            });
        }
    }

    glowFlash(x, y, z, color, size, life = 0.15) {
        this.spawn({ x, y, z, life, size, size1: size * 1.3, color, color1: color, alpha: 1, alpha1: 0, batch: 1 });
    }

    lightFlash(x, y, z, color, intensity = 40, dur = 0.25) {
        this.flash.position.set(x, y, z);
        this.flash.color.set(color);
        this.flash.intensity = intensity;
        this.flashI = intensity;
        this.flashT = dur;
        this.flashDur = dur;
    }

    explosion(x, y, z, radius = 6, color = 0x6fd8ff) {
        this.lightFlash(x, y + 1, z, color, 120, 0.4);
        this.glowFlash(x, y + 0.5, z, 0xffffff, radius * 1.5, 0.18);
        this.glowFlash(x, y + 0.5, z, color, radius * 2.6, 0.45);
        this.sparks(x, y + 0.5, z, color, 26, 14, 0.22);
        this.sparks(x, y + 0.5, z, 0xffffff, 12, 10, 0.14);
        for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(2, 6);
            this.spawn({
                x: x + Math.cos(a) * 0.5, y: y + rand(0.2, 1.5), z: z + Math.sin(a) * 0.5,
                vx: Math.cos(a) * sp, vy: rand(1, 4), vz: Math.sin(a) * sp,
                life: rand(0.8, 1.5), size: rand(0.8, 1.4), size1: rand(2, 3.2),
                color: 0xffffff, color1: 0xb9b0c0, alpha: 0.9, alpha1: 0, drag: 2.2, grav: -0.8,
            });
        }
        this.ring(x, y + 0.15, z, color, radius * 1.3, 0.45);
        this.sphereFlash(x, y + 0.6, z, color, radius * 0.8, 0.3);
    }

    // Big fiery explosion (ship crash in the intro)
    bigBoom(x, y, z, scale = 1) {
        this.lightFlash(x, y + 3, z, 0xffa040, 300, 0.8);
        this.glowFlash(x, y + 3, z, 0xffffff, 20 * scale, 0.3);
        this.glowFlash(x, y + 3, z, 0xff9a30, 40 * scale, 0.9);
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(4, 14) * scale;
            this.spawn({
                x, y: y + rand(0, 4), z,
                vx: Math.cos(a) * sp, vy: rand(4, 14) * scale, vz: Math.sin(a) * sp,
                life: rand(1.2, 2.4), size: rand(2, 4) * scale, size1: rand(6, 10) * scale,
                color: 0xffb04a, color1: 0x6a5a60, alpha: 1, alpha1: 0, drag: 1.6, grav: -1, batch: 2,
            });
        }
        this.sparks(x, y + 2, z, 0xffc070, 40, 24 * scale, 0.5 * scale);
    }

    ring(x, y, z, color, radius, life) {
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        });
        const m = new THREE.Mesh(this.ringGeo, mat);
        m.position.set(x, y, z);
        this.scene.add(m);
        this.rings.push({ m, t: 0, life, r: radius });
    }

    sphereFlash(x, y, z, color, radius, life) {
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const m = new THREE.Mesh(this.sphereGeo, mat);
        m.position.set(x, y, z);
        this.scene.add(m);
        this.rings.push({ m, t: 0, life, r: radius, sphere: true });
    }

    // Column of light (aliens teleporting in)
    beamColumn(x, y, z, color, radius, height, life) {
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        });
        const m = new THREE.Mesh(this.columnGeo, mat);
        m.position.set(x, y, z);
        m.renderOrder = 12;
        this.scene.add(m);
        this.rings.push({ m, t: 0, life, r: radius, h: height, column: true });
    }

    // Continuous emitters (smoke column, fires, campfire)
    addEmitter(e) {
        e.acc = 0;
        e.on = e.on !== false;
        this.emitters.push(e);
        return e;
    }

    removeEmitter(e) {
        const i = this.emitters.indexOf(e);
        if (i >= 0) this.emitters.splice(i, 1);
    }

    // Other systems can push one-frame billboards here (bolts, beams)
    // fn(glowBatch, smokeBatch) called each frame during build
    addDrawer(fn) {
        this.extra.push(fn);
    }

    clearParticles() {
        for (const p of this.parts) this.pool.push(p);
        this.parts.length = 0;
    }

    update(dt) {
        // emitters
        for (const e of this.emitters) {
            if (!e.on) continue;
            e.acc += dt * e.rate;
            while (e.acc >= 1) {
                e.acc -= 1;
                e.emit(this);
            }
        }

        // particles
        const parts = this.parts;
        let w = 0;
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            p.life += dt;
            if (p.life >= p.max) {
                this.pool.push(p);
                continue;
            }
            const dr = Math.exp(-p.drag * dt);
            p.vx *= dr; p.vy *= dr; p.vz *= dr;
            p.vy -= p.grav * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            p.rot += p.rotV * dt;
            parts[w++] = p;
        }
        parts.length = w;

        this.smoke.begin();
        this.glow.begin();
        this.far.begin();
        for (const p of parts) {
            const t = p.life / p.max;
            const size = p.s0 + (p.s1 - p.s0) * t;
            let a = p.a0 + (p.a1 - p.a0) * t;
            if (p.fadeIn > 0) a *= clamp(p.life / p.fadeIn, 0, 1);
            const r = p.r0 + (p.r1 - p.r0) * t;
            const g = p.g0 + (p.g1 - p.g0) * t;
            const b = p.b0 + (p.b1 - p.b0) * t;
            const batch = p.batch === 1 ? this.glow : p.batch === 2 ? this.far : this.smoke;
            const st = p.stretch;
            batch.push(p.x, p.y, p.z, p.vx * st, p.vy * st, p.vz * st, size, p.rot, r, g, b, a);
        }
        for (const fn of this.extra) fn(this.glow, this.smoke);
        this.smoke.end();
        this.glow.end();
        this.far.end();

        // rings & flashes
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const R = this.rings[i];
            R.t += dt;
            const t = R.t / R.life;
            if (t >= 1) {
                this.scene.remove(R.m);
                R.m.material.dispose();
                this.rings.splice(i, 1);
                continue;
            }
            if (R.column) {
                // shoots up fast, then thins out
                const w = R.r * (1 - t * 0.75);
                R.m.scale.set(w, R.h * Math.min(1, t * 6), w);
                R.m.material.opacity = (1 - t) * (1 - t) * 0.85;
                continue;
            }
            const s = R.r * (R.sphere ? 0.4 + t * 0.6 : 0.2 + t * 0.8);
            R.m.scale.setScalar(s);
            R.m.material.opacity = (1 - t) * (R.sphere ? 0.7 : 0.9);
        }

        if (this.flashT > 0) {
            this.flashT -= dt;
            this.flash.intensity = Math.max(0, this.flashI * (this.flashT / this.flashDur));
        } else {
            this.flash.intensity = 0;
        }
    }
}

// ------------------------------------------------------------
// Vertical light beam (marks ship parts from far away)
// ------------------------------------------------------------
export function makeBeam(color = 0xffe08a, height = 60, radius = 0.7) {
    const geo = new THREE.CylinderGeometry(radius, radius * 1.6, height, 16, 1, true);
    geo.translate(0, height / 2, 0);
    const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uH: { value: height }, uFade: { value: 1 } },
        vertexShader: /* glsl */`
            varying float vY;
            varying vec3 vN;
            varying vec3 vV;
            uniform float uH;
            void main() {
                vY = position.y / uH;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vN = normalize(normalMatrix * normal);
                vV = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            varying float vY;
            varying vec3 vN;
            varying vec3 vV;
            uniform vec3 uColor;
            uniform float uTime;
            uniform float uFade;
            void main() {
                float edge = pow(clamp(abs(dot(vN, vV)), 0.0, 1.0), 1.5);
                float a = (1.0 - vY) * (1.0 - vY) * (0.25 + edge * 0.75);
                a *= 0.75 + 0.25 * sin(uTime * 3.0 - vY * 12.0);
                gl_FragColor = vec4(uColor * a * 0.42 * uFade, 1.0);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 11;
    return m;
}
