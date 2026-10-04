// ============================================================
// EFFECTS — cartoon combat effects: plasma streaks, sparkles and
// stars, toon smoke puffs, poofs, explosions, shockwave rings and
// scorch marks. Everything is drawn by four instanced billboard
// batches (one draw call each, skipped when empty). Particles are
// pooled, so a fight allocates no meshes or materials and never
// compiles a new shader.
// ============================================================

import * as THREE from 'three';
import { rand, clamp } from './util.js';

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

// Particle shapes. Glow-type batches (glow, ground) draw light: an additive halo plus an optional solid
// part ("solid" 0..1) that covers what is behind it, so it still reads against the bright Mars ground.
export const FX = {
    ORB: 0,      // soft glow with a white-hot core (param: how much a streak tapers toward its tail)
    SPARKLE: 1,  // four-point twinkle
    RING: 2,     // ring (param: thickness, 0..1 of the radius)
    BOLT: 3,     // plasma bolt: halo, solid body with a darker rim, white core (param: tail taper)
    STAR: 4,     // cartoon five-point star with an ink outline
    BANG: 5,     // spiky cartoon flash (param: number of spikes)
    SPLAT: 6,    // scorch mark (param: random seed), lies flat on a surface
    // smoke-type batches (smoke, far)
    PUFF: 0,     // toon smoke puff (param: ink outline width)
    CHUNK: 1,    // a chunk of debris with an ink outline
};

// Batches
const SMOKE = 0, GLOW = 1, FAR = 2, GROUND = 3;

// ------------------------------------------------------------
// Instanced billboard batch
// ------------------------------------------------------------
// Each instance is a camera-facing quad, a streak (iVel = head minus tail, drawn in perspective so a tracer
// can run from the gun to the target), or a flat quad lying on a surface (iParams.z = 1, iVel = the normal).
const BB_VERT = /* glsl */`
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec2 iSize;
attribute vec4 iColor;
attribute vec4 iParams;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParams;
varying float vHalf;
#include <common>
#include <fog_pars_vertex>
void main() {
    vUv = position.xy + 0.5;
    vColor = iColor;
    vParams = iParams;
    vHalf = 0.0;
    float sz = iSize.x;
    float sn = sin(iSize.y), cs = cos(iSize.y);
    vec2 corner = position.xy;
    vec2 rc = vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs) * sz;
    vec4 mvPosition;
    if (iParams.z > 0.5) {
        vec3 n = normalize(iVel);
        vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 b = cross(n, t);
        mvPosition = modelViewMatrix * vec4(iPos + t * rc.x + b * rc.y, 1.0);
    } else {
        mvPosition = modelViewMatrix * vec4(iPos, 1.0);
        vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
        vec3 head = mvPosition.xyz;
        bool streak = false;
        if (dot(vv, vv) > 1e-8 && head.z < -0.3) {
            vec3 tail = head - vv;
            if (tail.z > -0.3) tail = head + (tail - head) * ((-0.3 - head.z) / (tail.z - head.z));
            vec2 d = head.xy / -head.z - tail.xy / -tail.z;
            float dl = length(d);
            vec3 ax = head - tail;
            float len = length(ax);
            if (dl > 1e-5 && len > 1e-4) {
                vec2 ay = vec2(-d.y, d.x) / dl;
                ax /= len;
                vec3 e = corner.x > 0.0 ? head + ax * (sz * 0.5) : tail - ax * (sz * 0.5);
                e.xy += ay * (corner.y * sz);
                mvPosition = vec4(e, 1.0);
                vHalf = len / sz;
                streak = true;
            }
        }
        if (!streak) mvPosition.xy += rc;
    }
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}`;

// Shared: position inside the sprite. q is in half-widths (x along a streak, y across), d = distance from
// the sprite's center line (0) to its edge (1), along = 0 at a streak's tail, 1 at its head.
const SPRITE_COORDS = /* glsl */`
    float ext = vHalf + 1.0;
    vec2 q = vec2((vUv.x - 0.5) * 2.0 * ext, (vUv.y - 0.5) * 2.0);
    float along = vHalf > 0.0 ? clamp((q.x + vHalf) / (2.0 * vHalf), 0.0, 1.0) : 1.0;
    float d = length(vec2(max(abs(q.x) - vHalf, 0.0), q.y));
    vec3 c = vColor.rgb;
    float shape = vParams.x, solid = vParams.y, prm = vParams.w;
`;

const INK = 'vec3(0.023, 0.007, 0.018)'; // the game's outline color (0x2a1424) in linear space

const GLOW_FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParams;
varying float vHalf;
#include <common>
#include <fog_pars_fragment>

