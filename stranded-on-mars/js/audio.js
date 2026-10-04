// ============================================================
// AUDIO — sound effects (with simple 3D panning), loops and music
//  - recorded effects and layered music come from files (samples.js,
//    listed in sounds.js); anything without a file is synthesized here
//  - the "classic" synthesized music is kept below (class Music):
//    gentle piano while exploring (Breath of the Wild vibes), drums + bass
//    when aliens attack, a boss mix, and an ending theme. The Classic music
//    setting switches back to it.
// ============================================================

import { SampleBank, StemMusic } from './samples.js';
import { SFX_FILES, MODES, PRELOAD } from './sounds.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.volume = 0.8;
        this.musicVolume = 0.6;
        this.last = {};
        this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
        this.mode = 'none';
        this.classicMusic = false;
        this.classicSfx = false;   // play only the synthesized effects (used by dev/soundboard.html)
        this.stageKey = 'mars';
    }

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = (this.ctx = new AC());
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 8;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        this.master.connect(comp);
        comp.connect(ctx.destination);

        this.sfx = ctx.createGain();
        this.sfx.gain.value = 0.9;
        this.sfx.connect(this.master);
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = this.musicVolume * 0.85;
        this.musicBus.connect(this.master);
        this.amb = ctx.createGain();
        this.amb.gain.value = 0;
        this.amb.connect(this.master);
        // Mars wind or the mothership's engine hum
        this.windBus = ctx.createGain();
        this.windBus.connect(this.amb);
        this.humBus = ctx.createGain();
        this.humBus.gain.value = 0;
        this.humBus.connect(this.amb);

        // reverb
        this.reverb = ctx.createConvolver();
        this.reverb.buffer = this.makeImpulse(2.6, 2.2);
        this.revOut = ctx.createGain();
        this.revOut.gain.value = 0.42;
        this.reverb.connect(this.revOut);
        this.revOut.connect(this.master);
        this.revSend = ctx.createGain();
        this.revSend.gain.value = 1;
        this.revSend.connect(this.reverb);

        // noise
        const len = ctx.sampleRate * 2;
        this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

        this.startWind();
        this.startHum();
        this.setAmbience(this.ambience || 'wind');
        this.music = new Music(this);
        this.bank = new SampleBank(this);
        this.stems = new StemMusic(this, this.bank);
        this.bank.loadAllSfx();
        this.preloadStage(this.stageKey);
        if (this.pendingMode) this.setMusic(this.pendingMode);
    }

    makeImpulse(seconds, decay) {
        const ctx = this.ctx;
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
        return buf;
    }

    setVolume(v) {
        this.volume = v;
        if (this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }

    setMusicVolume(v) {
        this.musicVolume = v;
        if (this.musicBus) this.musicBus.gain.setTargetAtTime(v * 0.85, this.ctx.currentTime, 0.1);
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
        if (this.muted && window.speechSynthesis) window.speechSynthesis.cancel();
        return this.muted;
    }

    setListener(pos, yaw) {
        this.listener.x = pos.x;
        this.listener.y = pos.y;
        this.listener.z = pos.z;
        this.listener.yaw = yaw;
    }

    setAmbient(level) {
        if (this.amb) this.amb.gain.setTargetAtTime(level, this.ctx.currentTime, 0.8);
    }

    // 'wind' on Mars, 'ship' inside the mothership
    setAmbience(kind) {
        this.ambience = kind;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.windBus.gain.setTargetAtTime(kind === 'ship' ? 0 : 1, t, 0.8);
        this.humBus.gain.setTargetAtTime(kind === 'ship' ? 1 : 0, t, 0.8);
    }

    setMusic(mode) {
        if (!this.ctx) { this.pendingMode = mode; return; }
        if (this.mode === mode) return;
        this.mode = mode;
        this.applyMusic();
    }

    // New layered music when there is a song for this mode, otherwise the classic synth music
    applyMusic() {
        const mode = this.mode;
        const stems = !this.classicMusic && (mode === 'none' || !!MODES[mode]);
        this.stems.setMode(stems ? mode : 'none');
        this.music.setMode(stems ? 'none' : mode);
    }

    setClassicMusic(on) {
        this.classicMusic = !!on;
        if (this.ctx) this.applyMusic();
    }

    // Load a stage's songs ahead of time ('mars' or 'ship')
    preloadStage(key) {
        this.stageKey = key;
        if (this.stems) this.stems.preload(PRELOAD[key] || []);
    }

    // ---------- building blocks ----------
    osc(out, o) {
        const ctx = this.ctx;
        const t = o.t;
        const dur = o.dur;
        const osc = ctx.createOscillator();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(o.f, t);
        if (o.f2) {
            if (o.lin) osc.frequency.linearRampToValueAtTime(o.f2, t + dur);
            else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + (o.glide || dur));
        }
        if (o.detune) osc.detune.value = o.detune;
        const g = ctx.createGain();
        const a = o.a || 0.004;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(o.vol, t + a);
        if (o.hold) g.gain.setValueAtTime(o.vol, t + a + o.hold);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        let node = osc;
        if (o.lp) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = o.lp;
            f.Q.value = o.q || 0.7;
            osc.connect(f);
            node = f;
        }
        node.connect(g);
        g.connect(out);
        if (o.rev) g.connect(this.revSend);
        if (o.vib) {
            const l = ctx.createOscillator();
            const lg = ctx.createGain();
            l.frequency.value = o.vib[0];
            lg.gain.value = o.vib[1];
            l.connect(lg);
            lg.connect(osc.frequency);
            l.start(t);
            l.stop(t + dur + 0.05);
        }
        osc.start(t);
        osc.stop(t + dur + 0.05);
        return g;
    }

    noise(out, o) {
        const ctx = this.ctx;
        const t = o.t;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = o.type || 'bandpass';
        f.frequency.setValueAtTime(o.f || 1000, t);
        if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
        f.Q.value = o.q || 1;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(o.vol, t + (o.a || 0.003));
        if (o.hold) g.gain.setValueAtTime(o.vol, t + (o.a || 0.003) + o.hold);
        g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
        src.connect(f);
        f.connect(g);
        g.connect(out);
        if (o.rev) g.connect(this.revSend);
        src.start(t, Math.random() * 1.2);
        src.stop(t + o.dur + 0.05);
        return g;
    }

    // Alien "voice" syllable: buzzy saw through a formant filter
    syllable(out, t, f, dur, formant, vol = 0.12) {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * (0.75 + Math.random() * 0.5), t + dur);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(formant, t);
        bp.frequency.exponentialRampToValueAtTime(formant * 0.6, t + dur);
        bp.Q.value = 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol * 3.2, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(bp);
        bp.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + dur + 0.05);
    }

    // ---------- play a named sound (optionally at a world position) ----------
    play(name, pos, opts) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const fn = SFX[name];
        if (!fn && !SFX_FILES[name]) return;
        const now = this.ctx.currentTime;
        const minGap = GAP[name] ?? 0.03;
        if (this.last[name] && now - this.last[name] < minGap) return;
        this.last[name] = now;
        let out = this.sfx;
        let pan = null;
        if (pos) {
            const L = this.listener;
            const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const att = 1 / (1 + Math.pow(dist / 14, 1.6));
            if (att < 0.02) return;
            // angle relative to where the listener faces
            const ang = Math.atan2(-dx, -dz) - L.yaw;
            const side = Math.max(-0.85, Math.min(0.85, -Math.sin(ang)));
            const g = this.ctx.createGain();
            g.gain.value = att;
            const p = this.ctx.createStereoPanner();
            p.pan.value = side;
            g.connect(p);
            p.connect(this.sfx);
            out = g;
            pan = p;
        }
        const dur = this.classicSfx ? 0 : this.bank.playSfx(name, out, now + 0.005);
        if (!dur && fn) fn(this, out, now + 0.005, opts);
        if (pan) setTimeout(() => { out.disconnect(); pan.disconnect(); }, Math.max(4, dur + 1) * 1000);
    }

    // ---------- loops ----------
    startWind() {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 420;
        bp.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.value = 0.11;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lg = ctx.createGain();
        lg.gain.value = 260;
        lfo.connect(lg);
        lg.connect(bp.frequency);
        const lfo2 = ctx.createOscillator();
        lfo2.frequency.value = 0.13;
        const lg2 = ctx.createGain();
        lg2.gain.value = 0.05;
        lfo2.connect(lg2);
        lg2.connect(g.gain);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.windBus);
        src.start();
        lfo.start();
        lfo2.start();
    }

    // The mothership: a deep engine drone, hissing air vents, and a slow thump in the walls
    startHum() {
        const ctx = this.ctx;
        const out = this.humBus;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 160;
        lp.Q.value = 2;
        const g = ctx.createGain();
        g.gain.value = 0.15;
        for (const f of [41, 41.6, 82.3]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.connect(lp);
            o.start();
        }
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.11;
        const lg = ctx.createGain();
        lg.gain.value = 60;
        lfo.connect(lg);
        lg.connect(lp.frequency);
        lfo.start();
        lp.connect(g);
        g.connect(out);
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900;
        bp.Q.value = 0.4;
        const ng = ctx.createGain();
        ng.gain.value = 0.03;
        src.connect(bp);
        bp.connect(ng);
        ng.connect(out);
        src.start();
        this.humTimer = setInterval(() => {
            if (this.ambience !== 'ship' || !this.ctx || this.ctx.state !== 'running') return;
            const t = this.ctx.currentTime + 0.02;
            this.osc(out, { t, f: 52, f2: 38, dur: 0.5, vol: 0.12 });
            this.osc(out, { t: t + 0.32, f: 47, f2: 35, dur: 0.5, vol: 0.08 });
            if (Math.random() < 0.3) this.osc(out, { t: t + rnd(0.5, 1.5), type: 'triangle', f: rnd(900, 1500), f2: rnd(400, 800), dur: 0.5, vol: 0.012, rev: true });
        }, 2400);
    }

    // Tractor beam: a wobbly hum that rises as it reels you in
    tractor(on) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        if (on && !this.tb) {
            const t = ctx.currentTime;
            const o = ctx.createOscillator();
            o.frequency.value = 90;
            const o2 = ctx.createOscillator();
            o2.type = 'triangle';
            o2.frequency.value = 181;
            const vib = ctx.createOscillator();
            vib.frequency.value = 5.5;
            const vg = ctx.createGain();
            vg.gain.value = 9;
            vib.connect(vg);
            vg.connect(o.frequency);
            vg.connect(o2.frequency);
            const sh = ctx.createOscillator();
            sh.frequency.value = 1240;
            const sg = ctx.createGain();
            sg.gain.value = 0.12;
            const g = ctx.createGain();
            g.gain.value = 0;
            sh.connect(sg);
            sg.connect(g);
            o.connect(g);
            o2.connect(g);
            g.connect(this.sfx);
            g.gain.setTargetAtTime(0.16, t, 0.3);
            o.frequency.setTargetAtTime(150, t, 6);
            o2.frequency.setTargetAtTime(300, t, 6);
            for (const x of [o, o2, vib, sh]) x.start();
            this.tb = { g, nodes: [o, o2, vib, sh] };
        } else if (!on && this.tb) {
            const tb = this.tb;
            this.tb = null;
            tb.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
            setTimeout(() => tb.nodes.forEach((n) => n.stop()), 1500);
        }
    }

    // Rocket engine rumble for cutscenes (level 0..1)
    engine(level) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        if (!this.eng) {
            const src = ctx.createBufferSource();
            src.buffer = this.noiseBuf;
            src.loop = true;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 300;
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = 48;
            const og = ctx.createGain();
            og.gain.value = 0.25;
            const olp = ctx.createBiquadFilter();
            olp.type = 'lowpass';
            olp.frequency.value = 160;
            const g = ctx.createGain();
            g.gain.value = 0;
            src.connect(lp);
            lp.connect(g);
            o.connect(olp);
            olp.connect(og);
            og.connect(g);
            g.connect(this.sfx);
            src.start();
            o.start();
            this.eng = { g, lp, o };
        }
        const t = ctx.currentTime;
        this.eng.g.gain.setTargetAtTime(level * 0.55, t, 0.15);
        this.eng.lp.frequency.setTargetAtTime(250 + level * 900, t, 0.2);
        this.eng.o.frequency.setTargetAtTime(40 + level * 35, t, 0.2);
    }

    alarm(on) {
        if (!this.ctx) return;
        if (on && !this.alarmTimer) {
            const ring = () => {
                const t = this.ctx.currentTime + 0.01;
                this.osc(this.sfx, { t, type: 'square', f: 880, f2: 620, dur: 0.42, vol: 0.07, a: 0.01, lp: 2400 });
            };
            ring();
            this.alarmTimer = setInterval(ring, 520);
        } else if (!on && this.alarmTimer) {
            clearInterval(this.alarmTimer);
            this.alarmTimer = null;
        }
    }

    heartbeat(on) {
        if (!this.ctx) return;
        if (on && !this.hbTimer) {
            const beat = () => {
                const t = this.ctx.currentTime + 0.01;
                this.osc(this.sfx, { t, f: 70, f2: 50, dur: 0.14, vol: 0.32 });
                this.osc(this.sfx, { t: t + 0.2, f: 62, f2: 45, dur: 0.16, vol: 0.22 });
            };
            beat();
            this.hbTimer = setInterval(beat, 950);
        } else if (!on && this.hbTimer) {
            clearInterval(this.hbTimer);
            this.hbTimer = null;
        }
    }

    // Ship computer voice (uses the browser's speech, if it has one)
    say(text) {
        if (this.muted || !window.speechSynthesis || !this.ctx) return;
        try {
            const synth = window.speechSynthesis;
            const u = new SpeechSynthesisUtterance(text);
            const voices = synth.getVoices();
            const v = voices.find((x) => /en[-_]US/i.test(x.lang) && /Google|Microsoft|Samantha|Alex/i.test(x.name)) ||
                voices.find((x) => /^en/i.test(x.lang));
            if (v) u.voice = v;
            u.rate = 0.95;
            u.pitch = 0.6;
            u.volume = Math.min(1, this.volume * 0.9);
            synth.cancel();
            synth.speak(u);
        } catch (e) { /* ignore */ }
    }

    stopSpeech() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
}

