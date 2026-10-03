// ============================================================
// MODELS — astronaut, ejection seat, parachute, flag, planets
// (used by the cutscenes)
// ============================================================

import * as THREE from 'three';
import { GeoBuilder, vcMat, addOutline, toonMaterial, toonRamp, glowSprite } from './toon.js';
import { makeRng, fbm2, perlin2, smoothstep, clamp } from './util.js';

const WHITE = 0xf6f2ea, ORANGE = 0xff7a2e, GRAY = 0x8d97a3, DARK = 0x3a4250, VISOR = 0xffb340;

export function createAstronaut() {
    const mat = vcMat({ rim: 0.6 });
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const mk = (geo, parent) => {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        addOutline(m, 0x2a1424, 0.004);
        parent.add(m);
        return m;
    };
    // torso
    let b = new GeoBuilder();
    b.add(new THREE.CapsuleGeometry(0.27, 0.32, 4, 12), WHITE, { p: [0, 1.08, 0] });
    b.add(new THREE.BoxGeometry(0.26, 0.2, 0.08), ORANGE, { p: [0, 1.14, 0.25] });
    b.add(new THREE.SphereGeometry(0.035, 8, 6), 0xff4040, { p: [-0.06, 1.16, 0.3] }, 1.2);
    b.add(new THREE.SphereGeometry(0.035, 8, 6), 0x40c0ff, { p: [0.06, 1.16, 0.3] }, 1.2);
    b.add(new THREE.BoxGeometry(0.44, 0.5, 0.22), 0xdcd6cc, { p: [0, 1.12, -0.28] });
    b.add(new THREE.CylinderGeometry(0.29, 0.3, 0.08, 14), GRAY, { p: [0, 0.8, 0] });
    mk(b.build(), body);
    // helmet
    const head = new THREE.Group();
    head.position.set(0, 1.5, 0);
    body.add(head);
    b = new GeoBuilder();
    b.add(new THREE.SphereGeometry(0.34, 20, 16), WHITE, { p: [0, 0.08, 0] });
    b.add(new THREE.SphereGeometry(0.29, 18, 12, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.22, Math.PI * 0.42), VISOR, { p: [0, 0.08, 0.075] }, 0.25);
    b.add(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 14), GRAY, { p: [0, -0.24, 0] });
    b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), GRAY, { p: [0.22, 0.4, -0.05] });
    b.add(new THREE.SphereGeometry(0.04, 8, 6), 0xff4040, { p: [0.22, 0.51, -0.05] }, 1.4);
    mk(b.build(), head);
    // limbs
    const limb = (len, r, cuff) => {
        const lb = new GeoBuilder();
        lb.add(new THREE.CapsuleGeometry(r, len, 4, 10), WHITE, { p: [0, -len / 2 - r * 0.5, 0] });
        lb.add(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.07, 10), cuff, { p: [0, -len * 0.75, 0] });
        lb.add(new THREE.SphereGeometry(r * 1.15, 10, 8), cuff === ORANGE ? WHITE : DARK, { p: [0, -len - r * 0.6, 0.02], s: [1, 0.8, 1.3] });
        return lb.build();
    };
    const armGeo = limb(0.38, 0.085, ORANGE);
    const legGeo = limb(0.42, 0.1, DARK);
    const arms = [], legs = [];
    for (const sx of [-1, 1]) {
        const a = new THREE.Group();
        a.position.set(sx * 0.34, 1.3, 0);
        body.add(a);
        mk(armGeo, a);
        arms.push(a);
        const l = new THREE.Group();
        l.position.set(sx * 0.13, 0.82, 0);
        body.add(l);
        mk(legGeo, l);
        legs.push(l);
    }
    const astro = {
        root, body, head, arms, legs, phase: 0, walk: 0, wave: 0, sit: 0, float: 0,
        animate(dt) {
            this.phase += dt * 8;
            const s = Math.sin(this.phase) * this.walk;
            legs[0].rotation.x = s * 0.6 - this.sit * 1.4;
            legs[1].rotation.x = -s * 0.6 - this.sit * 1.4;
            arms[0].rotation.x = -s * 0.5 - this.float * 0.4;
            arms[1].rotation.x = s * 0.5 - this.float * 0.4;
            arms[0].rotation.z = -0.15 - this.float * 0.9;
            arms[1].rotation.z = 0.15 + this.float * 0.9;
            if (this.wave > 0) {
                arms[1].rotation.z = 0.15 + this.wave * 2.6 + Math.sin(this.phase * 1.5) * 0.3 * this.wave;
            }
            body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * this.walk;
        },
    };
    return astro;
}

