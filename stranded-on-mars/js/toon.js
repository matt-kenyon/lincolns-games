// ============================================================
// TOON RENDERING — the "Breath of the Wild" look
//  - soft two-tone cel shading (gradient ramp)
//  - rim light that catches the sun on silhouettes
//  - painterly world-space color noise on terrain/rocks
//  - swaying alien plants, glowing vertex parts
//  - inverted-hull outlines for characters and props
// ============================================================

import * as THREE from 'three';
import { smoothstep } from './util.js';

// Uniforms shared by every toon material (updated once per frame)
export const shared = {
    uTime: { value: 0 },
    uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
};

// ------------------------------------------------------------
// Toon ramp: dark side (ambient only) -> soft terminator -> lit
// ------------------------------------------------------------
let _ramp = null;
export function toonRamp() {
    if (_ramp) return _ramp;
    const n = 128;
    const data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
        const x = i / (n - 1); // = N.L * 0.5 + 0.5
        const v = smoothstep(0.46, 0.53, x) * 0.84 + smoothstep(0.74, 0.8, x) * 0.16;
        const b = Math.round(v * 255);
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = b;
        data[i * 4 + 3] = 255;
    }
    _ramp = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
    _ramp.minFilter = THREE.LinearFilter;
    _ramp.magFilter = THREE.LinearFilter;
    _ramp.generateMipmaps = false;
    _ramp.needsUpdate = true;
    return _ramp;
}

const FRAG_COMMON = /* glsl */`
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform vec3 uSunDirView;
uniform float uPaint;
uniform float uGlowStrength;
varying vec3 vWPos;
#ifdef USE_GLOW_ATTR
varying float vGlow;
#endif
float tHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float tNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = tHash(i), b = tHash(i + vec2(1.0, 0.0));
    float c = tHash(i + vec2(0.0, 1.0)), d = tHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

const VERT_COMMON = /* glsl */`
varying vec3 vWPos;
uniform float uTime;
uniform float uSway;
#ifdef USE_SWAY
attribute float swayW;
#endif
#ifdef USE_GLOW_ATTR
attribute float glow;
varying float vGlow;
#endif
`;

function toonOnBeforeCompile(shader) {
    const u = this.userData;
    shader.uniforms.uRimColor = { value: u.rimColor };
    shader.uniforms.uRimStrength = { value: u.rim };
    shader.uniforms.uSunDirView = shared.uSunDirView;
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uPaint = { value: u.paint };
    shader.uniforms.uSway = { value: u.sway };
    shader.uniforms.uGlowStrength = { value: u.glowStrength };
    u.shader = shader;

    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_COMMON)
        .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
#ifdef USE_SWAY
{
    vec4 sp = vec4(position, 1.0);
    #ifdef USE_INSTANCING
    sp = instanceMatrix * sp;
    #endif
    sp = modelMatrix * sp;
    float ph = sp.x * 0.37 + sp.z * 0.23;
    float sw = swayW * uSway;
    transformed.x += sin(uTime * 1.7 + ph) * sw;
    transformed.z += cos(uTime * 1.3 + ph * 1.3) * sw * 0.6;
}
#endif
#ifdef USE_GLOW_ATTR
vGlow = glow;
#endif`)
        .replace('#include <project_vertex>', /* glsl */`#include <project_vertex>
{
    vec4 wp4 = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
    #endif
    vWPos = (modelMatrix * wp4).xyz;
}`);

    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_COMMON)
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
#ifdef USE_PAINT
{
    float pn = tNoise(vWPos.xz * 0.07) * 0.5 + tNoise(vWPos.xz * 0.37 + 7.3) * 0.32 + tNoise(vWPos.xz * 1.9 + vWPos.y) * 0.18;
    diffuseColor.rgb *= 1.0 + (pn - 0.5) * uPaint;
}
#endif`)
        .replace('#include <opaque_fragment>', /* glsl */`
#ifdef USE_GLOW_ATTR
outgoingLight += diffuseColor.rgb * vGlow * uGlowStrength;
#endif
#ifdef USE_RIM
{
    vec3 Vd = normalize(vViewPosition);
    float ndv = clamp(dot(normal, Vd), 0.0, 1.0);
    float rimF = smoothstep(0.58, 0.68, 1.0 - ndv);
    float lf = clamp(dot(normal, uSunDirView) * 0.5 + 0.5, 0.0, 1.0);
    outgoingLight += uRimColor * rimF * (0.2 + 0.8 * lf) * uRimStrength;
}
#endif
#include <opaque_fragment>`);
}

const _matCache = new Map();

/**
 * Create (or reuse) a toon material.
 * opts: color, vertexColors, rim, rimColor, emissive, glow (vertex attribute),
 *       glowStrength, paint, sway, flat, side, transparent, opacity, fog, cache
 */