// minimum seconds between repeats of the same sound
const GAP = {
    step: 0.12, boltHit: 0.05, alienShoot: 0.04, alienHurt: 0.05, shieldZap: 0.08, bounce: 0.08, playerShieldHit: 0.06,
    teleport: 0.05, armorClank: 0.06, laserBuzz: 0.08, bossHurt: 0.06, explosion: 0.1,
};

const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------
// Sound effects
// ------------------------------------------------------------
export const SFX = {
    blaster(A, out, t) {
        const k = rnd(0.94, 1.06);
        A.osc(out, { t, type: 'square', f: 1150 * k, f2: 260 * k, dur: 0.12, vol: 0.11, lp: 3500 });
        A.osc(out, { t, type: 'sine', f: 2300 * k, f2: 800 * k, dur: 0.06, vol: 0.07 });
        A.noise(out, { t, type: 'highpass', f: 3000, dur: 0.04, vol: 0.05 });
    },
    boltHit(A, out, t) {
        A.noise(out, { t, f: 2400, dur: 0.06, vol: 0.05, q: 2 });
    },
    shieldZap(A, out, t) {
        A.osc(out, { t, type: 'sawtooth', f: 1400, f2: 500, dur: 0.1, vol: 0.05, lp: 3000 });
    },
    alienShoot(A, out, t) {
        const k = rnd(0.9, 1.1);
        A.osc(out, { t, f: 260 * k, f2: 700 * k, dur: 0.17, vol: 0.2 });
        A.osc(out, { t, type: 'triangle', f: 520 * k, f2: 1350 * k, dur: 0.12, vol: 0.06 });
    },
    bossShoot(A, out, t) {
        A.osc(out, { t, type: 'sawtooth', f: 130, f2: 360, dur: 0.26, vol: 0.16, lp: 900 });
        A.osc(out, { t, f: 260, f2: 720, dur: 0.22, vol: 0.16 });
    },
    alienHurt(A, out, t) {
        const k = rnd(0.85, 1.2);
        A.osc(out, { t, type: 'square', f: 700 * k, f2: 1300 * k, dur: 0.07, vol: 0.06, lp: 2600 });
        A.osc(out, { t: t + 0.06, type: 'square', f: 1300 * k, f2: 520 * k, dur: 0.12, vol: 0.06, lp: 2600 });
    },
    bonk(A, out, t) {
        A.osc(out, { t, type: 'triangle', f: 950, f2: 240, dur: 0.14, vol: 0.2 });
        A.noise(out, { t, f: 1600, dur: 0.04, vol: 0.12, q: 3 });
    },
    alienDie(A, out, t) {
        A.osc(out, { t, f: 1300, f2: 170, dur: 0.5, vol: 0.13, vib: [16, 70] });
    },
    poof(A, out, t) {
        A.noise(out, { t, f: 1900, f2: 380, dur: 0.42, vol: 0.28, q: 0.8 });
        A.osc(out, { t, f: 480, f2: 980, dur: 0.07, vol: 0.09 });
        A.osc(out, { t: t + 0.05, type: 'triangle', f: 1568, dur: 0.25, vol: 0.04, rev: true });
    },
    alienAlert(A, out, t) {
        const base = rnd(160, 220);
        for (let i = 0; i < 3; i++) A.syllable(out, t + i * 0.11, base * (i === 2 ? 1.3 : 1), 0.1, rnd(700, 1100), 0.16);
    },
    shieldHit(A, out, t) {
        A.osc(out, { t, f: 1900, dur: 0.15, vol: 0.07 });
        A.osc(out, { t, f: 2850, dur: 0.1, vol: 0.04 });
    },
    shieldBreak(A, out, t) {
        A.noise(out, { t, type: 'highpass', f: 2200, f2: 700, dur: 0.5, vol: 0.2 });
        A.osc(out, { t, type: 'square', f: 1400, f2: 200, dur: 0.4, vol: 0.07, lp: 3000 });
    },
    shieldUp(A, out, t) {
        A.osc(out, { t, f: 300, f2: 1200, dur: 0.6, vol: 0.06, lin: true });
    },
    explosion(A, out, t) {
        A.osc(out, { t, f: 150, f2: 32, dur: 0.95, vol: 0.55 });
        A.noise(out, { t, type: 'lowpass', f: 1400, f2: 90, dur: 1.2, vol: 0.5 });
        A.noise(out, { t, f: 3200, dur: 0.15, vol: 0.18 });
        A.osc(out, { t: t + 0.02, type: 'triangle', f: 880, f2: 1760, dur: 0.3, vol: 0.05, rev: true });
    },
    stick(A, out, t) {
        A.osc(out, { t, f: 1500, f2: 2300, dur: 0.07, vol: 0.1 });
        A.noise(out, { t, type: 'highpass', f: 4500, dur: 0.35, vol: 0.05 });
    },
    bounce(A, out, t) {
        A.osc(out, { t, type: 'triangle', f: 900, f2: 700, dur: 0.05, vol: 0.06 });
    },
    throw(A, out, t) {
        A.noise(out, { t, f: 500, f2: 1900, dur: 0.24, vol: 0.13 });
    },
    jump(A, out, t) {
        A.osc(out, { t, f: 220, f2: 390, dur: 0.15, vol: 0.06 });
        A.noise(out, { t, f: 900, dur: 0.12, vol: 0.03 });
    },
    land(A, out, t) {
        A.osc(out, { t, f: 110, f2: 45, dur: 0.17, vol: 0.18 });
        A.noise(out, { t, type: 'lowpass', f: 650, dur: 0.14, vol: 0.12 });
    },
    step(A, out, t) {
        A.noise(out, { t, f: rnd(900, 1500), dur: 0.06, vol: 0.09, q: 1.4 });
        A.noise(out, { t, type: 'lowpass', f: 420, dur: 0.05, vol: 0.07 });
    },
    playerShieldHit(A, out, t) {
        A.osc(out, { t, type: 'sawtooth', f: 520, f2: 170, dur: 0.15, vol: 0.11, lp: 2500 });
        A.noise(out, { t, type: 'highpass', f: 3000, dur: 0.09, vol: 0.07 });
    },
    shieldDown(A, out, t) {
        A.osc(out, { t, type: 'square', f: 880, dur: 0.09, vol: 0.06, lp: 2400 });
        A.osc(out, { t: t + 0.13, type: 'square', f: 660, dur: 0.13, vol: 0.06, lp: 2400 });
    },
    shieldCharge(A, out, t) {
        A.osc(out, { t, f: 280, f2: 1100, dur: 0.9, vol: 0.05, lin: true, a: 0.05 });
        A.osc(out, { t, f: 560, f2: 2200, dur: 0.9, vol: 0.015, lin: true, a: 0.05 });
    },
    playerHurt(A, out, t) {
        A.osc(out, { t, type: 'triangle', f: 260, f2: 110, dur: 0.22, vol: 0.2 });
        A.noise(out, { t, type: 'lowpass', f: 900, dur: 0.15, vol: 0.12 });
    },
    overheat(A, out, t) {
        A.noise(out, { t, type: 'highpass', f: 3500, dur: 1.1, vol: 0.1, hold: 0.4 });
        A.osc(out, { t, type: 'square', f: 1200, dur: 0.08, vol: 0.05, lp: 3000 });
        A.osc(out, { t: t + 0.12, type: 'square', f: 1200, dur: 0.08, vol: 0.05, lp: 3000 });
    },
    vented(A, out, t) {
        A.osc(out, { t, f: 1320, dur: 0.12, vol: 0.06 });
        A.osc(out, { t: t + 0.07, f: 1760, dur: 0.15, vol: 0.05 });
    },
    empty(A, out, t) {
        A.osc(out, { t, type: 'square', f: 180, dur: 0.05, vol: 0.05, lp: 1500 });
    },
    pickup(A, out, t) {
        [1047, 1319, 1568].forEach((f, i) => A.osc(out, { t: t + i * 0.07, type: 'triangle', f, dur: 0.2, vol: 0.09, rev: true }));
    },
    heart(A, out, t) {
        A.osc(out, { t, f: 880, dur: 0.15, vol: 0.1, rev: true });
        A.osc(out, { t: t + 0.09, f: 1319, dur: 0.3, vol: 0.1, rev: true });
    },
    fanfare(A, out, t) {
        // "You got a ship part!"
        [523, 659, 784, 1047].forEach((f, i) => {
            A.osc(out, { t: t + i * 0.11, type: 'triangle', f, dur: 0.22, vol: 0.12, rev: true });
            A.osc(out, { t: t + i * 0.11, type: 'square', f, dur: 0.12, vol: 0.03, lp: 2500 });
        });
        [1047, 1319, 1568, 2093].forEach((f) => A.osc(out, { t: t + 0.46, type: 'triangle', f, dur: 1.3, vol: 0.06, a: 0.02, hold: 0.3, rev: true }));
        A.noise(out, { t: t + 0.46, type: 'highpass', f: 7000, dur: 1.0, vol: 0.04, rev: true });
    },
    gateDown(A, out, t) {
        A.osc(out, { t, type: 'sawtooth', f: 620, f2: 55, dur: 1.3, vol: 0.12, lp: 1800 });
        A.noise(out, { t, type: 'highpass', f: 6000, dur: 0.9, vol: 0.06 });
        A.osc(out, { t: t + 0.9, f: 196, dur: 0.8, vol: 0.12, rev: true });
        A.osc(out, { t: t + 0.9, f: 294, dur: 0.8, vol: 0.08, rev: true });
    },
    clunk(A, out, t) {
        A.osc(out, { t, type: 'square', f: 150, f2: 85, dur: 0.14, vol: 0.14, lp: 1200 });
        A.noise(out, { t, f: 850, dur: 0.09, vol: 0.16 });
        A.osc(out, { t, f: 1250, dur: 0.4, vol: 0.04, rev: true });
    },
    uiMove(A, out, t) {
        A.osc(out, { t, type: 'triangle', f: 660, dur: 0.05, vol: 0.06 });
    },
    uiSelect(A, out, t) {
        A.osc(out, { t, type: 'triangle', f: 660, dur: 0.07, vol: 0.07 });
        A.osc(out, { t: t + 0.07, type: 'triangle', f: 990, dur: 0.12, vol: 0.07 });
    },
    eject(A, out, t) {
        A.noise(out, { t, f: 400, f2: 2200, dur: 0.55, vol: 0.28 });
        A.osc(out, { t, f: 200, f2: 70, dur: 0.3, vol: 0.25 });
    },
    chute(A, out, t) {
        A.noise(out, { t, type: 'lowpass', f: 900, dur: 0.35, vol: 0.25 });
        A.osc(out, { t, f: 170, f2: 110, dur: 0.2, vol: 0.1 });
    },
    crash(A, out, t) {
        A.osc(out, { t, f: 95, f2: 24, dur: 2.6, vol: 0.6 });
        A.noise(out, { t, type: 'lowpass', f: 1000, f2: 70, dur: 3.2, vol: 0.55 });
        A.noise(out, { t, f: 2600, dur: 0.25, vol: 0.2 });
    },
    whoosh(A, out, t) {
        A.noise(out, { t, f: 300, f2: 2600, dur: 0.5, vol: 0.18 });
        A.noise(out, { t: t + 0.45, f: 2600, f2: 300, dur: 0.6, vol: 0.12 });
    },
    sparkle(A, out, t) {
        for (let i = 0; i < 5; i++) A.osc(out, { t: t + i * 0.05, type: 'triangle', f: rnd(2000, 3500), dur: 0.15, vol: 0.03, rev: true });
    },
    powerUp(A, out, t) {
        A.osc(out, { t, type: 'sawtooth', f: 60, f2: 260, dur: 2.0, vol: 0.12, lp: 1200, a: 0.3 });
        A.osc(out, { t, f: 120, f2: 520, dur: 2.0, vol: 0.08, a: 0.3 });
        A.osc(out, { t: t + 1.9, type: 'triangle', f: 1047, dur: 0.9, vol: 0.08, rev: true });
    },
    alienCheer(A, out, t) {
        for (let i = 0; i < 5; i++) A.syllable(out, t + i * 0.1 + rnd(0, 0.05), rnd(240, 340), 0.09, rnd(900, 1400), 0.1);
    },
    boing(A, out, t) {
        A.osc(out, { t, f: 180, f2: 420, dur: 0.25, vol: 0.12, vib: [20, 30] });
    },
    typing(A, out, t) {
        A.osc(out, { t, type: 'square', f: rnd(1300, 1600), dur: 0.02, vol: 0.012, lp: 3000 });
    },

    // ---------------- level 2: the mothership ----------------
    teleport(A, out, t) {
        A.osc(out, { t, f: 300, f2: 2400, dur: 0.55, vol: 0.09, vib: [30, 60] });
        A.osc(out, { t: t + 0.05, type: 'triangle', f: 1200, f2: 3600, dur: 0.45, vol: 0.04, rev: true });
        A.noise(out, { t, type: 'highpass', f: 3000, f2: 9000, dur: 0.5, vol: 0.06 });
    },
    waveAlarm(A, out, t) {
        for (let i = 0; i < 2; i++) {
            A.osc(out, { t: t + i * 0.32, type: 'square', f: 740, dur: 0.14, vol: 0.06, lp: 2600 });
            A.osc(out, { t: t + i * 0.32 + 0.15, type: 'square', f: 988, dur: 0.14, vol: 0.06, lp: 2600 });
        }
    },
    doorSlam(A, out, t) {
        A.osc(out, { t, f: 90, f2: 35, dur: 0.6, vol: 0.45 });
        A.noise(out, { t, type: 'lowpass', f: 1200, f2: 120, dur: 0.5, vol: 0.4 });
        A.osc(out, { t: t + 0.02, type: 'triangle', f: 420, dur: 0.9, vol: 0.05, rev: true });
        A.osc(out, { t, type: 'sawtooth', f: 1400, f2: 300, dur: 0.25, vol: 0.05, lp: 3000 });
    },
    doorOpen(A, out, t) {
        A.noise(out, { t, f: 600, f2: 2400, dur: 0.6, vol: 0.14 });
        A.osc(out, { t: t + 0.4, type: 'triangle', f: 880, dur: 0.4, vol: 0.06, rev: true });
        A.osc(out, { t: t + 0.5, type: 'triangle', f: 1320, dur: 0.5, vol: 0.06, rev: true });
    },
    armorClank(A, out, t) {
        const k = rnd(0.9, 1.15);
        A.osc(out, { t, type: 'square', f: 1700 * k, f2: 1100 * k, dur: 0.07, vol: 0.05, lp: 4000 });
        A.osc(out, { t, type: 'triangle', f: 2600 * k, dur: 0.18, vol: 0.03, rev: true });
        A.noise(out, { t, type: 'highpass', f: 5000, dur: 0.04, vol: 0.05 });
    },
    bossHurt(A, out, t) {
        const k = rnd(0.9, 1.1);
        A.osc(out, { t, f: 420 * k, f2: 140 * k, dur: 0.22, vol: 0.2, vib: [22, 40] });
        A.osc(out, { t, type: 'triangle', f: 900 * k, f2: 300 * k, dur: 0.12, vol: 0.08 });
    },
    bossRoar(A, out, t) {
        A.osc(out, { t, type: 'sawtooth', f: 120, f2: 70, dur: 2.0, vol: 0.28, a: 0.08, lp: 900, vib: [7, 14], rev: true });
        A.osc(out, { t, type: 'sawtooth', f: 181, f2: 96, dur: 1.9, vol: 0.18, a: 0.1, lp: 1300, vib: [5.5, 10] });
        A.noise(out, { t, type: 'bandpass', f: 700, f2: 300, dur: 1.9, vol: 0.32, q: 1.2, a: 0.08 });
        A.noise(out, { t, type: 'lowpass', f: 300, dur: 2.2, vol: 0.3, a: 0.2 });
        for (let i = 0; i < 6; i++) A.syllable(out, t + i * 0.22, rnd(80, 110), 0.3, rnd(500, 900), 0.09);
    },
    bossSlamWarn(A, out, t) {
        A.noise(out, { t, f: 200, f2: 1600, dur: 0.8, vol: 0.14, q: 2 });
        A.osc(out, { t, f: 140, f2: 420, dur: 0.8, vol: 0.06 });
    },
    bossSlam(A, out, t) {
        A.osc(out, { t, f: 110, f2: 28, dur: 0.9, vol: 0.6 });
        A.noise(out, { t, type: 'lowpass', f: 1600, f2: 90, dur: 0.8, vol: 0.5 });
        A.noise(out, { t, f: 2400, dur: 0.12, vol: 0.2 });
        A.osc(out, { t: t + 0.05, f: 55, f2: 30, dur: 1.4, vol: 0.25 });
    },
    bossGurgle(A, out, t) {
        for (let i = 0; i < 9; i++) A.osc(out, { t: t + i * 0.07 + rnd(0, 0.03), f: rnd(180, 420), f2: rnd(500, 900), dur: 0.09, vol: 0.09 });
        A.noise(out, { t, type: 'lowpass', f: 500, dur: 0.7, vol: 0.12 });
    },
    bossSpit(A, out, t) {
        A.noise(out, { t, type: 'lowpass', f: 2200, f2: 300, dur: 0.35, vol: 0.32 });
        A.osc(out, { t, f: 600, f2: 160, dur: 0.25, vol: 0.18 });
        A.osc(out, { t: t + 0.05, f: 300, f2: 900, dur: 0.15, vol: 0.06 });
    },
    laserCharge(A, out, t) {
        A.osc(out, { t, f: 220, f2: 1500, dur: 1.25, vol: 0.08, a: 0.05, vib: [18, 30] });
        A.osc(out, { t, type: 'triangle', f: 440, f2: 3000, dur: 1.25, vol: 0.03 });
    },
    laserFire(A, out, t) {
        A.osc(out, { t, type: 'sawtooth', f: 1400, f2: 700, dur: 0.5, vol: 0.12, lp: 3500 });
        A.noise(out, { t, type: 'highpass', f: 2500, dur: 0.6, vol: 0.12 });
        A.osc(out, { t, f: 90, f2: 60, dur: 0.6, vol: 0.2 });
    },
    laserBuzz(A, out, t) {
        A.osc(out, { t, type: 'sawtooth', f: rnd(600, 760), dur: 0.12, vol: 0.05, lp: 2500 });
    },
    bossDie(A, out, t) {
        A.osc(out, { t, f: 900, f2: 70, dur: 2.8, vol: 0.2, vib: [9, 60], glide: 2.6 });
        A.osc(out, { t, type: 'sawtooth', f: 160, f2: 40, dur: 2.6, vol: 0.12, lp: 800 });
        for (let i = 0; i < 12; i++) A.osc(out, { t: t + 0.6 + i * 0.16, f: rnd(200, 500), f2: rnd(600, 1000), dur: 0.1, vol: 0.06 });
    },
    bigPoof(A, out, t) {
        A.noise(out, { t, f: 2400, f2: 200, dur: 1.2, vol: 0.45, q: 0.7 });
        A.osc(out, { t, f: 80, f2: 30, dur: 1.0, vol: 0.4 });
        [1047, 1319, 1568, 2093].forEach((f, i) => A.osc(out, { t: t + 0.15 + i * 0.06, type: 'triangle', f, dur: 0.8, vol: 0.05, rev: true }));
    },
    grrr(A, out, t) {
        // the ship's engine straining against something...
        A.osc(out, { t, type: 'sawtooth', f: 58, f2: 46, dur: 1.1, vol: 0.3, lp: 500, vib: [11, 8], a: 0.05 });
        A.osc(out, { t, type: 'square', f: 87, f2: 70, dur: 1.0, vol: 0.08, lp: 400, vib: [13, 6] });
        A.noise(out, { t, type: 'lowpass', f: 700, dur: 1.0, vol: 0.18, a: 0.05 });
    },
    lurch(A, out, t) {
        A.osc(out, { t, f: 140, f2: 40, dur: 0.6, vol: 0.4 });
        A.noise(out, { t, f: 600, f2: 2400, dur: 0.3, vol: 0.2 });
        A.osc(out, { t: t + 0.25, type: 'square', f: 220, f2: 90, dur: 0.35, vol: 0.12, lp: 1200 });
        A.osc(out, { t: t + 0.3, type: 'triangle', f: 520, dur: 0.8, vol: 0.05, rev: true });
    },
    sting(A, out, t) {
        // dun-dun-DUNNN!
        for (const n of [38, 50, 53, 56, 62]) A.osc(out, { t, type: 'sawtooth', f: NOTE(n), dur: 1.8, vol: 0.06, lp: 1800, a: 0.01, rev: true });
        A.osc(out, { t, f: 70, f2: 38, dur: 1.2, vol: 0.45 });
        A.noise(out, { t, type: 'highpass', f: 5000, dur: 1.4, vol: 0.08, rev: true });
    },
    click(A, out, t) {
        A.osc(out, { t, type: 'square', f: 2400, dur: 0.02, vol: 0.06, lp: 5000 });
        A.noise(out, { t, type: 'highpass', f: 4000, dur: 0.03, vol: 0.06 });
    },
    bigButton(A, out, t) {
        A.osc(out, { t, type: 'square', f: 300, f2: 120, dur: 0.12, vol: 0.12, lp: 1500 });
        A.noise(out, { t, f: 900, dur: 0.06, vol: 0.12 });
        A.osc(out, { t: t + 0.12, type: 'square', f: 880, dur: 0.25, vol: 0.06, lp: 2600 });
    },
    countBeep(A, out, t) {
        A.osc(out, { t, type: 'square', f: 1320, dur: 0.16, vol: 0.06, lp: 3000 });
        A.osc(out, { t, f: 2640, dur: 0.12, vol: 0.03 });
    },
    rumble(A, out, t) {
        A.noise(out, { t, type: 'lowpass', f: 220, dur: 3.0, vol: 0.5, a: 0.6, hold: 1.2 });
        A.osc(out, { t, f: 38, f2: 30, dur: 3.0, vol: 0.25, a: 0.6 });
    },
    splash(A, out, t) {
        A.noise(out, { t, type: 'lowpass', f: 2600, f2: 250, dur: 0.6, vol: 0.4 });
        A.osc(out, { t, f: 260, f2: 90, dur: 0.4, vol: 0.2 });
        for (let i = 0; i < 4; i++) A.osc(out, { t: t + 0.1 + i * 0.06, f: rnd(300, 600), f2: rnd(700, 1100), dur: 0.08, vol: 0.05 });
    },
    bossRise(A, out, t) {
        A.noise(out, { t, type: 'lowpass', f: 160, f2: 600, dur: 3.4, vol: 0.4, a: 0.5 });
        for (const n of [26, 33, 38]) A.osc(out, { t, type: 'sawtooth', f: NOTE(n), dur: 3.4, vol: 0.06, a: 1.5, lp: 600, rev: true });
    },
    eyeOpen(A, out, t) {
        A.osc(out, { t: t + 0.5, f: 200, f2: 700, dur: 0.18, vol: 0.12 });
        A.noise(out, { t: t + 0.5, type: 'highpass', f: 3000, dur: 0.2, vol: 0.05 });
    },
    titleSting(A, out, t) {
        for (const n of [50, 53, 57, 62, 65]) A.osc(out, { t: t + 0.45, type: 'square', f: NOTE(n), dur: 1.6, vol: 0.035, lp: 2200, rev: true });
        A.noise(out, { t: t + 0.45, type: 'highpass', f: 6000, f2: 3000, dur: 2.0, vol: 0.1, rev: true });
        A.osc(out, { t: t + 0.45, f: 80, f2: 40, dur: 0.8, vol: 0.4 });
    },
    podLaunch(A, out, t) {
        A.noise(out, { t, f: 300, f2: 3000, dur: 1.6, vol: 0.35, a: 0.05 });
        A.osc(out, { t, type: 'sawtooth', f: 60, f2: 160, dur: 1.6, vol: 0.2, lp: 700 });
    },
    mothershipBoom(A, out, t) {
        A.osc(out, { t, f: 70, f2: 18, dur: 4.0, vol: 0.7 });
        A.noise(out, { t, type: 'lowpass', f: 1600, f2: 60, dur: 4.5, vol: 0.7 });
        A.noise(out, { t, f: 3000, dur: 0.4, vol: 0.3 });
        for (let i = 0; i < 6; i++) A.noise(out, { t: t + 0.4 + i * 0.35, type: 'lowpass', f: 800, f2: 100, dur: 0.8, vol: 0.25 });
    },
};

