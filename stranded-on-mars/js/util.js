// ============================================================
// UTILITIES — math helpers, seeded random, Perlin noise
// ============================================================

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;

// Frame-rate independent exponential smoothing.
// `rate` ~ how many "halvings" per second-ish; higher = snappier.
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

// Wrap an angle to (-PI, PI]
export function wrapAngle(a) {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
}

export function dampAngle(current, target, rate, dt) {
    return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}

// Easing
export const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const easeIn = t => t * t;
export const easeOutBack = t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ------------------------------------------------------------
// Seeded RNG (mulberry32)
// ------------------------------------------------------------
export function makeRng(seed) {
    let a = seed >>> 0;
    const rng = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.range = (lo, hi) => lo + (hi - lo) * rng();
    rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
    rng.pick = arr => arr[Math.floor(rng() * arr.length)];
    rng.sign = () => (rng() < 0.5 ? -1 : 1);
    return rng;
}

export const rand = (lo, hi) => lo + (hi - lo) * Math.random();
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ------------------------------------------------------------
// 2D Perlin noise (seeded) + fractal sum
// ------------------------------------------------------------
const perm = new Uint8Array(512);
(function initPerm() {
    const r = makeRng(1337);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();

const G2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

function grad(h, x, y) {
    const g = G2[h & 7];
    return g[0] * x + g[1] * y;
}

// Returns roughly [-1, 1]
export function perlin2(x, y) {
    let X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y;
    X &= 255; Y &= 255;
    const u = fade(xf), v = fade(yf);
    const aa = perm[X + perm[Y]];
    const ab = perm[X + perm[Y + 1]];
    const ba = perm[X + 1 + perm[Y]];
    const bb = perm[X + 1 + perm[Y + 1]];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 1.414;
}

export function fbm2(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += perlin2(x, y) * amp;
        norm += amp;
        amp *= gain;
        x = x * lacunarity + 17.3;
        y = y * lacunarity - 9.1;
    }
    return sum / norm;
}

// Ridged noise for craggy rock
export function ridged2(x, y, octaves = 3) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < octaves; i++) {
        const n = 1 - Math.abs(perlin2(x, y));
        sum += n * n * amp;
        norm += amp;
        amp *= 0.5;
        x *= 2.1; y *= 2.1;
    }
    return sum / norm;
}

// ------------------------------------------------------------
// Geometry helpers for 2D (XZ plane)
// ------------------------------------------------------------

// Closest point on segment AB to P (all 2D). Returns t in [0,1].
export function segmentT(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-9) return 0;
    return clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
}

export function dist2D(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    return Math.sqrt(dx * dx + dz * dz);
}

// Simple object pool helper
export class Pool {
    constructor(make) {
        this.make = make;
        this.free = [];
    }
    get() {
        return this.free.pop() || this.make();
    }
    release(o) {
        this.free.push(o);
    }
}

// Safe localStorage wrapper (private windows can throw)
export const store = {
    get(key, fallback = null) {
        try {
            const v = localStorage.getItem(key);
            return v == null ? fallback : JSON.parse(v);
        } catch (e) {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* ignore */ }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) { /* ignore */ }
    },
};
