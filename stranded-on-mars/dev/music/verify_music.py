import json, base64, numpy as np, os, engine
D = json.load(open('out/verify.json')); res, meta = D['res'], D['meta']
arr = lambda b: np.frombuffer(base64.b64decode(b), dtype=np.float32)
db = lambda e, s: 10 * np.log10(np.mean(e ** 2) / max(np.mean(s ** 2), 1e-20) + 1e-20)
print(f"{'file':26s} {'browser':7s} {'rate':5s} {'decoded':>9s} {'expected':>9s} {'offset':>6s} {'SNR':>5s} {'seam(win)':>9s} {'seam(play)':>10s}")
for f in sorted(res['chrome']):
    wav, _ = engine.read_wav(os.path.join('out', f.replace('.mp3', '.wav'))); src = wav[:, 0]
    song = f.rsplit('-', 1)[0]; m = meta[song]
    for br in ('chrome', 'webkit'):
        for rate in ('44100', '48000'):
            r = res[br][f][rate]
            exp = len(src) if rate == '44100' else int(round(len(src) * 48000 / 44100))
            h = arr(r['head']); off = snr = None
            if rate == '44100':
                ref = src[44100: 44100 + 4096 + 400]
                c = [np.dot(h, ref[k: k + 4096]) for k in range(0, 400)]
                cm = [np.dot(h[k:], ref[:4096 - k]) for k in range(0, 400)]
                k1, k2 = int(np.argmax(c)), int(np.argmax(cm))
                off = -k1 if c[k1] >= cm[k2] else k2
                snr = -db(h - src[44100 - off if off >= 0 else 44100 + -off: ][:4096] if True else 0, h)
                snr = -db(h - src[44100 + (-off if off < 0 else 0) - (off if off > 0 else 0): 44100 + (-off if off < 0 else 0) - (off if off > 0 else 0) + 4096], h)
            sw = sp = '-'
            if not m.get('once'):
                a, e = arr(r['atStart']), arr(r['atEnd']); sw = f"{db(a - e, a):.1f}"
                pl, ex = arr(r['played']), arr(r['expect']); n = min(len(pl), len(ex)); sp = f"{db(pl[:n] - ex[:n], ex[:n]):.1f}"
            print(f"{f:26s} {br:7s} {rate:5s} {r['len']:9d} {exp:9d} {str(off) if off is not None else '-':>6s} {('%.1f' % snr) if snr is not None else '-':>5s} {sw:>9s} {sp:>10s}")
