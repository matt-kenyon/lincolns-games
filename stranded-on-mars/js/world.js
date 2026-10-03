// ============================================================
// WORLD — sky, light, haze, terrain, props and set pieces
// ============================================================

import * as THREE from 'three';
import { Terrain, Colliders } from './terrain.js';
import { toonMaterial, toonRamp, GeoBuilder, vcMat, addOutline, glowSprite, shared } from './toon.js';
import {
    PATH, GATES, GATE_INDICES, CAMP, ARCH, TOWER, ICE_LAKE, REGIONS, PART_SPOTS, ZONES, SHIP,
    pathQuery, pathPointAt, PATH_LENGTH, START, WORLD,
} from './layout.js';
import { makeRng, fbm2, perlin2, smoothstep, clamp, lerp, rand } from './util.js';
import { buildShip } from './ship.js';

export const SUN_DIR = new THREE.Vector3(-0.5, 0.62, 0.6).normalize();
export const SKY = {
    top: 0x6c84b6,
    mid: 0xdfa98f,
    horizon: 0xf3c7a4,
    bottom: 0xd59576,
    sun: 0xfff1d0,
    fog: 0xeebb98,
};

const TILE = 128;

// ------------------------------------------------------------
// Static batcher: merges many placed copies of template geometry
// into one mesh per (tile, material) so the world is cheap to draw.
// ------------------------------------------------------------
class Batcher {
    constructor() {
        this.groups = new Map();
    }
    add(matKey, template, matrix, swayScale = 0, tint = null) {
        const tx = Math.floor(matrix.elements[12] / TILE);
        const tz = Math.floor(matrix.elements[14] / TILE);
        const key = matKey + '|' + tx + '|' + tz;
        let g = this.groups.get(key);
        if (!g) {
            g = { matKey, items: [], verts: 0 };
            this.groups.set(key, g);
        }
        g.items.push({ template, matrix: matrix.clone(), swayScale, tint });
        g.verts += template.attributes.position.count;
    }
    build(materials, scene, opts = {}) {
        const v = new THREE.Vector3();
        const n = new THREE.Vector3();
        const nm = new THREE.Matrix3();
        const meshes = [];
        for (const g of this.groups.values()) {
            const pos = new Float32Array(g.verts * 3);
            const nor = new Float32Array(g.verts * 3);
            const col = new Float32Array(g.verts * 3);
            const glw = new Float32Array(g.verts);
            const sw = new Float32Array(g.verts);
            let o = 0;
            for (const it of g.items) {
                const T = it.template;
                const P = T.attributes.position.array, N = T.attributes.normal.array;
                const Cc = T.attributes.color.array, G = T.attributes.glow ? T.attributes.glow.array : null;
                nm.getNormalMatrix(it.matrix);
                const cnt = T.attributes.position.count;
                for (let i = 0; i < cnt; i++) {
                    v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
                    const ly = v.y;
                    v.applyMatrix4(it.matrix);
                    n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyMatrix3(nm).normalize();
                    const k = (o + i) * 3;
                    pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
                    nor[k] = n.x; nor[k + 1] = n.y; nor[k + 2] = n.z;
                    let r = Cc[i * 3], gg = Cc[i * 3 + 1], b = Cc[i * 3 + 2];
                    if (it.tint) { r *= it.tint[0]; gg *= it.tint[1]; b *= it.tint[2]; }
                    col[k] = r; col[k + 1] = gg; col[k + 2] = b;
                    glw[o + i] = G ? G[i] : 0;
                    sw[o + i] = Math.max(0, ly) * it.swayScale;
                }
                o += cnt;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
            geo.setAttribute('glow', new THREE.BufferAttribute(glw, 1));
            geo.setAttribute('swayW', new THREE.BufferAttribute(sw, 1));
            geo.computeBoundingSphere();
            const m = new THREE.Mesh(geo, materials[g.matKey]);
            const mo = opts[g.matKey] || {};
            m.castShadow = mo.cast !== false;
            m.receiveShadow = true;
            m.matrixAutoUpdate = false;
            scene.add(m);
            meshes.push(m);
        }
        return meshes;
    }
}

// ------------------------------------------------------------
// Template geometry builders
// ------------------------------------------------------------
function rockTemplate(seed, palette) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const r = 1 + perlin2(v.x * 1.6 + seed * 3.1, v.z * 1.6 + v.y * 1.3 - seed) * 0.28;
        v.multiplyScalar(r);
        v.y *= 0.72;
        if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.25;
        p.setXYZ(i, v.x, v.y, v.z);
    }
    const b = new GeoBuilder();
    b.add(g, [palette.side, (pos, i, c) => {
        const y = pos.getY(i);
        if (y > 0.35) c.set(palette.top);
        else if (y < -0.12) c.set(palette.bottom);
        else c.set(palette.side);
    }], {}, 0, true);
    return b.build();
}

function tubeCoral(rng) {
    const b = new GeoBuilder();
    const n = rng.int(4, 7);
    for (let i = 0; i < n; i++) {
        const h = rng.range(0.5, 1.5);
        const r = rng.range(0.07, 0.13);
        const a = rng() * Math.PI * 2, d = rng.range(0, 0.35);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        b.add(new THREE.CylinderGeometry(r, r * 1.3, h, 5, 1, true), 0x3eb2a4, { p: [x, h / 2, z], r: [rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15)] });
        b.add(new THREE.SphereGeometry(r * 1.25, 6, 4), 0xa8fff0, { p: [x, h, z] }, 1.0);
    }
    return b.build();
}

function bulbPlant(rng) {
    const b = new GeoBuilder();
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
        const h = rng.range(0.8, 1.7);
        const a = rng() * Math.PI * 2, d = rng.range(0, 0.3);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const lean = rng.range(-0.25, 0.25);
        b.add(new THREE.CylinderGeometry(0.035, 0.06, h, 4, 1, true), 0x6a3f98, { p: [x + lean * h * 0.5, h / 2, z], r: [0, 0, -lean] });
        b.add(new THREE.SphereGeometry(rng.range(0.16, 0.24), 8, 6), 0xff74bd, { p: [x + lean * h, h, z], s: [1, 1.15, 1] }, 0.9);
        b.add(new THREE.ConeGeometry(0.16, 0.3, 5, 1, true), 0x3f9a7a, { p: [x, 0.12, z], r: [Math.PI, 0, 0] });
    }
    return b.build();
}

function succulent(rng) {
    const b = new GeoBuilder();
    const n = rng.int(7, 11);
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const tilt = rng.range(0.35, 0.8);
        const h = rng.range(0.4, 0.75);
        b.add(new THREE.ConeGeometry(0.09, h, 4, 1, true), [0x3f8f9a, (p, k, c) => c.set(p.getY(k) > h * 0.6 ? 0x9ee6d4 : 0x3f8f9a)],
            { p: [Math.cos(a) * 0.12, h * 0.42, Math.sin(a) * 0.12], r: [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt], order: 'XZY' });
    }
    b.add(new THREE.SphereGeometry(0.12, 6, 4), 0xffd166, { p: [0, 0.18, 0] }, 0.8);
    return b.build();
}