// ------------------------------------------------------------
// Music
// ------------------------------------------------------------
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]; // D major pentatonic (D4..B5)
const PADS = [[50, 57, 62, 66], [43, 50, 55, 59], [47, 54, 59, 62], [45, 52, 57, 61]]; // D, G, Bm, A
const COMBAT_ROOTS = [38, 34, 36, 33]; // D, Bb, C, A (bass, MIDI)
const COMBAT_CHORDS = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]];
const SHIP_CHORDS = [[62, 65, 69, 76], [58, 62, 65, 72], [55, 58, 62, 69], [57, 61, 64, 71]]; // Dm, Bb, Gm, A
const BOSS_RIFF = [38, 38, 50, 38, 41, 38, 49, 38, 44, 38, 50, 43, 38, 44, 45, 47];

class Music {
    constructor(A) {
        this.A = A;
        const ctx = A.ctx;
        this.layers = {};
        for (const name of ['explore', 'combat', 'boss', 'intro', 'theme', 'ship', 'boss2']) {
            const g = ctx.createGain();
            g.gain.value = 0;
            g.connect(A.musicBus);
            this.layers[name] = g;
        }
        this.target = {};
        this.pianoNext = 0;
        this.phrase = [];
        this.padNext = 0;
        this.seqNext = 0;
        this.step = 0;
        this.themeStart = -1;
        this.timer = setInterval(() => this.tick(), 40);
    }