export function createSeat() {
    const b = new GeoBuilder();
    b.add(new THREE.BoxGeometry(0.9, 0.22, 0.9), 0x5d6672, { p: [0, 0.25, 0] });
    b.add(new THREE.BoxGeometry(0.78, 0.16, 0.72), ORANGE, { p: [0, 0.42, 0.05] });
    b.add(new THREE.BoxGeometry(0.9, 1.2, 0.2), 0x5d6672, { p: [0, 0.95, -0.4] });
    b.add(new THREE.BoxGeometry(0.78, 0.95, 0.1), ORANGE, { p: [0, 0.95, -0.27] });
    b.add(new THREE.CylinderGeometry(0.16, 0.22, 0.45, 10), 0x30353d, { p: [0, 0.05, -0.2] });
    const m = new THREE.Mesh(b.build(), vcMat());
    addOutline(m, 0x2a1424, 0.004);
    return m;
}

export function createParachute() {
    const g = new THREE.Group();
    const b = new GeoBuilder();
    b.add(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), [0xffffff, (p, i, c) => {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        c.set(Math.floor((a + Math.PI) / (Math.PI / 4)) % 2 ? ORANGE : 0xfff6ea);
    }], { s: [1, 0.6, 1] });
    const canopy = new THREE.Mesh(b.build(), vcMat({ side: THREE.DoubleSide }));
    canopy.position.y = 5.2;
    g.add(canopy);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x3a2a30 });
    const pts = [];
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * 2.6, 5.4, Math.sin(a) * 2.6), new THREE.Vector3(0, 1.6, 0));
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    g.canopy = canopy;
    return g;
}

export function createFlag(text = 'LINCOLN') {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    const x = c.getContext('2d');
    x.fillStyle = '#fff6ea';
    x.fillRect(0, 0, 512, 320);
    x.fillStyle = '#ff7a2e';
    x.fillRect(0, 0, 512, 40);
    x.fillRect(0, 280, 512, 40);
    // little rocket
    x.save();
    x.translate(256, 135);
    x.rotate(-0.5);
    x.fillStyle = '#ff7a2e';
    x.beginPath();
    x.moveTo(0, -80); x.quadraticCurveTo(38, -40, 30, 40); x.lineTo(-30, 40); x.quadraticCurveTo(-38, -40, 0, -80);
    x.fill();
    x.fillStyle = '#2d6db5';
    x.beginPath(); x.arc(0, -20, 15, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffd166';
    x.beginPath(); x.moveTo(-18, 40); x.lineTo(0, 85); x.lineTo(18, 40); x.fill();
    x.restore();
    x.font = 'bold 64px "Russo One", Arial Black, sans-serif';
    x.textAlign = 'center';
    x.fillStyle = '#2a1424';
    x.fillText(text, 256, 262);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), toonMaterial({ color: 0xdedede, rim: 0.5 }));
    pole.position.y = 1.3;
    g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.88, 8, 1), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonRamp(), side: THREE.DoubleSide }));
    cloth.position.set(0.72, 2.12, 0);
    g.add(cloth);
    g.cloth = cloth;
    return g;
}

