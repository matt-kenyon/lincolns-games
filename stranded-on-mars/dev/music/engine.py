# Small offline sampler + mixer for the Stranded on Mars soundtrack.
# Reads CC0 sample libraries through their own SFZ maps, plays scores (lists of notes)
# into per-stem buffers, adds a shared synthetic hall reverb, and cuts seamless loops.
import numpy as np, os, re, struct, subprocess, json, hashlib, math

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = os.path.normpath(os.path.join(HERE, '..', 'audio-src', 'samples'))   # downloaded by fetch_samples.py (git-ignored)
CACHE = os.path.join(HERE, 'cache')
os.makedirs(CACHE, exist_ok=True)

# ------------------------------------------------------------------ WAV io
def read_wav(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'RIFF' and d[8:12] == b'WAVE', path
    off, fmt, data = 12, None, None
    while off + 8 <= len(d):
        cid = d[off:off+4]; n = struct.unpack('<I', d[off+4:off+8])[0]
        body = d[off+8:off+8+n]
        if cid == b'fmt ': fmt = body
        elif cid == b'data': data = body; break          # may be truncated (partial downloads)
        off += 8 + n + (n & 1)
    tag, ch, sr, _, align, bits = struct.unpack('<HHIIHH', fmt[:16])
    if tag == 0xFFFE: tag = struct.unpack('<H', fmt[24:26])[0]
    data = data[:len(data) - len(data) % align]
    if tag == 3:
        x = np.frombuffer(data, dtype='<f4' if bits == 32 else '<f8').astype(np.float32)
    elif bits == 16:
        x = np.frombuffer(data, dtype='<i2').astype(np.float32) / 32768
    elif bits == 24:
        b = np.frombuffer(data, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        x = ((b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)) << 8 >> 8).astype(np.float32) / 8388608
    elif bits == 32:
        x = np.frombuffer(data, dtype='<i4').astype(np.float32) / 2147483648
    else:
        raise ValueError(f'{path}: {bits} bit')
    x = x.reshape(-1, ch)
    if ch == 1: x = np.repeat(x, 2, axis=1)
    elif ch > 2: x = x[:, :2]
    return x, sr

def write_wav(path, x, bits=24):
    x = np.clip(np.asarray(x, dtype=np.float64), -1, 1)
    if bits == 16:
        raw = (np.round(x * 32767)).astype('<i2').tobytes()
    else:
        v = np.round(x * 8388607).astype(np.int32).reshape(-1)
        raw = np.stack([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff], 1).astype(np.uint8).tobytes()
    ch = x.shape[1]; ba = ch * bits // 8
    hdr = b'RIFF' + struct.pack('<I', 36 + len(raw)) + b'WAVE' + b'fmt ' + struct.pack('<IHHIIHH', 16, 1, ch, SR, SR * ba, ba, bits) + b'data' + struct.pack('<I', len(raw))
    open(path, 'wb').write(hdr + raw)

# ------------------------------------------------------------------ resampling
def resample(x, ratio, taps=24):
    """Read x at positions n*ratio (ratio > 1 raises pitch). Windowed-sinc, anti-aliased."""
    if abs(ratio - 1) < 1e-9: return x.copy()
    n_out = int((len(x) - 2) / ratio)
    fc = min(1.0, 1.0 / ratio)
    half = taps // 2
    k = np.arange(-half + 1, half + 1)
    xp = np.pad(x, ((half, half + 1), (0, 0)))
    out = np.empty((n_out, x.shape[1]), np.float32)
    for s in range(0, n_out, 32768):
        n = np.arange(s, min(n_out, s + 32768))
        p = n * ratio; i = np.floor(p).astype(np.int64); f = p - i
        t = k[None, :] - f[:, None]
        w = fc * np.sinc(fc * t) * (0.42 + 0.5 * np.cos(np.pi * t / (half + 0.5)) + 0.08 * np.cos(2 * np.pi * t / (half + 0.5)))
        w /= w.sum(1, keepdims=True)
        idx = i[:, None] + k[None, :] + half
        for c in range(x.shape[1]):
            out[s:s + len(n), c] = (xp[idx, c] * w).sum(1)
    return out

# ------------------------------------------------------------------ local sample index
_INDEX = None
def local_index():
    global _INDEX
    if _INDEX is None:
        _INDEX = {}
        for root, _, files in os.walk(SAMPLES):
            for f in files:
                if f.lower().endswith('.wav'):
                    _INDEX.setdefault(f, []).append(os.path.join(root, f))
    return _INDEX

def find_local(rel):
    rel = rel.replace('\\', '/').strip()
    c = local_index().get(os.path.basename(rel), [])
    if not c: return None
    tail = '/'.join(rel.split('/')[-2:])
    for p in c:
        if p.replace('\\', '/').endswith(tail): return p
    return c[0]

_SAMPLE_CACHE = {}
def load_sample(path, offset=0, trim=True):
    key = (path, offset, trim)
    if key in _SAMPLE_CACHE: return _SAMPLE_CACHE[key]
    h = hashlib.md5(f'{path}|{offset}|{trim}|v2'.encode()).hexdigest()
    cp = os.path.join(CACHE, h + '.npy')
    if os.path.exists(cp):
        x = np.load(cp)
    else:
        x, sr = read_wav(path)
        x = x[offset:]
        if sr != SR: x = resample(x, sr / SR)
        if trim:
            env = np.abs(x).max(1)
            pk = env.max() + 1e-9
            on = int(np.argmax(env > pk * 10 ** (-42 / 20)))
            x = x[max(0, on - int(0.003 * SR)):]
        x = x - x.mean(0, keepdims=True) * 0       # (kept: no DC removal; samples are clean)
        np.save(cp, x.astype(np.float32))
    _SAMPLE_CACHE[key] = x
    return x

_SHIFT_CACHE = {}
def shifted(path, offset, trim, cents):
    key = (path, offset, trim, int(round(cents)))
    if key not in _SHIFT_CACHE:
        x = load_sample(path, offset, trim)
        _SHIFT_CACHE[key] = resample(x, 2 ** (key[3] / 1200)) if key[3] else x
    return _SHIFT_CACHE[key]

# ------------------------------------------------------------------ SFZ
NOTE = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
def parse_note(v):
    v = v.strip()
    if re.fullmatch(r'-?\d+', v): return int(v)
    m = re.fullmatch(r'([a-gA-G])([#b]?)(-?\d+)', v)
    n = NOTE[m.group(1).lower()] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return 12 * (int(m.group(3)) + 1) + n

def parse_sfz(path):
    txt = open(path, encoding='latin1').read()
    txt = re.sub(r'//[^\n]*', '', txt)
    tokens = re.split(r'(<\w+>)', txt)
    ctrl, glob, master, group, regions, cur = {}, {}, {}, {}, [], None
    level = None
    for t in tokens:
        m = re.fullmatch(r'<(\w+)>', t.strip()) if t.strip().startswith('<') else None
        if m:
            level = m.group(1)
            if level == 'region': cur = {}; regions.append((dict(glob), dict(master), dict(group), cur))
            elif level == 'group': group = {}
            elif level == 'master': master = {}; group = {}
            elif level == 'global': glob = {}
            continue
        ops = {}
        for line in t.split('\n'):
            for mm in re.finditer(r'(\w+)=(.*?)(?=\s+\w+=|$)', line.strip()):
                ops[mm.group(1)] = mm.group(2).strip()
        tgt = {'control': ctrl, 'global': glob, 'master': master, 'group': group, 'region': cur}.get(level)
        if tgt is not None: tgt.update(ops)
    out = []
    dp = ctrl.get('default_path', '')
    for g, ms, gr, r in regions:
        z = {}; z.update(g); z.update(ms); z.update(gr); z.update(r)
        if 'sample' not in z or z.get('trigger', 'attack') != 'attack': continue
        local = find_local(dp + z['sample'])
        if local is None: continue
        key = parse_note(z['key']) if 'key' in z else None
        reg = dict(path=local,
                   lokey=parse_note(z.get('lokey', str(key if key is not None else 0))),
                   hikey=parse_note(z.get('hikey', str(key if key is not None else 127))),
                   center=parse_note(z.get('pitch_keycenter', str(key if key is not None else 60))),
                   lovel=int(z.get('lovel', 0)), hivel=int(z.get('hivel', 127)),
                   seq_len=int(z.get('seq_length', 1)), seq_pos=int(z.get('seq_position', 1)),
                   tune=float(z.get('tune', 0)) + 100 * float(z.get('transpose', 0)),
                   volume=float(z.get('volume', 0)),
                   offset=int(z.get('offset', 0)),
                   veltrack=float(z.get('amp_veltrack', 100)),
                   name=os.path.basename(local))
        out.append(reg)
    return out

# ------------------------------------------------------------------ instruments
def _env_apply(y, attack, dur_s, release, curve=6.9):
    n = len(y)
    env = np.ones(n, np.float32)
    if attack > 0:
        a = min(n, int(attack * SR))
        env[:a] = (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))) if a > 0 else 1
    if dur_s is not None:
        s = int(dur_s * SR)
        if s < n:
            t = np.arange(n - s) / SR
            env[s:] *= np.exp(-curve * t / max(release, 1e-3))
    tail = min(n, int(0.004 * SR))
    env[n - tail:] *= np.linspace(1, 0, tail)
    return y * env[:, None]

