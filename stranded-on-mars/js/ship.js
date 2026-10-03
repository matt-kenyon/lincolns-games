// ============================================================
// THE SHIP — a cartoon rocket-shuttle with 5 detachable parts
// Local frame: nose toward -Z, up +Y, right +X.
// ============================================================

import * as THREE from 'three';
import { GeoBuilder, vcMat, addOutline, glowSprite } from './toon.js';

export const PART_INFO = {
    tailFin:   { name: 'TAIL FIN',   color: '#ff8a3d' },
    wing:      { name: 'WING',       color: '#f4f1ea' },
    fuelTank:  { name: 'FUEL TANK',  color: '#ff5b5b' },
    thruster:  { name: 'THRUSTER',   color: '#b8c2cc' },
    powerCore: { name: 'POWER CORE', color: '#6ff0ff' },
};

const WHITE = 0xf6f2ea;
const ORANGE = 0xff7a2e;
const GRAY = 0x8d97a3;
const DARK = 0x3a4250;
const RED = 0xe2484b;
const GLASS = 0x2d6db5;
const CYAN = 0x6ff0ff;

// Fuselage colors by position along the body (profile has paired rings at color edges)
function hullColor(pos, i, c) {
    const z = pos.getZ(i), y = pos.getY(i);
    if (z < -4.015) c.set(ORANGE);
    else if (z > -1.215 && z < -0.615) c.set(ORANGE);
    else if (y < -0.95 && z > -3.5 && z < 3.5) c.set(0xd9d4ca);
    else c.set(WHITE);
}