// five-point star (Inigo Quilez)
float sdStar5(vec2 p, float r, float rf) {
    const vec2 k1 = vec2(0.809016994375, -0.587785252292);
    const vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

void main() {
    ${SPRITE_COORDS}
    vec3 col = vec3(0.0);   // light (premultiplied)
    float cov = 0.0;        // how much it covers what is behind it
    float amul = vColor.a;
    if (shape < 0.5) {
        // ORB (a streak tapers toward its tail)
        float tr = mix(1.0 - prm, 1.0, along);
        float dn = d / max(tr, 0.05);
        float g = 1.0 - smoothstep(0.0, 1.0, dn);
        g *= g;
        float core = 1.0 - smoothstep(0.0, 0.34, dn);
        col = (c * g + vec3(core) * 0.55) * tr;
        float sc = solid * (1.0 - smoothstep(0.2, 0.34, dn)) * tr;
        col = col * (1.0 - sc) + mix(c, vec3(1.0), 0.7) * sc;
        cov = sc;
    } else if (shape < 1.5) {
        // SPARKLE: four-point twinkle
        vec2 a = abs(q);
        float s = sqrt(a.x) + sqrt(a.y);
        float aa = fwidth(s) + 0.001;
        float body = 1.0 - smoothstep(0.9 - aa, 0.9 + aa, s);
        float hot = 1.0 - smoothstep(0.35, 0.6, s);
        float halo = 1.0 - smoothstep(0.0, 0.8, d);
        halo *= halo * 0.45;
        vec3 bc = mix(c, vec3(1.0), hot);
        cov = body * solid;
        col = bc * body + c * halo * (1.0 - body);
        col = col * (1.0 - cov) + bc * cov;
    } else if (shape < 2.5) {
        // RING
        float th = max(prm, 0.02);
        float rc = 0.8 - th * 0.4;   // leaves room for the glow inside the quad
        float dr = abs(d - rc);
        float aa = fwidth(d) + 0.001;
        float ring = 1.0 - smoothstep(th * 0.4 - aa, th * 0.4 + aa, dr);
        float halo = exp(-dr * 9.0) * 0.45 * (1.0 - smoothstep(0.86, 1.0, d));
        cov = ring * solid;
        col = c * (ring + halo * (1.0 - ring));
        col = col * (1.0 - cov) + mix(c, vec3(1.0), 0.25) * cov;
    } else if (shape < 3.5) {
        // BOLT: halo, solid body with a darker rim and a white core; thin and fading toward the tail
        float tr = mix(1.0 - prm, 1.0, along);
        float dn = d / max(tr, 0.05);
        float aa = fwidth(dn) + 0.002;
        float body = 1.0 - smoothstep(0.44 - aa, 0.44 + aa, dn);
        float rim = smoothstep(0.33 - aa, 0.33 + aa, dn) * body;
        float core = 1.0 - smoothstep(0.2 - aa, 0.2 + aa, dn);
        float halo = 1.0 - smoothstep(0.25, 1.0, dn);
        halo *= halo;
        float tf = smoothstep(0.0, 0.3, along);
        vec3 bc = mix(c, c * 0.3, rim);
        bc = mix(bc, vec3(1.0), core);
        cov = body * solid * tf;
        col = bc * cov + c * halo * 0.8 * tf * (1.0 - cov);
    } else if (shape < 4.5) {
        // STAR: cartoon five-point star with an ink outline and a shine
        float sd = sdStar5(vec2(q.x, -q.y) * 1.08, 0.82, 0.46);
        float aa = fwidth(sd) + 0.001;
        float fill = 1.0 - smoothstep(-aa, aa, sd);
        float inner = 1.0 - smoothstep(-aa, aa, sd + 0.13);
        float shine = 1.0 - smoothstep(0.0, 0.32, length(q - vec2(-0.16, 0.2)));
        vec3 fc = mix(${INK}, mix(c, vec3(1.0), shine * 0.55), inner);
        float halo = 1.0 - smoothstep(0.2, 1.0, d);
        halo *= halo * 0.4;
        cov = fill;
        col = fc * fill + c * halo * (1.0 - fill) * (1.0 - solid);
    } else if (shape < 5.5) {
        // BANG: spiky cartoon flash with a white center
        float n = max(prm, 3.0);
        float ang = atan(q.y, q.x);
        float tri = abs(fract(ang / 6.2831853 * n) - 0.5) * 2.0;
        float rr = mix(0.95, 0.55, tri);
        float aa = fwidth(d) + 0.002;
        float fill = 1.0 - smoothstep(rr - aa, rr + aa, d);
        float inner = 1.0 - smoothstep(rr * 0.6 - aa, rr * 0.6 + aa, d);
        float halo = 1.0 - smoothstep(0.3, 1.0, d);
        vec3 fc = mix(c, vec3(1.0), inner);
        cov = fill * solid;
        col = fc * fill + c * halo * 0.6 * (1.0 - fill);
        col = col * (1.0 - cov) + fc * cov;
    } else {
        // SPLAT: scorch mark. The dark part fades with alpha; the glowing rim with the color.
        float ang = atan(q.y, q.x);
        float sdv = prm * 6.2831853;
        float rr = 0.66 + 0.12 * sin(ang * 5.0 + sdv) + 0.07 * sin(ang * 9.0 + sdv * 2.3) + 0.05 * sin(ang * 14.0 + sdv * 4.1);
        float aa = fwidth(d) + 0.002;
        float body = 1.0 - smoothstep(rr - aa * 2.0, rr + aa, d);
        float rim = smoothstep(rr * 0.6, rr * 0.95, d) * body;
        float glowAmt = rim * 0.85 + (1.0 - smoothstep(rr, rr + 0.25, d)) * (1.0 - body) * 0.3;
        cov = body * solid * vColor.a;
        col = vec3(0.03, 0.016, 0.022) * cov * (1.0 - rim) + c * glowAmt;
        amul = 1.0;
    }
    col *= amul;
    cov *= amul;
    gl_FragColor = vec4(col, cov);
    #include <colorspace_fragment>
    #ifdef USE_FOG
    float fogK = 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor *= fogK;
    #endif
}`;

const SMOKE_FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParams;
varying float vHalf;
uniform float uFogScale;
#include <common>
#include <fog_pars_fragment>
void main() {
    ${SPRITE_COORDS}
    vec3 col;
    float a;
    if (shape < 0.5) {
        // PUFF: toon smoke with a cool shadow side, a highlight and an optional ink outline
        if (d > 1.0) discard;
        float hl = 1.0 - smoothstep(0.6, 0.68, length(q - vec2(-0.26, 0.3)));
        col = mix(c * vec3(0.8, 0.76, 0.9), c, hl);
        col *= mix(1.0, 0.86, smoothstep(0.84, 0.96, d));
        float aa = fwidth(d) + 0.001;
        if (prm > 0.0) {
            float o = smoothstep(1.0 - prm - aa, 1.0 - prm + aa, d);
            col = mix(col, mix(c * 0.4, ${INK}, 0.55), o);
            a = vColor.a * (1.0 - smoothstep(1.0 - aa * 1.5, 1.0, d));
        } else {
            a = vColor.a * (1.0 - smoothstep(0.92, 1.0, d));
        }
    } else {
        // CHUNK: a lumpy bit of debris, lit from the top left, with an ink outline
        float ang = atan(q.y, q.x);
        float rr = 0.74 + 0.1 * cos(ang * 5.0 + prm * 6.2831853) + 0.05 * cos(ang * 3.0 + prm * 11.0);
        float sd = d - rr;
        float aa = fwidth(sd) + 0.001;
        float fill = 1.0 - smoothstep(-aa, aa, sd);
        if (fill <= 0.0) discard;
        float inner = 1.0 - smoothstep(-aa, aa, sd + 0.2);
        float lit = step(0.0, q.y * 0.8 - q.x * 0.6 + 0.1);
        col = mix(${INK}, c * mix(0.62, 1.0, lit), inner);
        a = vColor.a * fill;
    }
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
    #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear * uFogScale, fogFar * uFogScale, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.85);
    #endif
}`;

export class BillboardBatch {
    // mode: 'smoke' (normal blending) or 'glow' (premultiplied: additive light plus solid parts)
    constructor(max, mode, { fogScale = 1, order } = {}) {
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
        this.aParams = mk(4);
        geo.setAttribute('iPos', this.aPos);
        geo.setAttribute('iVel', this.aVel);
        geo.setAttribute('iSize', this.aSize);
        geo.setAttribute('iColor', this.aColor);
        geo.setAttribute('iParams', this.aParams);
        geo.instanceCount = 0;
        this.geo = geo;
        this.attrs = [[this.aPos, 3], [this.aVel, 3], [this.aSize, 2], [this.aColor, 4], [this.aParams, 4]];

        const glow = mode === 'glow';
        const mat = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFogScale: { value: fogScale } }]),
            vertexShader: BB_VERT,
            fragmentShader: glow ? GLOW_FRAG : SMOKE_FRAG,
            transparent: true,
            depthWrite: false,
            fog: true,
        });
        if (glow) {
            mat.blending = THREE.CustomBlending;
            mat.blendEquation = THREE.AddEquation;
            mat.blendSrc = THREE.OneFactor;
            mat.blendDst = THREE.OneMinusSrcAlphaFactor;
            mat.blendSrcAlpha = THREE.OneFactor;
            mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
        } else {
            mat.blending = THREE.NormalBlending;
        }
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = order != null ? order : glow ? 12 : 10;
        this.mesh.visible = false;
    }

    begin() {
        this.count = 0;
    }

    push(x, y, z, vx, vy, vz, size, rot, r, g, b, a, shape = 0, solid = 0, flat = 0, param = 0) {
        if (this.count >= this.max) return;
        const i = this.count++;
        const P = this.aPos.array, V = this.aVel.array, S = this.aSize.array, C = this.aColor.array, Q = this.aParams.array;
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
        V[i * 3] = vx; V[i * 3 + 1] = vy; V[i * 3 + 2] = vz;
        S[i * 2] = size; S[i * 2 + 1] = rot;
        C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a;
        Q[i * 4] = shape; Q[i * 4 + 1] = solid; Q[i * 4 + 2] = flat; Q[i * 4 + 3] = param;
    }

    end() {
        const n = this.count;
        this.geo.instanceCount = n;
        this.mesh.visible = n > 0; // an empty batch costs no draw call
        for (const [attr, w] of this.attrs) {
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
        this.reset();
    }

    reset() {
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
        this.batch = SMOKE;
        this.fadeIn = 0;
        this.shape = 0; this.solid = 0; this.param = 0;
        this.flat = false; this.nx = 0; this.ny = 1; this.nz = 0;
        this.pop = 0;            // > 0: cartoon size curve (pops out with an overshoot, holds, shrinks away)
        this.aPow = 1;           // alpha curve (3 = holds, then fades late)
        this.cPow = 1;           // color curve (0.5 = changes early)
        this.twinkle = 0;        // > 0: brightness flickers this fast
    }
}