def _pan(y, pan, width=1.0):
    if width != 1.0:
        mid = (y[:, 0] + y[:, 1]) * 0.5; side = (y[:, 0] - y[:, 1]) * 0.5 * width
        y = np.stack([mid + side, mid - side], 1)
    if pan:
        a = (pan + 1) * np.pi / 4
        y = y * np.array([np.cos(a), np.sin(a)], np.float32) * math.sqrt(2)
    return y

class SfzInstrument:
    def __init__(self, sfz, name=None, gain_db=0.0, attack=0.0, release=0.3, pan=0.0, width=1.0,
                 oneshot=False, max_len=None, lead=0.0, vel_db=None, trim=True, key_filter=None, transpose=0, reverb=0.25, humanize=0.006):
        self.regions = [r for r in parse_sfz(sfz) if key_filter is None or key_filter(r)]
        assert self.regions, f'no regions for {sfz}'
        self.name = name or os.path.basename(sfz)
        self.gain_db, self.attack, self.release = gain_db, attack, release
        self.pan, self.width, self.oneshot, self.max_len, self.lead = pan, width, oneshot, max_len, lead
        self.vel_db, self.trim, self.transpose, self.reverb, self.humanize = vel_db, trim, transpose, reverb, humanize
        self.rr = {}
    def pick(self, midi, v127, rr=None):
        cand = [r for r in self.regions if r['lokey'] <= midi <= r['hikey'] and r['lovel'] <= v127 <= r['hivel']]
        if not cand:
            cand = [r for r in self.regions if r['lovel'] <= v127 <= r['hivel']] or self.regions
            best = min(abs(r['center'] - midi) for r in cand)
            cand = [r for r in cand if abs(r['center'] - midi) == best]
        groups = {}
        for r in cand: groups.setdefault(r['seq_pos'], []).append(r)
        if len(groups) > 1:
            if rr is None:
                k = (midi, min(r['lovel'] for r in cand))
                rr = self.rr.get(k, 0); self.rr[k] = rr + 1
            keys = sorted(groups); cand = groups[keys[rr % len(keys)]]
        return cand[0]
    def voice(self, midi, vel, dur_s, rr=None):
        midi = midi + self.transpose
        v127 = max(1, min(127, int(round(vel * 127))))
        r = self.pick(midi, v127, rr)
        cents = (midi - r['center']) * 100 + r['tune']
        y = shifted(r['path'], r['offset'], self.trim, cents)
        if self.oneshot or dur_s is None:
            n = len(y)
            hold = None
            if self.max_len is not None and n > int(self.max_len * SR):
                n = int(self.max_len * SR); hold = max(0.0, self.max_len - self.release)
            y = _env_apply(y[:n], self.attack, hold, self.release / 3)
        else:
            n = min(len(y), int((dur_s + self.release) * SR))
            y = _env_apply(y[:n], self.attack, dur_s, self.release)
        if self.vel_db is None:
            vg = (r['veltrack'] / 100) * 40 * math.log10(max(vel, 0.05))
        else:
            vg = self.vel_db * (vel - 1)
        g = 10 ** ((r['volume'] + self.gain_db + vg) / 20)
        return _pan(y * g, self.pan, self.width)