    setMode(mode) {
        const ctx = this.A.ctx;
        const t = ctx.currentTime;
        const want = {
            explore: mode === 'explore' || mode === 'title' ? 1 : 0,
            combat: mode === 'combat' ? 1.35 : 0,
            boss: mode === 'boss' ? 1.4 : 0,
            intro: mode === 'intro' ? 1 : 0,
            theme: mode === 'theme' ? 1 : 0,
            ship: mode === 'ship' ? 1 : 0,
            boss2: mode === 'boss2' ? 1.35 : 0,
        };
        for (const k in want) {
            this.layers[k].gain.cancelScheduledValues(t);
            this.layers[k].gain.setTargetAtTime(want[k], t, want[k] ? 0.6 : 1.0);
            if (want[k] && !this.target[k]) {
                if (k === 'combat' || k === 'boss') { this.seqNext = t + 0.05; this.step = 0; }
                if (k === 'theme') { this.themeStart = t + 0.2; this.themeNext = 0; }
                if (k === 'boss2') { this.b2Next = t + 0.05; this.b2Step = 0; }
                if (k === 'explore') this.pianoNext = Math.max(this.pianoNext, t + 0.3);
            }
        }
        this.target = want;
    }

    piano(t, midi, vel, out) {
        const A = this.A;
        const f = NOTE(midi);
        const parts = [[1, 1], [2, 0.32], [3, 0.11], [4.1, 0.04]];
        for (const [m, a] of parts) {
            A.osc(out, { t, f: f * m, dur: 2.4 / Math.sqrt(m), vol: vel * a, a: 0.005, rev: true });
        }
    }

