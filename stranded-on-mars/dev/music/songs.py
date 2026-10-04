# The "homemade" Stranded on Mars soundtrack, written as note lists.
# Beats are quarter notes. Every song returns a spec the builder renders into stems.
from engine import Score
import instruments as I
P = I.get

def song(name, bpm, loop_beats, stems, targets, reverb='hall', intro_beats=0, once=False, bpb=4):
    return dict(name=name, score=Score(bpm, bpb), loop_beats=loop_beats, intro_beats=intro_beats, once=once,
                stems=stems, targets=targets, reverb=reverb)

def pad_chord(s, stem, beat, notes, dur, vel=0.45, top=None, gain=1.0):
    """Soft string pad: cellos take the low notes, violas the middle, violins the top."""
    for n in notes:
        inst = 'vc' if n < 55 else 'vla' if n < 64 else 'vln'
        s.add(stem, P(inst), beat, n, dur, vel, gain=gain)
    if top: s.add(stem, P('vln'), beat, top, dur, vel * 0.9, gain=gain)

# ============================================================== MARS (explore + combat)
# D major, 120 bpm, 32 bars = 64 s. Base: piano, harp, soft strings, glockenspiel.
# perc: concert bass drum, toms, snare, shaker, tambourine, timpani. drive: spiccato strings,
# pizzicato bass and horn/trombone stabs.
MARS_SLOTS = [  # (bass, pad voicing) per two bars
    (38, [50, 57, 62, 66]), (43, [50, 55, 59, 67]), (47, [50, 54, 59, 66]), (45, [50, 52, 57, 64]),
    (42, [50, 57, 62, 66]), (43, [50, 55, 59, 67]), (40, [50, 55, 59, 64]), (45, [50, 52, 57, 64]),
    (47, [50, 54, 59, 66]), (43, [50, 55, 59, 67]), (42, [50, 57, 62, 66]), (45, [49, 52, 57, 64]),
    (43, [50, 55, 59, 67]), (45, [49, 52, 57, 64]), (42, [49, 54, 57, 64]), (43, [50, 55, 59, 66]),
]
MARS_SPLIT = {3: [50, 52, 57, 64], 7: [50, 52, 57, 64], 14: [50, 54, 59, 62], 15: [50, 52, 57, 64]}  # second bar of slot
MARS_SPLIT_RESOLVE = {3: [49, 52, 57, 64], 7: [49, 52, 57, 64], 14: [47, 54, 59, 62], 15: [49, 52, 57, 64]}
MARS_SPLIT_BASS = {14: 47, 15: 45}
MARS_MEL = {  # piano melody per slot: (beat in slot, midi, length beats, velocity)
    0: [(0, 69, .5, .5), (.5, 74, .5, .48), (1, 78, 1.5, .55), (3, 81, 3, .5)],
    1: [(2, 79, .5, .45), (2.5, 78, .5, .42), (3, 76, 1, .48), (4, 74, 2, .5), (6, 71, 2, .42)],
    2: [(4, 83, 1, .38), (5, 81, 1, .36), (6, 78, 2, .42)],
    3: [(0, 76, 1, .45), (1, 74, 1, .42), (2, 76, 2, .45), (5, 73, 1, .4), (6, 76, 2, .45)],
    4: [(0, 81, .5, .5), (.5, 86, .5, .48), (1, 90, 1.5, .5), (3, 88, 1, .45), (4, 86, 3, .48)],
    5: [(2, 83, 1, .42), (3, 86, 1, .45), (4, 88, 2, .48), (7, 86, 1, .4)],
    6: [(0, 83, 2, .45), (2, 81, 1, .42), (3, 79, 1, .4), (4, 78, 3, .45)],
    7: [(0, 76, 3, .42), (4, 73, 1, .4), (5, 76, 1, .4), (6, 69, 2, .42)],
    8: [(0, 66, 1, .45), (1, 71, 1, .45), (2, 74, 2, .5), (4, 73, 2, .45), (6, 71, 2, .42)],
    9: [(2, 67, 1, .42), (3, 71, 1, .45), (4, 74, 3, .5), (7, 76, 1, .45)],
    10: [(0, 78, 2, .52), (2, 76, 1, .48), (3, 74, 1, .45), (4, 69, 4, .45)],
    11: [(4, 81, 1, .36), (5, 79, 1, .34), (6, 76, 2, .38)],
    12: [(0, 79, 1, .52), (1, 78, 1, .5), (2, 76, 1, .5), (3, 74, 1, .48), (4, 71, 2, .45), (6, 74, 2, .45)],
    13: [(0, 73, 1, .48), (1, 76, 1, .5), (2, 81, 2, .55), (4, 79, 2, .5), (6, 76, 2, .45)],
    14: [(0, 76, 2, .48), (2, 73, 2, .45), (4, 74, 2, .48), (6, 78, 2, .5)],
    15: [(0, 78, 2, .48), (2, 74, 2, .45), (4, 76, 3.5, .45)],
}