class SynthPad:
    """Additive pad: detuned voices, slow attack, gentle tremolo. kind='glass' or 'warm' or 'sub' or 'choir'."""
    def __init__(self, kind='glass', gain_db=0.0, attack=1.0, release=1.5, pan=0.0, width=1.0, reverb=0.4, lead=0.0, humanize=0.0):
        self.kind, self.gain_db, self.attack, self.release = kind, gain_db, attack, release
        self.pan, self.width, self.reverb, self.lead, self.humanize = pan, width, reverb, lead, humanize
        self.oneshot = False
    def voice(self, midi, vel, dur_s, rr=None):
        f0 = 440 * 2 ** ((midi - 69) / 12)
        n = int((dur_s + self.release) * SR); t = np.arange(n) / SR
        rng = np.random.default_rng(int(midi * 1000 + dur_s * 10))
        if self.kind == 'glass':
            parts = [(1, 1.0), (2, 0.28), (3, 0.08), (4, 0.10), (6, 0.03), (8, 0.025)]
            dets = [-6, 0, 6]
        elif self.kind == 'warm':
            parts = [(k, (1 / k) * math.exp(-k * f0 / 1400)) for k in range(1, 40) if k * f0 < 9000]
            dets = [-8, -2, 4, 9]
        elif self.kind == 'choir':
            parts = [(k, (1 / k ** 1.2) * (1.4 if 2 <= k <= 4 else 1) * math.exp(-k * f0 / 1100)) for k in range(1, 30) if k * f0 < 6000]
            dets = [-10, -3, 3, 10]
        elif self.kind == 'sub':
            parts = [(1, 1.0), (2, 0.18), (3, 0.04)]
            dets = [0]
        y = np.zeros((n, 2), np.float32)
        for vi, dc in enumerate(dets):
            f = f0 * 2 ** (dc / 1200)
            ph = rng.uniform(0, 2 * np.pi, len(parts))
            lfo = 1 + (0.12 if self.kind != 'sub' else 0) * np.sin(2 * np.pi * rng.uniform(0.15, 0.4) * t + rng.uniform(0, 6.3))
            s = np.zeros(n, np.float32)
            for (k, a), p in zip(parts, ph):
                if k * f < SR / 2 - 1000:
                    s += a * np.sin(2 * np.pi * k * f * t + p)
            s *= lfo
            pan = 0 if len(dets) == 1 else (vi / (len(dets) - 1)) * 2 - 1
            y[:, 0] += s * math.cos((pan + 1) * np.pi / 4); y[:, 1] += s * math.sin((pan + 1) * np.pi / 4)
        y /= max(1, len(dets)) ** 0.5
        y = _env_apply(y, self.attack, dur_s, self.release, curve=5)
        g = 10 ** ((self.gain_db + 20 * math.log10(max(vel, 0.05))) / 20) * 0.25
        return _pan(y * g, self.pan, self.width)