function shapeFrom(points) {
    const s = new THREE.Shape();
    points.forEach(([x, y], k) => (k === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
    s.closePath();
    return s;
}

const EXTRUDE = { depth: 0.26, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 };

// Wing outline in (x, z); split at x = 4.3 so the tip can be orange
const WING_INNER = [[1.0, -0.4], [4.3, 1.486], [4.3, 3.207], [1.0, 3.5]];
const WING_TIP = [[4.3, 1.486], [5.2, 2.0], [5.5, 3.1], [4.3, 3.207]];

function wingPiece(points, side) {
    const g = new THREE.ExtrudeGeometry(shapeFrom(points.map(([x, z]) => [x * side, -z])), EXTRUDE);
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.55, 0);
    return g;
}

function addWing(b, side) {
    b.add(wingPiece(WING_INNER, side), WHITE);
    b.add(wingPiece(WING_TIP, side), ORANGE);
}

// ------------------------------------------------------------
// Part geometry builders (in ship-local coordinates)
// ------------------------------------------------------------
const PART_BUILDERS = {
    tailFin() {
        const b = new GeoBuilder();
        const fin = (pts, color) => {
            const g = new THREE.ExtrudeGeometry(shapeFrom(pts), { ...EXTRUDE, depth: 0.24 });
            g.rotateY(-Math.PI / 2);
            g.translate(0.12, 0, 0);
            b.add(g, color);
        };
        fin([[1.6, 0.9], [3.4, 3.0], [4.8875, 3.0], [4.85, 0.9]], ORANGE);
        fin([[3.4, 3.0], [4.0, 3.7], [4.9, 3.7], [4.8875, 3.0]], WHITE);
        return b.build();
    },
    wing() {
        const b = new GeoBuilder();
        addWing(b, -1);
        // little wing-tip light
        b.add(new THREE.SphereGeometry(0.16, 10, 8), 0xff4040, { p: [-5.35, -0.4, 2.7] }, 1.2);
        return b.build();
    },
    fuelTank() {
        const b = new GeoBuilder();
        const tank = new THREE.CapsuleGeometry(0.6, 3.6, 6, 18);
        tank.rotateX(Math.PI / 2);
        b.add(tank, [RED, (p, i, c) => c.set(Math.abs(p.getZ(i) - 0.4) > 1.85 ? WHITE : RED)], { p: [0, -1.6, 0.4] });
        for (const z of [-0.5, 1.3]) {
            b.add(new THREE.CylinderGeometry(0.63, 0.63, 0.28, 18), WHITE, { p: [0, -1.6, z], r: [Math.PI / 2, 0, 0] });
        }
        b.add(new THREE.BoxGeometry(0.22, 0.5, 0.4), GRAY, { p: [0, -1.05, -0.8] });
        b.add(new THREE.BoxGeometry(0.22, 0.5, 0.4), GRAY, { p: [0, -1.05, 1.6] });
        return b.build();
    },
    thruster() {
        const b = new GeoBuilder();
        b.add(new THREE.CylinderGeometry(0.62, 0.44, 1.0, 18, 1, true), GRAY, { p: [0.72, -0.05, 5.2], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 18), DARK, { p: [0.72, -0.05, 4.6], r: [Math.PI / 2, 0, 0] });
        b.add(new THREE.TorusGeometry(0.62, 0.08, 8, 20), ORANGE, { p: [0.72, -0.05, 5.68] });
        b.add(new THREE.CircleGeometry(0.46, 18), 0xffa04a, { p: [0.72, -0.05, 5.3] }, 1.6);
        return b.build();
    },
    powerCore() {
        const b = new GeoBuilder();
        b.add(new THREE.CylinderGeometry(0.42, 0.55, 0.35, 12), GRAY, { p: [0, 1.32, 1.4] });
        b.add(new THREE.TorusGeometry(0.58, 0.11, 10, 24), ORANGE, { p: [0, 2.08, 1.4] });
        b.add(new THREE.TorusGeometry(0.58, 0.11, 10, 24), ORANGE, { p: [0, 2.08, 1.4], r: [0, Math.PI / 2, 0] });
        b.add(new THREE.SphereGeometry(0.4, 18, 14), CYAN, { p: [0, 2.08, 1.4] }, 1.6);
        return b.build();
    },
};

// Cache part geometries so pickups and ship share them
const _partGeo = {};
const _partCenter = {};
export function partGeometry(id) {
    if (!_partGeo[id]) {
        const g = PART_BUILDERS[id]();
        g.computeBoundingBox();
        const c = new THREE.Vector3();
        g.boundingBox.getCenter(c);
        _partGeo[id] = g;
        _partCenter[id] = c;
    }
    return _partGeo[id];
}
export function partCenter(id) {
    partGeometry(id);
    return _partCenter[id];
}

// A standalone, centered model of a part (for pickups / flying pieces)
export function buildPartModel(id, scale = 1) {
    const g = partGeometry(id).clone();
    const c = partCenter(id);
    g.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE.Mesh(g, vcMat());
    mesh.castShadow = true;
    addOutline(mesh, 0x2a1424, 0.004);
    const group = new THREE.Group();
    group.add(mesh);
    group.scale.setScalar(scale);
    if (id === 'powerCore') {
        const glow = glowSprite(0x6ff0ff, 2.6, 0.9);
        glow.position.set(0, 2.08 - c.y, 1.4 - c.z);
        group.add(glow);
    }
    return group;
}

// Name decal for the ship (Lincoln's ship!)
function nameDecal() {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 128;
    const g = cv.getContext('2d');
    g.font = 'bold 84px "Russo One", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ff7a2e';
    g.fillText('LINCOLN-1', 256, 66);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
}

// ------------------------------------------------------------
// Full ship
// ------------------------------------------------------------
export function buildShip() {
    const root = new THREE.Group();
    root.name = 'ship';
    const body = new THREE.Group();
    root.add(body);

    // Fuselage
    const b = new GeoBuilder();
    const prof = [
        [0, -5.0], [0.95, -5.0], [1.2, -4.6], [1.36, -3.8], [1.4, -2.4], [1.42, -1.0],
        [1.41, 0.6], [1.41, 0.63], [1.4, 1.2], [1.4, 1.23], [1.32, 2.0], [1.12, 3.2],
        [0.88, 4.0], [0.87, 4.03], [0.46, 5.0], [0.16, 5.5], [0.0, 5.62],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const lathe = new THREE.LatheGeometry(prof, 28);
    lathe.rotateX(-Math.PI / 2);
    b.add(lathe, [WHITE, hullColor]);
    // Cockpit canopy
    b.add(new THREE.SphereGeometry(0.9, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), GLASS,
        { p: [0, 0.98, -2.5], s: [0.82, 0.78, 1.7] }, 0.12);
    b.add(new THREE.BoxGeometry(0.08, 0.06, 1.2), 0xbfe6ff, { p: [-0.32, 1.58, -2.75], r: [0.2, 0, 0] }, 0.8);
    // Right wing (always attached)
    addWing(b, 1);
    b.add(new THREE.SphereGeometry(0.16, 10, 8), 0x40ff70, { p: [5.35, -0.4, 2.7] }, 1.2);
    // Engine block + left engine (always attached)
    b.add(new THREE.CylinderGeometry(1.0, 1.15, 0.8, 20), DARK, { p: [0, -0.05, 4.75], r: [Math.PI / 2, 0, 0] });
    b.add(new THREE.CylinderGeometry(0.62, 0.44, 1.0, 18, 1, true), GRAY, { p: [-0.72, -0.05, 5.2], r: [Math.PI / 2, 0, 0] });
    b.add(new THREE.TorusGeometry(0.62, 0.08, 8, 20), ORANGE, { p: [-0.72, -0.05, 5.68] });
    b.add(new THREE.CircleGeometry(0.46, 18), 0xffa04a, { p: [-0.72, -0.05, 5.3] }, 1.6);
    // Antenna
    b.add(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), GRAY, { p: [0.5, 1.6, -0.6] });
    b.add(new THREE.SphereGeometry(0.1, 8, 6), 0xff4040, { p: [0.5, 2.22, -0.6] }, 1.5);
    // Landing legs
    for (const [x, z] of [[0, -3.0], [-1.5, 2.6], [1.5, 2.6]]) {
        b.add(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 8), GRAY, { p: [x, -1.45, z], r: [0, 0, x * 0.15] });
        b.add(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 12), DARK, { p: [x * 1.12, -2.1, z] });
    }
    const hull = new THREE.Mesh(b.build(), vcMat());
    hull.castShadow = true;
    hull.receiveShadow = true;
    addOutline(hull, 0x2a1424, 0.0035);
    body.add(hull);

    // Name decals on both sides
    const dm = nameDecal();
    for (const side of [-1, 1]) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), dm);
        d.position.set(side * 1.42, 0.25, 0.4);
        d.rotation.y = side * Math.PI / 2;
        body.add(d);
    }

    // Detachable parts
    const parts = {};
    const ghosts = {};
    const ghostMat = new THREE.MeshBasicMaterial({
        color: 0x6ff0ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
    });
    for (const id of Object.keys(PART_BUILDERS)) {
        const m = new THREE.Mesh(partGeometry(id), vcMat());
        m.castShadow = true;
        addOutline(m, 0x2a1424, 0.0035);
        body.add(m);
        parts[id] = m;
        const gm = new THREE.Mesh(partGeometry(id), ghostMat);
        gm.visible = false;
        body.add(gm);
        ghosts[id] = gm;
    }

    // Glows
    const coreGlow = glowSprite(0x6ff0ff, 3.2, 0.9);
    coreGlow.position.set(0, 2.08, 1.4);
    parts.powerCore.add(coreGlow);
    const engineGlows = [];
    const flames = [];
    for (const x of [-0.72, 0.72]) {
        const gl = glowSprite(0xffa04a, 2.4, 0.0);
        gl.position.set(x, -0.05, 5.9);
        body.add(gl);
        engineGlows.push(gl);
        // flame cone (shown during flight)
        // flame cones: base at the nozzle, tip trailing behind (+Z)
        const outerG = new THREE.ConeGeometry(0.42, 2.6, 14, 1, true);
        outerG.translate(0, 1.3, 0);
        const fl = new THREE.Mesh(
            outerG,
            new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        fl.rotation.x = Math.PI / 2;
        fl.position.set(x, -0.05, 5.7);
        fl.visible = false;
        body.add(fl);
        const innerG = new THREE.ConeGeometry(0.22, 1.6, 10, 1, true);
        innerG.translate(0, 0.8, 0);
        const inner = new THREE.Mesh(
            innerG,
            new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        fl.add(inner);
        flames.push(fl);
    }

    const api = {
        root,
        body,
        hull,
        parts,
        ghosts,
        coreGlow,
        engineGlows,
        flames,
        ghostMat,
        setPart(id, on) {
            parts[id].visible = on;
        },
        setGhost(id, on) {
            ghosts[id].visible = on;
        },
        // 0 = off, 1 = idle glow, 2 = full thrust flames
        setEngines(level, t = 0) {
            const flick = 0.85 + Math.sin(t * 40) * 0.1 + Math.sin(t * 23) * 0.05;
            engineGlows.forEach((g, k) => {
                const on = k === 0 || parts.thruster.visible;
                g.material.opacity = on ? Math.min(level, 1) * 0.9 * flick : 0;
                g.scale.setScalar(level > 1.5 ? 4.2 * flick : 2.4);
            });
            flames.forEach((f, k) => {
                const on = k === 0 || parts.thruster.visible;
                f.visible = on && level > 1.5;
                f.scale.set(1, 1 * flick * (level - 1), 1);
            });
        },
        update(t) {
            ghostMat.opacity = 0.16 + Math.sin(t * 3) * 0.08;
            coreGlow.material.opacity = 0.75 + Math.sin(t * 5) * 0.15;
        },
    };
    api.setEngines(0);
    return api;
}

// Local-space position of a part's center (for flying pieces into place)
export function partSlotWorld(ship, id, out = new THREE.Vector3()) {
    out.copy(partCenter(id));
    ship.body.localToWorld(out);
    return out;
}
