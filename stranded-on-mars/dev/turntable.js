// Turntable for the hero (not part of the game): draws Lincoln's astronaut on a plain backdrop,
// from the front, 3/4, side and back, plus his poses (walk, wave, sit, float), using the same
// sun + sky light as the space cutscenes. Used by tests/astronaut.json:
//   {"eval": "import('/stranded-on-mars/dev/turntable.js').then((m) => m.default())"}
// It covers the page with its own canvas, so take the screenshot right after.
import * as THREE from 'three';
import { createAstronaut } from '../js/models.js';
import { shared } from '../js/toon.js';

export default function turntable() {
    const W = 1280, H = 720, COLS = 4, ROWS = 2;
    let cv = document.getElementById('tt-canvas');
    if (!cv) {
        cv = document.createElement('canvas');
        cv.id = 'tt-canvas';
        Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: W + 'px', height: H + 'px', zIndex: 99999 });
        document.body.appendChild(cv);
    }
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    r.setScissorTest(true);
    const cw = W / COLS, ch = H / ROWS;
    const cam = new THREE.PerspectiveCamera(30, cw / ch, 0.1, 100);
    const views = [
        { yaw: 0, label: 'front' }, { yaw: 0.75, label: '3/4' }, { yaw: Math.PI / 2, label: 'side' }, { yaw: Math.PI, label: 'back' },
        { yaw: 0.6, pose: { walk: 1 }, t: 0.2 }, { yaw: 0.5, pose: { wave: 1 }, t: 0.35 },
        { yaw: 1.0, pose: { sit: 1 } }, { yaw: 0.4, pose: { float: 1 } },
    ];
    views.forEach((v, i) => {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(i < 4 ? 0x5a6378 : 0x4d5468);
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.5);
        sun.position.set(8, 4, 6);
        scene.add(sun, new THREE.HemisphereLight(0x8a9ad0, 0x2a1830, 0.75));
        const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: 0x3d4354 }));
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
        const a = createAstronaut();
        Object.assign(a, v.pose || {});
        a.phase = 0;
        a.animate(v.t || 0.001);
        a.root.rotation.y = v.yaw;
        scene.add(a.root);
        const sitDrop = v.pose && v.pose.sit ? 0.25 : 0;
        cam.position.set(0, 1.05 - sitDrop, 5.6);
        cam.lookAt(0, 0.92 - sitDrop, 0);
        cam.updateMatrixWorld();
        shared.uSunDirView.value.copy(sun.position).normalize().transformDirection(cam.matrixWorldInverse);
        const col = i % COLS, row = Math.floor(i / COLS);
        const y = H - (row + 1) * ch; // WebGL's origin is bottom-left
        r.setViewport(col * cw, y, cw, ch);
        r.setScissor(col * cw, y, cw, ch);
        r.render(scene, cam);
    });
    return 'turntable drawn';
}

// The first-person blaster + glove (the live view model, game.player.vm) from four angles:
// the player's own view, the left side, from above and from the front-left.
export function gunViews() {
    const W = 1280, H = 720;
    let cv = document.getElementById('tt-canvas');
    if (!cv) {
        cv = document.createElement('canvas');
        cv.id = 'tt-canvas';
        Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: W + 'px', height: H + 'px', zIndex: 99999 });
        document.body.appendChild(cv);
    }
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    r.setScissorTest(true);
    const vm = window.game.player.vm;
    vm.root.position.copy(vm.base);
    vm.root.rotation.set(0, 0, 0);
    vm.root.updateMatrixWorld(true);
    const c = vm.root.localToWorld(new THREE.Vector3(0, 0, -0.05));
    const cams = [
        [new THREE.Vector3(0, 0, 0), vm.root.localToWorld(new THREE.Vector3(0, 0, -0.1)), 70],
        [c.clone().add(new THREE.Vector3(-0.9, 0.05, 0)), c, 30],
        [c.clone().add(new THREE.Vector3(-0.05, 0.9, 0.2)), c, 30],
        [c.clone().add(new THREE.Vector3(-0.6, 0.25, -0.7)), c, 30],
    ];
    vm.scene.background = new THREE.Color(0x5a6378);
    cams.forEach(([pos, at, fov], i) => {
        const cam = new THREE.PerspectiveCamera(fov, (W / 2) / (H / 2), 0.01, 10);
        cam.position.copy(pos);
        cam.lookAt(at);
        cam.updateMatrixWorld();
        shared.uSunDirView.value.set(0.5, 0.8, 0.3).normalize().transformDirection(cam.matrixWorldInverse);
        vm.sun.position.copy(shared.uSunDirView.value).multiplyScalar(10);
        const col = i % 2, row = Math.floor(i / 2);
        const y = H - (row + 1) * (H / 2);
        r.setViewport(col * W / 2, y, W / 2, H / 2);
        r.setScissor(col * W / 2, y, W / 2, H / 2);
        r.render(vm.scene, cam);
    });
    vm.scene.background = null;
    return 'gun views drawn';
}