class Sf2Instrument:
    """One preset from a SoundFont (used for the GeneralUser GS celesta)."""
    def __init__(self, sf2path, preset_name, gain_db=0.0, decay=2.5, release=0.4, pan=0.0, reverb=0.35, lead=0.0, humanize=0.006, attack=0.002):
        from sf2 import SF2
        f = SF2(sf2path)
        pid = [i for i, n, p, b in f.presets() if n == preset_name][0]
        self.zones = []
        for ii, _ in f.preset_instruments(pid):
            for z in f.instrument_zones(ii):
                s = f.sample(z[53], z)
                x = s['data']
                if s['looped']:
                    ls, le = s['loop']; reps = int(np.ceil(6.0 * s['rate'] / max(1, le - ls)))
                    x = np.concatenate([x[:le]] + [x[ls:le]] * reps)
                x = resample(np.stack([x, x], 1), s['rate'] / SR)
                s['x'] = x; self.zones.append(s)
        self.gain_db, self.decay, self.release, self.pan, self.reverb, self.lead, self.humanize, self.attack = gain_db, decay, release, pan, reverb, lead, humanize, attack
        self.oneshot = True; self._cache = {}
    def voice(self, midi, vel, dur_s, rr=None):
        z = [z for z in self.zones if z['keyRange'][0] <= midi <= z['keyRange'][1]][0]
        cents = (midi - z['root']) * 100 + z['tune_cents']
        k = (id(z), int(round(cents)))
        if k not in self._cache: self._cache[k] = resample(z['x'], 2 ** (k[1] / 1200))
        y = self._cache[k]
        dec = self.decay * (0.7 if midi > 84 else 1.0)
        n = min(len(y), int(dec * 2.2 * SR))
        t = np.arange(n) / SR
        env = np.exp(-6.9 * t / dec) * (1 - np.exp(-t / max(self.attack, 1e-4)))
        if dur_s is not None and dur_s * SR < n:
            s = int(dur_s * SR); env[s:] *= np.exp(-6.9 * (t[s:] - t[s]) / self.release)
        env[-200:] *= np.linspace(1, 0, 200)
        g = 10 ** ((self.gain_db + 40 * math.log10(max(vel, 0.05)) - z['atten']) / 20)
        return _pan(y[:n] * env[:, None] * g, self.pan)

