// ============================================================
// INPUT — keyboard + mouse (pointer lock) + gamepad
// ============================================================

const DEAD = 0.18;
const dz = (v, d = DEAD) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

export class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = new Set();
        this.pressed = new Set();
        this.mdx = 0;
        this.mdy = 0;
        this.mouseL = false;
        this.mouseR = false;
        this.mouseRPressed = false;
        this.mouseLPressed = false;
        this.locked = false;
        this.usingGamepad = false;
        this.padPrev = [];
        this.padPressed = new Set();
        this.onLockChange = null;
        this.enabled = true;

        window.addEventListener('keydown', (e) => {
            // let menu sliders/checkboxes use arrow keys and space normally
            const t = e.target;
            const inForm = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
            if (e.repeat) {
                if (!inForm && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
                return;
            }
            this.keys.add(e.code);
            this.pressed.add(e.code);
            this.usingGamepad = false;
            if (!inForm && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
        });
        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
        });
        window.addEventListener('blur', () => {
            this.keys.clear();
            this.mouseL = this.mouseR = false;
        });
        document.addEventListener('mousemove', (e) => {
            if (!this.locked) return;
            const mx = Math.max(-250, Math.min(250, e.movementX || 0));
            const my = Math.max(-250, Math.min(250, e.movementY || 0));
            this.mdx += mx;
            this.mdy += my;
            this.usingGamepad = false;
        });
        canvas.addEventListener('mousedown', (e) => {
            if (!this.locked) return;
            if (e.button === 0) { this.mouseL = true; this.mouseLPressed = true; }
            if (e.button === 2) { this.mouseR = true; this.mouseRPressed = true; }
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouseL = false;
            if (e.button === 2) this.mouseR = false;
        });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('pointerlockchange', () => {
            this.locked = document.pointerLockElement === canvas;
            if (!this.locked) { this.mouseL = false; this.mouseR = false; }
            if (this.onLockChange) this.onLockChange(this.locked);
        });
        window.addEventListener('gamepadconnected', () => {
            this.usingGamepad = true;
        });
    }

    requestLock() {
        try {
            const p = this.canvas.requestPointerLock();
            if (p && p.catch) p.catch(() => {});
        } catch (e) { /* ignore */ }
    }

    exitLock() {
        if (document.pointerLockElement) document.exitPointerLock();
    }

    wasPressed(code) {
        return this.pressed.has(code);
    }

    anyPressed(...codes) {
        return codes.some((c) => this.pressed.has(c));
    }

    padButton(i) {
        return this.pad && this.pad.buttons[i] && this.pad.buttons[i].pressed;
    }

    padWasPressed(i) {
        return this.padPressed.has(i);
    }

    // Read everything for this frame
    poll(dt) {
        const k = this.keys;
        const s = {
            moveX: 0, moveY: 0,
            lookX: this.mdx, lookY: this.mdy,   // mouse movement (pixels)
            padLookX: 0, padLookY: 0,           // controller right stick (pixel-equivalents)
            jump: this.pressed.has('Space'),
            sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
            fire: this.mouseL,
            grenade: this.mouseRPressed || this.pressed.has('KeyG') || this.pressed.has('KeyQ'),
            grenadePressed: this.mouseRPressed || this.pressed.has('KeyG') || this.pressed.has('KeyQ'),
            interact: this.pressed.has('KeyE') || this.pressed.has('KeyF'),
            pause: this.pressed.has('Escape') || this.pressed.has('KeyP'),
            confirm: this.pressed.has('Enter') || this.pressed.has('Space'),
            skip: this.pressed.has('Enter') || this.pressed.has('Escape') || this.pressed.has('Space'),
        };
        if (k.has('KeyW') || k.has('ArrowUp')) s.moveY += 1;
        if (k.has('KeyS') || k.has('ArrowDown')) s.moveY -= 1;
        if (k.has('KeyD') || k.has('ArrowRight')) s.moveX += 1;
        if (k.has('KeyA') || k.has('ArrowLeft')) s.moveX -= 1;

        // Gamepad
        this.padPressed.clear();
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let pad = null;
        for (const p of pads) if (p && p.connected) { pad = p; break; }
        this.pad = pad;
        if (pad) {
            const b = pad.buttons.map((x) => x && (x.pressed || x.value > 0.5));
            b.forEach((v, i) => { if (v && !this.padPrev[i]) this.padPressed.add(i); });
            this.padPrev = b;
            const ax = pad.axes;
            const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0);
            const rx = dz(ax[2] || 0, 0.12), ry = dz(ax[3] || 0, 0.12);
            const any = lx || ly || rx || ry || b.some(Boolean);
            if (any) this.usingGamepad = true;
            if (lx || ly) { s.moveX += lx; s.moveY -= ly; }
            const curve = (v) => Math.sign(v) * v * v;
            s.padLookX += curve(rx) * 1250 * dt;
            s.padLookY += curve(ry) * 900 * dt;
            if (this.padPressed.has(0)) { s.jump = true; s.confirm = true; }
            if (b[10] || b[11]) s.sprint = true;
            if (b[7]) s.fire = true;
            if (this.padPressed.has(6) || this.padPressed.has(4)) { s.grenade = true; s.grenadePressed = true; }
            if (this.padPressed.has(2) || this.padPressed.has(5) || this.padPressed.has(1)) s.interact = true;
            if (this.padPressed.has(9)) s.pause = true;
            if (this.padPressed.has(0) || this.padPressed.has(9)) s.skip = true;
        }
        s.moveX = Math.max(-1, Math.min(1, s.moveX));
        s.moveY = Math.max(-1, Math.min(1, s.moveY));
        return s;
    }

    endFrame() {
        this.pressed.clear();
        this.mdx = 0;
        this.mdy = 0;
        this.mouseRPressed = false;
        this.mouseLPressed = false;
    }
}
