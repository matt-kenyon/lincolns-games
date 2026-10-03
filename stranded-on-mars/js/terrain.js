// ============================================================
// TERRAIN — procedural Mars canyon carved along the level path
// + height / normal / raycast queries + simple circle colliders
// ============================================================

import * as THREE from 'three';
import { WORLD, pathQuery, CRATERS, ICE_LAKE, REGIONS } from './layout.js';
import { fbm2, perlin2, ridged2, smoothstep, clamp, lerp } from './util.js';
import { toonMaterial } from './toon.js';

const C = (hex) => new THREE.Color(hex);
export const PALETTE = {
    dust: C(0xd9774c),
    dustLight: C(0xeaa271),
    dustDark: C(0xb95b3b),
    strata: [C(0xb24f2f), C(0xd27243), C(0x9b3f28), C(0xe59a66), C(0xc25f39), C(0xa94a2d)],
    plateau: C(0xd0804f),
    moss: C(0x3fa597),
    mossDeep: C(0x2f7f86),
    mossPurple: C(0x8d5bb0),
    frost: C(0xeef4fa),
    frostBlue: C(0xa9cbe6),
    iceRock: C(0x9fb4cf),
    scorch: C(0x5a3530),
    ash: C(0x8a5a48),
};

export class Terrain {
    constructor() {
        const { x0, x1, z0, z1, cell } = WORLD;
        this.x0 = x0;
        this.z0 = z0;
        this.cell = cell;
        this.nx = Math.round((x1 - x0) / cell);
        this.nz = Math.round((z1 - z0) / cell);
        this.W = this.nx + 1;
        this.H = this.nz + 1;
        this.h = new Float32Array(this.W * this.H);
        this.sd = new Float32Array(this.W * this.H);
        this._q = {};
        this.meshes = [];
    }

    // --------------------------------------------------------
    // Height function (used once to build the grid)
    // --------------------------------------------------------
    rawHeight(x, z) {
        const q = pathQuery(x, z, this._q);
        const sd = q.sd;
        let floor = q.floor
            + fbm2(x * 0.011, z * 0.011, 3) * 1.3
            + perlin2(x * 0.055, z * 0.055) * 0.3;
        // wind ripples in the dust
        floor += Math.sin(x * 0.21 + z * 0.08 + perlin2(x * 0.02, z * 0.02) * 5) * 0.06;

        let h = floor;
        const wallW = 15;
        if (sd > -3) {
            const e = (sd + 3) / wallW;
            const topBase = q.floor + 18 + 14 * (fbm2(x * 0.006 + 31, z * 0.006 - 11, 3) * 0.5 + 0.5);
            let cliff;
            if (e < 1) {
                // talus slope at the bottom, then a steep layered cliff
                const t = e < 0.25 ? 0.12 * smoothstep(0, 0.25, e) : 0.12 + 0.88 * smoothstep(0.25, 1.0, e);
                cliff = floor + (topBase - floor) * t;
            } else {
                cliff = topBase + fbm2(x * 0.013, z * 0.013, 3) * 6 + Math.min(e - 1, 5) * 2.2;
            }
            // terraces (layered mesa look)
            const step = 4.2;
            const hh = cliff / step;
            const fi = Math.floor(hh), fr = hh - fi;
            const terr = (fi + Math.pow(fr, 3.2)) * step;
            const tw = smoothstep(0.2, 0.45, e);
            cliff = lerp(cliff, terr, tw * 0.8);
            cliff += ridged2(x * 0.09, z * 0.09, 2) * 1.6 * tw;
            h = Math.max(floor, cliff);
        }

        // Craters (only on the canyon floor)
        const floorW = smoothstep(4, -6, sd);
        if (floorW > 0) {
            for (const c of CRATERS) {
                const dx = x - c.x, dz = z - c.z;
                const r = Math.sqrt(dx * dx + dz * dz) / c.r;
                if (r < 1.8) {
                    const bowl = r < 1 ? -c.depth * (1 - r * r) : 0;
                    const rim = c.rim * Math.exp(-Math.pow((r - 1) / 0.25, 2));
                    h += (bowl + rim) * floorW;
                }
            }
            // Frozen lake: flat ice with a sloped shore
            const L = ICE_LAKE;
            const ld = Math.sqrt((x - L.x) ** 2 + (z - L.z) ** 2);
            if (ld < L.r + 9) {
                const t = smoothstep(L.r, L.r + 9, ld);
                h = lerp(L.level, h, t);
            }
        }
        return h;
    }

