import numpy as np, sys, time, engine, instruments as I
SR = engine.SR
def f0(x):
    m = x.mean(1); on = int(np.argmax(np.abs(m) > 0.1 * np.abs(m).max()))
    seg = m[on + int(0.12 * SR): on + int(0.52 * SR)]
    if len(seg) < 4096: seg = m[on: on + 8192]
    seg = seg - seg.mean(); N = 1 << 18
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), N)); fr = np.fft.rfftfreq(N, 1 / SR)
    h = S.copy()
    for k in (2, 3): h[:len(S) // k] *= S[::k][:len(S) // k]
    lo, hi = np.searchsorted(fr, 40), np.searchsorted(fr, 5000)
    return fr[lo + np.argmax(h[lo:hi])]
tests = {'piano': 60, 'harp': 67, 'glock': 84, 'xylo': 79, 'marimba': 60, 'vibes': 72, 'vibes_bowed': 69, 'glass': 78, 'celesta': 72,
         'vln': 69, 'vla': 60, 'vc': 50, 'vln_spic': 69, 'vla_spic': 62, 'vc_spic': 50, 'vln_pizz': 69, 'vc_pizz': 50, 'vc_trem': 50, 'cb_pizz': 38,
         'flute': 74, 'piccolo': 86, 'bassoon': 50, 'horn': 62, 'horn_stac': 62, 'tbn_stac': 55, 'tpt_stac': 72, 'tuba_stac': 38, 'organ': 62,
         'timp': 38, 'pad_glass': 62, 'pad_warm': 62, 'pad_choir': 62, 'sub': 38,
         'snare': 60, 'bd': 62, 'tom_hi': 62, 'tom_lo': 62, 'frame': 61, 'tamb': 60, 'shaker': 62, 'crash': 60, 'scym': 68, 'perc': I.SN}
names = sys.argv[1:] or list(tests)
for nm in names:
    t0 = time.time()
    inst = I.get(nm); m = tests[nm]
    y = inst.voice(m, 0.8, 1.0)
    rms = 20 * np.log10(np.sqrt(np.mean(y[:int(0.5 * SR)] ** 2)) + 1e-9); pk = 20 * np.log10(np.abs(y).max() + 1e-9)
    s = f'{nm:12s} midi {m:3d} len {len(y)/SR:5.2f}s rms0.5 {rms:6.1f} dB peak {pk:6.1f} dB'
    if nm not in ('snare','bd','tom_hi','tom_lo','frame','tamb','shaker','crash','scym','perc','timp'):
        f = f0(y); exp = 440 * 2 ** ((m - 69) / 12); c = 1200 * np.log2(f / exp)
        oc = round(c / 1200); s += f' | f0 {f:7.1f} Hz exp {exp:7.1f} -> {c - 1200*oc:+5.0f} cents (octave {oc:+d})'
    print(s, f'[{time.time()-t0:.1f}s]', flush=True)