# ------------------------------------------------------------------ reverb
def make_ir(seconds=2.6, predelay=0.022, seed=7, bright=1.0):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal((n, 2))
    F = np.fft.rfft(noise, axis=0); fr = np.fft.rfftfreq(n, 1 / SR)
    bands = [(0, 250, seconds * 1.1), (250, 1500, seconds), (1500, 5000, seconds * 0.7 * bright), (5000, SR / 2, seconds * 0.4 * bright)]
    ir = np.zeros((n, 2))
    for lo, hi, rt in bands:
        m = ((fr >= lo) & (fr < hi)).astype(float)
        b = np.fft.irfft(F * m[:, None], n, axis=0)
        ir += b * np.exp(-6.9 * t / rt)[:, None]
    fade_in = np.clip(t / 0.06, 0, 1) ** 1.5
    ir *= fade_in[:, None]
    # a few early reflections
    for d, g, s in [(0.011, 0.5, 0), (0.017, 0.4, 1), (0.029, 0.3, 0), (0.037, 0.28, 1), (0.051, 0.2, 0), (0.063, 0.18, 1)]:
        ir[int(d * SR), s] += g * 6
    ir = np.concatenate([np.zeros((int(predelay * SR), 2)), ir])
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
    return ir.astype(np.float32)

def convolve(x, ir, block=1 << 17):
    m = len(ir); nfft = 1 << int(np.ceil(np.log2(block + m - 1)))
    H = np.fft.rfft(ir, nfft, axis=0)
    out = np.zeros((len(x) + m - 1, 2), np.float32)
    for s in range(0, len(x), block):
        seg = x[s:s + block]
        if not np.any(seg): continue
        y = np.fft.irfft(np.fft.rfft(seg, nfft, axis=0) * H, nfft, axis=0)[:len(seg) + m - 1]
        out[s:s + len(y)] += y
    return out

_IRS = {}
def get_ir(kind):
    if kind not in _IRS:
        _IRS[kind] = {'hall': lambda: make_ir(2.6, 0.022, 7), 'big': lambda: make_ir(3.6, 0.03, 11),
                      'room': lambda: make_ir(1.1, 0.008, 3, bright=1.2)}[kind]()
    return _IRS[kind]

# ------------------------------------------------------------------ score + render
class Score:
    def __init__(self, bpm, beats_per_bar=4):
        self.bpm, self.bpb = bpm, beats_per_bar
        self.notes = []          # (beat, stem, inst, midi, dur_beats, vel, extra)
        self.tempo_map = None    # optional f(beat) -> seconds
    @property
    def spb(self): return 60.0 / self.bpm
    def add(self, stem, inst, beat, midi, dur=1.0, vel=0.7, **extra):
        self.notes.append((beat, stem, inst, midi, dur, vel, extra))
    def chord(self, stem, inst, beat, midis, dur=1.0, vel=0.7, strum=0.0, **extra):
        for i, m in enumerate(midis): self.add(stem, inst, beat + i * strum, m, dur, vel, **extra)
    def sec(self, beat):
        return self.tempo_map(beat) if self.tempo_map else beat * self.spb

