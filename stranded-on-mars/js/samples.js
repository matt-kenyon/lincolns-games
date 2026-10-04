// ============================================================
// SAMPLES — recorded sound effects and layered music from files
//  - SampleBank loads and decodes audio/*.mp3 (MP3 decodes to the exact
//    length in Chrome and Safari, so loops are gapless)
//  - StemMusic plays a song as stems that start together and loop in sync;
//    each music mode fades its own set of layers in and the rest out
// The file lists live in sounds.js.
// ============================================================

import { SFX_FILES, MUSIC, MODES, AUDIO_V } from './sounds.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class SampleBank {
    constructor(A) {
        this.A = A;
        this.buffers = new Map();
        this.pending = new Map();
        this.failed = new Set();
    }

    load(path) {
        if (this.buffers.has(path)) return Promise.resolve(this.buffers.get(path));
        if (this.pending.has(path)) return this.pending.get(path);
        if (this.failed.has(path)) return Promise.resolve(null);
        const ctx = this.A.ctx;
        const p = fetch(new URL(`../audio/${path}.mp3?v=${AUDIO_V}`, import.meta.url))
            .then((r) => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
            })
            // callback form: older Safari has no promise version
            .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
            .then((buf) => {
                this.buffers.set(path, buf);
                return buf;
            })
            .catch((e) => {
                this.failed.add(path);
                console.warn('audio: could not load', path, e && e.message);
                return null;
            })
            .finally(() => this.pending.delete(path));
        this.pending.set(path, p);
        return p;
    }

    loadAllSfx() {
        for (const k in SFX_FILES) for (const f of SFX_FILES[k].files) this.load('sfx/' + f);
    }

    // Play a recorded effect into `out` at time t. Returns its length in seconds, or 0 if it isn't loaded.
    playSfx(name, out, t) {
        const e = SFX_FILES[name];
        if (!e) return 0;
        const bufs = e.files.map((f) => this.buffers.get('sfx/' + f)).filter(Boolean);
        if (!bufs.length) return 0;
        const A = this.A;
        const ctx = A.ctx;
        const src = ctx.createBufferSource();
        src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
        const rate = e.rate ? rnd(e.rate[0], e.rate[1]) : 1;
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        g.gain.value = e.gain ?? 1;
        src.connect(g);
        g.connect(out);
        if (e.rev) {
            const r = ctx.createGain();
            r.gain.value = e.rev;
            g.connect(r);
            r.connect(A.revSend);
        }
        const offset = e.offset || 0;
        const dur = Math.min(e.dur || Infinity, src.buffer.duration - offset);
        src.start(t, offset, dur);
        src.onended = () => g.disconnect();
        return dur / rate;
    }
}

export class StemMusic {
    constructor(A, bank) {
        this.A = A;
        this.bank = bank;
        this.mode = 'none';
        this.cur = null;
    }

    stemPaths(song) {
        const S = MUSIC[song];
        return S ? Object.values(S.stems).map((f) => 'music/' + f) : [];
    }

    preload(songs) {
        return Promise.all(songs.flatMap((s) => this.stemPaths(s).map((p) => this.bank.load(p))));
    }

    ready(song) {
        return this.stemPaths(song).every((p) => this.bank.buffers.has(p));
    }

    broken(song) {
        return this.stemPaths(song).some((p) => this.bank.failed.has(p));
    }

    setMode(mode) {
        this.mode = mode;
        const m = MODES[mode];
        if (!m) {
            this.stopSong();
            return;
        }
        if (!this.cur || this.cur.name !== m.song) {
            this.stopSong();
            if (!this.ready(m.song)) {
                if (this.broken(m.song)) return;
                // start it when it has loaded, if the game still wants it
                this.preload([m.song]).then(() => {
                    if (this.mode === mode && !this.cur && this.ready(m.song)) this.setMode(mode);
                });
                return;
            }
            this.cur = this.startSong(m.song);
        }
        this.setLayers(m.layers);
    }

    startSong(name) {
        const S = MUSIC[name];
        const ctx = this.A.ctx;
        const t = ctx.currentTime + 0.05;
        const bus = ctx.createGain();
        bus.gain.value = S.gain ?? 1;
        bus.connect(this.A.musicBus);
        const layers = {};
        for (const [layer, file] of Object.entries(S.stems)) {
            const g = ctx.createGain();
            g.gain.value = 0;
            g.connect(bus);
            const src = ctx.createBufferSource();
            src.buffer = this.bank.buffers.get('music/' + file);
            // Loops carry `pad` seconds of overlap on each side (the loop's end copied before
            // its start and vice versa), so the encoder's edges never land on the loop point
            const pad = S.pad || 0;
            if (!S.once) {
                src.loop = true;
                src.loopStart = pad;
                src.loopEnd = pad + (S.loop || src.buffer.duration - 2 * pad);
            }
            src.connect(g);
            src.start(t, pad);
            layers[layer] = { g, src, on: 0 };
        }
        return { name, bus, layers, t0: t, fadeIn: S.fadeIn ?? 0.5 };
    }

    // Fade layers in quickly and out slowly, so combat swells up and settles down
    setLayers(want) {
        const cur = this.cur;
        const now = this.A.ctx.currentTime;
        const fresh = now - cur.t0 < 0.3;
        for (const [name, L] of Object.entries(cur.layers)) {
            const v = want[name] || 0;
            if (v === L.on) continue;
            L.g.gain.cancelScheduledValues(now);
            L.g.gain.setTargetAtTime(v, Math.max(now, cur.t0), fresh ? cur.fadeIn : v > L.on ? 0.45 : 1.4);
            L.on = v;
        }
    }

    stopSong() {
        const cur = this.cur;
        if (!cur) return;
        this.cur = null;
        const now = this.A.ctx.currentTime;
        cur.bus.gain.cancelScheduledValues(now);
        cur.bus.gain.setTargetAtTime(0, now, 0.5);
        for (const L of Object.values(cur.layers)) L.src.stop(now + 3);
        setTimeout(() => cur.bus.disconnect(), 3500);
    }
}
