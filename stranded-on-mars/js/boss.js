// ============================================================
// GLORBAX — the Tentacled Terror of the Mothership. A giant one-eyed
// space kraken that lives in the creature pit. Its skin is too tough
// for blasters, so shoot the big EYE!
// Attacks: tentacle slams (the shockwave can be jumped over), goo spit,
// a slow tracking eye laser (hide behind a pillar!), and alien helpers.
// It gets angrier (and red) as it gets hurt.
// ============================================================

import * as THREE from 'three';
import { GeoBuilder, toonMaterial, addOutline, glowSprite } from './toon.js';
import { BOSS, HOLES } from './shiplayout.js';
import { clamp, lerp, damp, dampAngle, rand, easeInOut, easeIn, easeOut, wrapAngle, smoothstep } from './util.js';

const COL = {
    skin: 0x5b45c8, belly: 0x9f8cf2, back: 0x35278a, gold: 0xf2c14e, fang: 0xfffaf2,
    mouth: 0x2a0f2a, sucker: 0xffa6cf, eye: 0xfff6dc, iris: 0xffc23a, pupil: 0x140a1a,
    ink: 0x1b1030, lid: 0x4434a8, spot: 0x9ffcff, spotRim: 0x2fb4d6,
};
const N_TENT = 6;
const N_SEG = 22;          // invisible hit spheres along each tentacle (they block shots)
const T_RINGS = 40;        // the tentacle skin: rings along each arm...
const T_SIDES = 12;        // ...and points around each ring
const T_COLS = T_SIDES + 1;
const T_VERTS = T_RINGS * T_COLS;
const T_REST_LEN = 14;     // about how long an arm is (spaces the suckers out)
const CURL_FROM = Math.round(0.6 * (T_RINGS - 1)); // the tip curls from here on
const PIT = HOLES[1];
const RING_IN = PIT.r + 1.5;
const RING_OUT = 26.6;
const BODY_Y = 3.8;
const EYE_R = 1.55;
const EYE_LOCAL = new THREE.Vector3(0, 1.25, 3.45);
const MOUTH_LOCAL = new THREE.Vector3(0, -1.15, 3.55);
const BROW = new THREE.Vector3(0, EYE_LOCAL.y + EYE_R + 0.35, 2.75); // where the brow bends
const FIN = new THREE.Vector3(3.75, 1.4, -0.9);                       // where the ear fins hinge

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _base = new THREE.Vector3();
const _side = new THREE.Vector3(), _axis = new THREE.Vector3(), _prev = new THREE.Vector3(), _seg = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _mx = new THREE.Matrix4();
const _sc = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const T_COS = Array.from({ length: T_COLS }, (_, j) => Math.cos((j / T_SIDES) * Math.PI * 2));
const T_SIN = Array.from({ length: T_COLS }, (_, j) => Math.sin((j / T_SIDES) * Math.PI * 2));

function bez(p0, p1, p2, p3, u, out) {
    const a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
    return out.set(
        p0.x * a + p1.x * b + p2.x * c + p3.x * d,
        p0.y * a + p1.y * b + p2.y * c + p3.y * d,
        p0.z * a + p1.z * b + p2.z * c + p3.z * d,
    );
}

function bezD(p0, p1, p2, p3, u, out) {
    const a = -3 * (1 - u) ** 2, b = 3 * (1 - u) ** 2 - 6 * u * (1 - u), c = 6 * u * (1 - u) - 3 * u * u, d = 3 * u * u;
    return out.set(
        p0.x * a + p1.x * b + p2.x * c + p3.x * d,
        p0.y * a + p1.y * b + p2.y * c + p3.y * d,
        p0.z * a + p1.z * b + p2.z * c + p3.z * d,
    );
}

// Where does segment a-b first enter a sphere? (t in 0..1, or -1)
function segSphere(a, b, c, r) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
    const A = dx * dx + dy * dy + dz * dz;
    const B = 2 * (fx * dx + fy * dy + fz * dz);
    const Cc = fx * fx + fy * fy + fz * fz - r * r;
    if (Cc <= 0) return 0;
    const disc = B * B - 4 * A * Cc;
    if (disc < 0 || A < 1e-9) return -1;
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    return t >= 0 && t <= 1 ? t : -1;
}

// Closest distance between segment p0-p1 and segment q0-q1
function segSegDist(p0, p1, q0, q1) {
    const d1x = p1.x - p0.x, d1y = p1.y - p0.y, d1z = p1.z - p0.z;
    const d2x = q1.x - q0.x, d2y = q1.y - q0.y, d2z = q1.z - q0.z;
    const rx = p0.x - q0.x, ry = p0.y - q0.y, rz = p0.z - q0.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    let s, t;
    const c = d1x * rx + d1y * ry + d1z * rz;
    const bb = d1x * d2x + d1y * d2y + d1z * d2z;
    const den = a * e - bb * bb;
    s = den > 1e-9 ? clamp((bb * f - c * e) / den, 0, 1) : 0;
    t = (bb * s + f) / e;
    if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((bb - c) / a, 0, 1); }
    const x = p0.x + d1x * s - (q0.x + d2x * t), y = p0.y + d1y * s - (q0.y + d2y * t), z = p0.z + d1z * s - (q0.z + d2z * t);
    return Math.sqrt(x * x + y * y + z * z);
}

// ------------------------------------------------------------
// The model
// ------------------------------------------------------------
// Shader add-ons for GLORBAX's toon materials (one program each, no extra lights):
//  GLX_DEFORM  the body squishes: the mantle breathes, the cheeks puff, the brow bends,
//              the ear fins flap and the whole jelly wobbles when the eye gets hit
//  GLX_RAGE    furious: the purple skin turns red (gold, teeth and spots keep their colors)
//  GLX_TENT    tentacle skin: darker back, light belly and two rows of suckers
//  GLX_EYE     the eye: iris, a pupil that narrows to a slit, a red-hot glow and dizzy spirals
const f3 = (n) => n.toFixed(3);
const GLX_VERT = /* glsl */`
#ifdef GLX_DEFORM
attribute float gpart;
uniform float uBreath;
uniform float uJig;
uniform float uJigT;
uniform float uPuff;
uniform float uFlap;
uniform float uBrowTilt;
uniform float uBrowLift;
vec3 glxRotZ(vec3 q, float a) {
    float c = cos(a), s = sin(a);
    return vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z);
}
vec3 glxDeform(vec3 p) {
    if (gpart > 0.5 && gpart < 1.5) {
        vec3 piv = vec3(0.0, ${f3(BROW.y)}, ${f3(BROW.z)});
        p = piv + glxRotZ(p - piv, uBrowTilt * clamp(p.x / 1.3, -1.0, 1.0)) + vec3(0.0, uBrowLift, 0.0);
    } else if (gpart > 1.5) {
        float sx = sign(p.x);
        vec3 piv = vec3(sx * ${f3(FIN.x)}, ${f3(FIN.y)}, ${f3(FIN.z)});
        p = piv + glxRotZ(p - piv, uFlap * sx);
    }
    float mantle = smoothstep(0.5, 4.5, p.y - p.z * 0.45);
    p += (p - vec3(0.0, 0.8, -1.2)) * (uBreath * 0.07 * mantle);
    vec3 m = (p - vec3(0.0, ${f3(MOUTH_LOCAL.y + 0.3)}, ${f3(MOUTH_LOCAL.z - 0.9)})) * vec3(0.42, 0.85, 0.75);
    p += normalize(p - vec3(0.0, 0.3, 0.0)) * (uPuff * 0.55 * exp(-dot(m, m)) * smoothstep(0.5, 1.7, abs(p.x)));
    float r = length(p - vec3(0.0, ${f3(EYE_LOCAL.y)}, ${f3(EYE_LOCAL.z)}));
    p += (p - vec3(0.0, 0.6, 0.0)) * (sin(r * 1.8 - uJigT * 22.0) * uJig * 0.05 * smoothstep(0.8, 2.8, r));
    return p;
}
#endif
#ifdef GLX_TENT
attribute vec3 tuv;
varying vec3 vTuv;
#endif
#ifdef GLX_EYE
varying vec3 vEyeP;
#endif
`;
const GLX_BEGIN = /* glsl */`
#ifdef GLX_DEFORM
transformed = glxDeform(transformed);
#endif
#ifdef GLX_TENT
vTuv = tuv;
#endif
#ifdef GLX_EYE
vEyeP = position;
#endif
`;
const GLX_FRAG = /* glsl */`
#ifdef GLX_RAGE
uniform float uRage;
uniform vec3 uRageSpot;
vec3 glxHue(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
vec3 glxRage(vec3 c) {
    float w = smoothstep(0.04, 0.16, c.b - c.g) * uRage;
    vec3 r = max(glxHue(c, 2.05), vec3(0.0));
    r = max(mix(vec3(dot(r, vec3(0.3, 0.59, 0.11))), r, 1.45), vec3(0.0)) * vec3(1.0, 0.8, 0.8);
    return mix(c, r, w);
}
#endif
#ifdef GLX_TENT
varying vec3 vTuv;
uniform vec3 uTTop;
uniform vec3 uTSkin;
uniform vec3 uTBelly;
uniform vec3 uTSuck;
uniform vec3 uTSuckRim;
#endif
#ifdef GLX_EYE
varying vec3 vEyeP;
uniform vec4 uEyeA;
uniform vec3 uSclera;
uniform vec3 uIrisIn;
uniform vec3 uIrisOut;
uniform vec3 uIrisRing;
uniform vec3 uPupilCol;
uniform vec3 uEyeGlow;
#endif
`;
const GLX_COLOR = /* glsl */`
#ifdef GLX_TENT
{
    float side = abs(vTuv.y - 0.5) * 2.0;
    float fw = fwidth(side) * 1.5;
    vec3 c = mix(uTBelly, uTSkin, smoothstep(0.36 - fw, 0.36 + fw, side));
    c = mix(c, uTTop, smoothstep(0.8 - fw, 0.8 + fw, side));
    #ifdef GLX_RAGE
    c = glxRage(c);
    #endif
    float row = vTuv.y < 0.5 ? 0.0 : 0.5;
    vec2 sq = vec2((fract(vTuv.x + row) - 0.5) / 0.36, (abs(vTuv.y - 0.5) - 0.062) / 0.028);
    float sd = length(sq);
    float sfw = length(vec2(fwidth(vTuv.x) / 0.36, fwidth(vTuv.y) / 0.028)) * 0.8;
    float fade = smoothstep(0.05, 0.1, vTuv.z) * (1.0 - smoothstep(0.88, 0.94, vTuv.z));
    float disc = (1.0 - smoothstep(1.0 - sfw, 1.0 + sfw, sd)) * fade;
    vec3 sc = mix(uTSuck, uTSuckRim, smoothstep(0.66 - sfw, 0.66 + sfw, sd));
    sc = mix(sc, uTSuckRim * 0.8, 1.0 - smoothstep(0.26 - sfw, 0.26 + sfw, sd));
    diffuseColor.rgb = mix(c, sc, disc);
}
#elif defined(GLX_RAGE)
diffuseColor.rgb = glxRage(diffuseColor.rgb);
#ifdef USE_GLOW_ATTR
diffuseColor.rgb = mix(diffuseColor.rgb, uRageSpot, step(0.5, vGlow) * uRage);
#endif
#endif
#ifdef GLX_EYE
{
    vec3 en = normalize(vEyeP);
    vec2 q = en.xy / (1.0 + max(en.z, -0.5));
    float qa = length(q);
    float afw = fwidth(qa) * 1.2;
    float irisR = uEyeA.x;
    float iris = 1.0 - smoothstep(irisR - afw, irisR + afw, qa);
    float ang = atan(q.y, q.x);
    vec3 ic = mix(uIrisIn, uIrisOut, smoothstep(irisR * 0.2, irisR, qa));
    ic *= 0.86 + 0.14 * sin(ang * 13.0 + sin(ang * 4.0) * 1.7);
    ic = mix(ic, uIrisRing, smoothstep(irisR * 0.84 - afw, irisR * 0.84 + afw, qa));
    float pd = length(vec2(q.x / max(uEyeA.z, 0.05), q.y)) / uEyeA.y;
    float pfw = fwidth(pd) * 1.2;
    float pupil = 1.0 - smoothstep(1.0 - pfw, 1.0 + pfw, pd);
    float spiral = step(0.5, fract(ang / 6.28318 + qa * 7.0 - uTime * 1.6)) * iris;
    pupil = mix(pupil, spiral, uEyeA.w);
    diffuseColor.rgb = mix(mix(uSclera, ic, iris), uPupilCol, pupil);
    totalEmissiveRadiance += uEyeGlow * iris * (1.0 - pupil);
}
#endif
`;

