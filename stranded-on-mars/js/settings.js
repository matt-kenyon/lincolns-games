// ============================================================
// SETTINGS — mouse/look sensitivity, invert, sound
// Saved in the browser. The same controls appear on the title
// screen (SETTINGS button) and in the pause menu, kept in sync.
// ============================================================

import { store, clamp } from './util.js';

export const SETTINGS_KEY = 'strandedOnMars.settings';

export const DEFAULT_SETTINGS = {
    volume: 0.8,
    music: 0.6,
    sensitivity: 1,        // mouse / trackpad turning speed
    lookSensitivity: 1,    // game controller right-stick turning speed
    verticalLook: 1,       // up/down speed compared to left/right
    invert: false,
    difficulty: 'normal',
};

const times = (v) => Math.round(v * 100) / 100 + 'x';
const pct = (v) => Math.round(v * 100) + '%';

const ROWS = [
    { section: 'LOOK' },
    { key: 'sensitivity', label: 'Mouse sensitivity', hint: 'How fast the mouse (or trackpad) turns you', min: 0.1, max: 3, step: 0.05, fmt: times },
    { key: 'lookSensitivity', label: 'Look sensitivity', hint: "How fast a game controller's right stick turns you", min: 0.25, max: 3, step: 0.05, fmt: times },
    { key: 'verticalLook', label: 'Up/down speed', hint: 'Looking up and down, compared to turning', min: 0.25, max: 1.5, step: 0.05, fmt: pct },
    { key: 'invert', label: 'Invert up/down', check: true },
    { section: 'SOUND' },
    { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: pct },
    { key: 'music', label: 'Music', min: 0, max: 1, step: 0.05, fmt: pct },
];

const LOOK_KEYS = ['sensitivity', 'lookSensitivity', 'verticalLook', 'invert'];

export function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS, store.get(SETTINGS_KEY, {}));
    // keep saved values sane (e.g. if storage got edited or an old range was saved)
    for (const r of ROWS) {
        if (!r.key) continue;
        if (r.check) s[r.key] = !!s[r.key];
        else {
            const v = Number(s[r.key]);
            s[r.key] = Number.isFinite(v) ? clamp(v, r.min, r.max) : DEFAULT_SETTINGS[r.key];
        }
    }
    return s;
}

export function saveSettings(s) {
    store.set(SETTINGS_KEY, s);
}

const mounted = [];

// Build the settings controls inside `container`. `onChange(key, value)` applies a change.
export function mountSettings(container, settings, onChange) {
    container.innerHTML = '';
    const inputs = {};
    for (const r of ROWS) {
        if (r.section) {
            const h = document.createElement('div');
            h.className = 'set-section';
            h.textContent = r.section;
            container.appendChild(h);
            continue;
        }
        if (r.check) {
            const lab = document.createElement('label');
            lab.className = 'set-check';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!settings[r.key];
            lab.append(cb, document.createTextNode(r.label));
            cb.addEventListener('change', () => apply(r.key, cb.checked, container));
            container.appendChild(lab);
            inputs[r.key] = { el: cb, row: r };
            continue;
        }
        const row = document.createElement('div');
        row.className = 'set-row';
        const top = document.createElement('div');
        top.className = 'set-top';
        const name = document.createElement('span');
        name.textContent = r.label;
        const out = document.createElement('output');
        top.append(name, out);
        const range = document.createElement('input');
        range.type = 'range';
        range.min = r.min;
        range.max = r.max;
        range.step = r.step;
        range.value = settings[r.key];
        range.setAttribute('aria-label', r.label);
        out.textContent = r.fmt(settings[r.key]);
        range.addEventListener('input', () => {
            const v = parseFloat(range.value);
            out.textContent = r.fmt(v);
            apply(r.key, v, container);
        });
        row.append(top, range);
        if (r.hint) {
            const hint = document.createElement('div');
            hint.className = 'set-hint';
            hint.textContent = r.hint;
            row.appendChild(hint);
        }
        container.appendChild(row);
        inputs[r.key] = { el: range, out, row: r };
    }
    const reset = document.createElement('button');
    reset.className = 'btn small ghost set-reset';
    reset.textContent = 'RESET LOOK SETTINGS';
    reset.addEventListener('click', () => {
        for (const k of LOOK_KEYS) apply(k, DEFAULT_SETTINGS[k], null);
    });
    container.appendChild(reset);

    const inst = { container, inputs };
    mounted.push(inst);

    function apply(key, value, source) {
        settings[key] = value;
        saveSettings(settings);
        onChange && onChange(key, value);
        // keep every copy of the controls showing the same values
        for (const m of mounted) {
            if (m.container === source) continue;
            const i = m.inputs[key];
            if (!i) continue;
            if (i.row.check) i.el.checked = !!value;
            else {
                i.el.value = value;
                i.out.textContent = i.row.fmt(value);
            }
        }
    }
    return inst;
}