function rustGrass(rng) {
    const b = new GeoBuilder();
    const n = rng.int(6, 10);
    for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const h = rng.range(0.35, 0.7);
        b.add(new THREE.ConeGeometry(0.05, h, 3, 1, true), [0xc8603a, (p, k, c) => c.set(p.getY(k) > h * 0.3 ? 0xf0a46a : 0xb5502f)],
            { p: [Math.cos(a) * 0.15, h / 2, Math.sin(a) * 0.15], r: [rng.range(-0.4, 0.4), a, rng.range(-0.4, 0.4)] });
    }
    return b.build();
}

function mushroom(rng) {
    const b = new GeoBuilder();
    const h = rng.range(1.2, 2.6);
    const r = rng.range(0.6, 1.1);
    b.add(new THREE.CylinderGeometry(0.12 * r, 0.2 * r, h, 6, 1, true), 0xe6dcf0, { p: [0, h / 2, 0] });
    b.add(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x8f5ad8, { p: [0, h - 0.05, 0], s: [1, 0.55, 1] });
    for (let i = 0; i < 5; i++) {
        const a = rng() * Math.PI * 2, d = rng.range(0.2, 0.7) * r;
        b.add(new THREE.SphereGeometry(0.1 * r, 5, 3), 0xffe3ff, { p: [Math.cos(a) * d, h + 0.42 * r * Math.sqrt(1 - (d / r) ** 2) - 0.05, Math.sin(a) * d], s: [1, 0.4, 1] }, 0.6);
    }
    return b.build();
}

function crystalCluster(rng, colors, scale = 1) {
    const b = new GeoBuilder();
    const n = rng.int(3, 7);
    for (let i = 0; i < n; i++) {
        const h = rng.range(0.6, 1.8) * scale;
        const w = rng.range(0.14, 0.3) * scale;
        const a = rng() * Math.PI * 2;
        const lean = i === 0 ? 0 : rng.range(0.2, 0.6);
        b.add(new THREE.OctahedronGeometry(1, 0), rng.pick(colors),
            { p: [Math.cos(a) * w * 1.2 * (i ? 1 : 0), h * 0.4, Math.sin(a) * w * 1.2 * (i ? 1 : 0)], s: [w, h, w], r: [Math.cos(a) * lean, rng() * 3, Math.sin(a) * lean] },
            rng.range(0.35, 0.7), true);
    }
    return b.build();
}

// Alien emblem texture (banners + flag)
let _emblem = null;
export function emblemTexture() {
    if (_emblem) return _emblem;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#6a2fa0';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#4c1f78';
    g.fillRect(0, 0, 256, 24);
    g.fillRect(0, 232, 256, 24);
    g.strokeStyle = '#ffd166';
    g.fillStyle = '#ffd166';
    g.lineWidth = 12;
    g.beginPath();
    g.arc(128, 128, 62, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        g.beginPath();
        g.moveTo(128 + Math.cos(a) * 20, 128 + Math.sin(a) * 20);
        g.lineTo(128 + Math.cos(a - 0.35) * 92, 128 + Math.sin(a - 0.35) * 92);
        g.lineTo(128 + Math.cos(a + 0.35) * 92, 128 + Math.sin(a + 0.35) * 92);
        g.closePath();
        g.fill();
    }
    g.beginPath();
    g.arc(128, 128, 16, 0, Math.PI * 2);
    g.fillStyle = '#6ff0ff';
    g.fill();
    _emblem = new THREE.CanvasTexture(c);
    _emblem.colorSpace = THREE.SRGBColorSpace;
    return _emblem;
}