    build(onProgress) {
        const { W, H, x0, z0, cell } = this;
        for (let j = 0; j < H; j++) {
            const z = z0 + j * cell;
            for (let i = 0; i < W; i++) {
                const x = x0 + i * cell;
                const idx = j * W + i;
                this.h[idx] = this.rawHeight(x, z);
                this.sd[idx] = this._q.sd;
            }
            if (onProgress && (j % 64 === 0)) onProgress(j / H);
        }
        this.buildMeshes();
    }

    // Grid normal (central differences)
    gridNormal(i, j, out) {
        const { W, H, h, cell } = this;
        const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, W - 1);
        const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, H - 1);
        const dx = (h[j * W + i1] - h[j * W + i0]) / ((i1 - i0) * cell);
        const dz = (h[j1 * W + i] - h[j0 * W + i]) / ((j1 - j0) * cell);
        out.set(-dx, 1, -dz).normalize();
        return out;
    }

    vertexColor(x, z, y, ny, sd, out) {
        const P = PALETTE;
        const n1 = fbm2(x * 0.028, z * 0.028, 2);
        const n2 = perlin2(x * 0.13, z * 0.13);
        // canyon floor dust
        out.copy(P.dust);
        out.lerp(P.dustLight, smoothstep(0.05, 0.45, n1) * 0.8);
        out.lerp(P.dustDark, smoothstep(0.1, 0.5, -n1) * 0.7);

        // layered rock on steep faces
        const steep = 1 - smoothstep(0.6, 0.86, ny);
        if (steep > 0) {
            const band = Math.floor((y + n2 * 1.1) / 2.3);
            const s = P.strata[((band % 6) + 6) % 6];
            out.lerp(s, steep);
        }
        // plateau tops
        if (sd > 12) out.lerp(P.plateau, smoothstep(12, 20, sd) * (1 - steep) * 0.8);

        // dark contact line at cliff bases (fake AO)
        const ao = smoothstep(-4, 1, sd) * (1 - smoothstep(1, 6, sd));
        out.multiplyScalar(1 - ao * 0.16);

        // Region tints
        const R = REGIONS;
        let d = Math.hypot(x - R.crystal.x, z - R.crystal.z);
        if (d < R.crystal.r) {
            const w = smoothstep(R.crystal.r, R.crystal.r * 0.55, d) * (1 - steep * 0.85);
            const m = fbm2(x * 0.05 + 3, z * 0.05 - 7, 3);
            if (m > 0.02) out.lerp(m > 0.3 ? P.mossDeep : P.moss, w * smoothstep(0.02, 0.18, m) * 0.85);
            if (m < -0.28) out.lerp(P.mossPurple, w * smoothstep(-0.28, -0.42, m) * 0.7);
        }
        d = Math.hypot(x - R.frozen.x, z - R.frozen.z);
        if (d < R.frozen.r) {
            const w = smoothstep(R.frozen.r, R.frozen.r * 0.5, d);
            out.lerp(P.iceRock, w * steep * 0.55);
            const patch = smoothstep(-0.15, 0.3, n1 + perlin2(x * 0.09, z * 0.09) * 0.55);
            const shore = smoothstep(ICE_LAKE.r + 14, ICE_LAKE.r, Math.hypot(x - ICE_LAKE.x, z - ICE_LAKE.z));
            out.lerp(P.frostBlue, w * (1 - steep) * shore * 0.35);
            out.lerp(P.frost, w * (1 - steep) * Math.max(patch * 0.85, shore * 0.7));
        }
        d = Math.hypot(x - R.crash.x, z - R.crash.z);
        if (d < R.crash.r) {
            const w = smoothstep(R.crash.r, R.crash.r * 0.3, d);
            out.lerp(n2 > 0 ? P.scorch : P.ash, w * 0.75);
        }
        return out;
    }

    buildMeshes() {
        const { W, H, x0, z0, cell, h, sd } = this;
        const CH = 64; // cells per chunk side
        const mat = toonMaterial({ vertexColors: true, paint: 0.22, cache: false });
        this.material = mat;
        const nrm = new THREE.Vector3();
        const col = new THREE.Color();
        // Precompute normals & colors for every grid vertex
        const N = new Float32Array(W * H * 3);
        const COL = new Float32Array(W * H * 3);
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const idx = j * W + i;
                this.gridNormal(i, j, nrm);
                N[idx * 3] = nrm.x; N[idx * 3 + 1] = nrm.y; N[idx * 3 + 2] = nrm.z;
                this.vertexColor(x0 + i * cell, z0 + j * cell, h[idx], nrm.y, sd[idx], col);
                COL[idx * 3] = col.r; COL[idx * 3 + 1] = col.g; COL[idx * 3 + 2] = col.b;
            }
        }
        this.colors = COL;

        for (let cj = 0; cj < this.nz; cj += CH) {
            for (let ci = 0; ci < this.nx; ci += CH) {
                const i1 = Math.min(ci + CH, this.nx);
                const j1 = Math.min(cj + CH, this.nz);
                const cw = i1 - ci + 1, chh = j1 - cj + 1;
                const pos = new Float32Array(cw * chh * 3);
                const nor = new Float32Array(cw * chh * 3);
                const cols = new Float32Array(cw * chh * 3);
                let k = 0;
                for (let j = cj; j <= j1; j++) {
                    for (let i = ci; i <= i1; i++) {
                        const idx = j * W + i;
                        pos[k * 3] = x0 + i * cell;
                        pos[k * 3 + 1] = h[idx];
                        pos[k * 3 + 2] = z0 + j * cell;
                        nor[k * 3] = N[idx * 3]; nor[k * 3 + 1] = N[idx * 3 + 1]; nor[k * 3 + 2] = N[idx * 3 + 2];
                        cols[k * 3] = COL[idx * 3]; cols[k * 3 + 1] = COL[idx * 3 + 1]; cols[k * 3 + 2] = COL[idx * 3 + 2];
                        k++;
                    }
                }
                const index = [];
                for (let j = 0; j < chh - 1; j++) {
                    for (let i = 0; i < cw - 1; i++) {
                        const a = j * cw + i;
                        const b = (j + 1) * cw + i;
                        const c = (j + 1) * cw + i + 1;
                        const d = j * cw + i + 1;
                        index.push(a, b, d, b, c, d);
                    }
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
                geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
                geo.setIndex(index);
                geo.computeBoundingSphere();
                geo.computeBoundingBox();
                const mesh = new THREE.Mesh(geo, mat);
                mesh.receiveShadow = true;
                mesh.castShadow = true;
                mesh.matrixAutoUpdate = false;
                mesh.updateMatrix();
                this.meshes.push(mesh);
            }
        }
    }

    // --------------------------------------------------------
    // Queries
    // --------------------------------------------------------
    heightAt(x, z) {
        const { x0, z0, cell, W, nx, nz, h } = this;
        const fx = (x - x0) / cell, fz = (z - z0) / cell;
        let i = Math.floor(fx), j = Math.floor(fz);
        if (i < 0) i = 0; else if (i > nx - 1) i = nx - 1;
        if (j < 0) j = 0; else if (j > nz - 1) j = nz - 1;
        const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
        const ha = h[j * W + i];
        const hb = h[(j + 1) * W + i];
        const hc = h[(j + 1) * W + i + 1];
        const hd = h[j * W + i + 1];
        if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
        return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
    }

    // Face normal at (x, z)
    normalAt(x, z, out = new THREE.Vector3()) {
        const { x0, z0, cell, W, nx, nz, h } = this;
        const fx = (x - x0) / cell, fz = (z - z0) / cell;
        let i = Math.floor(fx), j = Math.floor(fz);
        if (i < 0) i = 0; else if (i > nx - 1) i = nx - 1;
        if (j < 0) j = 0; else if (j > nz - 1) j = nz - 1;
        const u = fx - i, v = fz - j;
        const ha = h[j * W + i];
        const hb = h[(j + 1) * W + i];
        const hc = h[(j + 1) * W + i + 1];
        const hd = h[j * W + i + 1];
        let du, dv;
        if (u + v <= 1) { du = hd - ha; dv = hb - ha; } else { du = hc - hb; dv = hc - hd; }
        out.set(-du / cell, 1, -dv / cell).normalize();
        return out;
    }

    // Returns distance along ray to the ground, or Infinity
    raycast(origin, dir, maxDist = 400) {
        let t = 0;
        let prevT = 0;
        let prevAbove = origin.y - this.heightAt(origin.x, origin.z);
        if (prevAbove < 0) return 0;
        while (t < maxDist) {
            const step = clamp(prevAbove * 0.6, 0.4, 6);
            t += step;
            const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
            const above = y - this.heightAt(x, z);
            if (above <= 0) {
                // refine
                let lo = prevT, hi = t;
                for (let k = 0; k < 8; k++) {
                    const m = (lo + hi) * 0.5;
                    const mx = origin.x + dir.x * m, my = origin.y + dir.y * m, mz = origin.z + dir.z * m;
                    if (my - this.heightAt(mx, mz) > 0) lo = m; else hi = m;
                }
                return hi;
            }
            prevT = t;
            prevAbove = above;
        }
        return Infinity;
    }

    // Is there a clear line between two points? (terrain only)
    lineOfSight(ax, ay, az, bx, by, bz) {
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const steps = Math.ceil(len / 2.5);
        for (let k = 1; k < steps; k++) {
            const t = k / steps;
            const x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
            if (y < this.heightAt(x, z) + 0.2) return false;
        }
        return true;
    }
}

