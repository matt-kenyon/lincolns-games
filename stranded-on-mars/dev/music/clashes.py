# Symbolic check: semitone clashes between notes of different instruments that ring together.
import sys, songs
NAMES = 'C C# D D# E F F# G G# A A# B'.split()
PERC = {'perc','snare','bd','tom_hi','tom_lo','frame','tamb','shaker','crash','scym','marktree','gong','timp','timp_roll'}
ONESHOT_LEN = {'harp': 1.5, 'glock': 1.0, 'xylo': .5, 'celesta': 1.0, 'vibes': 1.5, 'piano': None, 'vc_pizz': .5, 'cb_pizz': .5, 'vln_pizz': .5,
               'vc_spic': .25, 'vla_spic': .25, 'vln_spic': .25, 'horn_stac': .4, 'tbn_stac': .4, 'tpt_stac': .4, 'tuba_stac': .4, 'piccolo': .25, 'bassoon': .25, 'marimba': .5}
for name in (sys.argv[1:] or songs.SONGS):
    sp = songs.SONGS[name](); notes = []
    for (beat, stem, inst, midi, dur, vel, extra) in sp['score'].notes:
        k = inst.key
        if k in PERC or vel < .15: continue
        L = ONESHOT_LEN.get(k, dur) or dur
        notes.append((beat, beat + min(L, dur if dur else L), midi, k, stem))
    bad = {}
    for i, a in enumerate(notes):
        for b in notes[i + 1:]:
            if a[3] == b[3]: continue
            ov = min(a[1], b[1]) - max(a[0], b[0])
            if ov >= 1.0 and abs(a[2] - b[2]) in (1, 13):
                key = (round(max(a[0], b[0])), tuple(sorted([(a[3], NAMES[a[2] % 12]), (b[3], NAMES[b[2] % 12])])))
                bad[key] = ov
    print(f'== {name}: {len(bad)} clashes')
    for (bt, pair), ov in sorted(bad.items())[:40]:
        print(f'   beat {bt:5.1f}  {pair}  overlap {ov:.2f}')