const easeOutBack = (k) => {
    const m = k - 1;
    return 1 + 2.2 * m * m * m + 1.2 * m * m;
};

export class Effects {
    constructor(scene) {
        this.scene = scene;
        this.smoke = new BillboardBatch(900, 'smoke');
        this.glow = new BillboardBatch(1400, 'glow');
        this.far = new BillboardBatch(260, 'smoke', { fogScale: 3.2 }); // big smoke column (visible from far)
        this.ground = new BillboardBatch(200, 'glow', { order: 9 });   // scorch marks + shock rings (under the smoke)
        this.batches = [this.smoke, this.glow, this.far, this.ground];
        scene.add(this.smoke.mesh, this.glow.mesh, this.far.mesh, this.ground.mesh);
        this.parts = [];
        this.pool = [];
        for (let i = 0; i < 700; i++) this.pool.push(new Particle());
        this.emitters = [];
        this.extra = []; // per-frame billboards pushed by other systems (bolts, etc.)
        this.eatGlow = 0;

        // Flash light for explosions / muzzle (always in the scene; only its intensity changes)
        this.flash = new THREE.PointLight(0xffc27a, 0, 22, 1.6);
        scene.add(this.flash);
        this.flashT = 0;
        this.flashI = 0;
        this.flashDur = 1;

        // Light columns (aliens beaming in): a small pool of meshes made up front
        this.columnGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
        this.columnGeo.translate(0, 0.5, 0);
        this.columns = [];
        for (let i = 0; i < 6; i++) {
            const m = new THREE.Mesh(this.columnGeo, new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
            }));
            m.renderOrder = 12;
            m.visible = false;
            scene.add(m);
            this.columns.push({ m, t: 0, life: 1, r: 1, h: 1, on: false });
        }
    }

    // Low-level spawn (no options object). Returns the particle so presets can set the rest.
    emit(batch, x, y, z, vx, vy, vz, life, size, size1, color, color1, alpha, alpha1) {
        const p = this.pool.pop() || new Particle();
        p.reset();
        p.batch = batch;
        p.x = x; p.y = y; p.z = z;
        p.vx = vx; p.vy = vy; p.vz = vz;
        p.max = life;
        p.s0 = size; p.s1 = size1;
        _c1.setHex(color);
        _c2.setHex(color1);
        p.r0 = _c1.r; p.g0 = _c1.g; p.b0 = _c1.b;
        p.r1 = _c2.r; p.g1 = _c2.g; p.b1 = _c2.b;
        p.a0 = alpha; p.a1 = alpha1;
        this.parts.push(p);
        return p;
    }

    // Generic particle spawn. Colors are hex numbers.
    spawn(o) {
        const c0 = o.color != null ? o.color : 0xffffff;
        const p = this.emit(o.batch || 0, o.x, o.y, o.z, o.vx || 0, o.vy || 0, o.vz || 0, o.life || 1,
            o.size != null ? o.size : 1, o.size1 != null ? o.size1 : (o.size != null ? o.size : 1),
            c0, o.color1 != null ? o.color1 : c0, o.alpha != null ? o.alpha : 1, o.alpha1 != null ? o.alpha1 : 0);
        p.grav = o.grav || 0;
        p.drag = o.drag || 0;
        p.stretch = o.stretch || 0;
        p.rot = o.rot || 0;
        p.rotV = o.rotV || 0;
        p.fadeIn = o.fadeIn || 0;
        if (o.shape) p.shape = o.shape;
        if (o.solid) p.solid = o.solid;
        if (o.param) p.param = o.param;
        if (o.pop) p.pop = o.pop;
        return p;
    }

    // ---------- Presets ----------

    // Cartoon "poof" when an alien is beaten: a white pop, a ring, chunky toon puffs that
    // swell and shrink away, twinkles and a few little yellow stars.
    poof(x, y, z, scale = 1) {
        const s = scale;
        y += 0.35 * s; // (an alien lying down poofs at ground level: keep the cloud above the ground)
        let p = this.emit(GLOW, x, y + 0.6 * s, z, 0, 0, 0, 0.16, 1.3 * s, 2.0 * s, 0xffffff, 0xfff3b0, 1, 0);
        p.shape = FX.BANG; p.solid = 1; p.param = 9; p.rot = Math.random() * 6.3;
        p = this.emit(GLOW, x, y + 0.65 * s, z, 0, 0, 0, 0.28, 1.0 * s, 3.0 * s, 0xffffff, 0xbfe9ff, 0.9, 0);
        p.shape = FX.RING; p.param = 0.16; p.solid = 0.6;
        for (let i = 0; i < 11; i++) {
            const a = (i / 11) * Math.PI * 2 + rand(-0.3, 0.3);
            const up = rand(-0.2, 1);
            const sp = rand(1.6, 3.4) * s;
            p = this.emit(SMOKE,
                x + Math.cos(a) * 0.25 * s, y + rand(0.2, 1.2) * s, z + Math.sin(a) * 0.25 * s,
                Math.cos(a) * sp, up * sp * 0.7 + 0.6 * s, Math.sin(a) * sp,
                rand(0.75, 1.05), 0.2 * s, rand(0.85, 1.35) * s, 0xffffff, i % 3 ? 0xf1ecff : 0xdff3ff, 1, 1);
            p.pop = 0.22; p.drag = 4.2; p.grav = -0.9; p.param = 0.1;
        }
        for (let i = 0; i < 7; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(2.5, 5.5) * Math.sqrt(s);
            p = this.emit(GLOW, x, y + rand(0.4, 1.3) * s, z,
                Math.cos(a) * sp, rand(1.5, 4.5), Math.sin(a) * sp,
                rand(0.5, 0.85), rand(0.32, 0.5) * s, 0.05, i % 2 ? 0x9fe8ff : 0xfff1a8, 0x6fa8ff, 1, 0.6);
            p.shape = FX.SPARKLE; p.drag = 2.2; p.grav = 3; p.solid = 0.7; p.twinkle = 18; p.rotV = rand(-3, 3);
        }
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + rand(-0.5, 0.5);
            const sp = rand(2.4, 4) * Math.sqrt(s);
            p = this.emit(GLOW, x, y + rand(0.8, 1.4) * s, z,
                Math.cos(a) * sp, rand(3, 5), Math.sin(a) * sp,
                rand(0.6, 0.8), 0.34 * Math.sqrt(s), 0.3 * Math.sqrt(s), 0xffd23a, 0xffd23a, 1, 1);
            p.shape = FX.STAR; p.solid = 1; p.drag = 1.6; p.grav = 7; p.rotV = rand(-7, 7); p.rot = rand(0, 6); p.pop = 0.15;
        }
    }

    sparks(x, y, z, color = 0xffd27a, count = 10, speed = 6, size = 0.12) {
        for (let i = 0; i < count; i++) {
            const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
            const s = Math.sqrt(1 - u * u);
            const sp = rand(0.4, 1) * speed;
            const p = this.emit(GLOW, x, y, z, s * Math.cos(th) * sp, u * sp + speed * 0.3, s * Math.sin(th) * sp,
                rand(0.25, 0.55), size * 1.3, size * 0.4, color, color, 1, 0);
            p.grav = 12; p.drag = 1.2; p.stretch = 0.05; p.param = 0.7; p.solid = 0.5;
        }
    }

    // Sparks sprayed off a surface (n = the surface normal), as streaks
    spray(x, y, z, nx, ny, nz, color, count, speed, size, life = 0.4) {
        for (let i = 0; i < count; i++) {
            let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
            const k = dx * nx + dy * ny + dz * nz;
            if (k < 0) { dx -= 2 * k * nx; dy -= 2 * k * ny; dz -= 2 * k * nz; }
            dx += nx * 0.9; dy += ny * 0.9 + 0.25; dz += nz * 0.9;
            const l = Math.hypot(dx, dy, dz) || 1;
            const sp = rand(0.45, 1) * speed / l;
            const p = this.emit(GLOW, x, y, z, dx * sp, dy * sp, dz * sp, rand(0.6, 1) * life, size, size * 0.35,
                i % 3 ? color : 0xffffff, color, 1, 0);
            p.grav = 14; p.drag = 2.2; p.stretch = 0.045; p.param = 0.75; p.solid = 0.8;
        }
    }

    // Cartoon five-point stars popping out (headshots, poofs)
    stars(x, y, z, count, color = 0xffd23a, size = 0.3, speed = 3) {
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + rand(-0.4, 0.4);
            const p = this.emit(GLOW, x, y, z, Math.cos(a) * speed, rand(2.2, 3.6), Math.sin(a) * speed,
                rand(0.5, 0.7), size, size * 0.8, color, color, 1, 1);
            p.shape = FX.STAR; p.solid = 1; p.drag = 2.4; p.grav = 8; p.rotV = rand(-8, 8); p.rot = rand(0, 6); p.pop = 0.2;
        }
    }

    // Single glints
    sparkle(x, y, z, color, size, life = 0.25, solid = 0.8) {
        const p = this.emit(GLOW, x, y, z, 0, 0, 0, life, size, size * 0.2, color, color, 1, 0.4);
        p.shape = FX.SPARKLE; p.solid = solid; p.rot = rand(-0.4, 0.4);
        return p;
    }

    bang(x, y, z, color, size, life = 0.1, spikes = 8) {
        const p = this.emit(GLOW, x, y, z, 0, 0, 0, life, size, size * 1.25, color, color, 1, 0);
        p.shape = FX.BANG; p.solid = 1; p.param = spikes; p.rot = Math.random() * 6.3;
        return p;
    }

    // A ring that faces the camera (flat = false) or lies on a surface with normal n
    burstRing(x, y, z, color, r0, r1, life, thick = 0.15, solid = 0.4, nx = 0, ny = 0, nz = 0, alpha = 1) {
        const flat = nx !== 0 || ny !== 0 || nz !== 0;
        // (the ring is drawn at 80% of its quad, leaving room for its glow)
        const p = this.emit(flat ? GROUND : GLOW, x, y, z, 0, 0, 0, life, r0 * 2.5, r1 * 2.5, color, color, alpha, 0);
        p.shape = FX.RING; p.param = thick; p.solid = solid;
        if (flat) { p.flat = true; p.nx = nx; p.ny = ny; p.nz = nz; }
        p.aPow = 0.8;
        return p;
    }

    // Scorch mark on a surface (n = normal) with a glowing rim that cools down
    decal(x, y, z, nx, ny, nz, size, color, life = 2.2, dark = 0.55) {
        const p = this.emit(GROUND, x + nx * 0.07, y + ny * 0.07, z + nz * 0.07, 0, 0, 0, life, size * 0.8, size, color, 0x000000, 1, 0);
        p.shape = FX.SPLAT; p.solid = dark; p.param = Math.random();
        p.flat = true; p.nx = nx; p.ny = ny; p.nz = nz;
        p.rot = Math.random() * 6.3;
        p.pop = 0.04;
        p.aPow = 3; p.cPow = 0.45;
        return p;
    }

    dust(x, y, z, count = 6, spread = 0.6, color = 0xd99a74, size = 0.5) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(0.6, 2.2);
            const p = this.emit(SMOKE, x + Math.cos(a) * spread * Math.random(), y + 0.15, z + Math.sin(a) * spread * Math.random(),
                Math.cos(a) * sp, rand(0.3, 1.2), Math.sin(a) * sp,
                rand(0.6, 1.1), size * rand(0.6, 1), size * rand(1.4, 2.2), color, color, 0.7, 0);
            p.drag = 2.5;
        }
    }

    glowFlash(x, y, z, color, size, life = 0.15) {
        // player.js draws its old muzzle glow (cyan, size 0.6) right after Combat.playerBolt(); Combat now draws a
        // muzzle flash that follows the gun, so that one call is skipped (eatGlow is set by playerBolt).
        if (this.eatGlow > 0 && color === 0x6ff0ff && size === 0.6) { this.eatGlow = 0; return; }
        this.emit(GLOW, x, y, z, 0, 0, 0, life, size, size * 1.3, color, color, 1, 0);
    }

    lightFlash(x, y, z, color, intensity = 40, dur = 0.25) {
        // a big flash isn't cut short by a small one (the muzzle)
        if (this.flashT > 0 && this.flash.intensity > intensity) return;
        this.flash.position.set(x, y, z);
        this.flash.color.set(color);
        this.flash.intensity = intensity;
        this.flashI = intensity;
        this.flashT = dur;
        this.flashDur = dur;
    }

    // Chunky cartoon explosion (sticky grenades, the ship blowing up).
    // opts: debris (color), groundY (where the ground is, for the shock ring), scorch (leave a mark on the ground)
    explosion(x, y, z, radius = 6, color = 0x6fd8ff, opts = {}) {
        const R = radius;
        const debris = opts.debris != null ? opts.debris : 0x6b4a52;
        this.lightFlash(x, y + 1, z, color, 70, 0.4);
        let p = this.emit(GLOW, x, y + 0.8, z, 0, 0, 0, 0.12, R * 0.45, R * 0.75, 0xffffff, color, 1, 0);
        p.shape = FX.BANG; p.solid = 1; p.param = 11; p.rot = Math.random() * 6.3;
        p = this.emit(GLOW, x, y + 0.8, z, 0, 0, 0, 0.2, R * 0.5, R * 1.0, color, color, 0.4, 0);
        // air shockwave + ground shockwave
        this.burstRing(x, y + 0.9, z, 0xffffff, R * 0.2, R * 0.95, 0.25, 0.1, 0.3, 0, 0, 0, 0.8);
        const gy = opts.groundY != null ? opts.groundY : y;
        if (y - gy < 3) this.burstRing(x, gy + 0.06, z, color, R * 0.2, R * 1.15, 0.42, 0.12, 0.35, 0, 1, 0);
        // fireball: chunky toon puffs that pop out white, take the blast color and shrink away
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + rand(-0.25, 0.25);
            const sp = rand(3, 7.5) * R / 6.5;
            p = this.emit(SMOKE,
                x + Math.cos(a) * 0.4, y + rand(0.3, 1.8), z + Math.sin(a) * 0.4,
                Math.cos(a) * sp, rand(1.5, 5.5), Math.sin(a) * sp,
                rand(0.6, 0.85), 0.3, rand(1.5, 2.3) * R / 6.5, i % 4 ? color : 0xffffff, i % 2 ? opts.puff2 || 0xb9a8ff : color, 1, 1);
            p.pop = 0.16; p.drag = 4; p.grav = -2; p.param = 0.08; p.cPow = 0.7;
        }
        // smoke that drifts up and fades
        for (let i = 0; i < 9; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(1.5, 4) * R / 6.5;
            p = this.emit(SMOKE, x + Math.cos(a) * 0.6, y + rand(0.5, 2), z + Math.sin(a) * 0.6,
                Math.cos(a) * sp, rand(1.5, 3.5), Math.sin(a) * sp,
                rand(1.1, 1.7), rand(0.8, 1.2) * R / 6.5, rand(2, 3) * R / 6.5, 0xd8d0e0, 0xa89cb4, 0.95, 0);
            p.drag = 2.2; p.grav = -0.9; p.fadeIn = 0.12; p.aPow = 1.6;
        }
        // debris chunks
        for (let i = 0; i < 9; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(4, 9);
            p = this.emit(SMOKE, x, y + 0.6, z, Math.cos(a) * sp, rand(5, 10), Math.sin(a) * sp,
                rand(0.7, 1.1), rand(0.22, 0.38), rand(0.18, 0.3), debris, debris, 1, 1);
            p.shape = FX.CHUNK; p.grav = 20; p.drag = 0.6; p.rotV = rand(-12, 12); p.param = Math.random(); p.aPow = 6;
        }
        this.spray(x, y + 0.5, z, 0, 1, 0, color, 22, 16, 0.32, 0.6);
        this.spray(x, y + 0.5, z, 0, 1, 0, 0xffffff, 8, 12, 0.24, 0.5);
        // embers: twinkles that float down
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(2, 6);
            p = this.emit(GLOW, x, y + rand(1, 2.5), z, Math.cos(a) * sp, rand(3, 7), Math.sin(a) * sp,
                rand(0.8, 1.3), 0.4, 0.1, 0xffffff, color, 1, 0);
            p.shape = FX.SPARKLE; p.solid = 0.6; p.drag = 2.5; p.grav = 3; p.twinkle = 14;
        }
        if (opts.scorch) this.decal(x, gy, z, 0, 1, 0, R * 0.75, color, 3.5, 0.5);
    }

    // Big fiery explosion (ship crash in the intro)
    bigBoom(x, y, z, scale = 1) {
        this.lightFlash(x, y + 3, z, 0xffa040, 300, 0.8);
        let p = this.emit(GLOW, x, y + 3, z, 0, 0, 0, 0.3, 20 * scale, 26 * scale, 0xffffff, 0xffffff, 1, 0);
        p = this.emit(GLOW, x, y + 3, z, 0, 0, 0, 0.9, 40 * scale, 52 * scale, 0xff9a30, 0xff9a30, 1, 0);
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(4, 14) * scale;
            p = this.emit(FAR, x, y + rand(0, 4), z, Math.cos(a) * sp, rand(4, 14) * scale, Math.sin(a) * sp,
                rand(1.2, 2.4), rand(2, 4) * scale, rand(6, 10) * scale, 0xffb04a, 0x6a5a60, 1, 0);
            p.drag = 1.6; p.grav = -1;
        }
        this.sparks(x, y + 2, z, 0xffc070, 40, 24 * scale, 0.5 * scale);
    }

    // Flat shockwave ring on the ground (aliens beaming in, the boss's slams)
    ring(x, y, z, color, radius, life) {
        this.burstRing(x, y, z, color, radius * 0.2, radius, life, 0.18, 0, 0, 1, 0, 0.9);
    }

    // Quick ball of light
    sphereFlash(x, y, z, color, radius, life) {
        const p = this.emit(GLOW, x, y, z, 0, 0, 0, life, radius * 0.8, radius * 2, color, color, 0.8, 0);
        p.solid = 0.3;
    }

    // Column of light (aliens teleporting in)
    beamColumn(x, y, z, color, radius, height, life) {
        let C = this.columns.find((c) => !c.on);
        if (!C) C = this.columns.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
        C.on = true;
        C.t = 0; C.life = life; C.r = radius; C.h = height;
        C.m.position.set(x, y, z);
        C.m.material.color.set(color);
        C.m.material.opacity = 0.85;
        C.m.scale.set(radius, 0.01, radius);
        C.m.visible = true;
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
        this.eatGlow = 0;
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
            if (p.drag) {
                const dr = Math.exp(-p.drag * dt);
                p.vx *= dr; p.vy *= dr; p.vz *= dr;
            }
            p.vy -= p.grav * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            p.rot += p.rotV * dt;
            parts[w++] = p;
        }
        parts.length = w;

        const B = this.batches;
        for (const b of B) b.begin();
        for (const p of parts) {
            const t = p.life / p.max;
            let size;
            if (p.pop > 0) {
                const k = t < p.pop ? easeOutBack(t / p.pop) : 1;
                const sh = t > 0.62 ? (t - 0.62) / 0.38 : 0;
                size = (p.s0 + (p.s1 - p.s0) * k) * (1 - sh * sh);
            } else {
                size = p.s0 + (p.s1 - p.s0) * t;
            }
            const ta = p.aPow === 1 ? t : Math.pow(t, p.aPow);
            let a = p.a0 + (p.a1 - p.a0) * ta;
            if (p.fadeIn > 0) a *= clamp(p.life / p.fadeIn, 0, 1);
            if (p.twinkle > 0) a *= 0.65 + 0.35 * Math.sin(p.life * p.twinkle + p.s1 * 40);
            const tc = p.cPow === 1 ? t : Math.pow(t, p.cPow);
            const r = p.r0 + (p.r1 - p.r0) * tc;
            const g = p.g0 + (p.g1 - p.g0) * tc;
            const b = p.b0 + (p.b1 - p.b0) * tc;
            const batch = B[p.batch];
            if (p.flat) {
                batch.push(p.x, p.y, p.z, p.nx, p.ny, p.nz, size, p.rot, r, g, b, a, p.shape, p.solid, 1, p.param);
            } else {
                const st = p.stretch;
                batch.push(p.x, p.y, p.z, p.vx * st, p.vy * st, p.vz * st, size, p.rot, r, g, b, a, p.shape, p.solid, 0, p.param);
            }
        }
        for (const fn of this.extra) fn(this.glow, this.smoke, this);
        for (const b of B) b.end();

        // light columns
        for (const C of this.columns) {
            if (!C.on) continue;
            C.t += dt;
            const t = C.t / C.life;
            if (t >= 1) {
                C.on = false;
                C.m.visible = false;
                continue;
            }
            // shoots up fast, then thins out
            const wd = C.r * (1 - t * 0.75);
            C.m.scale.set(wd, C.h * Math.min(1, t * 6) + 0.01, wd);
            C.m.material.opacity = (1 - t) * (1 - t) * 0.85;
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
