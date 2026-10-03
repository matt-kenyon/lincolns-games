// ============================================================
// HUD — hearts, shield, compass, minimap, ship parts, prompts
// ============================================================

import { PART_ORDER } from './layout.js';
import { PART_INFO } from './ship.js';
import { wrapAngle } from './util.js';

const $ = (id) => document.getElementById(id);

const HEART_PATH = 'M16 28.5C6.5 21 1.5 15.5 1.5 9.6 1.5 5.2 4.9 2 9 2c3 0 5.3 1.7 7 4.2C17.7 3.7 20 2 23 2c4.1 0 7.5 3.2 7.5 7.6 0 5.9-5 11.4-14.5 18.9z';

export const PART_ICONS = {
    tailFin: `<svg viewBox="0 0 40 40"><path d="M8 34 L20 6 L32 6 L31 34 Z" fill="#ff8a3d" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M17.5 12 L20 6 L32 6 L31.8 12 Z" fill="#fff"/></svg>`,
    wing: `<svg viewBox="0 0 40 40"><path d="M4 14 L30 22 L36 30 L4 32 Z" fill="#f6f2ea" stroke="#ff8a3d" stroke-width="2.5" stroke-linejoin="round"/><path d="M27 21 L30 22 L36 30 L28 30.5 Z" fill="#ff8a3d"/></svg>`,
    fuelTank: `<svg viewBox="0 0 40 40"><rect x="5" y="12" width="30" height="16" rx="8" fill="#ff5b5b" stroke="#fff" stroke-width="2.5"/><rect x="14" y="12" width="4" height="16" fill="#fff"/><rect x="24" y="12" width="4" height="16" fill="#fff"/></svg>`,
    thruster: `<svg viewBox="0 0 40 40"><path d="M10 10 L30 10 L35 32 L5 32 Z" fill="#b8c2cc" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="20" cy="32" rx="12" ry="3.5" fill="#ffa04a"/><rect x="11" y="16" width="18" height="3" fill="#ff8a3d"/></svg>`,
    powerCore: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="none" stroke="#ff8a3d" stroke-width="3.5"/><circle cx="20" cy="20" r="8.5" fill="#6ff0ff" stroke="#fff" stroke-width="2"/><circle cx="17" cy="17" r="2.5" fill="#fff"/></svg>`,
};

export const CONTROLS_HTML = `
    <div class="keys"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span></div><div>Move</div>
    <div class="keys"><span class="key">🖱</span></div><div>Look around</div>
    <div class="keys"><span class="key">CLICK</span></div><div>Shoot blaster (hold for rapid fire)</div>
    <div class="keys"><span class="key">RIGHT CLICK</span> / <span class="key">G</span></div><div>Throw a sticky plasma grenade</div>
    <div class="keys"><span class="key">SPACE</span></div><div>Jump (Mars gravity = huge jumps!)</div>
    <div class="keys"><span class="key">SHIFT</span></div><div>Sprint</div>
    <div class="keys"><span class="key">E</span></div><div>Pick up / use</div>
    <div class="keys"><span class="key">ESC</span></div><div>Pause + settings (mouse sensitivity)</div>
    <div class="keys"><span class="key">M</span></div><div>Mute sound</div>
    <div class="keys"><span class="key">🎮</span></div><div>Game controller works too!</div>
`;

export class HUD {
    constructor(game) {
        this.game = game;
        this.el = $('hud');
        this.hearts = $('hearts');
        this.shieldFill = $('shield-fill');
        this.shieldEl = $('shield');
        this.heatFill = $('heat-fill');
        this.heatEl = $('heat');
        this.heatLabel = $('heat-label');
        this.grenEl = $('grenades');
        this.cross = $('crosshair');
        this.hitEl = $('hitmarker');
        this.promptEl = $('prompt');
        this.toastsEl = $('toasts');
        this.objEl = $('objective');
        this.bossEl = $('boss');
        this.bossName = this.bossEl.querySelector('.boss-name');
        this.bossShield = $('boss-shield');
        this.bossHealth = $('boss-health');
        this.dmgEl = $('damage');
        this.shieldHitEl = $('shieldhit');
        this.lowEl = $('lowhp');
        this.partSlots = $('part-slots');
        this.partsCount = $('parts-count');
        this.compassStrip = $('compass-strip');
        this.mm = $('minimap');
        this.mmN = null;
        this._last = {};

        // ship part slots
        this.partSlots.innerHTML = PART_ORDER.map((id) => `<div class="slot" id="slot-${id}" title="${PART_INFO[id].name}">${PART_ICONS[id]}</div>`).join('');

        // hidden SVG defs for half hearts
        const defs = document.createElement('div');
        defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        defs.innerHTML = `<svg><defs><linearGradient id="halfheart"><stop offset="50%" stop-color="#ff4d5e"/><stop offset="50%" stop-color="rgba(40,12,22,0.65)"/></linearGradient></defs></svg>`;
        document.body.appendChild(defs);

        // compass marks
        this.compassMarks = [];
        const cards = [['N', 0], ['NE', -Math.PI / 4], ['E', -Math.PI / 2], ['SE', -Math.PI * 0.75], ['S', Math.PI], ['SW', Math.PI * 0.75], ['W', Math.PI / 2], ['NW', Math.PI / 4]];
        for (const [label, yaw] of cards) {
            const d = document.createElement('div');
            d.className = 'cmp' + (label.length > 1 ? ' minor' : '');
            d.textContent = label;
            this.compassStrip.appendChild(d);
            this.compassMarks.push({ el: d, yaw, world: false });
        }
        this.objMarkers = {};

        // minimap N marker
        const n = document.createElement('div');
        n.id = 'minimap-n';
        n.textContent = 'N';
        $('minimap-wrap').appendChild(n);
        this.mmN = n;

        // damage direction indicator
        const dd = document.createElement('div');
        dd.style.cssText = 'position:absolute;left:50%;top:50%;width:240px;height:240px;margin:-120px 0 0 -120px;pointer-events:none;opacity:0;transition:opacity .5s';
        dd.innerHTML = '<div style="position:absolute;left:50%;top:-6px;width:80px;height:24px;margin-left:-40px;border-radius:50% 50% 0 0;border-top:6px solid rgba(255,70,50,.9);filter:drop-shadow(0 0 6px rgba(255,60,40,.8))"></div>';
        this.el.appendChild(dd);
        this.dirEl = dd;

        document.querySelectorAll('#controls-grid-1, #controls-grid-2').forEach((e) => (e.innerHTML = CONTROLS_HTML));
    }

    show(on = true) {
        this.el.classList.toggle('hidden', !on);
        document.getElementById('vignette').classList.toggle('hidden', false);
    }

    // ---------- Minimap (the world draws its own top-down picture) ----------
    buildMinimap() {
        this.map = this.game.world.mapImage();
        this.mmCtx = this.mm.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.mm.width = 172 * dpr;
        this.mm.height = 172 * dpr;
        this.mmDpr = dpr;
    }

    drawMinimap() {
        const map = this.map;
        if (!map) return;
        const g = this.game;
        const ctx = this.mmCtx;
        const S = this.mm.width;
        const P = g.player;
        const range = map.range || 75; // meters shown from center to edge
        const ppm = (S / 2) / range;
        ctx.save();
        ctx.clearRect(0, 0, S, S);
        ctx.fillStyle = map.bg;
        ctx.fillRect(0, 0, S, S);
        ctx.translate(S / 2, S / 2);
        ctx.rotate(P.yaw);
        ctx.scale(ppm, ppm);
        ctx.translate(-P.pos.x, -P.pos.z);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(map.canvas, map.x0, map.z0, map.canvas.width / map.scale, map.canvas.height / map.scale);

        // force fields
        ctx.lineCap = 'round';
        for (const gt of g.world.gates) {
            if (gt.open) continue;
            ctx.strokeStyle = '#d77aff';
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(gt.ax, gt.az);
            ctx.lineTo(gt.bx, gt.bz);
            ctx.stroke();
        }
        const icon = (x, z, r, fill, stroke = '#fff') => {
            ctx.beginPath();
            ctx.arc(x, z, r, 0, Math.PI * 2);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.lineWidth = r * 0.35;
            ctx.strokeStyle = stroke;
            ctx.stroke();
        };
        // aliens that have spotted you
        for (const a of g.aliens.list) {
            if (a.dead || a.dormant || !a.root.visible) continue;
            if (a.state === 'combat' || a.state === 'alert') icon(a.pos.x, a.pos.z, 2.2, '#ff4d5e');
        }
        // ship parts, the ship, the escape pod...
        g.level.drawMapIcons(icon);
        ctx.restore();

        // player arrow (always pointing up)
        ctx.save();
        ctx.translate(S / 2, S / 2);
        ctx.fillStyle = '#6ff0ff';
        ctx.strokeStyle = '#1b0f14';
        ctx.lineWidth = 2 * this.mmDpr;
        ctx.beginPath();
        const a = 9 * this.mmDpr;
        ctx.moveTo(0, -a);
        ctx.lineTo(a * 0.7, a * 0.75);
        ctx.lineTo(0, a * 0.35);
        ctx.lineTo(-a * 0.7, a * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // N marker on the rim
        const R = 72;
        this.mmN.style.transform = `translate(${Math.sin(P.yaw) * R}px, ${-Math.cos(P.yaw) * R}px)`;
    }

    // ---------- Compass ----------
    setCompassMarker(key, x, z, color, label) {
        let m = this.objMarkers[key];
        if (!m) {
            const el = document.createElement('div');
            el.className = 'cmp marker';
            el.innerHTML = `<span class="ico"></span><span class="dist"></span>`;
            this.compassStrip.appendChild(el);
            m = { el, ico: el.firstChild, dist: el.lastChild };
            this.objMarkers[key] = m;
        }
        m.x = x;
        m.z = z;
        m.ico.style.background = color;
        m.ico.style.color = color;
        m.label = label;
        m.active = true;
    }

    clearCompassMarker(key) {
        const m = this.objMarkers[key];
        if (m) { m.active = false; m.el.style.display = 'none'; }
    }

    drawCompass() {
        const P = this.game.player;
        const W = this.compassStrip.clientWidth || 500;
        const half = (Math.PI * 0.75);
        const place = (el, yaw) => {
            const rel = wrapAngle(yaw - P.yaw);
            if (Math.abs(rel) > half) { el.style.display = 'none'; return; }
            el.style.display = '';
            const x = W / 2 - (rel / half) * (W / 2);
            el.style.left = x.toFixed(1) + 'px';
            el.style.opacity = (1 - Math.pow(Math.abs(rel) / half, 3)).toFixed(2);
        };
        for (const c of this.compassMarks) place(c.el, c.yaw);
        for (const m of Object.values(this.objMarkers)) {
            if (!m.active) continue;
            const dx = m.x - P.pos.x, dz = m.z - P.pos.z;
            place(m.el, Math.atan2(-dx, -dz));
            const d = Math.round(Math.hypot(dx, dz));
            if (m._d !== d) { m.dist.textContent = d + 'm'; m._d = d; }
        }
    }

    // ---------- Updates ----------
    update(dt) {
        const g = this.game;
        const P = g.player;
        const L = this._last;

        // hearts
        const hk = P.health + '/' + P.maxHealth;
        if (L.hearts !== hk) {
            L.hearts = hk;
            let html = '';
            for (let i = 0; i < P.maxHealth / 2; i++) {
                const v = P.health - i * 2;
                const fill = v >= 2 ? '#ff4d5e' : v === 1 ? 'url(#halfheart)' : 'rgba(40,12,22,0.65)';
                html += `<svg viewBox="0 0 32 30"><path d="${HEART_PATH}" fill="${fill}" stroke="#fff4e0" stroke-width="2.2"/>` +
                    (v >= 1 ? `<ellipse cx="9.5" cy="9" rx="3" ry="2.2" fill="rgba(255,255,255,0.6)"/>` : '') + `</svg>`;
            }
            this.hearts.innerHTML = html;
        }
        const sh = P.maxShield ? P.shield / P.maxShield : 0;
        this.shieldFill.style.width = (sh * 100).toFixed(1) + '%';
        this.shieldEl.classList.toggle('down', P.shield <= 0.01);
        const low = P.health <= 2 && !P.dead;
        if (L.low !== low) { L.low = low; this.lowEl.classList.toggle('on', low); }

        // heat
        this.heatFill.style.width = (P.heat * 100).toFixed(1) + '%';
        if (L.over !== P.overheated) {
            L.over = P.overheated;
            this.heatEl.classList.toggle('over', P.overheated);
            this.heatLabel.textContent = P.overheated ? 'OVERHEATED!' : '';
        }
        this.cross.classList.toggle('hot', P.heat > 0.7 && !P.overheated);

        // grenades
        const gk = P.grenades;
        if (L.gren !== gk) {
            L.gren = gk;
            let html = '<span style="margin-right:4px">GRENADES</span>';
            for (let i = 0; i < 4; i++) html += `<span class="gren${i < gk ? '' : ' empty'}"></span>`;
            this.grenEl.innerHTML = html;
        }

        // crosshair on target
        const cam = g.camera;
        const fwd = P.forward;
        const tgt = g.aliens.aimTarget(cam.position, fwd, 0.035, 120);
        this.cross.classList.toggle('target', !!tgt);

        // boss
        const boss = g.level.bossInfo();
        const showBoss = !!boss;
        if (L.boss !== showBoss) { L.boss = showBoss; this.bossEl.classList.toggle('hidden', !showBoss); }
        if (showBoss) {
            if (L.bossName !== boss.name) {
                L.bossName = boss.name;
                this.bossName.textContent = boss.name;
                this.bossShield.parentNode.classList.toggle('hidden', !boss.maxShield);
            }
            if (boss.maxShield) this.bossShield.style.width = ((boss.shield / boss.maxShield) * 100).toFixed(1) + '%';
            this.bossHealth.style.width = ((Math.max(0, boss.hp) / boss.maxHp) * 100).toFixed(1) + '%';
            this.bossEl.classList.toggle('rage', !!boss.rage);
        }

        this.drawCompass();
        this.mmT = (this.mmT || 0) - dt;
        if (this.mmT <= 0) {
            this.mmT = 1 / 30;
            this.drawMinimap();
        }
        if (this.dirT > 0) {
            this.dirT -= dt;
            if (this.dirT <= 0) this.dirEl.style.opacity = '0';
        }
    }

    // The ship-parts tracker only matters on Mars
    showParts(on) {
        $('parts').classList.toggle('hidden', !on);
    }

    clearCompassMarkers() {
        for (const key of Object.keys(this.objMarkers)) this.clearCompassMarker(key);
    }

    setParts(have, installed) {
        let n = 0;
        for (const id of PART_ORDER) {
            const el = document.getElementById('slot-' + id);
            el.classList.toggle('have', !!have[id]);
            el.classList.toggle('installed', !!installed[id]);
            if (have[id]) n++;
        }
        this.partsCount.textContent = `${n}/5`;
    }

    popSlot(id) {
        const el = document.getElementById('slot-' + id);
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
    }

    objective(text, flash = true) {
        if (this._obj === text) return;
        this._obj = text;
        this.objEl.innerHTML = text ? `<span class="obj-tag">MISSION</span>${text}` : '';
        if (flash && text) {
            this.objEl.classList.remove('flash');
            void this.objEl.offsetWidth;
            this.objEl.classList.add('flash');
        }
    }

    prompt(key, text) {
        const html = key ? `<span class="key">${key}</span>${text}` : text;
        if (this._prompt !== html) {
            this._prompt = html;
            this.promptEl.innerHTML = html;
        }
        this.promptEl.classList.remove('hidden');
    }

    hidePrompt() {
        this.promptEl.classList.add('hidden');
    }

    toast(text, life = 2.6) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.style.setProperty('--life', life + 's');
        t.textContent = text;
        this.toastsEl.appendChild(t);
        while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
        setTimeout(() => t.remove(), (life + 0.6) * 1000);
    }

    announce(small, big) {
        const a = $('announce');
        a.querySelector('.a-small').textContent = small;
        a.querySelector('.a-big').textContent = big;
        a.classList.remove('show');
        void a.offsetWidth;
        a.classList.add('show');
    }

    zoneBanner(name, small = 'ENTERING') {
        const z = $('zone-banner');
        z.querySelector('.zb-small').textContent = small;
        z.querySelector('.zb-big').textContent = name;
        z.classList.remove('show');
        void z.offsetWidth;
        z.classList.add('show');
    }

    hitMarker(kill) {
        this.hitEl.classList.toggle('kill', !!kill);
        this.hitEl.classList.remove('show');
        void this.hitEl.offsetWidth;
        this.hitEl.classList.add('show');
    }

    damage() {
        this.dmgEl.style.transition = 'none';
        this.dmgEl.style.opacity = '1';
        void this.dmgEl.offsetWidth;
        this.dmgEl.style.transition = 'opacity 0.6s';
        this.dmgEl.style.opacity = '0';
        this.hearts.classList.remove('hurt');
        void this.hearts.offsetWidth;
        this.hearts.classList.add('hurt');
    }

    shieldHit() {
        this.shieldHitEl.style.transition = 'none';
        this.shieldHitEl.style.opacity = '1';
        void this.shieldHitEl.offsetWidth;
        this.shieldHitEl.style.transition = 'opacity 0.4s';
        this.shieldHitEl.style.opacity = '0';
    }

    // Show which direction the shot came from
    damageFrom(vel, yaw) {
        // the shot traveled along vel, so it came from -vel
        const ang = Math.atan2(vel.x, vel.z); // yaw of the source direction (camera convention)
        const rel = wrapAngle(ang - yaw);
        this.dirEl.style.transform = `rotate(${-rel}rad)`;
        this.dirEl.style.transition = 'none';
        this.dirEl.style.opacity = '1';
        void this.dirEl.offsetWidth;
        this.dirEl.style.transition = 'opacity 0.8s';
        this.dirT = 0.25;
    }
}