def mars():
    sp = song('mars', 120, 128, {'base': 128, 'perc': 112, 'drive': 112}, {'base': -18, 'perc': -23, 'drive': -22})
    s = sp['score']
    for k, (bass, pad) in enumerate(MARS_SLOTS):
        b0 = k * 8
        B = 'base'
        # strings pad (second bar may change chord)
        if k in MARS_SPLIT:
            pad_chord(s, B, b0, pad, 4, .42)
            pad_chord(s, B, b0 + 4, MARS_SPLIT[k], 2, .42)
            pad_chord(s, B, b0 + 6, MARS_SPLIT_RESOLVE[k], 2, .44)
        else:
            pad_chord(s, B, b0, pad, 8, .44 if k < 8 else .5)
        # piano left hand: low root + fifth, a soft middle note on beat 3 of the first bar
        lb = MARS_SPLIT_BASS.get(k, bass)
        s.add(B, P('piano'), b0, bass, 4, .36)
        s.add(B, P('piano'), b0, bass + (12 if k in (4, 10) else 7), 4, .3)
        s.add(B, P('piano'), b0 + 2, pad[2] + 12 if pad[2] < 60 else pad[2], 2, .26)
        s.add(B, P('piano'), b0 + 4, lb, 4, .32)
        s.add(B, P('piano'), b0 + 4, lb + 12, 4, .26)
        # melody
        for (bb, m, d, v) in MARS_MEL[k]:
            s.add(B, P('piano'), b0 + bb, m, d, v)
        # harp: a rolled chord in the A section, gentle arpeggios in the B section
        if k < 8:
            s.chord(B, P('harp'), b0, [bass + 12] + [n + 12 for n in pad[1:]], vel=.42, strum=.06)
        else:
            notes = [bass + 12, pad[1] + 12, pad[2] + 12, pad[3] + 12, pad[2] + 24, pad[3] + 12]
            for i in range(8):
                s.add(B, P('harp'), b0 + i * .5, notes[i % 6], 1, .36 + (.06 if i % 4 == 0 else 0))
        # glockenspiel sparkles at phrase starts
        if k in (0, 4, 8, 12):
            s.add(B, P('glock'), b0, {0: 86, 4: 90, 8: 90, 12: 91}[k], 1, .32)
            s.add(B, P('glock'), b0 + 1, {0: 93, 4: 93, 8: 95, 12: 95}[k], 1, .26)
    s.add('base', P('marktree'), 64 - 1, 64, 4, .25)    # shimmer leading into the B section

    # ---------- perc layer
    for bar in range(32):
        b0 = bar * 4; ph = bar % 4
        s.add('perc', P('bd'), b0, 62, 1, .62 if ph == 0 else .5)
        s.add('perc', P('bd'), b0 + 1.5, 62, 1, .4)
        s.add('perc', P('bd'), b0 + 2.5, 62, 1, .5)
        s.add('perc', P('snare'), b0 + 1, 60, 1, .42)
        s.add('perc', P('snare'), b0 + 3, 60, 1, .46)
        for i in range(8):
            s.add('perc', P('shaker'), b0 + i * .5, 62 if i % 2 else 63, .5, .5 if i % 2 else .38)
        s.add('perc', P('tamb'), b0 + 1, 60, 1, .4); s.add('perc', P('tamb'), b0 + 3, 60, 1, .44)
        if ph == 3:   # tom fill into the next phrase
            for i, (t, inst) in enumerate([(2, 'tom_hi'), (2.25, 'tom_hi'), (2.5, 'tom_lo'), (2.75, 'tom_lo'), (3, 'tom_hi'), (3.25, 'tom_hi'), (3.5, 'tom_lo'), (3.75, 'tom_lo')]):
                s.add('perc', P(inst), b0 + t, 62, 1, .45 + i * .025)
        else:
            s.add('perc', P('tom_lo'), b0 + .75, 62, 1, .42)
            s.add('perc', P('tom_hi'), b0 + 3.5, 62, 1, .4)
        if bar % 2 == 0:
            root = MARS_SLOTS[bar // 2][0]
            t = root if 36 <= root <= 47 else root - 12 if root > 47 else root + 12
            s.add('perc', P('timp'), b0, t, 2, .58)
        if bar % 8 == 0:
            s.add('perc', P('crash'), b0, 60, 4, .45)

    # ---------- drive layer
    for k, (bass, pad) in enumerate(MARS_SLOTS):
        for half in (0, 1):
            b0 = k * 8 + half * 4
            r = MARS_SPLIT_BASS.get(k, bass) if half else bass
            r = r if r >= 40 else r + 12          # keep cello gallop in a comfy register
            for beat in range(4):                  # gallop: 8th + two 16ths
                bb = b0 + beat
                s.add('drive', P('vc_spic'), bb, r, .5, .62 if beat in (0, 2) else .5)
                s.add('drive', P('vc_spic'), bb + .5, r, .25, .45)
                s.add('drive', P('vc_spic'), bb + .75, r, .25, .48)
            top = (pad[2] if not half else (MARS_SPLIT.get(k, pad))[2]) + 12
            for i in range(8):                     # violas: offbeat 8ths on the fifth/octave
                s.add('drive', P('vla_spic'), b0 + i * .5, top if i % 2 else top - 5, .5, .42 if i % 2 else .34)
            s.add('drive', P('cb_pizz'), b0, r - 12 if r - 12 >= 28 else r, 2, .62)
            s.add('drive', P('cb_pizz'), b0 + 2, r - 12 if r - 12 >= 28 else r, 2, .5)
            stab = pad if not half else MARS_SPLIT.get(k, pad)
            if half == 0:
                s.chord('drive', P('horn_stac'), b0, [n + 12 for n in stab[1:]], vel=.6)
                s.chord('drive', P('tbn_stac'), b0, [stab[0], stab[1]], vel=.55)
                s.chord('drive', P('horn_stac'), b0 + 2.5, [n + 12 for n in stab[1:]], vel=.48)
            else:
                s.chord('drive', P('horn_stac'), b0 + 3, [n + 12 for n in stab[1:]], vel=.45)
                s.chord('drive', P('horn_stac'), b0 + 3.5, [n + 12 for n in stab[1:]], vel=.55)
    sp['balance'] = {
        'base': {'piano': 0, 'harp': -7, 'vc': -9, 'vla': -10, 'vln': -10, 'glock': -9, 'marktree': -14},
        'perc': {'bd': 0, 'tom_lo': -2, 'tom_hi': -3, 'snare': -5, 'timp': -2, 'tamb': -10, 'shaker': -11, 'crash': -9},
        'drive': {'vc_spic': 0, 'horn_stac': -2, 'vla_spic': -6, 'tbn_stac': -6, 'cb_pizz': -4}}
    return sp

# ============================================================== CAPTAIN (Mars boss)
# D minor, 140 bpm, 32 bars = 54.9 s. One stem.
CAP_SLOTS = [(38, [50, 57, 62, 65]), (46, [50, 58, 62, 65]), (48, [52, 55, 60, 64]), (45, [52, 57, 61, 64])] * 2 + \
            [(38, [53, 57, 62, 65]), (46, [53, 58, 62, 65]), (48, [55, 60, 64, 67]), (45, [52, 57, 61, 64])] * 2
# heroic minor tune built from the ending theme's opening (A D F A / G F E D)
CAP_MEL = [
    (0, 69, .5), (.5, 74, .5), (1, 77, 1), (2, 81, 2), (4, 79, 1), (5, 77, .5), (5.5, 76, .5), (6, 74, 2),
    (8, 74, .5), (8.5, 77, .5), (9, 82, 1.5), (10.5, 81, .5), (11, 79, 1), (12, 77, 2), (14, 74, 2),
    (16, 76, .5), (16.5, 79, .5), (17, 84, 1.5), (18.5, 82, .5), (19, 81, 1), (20, 79, 1), (21, 77, 1), (22, 76, 2),
    (24, 73, 1), (25, 76, 1), (26, 81, 2), (28, 79, .5), (28.5, 77, .5), (29, 76, 1), (30, 73, 2),
]
def captain():
    sp = song('captain', 140, 128, {'base': 128}, {'base': -17})
    s = sp['score']; B = 'base'
    for k, (bass, pad) in enumerate(CAP_SLOTS):
        b0 = k * 8
        # strings: spiccato 8ths (cellos + violas) and violin pad
        for i in range(16):
            bb = b0 + i * .5
            s.add(B, P('vc_spic'), bb, bass + 12 if bass < 43 else bass, .5, .66 if i % 4 == 0 else .5)
            s.add(B, P('vla_spic'), bb, pad[1] + 12 if i % 2 else pad[2], .5, .45 if i % 2 else .38)
        s.add(B, P('cb_pizz'), b0, bass, 2, .66); s.add(B, P('cb_pizz'), b0 + 3, bass, 1, .5)
        s.add(B, P('cb_pizz'), b0 + 4, bass, 2, .62); s.add(B, P('cb_pizz'), b0 + 6.5, bass + 12, 1, .5)
        pad_chord(s, B, b0, [pad[1] + 12, pad[2] + 12], 8, .38)
        # brass stabs
        s.chord(B, P('tbn_stac'), b0, [bass + 12, pad[1]], vel=.62)
        s.chord(B, P('horn_stac'), b0 + 3.5, [pad[1] + 12, pad[2] + 12], vel=.5)
        s.chord(B, P('horn_stac'), b0 + 4, [pad[1] + 12, pad[2] + 12], vel=.6)
        # timpani on the downbeats
        s.add(B, P('timp'), b0, bass if bass <= 47 else bass - 12, 2, .7)
        s.add(B, P('timp'), b0 + 4, bass if bass <= 47 else bass - 12, 2, .55)
    # melody: horns first time, trumpets + xylophone an octave up the second time
    for rep in range(4):
        base = rep * 32
        for (bb, m, d) in CAP_MEL:
            if rep in (0, 2):
                s.add(B, P('horn'), base + bb, m - 12, d, .62)
            else:
                s.add(B, P('tpt_stac'), base + bb, m, d, .6)
                s.add(B, P('horn'), base + bb, m - 12, d, .55)
                s.add(B, P('xylo'), base + bb, m + 12, d, .5)
            if rep >= 2:
                s.add(B, P('vln'), base + bb, m, d, .45)
    # drums
    for bar in range(32):
        b0 = bar * 4
        s.add(B, P('bd'), b0, 62, 1, .68); s.add(B, P('bd'), b0 + 2, 62, 1, .55); s.add(B, P('bd'), b0 + 2.5, 62, 1, .45)
        s.add(B, P('snare'), b0 + 1, 60, 1, .55); s.add(B, P('snare'), b0 + 3, 60, 1, .6)
        s.add(B, P('snare'), b0 + 3.75, 60, 1, .32)
        for i in range(8):
            s.add(B, P('tamb'), b0 + i * .5, 60, .5, .42 if i % 2 else .3)
        if bar % 4 == 3:
            for i, t in enumerate([2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75]):
                s.add(B, P('tom_hi' if i % 2 == 0 else 'tom_lo'), b0 + t, 62, 1, .48 + .025 * i)
        else:
            s.add(B, P('tom_lo'), b0 + 1.5, 62, 1, .5); s.add(B, P('tom_hi'), b0 + 3.5, 62, 1, .45)
        if bar % 8 == 0: s.add(B, P('crash'), b0, 60, 4, .55)
    sp['balance'] = {'base': {'horn': 0, 'tpt_stac': -2, 'xylo': -6, 'vln': -4, 'vc_spic': -4, 'vla_spic': -7, 'cb_pizz': -6,
                              'horn_stac': -5, 'tbn_stac': -5, 'snare': -4, 'bd': -6, 'tom_lo': -5, 'tom_hi': -5, 'timp': -3,
                              'tamb': -11, 'crash': -9}}
    return sp

# ============================================================== SHIP (mothership)
# D minor (Dorian/Lydian colours), 96 bpm, 24 bars = 60 s.
# base: celesta + vibes arpeggios, glass pad, bowed vibes, wine glasses, harp, flute, sub bass.
SHIP_SLOTS = [  # (bass, 4-note arpeggio chord, glassy top note)
    (38, [62, 65, 69, 76], 88), (46, [62, 65, 69, 76], 88), (43, [62, 65, 70, 74], 86), (45, [61, 64, 69, 76], 85),
    (41, [60, 65, 69, 72], 84), (46, [62, 65, 69, 76], 88), (43, [62, 67, 70, 74], 86), (45, [61, 64, 67, 76], 85),
    (41, [60, 64, 69, 72], 84), (48, [60, 64, 67, 74], 86), (46, [62, 65, 69, 76], 88), (45, [61, 64, 69, 76], 85),
]
SHIP_PAT = [0, 1, 2, 3, 2, 1, 2, 3]
SHIP_FLUTE = [(0, 69, 2), (2, 74, 2), (4, 77, 4), (8, 76, 4), (12, 74, 2), (14, 72, 2), (16, 70, 4), (20, 69, 8),
              (28, 72, 2), (30, 74, 2)]
def ship():
    sp = song('ship', 96, 96, {'base': 128, 'perc': 112, 'drive': 112}, {'base': -18, 'perc': -23, 'drive': -22}, reverb='big')
    s = sp['score']; B = 'base'
    for k, (bass, ch, top) in enumerate(SHIP_SLOTS):
        b0 = k * 8
        up = 12 if (k // 2) % 2 else 0
        for i in range(16):
            n = ch[SHIP_PAT[i % 8]] + up
            inst = 'celesta' if i % 2 == 0 else 'vibes'
            s.add(B, P(inst), b0 + i * .5, n, .5, (.5 if i % 4 == 0 else .4) * (0.9 if inst == 'vibes' else 1))
        s.add(B, P('pad_glass'), b0, ch[0] - 12, 8, .55)
        s.add(B, P('pad_glass'), b0, ch[2] if bass == 46 else ch[2] - 12, 8, .4)
        s.add(B, P('pad_glass'), b0, ch[3], 8, .35)
        s.add(B, P('vibes_bowed'), b0, ch[1], 8, .5)
        if k % 2 == 0: s.add(B, P('glass'), b0 + 2, top if 74 <= top <= 87 else top - 12, 6, .5)
        s.add(B, P('sub'), b0, bass, 7.5, .55)
        s.add(B, P('harp'), b0, bass, 1, .45)
        s.add(B, P('harp'), b0 + 4, bass + 12, 1, .35)
        if k in (0, 6): s.add(B, P('marktree'), b0, 65, 4, .2)
    for (bb, m, d) in SHIP_FLUTE:
        s.add(B, P('flute'), 32 + bb, m, d, .42)
    for (bb, m, d) in SHIP_FLUTE[:6]:
        s.add(B, P('glock'), 64 + bb, m + 12, d, .3)
    # ---------- perc: alien-ish hand drums
    for bar in range(24):
        b0 = bar * 4
        hits = [(0, 'frame', 61, .62), (.75, 'frame', 64, .4), (1.5, 'frame', 61, .5), (2.5, 'frame', 64, .45), (3, 'frame', 61, .55),
                (1, 'perc', I.LOG_HI, .45), (2.75, 'perc', I.LOG_LO, .5), (3.5, 'perc', I.LOG_HI, .4)]
        for t, inst, n, v in hits: s.add('perc', P(inst), b0 + t, n, 1, v)
        for i in range(16):
            s.add('perc', P('shaker'), b0 + i * .25, 62 if i % 2 else 63, .25, .42 if i % 4 == 2 else .3)
        s.add('perc', P('bd'), b0, 62, 1, .5); s.add('perc', P('bd'), b0 + 2.5, 62, 1, .4)
        if bar % 2 == 1: s.add('perc', P('tamb'), b0 + 3, 60, 1, .4)
        if bar % 4 == 3:
            for i, t in enumerate([2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75]):
                s.add('perc', P('tom_hi' if i % 2 == 0 else 'tom_lo'), b0 + t, 62, 1, .42 + .04 * i)
        if bar % 2 == 0:
            r = SHIP_SLOTS[bar // 2][0]; r = r if r <= 47 else r - 12
            s.add('perc', P('timp'), b0, r, 2, .5)
    # ---------- drive: cello/bass ostinato + horn hits
    for k, (bass, ch, top) in enumerate(SHIP_SLOTS):
        b0 = k * 8
        r = bass if bass >= 40 else bass + 12
        for i in range(16):
            n = [r, r, r + 7, r, r + 12, r, r + 7, r + 12][i % 8]
            s.add('drive', P('vc_spic'), b0 + i * .5, n, .5, .62 if i % 4 == 0 else .45)
        for i in range(16):
            s.add('drive', P('vla_spic'), b0 + i * .5 + .25, ch[i % 2 + 1], .25, .3)
        s.add('drive', P('cb_pizz'), b0, bass, 2, .6); s.add('drive', P('cb_pizz'), b0 + 4, bass, 2, .5)
        s.chord('drive', P('horn_stac'), b0, [ch[0], ch[1] , ch[2]], vel=.55)
        s.chord('drive', P('horn_stac'), b0 + 1.5, [ch[0], ch[1], ch[2]], vel=.45)
        s.chord('drive', P('tbn_stac'), b0 + 6.5, [bass + 12, bass + 19], vel=.45)
        s.chord('drive', P('horn_stac'), b0 + 7, [ch[0], ch[1], ch[2]], vel=.5)
    sp['balance'] = {
        'base': {'celesta': 0, 'vibes': -2, 'flute': -1, 'pad_glass': -8, 'vibes_bowed': -9, 'glass': -8, 'sub': -7, 'harp': -8, 'glock': -6, 'marktree': -14},
        'perc': {'frame': 0, 'perc': -3, 'bd': -4, 'timp': -3, 'tom_hi': -4, 'tom_lo': -4, 'shaker': -11, 'tamb': -10},
        'drive': {'vc_spic': 0, 'horn_stac': -3, 'vla_spic': -8, 'tbn_stac': -5, 'cb_pizz': -4}}
    return sp

# ============================================================== GLORBAX (boss2)
# 168 bpm. 4-bar intro (plays once) + 32-bar loop. base = the whole band; rage = extra layer.
BOSS_RIFF = [38, 38, 50, 38, 41, 38, 49, 38, 44, 38, 50, 43, 38, 44, 45, 47]
SHIFT = [0, 0, 3, 0, 5, 3, -2, 1]
LEAD = [74, 77, 80, 77, 81, 80, 77, 74]
def boss2():
    IB = 16
    sp = song('boss2', 168, 128, {'base': 128, 'rage': 112}, {'base': -17, 'rage': -21}, intro_beats=IB)
    s = sp['score']; B = 'base'; R = 'rage'
    o = dict(intro=True)
    # ---- intro (4 bars): two big diminished stabs, a drum-roll build, then the riff sneaks in
    for b0, sh in ((0, 0), (4, 1)):
        dim = [n + sh for n in (50, 53, 56, 59)]
        s.chord(B, P('organ'), b0, [n + 12 for n in dim], 3.5, .8, **o)
        s.chord(B, P('tbn_stac'), b0, [38 + sh, 50 + sh], vel=.85, **o)
        s.chord(B, P('horn'), b0, dim, 3, .7, **o)
        s.add(B, P('timp'), b0, 38 + sh if 38 + sh >= 36 else 38, 3, .9, **o)
        s.add(B, P('gong'), b0, 60, 4, .55, **o)
        s.add(B, P('bd'), b0, 62, 2, .8, **o)
        s.chord(B, P('vc_trem'), b0, [38 + sh + 12, 44 + sh + 12], 3.8, .6, **o)
    for i in range(16):                       # bar 3: toms & log drums racing up
        t = 8 + i * .25
        s.add(B, P('tom_lo' if i < 6 else 'tom_hi'), t, 62, 1, .45 + i * .025, **o)
        if i % 2: s.add(B, P('perc'), t, I.LOG_HI if i > 8 else I.LOG_LO, 1, .5, **o)
    for i in range(8):                        # chromatic xylophone run
        s.add(B, P('xylo'), 10 + i * .25, 74 + i, .25, .5 + i * .03, **o)
    for i in range(16):                       # bar 4: the riff alone, quietly, with a snare roll
        s.add(B, P('vc_spic'), 12 + i * .25, BOSS_RIFF[i] + 12, .25, .5, **o)
        s.add(B, P('cb_pizz'), 12 + i * .25, BOSS_RIFF[i], .25, .4, **o)
    s.add(B, P('perc'), 12, I.SN_ROLL, 4, .7, **o)
    s.add(B, P('scym'), 12, 66, 4, .6, **o)
    # ---- loop
    for bar in range(32):
        b0 = bar * 4; sh = SHIFT[bar % 8]; sec = bar // 8
        for st in range(16):
            t = b0 + st * .25; n = BOSS_RIFF[st] + sh
            s.add(B, P('vc_spic'), t, n + 12, .25, .62 if st % 4 == 0 else .5)
            s.add(B, P('cb_pizz'), t, n if n >= 28 else n + 12, .25, .5 if st % 4 == 0 else .35)
            if st % 2 == 0: s.add(B, P('bassoon'), t, n + 12, .25, .55)
        # spooky organ/brass stabs on steps 0, 6, 12 (diminished chords)
        root = 62 + sh
        for st in (0, 6, 12):
            s.chord(B, P('organ'), b0 + st * .25, [root, root + 3, root + 6, root + 9], .5, .65)
            s.chord(B, P('horn_stac'), b0 + st * .25, [root - 12, root - 9, root - 6], vel=.55)
        # drums
        for st in (0, 4, 8, 12, 14):
            s.add(B, P('bd'), b0 + st * .25, 62, 1, .7 if st == 0 else .55)
        s.add(B, P('snare'), b0 + 1, 61, 1, .6); s.add(B, P('snare'), b0 + 3, 61, 1, .62)
        for i in range(8): s.add(B, P('tamb'), b0 + i * .5 + .25 * (i % 2 == 1) * 0, 60, .5, .38 if i % 2 else .28)
        if bar % 2 == 0: s.add(B, P('timp'), b0, 38 + sh if 36 <= 38 + sh <= 47 else 38, 2, .62)
        if bar % 8 == 7:
            for i, t in enumerate([2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75]):
                s.add(B, P('tom_hi' if i % 2 == 0 else 'tom_lo'), b0 + t, 62, 1, .48 + .025 * i)
        if bar % 8 == 0: s.add(B, P('crash'), b0, 60, 4, .55)
        # section colours
        if sec in (1, 3):     # the wiggly lead (xylophone + piccolo)
            for i in range(8):
                m = LEAD[i] + (12 if bar % 2 else 0) + sh
                s.add(B, P('xylo'), b0 + i * .5, m, .5, .55)
                s.add(B, P('piccolo'), b0 + i * .5, m + 12 if m + 12 <= 104 else m, .5, .4)
        if sec in (2, 3):     # villain march in the brass
            mel = [(0, 62, 1), (1, 65, .5), (1.5, 68, .5), (2, 67, 1), (3, 65, .5), (3.5, 62, .5)]
            for bb, m, d in mel:
                s.add(B, P('horn'), b0 + bb, m + sh, d, .62)
                s.add(B, P('tpt_stac'), b0 + bb, m + sh + 12, d, .5)
        if bar % 4 == 2: s.add(B, P('perc'), b0 + 2, I.RATCHET, 1, .45)
        # ---- rage layer: double-time toms, organ chords held, glock shrieks, anvil
        for st in range(16):
            s.add(R, P('tom_hi' if st % 4 in (1, 3) else 'tom_lo'), b0 + st * .25, 62, 1, .5 if st % 4 == 0 else .38)
        s.chord(R, P('organ'), b0, [root + 12, root + 15, root + 18], 4, .55)
        for i in range(4):
            s.add(R, P('glock'), b0 + i, [89, 92, 95, 92][i] + sh, 1, .35)
        s.add(R, P('perc'), b0 + 1, I.ANVIL, 1, .38); s.add(R, P('perc'), b0 + 3, I.ANVIL, 1, .42)
        s.chord(R, P('tbn_stac'), b0 + 3.5, [38 + sh + 12, 45 + sh + 12], vel=.6)
    sp['balance'] = {
        'base': {'vc_spic': 0, 'bassoon': -5, 'cb_pizz': -4, 'organ': -3, 'horn_stac': -5, 'bd': -4, 'snare': -3, 'tamb': -11, 'timp': -2,
                 'tom_hi': -4, 'tom_lo': -4, 'crash': -9, 'xylo': -2, 'piccolo': -7, 'horn': -1, 'tpt_stac': -4, 'perc': -6, 'tbn_stac': -3,
                 'gong': -4, 'vc_trem': -4, 'scym': -9},
        'rage': {'tom_lo': 0, 'tom_hi': 0, 'organ': -2, 'glock': -6, 'perc': -6, 'tbn_stac': -3}}
    return sp

# ============================================================== TITLE (loop) and THEME (ending)
# Lincoln's ending tune from js/audio.js: [beat, midi, length, chord]
THEME = [
    [0, 69, 1, [50, 57, 62, 66]], [1, 74, 1], [2, 78, 1], [3, 81, 1],
    [4, 79, 1, [43, 55, 59, 62]], [5, 78, 1], [6, 76, 1], [7, 74, 1],
    [8, 71, 1, [47, 54, 59, 62]], [9, 74, 1], [10, 79, 1], [11, 83, 1],
    [12, 81, 3, [45, 52, 57, 61]],
    [16, 78, 1, [50, 57, 62, 66]], [17, 76, 1], [18, 74, 1], [19, 76, 1],
    [20, 78, 1, [43, 55, 59, 62]], [21, 81, 1], [22, 86, 2],
    [24, 83, 1, [45, 52, 57, 61]], [25, 81, 1], [26, 79, 1], [27, 76, 1],
    [28, 74, 4, [50, 57, 62, 66]],
]
THEME_CHORDS = [(e[0], e[3]) for e in THEME if len(e) > 3]
def chord_at(beat):
    c = None
    for b, ch in THEME_CHORDS:
        if b <= beat: c = ch
    return c

def title():
    # 84 bpm, 16 bars = 45.7 s: the tune on piano, then on flute with a piano counter-line
    sp = song('title', 84, 64, {'base': 128}, {'base': -18}, reverb='big')
    s = sp['score']; B = 'base'
    for rep in (0, 1):
        o = rep * 32
        for i, (b, ch) in enumerate(THEME_CHORDS):
            nb = THEME_CHORDS[i + 1][0] if i + 1 < len(THEME_CHORDS) else 32
            d = nb - b
            pad_chord(s, B, o + b, [ch[1], ch[2], ch[3]], d, .36 if rep == 0 else .44)
            s.add(B, P('vc'), o + b, ch[0] + 12 if ch[0] < 48 else ch[0], d, .34 if rep == 0 else .42)
            # harp arpeggio in 8ths across the chord
            arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 24, ch[3] + 12, ch[2] + 12, ch[1] + 12]
            for j in range(int(d * 2)):
                s.add(B, P('harp'), o + b + j * .5, arp[j % 8], 1, .34 if j % 4 else .4)
            s.add(B, P('piano'), o + b, ch[0], d, .32)
        for e in THEME:
            b, m, ln = e[0], e[1], e[2]
            if rep == 0:
                s.add(B, P('piano'), o + b, m, ln, .5)
                s.add(B, P('celesta'), o + b + .5, m + 12, .5, .22) if ln >= 3 else None
            else:
                s.add(B, P('flute'), o + b, m, ln, .5)
                s.add(B, P('piano'), o + b, m - 12, ln, .32)
        if rep == 1:
            for b, n in ((0, 90), (16, 90), (22, 98 - 12)):
                s.add(B, P('glock'), o + b, n, 1, .28)
    s.add(B, P('marktree'), 31, 64, 4, .22)
    for j, n in enumerate([62, 66, 69, 74, 78, 81]):        # little harp lift back to the top of the loop
        s.add(B, P('harp'), 62 + j * 1 / 3, n, 1, .3 + j * .02)
    sp['balance'] = {'base': {'piano': 0, 'flute': 0, 'harp': -6, 'vc': -9, 'vla': -10, 'vln': -10, 'celesta': -9, 'glock': -9, 'marktree': -14}}
    return sp

def theme():
    # 100 bpm with a broadening at the end; plays once. Fanfare bar, the tune, the second half
    # again with the whole band, and a long final chord.
    sp = song('theme', 100, 0, {'base': 128}, {'base': -17}, once=True)
    s = sp['score']; B = 'base'
    base_spb = 0.6
    def tmap(beat):    # seconds; slows from beat 44 into the last chord
        if beat <= 44: return beat * base_spb
        x = beat - 44
        return 44 * base_spb + sum(base_spb * (1 + 0.09 * min(i, 4) ** 1.2) for i in range(int(x))) + (x - int(x)) * base_spb * (1 + 0.09 * min(int(x), 4) ** 1.2)
    s.tempo_map = tmap
    # fanfare (beats 0-3)
    s.chord(B, P('horn'), 0, [62, 66, 69], 1.6, .7)
    s.chord(B, P('tpt_stac'), 0, [74, 78], vel=.62)
    s.add(B, P('timp'), 0, 38, 2, .75); s.add(B, P('crash'), 0, 60, 4, .45)
    s.add(B, P('bd'), 0, 62, 1, .6)
    s.add(B, P('timp_roll'), 2, 45, 2, .45)
    for j, n in enumerate([62, 66, 69, 74, 78, 81, 86]):
        s.add(B, P('harp'), 2 + j * .25, n, 1, .4 + j * .02)
    O1 = 4; O2 = 4 + 32 - 16       # statement 1 starts at beat 4; statement 2 replays theme beats 16-31 from beat 36
    for i, (b, ch) in enumerate(THEME_CHORDS):
        nb = THEME_CHORDS[i + 1][0] if i + 1 < len(THEME_CHORDS) else 32
        for o, full in ((O1, False), (O2, True)):
            if full and b < 16: continue
            d = nb - b if not (full and b == 28) else 6
            pad_chord(s, B, o + b, [ch[1], ch[2], ch[3]], d, .42 if not full else .58, top=ch[3] + 12 if full else None)
            s.add(B, P('vc'), o + b, ch[0] + 12 if ch[0] < 48 else ch[0], d, .45 if not full else .58)
            s.add(B, P('cb_pizz'), o + b, ch[0] if ch[0] >= 40 else ch[0] + 12, 1, .5)
            s.add(B, P('cb_pizz'), o + b + 2, ch[0] if ch[0] >= 40 else ch[0] + 12, 1, .4)
            if not full:
                arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 24, ch[3] + 12, ch[2] + 12, ch[1] + 12]
                for j in range(d * 2):
                    s.add(B, P('harp'), o + b + j * .5, arp[j % 8], 1, .36 if j % 4 else .42)
            else:
                if b != 28:
                    for j in range(d * 2):
                        s.add(B, P('vla_spic'), o + b + j * .5, ch[2] + (12 if j % 2 else 0), .5, .42 if j % 2 else .5)
                s.add(B, P('timp'), o + b, ch[0] if ch[0] >= 40 else ch[0] + 12, 2, .6)
                s.chord(B, P('horn'), o + b, [ch[1] + 12, ch[2] + 12], min(d, 4), .45)
    for e in THEME:
        b, m, ln = e[0], e[1], e[2]
        s.add(B, P('flute'), O1 + b, m, ln, .55)
        s.add(B, P('glock'), O1 + b, m + 12, ln, .2)
        if b >= 16:
            L = ln if b != 28 else 6
            s.add(B, P('horn'), O2 + b, m - 12, L, .7)
            s.add(B, P('vln'), O2 + b, m, L, .6)
            s.add(B, P('flute'), O2 + b, m + 12 if m + 12 <= 96 else m, L, .5)
            if b in (16, 20, 24): s.add(B, P('tpt_stac'), O2 + b, m, 1, .5)
    s.add(B, P('crash'), O2 + 16, 60, 4, .5)
    s.add(B, P('perc'), O2 + 24, I.SN_ROLL, 4, .4)
    # the final chord (theme beat 28 of statement two = beat 48): big, warm, ringing
    f = O2 + 28
    s.add(B, P('crash'), f, 60, 4, .55); s.add(B, P('bd'), f, 62, 1, .65)
    s.add(B, P('timp_roll'), f, 38, 5.5, .5)
    s.chord(B, P('tpt_stac'), f, [74, 78, 81], vel=.55)
    for j, n in enumerate([62, 66, 69, 74, 78, 81, 86, 90, 93]):
        s.add(B, P('harp'), f + 1 + j * .22, n, 1, .38)
    s.add(B, P('glock'), f + 2, 98, 1, .3); s.add(B, P('glock'), f + 2.5, 102, 1, .25)
    s.add(B, P('marktree'), f + 1.5, 61, 4, .3)
    s.add(B, P('timp'), f + 6, 38, 2, .55)
    s.chord(B, P('vc_pizz'), f + 6, [50, 57], vel=.55); s.add(B, P('cb_pizz'), f + 6, 38 + 12, 1, .6)
    s.add(B, P('glock'), f + 6, 86, 1, .3)
    sp['total_beats'] = f + 6
    sp['balance'] = {'base': {'flute': 0, 'horn': 0, 'vln': -2, 'glock': -10, 'harp': -5, 'vc': -6, 'vla': -8, 'cb_pizz': -8, 'timp': -3,
                              'crash': -9, 'bd': -6, 'timp_roll': -6, 'tpt_stac': -3, 'vla_spic': -8, 'marktree': -14, 'vc_pizz': -8, 'perc': -9}}
    return sp

# ============================================================== INTRO (tense cutscene)
def intro():
    sp = song('intro', 120, 64, {'base': 128}, {'base': -19})
    s = sp['score']; B = 'base'
    plan = [(50, [57, 62], 74 + 7), (49, [57, 64], 82), (50, [57, 65], 81), (49, [56, 64], 82)] * 2   # D / C#, rising tension
    for k, (low, mid, high) in enumerate(plan):
        b0 = k * 8
        s.add(B, P('vc_trem'), b0, low, 8, .55); s.add(B, P('vc_trem'), b0, low - 12, 8, .5)
        s.chord(B, P('vc_trem'), b0, mid, 8, .4)
        s.add(B, P('vln'), b0, high if high <= 86 else high - 12, 8, .32)
        s.add(B, P('pad_warm'), b0, low - 12, 8, .5)
        for i in range(16):
            s.add(B, P('cb_pizz'), b0 + i * .5, 38 if low == 50 else 37, .5, .42 if i % 2 == 0 else .3)
        s.add(B, P('timp'), b0, 38 if low == 50 else 37, 2, .6)
        s.add(B, P('bd'), b0 + 4, 62, 1, .35)
        if k % 2 == 1: s.add(B, P('scym'), b0 + 4, 66, 4, .4)
        if k == 7:
            s.add(B, P('timp_roll'), b0 + 4, 45, 4, .5)
    for k in range(16):
        s.add(B, P('perc'), k * 4 + 2, I.CLAVES, 1, .25)
    sp['balance'] = {'base': {'vc_trem': 0, 'cb_pizz': -4, 'timp': -2, 'vln': -8, 'pad_warm': -8, 'bd': -6, 'scym': -9, 'timp_roll': -4, 'perc': -14}}
    return sp

SONGS = dict(mars=mars, captain=captain, ship=ship, boss2=boss2, title=title, theme=theme, intro=intro)