// ============================================================
// COLLIDERS — vertical cylinders on a spatial hash grid
// ============================================================
export class Colliders {
    constructor(cellSize = 10) {
        this.cs = cellSize;
        this.grid = new Map();
        this.list = [];
        this._seen = 0;
    }

    key(ix, iz) {
        return ix * 100003 + iz;
    }

    add(x, z, r, top, bottom = -1000, tag = null) {
        const c = { x, z, r, top, bottom, tag, active: true, mark: 0 };
        this.list.push(c);
        const cs = this.cs;
        const ix0 = Math.floor((x - r) / cs), ix1 = Math.floor((x + r) / cs);
        const iz0 = Math.floor((z - r) / cs), iz1 = Math.floor((z + r) / cs);
        for (let ix = ix0; ix <= ix1; ix++) {
            for (let iz = iz0; iz <= iz1; iz++) {
                const k = this.key(ix, iz);
                let arr = this.grid.get(k);
                if (!arr) this.grid.set(k, (arr = []));
                arr.push(c);
            }
        }
        return c;
    }

    // Visit colliders near (x, z) within radius r
    query(x, z, r, fn) {
        const cs = this.cs;
        const mark = ++this._seen;
        const ix0 = Math.floor((x - r) / cs), ix1 = Math.floor((x + r) / cs);
        const iz0 = Math.floor((z - r) / cs), iz1 = Math.floor((z + r) / cs);
        for (let ix = ix0; ix <= ix1; ix++) {
            for (let iz = iz0; iz <= iz1; iz++) {
                const arr = this.grid.get(this.key(ix, iz));
                if (!arr) continue;
                for (const c of arr) {
                    if (c.mark === mark || !c.active) continue;
                    c.mark = mark;
                    if (fn(c) === true) return true;
                }
            }
        }
        return false;
    }

