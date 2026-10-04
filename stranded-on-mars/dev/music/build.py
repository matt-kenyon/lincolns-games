# Renders the homemade songs into wrap-padded, sample-exact loop stems (MP3) for the game.
#   python3 build.py              # every song
#   python3 build.py mars ship    # just these
import sys, os, json, time, numpy as np
import engine
from engine import SR, render, write_wav, loudness, encode_mp3
from songs import SONGS

OUT = os.path.join(engine.HERE, 'out'); os.makedirs(OUT, exist_ok=True)
GAME_MUSIC = os.path.normpath(os.path.join(engine.HERE, '..', '..', 'audio', 'music'))
PAD = 0.5
XF = 0.3   # intro -> loop crossfade (one time only; every loop seam stays exact)

def build(name):
    t0 = time.time()
    sp = SONGS[name](); s = sp['score']; stems = list(sp['stems'])
    info = {'song': f'home-{name}'}
    mix = None
    if sp.get('balance'):
        total = s.sec(sp.get('total_beats') or (sp['intro_beats'] + sp['loop_beats'])) + 2
        mix, lv = engine.auto_mix(s, stems, sp['balance'], total)
        print('  mix (dB):', {f'{k[0]}/{k[1]}': round(20 * np.log10(v), 1) for k, v in mix.items()})
    if sp['once']:
        end_s = s.sec(sp['total_beats']) + 7.0
        r = render(s, end_s + 2, stems, reverb=sp['reverb'], mix=mix)
        n = int(end_s * SR)
        files = {k: r[k][:n].copy() for k in stems}
        for k in files:
            files[k][-int(1.0 * SR):] *= np.linspace(1, 0, int(1.0 * SR))[:, None] ** 2
        meas = files
        info.update(once=True)
    else:
        spb = 60.0 / sp['score'].bpm
        L_s = sp['loop_beats'] * spb; L = int(round(L_s * SR)); assert abs(L - L_s * SR) < 1e-6, (name, L_s * SR)
        I_s = sp['intro_beats'] * spb; In = int(round(I_s * SR)); P = int(PAD * SR); X = int(XF * SR)
        r = render(s, I_s + 3 * L_s + 6, stems, cycles=3, loop_beats=sp['loop_beats'], offset_beats=sp['intro_beats'], reverb=sp['reverb'], mix=mix)
        files, meas = {}, {}
        for k in stems:
            x = r[k]
            S = x[In + L: In + 2 * L]
            post = x[In + 2 * L: In + 2 * L + P]
            if In:
                head = x[:In].copy()
                w = np.linspace(0, 1, X)[:, None]
                head[-X:] = head[-X:] * (1 - w) + x[In + L - X: In + L] * w
                files[k] = np.concatenate([head, S, post])
            else:
                files[k] = np.concatenate([x[In + L - P: In + L], S, post])
            meas[k] = S
        info.update(loop=round(L / SR, 6))
        if In: info['intro'] = round(In / SR, 6)
        else: info['pad'] = PAD
    # loudness: each stem to its target, then make sure the full stack can't clip
    gains = {}
    for k in stems:
        I, tp = loudness(meas[k]); gains[k] = 10 ** ((sp['targets'][k] - I) / 20)
    stack = sum(meas[k] * gains[k] for k in stems)
    _, stp = loudness(stack)
    if stp > -1.0:
        cut = 10 ** ((-1.0 - stp) / 20)
        for k in gains: gains[k] *= cut
        print(f'  {name}: stack true peak {stp:.1f} dBTP, all stems lowered {20*np.log10(cut):.1f} dB')
    report = {}
    for k in stems:
        y = files[k] * gains[k]
        wav = os.path.join(OUT, f'home-{name}-{k}.wav'); write_wav(wav, y, bits=24)
        mp3 = os.path.join(GAME_MUSIC, f'home-{name}-{k}.mp3'); encode_mp3(wav, mp3, sp['stems'][k])
        I, tp = loudness(meas[k] * gains[k])
        report[k] = dict(lufs=round(I, 1), tp=round(tp, 1), samples=len(y), kb=os.path.getsize(mp3) // 1024)
    I, tp = loudness(sum(meas[k] * gains[k] for k in stems))
    info['stems'] = {k: f'home-{name}-{k}' for k in stems}
    info['_report'] = dict(stems=report, stack_lufs=round(I, 1), stack_tp=round(tp, 1), seconds=round(len(files[stems[0]]) / SR, 3), render_s=round(time.time() - t0, 1))
    json.dump(info, open(os.path.join(OUT, f'home-{name}.json'), 'w'), indent=1)
    print(json.dumps(info))
    return info

if __name__ == '__main__':
    for n in (sys.argv[1:] or list(SONGS)):
        build(n)