// A toon material with GLORBAX's shader add-ons. U = the boss's live uniforms (shared by all its materials).
function glxMaterial(opts, defs, U) {
    const mat = toonMaterial({ ...opts, cache: false });
    Object.assign(mat.defines, defs);
    const base = mat.onBeforeCompile;
    const key = 'glorbax:' + Object.keys(defs).sort().join(',');
    mat.onBeforeCompile = function (shader, renderer) {
        base.call(this, shader, renderer);
        Object.assign(shader.uniforms, U);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\n' + GLX_VERT)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GLX_BEGIN);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + GLX_FRAG)
            .replace('#include <color_fragment>', '#include <color_fragment>\n' + GLX_COLOR);
    };
    mat.customProgramCacheKey = () => key;
    return mat;
}

// Ink outline for the squishy body (the same as toon.js's outline, but it squishes along)
function glxOutline(U, color, thickness) {
    const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            { uColor: { value: new THREE.Color(color) }, uThick: { value: thickness } },
        ]),
        defines: { GLX_DEFORM: '' },
        vertexShader: /* glsl */`
            #include <common>
            #include <fog_pars_vertex>
            uniform float uThick;
            ${GLX_VERT}
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(glxDeform(position), 1.0);
                vec3 vn = normalize(normalMatrix * normal);
                float dist = clamp(-mvPosition.z, 1.5, 28.0);
                mvPosition.xyz += vn * uThick * dist;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: /* glsl */`
            #include <common>
            #include <fog_pars_fragment>
            uniform vec3 uColor;
            void main() {
                gl_FragColor = vec4(uColor, 1.0);
                #include <colorspace_fragment>
                #include <fog_fragment>
            }`,
        side: THREE.BackSide,
        fog: true,
    });
    Object.assign(mat.uniforms, U);
    return mat;
}

// ------------------------------------------------------------
// The head: a ball pushed into a squishy octopus mantle that leans back
// ------------------------------------------------------------
function headPoint(x, y, z, out) {
    const up = Math.max(0, y), low = Math.max(0, -y);
    const pinch = 1 - 0.12 * up * up;
    const flare = 1 + 0.14 * Math.sin(Math.min(1, low / 0.8) * Math.PI) * (1 - smoothstep(0, 0.7, z));
    const s = pinch * flare;
    return out.set(x * s * 4.2, y * (y > 0 ? 1.12 : 0.92) * 4.4, (z * s - 0.34 * up * up) * 4.0);
}

const _hd = new THREE.Vector3(), _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _ht1 = new THREE.Vector3(), _ht2 = new THREE.Vector3();
// The surface point and normal for a direction (normal measured from two tiny steps across the surface)
function headSurface(d, outP, outN) {
    _hd.copy(d).normalize();
    headPoint(_hd.x, _hd.y, _hd.z, outP);
    _ht1.crossVectors(_up, _hd);
    if (_ht1.lengthSq() < 1e-6) _ht1.set(1, 0, 0);
    _ht1.normalize();
    _ht2.crossVectors(_hd, _ht1);
    _h1.copy(_hd).addScaledVector(_ht1, 0.01).normalize();
    headPoint(_h1.x, _h1.y, _h1.z, _h1);
    _h2.copy(_hd).addScaledVector(_ht2, 0.01).normalize();
    headPoint(_h2.x, _h2.y, _h2.z, _h2);
    outN.crossVectors(_h1.sub(outP), _h2.sub(outP)).normalize();
    if (outN.dot(_hd) < 0) outN.negate();
}

function headGeometry() {
    const g = new THREE.SphereGeometry(1, 56, 40);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const d = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        d.fromBufferAttribute(pos, i);
        headSurface(d, p, n);
        pos.setXYZ(i, p.x, p.y, p.z);
        nor.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
}

function buildBody(U) {
    const b = new GeoBuilder();
    const parts = [];
    const add = (part, ...args) => { b.add(...args); parts.push(part); };
    const sph = (w = 20, h = 12) => new THREE.SphereGeometry(1, w, h);
    const P = new THREE.Vector3(), N = new THREE.Vector3(), D = new THREE.Vector3();
    // the big squishy head: a lighter face, a darker mantle cap
    add(0, headGeometry(), [COL.skin, (p, i, c) => {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (z > 2.3 && y < 0.4 && Math.abs(x) < 3.1) c.set(COL.belly);
        else if (y > 3.0 - z * 0.3 || z < -2.3) c.set(COL.back);
        else c.set(COL.skin);
    }], {});
    // a puffy socket the eye sits in
    add(0, new THREE.TorusGeometry(EYE_R + 0.16, 0.26, 12, 40), COL.skin, { p: [EYE_LOCAL.x, EYE_LOCAL.y, EYE_LOCAL.z - 0.5] });
    // the gold armored brow (part 1: it bends into an angry V)
    add(1, new THREE.TorusGeometry(EYE_R + 0.48, 0.3, 10, 28, 2.2), COL.gold,
        { p: [0, EYE_LOCAL.y, EYE_LOCAL.z - 0.02], r: [-0.4, 0, Math.PI / 2 - 1.1], s: [1, 1, 0.75] });
    // glowing bioluminescent spots on the mantle
    const spot = (dx, dy, dz, size) => {
        headSurface(D.set(dx, dy, dz), P, N);
        _q.setFromUnitVectors(_zAxis, N);
        _mx.compose(P, _q, _sc.set(size, size, size * 0.4));
        add(0, sph(14, 8), COL.spotRim, { matrix: _mx.clone() }, 0.9);
        _mx.compose(P.addScaledVector(N, size * 0.14), _q, _sc.set(size * 0.62, size * 0.62, size * 0.3));
        add(0, sph(12, 6), COL.spot, { matrix: _mx.clone() }, 1.6);
    };
    for (const sx of [-1, 1]) {
        spot(sx * 0.55, 0.62, -0.05, 0.42);
        spot(sx * 0.8, 0.3, -0.2, 0.32);
        spot(sx * 0.42, 0.82, -0.35, 0.3);
        spot(sx * 0.9, 0.0, -0.3, 0.24);
        spot(sx * 0.62, 0.45, -0.62, 0.34);
        spot(sx * 0.3, 0.5, -0.82, 0.26);
        spot(sx * 0.75, 0.5, 0.42, 0.22);
        spot(sx * 0.8, -0.05, 0.55, 0.17);
    }
    spot(0, 0.95, -0.3, 0.36);
    spot(0, 0.7, -0.7, 0.32);
    // a little crown of gold horns on top
    for (let k = -1; k <= 1; k++) {
        headSurface(D.set(k * 0.3, 0.95, 0.12), P, N);
        add(0, new THREE.ConeGeometry(0.34, 1.5 - Math.abs(k) * 0.35, 10), COL.gold, { p: [P.x, P.y + 0.45, P.z], r: [-0.45, 0, -k * 0.5] });
    }
    // floppy ear fins (part 2: they flap)
    for (const sx of [-1, 1]) {
        add(2, sph(22, 14), [COL.back, (p, i, c) => c.set(p.getZ(i) > -0.45 ? COL.skin : COL.back)],
            { p: [sx * 4.4, 2.2, -0.9], s: [0.3, 1.75, 1.35], r: [0.2, sx * 0.75, sx * -0.75] });
    }
    // lips and fangs
    add(0, new THREE.TorusGeometry(1.35, 0.2, 8, 24, Math.PI), COL.belly,
        { p: [MOUTH_LOCAL.x, MOUTH_LOCAL.y - 0.25, MOUTH_LOCAL.z + 0.05], s: [1.12, 0.5, 1], r: [-0.15, 0, 0] });
    for (const [x, s] of [[-0.9, 0.85], [-0.35, 1.15], [0.35, 1.15], [0.9, 0.85]]) {
        add(0, new THREE.ConeGeometry(0.17 * s, 0.7 * s, 8), COL.fang, { p: [x, MOUTH_LOCAL.y + 0.12, MOUTH_LOCAL.z + 0.12], r: [Math.PI + 0.12, 0, 0] });
    }
    // which part each vertex belongs to (for the squish shader)
    const counts = b.chunks.map((c) => c.g.attributes.position.count);
    const gp = new Float32Array(counts.reduce((a, c) => a + c, 0));
    let o = 0;
    counts.forEach((c, i) => { gp.fill(parts[i], o, o + c); o += c; });
    const geo = b.build();
    geo.setAttribute('gpart', new THREE.BufferAttribute(gp, 1));
    const mat = glxMaterial({ vertexColors: true, glow: true, rim: 0.65, rimColor: 0xd8c8ff }, { GLX_DEFORM: '', GLX_RAGE: '' }, U);
    const body = new THREE.Mesh(geo, mat);
    body.castShadow = true;
    const line = new THREE.Mesh(geo, glxOutline(U, COL.ink, 0.0022));
    line.raycast = () => {};
    body.add(line);
    return body;
}

function buildEye(U) {
    const g = new THREE.Group();
    const mat = glxMaterial({ color: 0xffffff, rim: 0.4, rimColor: 0xffffff }, { GLX_EYE: '' }, U);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 44, 30), mat);
    addOutline(eye, COL.ink, 0.002);
    g.add(eye);
    // shiny cartoon highlights (hidden when the eye shuts)
    const sb = new GeoBuilder();
    const onEye = (x, y) => _v.set(x, y, 1).normalize().multiplyScalar(EYE_R).toArray();
    sb.add(new THREE.SphereGeometry(0.22, 12, 8), 0xffffff, { p: onEye(-0.38, 0.36), s: [1, 1, 0.5] });
    sb.add(new THREE.SphereGeometry(0.1, 10, 6), 0xffffff, { p: onEye(-0.12, 0.5), s: [1, 1, 0.5] });
    const shine = new THREE.Mesh(sb.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    g.add(shine);
    // eyelids: half shells with a thick rim and a dark lash line, that swing shut
    const lidMat = glxMaterial({ vertexColors: true, rim: 0.5, rimColor: 0xd8c8ff, side: THREE.DoubleSide }, { GLX_RAGE: '' }, U);
    const lid = (upper) => {
        const lb = new GeoBuilder();
        const r = EYE_R + 0.1;
        lb.add(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, upper ? 0 : Math.PI / 2, Math.PI / 2), COL.skin, {});
        lb.add(new THREE.TorusGeometry(r + 0.02, 0.13, 8, 44), COL.lid, { r: [Math.PI / 2, 0, 0] });
        lb.add(new THREE.TorusGeometry(r - 0.04, 0.07, 6, 44), COL.ink, { p: [0, upper ? -0.07 : 0.07, 0], r: [Math.PI / 2, 0, 0] });
        return new THREE.Mesh(lb.build(), lidMat);
    };
    const upper = lid(true), lower = lid(false);
    g.add(upper, lower);
    return { group: g, eye, mat, upper, lower, lidMat, shine };
}

function buildMouth(U) {
    const g = new THREE.Group();
    const inside = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), toonMaterial({ color: COL.mouth }));
    inside.scale.set(1.45, 0.3, 0.45);
    g.add(inside);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), toonMaterial({ color: 0xff7aa8 }));
    tongue.scale.set(0.75, 0.22, 0.35);
    tongue.position.set(0, -0.15, 0.05);
    g.add(tongue);
    const jaw = new THREE.Group();
    const jb = new GeoBuilder();
    for (const x of [-0.7, 0, 0.7]) jb.add(new THREE.ConeGeometry(0.15, 0.6, 8), COL.fang, { p: [x, 0.1, 0.12] });
    jb.add(new THREE.SphereGeometry(1, 20, 10), COL.belly, { p: [0, -0.25, -0.1], s: [1.55, 0.35, 0.6] });
    const jawMat = glxMaterial({ vertexColors: true, glow: true, rim: 0.5, rimColor: 0xd8c8ff }, { GLX_RAGE: '' }, U);
    const jawMesh = new THREE.Mesh(jb.build(), jawMat);
    addOutline(jawMesh, COL.ink, 0.002);
    jaw.add(jawMesh);
    g.add(jaw);
    // a ball of green goo that bubbles up before a spit
    const goo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), toonMaterial({ color: 0x9dff5a, emissive: 0x3a8a1a, rim: 0.6, rimColor: 0xeaffc0, cache: false }));
    goo.position.set(0, -0.1, 0.2);
    goo.visible = false;
    g.add(goo);
    const glow = glowSprite(0x9dff5a, 2.5, 0);
    glow.position.z = 0.4;
    g.add(glow);
    return { group: g, inside, tongue, jaw, jawMat, glow, goo };
}

// ------------------------------------------------------------
// Tentacles: one smooth, tapered tube per arm, all in one mesh. The vertices are
// moved along each arm's Bezier curve every frame (about 500 per arm).
// ------------------------------------------------------------
// Thickness along an arm (u: 0 at the body, 1 at the tip). Matches the hit spheres, then tapers to a point.
function tentRadius(u) {
    return lerp(1.02, 0.27, u) * Math.pow(clamp((1 - u) / 0.24, 0, 1), 0.75);
}

function buildTentacleGeometry() {
    const n = N_TENT * T_VERTS;
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    const nor = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    nor.setUsage(THREE.DynamicDrawUsage);
    // tuv = (sucker count along the arm, around the arm with 0.5 = underside, 0..1 base to tip)
    const tuv = new Float32Array(n * 3);
    const du = 1 / (T_RINGS - 1);
    const w = [];
    let acc = 0;
    for (let i = 0; i < T_RINGS; i++) {
        if (i > 0) acc += (du * T_REST_LEN) / (0.45 * Math.max(0.16, tentRadius((i - 0.5) * du)));
        w.push(acc);
    }
    const idx = [];
    for (let k = 0; k < N_TENT; k++) {
        const o = k * T_VERTS;
        for (let i = 0; i < T_RINGS; i++) {
            for (let j = 0; j < T_COLS; j++) {
                const v = (o + i * T_COLS + j) * 3;
                tuv[v] = w[i] + k * 0.31;
                tuv[v + 1] = j / T_SIDES;
                tuv[v + 2] = i * du;
            }
        }
        for (let i = 0; i < T_RINGS - 1; i++) {
            for (let j = 0; j < T_SIDES; j++) {
                const a = o + i * T_COLS + j, b = a + T_COLS;
                idx.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
    }
    geo.setIndex(idx);
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', nor);
    geo.setAttribute('tuv', new THREE.BufferAttribute(tuv, 3));
    return geo;
}

// ============================================================
export class Boss {
    constructor(game) {
        this.game = game;
        this.name = 'GLORBAX';
        this.title = 'TENTACLED TERROR OF THE MOTHERSHIP';
        this.center = new THREE.Vector3(BOSS.x, 0, BOSS.z);
        this.pos = new THREE.Vector3(BOSS.x, 5, BOSS.z + 3); // the eye (aim here!)
        this.vel = new THREE.Vector3();
        this.aimAt = new THREE.Vector3();
        this.gone = false;
        this.dead = false;
        this.active = false;
        this.visible = false;
        this.t = 0;
        this.state = 'hidden';
        this.stateT = 0;
        this.phase = 1;
        this.rise = 0;
        this.eyeOpen = 0;
        this.mouth = 0;
        this.yaw = 0;
        this.faceYaw = 0;
        this.hurtT = 0;
        this.blinkT = 3;
        this.armorToasts = 0;
        this.armorToastT = 0;
        this.lookTarget = new THREE.Vector3();
        this.lookYaw = 0;
        this.lookPitch = 0;
        this.tentOut = new Array(N_TENT).fill(0);
        // looks only (no gameplay): squash spring, hit wobble, the face's expression
        this.sq = 0;
        this.sqV = 0;
        this.jig = 0;
        this.ouchT = 0;
        this.rageK = 0;
        this.lean = 0;
        this.lunge = 0;
        this.steamT = 0;
        this.ex = { tilt: 0, lift: 0, su: 0.14, sl: 0.05, pr: 0.2, pw: 1, glow: 0, dizzy: 0, puff: 0 };
        this.build();
        this.resetStats();
    }

    resetStats() {
        const diff = this.game.diff;
        this.maxHp = Math.round(110 * diff.alienHp);
        this.hp = this.maxHp;
        this.phase = 1;
    }

    // --------------------------------------------------------
    build() {
        const g = this.game;
        const root = new THREE.Group();
        root.visible = false;
        const body = new THREE.Group();
        root.add(body);
        // live shader values shared by all of GLORBAX's materials
        const c3 = (hex) => ({ value: new THREE.Color(hex) });
        const U = this.U = {
            uBreath: { value: 0 }, uJig: { value: 0 }, uJigT: { value: 9 }, uPuff: { value: 0 }, uFlap: { value: 0 },
            uBrowTilt: { value: 0 }, uBrowLift: { value: 0 },
            uRage: { value: 0 }, uRageSpot: c3(0xffa040), uGlowStrength: { value: 1.4 },
            uTTop: c3(0x3a2a96), uTSkin: c3(COL.skin), uTBelly: c3(0xb7a2ff), uTSuck: c3(0xffd2e6), uTSuckRim: c3(0xe06aa8),
            uEyeA: { value: new THREE.Vector4(0.36, 0.2, 1, 0) },
            uSclera: c3(COL.eye), uIrisIn: c3(0xffe27a), uIrisOut: c3(COL.iris), uIrisRing: c3(0xb4640e), uPupilCol: c3(COL.pupil),
            uEyeGlow: c3(0x000000),
        };
        body.add(buildBody(U));
        this.bodyMesh = body.children[0];
        const eye = buildEye(U);
        eye.group.position.copy(EYE_LOCAL);
        body.add(eye.group);
        const mouth = buildMouth(U);
        mouth.group.position.copy(MOUTH_LOCAL);
        body.add(mouth.group);
        g.scene.add(root);
        this.root = root;
        this.body = body;
        this.eye = eye;
        this.mouthParts = mouth;
        this._irisIn = new THREE.Color(0xffe27a);
        this._irisOut = new THREE.Color(COL.iris);

        // tentacles: one smooth tube per arm, all in one mesh (+ outline), placed in world space
        this.tentGeo = buildTentacleGeometry();
        this.tentMat = glxMaterial({ color: 0xffffff, rim: 0.55, rimColor: 0xd8c8ff }, { GLX_TENT: '', GLX_RAGE: '' }, U);
        this.tentMesh = new THREE.Mesh(this.tentGeo, this.tentMat);
        this.tentMesh.castShadow = true;
        this.tentMesh.frustumCulled = false;
        this.tentLine = addOutline(this.tentMesh, COL.ink, 0.0024);
        this.tentLine.frustumCulled = false;
        g.scene.add(this.tentMesh);
        // scratch space for one arm's rings: center, tangent, underside, side, radius
        const ring = () => Array.from({ length: T_RINGS }, () => new THREE.Vector3());
        this._rc = ring();
        this._rt = ring();
        this._rd = ring();
        this._rs = ring();
        this._rr = new Float32Array(T_RINGS);

        this.tents = [];
        for (let k = 0; k < N_TENT; k++) {
            const angle = (k / N_TENT) * Math.PI * 2 + 0.3;
            this.tents.push({
                k, angle, mode: 'idle', t: 0, windup: 1,
                P1: new THREE.Vector3(), P2: new THREE.Vector3(), T: new THREE.Vector3(),
                target: new THREE.Vector3(), from: { P1: new THREE.Vector3(), P2: new THREE.Vector3(), T: new THREE.Vector3() },
                spheres: Array.from({ length: N_SEG }, () => ({ c: new THREE.Vector3(), r: 0.5 })),
                flail: Math.random() * 6,
                curl: 1,
            });
        }

        // warning circles on the floor (where a tentacle is about to slam)
        this.warnings = [];
        for (let i = 0; i < 3; i++) {
            const grp = new THREE.Group();
            const mat = new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
            const ring = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.9, 40), mat);
            ring.rotation.x = -Math.PI / 2;
            const fillMat = mat.clone();
            const fill = new THREE.Mesh(new THREE.CircleGeometry(2.45, 40), fillMat);
            fill.rotation.x = -Math.PI / 2;
            grp.add(ring, fill);
            grp.visible = false;
            g.scene.add(grp);
            this.warnings.push({ grp, mat, fillMat, fill, on: false, t: 0, life: 1 });
        }
        // shockwave rings rolling across the floor
        this.waves = [];
        for (let i = 0; i < 3; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xff9a5a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
            const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 64), mat);
            m.rotation.x = Math.PI / 2;
            m.visible = false;
            g.scene.add(m);
            this.waves.push({ m, mat, on: false, r: 0, x: 0, z: 0, hit: false });
        }
        // the eye laser (an aiming line, then the real beam)
        const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
        beamGeo.translate(0, 0.5, 0);
        this.laser = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff3a5a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.laserCore = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.laser.add(this.laserCore);
        this.laser.visible = false;
        this.laser.renderOrder = 12;
        g.scene.add(this.laser);
        this.laserGlow = glowSprite(0xff4a6a, 3, 0);
        g.scene.add(this.laserGlow);
        this.laserHit = new THREE.Vector3();
        this.laserDir = new THREE.Vector3(0, 0, 1);
        this.eyeGlow = glowSprite(0xff3a3a, 5, 0);
        this.eye.group.add(this.eyeGlow);
        this.eyeGlow.position.z = EYE_R - 0.15;
        this.animate(0);
    }

    // --------------------------------------------------------
    // The hit-test interface used by bolts, grenades and aim assist
    // --------------------------------------------------------
    get eyeIsOpen() {
        return this.eyeOpen > 0.6 && this.lidClose < 0.4;
    }

    targetable() {
        return this.active && !this.dead && this.visible && this.rise > 0.9;
    }

    aimPoint(out) {
        return out.copy(this.pos);
    }

    showBar() {
        return (this.active || this.state === 'dying') && this.visible;
    }

    info() {
        return { name: this.name, hp: this.hp, maxHp: this.maxHp, rage: this.phase >= 3 };
    }

    hitSegment(a, b, pad) {
        if (!this.visible || this.rise < 0.5 || this.state === 'dead') return -1;
        let best = -1;
        const take = (t) => { if (t >= 0 && (best < 0 || t < best)) best = t; };
        take(segSphere(a, b, this.pos, EYE_R + pad));
        this.body.getWorldPosition(_v3);
        take(segSphere(a, b, _v3, 3.9 + pad * 0.5));
        for (const tn of this.tents) {
            for (let s = 2; s < N_SEG; s += 2) {
                const sp = tn.spheres[s];
                take(segSphere(a, b, sp.c, sp.r * 0.8));
            }
        }
        return best;
    }

    isHeadshot() {
        return false;
    }

    // Bolts bounce off everything but the open eye
    isArmored(p) {
        if (!this.active) return true;
        return !this.eyeIsOpen || p.distanceTo(this.pos) > EYE_R + 0.45;
    }

    armorHit(p) {
        const g = this.game;
        g.effects.sparks(p.x, p.y, p.z, 0xfff1c0, 5, 4, 0.12);
        g.audio.play('armorClank', p);
        if (this.active && this.armorToastT <= 0 && this.armorToasts < 4) {
            this.armorToastT = 9;
            this.armorToasts++;
            g.hud.toast(this.eyeIsOpen ? 'Its skin is too tough! Shoot the big EYE!' : 'Wait for the eye to open!', 2.6);
        }
    }

    stickOffset(point, out) {
        out.copy(point).sub(this.pos);
        if (out.length() < EYE_R + 0.6) out.setLength(EYE_R + 0.05);
        return out;
    }

    alertTo() {}

    hurt(amount, point) {
        if (!this.active || this.dead) return false;
        const g = this.game;
        this.hp -= amount;
        this.hurtT = 0.16;
        this.flinch = 1;
        // looks: an "OUCH!" face and a jelly wobble
        this.ouchT = 0.45;
        this.jig = 1;
        this.U.uJigT.value = 0;
        this.sqV += 3.5;
        g.audio.play('bossHurt', this.pos);
        g.effects.sparks(point.x, point.y, point.z, 0xffe27a, 8, 5, 0.16);
        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
            return true;
        }
        if (this.phase === 1 && this.hp <= this.maxHp * 0.66) this.enterPhase(2);
        else if (this.phase === 2 && this.hp <= this.maxHp * 0.33) this.enterPhase(3);
        return false;
    }

    // Grenade explosions: big damage if it's right on the eye
    blast(pos, radius, dmg) {
        if (!this.active || this.dead) return;
        const d = pos.distanceTo(this.pos);
        if (d < radius * 0.75 + EYE_R && this.eyeIsOpen) {
            const k = clamp(1 - (d - EYE_R) / (radius * 0.75), 0.35, 1);
            this.hurt(Math.max(1, Math.round(dmg * 1.2 * k)), _v.copy(this.pos));
            this.game.hud.toast('BULLSEYE! 💥', 1.4);
        }
    }

    dmg(n) {
        return n * this.game.diff.damage;
    }

    // --------------------------------------------------------
    // Flow
    // --------------------------------------------------------
    // The intro cutscene drives rise / eyeOpen / mouth / tentOut itself
    prepareIntro() {
        this.visible = true;
        this.root.visible = true;
        this.rise = 0;
        this.eyeOpen = 0;
        this.mouth = 0;
        this.tentOut.fill(0);
        this.state = 'intro';
        this.lookTarget.set(this.center.x, 2, this.center.z + 20);
    }

    startFight() {
        this.visible = true;
        this.root.visible = true;
        this.active = true;
        this.rise = 1;
        this.eyeOpen = 1;
        this.tentOut.fill(1);
        this.state = 'idle';
        this.stateT = 0;
        this.cooldown = 1.6;
        this.last = '';
    }

    onPlayerRespawn() {
        if (!this.active || this.dead) return;
        // keep the damage you did (kid-friendly!), just take a breather
        this.cancelAttacks();
        this.state = 'idle';
        this.stateT = 0;
        this.cooldown = 3;
    }

    setDefeated() {
        this.dead = true;
        this.active = false;
        this.visible = false;
        this.root.visible = false;
        this.tentMesh.visible = false;
        this.state = 'dead';
        this.hp = 0;
    }

    cancelAttacks() {
        for (const tn of this.tents) if (tn.mode !== 'idle') this.setTentMode(tn, 'retract');
        for (const w of this.warnings) { w.on = false; w.grp.visible = false; }
        for (const w of this.waves) { w.on = false; w.m.visible = false; }
        this.laser.visible = false;
        this.laserGlow.material.opacity = 0;
        this.laserOn = false;
        this.mouth = 0;
        this.game.audio.loop?.('laser', false);
    }

    enterPhase(p) {
        const g = this.game;
        this.phase = p;
        this.cancelAttacks();
        this.state = 'roar';
        this.stateT = 0;
        this.summoned = false;
        g.hud.announce(p === 2 ? 'GLORBAX IS GETTING MAD!' : 'GLORBAX IS FURIOUS!', p === 2 ? 'PHASE 2' : 'FINAL PHASE');
    }

    die() {
        const g = this.game;
        this.dead = true;
        this.active = false;
        this.cancelAttacks();
        this.state = 'dying';
        this.stateT = 0;
        this.poofT = 0;
        g.audio.play('bossDie', this.pos);
        g.slowMo?.(1.4, 0.35);
        for (const tn of this.tents) this.setTentMode(tn, 'flail');
    }

    // --------------------------------------------------------
    // AI
    // --------------------------------------------------------
    update(dt) {
        if (!this.visible) return;
        this.t += dt;
        this.stateT += dt;
        this.armorToastT -= dt;
        const g = this.game;
        const P = g.player;
        if (this.state !== 'intro') {
            // watch the player, and turn to face them (slowly — circle around it to dodge!)
            this.lookTarget.copy(P.eyePos);
            this.faceYaw = Math.atan2(P.pos.x - this.center.x, P.pos.z - this.center.z);
        }
        if (this.state === 'dying') {
            this.updateDying(dt);
        } else if (this.active) {
            this.think(dt);
        }
        this.updateTentacles(dt);
        this.updateHazards(dt);
        this.animate(dt);
    }

    think(dt) {
        const g = this.game;
        const fr = g.diff.fireRate;
        const rage = this.phase >= 3 ? 1.25 : 1;
        switch (this.state) {
            case 'idle': {
                this.cooldown -= dt * rage * Math.min(1.2, 0.6 + fr * 0.5);
                if (this.cooldown <= 0 && !this.game.player.dead) {
                    let pick;
                    const r = Math.random();
                    if (this.phase === 1) pick = r < 0.6 ? 'slam' : 'spit';
                    else pick = r < 0.4 ? 'slam' : r < 0.68 ? 'spit' : 'laser';
                    if (pick === 'laser' && this.last === 'laser') pick = 'slam';
                    this.last = pick;
                    this.state = pick;
                    this.stateT = 0;
                    if (pick === 'slam') {
                        this.startSlam(0);
                        if (this.phase >= 3) this.startSlam(0.55);
                    }
                    if (pick === 'spit') g.audio.play('bossGurgle', this.pos);
                    if (pick === 'laser') { g.audio.play('laserCharge', this.pos); this.laserBegin(); }
                }
                break;
            }
            case 'slam': {
                if (this.stateT > 1.6 && this.tents.every((tn) => tn.mode === 'idle' || tn.mode === 'stuck' || tn.mode === 'retract')) this.toIdle();
                break;
            }
            case 'spit': {
                const charge = 0.75;
                this.mouth = this.stateT < charge ? easeOut(this.stateT / charge) : Math.max(0, 1 - (this.stateT - charge) / 0.5);
                if (this.stateT >= charge && !this.spat) {
                    this.spat = true;
                    this.spit();
                }
                if (this.stateT > charge + 0.6) { this.spat = false; this.toIdle(); }
                break;
            }
            case 'laser': {
                this.updateLaser(dt);
                break;
            }
            case 'roar': {
                const P = g.player;
                this.mouth = this.stateT < 0.3 ? this.stateT / 0.3 : this.stateT < 1.8 ? 1 : Math.max(0, 1 - (this.stateT - 1.8) / 0.4);
                if (this.stateT > 0.25 && !this.roared) {
                    this.roared = true;
                    g.audio.play('bossRoar', this.pos);
                    P.shake(0.6);
                }
                if (this.stateT > 1.1 && !this.summoned) {
                    this.summoned = true;
                    g.aliens.startWave(4, this.phase - 1);
                    g.hud.toast('GLORBAX called for help! Alien helpers incoming!', 3);
                }
                if (this.stateT > 2.3) { this.roared = false; this.toIdle(1.2); }
                break;
            }
        }
    }

    toIdle(extra = 0) {
        this.state = 'idle';
        this.stateT = 0;
        const base = this.phase === 1 ? rand(1.6, 2.5) : this.phase === 2 ? rand(1.2, 2.1) : rand(0.9, 1.6);
        this.cooldown = base + extra;
    }

    // ----- tentacle slam -----
    slamWindup() {
        const d = this.game.diffKey;
        return (d === 'easy' ? 1.35 : d === 'hard' ? 0.75 : 1.0) * (this.phase >= 3 ? 0.85 : 1);
    }

    startSlam(delay) {
        const P = this.game.player;
        const C = this.center;
        // aim where you are (a little ahead if you're running)
        _v.set(P.pos.x + P.vel.x * 0.25, 0, P.pos.z + P.vel.z * 0.25);
        let dx = _v.x - C.x, dz = _v.z - C.z;
        const d = Math.hypot(dx, dz) || 1;
        const r = clamp(d, RING_IN, RING_OUT);
        dx /= d; dz /= d;
        const tx = C.x + dx * r, tz = C.z + dz * r;
        const ang = Math.atan2(dz, dx);
        let best = null, bestD = 99;
        for (const tn of this.tents) {
            if (tn.mode !== 'idle') continue;
            const da = Math.abs(wrapAngle(tn.angle - ang));
            if (da < bestD) { bestD = da; best = tn; }
        }
        if (!best) return;
        best.target.set(tx, 0, tz);
        best.windup = this.slamWindup();
        best.delay = delay;
        this.setTentMode(best, 'raise');
        best.t = -delay;
        this.showWarning(best.target, best.windup + delay + 0.16);
        setTimeout(() => this.active && this.game.audio.play('bossSlamWarn', best.target), delay * 1000);
    }

    showWarning(p, life) {
        const w = this.warnings.find((x) => !x.on) || this.warnings[0];
        w.on = true;
        w.t = 0;
        w.life = life;
        w.grp.position.set(p.x, 0.05, p.z);
        w.grp.visible = true;
    }

    impact(tn) {
        const g = this.game;
        const P = g.player;
        const Q = tn.target;
        g.effects.dust(Q.x, 0.1, Q.z, 14, 2.2, 0xc8b0ff, 1.1);
        g.effects.sparks(Q.x, 0.4, Q.z, 0xffb07a, 16, 8, 0.2);
        g.effects.ring(Q.x, 0.12, Q.z, 0xff9a6a, 4.6, 0.45);
        g.audio.play('bossSlam', Q);
        this.sqV -= 2.5;
        const d = Math.hypot(P.pos.x - Q.x, P.pos.z - Q.z);
        if (d < 2.9 && P.pos.y < 1.4) P.hurt(this.dmg(2), _v.set(P.pos.x - Q.x, 0, P.pos.z - Q.z).normalize());
        P.shake(clamp(0.55 - d * 0.025, 0.08, 0.55));
        const w = this.waves.find((x) => !x.on) || this.waves[0];
        w.on = true;
        w.r = 0.6;
        w.x = Q.x;
        w.z = Q.z;
        w.hit = d < 2.9;
        w.m.visible = true;
    }

    // ----- goo spit -----
    spit() {
        const g = this.game;
        const P = g.player;
        const diff = g.diff;
        const n = this.phase === 1 ? 3 : this.phase === 2 ? 4 : 5;
        const origin = this.mouthParts.group.getWorldPosition(_v2);
        origin.addScaledVector(_v3.set(P.pos.x - origin.x, 0, P.pos.z - origin.z).normalize(), 1.2);
        const speed = 9 + diff.boltSpeed * 0.3;
        const tx = P.pos.x + P.vel.x * 0.4 * diff.lead, tz = P.pos.z + P.vel.z * 0.4 * diff.lead;
        const base = Math.atan2(tx - origin.x, tz - origin.z);
        const dist = Math.hypot(tx - origin.x, tz - origin.z);
        const pitch = Math.atan2(P.pos.y + 1.0 - origin.y, dist);
        for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.17;
            _v.set(Math.sin(a) * Math.cos(pitch), Math.sin(pitch), Math.cos(a) * Math.cos(pitch));
            g.combat.alienBolt(origin, _v, speed, diff.damage, 0x9dff5a, 0.85);
        }
        g.audio.play('bossSpit', origin);
        g.effects.sparks(origin.x, origin.y, origin.z, 0x9dff5a, 14, 6, 0.2);
        this.sqV += 3;
        this.lunge = 1;
    }

    // ----- eye laser -----
    laserBegin() {
        const P = this.game.player;
        this.laserOn = false;
        this.laserTick = 0;
        this.laserYaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        this.laserPitch = -0.3;
    }

    updateLaser(dt) {
        const g = this.game;
        const P = g.player;
        const charge = 1.3, fire = 1.7;
        const t = this.stateT;
        // aim at your legs, but turn slowly (keep running sideways, or hide!)
        const wantYaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        const flat = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        const wantPitch = Math.atan2(P.pos.y + 0.7 - this.pos.y, flat);
        const d = this.game.diffKey;
        const turn = (this.phase >= 3 ? 0.4 : 0.32) * (d === 'easy' ? 0.75 : d === 'hard' ? 1.3 : 1) * (t < charge ? 1.6 : 1);
        this.laserYaw += clamp(wrapAngle(wantYaw - this.laserYaw), -turn * dt, turn * dt);
        this.laserPitch = damp(this.laserPitch, wantPitch, 5, dt);
        const cp = Math.cos(this.laserPitch);
        this.laserDir.set(Math.sin(this.laserYaw) * cp, Math.sin(this.laserPitch), Math.cos(this.laserYaw) * cp);
        this.laserCast();
        const firing = t >= charge && t < charge + fire;
        if (firing && !this.laserOn) {
            this.laserOn = true;
            g.audio.play('laserFire', this.pos);
        }
        this.eyeGlow.material.opacity = t < charge ? (t / charge) * 0.9 : firing ? 0.95 : Math.max(0, 0.95 - (t - charge - fire) * 3);
        this.eyeGlow.scale.setScalar(4 + Math.sin(this.t * 30) * 0.4);
        const L = this.laser;
        L.visible = t < charge + fire + 0.25;
        const len = this.pos.distanceTo(this.laserHit);
        L.position.copy(this.pos);
        L.quaternion.setFromUnitVectors(_up, this.laserDir);
        const w = t < charge ? 0.05 + (t / charge) * 0.05 : firing ? 0.32 + Math.sin(this.t * 40) * 0.05 : 0.32 * Math.max(0, 1 - (t - charge - fire) * 4);
        L.scale.set(w, len, w);
        L.material.opacity = t < charge ? 0.55 : 0.85;
        this.laserCore.scale.set(0.4, 1, 0.4);
        this.laserCore.visible = firing;
        this.laserGlow.position.copy(this.laserHit);
        this.laserGlow.material.opacity = firing ? 0.9 : t < charge ? 0.3 : 0;
        if (firing) {
            this.laserTick -= dt;
            if (Math.random() < dt * 40) g.effects.sparks(this.laserHit.x, this.laserHit.y + 0.1, this.laserHit.z, 0xff7a5a, 2, 5, 0.14);
            if (Math.random() < dt * 8) g.audio.play('laserBuzz', this.laserHit);
            // does the beam touch you?
            _v.set(P.pos.x, P.pos.y + 0.25, P.pos.z);
            _v2.set(P.pos.x, P.pos.y + 1.6, P.pos.z);
            if (!P.dead && this.laserTick <= 0 && segSegDist(this.pos, this.laserHit, _v, _v2) < 0.6) {
                this.laserTick = 0.6;
                P.hurt(this.dmg(1), _v3.copy(this.laserDir));
            }
        }
        if (t > charge + fire + 0.35) {
            this.laserOn = false;
            this.laser.visible = false;
            this.laserGlow.material.opacity = 0;
            this.eyeGlow.material.opacity = 0;
            this.toIdle();
        }
    }

    // March the beam until it hits a wall, the floor or a pillar
    laserCast() {
        const W = this.game.world;
        const o = this.pos, d = this.laserDir;
        let t = 1.5;
        for (; t < 70; t += 0.35) {
            const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
            if (y < 0.02 || W.isSolid(x, y, z) || W.colliders.pointHit(x, y, z, 0)) break;
        }
        this.laserHit.copy(o).addScaledVector(d, t);
    }

    // ----- dying -----
    updateDying(dt) {
        const g = this.game;
        const t = this.stateT;
        this.poofT -= dt;
        this.mouth = 0.6 + Math.sin(t * 9) * 0.3;
        if (this.poofT <= 0 && t < 3.4) {
            this.poofT = 0.16;
            this.body.getWorldPosition(_v);
            _v.x += rand(-4, 4);
            _v.y += rand(-2, 4);
            _v.z += rand(-4, 4);
            g.effects.poof(_v.x, _v.y, _v.z, rand(1.4, 2.4));
            if (Math.random() < 0.4) g.audio.play('poof', _v);
        }
        if (t > 2.0) this.rise = Math.max(0, 1 - (t - 2.0) / 1.5);
        if (t > 3.5 && !this.bigPoof) {
            this.bigPoof = true;
            const c = this.center;
            for (let i = 0; i < 5; i++) g.effects.poof(c.x + rand(-3, 3), 1 + rand(0, 4), c.z + rand(-3, 3), 4);
            g.effects.sparks(c.x, 4, c.z, 0xffd166, 40, 12, 0.25);
            g.effects.glowFlash(c.x, 4, c.z, 0xffffff, 16, 0.5);
            g.audio.play('bigPoof', c);
            g.player.shake(0.5);
        }
        if (t > 4.0 && this.state === 'dying') {
            this.state = 'dead';
            this.visible = false;
            this.root.visible = false;
            g.level.onBossDefeated();
        }
    }

    // --------------------------------------------------------
    // Tentacles
    // --------------------------------------------------------
    setTentMode(tn, mode) {
        tn.from.P1.copy(tn.P1);
        tn.from.P2.copy(tn.P2);
        tn.from.T.copy(tn.T);
        tn.mode = mode;
        tn.t = 0;
    }

    poseIdle(tn, out) {
        const C = this.center;
        const t = this.t;
        const k = tn.k;
        const sway = Math.sin(t * 0.55 + k * 1.7) * 0.22;
        const a = tn.angle + sway;
        const ca = Math.cos(a), sa = Math.sin(a);
        const reach = 12.4 + Math.sin(t * 0.7 + k) * 1.3;
        const out1 = this.tentOut[k];
        const base = this.baseOf(tn, _v3);
        out.T.set(C.x + ca * reach, 0.5 + Math.max(0, Math.sin(t * 1.3 + k * 2.1)) * 0.7, C.z + sa * reach);
        out.P1.set(base.x + ca * 1.4, base.y + 2.8, base.z + sa * 1.4);
        out.P2.set(C.x + Math.cos(a * 0.98) * 8.3, 2.1 + Math.sin(t * 1.1 + k) * 0.35, C.z + Math.sin(a * 0.98) * 8.3);
        if (out1 < 1) {
            // still coming out of the pit (intro)
            const e = easeOut(out1);
            out.T.lerpVectors(_v.set(base.x, base.y - 3, base.z), out.T, e);
            out.P2.lerpVectors(_v.set(base.x, base.y - 2, base.z), out.P2, e);
            out.P1.lerpVectors(_v.set(base.x, base.y - 1, base.z), out.P1, e);
        }
        return out;
    }

    poseRaise(tn, out, lift = 1) {
        const C = this.center, Q = tn.target;
        const dx = Q.x - C.x, dz = Q.z - C.z;
        const r = Math.hypot(dx, dz) || 1;
        const ux = dx / r, uz = dz / r;
        const base = this.baseOf(tn, _v3);
        const wob = Math.sin(this.t * 14) * 0.25 * lift;
        out.T.set(Q.x - ux * 1.6, 9.5 * lift + wob, Q.z - uz * 1.6);
        out.P1.set(base.x + ux * 1.0, base.y + 6.5, base.z + uz * 1.0);
        out.P2.set(C.x + ux * r * 0.5, 11.5, C.z + uz * r * 0.5);
        return out;
    }

    poseSlam(tn, out) {
        const C = this.center, Q = tn.target;
        const dx = Q.x - C.x, dz = Q.z - C.z;
        const r = Math.hypot(dx, dz) || 1;
        const ux = dx / r, uz = dz / r;
        const base = this.baseOf(tn, _v3);
        const wig = tn.mode === 'stuck' ? Math.sin(this.t * 9 + tn.k) * 0.25 : 0;
        out.T.set(Q.x, 0.5, Q.z);
        out.P1.set(base.x + ux * 1.4, base.y + 5.2, base.z + uz * 1.4);
        out.P2.set(C.x + ux * r * 0.58 - uz * wig, 5.2 + wig, C.z + uz * r * 0.58 + ux * wig);
        return out;
    }

    baseOf(tn, out) {
        const by = this.root.position.y - 1.9;
        return out.set(this.center.x + Math.cos(tn.angle) * 2.5, by, this.center.z + Math.sin(tn.angle) * 2.5);
    }

    updateTentacles(dt) {
        const pose = this._pose || (this._pose = { P1: new THREE.Vector3(), P2: new THREE.Vector3(), T: new THREE.Vector3() });
        const pose2 = this._pose2 || (this._pose2 = { P1: new THREE.Vector3(), P2: new THREE.Vector3(), T: new THREE.Vector3() });
        for (const tn of this.tents) {
            tn.t += dt;
            switch (tn.mode) {
                case 'idle': {
                    this.poseIdle(tn, pose);
                    const r = 6;
                    tn.P1.x = damp(tn.P1.x, pose.P1.x, r, dt); tn.P1.y = damp(tn.P1.y, pose.P1.y, r, dt); tn.P1.z = damp(tn.P1.z, pose.P1.z, r, dt);
                    tn.P2.x = damp(tn.P2.x, pose.P2.x, r, dt); tn.P2.y = damp(tn.P2.y, pose.P2.y, r, dt); tn.P2.z = damp(tn.P2.z, pose.P2.z, r, dt);
                    tn.T.x = damp(tn.T.x, pose.T.x, r, dt); tn.T.y = damp(tn.T.y, pose.T.y, r, dt); tn.T.z = damp(tn.T.z, pose.T.z, r, dt);
                    if (this.state === 'intro' || this.tentOut[tn.k] < 1) { tn.P1.copy(pose.P1); tn.P2.copy(pose.P2); tn.T.copy(pose.T); }
                    break;
                }
                case 'raise': {
                    if (tn.t < 0) { this.poseIdle(tn, pose); tn.P1.copy(pose.P1); tn.P2.copy(pose.P2); tn.T.copy(pose.T); tn.from.P1.copy(pose.P1); tn.from.P2.copy(pose.P2); tn.from.T.copy(pose.T); break; }
                    const k = easeOut(clamp(tn.t / tn.windup, 0, 1));
                    this.poseRaise(tn, pose, 1);
                    tn.P1.lerpVectors(tn.from.P1, pose.P1, k);
                    tn.P2.lerpVectors(tn.from.P2, pose.P2, k);
                    tn.T.lerpVectors(tn.from.T, pose.T, k);
                    if (tn.t >= tn.windup) this.setTentMode(tn, 'slam');
                    break;
                }
                case 'slam': {
                    const k = easeIn(clamp(tn.t / 0.16, 0, 1));
                    this.poseSlam(tn, pose);
                    tn.P1.lerpVectors(tn.from.P1, pose.P1, k);
                    tn.P2.lerpVectors(tn.from.P2, pose.P2, k);
                    tn.T.lerpVectors(tn.from.T, pose.T, k);
                    if (tn.t >= 0.16) {
                        this.impact(tn);
                        this.setTentMode(tn, 'stuck');
                    }
                    break;
                }
                case 'stuck': {
                    this.poseSlam(tn, pose);
                    tn.P1.copy(pose.P1); tn.P2.copy(pose.P2); tn.T.copy(pose.T);
                    if (tn.t > 1.25) this.setTentMode(tn, 'retract');
                    break;
                }
                case 'retract': {
                    const k = easeInOut(clamp(tn.t / 0.7, 0, 1));
                    this.poseIdle(tn, pose);
                    tn.P1.lerpVectors(tn.from.P1, pose.P1, k);
                    tn.P2.lerpVectors(tn.from.P2, pose.P2, k);
                    tn.T.lerpVectors(tn.from.T, pose.T, k);
                    if (tn.t >= 0.7) tn.mode = 'idle';
                    break;
                }
                case 'flail': {
                    // dying: wave around wildly, then droop into the pit
                    this.poseIdle(tn, pose);
                    const f = this.t * 7 + tn.flail;
                    pose.T.y += 3 + Math.sin(f) * 3;
                    pose.T.x += Math.cos(f * 0.7) * 2;
                    pose.T.z += Math.sin(f * 0.9) * 2;
                    pose2.T.copy(pose.T);
                    tn.P1.lerp(pose.P1, 0.2);
                    tn.P2.lerp(pose.P2, 0.2);
                    tn.T.lerp(pose2.T, 0.2);
                    break;
                }
            }
            // looks only: the tip curls up when resting, coils back to wind up a slam and snaps straight to hit
            const m = tn.mode;
            const curl = m === 'idle' || m === 'retract' ? 0.85 + Math.sin(this.t * 0.9 + tn.k * 1.9) * 0.25
                : m === 'raise' ? 1.0
                : m === 'flail' ? Math.sin(this.t * 6 + tn.flail) * 1.4
                : 0;
            tn.curl = damp(tn.curl, curl, m === 'slam' ? 30 : 5, dt);
        }
    }

    writeTentacles() {
        const t = this.t;
        // the invisible hit spheres that block shots (gameplay: same as ever)
        for (const tn of this.tents) {
            const B = this.baseOf(tn, _base);
            for (let s = 0; s < N_SEG; s++) {
                const u = (s + 0.5) / N_SEG;
                const sp = tn.spheres[s];
                bez(B, tn.P1, tn.P2, tn.T, u, sp.c);
                sp.r = lerp(1.0, 0.26, u) * (1 + Math.sin(t * 3 + s * 0.7 + tn.k) * 0.06) * 1.05;
            }
        }
        if (!this.root.visible) return;
        // the skin: a tube around each arm's curve
        const P = this.tentGeo.attributes.position.array, N = this.tentGeo.attributes.normal.array;
        const RC = this._rc, RT = this._rt, RD = this._rd, RS = this._rs, RR = this._rr;
        const last = T_RINGS - 1;
        for (const tn of this.tents) {
            const B = this.baseOf(tn, _base);
            for (let i = 0; i < T_RINGS; i++) {
                const u = i / last;
                bez(B, tn.P1, tn.P2, tn.T, u, RC[i]);
                bezD(B, tn.P1, tn.P2, tn.T, u, RT[i]);
                if (RT[i].lengthSq() < 1e-8) RT[i].copy(i ? RT[i - 1] : _up);
                RT[i].normalize();
                // a gentle squeeze that ripples down the arm
                RR[i] = tentRadius(u) * (1 + Math.sin(t * 3 - u * 12 + tn.k * 1.3) * 0.06);
            }
            // frames that don't twist: the underside starts out facing down and is carried along the arm
            _side.set(-Math.sin(tn.angle), 0, Math.cos(tn.angle));
            RD[0].crossVectors(RT[0], _side);
            if (RD[0].lengthSq() < 1e-6) RD[0].set(0, -1, 0);
            RD[0].normalize();
            RS[0].crossVectors(RT[0], RD[0]);
            for (let i = 1; i < T_RINGS; i++) {
                RD[i].copy(RD[i - 1]).addScaledVector(RT[i], -RD[i - 1].dot(RT[i])).normalize();
                RS[i].crossVectors(RT[i], RD[i]);
            }
            // curl the tip up (suckers on the outside, like a cartoon octopus)
            if (Math.abs(tn.curl) > 0.01) {
                _axis.copy(RS[CURL_FROM]);
                _prev.copy(RC[CURL_FROM]);
                let phi = 0;
                for (let i = CURL_FROM + 1; i < T_RINGS; i++) {
                    phi -= tn.curl * 0.5 * Math.pow((i - CURL_FROM) / (last - CURL_FROM), 1.2);
                    _q.setFromAxisAngle(_axis, phi);
                    _seg.copy(RC[i]).sub(_prev);
                    _prev.copy(RC[i]);
                    RC[i].copy(RC[i - 1]).add(_seg.applyQuaternion(_q));
                    RT[i].applyQuaternion(_q);
                    RD[i].applyQuaternion(_q);
                    RS[i].applyQuaternion(_q);
                }
            }
            let o = tn.k * T_VERTS * 3;
            for (let i = 0; i < T_RINGS; i++) {
                const i0 = Math.max(0, i - 1), i1 = Math.min(last, i + 1);
                const slope = (RR[i1] - RR[i0]) / (RC[i0].distanceTo(RC[i1]) || 1);
                const c = RC[i], T = RT[i], D = RD[i], S = RS[i], r = RR[i];
                for (let j = 0; j < T_COLS; j++) {
                    const cs = T_COS[j], sn = T_SIN[j];
                    const dx = sn * S.x - cs * D.x, dy = sn * S.y - cs * D.y, dz = sn * S.z - cs * D.z;
                    P[o] = c.x + dx * r;
                    P[o + 1] = c.y + dy * r;
                    P[o + 2] = c.z + dz * r;
                    const nx = dx - T.x * slope, ny = dy - T.y * slope, nz = dz - T.z * slope;
                    const l = Math.hypot(nx, ny, nz) || 1;
                    N[o] = nx / l;
                    N[o + 1] = ny / l;
                    N[o + 2] = nz / l;
                    o += 3;
                }
            }
        }
        this.tentGeo.attributes.position.needsUpdate = true;
        this.tentGeo.attributes.normal.needsUpdate = true;
    }

    // --------------------------------------------------------
    // Warnings, shockwaves
    // --------------------------------------------------------
    updateHazards(dt) {
        const g = this.game;
        const P = g.player;
        for (const w of this.warnings) {
            if (!w.on) continue;
            w.t += dt;
            const k = w.t / w.life;
            const pulse = 0.5 + 0.5 * Math.sin(w.t * (10 + k * 20));
            w.mat.opacity = 0.35 + pulse * 0.5;
            w.fillMat.opacity = 0.12 + k * 0.3;
            w.fill.scale.setScalar(Math.min(1, k));
            if (w.t >= w.life) { w.on = false; w.grp.visible = false; }
        }
        for (const w of this.waves) {
            if (!w.on) continue;
            w.r += dt * 10.5;
            w.m.position.set(w.x, 0.25, w.z);
            w.m.scale.set(w.r, w.r, 3.5);
            w.mat.opacity = Math.max(0, 0.95 - w.r / 13);
            if (!w.hit && !P.dead) {
                const d = Math.hypot(P.pos.x - w.x, P.pos.z - w.z);
                if (Math.abs(d - w.r) < 0.65 && P.pos.y < 0.55) {
                    w.hit = true;
                    P.hurt(this.dmg(1), _v.set(P.pos.x - w.x, 0, P.pos.z - w.z).normalize());
                    g.hud.toast('JUMP over the shockwaves!', 2);
                }
            }
            if (Math.random() < dt * 30) {
                const a = Math.random() * Math.PI * 2;
                g.effects.spawn({ x: w.x + Math.cos(a) * w.r, y: 0.2, z: w.z + Math.sin(a) * w.r, vy: 1.2, life: 0.4, size: 0.5, size1: 1.2, color: 0xffb07a, alpha: 0.6, alpha1: 0, batch: 1 });
            }
            if (w.r > 12.5) { w.on = false; w.m.visible = false; }
        }
    }

    // --------------------------------------------------------
    // Pose the model
    // --------------------------------------------------------
    animate(dt) {
        const t = this.t;
        const C = this.center;
        const U = this.U;
        const st = this.state, sT = this.stateT;
        const rage = this.phase >= 3 ? 1 : 0;
        this.hurtT = Math.max(0, this.hurtT - dt);
        this.flinch = Math.max(0, (this.flinch || 0) - dt * 4);
        this.ouchT = Math.max(0, this.ouchT - dt);
        this.rageK = damp(this.rageK, st === 'dying' ? 0 : rage, st === 'dying' ? 1.2 : 2.5, dt); // calms down when it's beaten
        this.lunge = Math.max(0, this.lunge - dt * 3);
        // squash and stretch: a wobbly spring that hits, slams and spits kick
        this.sqV += (-140 * this.sq - 7 * this.sqV) * dt;
        this.sq = clamp(this.sq + this.sqV * dt, -0.6, 0.6);
        let sq = this.sq;
        if (st === 'dying') sq += Math.sin(t * 13) * 0.3 * Math.min(1, sT);
        if (st === 'roar') sq -= 0.25 * Math.min(1, sT * 3) * (sT < 2 ? 1 : Math.max(0, 1 - (sT - 2) * 3));
        const bob = Math.sin(t * 1.25) * 0.35;
        const y = lerp(-16, BODY_Y, easeOut(clamp(this.rise, 0, 1))) + bob * this.rise;
        this.root.position.set(C.x, y, C.z);
        this.root.updateMatrixWorld();
        // turn toward the target (slowly)
        const turn = st === 'intro' ? 3 : 1.4;
        this.yaw = dampAngle(this.yaw, this.faceYaw, turn, dt);
        // lean in to wind up a slam, and into the laser
        const lean = st === 'slam' ? 0.12 : st === 'laser' ? 0.06 : 0;
        this.lean = damp(this.lean, lean, 4, dt);
        this.body.rotation.set(-this.flinch * 0.18 - (st === 'roar' ? 0.25 * Math.min(1, sT * 3) : 0) + this.lean, this.yaw, Math.sin(t * 0.8) * 0.04);
        const breathe = 1 + Math.sin(t * 2.1) * 0.025;
        this.body.scale.set(breathe * (1 + sq * 0.1), (1 - sq * 0.12) / breathe, breathe * (1 + sq * 0.1));
        const lg = this.lunge * this.lunge * 0.6;
        this.body.position.set(Math.sin(this.yaw) * lg, 0, Math.cos(this.yaw) * lg);
        if (st === 'dying') {
            this.body.rotation.z += Math.sin(t * 25) * 0.06;
            this.body.position.x += Math.sin(t * 31) * 0.15;
        }
        if (st === 'laser' && sT < 1.3) this.body.position.x += Math.sin(t * 70) * 0.05 * (sT / 1.3); // shaking with power

        // the face: what the brow, lids and pupil want to do right now
        let tilt = 0.1 * (this.phase - 1), lift = 0, su = 0.14, sl = 0.05, pr = 0.2, pw = 0.5, glow = 0, dizzy = 0, puff = 0;
        if (rage) { tilt = 0.32; su = 0.26; pw = 0.34; }
        if (st === 'laser') {
            const ch = clamp(sT / 1.3, 0, 1);
            tilt = 0.42; lift = -0.2 * ch; su = 0.2 + 0.22 * ch; sl = 0.08 + 0.3 * ch; pr = 0.22; pw = lerp(0.5, 0.15, ch);
            glow = sT < 1.3 ? ch * 0.7 : sT < 3.0 ? 1 : 0;
        } else if (st === 'slam') {
            tilt = 0.38; lift = -0.12; su = Math.max(su, 0.24); pw = 0.34;
        } else if (st === 'spit') {
            puff = sT < 0.75 ? smoothstep(0, 0.6, sT) : Math.max(0, 1 - (sT - 0.75) * 8);
            tilt = -0.12; lift = 0.14; pr = 0.17;
        } else if (st === 'roar') {
            tilt = 0.48; lift = -0.2;
        } else if (st === 'dying') {
            tilt = -0.4; lift = 0.22; dizzy = 1;
        }
        if (this.ouchT > 0) { tilt = -0.35; lift = 0.28; pr = 0.11; pw = 1; }
        const E = this.ex;
        E.tilt = damp(E.tilt, tilt, 12, dt);
        E.lift = damp(E.lift, lift, 12, dt);
        E.su = damp(E.su, su, 10, dt);
        E.sl = damp(E.sl, sl, 10, dt);
        E.pr = damp(E.pr, pr, 9, dt);
        E.pw = this.eyeOpen < 0.95 ? 1 : damp(E.pw, pw, 5, dt); // the pupil is wide open when the eye first snaps open
        E.glow = damp(E.glow, glow, 10, dt);
        E.dizzy = damp(E.dizzy, dizzy, 4, dt);
        E.puff = damp(E.puff, puff, 14, dt);

        // eyelids: open/closed (closed while roaring, blinking now and then)
        this.blinkT -= dt;
        let close = 1 - this.eyeOpen;
        if (this.state === 'roar') close = Math.max(close, this.stateT < 2.0 ? 1 : 1 - (this.stateT - 2.0) / 0.3);
        if (this.state === 'dying') close = 0.45;
        if (this.blinkT < 0) {
            close = Math.max(close, 1 - Math.abs(this.blinkT + 0.09) / 0.09);
            if (this.blinkT < -0.18) this.blinkT = rand(2.5, 5);
        }
        if (this.hurtT > 0) close = Math.max(close, 0.35);
        this.lidClose = clamp(close, 0, 1);
        const lc = this.lidClose;
        // the lids show the gameplay state, plus a squint (still open enough to shoot)
        const cu = Math.max(lc, E.su), cl = Math.max(lc, E.sl);
        this.eye.upper.rotation.x = lerp(-1.15, 0.55, cu);
        this.eye.lower.rotation.x = lerp(1.05, -0.55, cl);
        this.eye.shine.visible = cu < 0.45 && E.dizzy < 0.5;
        // the eye follows its target
        this.body.updateMatrixWorld();
        this.eye.group.getWorldPosition(this.pos);
        _v.copy(this.lookTarget).sub(this.pos);
        const localYaw = wrapAngle(Math.atan2(_v.x, _v.z) - this.yaw);
        const pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
        this.lookYaw = damp(this.lookYaw, clamp(localYaw, -0.8, 0.8), 10, dt);
        this.lookPitch = damp(this.lookPitch, clamp(-pitch, -0.6, 0.6), 10, dt);
        if (st === 'dying') { this.lookYaw = Math.sin(t * 5) * 0.25; this.lookPitch = Math.cos(t * 5) * 0.15; }
        if (this.ouchT > 0) this.lookYaw += Math.sin(t * 50) * 0.06 * this.ouchT;
        this.eye.eye.rotation.set(this.lookPitch, this.lookYaw, 0);
        // the iris: gold, red-hot when charging the laser or furious, and a spiral when knocked out
        U.uEyeA.value.set(0.36, E.pr, E.pw, E.dizzy);
        const hot = Math.max(E.glow, this.rageK * 0.75);
        U.uIrisIn.value.copy(this._irisIn).lerp(_c.setRGB(1, 0.42, 0.25), hot);
        U.uIrisOut.value.copy(this._irisOut).lerp(_c.setRGB(0.85, 0.05, 0.04), hot);
        U.uEyeGlow.value.setRGB(1, 0.15, 0.12).multiplyScalar(E.glow * 1.3);
        // colors: flash white when hurt, red when furious
        const em = this.eye.mat.emissive;
        if (this.hurtT > 0) em.setRGB(0.8, 0.8, 0.8);
        else em.setRGB(0, 0, 0);
        U.uRage.value = this.rageK;
        const bm = this.bodyMesh.material;
        bm.emissive.setRGB(this.rageK * (0.12 + Math.sin(t * 6) * 0.06) + (this.hurtT > 0 ? 0.3 : 0), this.hurtT > 0 ? 0.25 : 0, this.hurtT > 0 ? 0.3 : 0);
        this.tentMat.emissive.copy(bm.emissive);
        this.eye.lidMat.emissive.copy(bm.emissive);
        this.mouthParts.jawMat.emissive.copy(bm.emissive);
        // squishy body: breathing mantle, puffed cheeks, the brow, flapping fins, the hit wobble
        this.jig = damp(this.jig, 0, 2.2, dt);
        U.uJig.value = this.jig;
        U.uJigT.value += dt;
        U.uBreath.value = st === 'dying' ? -0.6 - Math.sin(t * 9) * 0.4 : Math.sin(t * (rage ? 3.2 : 2.1)) + (st === 'roar' ? 0.8 : 0);
        U.uPuff.value = E.puff;
        U.uBrowTilt.value = E.tilt;
        U.uBrowLift.value = E.lift;
        U.uFlap.value = st === 'dying' ? -0.5 + Math.sin(t * 11) * 0.25
            : st === 'roar' ? Math.sin(t * 16) * 0.4
            : Math.sin(t * (rage ? 4.5 : 2.4) + 0.5) * 0.2 - this.lean;
        U.uGlowStrength.value = 1.2 + Math.sin(t * (rage ? 7 : 2.1) + 1) * 0.5;
        // mouth
        const m = this.mouthParts;
        const mo = clamp(this.mouth, 0, 1);
        m.inside.scale.y = 0.3 + mo * 0.75;
        m.jaw.position.y = -0.15 - mo * 0.8;
        if (st === 'dying') {
            // knocked out: tongue hanging out
            m.tongue.position.set(Math.sin(t * 7) * 0.1, -0.5 - mo * 0.4, 0.45);
            m.tongue.scale.set(0.6, 0.2, 0.75);
        } else {
            m.tongue.position.set(0, -0.15 - mo * 0.45, 0.05);
            m.tongue.scale.set(0.75, 0.22, 0.35);
        }
        const spitting = st === 'spit';
        m.goo.visible = spitting && mo > 0.05 && sT < 0.85;
        m.goo.scale.setScalar((0.35 + mo * 0.75) * (1 + Math.sin(t * 24) * 0.07));
        m.glow.material.opacity = spitting ? mo * 0.9 : 0;
        m.glow.scale.setScalar(1.5 + mo * 2);
        // furious: steam puffs out of the top of its head
        if (rage && this.active && this.root.visible) {
            this.steamT -= dt;
            if (this.steamT <= 0) {
                this.steamT = 0.11;
                _v.set((Math.random() < 0.5 ? -1 : 1) * 1.5, 4.5, -1.6);
                this.body.localToWorld(_v);
                this.game.effects.spawn({
                    x: _v.x, y: _v.y, z: _v.z, vx: rand(-0.8, 0.8), vy: rand(3, 5), vz: rand(-0.8, 0.8),
                    life: rand(0.5, 0.8), size: 0.45, size1: 1.4, color: 0xffe0e0, color1: 0xff9a9a, alpha: 0.7, alpha1: 0, drag: 1.4,
                });
            }
        }
        this.tentMesh.visible = this.root.visible;
        this.writeTentacles();
    }
}