    /**
     * Push a standing cylinder (feet at pos.y) out of colliders.
     * Returns the highest collider top that can be stood on (or -Infinity).
     */
    resolve(pos, radius, height, stepUp = 0.45) {
        let ground = -Infinity;
        const feet = pos.y;
        this.query(pos.x, pos.z, radius + 6, (c) => {
            const dx = pos.x - c.x, dz = pos.z - c.z;
            const minD = c.r + radius;
            const d2 = dx * dx + dz * dz;
            if (d2 >= minD * minD) return;
            if (feet >= c.top - stepUp) {
                // standing on top
                if (d2 < (c.r + radius * 0.3) ** 2) ground = Math.max(ground, c.top);
                return;
            }
            if (feet + height < c.bottom) return;
            const d = Math.sqrt(d2) || 0.0001;
            const push = minD - d;
            pos.x += (dx / d) * push;
            pos.z += (dz / d) * push;
        });
        return ground;
    }

    // Does a point hit any collider?
    pointHit(x, y, z, pad = 0) {
        let hit = null;
        this.query(x, z, pad + 6, (c) => {
            const dx = x - c.x, dz = z - c.z;
            if (dx * dx + dz * dz < (c.r + pad) ** 2 && y < c.top + pad && y > c.bottom - pad) {
                hit = c;
                return true;
            }
        });
        return hit;
    }
}