// ------------------------------------------------------------
// Hex-pattern energy shield material (force fields + ship dome)
// ------------------------------------------------------------
export function shieldMaterial(color, scaleU, scaleV) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uTime: shared.uTime,
            uOn: { value: 1 },
            uScale: { value: new THREE.Vector2(scaleU, scaleV) },
            uFlash: { value: 0 },
        },
        vertexShader: /* glsl */`
            varying vec2 vUv;
            varying vec3 vN;
            varying vec3 vV;
            void main() {
                vUv = uv;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vN = normalize(normalMatrix * normal);
                vV = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            varying vec2 vUv;
            varying vec3 vN;
            varying vec3 vV;
            uniform vec3 uColor;
            uniform float uTime;
            uniform float uOn;
            uniform float uFlash;
            uniform vec2 uScale;
            float hexDist(vec2 p) {
                p = abs(p);
                return max(dot(p, normalize(vec2(1.0, 1.732))), p.x);
            }
            void main() {
                vec2 uv = vUv * uScale;
                vec2 r = vec2(1.0, 1.732);
                vec2 h = r * 0.5;
                vec2 a = mod(uv, r) - h;
                vec2 b = mod(uv - h, r) - h;
                vec2 gv = dot(a, a) < dot(b, b) ? a : b;
                vec2 id = uv - gv;
                float edge = smoothstep(0.43, 0.49, hexDist(gv));
                float pulse = 0.5 + 0.5 * sin(uTime * 2.4 + id.x * 0.8 + id.y * 0.6);
                float fres = 1.0 - abs(dot(vN, vV));
                float sweep = smoothstep(0.06, 0.0, abs(fract(vUv.y * 0.6 - uTime * 0.22) - 0.5));
                float alpha = 0.13 + fres * 0.12 + edge * (0.2 + 0.25 * pulse) + sweep * 0.2;
                alpha *= smoothstep(1.0, 0.8, vUv.y);
                alpha = max(alpha, smoothstep(0.04, 0.0, vUv.y) * 0.8);
                alpha = clamp(alpha * uOn + uFlash * 0.5, 0.0, 1.0);
                vec3 col = mix(uColor * 0.55, mix(uColor, vec3(1.0), 0.55), edge + sweep * 0.5);
                col = mix(col, vec3(1.0), uFlash);
                gl_FragColor = vec4(col, alpha);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
}

// ============================================================
export class World {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.terrain = new Terrain();
        this.colliders = new Colliders(10);
        this.gates = [];
        this.emissives = [];
        this.time = 0;
    }

    build(progress = () => {}) {
        progress(0.05, 'Shaping canyons...');
        this.terrain.build((p) => progress(0.05 + p * 0.45, 'Shaping canyons...'));
        for (const m of this.terrain.meshes) this.scene.add(m);
        progress(0.55, 'Painting the sky...');
        this.buildSky();
        this.buildLights();
        this.buildBackdrop();
        progress(0.62, 'Scattering rocks...');
        this.buildSetPieces();
        this.scatter();
        progress(0.85, 'Crashing the ship...');
        this.buildGates();
        this.buildCrashSite();
        progress(0.95, 'Almost there...');
    }

    groundAt(x, z) {
        return this.terrain.heightAt(x, z);
    }

    // --------------------------------------------------------
    // Sky dome (gradient, sun, wispy clouds, Phobos + Deimos)
    // --------------------------------------------------------
    buildSky() {
        const group = new THREE.Group();
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTop: { value: new THREE.Color(SKY.top) },
                uMid: { value: new THREE.Color(SKY.mid) },
                uHorizon: { value: new THREE.Color(SKY.horizon) },
                uBottom: { value: new THREE.Color(SKY.bottom) },
                uSunDir: { value: SUN_DIR.clone() },
                uSunColor: { value: new THREE.Color(SKY.sun) },
                uTime: shared.uTime,
            },
            vertexShader: /* glsl */`
                varying vec3 vDir;
                void main() {
                    vDir = position;
                    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    gl_Position = p.xyww;
                }`,
            fragmentShader: /* glsl */`
                varying vec3 vDir;
                uniform vec3 uTop, uMid, uHorizon, uBottom, uSunDir, uSunColor;
                uniform float uTime;
                float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
                float noise(vec2 p) {
                    vec2 i = floor(p), f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
                }
                float fbm(vec2 p) {
                    float s = 0.0, a = 0.5;
                    for (int i = 0; i < 4; i++) { s += noise(p) * a; p = p * 2.07 + 13.1; a *= 0.5; }
                    return s;
                }
                void main() {
                    vec3 d = normalize(vDir);
                    float h = d.y;
                    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
                    col = mix(col, uTop, smoothstep(0.18, 0.85, h));
                    col = mix(col, uBottom, smoothstep(0.0, -0.12, h));
                    float sd = max(dot(d, uSunDir), 0.0);
                    // soft sun halo + crisp disc (cel style)
                    col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 60.0) * 0.35);
                    col = mix(col, vec3(1.0, 0.98, 0.92), smoothstep(0.9988, 0.9992, sd));
                    // wispy high clouds
                    if (h > 0.0) {
                        vec2 uv = d.xz / (h + 0.18);
                        uv = uv * vec2(0.55, 1.6) + vec2(uTime * 0.006, 0.0);
                        float c = fbm(uv * 1.3);
                        float cl = smoothstep(0.52, 0.66, c) * smoothstep(0.02, 0.25, h);
                        float lit = 0.75 + 0.25 * smoothstep(0.5, 0.8, fbm(uv * 1.3 + vec2(0.06, 0.04)));
                        vec3 cc = mix(uHorizon, vec3(1.0, 0.95, 0.9), 0.6) * lit;
                        col = mix(col, cc, cl * 0.7);
                    }
                    gl_FragColor = vec4(col, 1.0);
                    #include <colorspace_fragment>
                }`,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            fog: false,
        });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 20), mat);
        dome.renderOrder = -1000;
        dome.frustumCulled = false;
        group.add(dome);

        // Phobos and Deimos (Mars has two little potato moons!) — painted sprites
        const moonTex = (seed) => {
            const c = document.createElement('canvas');
            c.width = c.height = 128;
            const x = c.getContext('2d');
            const r = makeRng(seed);
            x.save();
            x.beginPath();
            x.ellipse(64, 64, 56, 46, r() * 0.6, 0, Math.PI * 2);
            x.clip();
            x.fillStyle = '#f3e3d8';
            x.fillRect(0, 0, 128, 128);
            x.fillStyle = 'rgba(190, 150, 160, 0.45)';
            for (let i = 0; i < 7; i++) {
                x.beginPath();
                x.arc(r.range(30, 98), r.range(30, 98), r.range(5, 13), 0, Math.PI * 2);
                x.fill();
            }
            // shadowed side (lit from the sun's side)
            const grd = x.createLinearGradient(20, 0, 128, 40);
            grd.addColorStop(0, 'rgba(160, 120, 150, 0)');
            grd.addColorStop(0.55, 'rgba(160, 120, 150, 0)');
            grd.addColorStop(0.75, 'rgba(150, 110, 145, 0.75)');
            x.fillStyle = grd;
            x.fillRect(0, 0, 128, 128);
            x.restore();
            const t = new THREE.CanvasTexture(c);
            t.colorSpace = THREE.SRGBColorSpace;
            return t;
        };
        const mk = (size, dir, seed) => {
            const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex(seed), transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, fog: false }));
            m.position.copy(dir).normalize().multiplyScalar(40);
            m.scale.set(size, size, 1);
            m.renderOrder = -999;
            m.frustumCulled = false;
            group.add(m);
            return m;
        };
        this.phobos = mk(2.2, new THREE.Vector3(0.45, 0.5, -0.74), 1);
        this.deimos = mk(0.9, new THREE.Vector3(-0.5, 0.62, -0.6), 7);
        this.skyGroup = group;
        this.skyMat = mat;
        this.scene.add(group);
    }

    buildLights() {
        this.hemi = new THREE.HemisphereLight(0xc9b2e6, 0xa65a43, 1.75);
        this.scene.add(this.hemi);
        const sun = new THREE.DirectionalLight(0xfff0da, 2.75);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera;
        sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60;
        sc.near = 1; sc.far = 400;
        sun.shadow.bias = -0.0005;
        sun.shadow.normalBias = 0.05;
        sun.shadow.radius = 2;
        this.sun = sun;
        this.scene.add(sun, sun.target);
        this.scene.fog = new THREE.Fog(SKY.fog, 70, 620);
        // light-space basis for texel snapping
        this._lz = SUN_DIR.clone();
        this._lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), this._lz).normalize();
        this._ly = new THREE.Vector3().crossVectors(this._lz, this._lx);
    }

    followShadow(focus) {
        const sc = this.sun.shadow.camera;
        const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
        const u = Math.round(focus.dot(this._lx) / texel) * texel;
        const v = Math.round(focus.dot(this._ly) / texel) * texel;
        const w = focus.dot(this._lz);
        const t = this.sun.target.position;
        t.copy(this._lx).multiplyScalar(u).addScaledVector(this._ly, v).addScaledVector(this._lz, w);
        this.sun.position.copy(t).addScaledVector(SUN_DIR, 200);
        this.sun.target.updateMatrixWorld();
    }

    // --------------------------------------------------------
    // Distant painted mesas + Olympus Mons (no fog, pre-hazed)
    // --------------------------------------------------------
    buildBackdrop() {
        const rng = makeRng(99);
        const haze = new THREE.Color(SKY.horizon);
        const lit = new THREE.Color(0xd98a64);
        const shade = new THREE.Color(0x9a6a8a);
        const center = new THREE.Vector3(0, 0, -330);
        const pos = [], col = [];
        const tmpC = new THREE.Color();
        const addMesh = (geo, hazeAmt) => {
            const g = geo.toNonIndexed();
            g.computeVertexNormals();
            const P = g.attributes.position, N = g.attributes.normal;
            for (let i = 0; i < P.count; i++) {
                pos.push(P.getX(i), P.getY(i), P.getZ(i));
                const nl = N.getX(i) * SUN_DIR.x + N.getY(i) * SUN_DIR.y + N.getZ(i) * SUN_DIR.z;
                tmpC.copy(nl > 0.05 ? lit : shade);
                if (N.getY(i) > 0.9) tmpC.lerp(lit, 0.5).offsetHSL(0, 0, 0.04);
                tmpC.lerp(haze, hazeAmt);
                col.push(tmpC.r, tmpC.g, tmpC.b);
            }
        };
        const N = 46;
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2 + rng.range(-0.05, 0.05);
            const R = rng.range(760, 1250);
            const x = center.x + Math.cos(a) * R * 0.75;
            const z = center.z + Math.sin(a) * R;
            const h = rng.range(45, 150);
            const r = rng.range(70, 210);
            const tiers = rng.int(1, 3);
            const zsc = rng.range(0.5, 1);
            const rot = rng() * Math.PI;
            const segs = rng.int(6, 9);
            const hazeAmt = clamp(0.35 + (Math.hypot(x, z - center.z) - 700) / 1400, 0.35, 0.85);
            let baseY = 8;
            for (let t = 0; t < tiers; t++) {
                const th = t === 0 ? h * 0.6 : (h * 0.4) / (tiers - 1);
                const tr = r * (1 - t * 0.3);
                const g = new THREE.CylinderGeometry(tr * 0.85, tr, th, segs, 1);
                g.scale(1, 1, zsc);
                g.rotateY(rot);
                g.translate(x + (t ? rng.range(-0.15, 0.15) * r : 0), baseY + th / 2, z);
                addMesh(g, hazeAmt);
                baseY += th;
            }
        }
        // Olympus Mons, the biggest volcano in the solar system, far to the north-west
        const om = new THREE.CylinderGeometry(160, 1300, 230, 48, 3);
        om.translate(-1500, 0, -2300);
        addMesh(om, 0.82);
        const cal = new THREE.CylinderGeometry(120, 165, 12, 32, 1);
        cal.translate(-1500, 118, -2300);
        addMesh(cal, 0.84);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
        mesh.renderOrder = -900;
        this.scene.add(mesh);

        // Skirt plains around the terrain so high camera shots don't see an edge
        const skirtMat = toonMaterial({ color: 0xc87a52, cache: false });
        const { x0, x1, z0, z1 } = WORLD;
        const big = 3000, y = 24;
        const quads = [
            [x0 - big, x0 + 2, z0 - big, z1 + big],
            [x1 - 2, x1 + big, z0 - big, z1 + big],
            [x0, x1, z0 - big, z0 + 2],
            [x0, x1, z1 - 2, z1 + big],
        ];
        for (const [ax, bx, az, bz] of quads) {
            const g = new THREE.PlaneGeometry(bx - ax, bz - az);
            g.rotateX(-Math.PI / 2);
            g.translate((ax + bx) / 2, y, (az + bz) / 2);
            const m = new THREE.Mesh(g, skirtMat);
            m.receiveShadow = false;
            this.scene.add(m);
        }
    }

    // --------------------------------------------------------
    // Set pieces for each zone
    // --------------------------------------------------------
    buildSetPieces() {
        this.buildLandingSite();
        this.buildArch();
        this.buildCamp();
        this.buildIceLake();
        this.buildTower();
        this.buildCrystalSpires();
    }

    addStatic(mesh, outline = true, thick = 0.003) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (outline) addOutline(mesh, 0x2a1424, thick);
        this.scene.add(mesh);
        return mesh;
    }

    buildLandingSite() {
        // Ejection seat that the pilot rode down in
        const b = new GeoBuilder();
        b.add(new THREE.BoxGeometry(1.0, 0.25, 1.0), 0x5d6672, { p: [0, 0.3, 0] });
        b.add(new THREE.BoxGeometry(0.85, 0.18, 0.8), 0xff7a2e, { p: [0, 0.5, 0.05] });
        b.add(new THREE.BoxGeometry(1.0, 1.3, 0.22), 0x5d6672, { p: [0, 1.05, -0.45] });
        b.add(new THREE.BoxGeometry(0.85, 1.05, 0.12), 0xff7a2e, { p: [0, 1.05, -0.3] });
        b.add(new THREE.BoxGeometry(0.12, 0.7, 0.9), 0x48505b, { p: [-0.55, 0.65, 0] });
        b.add(new THREE.BoxGeometry(0.12, 0.7, 0.9), 0x48505b, { p: [0.55, 0.65, 0] });
        b.add(new THREE.CylinderGeometry(0.18, 0.24, 0.5, 10), 0x30353d, { p: [0, 0.1, -0.2] });
        const seat = new THREE.Mesh(b.build(), vcMat());
        const sx = START.x + 4, sz = START.z - 5;
        seat.position.set(sx, this.groundAt(sx, sz) - 0.1, sz);
        seat.rotation.set(0.25, 0.9, 0.18);
        this.addStatic(seat);
        this.colliders.add(sx, sz, 0.8, seat.position.y + 1.1);

        // Parachute draped on the ground (orange + white stripes)
        const chute = new THREE.SphereGeometry(4.2, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6);
        const bc = new GeoBuilder();
        bc.add(chute, [0xffffff, (p, i, c) => {
            const a = Math.atan2(p.getZ(i), p.getX(i));
            c.set(Math.floor((a + Math.PI) / (Math.PI / 4)) % 2 ? 0xff7a2e : 0xfff6ea);
        }], { s: [1, 0.22, 1.1] });
        const cm = new THREE.Mesh(bc.build(), vcMat({ side: THREE.DoubleSide }));
        const cx = START.x - 5, cz = START.z + 6;
        cm.position.set(cx, this.groundAt(cx, cz) - 0.2, cz);
        cm.rotation.set(0.1, 0.4, -0.12);
        this.addStatic(cm, false);
        this.parachute = cm;
    }

    buildArch() {
        // A natural stone arch over Red Rock Canyon
        const q = pathQuery(ARCH.x, ARCH.z, {});
        const px = -q.tz, pz = q.tx; // perpendicular to the path
        const R = 25;
        const g = new THREE.TorusGeometry(R, 4.2, 9, 40, Math.PI);
        const p = g.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i);
            const n = perlin2(v.x * 0.15, v.y * 0.15 + v.z * 0.2) * 1.3;
            const len = Math.hypot(v.x, v.y);
            const k = (len + n) / (len || 1);
            p.setXYZ(i, v.x * k, v.y * k, v.z * (1 + n * 0.15));
        }
        const b = new GeoBuilder();
        b.add(g, [0xb4502f, (pp, i, c) => {
            const y = pp.getY(i);
            const band = Math.floor((y + perlin2(pp.getX(i) * 0.2, 0) * 1.2) / 2.4);
            c.set([0xb24f2f, 0xd27243, 0x9b3f28, 0xe59a66, 0xc25f39][((band % 5) + 5) % 5]);
        }], {}, 0, true);
        const mesh = new THREE.Mesh(b.build(), toonMaterial({ vertexColors: true, flat: true, paint: 0.15, rim: 0.2 }));
        const fy = q.floor - 1.5;
        mesh.position.set(ARCH.x, fy, ARCH.z);
        mesh.rotation.y = Math.atan2(-pz, px);
        this.addStatic(mesh, false);
        for (const s of [-1, 1]) {
            this.colliders.add(ARCH.x + px * R * s, ARCH.z + pz * R * s, 5, fy + 60);
        }
    }

    buildCamp() {
        const C = CAMP;
        const tentMat = vcMat({ rim: 0.4 });
        const rng = makeRng(5);
        // tents around the campfire
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.5;
            const x = C.x + Math.cos(a) * 12, z = C.z + Math.sin(a) * 12;
            const b = new GeoBuilder();
            b.add(new THREE.ConeGeometry(2.6, 3.6, 6), 0x7b4bb0, { p: [0, 1.8, 0] });
            b.add(new THREE.CylinderGeometry(2.62, 2.62, 0.35, 6), 0xf2c14e, { p: [0, 0.2, 0] });
            b.add(new THREE.ConeGeometry(0.9, 2.0, 3), 0x3a1d5c, { p: [0, 1.0, 1.75], r: [-0.25, 0, 0], s: [1, 1, 0.4] });
            b.add(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), 0xf2c14e, { p: [0, 3.9, 0] });
            b.add(new THREE.SphereGeometry(0.16, 8, 6), 0x6ff0ff, { p: [0, 4.55, 0] }, 1.4);
            const m = new THREE.Mesh(b.build(), tentMat);
            m.position.set(x, this.groundAt(x, z) - 0.1, z);
            m.rotation.y = Math.atan2(C.x - x, C.z - z);
            this.addStatic(m);
            this.colliders.add(x, z, 2.5, m.position.y + 3.4, -100, 'tent');
        }
        // plasma campfire
        const fb = new GeoBuilder();
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            fb.add(new THREE.DodecahedronGeometry(0.35, 0), 0x6a5a66, { p: [Math.cos(a) * 1.1, 0.15, Math.sin(a) * 1.1], s: [1, 0.7, 1] }, 0, true);
        }
        fb.add(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), 0x4a3036, { p: [0.2, 0.3, 0], r: [0, 0, 1.3] });
        fb.add(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), 0x4a3036, { p: [-0.1, 0.3, 0.1], r: [0.4, 0.9, 1.3] });
        const fire = new THREE.Mesh(fb.build(), vcMat());
        const fy = this.groundAt(C.x, C.z);
        fire.position.set(C.x, fy, C.z);
        this.addStatic(fire, false);
        this.colliders.add(C.x, C.z, 1.4, fy + 0.6);
        const glow = glowSprite(0xd77aff, 6, 0.8);
        glow.position.set(C.x, fy + 1.2, C.z);
        this.scene.add(glow);
        this.campGlow = glow;
        this.campFire = { x: C.x, y: fy + 0.4, z: C.z };

        // crates
        for (let i = 0; i < 7; i++) {
            const a = rng() * Math.PI * 2, d = rng.range(5, 17);
            const x = C.x + Math.cos(a) * d, z = C.z + Math.sin(a) * d;
            if (Math.hypot(x - PART_SPOTS.fuelTank.x, z - PART_SPOTS.fuelTank.z) < 4) continue;
            const b = new GeoBuilder();
            b.add(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 6), 0x5c2f8a, { p: [0, 0.65, 0] });
            b.add(new THREE.CylinderGeometry(0.72, 0.72, 0.16, 6), 0x6ff0ff, { p: [0, 0.65, 0] }, 1.0);
            b.add(new THREE.CylinderGeometry(0.5, 0.7, 0.2, 6), 0xf2c14e, { p: [0, 1.38, 0] });
            const m = new THREE.Mesh(b.build(), tentMat);
            m.position.set(x, this.groundAt(x, z), z);
            m.rotation.set(0, rng() * 3, 0);
            this.addStatic(m);
            this.colliders.add(x, z, 0.75, m.position.y + 1.45);
        }
        // banners
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + 1.3;
            const x = C.x + Math.cos(a) * 19, z = C.z + Math.sin(a) * 19;
            this.addBanner(x, z, Math.atan2(C.x - x, C.z - z));
        }
    }

    addBanner(x, z, yaw, h = 6) {
        const y = this.groundAt(x, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 6), toonMaterial({ color: 0x3a2a40, rim: 0.3 }));
        pole.position.set(x, y + h / 2, z);
        this.addStatic(pole, false);
        const cloth = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 2.4, 1, 6),
            new THREE.MeshToonMaterial({ map: emblemTexture(), gradientMap: toonRamp(), side: THREE.DoubleSide }),
        );
        cloth.position.set(x, y + h - 1.4, z);
        cloth.rotation.y = yaw;
        cloth.castShadow = true;
        this.scene.add(cloth);
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), toonMaterial({ color: 0xf2c14e, rim: 0.4 }));
        top.position.set(x, y + h + 0.25, z);
        this.scene.add(top);
        this.colliders.add(x, z, 0.2, y + h);
        (this.banners || (this.banners = [])).push(cloth);
        return cloth;
    }

    buildIceLake() {
        const L = ICE_LAKE;
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(256, 256, 40, 256, 256, 256);
        grd.addColorStop(0, '#d8f2ff');
        grd.addColorStop(0.7, '#b9e2f7');
        grd.addColorStop(1, '#f2fbff');
        g.fillStyle = grd;
        g.fillRect(0, 0, 512, 512);
        const r = makeRng(17);
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 2;
        for (let i = 0; i < 26; i++) {
            let x = r.range(60, 450), y = r.range(60, 450);
            g.beginPath();
            g.moveTo(x, y);
            for (let k = 0; k < 6; k++) {
                x += r.range(-40, 40); y += r.range(-40, 40);
                g.lineTo(x, y);
            }
            g.stroke();
        }
        g.fillStyle = 'rgba(140, 200, 235, 0.35)';
        for (let i = 0; i < 18; i++) {
            g.beginPath();
            g.ellipse(r.range(80, 430), r.range(80, 430), r.range(20, 60), r.range(8, 24), r() * 3, 0, Math.PI * 2);
            g.fill();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const ice = new THREE.Mesh(
            new THREE.CircleGeometry(L.r + 2, 56),
            new THREE.MeshToonMaterial({ map: tex, gradientMap: toonRamp() }),
        );
        ice.rotation.x = -Math.PI / 2;
        ice.position.set(L.x, L.level + 0.04, L.z);
        ice.receiveShadow = true;
        this.scene.add(ice);
        this.ice = ice;
    }

    buildTower() {
        const T = TOWER;
        const y = this.groundAt(T.x, T.z);
        const b = new GeoBuilder();
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            b.add(new THREE.CylinderGeometry(0.16, 0.24, T.height + 0.3, 6), 0x4a2f6a,
                { p: [Math.cos(a) * 1.6, T.height / 2, Math.sin(a) * 1.6], r: [Math.sin(a) * -0.12, 0, Math.cos(a) * 0.12] });
        }
        b.add(new THREE.CylinderGeometry(2.6, 2.3, 0.4, 6), 0x5c2f8a, { p: [0, T.height, 0] });
        b.add(new THREE.CylinderGeometry(2.7, 2.7, 0.12, 6), 0xf2c14e, { p: [0, T.height + 0.25, 0] });
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            b.add(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 5), 0xf2c14e, { p: [Math.cos(a) * 2.5, T.height + 0.7, Math.sin(a) * 2.5] });
        }
        b.add(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), 0x4a2f6a, { p: [1.6, T.height + 1.8, 0] });
        b.add(new THREE.SphereGeometry(0.28, 10, 8), 0xff5bd8, { p: [1.6, T.height + 3.4, 0] }, 1.5);
        const m = new THREE.Mesh(b.build(), vcMat());
        m.position.set(T.x, y, T.z);
        this.addStatic(m);
        this.colliders.add(T.x, T.z, 2.0, y + T.height + 0.2);
        this.towerTop = y + T.height + 0.2;
        const gl = glowSprite(0xff5bd8, 3, 0.8);
        gl.position.set(T.x + 1.6, y + T.height + 3.4, T.z);
        this.scene.add(gl);
    }

    buildCrystalSpires() {
        const rng = makeRng(77);
        const mat = toonMaterial({ vertexColors: true, glow: true, flat: true, rim: 0.6, rimColor: 0xffffff, glowStrength: 1.2 });
        const spots = [
            [-92, -330, 1.0], [-28, -345, 0.8], [-80, -380, 1.2], [-36, -300, 0.7], [-70, -296, 0.9], [-30, -392, 1.1],
        ];
        for (const [x, z, s] of spots) {
            const b = new GeoBuilder();
            const n = rng.int(3, 5);
            for (let i = 0; i < n; i++) {
                const h = (i === 0 ? rng.range(7, 11) : rng.range(3, 6)) * s;
                const w = (i === 0 ? 1.1 : rng.range(0.5, 0.8)) * s;
                const a = rng() * Math.PI * 2;
                const off = i === 0 ? 0 : w * 1.6;
                const lean = i === 0 ? 0.05 : rng.range(0.25, 0.5);
                b.add(new THREE.OctahedronGeometry(1, 0), i % 2 ? 0xb47cff : 0x6ff0ff,
                    { p: [Math.cos(a) * off, h * 0.42, Math.sin(a) * off], s: [w, h, w], r: [Math.cos(a) * lean, rng() * 3, Math.sin(a) * lean] },
                    0.55, true);
            }
            const m = new THREE.Mesh(b.build(), mat);
            const y = this.groundAt(x, z) - 0.5;
            m.position.set(x, y, z);
            this.addStatic(m, false);
            this.colliders.add(x, z, 1.4 * s, y + 9 * s);
            const gl = glowSprite(0x8fe8ff, 10 * s, 0.35);
            gl.position.set(x, y + 5 * s, z);
            this.scene.add(gl);
        }
    }

    // --------------------------------------------------------
    // Scatter rocks, plants and crystals along the canyon
    // --------------------------------------------------------
    isClear(x, z, r) {
        const keep = [
            [START.x, START.z, 9],
            [CAMP.x, CAMP.z, 15],
            [SHIP.x, SHIP.z, 20],
            [TOWER.x, TOWER.z, 5],
            [ICE_LAKE.x, ICE_LAKE.z, ICE_LAKE.r + 2],
        ];
        for (const p of Object.values(PART_SPOTS)) keep.push([p.x, p.z, 5]);
        for (const zn of ZONES) for (const a of zn.aliens) keep.push([a.x, a.z, 2.5]);
        for (const [kx, kz, kr] of keep) if (Math.hypot(x - kx, z - kz) < kr + r) return false;
        for (const g of GATES) {
            // distance to the gate line
            const dx = x - g.x, dz = z - g.z;
            const along = dx * g.tx + dz * g.tz;
            if (Math.abs(along) < 7 + r && Math.abs(dx * g.nx + dz * g.nz) < g.halfSpan + 2) return false;
        }
        const aq = pathQuery(x, z, {});
        if (Math.hypot(x - ARCH.x, z - ARCH.z) < 4) return false;
        return aq.sd < 4;
    }

    regionOf(x, z) {
        const R = REGIONS;
        if (Math.hypot(x - R.crystal.x, z - R.crystal.z) < R.crystal.r * 0.85) return 'crystal';
        if (Math.hypot(x - R.frozen.x, z - R.frozen.z) < R.frozen.r * 0.85) return 'frozen';
        return 'desert';
    }

    scatter() {
        const rng = makeRng(2024);
        const C = (h) => new THREE.Color(h);
        const rockPal = { top: C(0xe39c6b), side: C(0xb4563a), bottom: C(0x8a3f2c) };
        const icePal = { top: C(0xf4fbff), side: C(0x9db6d2), bottom: C(0x6f86a6) };
        const darkPal = { top: C(0xc98a6a), side: C(0x8a4a3a), bottom: C(0x5a2e28) };
        const rocks = [0, 1, 2, 3].map((k) => rockTemplate(k, rockPal));
        const iceRocks = [0, 1].map((k) => rockTemplate(k + 10, icePal));
        const darkRocks = [0, 1].map((k) => rockTemplate(k + 20, darkPal));

        const plants = {
            coral: [0, 1, 2].map(() => tubeCoral(rng)),
            bulb: [0, 1, 2].map(() => bulbPlant(rng)),
            succ: [0, 1].map(() => succulent(rng)),
            grass: [0, 1, 2].map(() => rustGrass(rng)),
            mush: [0, 1, 2].map(() => mushroom(rng)),
        };
        const crystals = [0, 1, 2, 3].map(() => crystalCluster(rng, [0x6ff0ff, 0xb47cff, 0xff8ad8]));
        const iceCrystals = [0, 1, 2].map(() => crystalCluster(rng, [0xd6f4ff, 0xa8dcff, 0xffffff]));

        const batch = new Batcher();
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const nrm = new THREE.Vector3();
        const qa = new THREE.Quaternion();

        const place = (key, tpl, x, z, scale, sink = 0.1, sway = 0, alignGround = 0, tint = null) => {
            const y = this.groundAt(x, z) - sink * scale;
            e.set(0, rng() * Math.PI * 2, 0);
            q.setFromEuler(e);
            if (alignGround > 0) {
                this.terrain.normalAt(x, z, nrm);
                qa.setFromUnitVectors(up, nrm);
                q.premultiply(qa.slerp(new THREE.Quaternion(), 1 - alignGround));
            }
            const sc = typeof scale === 'number' ? s.set(scale, scale * rng.range(0.8, 1.2), scale) : scale;
            m4.compose(v.set(x, y, z), q, sc);
            batch.add(key, tpl, m4, sway, tint);
            return y;
        };

        const randomSpot = (lateral = 1.0) => {
            const sAt = rng.range(0, PATH_LENGTH);
            const p = pathPointAt(sAt, {});
            const off = rng.range(-1, 1) * (p.hw + 6) * lateral;
            return [p.x - p.tz * off, p.z + p.tx * off];
        };

        // Boulders hugging the cliffs + rocks on the floor
        for (let i = 0; i < 1800; i++) {
            const [x, z] = randomSpot();
            const reg = this.regionOf(x, z);
            const aq = pathQuery(x, z, {});
            const big = rng() < 0.12;
            let sc;
            if (big) sc = rng.range(1.6, 4.2);
            else if (rng() < 0.3) sc = rng.range(0.6, 1.4);
            else sc = rng.range(0.18, 0.5);
            if (big && aq.sd < -10) continue; // big ones near walls
            if (!this.isClear(x, z, sc)) continue;
            const tpl = reg === 'frozen' ? rng.pick(iceRocks) : (rng() < 0.15 ? rng.pick(darkRocks) : rng.pick(rocks));
            const key = sc < 0.55 ? 'pebble' : 'rock';
            const y = place(key, tpl, x, z, sc, 0.18, 0, sc < 0.55 ? 0.8 : 0.4);
            if (sc > 0.75) this.colliders.add(x, z, sc * 0.92, y + sc * 0.72 + 0.05);
        }

        // Plants (dense in the Crystal Forest)
        for (let i = 0; i < 2600; i++) {
            const [x, z] = randomSpot(0.95);
            const reg = this.regionOf(x, z);
            if (reg === 'frozen') continue;
            if (reg === 'desert' && rng() < 0.62) continue;
            if (!this.isClear(x, z, 0.6)) continue;
            const aq = pathQuery(x, z, {});
            if (aq.sd > 1) continue;
            const roll = rng();
            if (reg === 'crystal') {
                if (roll < 0.22) place('plant', rng.pick(plants.coral), x, z, rng.range(0.8, 1.4), 0, 0.05);
                else if (roll < 0.42) place('plant', rng.pick(plants.bulb), x, z, rng.range(0.8, 1.4), 0, 0.07);
                else if (roll < 0.55) {
                    const sc = rng.range(0.8, 1.6);
                    place('plant', rng.pick(plants.mush), x, z, sc, 0, 0.012);
                    this.colliders.add(x, z, 0.25 * sc, this.groundAt(x, z) + 1.0 * sc);
                }
                else if (roll < 0.72) place('crystal', rng.pick(crystals), x, z, rng.range(0.6, 1.3), 0.1);
                else place('plant', rng.pick(plants.succ), x, z, rng.range(0.8, 1.5), 0, 0.04);
            } else {
                if (roll < 0.55) place('plant', rng.pick(plants.grass), x, z, rng.range(0.8, 1.5), 0, 0.12);
                else if (roll < 0.8) place('plant', rng.pick(plants.succ), x, z, rng.range(0.7, 1.3), 0, 0.04);
                else if (roll < 0.9) place('plant', rng.pick(plants.coral), x, z, rng.range(0.6, 1.0), 0, 0.05);
                else place('crystal', rng.pick(crystals), x, z, rng.range(0.4, 0.8), 0.1);
            }
        }

        // Ice crystals around the frozen lake
        for (let i = 0; i < 160; i++) {
            const a = rng() * Math.PI * 2;
            const d = ICE_LAKE.r + rng.range(1, 30);
            const x = ICE_LAKE.x + Math.cos(a) * d, z = ICE_LAKE.z + Math.sin(a) * d * 1.3;
            if (!this.isClear(x, z, 0.8)) continue;
            if (pathQuery(x, z, {}).sd > 2) continue;
            const sc = rng.range(0.6, 1.8);
            place('crystal', rng.pick(iceCrystals), x, z, sc, 0.1);
            if (sc > 1.2) this.colliders.add(x, z, 0.5 * sc, this.groundAt(x, z) + 1.5 * sc);
        }

        const materials = {
            rock: toonMaterial({ vertexColors: true, flat: true, paint: 0.12, rim: 0.25 }),
            pebble: toonMaterial({ vertexColors: true, flat: true, paint: 0.12 }),
            plant: toonMaterial({ vertexColors: true, glow: true, sway: 1, rim: 0.35 }),
            crystal: toonMaterial({ vertexColors: true, glow: true, flat: true, rim: 0.6, rimColor: 0xffffff, glowStrength: 1.2 }),
        };
        this.scatterMeshes = batch.build(materials, this.scene, { pebble: { cast: false }, plant: { cast: false } });
    }

    // --------------------------------------------------------
    // Alien force fields across the canyon passes
    // --------------------------------------------------------
    buildGates() {
        const pylonMat = vcMat({ rim: 0.5 });
        for (const g of GATES) {
            const width = g.halfSpan * 2;
            const H = 34;
            const fy = this.groundAt(g.x, g.z);
            const geo = new THREE.PlaneGeometry(width, H, 1, 1);
            geo.translate(0, H / 2 - 4, 0);
            const mat = shieldMaterial(0xb04dff, width / 1.4, H / 1.4);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(g.x, fy, g.z);
            mesh.rotation.y = Math.atan2(g.tx, g.tz);
            mesh.renderOrder = 13;
            this.scene.add(mesh);

            const hw = PATH[GATE_INDICES[g.k]][2];
            const pylons = [];
            for (const sgn of [-1, 1]) {
                const px = g.x + g.nx * (hw + 0.6) * sgn, pz = g.z + g.nz * (hw + 0.6) * sgn;
                const py = this.groundAt(px, pz);
                const b = new GeoBuilder();
                b.add(new THREE.CylinderGeometry(0.5, 0.9, 5.5, 6), 0x4a2a6a, { p: [0, 2.75, 0] });
                b.add(new THREE.CylinderGeometry(0.95, 0.95, 0.3, 6), 0xf2c14e, { p: [0, 0.6, 0] });
                b.add(new THREE.CylinderGeometry(0.6, 0.6, 0.25, 6), 0xf2c14e, { p: [0, 4.6, 0] });
                b.add(new THREE.OctahedronGeometry(0.75, 0), 0xff7cf0, { p: [0, 6.5, 0], s: [1, 1.6, 1] }, 1.4, true);
                const pm = new THREE.Mesh(b.build(), pylonMat);
                pm.position.set(px, py - 0.2, pz);
                this.addStatic(pm);
                this.colliders.add(px, pz, 0.9, py + 5.3, -100, 'pylon');
                const glow = glowSprite(0xff7cf0, 5, 0.85);
                glow.position.set(px, py + 6.3, pz);
                this.scene.add(glow);
                pylons.push({ mesh: pm, glow });
            }
            this.gates.push({
                def: g,
                mesh,
                mat,
                pylons,
                open: false,
                anim: 0,
                ax: g.x - g.nx * g.halfSpan, az: g.z - g.nz * g.halfSpan,
                bx: g.x + g.nx * g.halfSpan, bz: g.z + g.nz * g.halfSpan,
                y: fy,
            });
        }
    }

    openGate(k, instant = false) {
        const gate = this.gates[k];
        if (!gate || gate.open) return;
        gate.open = true;
        gate.anim = instant ? 2 : 0;
        if (instant) this.finishGate(gate);
    }

    finishGate(gate) {
        gate.mesh.visible = false;
        for (const p of gate.pylons) p.glow.visible = false;
    }

    // Push a circle out of closed force fields. Returns true if blocked.
    blockByGates(pos, radius) {
        let hit = false;
        for (const g of this.gates) {
            if (g.open) continue;
            const dx = pos.x - g.def.x, dz = pos.z - g.def.z;
            const along = dx * g.def.tx + dz * g.def.tz; // signed distance from the field plane
            const lat = dx * g.def.nx + dz * g.def.nz;
            if (Math.abs(lat) > g.def.halfSpan) continue;
            if (Math.abs(along) < radius) {
                const side = along < 0 ? -1 : 1;
                const push = radius - Math.abs(along);
                pos.x += g.def.tx * push * side;
                pos.z += g.def.tz * push * side;
                hit = true;
            }
        }
        return hit;
    }

    // Does a segment from a to b cross a closed field? returns {t, gate} or null
    segmentHitsGate(ax, ay, az, bx, by, bz) {
        for (const g of this.gates) {
            if (g.open) continue;
            const da = (ax - g.def.x) * g.def.tx + (az - g.def.z) * g.def.tz;
            const db = (bx - g.def.x) * g.def.tx + (bz - g.def.z) * g.def.tz;
            if ((da > 0) === (db > 0)) continue;
            const t = da / (da - db);
            const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
            const lat = (x - g.def.x) * g.def.nx + (z - g.def.z) * g.def.nz;
            if (Math.abs(lat) <= g.def.halfSpan && y < g.y + 30) return { t, gate: g, x, y, z };
        }
        return null;
    }

    // --------------------------------------------------------
    // Crash site: ship, debris, alien flag, shield dome, smoke
    // --------------------------------------------------------
    buildCrashSite() {
        const ship = buildShip();
        const gy = this.groundAt(SHIP.x, SHIP.z);
        ship.root.position.set(SHIP.x, gy + 1.9 - SHIP.sink, SHIP.z);
        ship.root.rotation.set(SHIP.tiltX, SHIP.yaw, SHIP.tiltZ, 'YXZ');
        this.scene.add(ship.root);
        this.ship = ship;
        ship.root.updateMatrixWorld(true);

        // Colliders along the hull + wings
        const v = new THREE.Vector3();
        for (let z = -4.5; z <= 4.6; z += 1.8) {
            v.set(0, 0, z);
            ship.body.localToWorld(v);
            this.colliders.add(v.x, v.z, 1.6, v.y + 1.6, -100, 'ship');
        }
        for (const x of [-3.6, 3.6]) {
            v.set(x, -0.4, 2.0);
            ship.body.localToWorld(v);
            this.colliders.add(v.x, v.z, 1.5, v.y + 0.4, -100, 'ship');
        }

        // Debris
        const rng = makeRng(31);
        const dmat = vcMat();
        for (let i = 0; i < 14; i++) {
            const a = rng() * Math.PI * 2, d = rng.range(7, 22);
            const x = SHIP.x + Math.cos(a) * d, z = SHIP.z + Math.sin(a) * d;
            const b = new GeoBuilder();
            b.add(new THREE.BoxGeometry(rng.range(0.4, 1.4), 0.1, rng.range(0.4, 1.0)), rng() < 0.6 ? 0xeeeae2 : 0xff7a2e, {}, 0, true);
            if (rng() < 0.4) b.add(new THREE.BoxGeometry(0.1, 0.5, 0.6), 0x8d97a3, { p: [0.2, 0.2, 0] });
            const m = new THREE.Mesh(b.build(), dmat);
            m.position.set(x, this.groundAt(x, z) + 0.05, z);
            m.rotation.set(rng.range(-0.4, 0.4), rng() * 3, rng.range(-0.4, 0.4));
            m.castShadow = true;
            this.scene.add(m);
        }

        // The aliens planted their flag on your ship!
        const flag = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), toonMaterial({ color: 0x3a2a40 }));
        pole.position.y = 2.1;
        flag.add(pole);
        const cloth = new THREE.Mesh(
            new THREE.PlaneGeometry(1.8, 1.2, 6, 1),
            new THREE.MeshToonMaterial({ map: emblemTexture(), gradientMap: toonRamp(), side: THREE.DoubleSide }),
        );
        cloth.position.set(0.92, 3.5, 0);
        flag.add(cloth);
        v.set(0.0, 1.1, -1.2);
        ship.body.localToWorld(v);
        flag.position.copy(v);
        flag.rotation.set(0.1, 0.4, -0.15);
        this.scene.add(flag);
        this.alienFlag = flag;
        this.alienFlagCloth = cloth;

        // Shield dome the aliens put around the ship
        const dome = new THREE.Mesh(new THREE.SphereGeometry(13.5, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), shieldMaterial(0xa64dff, 26, 8));
        dome.position.set(SHIP.x, gy - 2, SHIP.z);
        dome.renderOrder = 13;
        this.scene.add(dome);
        this.dome = { mesh: dome, on: true, anim: 0, x: SHIP.x, z: SHIP.z, r: 13.5, y: gy - 2 };

        // Smoke column + fire (beacon you can see from the start)
        const fx = this.game.effects;
        const rear = new THREE.Vector3(0, 0.5, 4.2);
        ship.body.localToWorld(rear);
        this.smokeEmitter = fx.addEmitter({
            rate: 7,
            emit: (e) => {
                e.spawn({
                    x: rear.x + rand(-0.8, 0.8), y: rear.y + rand(0, 1), z: rear.z + rand(-0.8, 0.8),
                    vx: rand(0.6, 1.6), vy: rand(4, 6.5), vz: rand(-0.4, 0.4),
                    life: rand(8, 11), size: rand(2, 3.2), size1: rand(14, 20),
                    color: 0x3e3640, color1: 0x9a8a90, alpha: 0.9, alpha1: 0, drag: 0.08, grav: -0.15, batch: 2, fadeIn: 0.6,
                });
            },
        });
        this.fireEmitter = fx.addEmitter({
            rate: 14,
            emit: (e) => {
                e.spawn({
                    x: rear.x + rand(-0.6, 0.6), y: rear.y - 0.3, z: rear.z + rand(-0.6, 0.6),
                    vx: rand(-0.3, 0.3), vy: rand(1.5, 3), vz: rand(-0.3, 0.3),
                    life: rand(0.5, 0.9), size: rand(0.8, 1.3), size1: 0.2,
                    color: 0xffd36a, color1: 0xff5a2a, alpha: 1, alpha1: 0, batch: 1,
                });
            },
        });
        // Campfire (alien plasma fire)
        const cf = this.campFire;
        fx.addEmitter({
            rate: 16,
            emit: (e) => {
                e.spawn({
                    x: cf.x + rand(-0.4, 0.4), y: cf.y, z: cf.z + rand(-0.4, 0.4),
                    vx: rand(-0.2, 0.2), vy: rand(1.2, 2.4), vz: rand(-0.2, 0.2),
                    life: rand(0.5, 0.9), size: rand(0.6, 1.0), size1: 0.15,
                    color: 0xff9af5, color1: 0x8a4dff, alpha: 1, alpha1: 0, batch: 1,
                });
            },
        });
    }

    dropDome(instant = false) {
        if (!this.dome.on) return;
        this.dome.on = false;
        this.dome.anim = instant ? 2 : 0;
        if (instant) this.dome.mesh.visible = false;
    }

    // Is a point inside the (active) dome?
    domeBlocks(pos, radius) {
        const d = this.dome;
        if (!d.on) return false;
        const dx = pos.x - d.x, dz = pos.z - d.z;
        const dist = Math.hypot(dx, dz);
        const R = d.r + radius;
        if (dist < R && dist > d.r - 3) {
            const k = R / (dist || 1);
            pos.x = d.x + dx * k;
            pos.z = d.z + dz * k;
            return true;
        }
        return false;
    }

    setShipRepaired() {
        this.smokeEmitter.on = false;
        this.fireEmitter.on = false;
        this.alienFlag.visible = false;
    }

    // --------------------------------------------------------
    update(dt, camera, focus) {
        this.time += dt;
        const t = this.time;
        this.skyGroup.position.copy(camera.position);
        if (focus) this.followShadow(focus);
        this.ship.update(t);

        // force field animations
        for (const g of this.gates) {
            if (g.open && g.anim < 2) {
                g.anim += dt;
                const k = g.anim;
                g.mat.uniforms.uOn.value = k < 1.2 ? (Math.random() < 0.5 ? 1.4 : 0.2) * (1 - k / 1.2) : 0;
                g.mat.uniforms.uFlash.value = Math.max(0, 1 - k * 2);
                if (k >= 1.2) this.finishGate(g);
                if (k >= 2) g.anim = 2;
            }
        }
        const d = this.dome;
        if (!d.on && d.anim < 2) {
            d.anim += dt;
            d.mesh.material.uniforms.uOn.value = Math.max(0, 1 - d.anim * 1.2) * (Math.random() < 0.5 ? 1.5 : 0.6);
            d.mesh.scale.setScalar(1 + d.anim * 0.25);
            if (d.anim > 1) { d.mesh.visible = false; d.anim = 2; }
        }
        // flags & banners flutter
        if (this.alienFlagCloth) this.alienFlagCloth.rotation.y = Math.sin(t * 2.3) * 0.25;
        if (this.banners) this.banners.forEach((b, i) => (b.rotation.z = Math.sin(t * 1.7 + i) * 0.05));
        if (this.campGlow) this.campGlow.material.opacity = 0.65 + Math.sin(t * 11) * 0.08 + Math.sin(t * 5.3) * 0.07;
    }
}