    pad(t, notes, dur, out, vol = 0.03) {
        const A = this.A;
        for (const n of notes) {
            A.osc(out, { t, type: 'sawtooth', f: NOTE(n), dur, vol, a: dur * 0.35, hold: dur * 0.2, lp: 700, rev: true, detune: rnd(-8, 8) });
        }
    }

    tick() {
        const ctx = this.A.ctx;
        if (!ctx || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        const ahead = now + 0.2;
        const T = this.target;

        // ---- exploration: sparse piano + soft pads ----
        if (T.explore) {
            const out = this.layers.explore;
            while (this.pianoNext < ahead) {
                if (!this.phrase.length) {
                    // new phrase: a little random walk on the pentatonic scale
                    let i = Math.floor(rnd(2, 8));
                    const n = Math.floor(rnd(3, 7));
                    for (let k = 0; k < n; k++) {
                        this.phrase.push(PENTA[i]);
                        i = Math.max(0, Math.min(PENTA.length - 1, i + Math.floor(rnd(-2, 3))));
                    }
                    if (Math.random() < 0.6) this.piano(this.pianoNext, [38, 43, 45, 47][Math.floor(rnd(0, 4))], 0.07, out);
                }
                const note = this.phrase.shift();
                this.piano(this.pianoNext, note, rnd(0.05, 0.09), out);
                if (Math.random() < 0.18) this.piano(this.pianoNext, note - 5, 0.04, out);
                this.pianoNext += this.phrase.length ? rnd(0.28, 0.55) : rnd(1.8, 3.6);
            }
            if (this.padNext < ahead) {
                this.pad(Math.max(this.padNext, now), PADS[Math.floor(rnd(0, PADS.length))], 7, out, 0.018);
                this.padNext = Math.max(this.padNext, now) + rnd(7, 10);
            }
        }

        // ---- combat / boss: drums + bass + plucky arp ----
        if (T.combat || T.boss) {
            const boss = T.boss;
            const out = boss ? this.layers.boss : this.layers.combat;
            const bpm = boss ? 146 : 132;
            const st = 60 / bpm / 4;
            while (this.seqNext < ahead) {
                this.seqStep(this.seqNext, this.step, out, boss);
                this.seqNext += st;
                this.step++;
            }
        }

        // ---- intro tension: pulsing low drone ----
        if (T.intro) {
            const out = this.layers.intro;
            const st = 60 / 120 / 2;
            if (!this.introNext || this.introNext < now - 1) this.introNext = now + 0.05;
            while (this.introNext < ahead) {
                const k = this.introStep = (this.introStep || 0) + 1;
                this.A.osc(out, { t: this.introNext, type: 'sawtooth', f: NOTE(k % 8 < 4 ? 38 : 37), dur: st * 0.9, vol: 0.09, lp: 380 });
                if (k % 2 === 0) this.A.noise(out, { t: this.introNext, type: 'highpass', f: 7000, dur: 0.04, vol: 0.03 });
                if (k % 16 === 0) this.pad(this.introNext, [50, 53, 57], 4, out, 0.02);
                this.introNext += st;
            }
        }

        // ---- inside the mothership: eerie, glassy arpeggios ----
        if (T.ship) {
            const out = this.layers.ship;
            const st = 0.36;
            if (!this.shipNext || this.shipNext < now - 1) { this.shipNext = now + 0.05; this.shipStep = 0; }
            while (this.shipNext < ahead) {
                const k = this.shipStep++;
                const ch = SHIP_CHORDS[Math.floor(k / 8) % 4];
                const n = ch[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]] + (Math.floor(k / 32) % 2 ? 12 : 0);
                this.A.osc(out, { t: this.shipNext, type: 'triangle', f: NOTE(n), dur: 0.5, vol: 0.045, rev: true });
                this.A.osc(out, { t: this.shipNext + st * 0.5, f: NOTE(n + 12), dur: 0.3, vol: 0.01, rev: true });
                if (k % 8 === 0) this.pad(this.shipNext, [ch[0] - 12, ch[1], ch[2]], st * 8.5, out, 0.016);
                if (k % 16 === 0) this.A.osc(out, { t: this.shipNext, f: NOTE(ch[0] - 24), dur: st * 7, vol: 0.09, a: 0.4 });
                this.shipNext += st;
            }
        }

        // ---- the creature fight: fast, spooky and a little bit crazy ----
        if (T.boss2) {
            const out = this.layers.boss2;
            const st = 60 / 168 / 4;
            if (!this.b2Next || this.b2Next < now - 1) { this.b2Next = now + 0.05; this.b2Step = 0; }
            while (this.b2Next < ahead) {
                this.boss2Step(this.b2Next, this.b2Step++, out);
                this.b2Next += st;
            }
        }

        // ---- ending theme ----
        if (T.theme && this.themeStart >= 0) {
            const out = this.layers.theme;
            while (this.themeNext < THEME.length && this.themeStart + THEME[this.themeNext][0] * 0.6 < ahead) {
                const [beat, midi, len, chord] = THEME[this.themeNext];
                const t = this.themeStart + beat * 0.6;
                if (t >= now - 0.05) {
                    if (midi) {
                        this.A.osc(out, { t, type: 'triangle', f: NOTE(midi), dur: len * 0.6 + 0.3, vol: 0.13, a: 0.01, rev: true });
                        this.A.osc(out, { t, type: 'square', f: NOTE(midi), dur: len * 0.6, vol: 0.025, lp: 2200 });
                    }
                    if (chord) {
                        this.pad(t, chord, 2.6, out, 0.025);
                        this.A.osc(out, { t, f: NOTE(chord[0] - 12), dur: 1.2, vol: 0.12 });
                        this.A.osc(out, { t, f: 70, f2: 40, dur: 0.4, vol: 0.2 });
                    }
                }
                this.themeNext++;
            }
        }
    }