export function toonMaterial(opts = {}) {
    const o = {
        color: 0xffffff,
        vertexColors: false,
        rim: 0,
        rimColor: 0xfff1d6,
        emissive: 0x000000,
        glow: false,
        glowStrength: 1.4,
        paint: 0,
        sway: 0,
        flat: false,
        side: THREE.FrontSide,
        transparent: false,
        opacity: 1,
        fog: true,
        cache: true,
        ...opts,
    };
    const key = o.cache ? JSON.stringify(o) : null;
    if (key && _matCache.has(key)) return _matCache.get(key);

    const mat = new THREE.MeshToonMaterial({
        color: o.color,
        vertexColors: o.vertexColors,
        gradientMap: toonRamp(),
        emissive: o.emissive,
        side: o.side,
        transparent: o.transparent,
        opacity: o.opacity,
        fog: o.fog,
    });
    mat.userData = {
        rim: o.rim,
        rimColor: new THREE.Color(o.rimColor),
        paint: o.paint,
        sway: o.sway,
        glowStrength: o.glowStrength,
    };
    mat.defines = {};
    if (o.rim > 0) mat.defines.USE_RIM = '';
    if (o.paint > 0) mat.defines.USE_PAINT = '';
    if (o.sway > 0) mat.defines.USE_SWAY = '';
    if (o.glow) mat.defines.USE_GLOW_ATTR = '';
    mat.onBeforeCompile = toonOnBeforeCompile;
    if (key) _matCache.set(key, mat);
    return mat;
}

// ------------------------------------------------------------
// Outline (inverted hull) — dark back faces pushed out along normals
// ------------------------------------------------------------
const _outlineCache = new Map();
export function outlineMaterial(color = 0x2a1424, thickness = 0.0032) {
    const key = color + ':' + thickness;
    if (_outlineCache.has(key)) return _outlineCache.get(key);
    const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            { uColor: { value: new THREE.Color(color) }, uThick: { value: thickness } },
        ]),
        vertexShader: /* glsl */`
            #include <common>
            #include <fog_pars_vertex>
            uniform float uThick;
            void main() {
                vec4 p = vec4(position, 1.0);
                vec3 n = normal;
                #ifdef USE_INSTANCING
                p = instanceMatrix * p;
                n = mat3(instanceMatrix) * n;
                #endif
                vec4 mvPosition = modelViewMatrix * p;
                vec3 vn = normalize(normalMatrix * n);
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
    _outlineCache.set(key, mat);
    return mat;
}

// Add an outline child to a mesh (shares geometry)
export function addOutline(mesh, color, thickness) {
    const o = new THREE.Mesh(mesh.geometry, outlineMaterial(color, thickness));
    o.castShadow = false;
    o.receiveShadow = false;
    o.raycast = () => {};
    mesh.add(o);
    return o;
}

// ------------------------------------------------------------
// Soft glow sprite texture (for additive halos)
// ------------------------------------------------------------
let _glowTex = null;
export function glowTexture() {
    if (_glowTex) return _glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    _glowTex = new THREE.CanvasTexture(c);
    _glowTex.colorSpace = THREE.SRGBColorSpace;
    return _glowTex;
}

export function glowSprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(),
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    }));
    s.scale.set(size, size, 1);
    return s;
}

// ------------------------------------------------------------
// GeoBuilder — merge primitive shapes into one vertex-colored geometry.
// Keeps draw calls low (one mesh per moving body part).
// ------------------------------------------------------------
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class GeoBuilder {
    constructor() {
        this.chunks = [];
    }

    /**
     * add(geometry, color, { p:[x,y,z], r:[x,y,z], s:[x,y,z] | number }, glow, flat)
     */
    add(geometry, color, t = {}, glow = 0, flat = false) {
        let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        const p = t.p || [0, 0, 0];
        const r = t.r || [0, 0, 0];
        const s = t.s == null ? [1, 1, 1] : (typeof t.s === 'number' ? [t.s, t.s, t.s] : t.s);
        _e.set(r[0], r[1], r[2], t.order || 'XYZ');
        _q.setFromEuler(_e);
        _m4.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
        if (t.matrix) _m4.premultiply(t.matrix);
        g.applyMatrix4(_m4);
        if (flat) g.computeVertexNormals();
        const count = g.attributes.position.count;
        const col = new Float32Array(count * 3);
        const colors = Array.isArray(color) ? color : null;
        _c.set(colors ? colors[0] : color);
        for (let i = 0; i < count; i++) {
            if (colors && typeof color[1] === 'function') {
                color[1](g.attributes.position, i, _c);
            }
            col[i * 3] = _c.r;
            col[i * 3 + 1] = _c.g;
            col[i * 3 + 2] = _c.b;
        }
        const gl = new Float32Array(count).fill(glow);
        this.chunks.push({ g, col, gl });
        geometry.dispose?.();
        return this;
    }

    build() {
        let total = 0;
        for (const c of this.chunks) total += c.g.attributes.position.count;
        const pos = new Float32Array(total * 3);
        const nor = new Float32Array(total * 3);
        const col = new Float32Array(total * 3);
        const glw = new Float32Array(total);
        let o = 0;
        for (const c of this.chunks) {
            const n = c.g.attributes.position.count;
            pos.set(c.g.attributes.position.array, o * 3);
            nor.set(c.g.attributes.normal.array, o * 3);
            col.set(c.col, o * 3);
            glw.set(c.gl, o);
            o += n;
            c.g.dispose();
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('glow', new THREE.BufferAttribute(glw, 1));
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        this.chunks = [];
        return geo;
    }
}

// Shared vertex-colored materials for merged models
export const vcMat = (extra = {}) => toonMaterial({ vertexColors: true, glow: true, rim: 0.55, ...extra });