def render(score, total_s, stems, cycles=None, loop_beats=None, offset_beats=0.0, reverb='hall', seed=1, hp=35.0, mix=None):
    """Render notes into stems. If cycles is given, the score (length loop_beats) is played `cycles`
    times back to back starting at offset_beats; notes with extra['once'] play only in their own position."""
    n = int(total_s * SR) + SR
    dry = {s: np.zeros((n, 2), np.float32) for s in stems}
    wet = {s: np.zeros((n, 2), np.float32) for s in stems}
    rng = np.random.default_rng(seed)
    jitter = rng.standard_normal(len(score.notes))      # same per note in every cycle -> periodic
    vj = rng.standard_normal(len(score.notes))
    reps = range(cycles) if cycles else [0]
    # round-robin choice fixed per note (not per play), so every loop cycle is identical
    rrc, rri = {}, []
    for (beat, stem, inst, midi, dur, vel, extra) in score.notes:
        k = (id(inst), midi); rri.append(rrc.get(k, 0)); rrc[k] = rri[-1] + 1
    for ni, (beat, stem, inst, midi, dur, vel, extra) in enumerate(score.notes):
        for c in reps:
            if extra.get('intro') and c > 0: continue
            b = beat + (0 if extra.get('intro') else offset_beats + c * (loop_beats or 0))
            t = score.sec(b) - inst.lead + jitter[ni] * getattr(inst, 'humanize', 0) * (0 if extra.get('tight') else 1)
            t = max(0.0, t)
            dur_s = None if dur is None else (score.sec(b + dur) - score.sec(b))
            v = float(np.clip(vel * (1 + 0.04 * vj[ni] * (0 if extra.get('tight') else 1)), 0.02, 1.0))
            y = inst.voice(midi, v, dur_s, rri[ni]) * (extra.get('gain', 1.0) * (mix or {}).get((stem, getattr(inst, 'key', None)), 1.0))
            i0 = int(round(t * SR)); i1 = min(n, i0 + len(y))
            dry[stem][i0:i1] += y[:i1 - i0]
            send = extra.get('reverb', inst.reverb)
            if send: wet[stem][i0:i1] += y[:i1 - i0] * send
    out = {}
    ir = get_ir(reverb)
    for s in stems:
        w = convolve(wet[s], ir)[:n] if np.any(wet[s]) else 0
        out[s] = highpass(dry[s] + w, hp)
    return out

def highpass(x, fc=35.0, order=2):
    """Zero-phase Butterworth-shaped high-pass (FFT domain): removes pedal thumps and room rumble."""
    N = len(x); F = np.fft.rfft(x, axis=0); f = np.fft.rfftfreq(N, 1 / SR)
    H = 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order)); H[0] = 0
    return np.fft.irfft(F * H[:, None], N, axis=0).astype(np.float32)

def loudness(x):
    """Integrated loudness (LUFS) and true peak (dBTP) via ffmpeg's ebur128 filter."""
    p = os.path.join(CACHE, '_lufs.wav'); write_wav(p, x, bits=24)
    r = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    I = float(re.findall(r'I:\s+(-?[\d.]+|-inf) LUFS', r.stderr)[-1])
    tp = re.findall(r'Peak:\s+(-?[\d.]+|-inf) dBFS', r.stderr)
    return I, float(tp[-1]) if tp else None

def encode_mp3(wav_path, mp3_path, kbps):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav_path, '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', '-ar', str(SR), '-ac', '2', mp3_path], check=True)

def active_level(x, win=0.4, gate=20.0):
    """Loudness of a part while it is playing: crude K-weighting, 400 ms windows, mean of windows
    within `gate` dB of the loudest one."""
    F = np.fft.rfft(x, axis=0); f = np.fft.rfftfreq(len(x), 1 / SR)
    H = 1 / np.sqrt(1 + (100 / np.maximum(f, 1)) ** 4) * np.where(f > 1500, 1.58, 1.0)
    y = np.fft.irfft(F * H[:, None], len(x), axis=0)
    w = int(win * SR); n = len(y) // w
    if n == 0: return -120.0
    e = (y[:n * w] ** 2).reshape(n, w, -1).mean((1, 2))
    db = 10 * np.log10(e + 1e-12); top = db.max()
    return float(10 * np.log10(np.mean(10 ** (db[db > top - gate] / 10))))

def auto_mix(score, stems, targets, total_s):
    """Per-(stem, instrument) gains so each part sits at its target level (dB, relative to the stem's 0 dB part)."""
    groups = {}
    for n in score.notes: groups.setdefault((n[1], getattr(n[2], 'key', None)), []).append(n)
    lv = {}
    for (stem, key), notes in groups.items():
        sc = Score(score.bpm); sc.tempo_map = score.tempo_map; sc.notes = notes
        r = render(sc, total_s, [stem], reverb='room', hp=35.0)[stem]
        lv[(stem, key)] = active_level(r)
    mix = {}
    for (stem, key), l in lv.items():
        t = targets.get(stem, {}).get(key)
        if t is None: raise KeyError(f'no balance target for {stem}/{key}')
        ref = [lv[(stem, k)] for k, v in targets[stem].items() if v == 0 and (stem, k) in lv][0]
        mix[(stem, key)] = 10 ** ((t - (l - ref)) / 20)
    return mix, lv