    boss2Step(t, step, out) {
        const A = this.A;
        const s = step % 16;
        const bar = Math.floor(step / 16) % 8;
        const shift = [0, 0, 3, 0, 5, 3, -2, 1][bar];
        // pounding drums
        if (s % 4 === 0 || s === 14) A.osc(out, { t, f: 160, f2: 40, dur: 0.15, vol: 0.34, glide: 0.09 });
        if (s === 4 || s === 12) {
            A.noise(out, { t, f: 2000, dur: 0.14, vol: 0.15, q: 0.8 });
            A.osc(out, { t, type: 'triangle', f: 230, f2: 160, dur: 0.08, vol: 0.08 });
        }
        A.noise(out, { t, type: 'highpass', f: 9000, dur: 0.025, vol: s % 2 ? 0.016 : 0.028 });
        // a creepy chromatic bass riff
        A.osc(out, { t, type: 'sawtooth', f: NOTE(BOSS_RIFF[s] + shift), dur: 0.13, vol: 0.09, lp: 700, q: 3 });
        // spooky organ stabs
        if (s === 0 || s === 6 || s === 12) {
            const root = 62 + shift;
            for (const n of [root, root + 3, root + 6, root + 9]) A.osc(out, { t, type: 'square', f: NOTE(n), dur: 0.2, vol: 0.02, lp: 2400 });
        }
        // a wild wiggly lead in the second half
        if (bar >= 4 && s % 2 === 0) {
            const lead = [74, 77, 80, 77, 81, 80, 77, 74][(s / 2) % 8] + (bar % 2 ? 12 : 0);
            A.osc(out, { t, type: 'square', f: NOTE(lead + shift), dur: 0.1, vol: 0.024, lp: 3200, vib: [7, 8] });
        }
        if (s === 0 && bar % 4 === 0) A.noise(out, { t, type: 'highpass', f: 5000, dur: 1.2, vol: 0.06, rev: true });
    }

