# Objective checks on a rendered stem (we can't listen): per-slot chroma vs. expected chord,
# onset alignment to the beat grid, level per bar, and a spectrogram picture.
import sys, numpy as np, subprocess, engine
SR = engine.SR
NAMES = 'C C# D D# E F F# G G# A A# B'.split()
def load(p):
    x, sr = engine.read_wav(p); return x.mean(1)
def chroma(x):
    N = 1 << int(np.ceil(np.log2(len(x))))
    S = np.abs(np.fft.rfft(x * np.hanning(len(x)), N)) ** 2; f = np.fft.rfftfreq(N, 1 / SR)
    m = (f > 55) & (f < 2000); midi = np.round(69 + 12 * np.log2(f[m] / 440)).astype(int)
    c = np.zeros(12); np.add.at(c, midi % 12, S[m]); return c / c.max()
def onsets(x, hop=256):
    n = len(x) // hop; fr = x[:n * hop].reshape(n, hop)
    e = np.log(np.sum(fr ** 2, 1) + 1e-10); fl = np.maximum(0, np.diff(e))
    th = np.median(fl) + 2.5 * fl.std(); idx = np.where((fl[1:-1] > th) & (fl[1:-1] >= fl[:-2]) & (fl[1:-1] >= fl[2:]))[0] + 1
    return (idx + 1) * hop / SR
if __name__ == '__main__':
    path, bpm, start = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])   # start = seconds where beat 0 sits in the file
    x = load(path); spb = 60 / bpm
    bars = int((len(x) / SR - start) / (4 * spb))
    print('bar RMS dB:', ' '.join(f'{20*np.log10(np.sqrt(np.mean(x[int((start+b*4*spb)*SR):int((start+(b+1)*4*spb)*SR)]**2))+1e-9):.0f}' for b in range(bars)))
    slot = float(sys.argv[4]) if len(sys.argv) > 4 else 8
    out = []
    for k in range(int(bars * 4 // slot)):
        a = int((start + k * slot * spb) * SR); b = int((start + (k + 1) * slot * spb) * SR)
        c = chroma(x[a:b]); top = np.argsort(c)[::-1][:4]
        out.append('/'.join(NAMES[i] for i in top))
    print('top pitch classes per slot:', ' | '.join(out))
    on = onsets(x); g = spb / 4
    dev = [((t - start) / g - round((t - start) / g)) * g * 1000 for t in on if t > start]
    print(f'onsets: {len(on)}  grid deviation (ms) median {np.median(np.abs(dev)):.1f}  90% {np.percentile(np.abs(dev), 90):.1f}')
