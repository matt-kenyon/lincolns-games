// ============================================================
// SAMPLES — recorded sound effects and layered music from files
//  - SampleBank loads and decodes audio/*.mp3 (MP3 decodes to the exact
//    length in Chrome and Safari, so loops are gapless)
//  - StemMusic plays a song as stems that start together and loop in sync,
//    and fades layers in and out as the music mode changes
// The file lists live in sounds.js.
// ============================================================

import { SFX_FILES, LOOP_FILES, MUSIC, AUDIO_V } from './sounds.js';

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
        const all = [];
        for (const list of [SFX_FILES, LOOP_FILES]) for (const k in list) for (const f of list[k].files) all.push(this.load('sfx/' + f));
        return Promise.all(all);
    }

    loopReady(name) {
        const e = LOOP_FILES[name];
        return !!e && e.files.every((f) => this.buffers.has('sfx/' + f));
    }

    // Start looping file `i` of a LOOP_FILES sound into `out`, silent; the caller fades `g` up to `gain`
    loop(name, out, i = 0) {
        const e = LOOP_FILES[name];
        const buf = e && this.buffers.get('sfx/' + e.files[i]);
        if (!buf) return null;
        const ctx = this.A.ctx;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g);
        g.connect(out);
        src.start();
        return { src, g, gain: e.gain ?? 1 };
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
        this.def = null;
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

    // def: { song, layers: { layer: gain } } from a music set, or null for silence
    play(def) {
        this.def = def;
        if (!def) {
            this.stopSong();
            return;
        }
        if (!this.cur || this.cur.name !== def.song) {
            this.stopSong();
            if (!this.ready(def.song)) {
                if (this.broken(def.song)) return;
                // start it when it has loaded, if the game still wants it
                this.preload([def.song]).then(() => {
                    if (this.def === def && !this.cur && this.ready(def.song)) this.play(def);
                });
                return;
            }
            this.cur = this.startSong(def.song);
        }
        this.setLayers(def.layers);
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
            // its start and vice versa), so the encoder's edges never land on the loop point.
            // A song with an intro has the intro there instead, and plays it once.
            const head = S.intro || S.pad || 0;
            if (!S.once) {
                src.loop = true;
                src.loopStart = head;
                src.loopEnd = head + (S.loop || src.buffer.duration - head - (S.pad || 0));
            }
            src.connect(g);
            src.start(t, S.intro || S.once ? 0 : head);
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

    // Free decoded songs that aren't in `keep` (decoded audio takes a lot of memory)
    release(keep) {
        const wanted = new Set(keep.flatMap((s) => this.stemPaths(s)));
        if (this.cur) for (const p of this.stemPaths(this.cur.name)) wanted.add(p);
        for (const p of [...this.bank.buffers.keys()]) if (p.startsWith('music/') && !wanted.has(p)) this.bank.buffers.delete(p);
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