    seqStep(t, step, out, boss) {
        const A = this.A;
        const s = step % 16;
        const bar = Math.floor(step / 16) % 4;
        // kick
        if ([0, 6, 8, 14].includes(s) || (boss && s === 11)) A.osc(out, { t, f: 150, f2: 42, dur: 0.16, vol: 0.32, glide: 0.1 });
        // snare
        if (s === 4 || s === 12) {
            A.noise(out, { t, f: 1800, dur: 0.13, vol: 0.13, q: 0.8 });
            A.osc(out, { t, type: 'triangle', f: 210, f2: 150, dur: 0.08, vol: 0.08 });
        }
        // hats
        if (s % 2 === 0) A.noise(out, { t, type: 'highpass', f: 8000, dur: 0.03, vol: s % 4 === 2 ? 0.045 : 0.025 });
        // bass
        const root = COMBAT_ROOTS[bar];
        if ([0, 2, 3, 6, 8, 10, 11, 14].includes(s)) {
            const n = s === 3 || s === 11 ? root + 12 : root;
            A.osc(out, { t, type: 'sawtooth', f: NOTE(n), dur: 0.16, vol: 0.09, lp: 520, q: 2 });
        }
        // plucky arpeggio
        if (s % 2 === 0) {
            const ch = COMBAT_CHORDS[bar];
            const n = ch[(s / 2) % 3] + (s >= 8 ? 12 : 0);
            A.osc(out, { t, type: 'square', f: NOTE(n), dur: 0.12, vol: 0.028, lp: 2600 });
        }
        if (boss && (s === 0 || s === 8)) {
            for (const n of COMBAT_CHORDS[bar]) A.osc(out, { t, type: 'sawtooth', f: NOTE(n - 12), dur: 0.35, vol: 0.035, lp: 1400 });
        }
    }
}

// Ending theme: [beat, midiNote, lengthBeats, chord?]  (1 beat = 0.6s)
const THEME = [
    [0, 69, 1, [50, 57, 62, 66]], [1, 74, 1], [2, 78, 1], [3, 81, 1],
    [4, 79, 1, [43, 55, 59, 62]], [5, 78, 1], [6, 76, 1], [7, 74, 1],
    [8, 71, 1, [47, 54, 59, 62]], [9, 74, 1], [10, 79, 1], [11, 83, 1],
    [12, 81, 3, [45, 52, 57, 61]],
    [16, 78, 1, [50, 57, 62, 66]], [17, 76, 1], [18, 74, 1], [19, 76, 1],
    [20, 78, 1, [43, 55, 59, 62]], [21, 81, 1], [22, 86, 2],
    [24, 83, 1, [45, 52, 57, 61]], [25, 81, 1], [26, 79, 1], [27, 76, 1],
    [28, 74, 4, [50, 57, 62, 66]],
];