// ------------------------------------------------------------
// Planets
// ------------------------------------------------------------
function planetCanvas(w, h, painter) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) {
        const lat = (j / (h - 1) - 0.5) * Math.PI;
        for (let i = 0; i < w; i++) {
            const lon = (i / w) * Math.PI * 2;
            // sample noise on a sphere (no seams)
            const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
            const rgb = painter(x, y, z, lat);
            const k = (j * w + i) * 4;
            img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const n3 = (x, y, z, f) => fbm2(x * f + z * 0.7 * f, y * f + z * 0.37 * f + 11, 4);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function earthTexture() {
    return planetCanvas(256, 128, (x, y, z, lat) => {
        const h = n3(x, y, z, 1.6) + perlin2(x * 5 + 3, z * 5 + y * 3) * 0.12;
        let c;
        if (h > 0.08) c = mix3([92, 176, 86], [196, 170, 110], clamp((h - 0.08) * 3, 0, 1));
        else c = mix3([40, 120, 210], [26, 80, 170], clamp(-h * 2, 0, 1));
        const ice = smoothstep(1.1, 1.35, Math.abs(lat));
        c = mix3(c, [245, 250, 255], ice);
        const cl = n3(x * 1.3, y * 2.2, z * 1.3, 2.4);
        if (cl > 0.18) c = mix3(c, [255, 255, 255], clamp((cl - 0.18) * 3, 0, 0.85));
        return c;
    });
}

export function marsTexture() {
    return planetCanvas(256, 128, (x, y, z, lat) => {
        const h = n3(x, y, z, 1.8);
        let c = mix3([222, 120, 74], [186, 84, 52], clamp(h * 1.6 + 0.4, 0, 1));
        const dark = n3(x + 5, y, z - 3, 1.2);
        if (dark > 0.15) c = mix3(c, [120, 60, 50], clamp((dark - 0.15) * 2.5, 0, 0.7));
        // Valles Marineris
        const v = Math.abs(y + 0.15 + Math.sin(Math.atan2(z, x) * 2) * 0.05);
        if (v < 0.03 && x > 0) c = mix3(c, [110, 50, 40], 0.7);
        const ice = smoothstep(1.25, 1.45, Math.abs(lat));
        return mix3(c, [250, 245, 240], ice);
    });
}

export function moonTexture() {
    const rng = makeRng(8);
    const craters = Array.from({ length: 70 }, () => {
        const u = rng.range(-1, 1), a = rng() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        return [s * Math.cos(a), u, s * Math.sin(a), rng.range(0.03, 0.16)];
    });
    return planetCanvas(256, 128, (x, y, z) => {
        const h = n3(x, y, z, 2.2);
        let v = 175 + h * 45;
        for (const [cx, cy, cz, r] of craters) {
            const d = Math.hypot(x - cx, y - cy, z - cz);
            if (d < r) v -= 28 * (1 - d / r);
            else if (d < r * 1.2) v += 18;
        }
        const mare = n3(x - 3, y + 2, z, 1.1);
        if (mare > 0.15) v -= 40;
        return [v, v * 0.98, v * 1.02];
    });
}

// Glowing atmosphere shell
export function atmosphere(radius, color, power = 2.5, strength = 1.2) {
    const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: power }, uStr: { value: strength } },
        vertexShader: /* glsl */`
            varying vec3 vN;
            varying vec3 vV;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vN = normalize(normalMatrix * normal);
                vV = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            varying vec3 vN;
            varying vec3 vV;
            uniform vec3 uColor;
            uniform float uPow;
            uniform float uStr;
            void main() {
                float f = pow(1.0 - abs(dot(vN, vV)), uPow) * uStr;
                gl_FragColor = vec4(uColor * f, 1.0);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
}

export function createPlanet(kind, radius) {
    const tex = kind === 'earth' ? earthTexture() : kind === 'mars' ? marsTexture() : moonTexture();
    const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonRamp() });
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), mat);
    g.add(m);
    g.planet = m;
    if (kind === 'earth') g.add(atmosphere(radius * 1.06, 0x6fb8ff, 2.2, 1.5));
    if (kind === 'mars') g.add(atmosphere(radius * 1.05, 0xff9a6a, 2.6, 1.0));
    return g;
}

// Starfield
export function createStars(count = 2600, radius = 1500) {
    const rng = makeRng(3);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
        const u = rng.range(-1, 1), a = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        pos[i * 3] = s * Math.cos(a) * radius;
        pos[i * 3 + 1] = u * radius;
        pos[i * 3 + 2] = s * Math.sin(a) * radius;
        c.setHSL(rng.pick([0.08, 0.6, 0.12, 0.55]), 0.6, rng.range(0.7, 0.95));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const tex = (() => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 32;
        const x = cv.getContext('2d');
        const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.35, 'rgba(255,255,255,0.8)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr;
        x.fillRect(0, 0, 32, 32);
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    })();
    const small = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, map: tex, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    const g2 = new THREE.BufferGeometry();
    const n2 = 160;
    g2.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, n2 * 3), 3));
    g2.setAttribute('color', new THREE.BufferAttribute(col.slice(0, n2 * 3), 3));
    const big = new THREE.Points(g2, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, map: tex, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    const grp = new THREE.Group();
    grp.add(small, big);
    return grp;
}

// Soft nebula backdrop for space shots
export function createNebula() {
    const mat = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: /* glsl */`
            varying vec3 vDir;
            void main() {
                vDir = position;
                vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position = p.xyww;
            }`,
        fragmentShader: /* glsl */`
            varying vec3 vDir;
            float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
            float noise(vec3 x) {
                vec3 i = floor(x), f = fract(x);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                           mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
            }
            float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += noise(p) * a; p *= 2.1; a *= 0.5; } return s; }
            void main() {
                vec3 d = normalize(vDir);
                float n = fbm(d * 2.5);
                float n2 = fbm(d * 4.0 + 7.0);
                vec3 col = vec3(0.012, 0.012, 0.035);
                col += vec3(0.25, 0.08, 0.32) * smoothstep(0.45, 0.8, n) * 0.5;
                col += vec3(0.05, 0.22, 0.3) * smoothstep(0.5, 0.85, n2) * 0.4;
                gl_FragColor = vec4(col, 1.0);
                #include <colorspace_fragment>
            }`,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 20), mat);
    m.renderOrder = -1000;
    m.frustumCulled = false;
    return m;
}

export { glowSprite };
