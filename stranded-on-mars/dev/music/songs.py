# The "homemade" Stranded on Mars soundtrack, written as note lists.
# Beats are quarter notes. Every song returns a spec the builder renders into stems.
#
# Every song is built on LINCOLN'S THEME: the tune Lincoln Kenyon played on his keyboard (transcribed
# from his demo, October 2026). Like a film score, each song puts the same theme in a different mood.
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

# ============================================================== LINCOLN'S THEME
# 12 bars of 4/4 in A minor. Two voices a third apart: the upper note pulses in steady eighths (his right
# hand) and the lower note is struck on every beat (his left hand). (lower, upper) per bar, A4 = 69.
LT = [(69, 72), (67, 71), (69, 72), (67, 71), (65, 69), (67, 71), (65, 69), (64, 67), (64, 67), (69, 72), (69, 72), (67, 71)]
LT_BASS = [45, 43, 45, 43, 41, 43, 41, 40, 40, 45, 45, 43]           # the chord roots his thirds imply: Am G Am G F G F Em Em Am Am G
TRIAD = {45: [57, 60, 64], 43: [55, 59, 62], 41: [53, 57, 60], 40: [52, 55, 59], 48: [55, 60, 64], 49: [56, 61, 64]}

def lt_bar(k, ring=True, extras=True, major=False):
    """His bar k (0-11), as he played it: [(beat in bar, midi, beats, 'up'|'low', accent)].
    ring: bar 12 stops on beat 3 and rings (his ending); otherwise it keeps pulsing.
    extras: his added notes (E under the A in bar 1, the D / F 'wiggle' around E in bar 8).
    major: A/C becomes A/C# (for the triumphant ending)."""
    lo, up = LT[k]
    if major and lo == 69: up = 73
    U = [up] * 8
    L = {0: [lo], 2: [lo], 4: [lo], 6: [lo]}
    if k in (0, 2): L[7] = [lo]                                 # the A again on the "and" of 4 (bars 1 and 3)
    if extras and k == 0: L[2] = [lo, lo - 5]                   # an E under the A on beat 2
    if k == 3: U[6] = up - 2; L.update({5: [lo], 7: [lo]})      # B-A-B turn while his left hand plays eighths
    if k == 5: U[7] = None                                      # a breath
    if extras and k == 7: L[2] = [lo, lo - 2]; L[4] = [lo, lo + 1]   # E with D below, then with F above
    if k == 8: U = [up, up, up, None, up, None, up, None]       # the pulse stops: quarter-note thirds
    if k == 11 and ring: U = [up] * 5 + [None] * 3
    ev = []
    for i, m in enumerate(U):
        if m is None: continue
        ln = 2.0 if (k == 11 and ring and i == 4) else 1.0 if (k == 8 and i >= 4) else .5
        ev.append((i * .5, m, ln, 'up', 1.0 if i % 2 == 0 else .82))
    for i, ms in L.items():
        if k == 11 and ring and i > 4: continue
        for j, m in enumerate(ms):
            ln = 2.0 if (k == 11 and ring and i == 4) else .5 if ((i + 1) in L or j > 0) else 1.0
            ev.append((i * .5, m, ln, 'low', 1.0 if j == 0 else .8))
    return ev

def put_lt(s, stem, b0, k, up=(), low=(), ring=True, extras=True, major=False, beats_only=False, length=None, scale=1):
    """Play his bar k at beat b0. up / low: lists of (instrument, transpose, velocity). scale=2 plays it
    at half speed (his eighths become quarter notes)."""
    for (bb, m, ln, v, acc) in lt_bar(k, ring, extras, major):
        if beats_only and v == 'up' and bb % 1: continue
        for name, tr, vel in (up if v == 'up' else low):
            s.add(stem, P(name), b0 + bb * scale, m + tr, (length or ln) * scale, vel * acc)

# A singing line over his chords for the melody instruments. Its long notes follow his upper voice
# (C B C B A B A G G C C B) and it borrows his two gestures: the B-A-B turn of bar 4 and the E-D-F-E
# wiggle of bar 8. (beat in bar, midi, beats) per bar.
LT_SONG = [
    [(0, 76, 1.5), (1.5, 74, .5), (2, 72, 2)],
    [(0, 71, 1.5), (1.5, 69, .5), (2, 71, 1), (3, 74, 1)],
    [(0, 76, 1.5), (1.5, 74, .5), (2, 72, 1), (3, 76, 1)],
    [(0, 74, 2), (2, 71, 1), (3, 69, .5), (3.5, 71, .5)],
    [(0, 72, 1.5), (1.5, 69, .5), (2, 69, 2)],
    [(0, 71, 1.5), (1.5, 74, .5), (2, 79, 2)],
    [(0, 77, 1.5), (1.5, 76, .5), (2, 72, 1), (3, 69, 1)],
    [(0, 76, 1), (1, 74, 1), (2, 77, 1), (3, 76, 1)],
    [(0, 76, 2), (2, 74, 1), (3, 71, 1)],
    [(0, 72, 3), (3, 76, 1)],
    [(0, 81, 2), (2, 79, 1), (3, 76, 1)],
    [(0, 74, 2), (2, 71, 2)],
]
def song_bar(k, major=False):
    out = []
    for (bb, m, d) in LT_SONG[k]:
        if major and k in (0, 2, 9) and m == 72: m = 73
        if major and k == 10 and m == 79: m = 78
        out.append((bb, m, d))
    return out

def harp_lift(s, stem, beat, notes, step=1 / 3, vel=.3):
    for j, n in enumerate(notes):
        s.add(stem, P('harp'), beat + j * step, n, 1, vel + j * .02)

# ============================================================== TITLE (loop)
# 96 bpm, 24 bars = 60 s. His theme twice: first on piano, just as he played it, with a soft bass;
# then the flute sings over it while the strings and a celesta join in.
def title():
    sp = song('title', 96, 96, {'base': 128}, {'base': -18}, reverb='big')
    s = sp['score']; B = 'base'
    for rep in (0, 1):
        for k in range(12):
            b0 = (rep * 12 + k) * 4
            r = LT_BASS[k]; tri = TRIAD[r]
            put_lt(s, B, b0, k, up=[('piano', 0, .5 if rep == 0 else .42)], low=[('piano', 0, .44 if rep == 0 else .38)])
            s.add(B, P('piano'), b0, r, 4 if k != 11 else 3, .36)              # left hand: root, then the fifth
            s.add(B, P('piano'), b0 + 2, r + 7, 2, .26)
            if rep == 0 and k >= 4:
                pad_chord(s, B, b0, [tri[0], tri[2]], 4, .3)
                s.add(B, P('vc'), b0, r if r >= 43 else r + 12, 4, .3)
            if rep == 1:
                pad_chord(s, B, b0, tri, 4, .36)
                s.add(B, P('vc'), b0, r if r >= 43 else r + 12, 4, .38)
                for (bb, m, d) in song_bar(k):
                    s.add(B, P('flute'), b0 + bb, m, d, .52)
                    if k >= 6: s.add(B, P('vln'), b0 + bb, m - 12, d, .3)
                lo, up = LT[k]
                s.add(B, P('celesta'), b0, up + 12, 1, .3)                     # his upper note, high, on each downbeat
                s.add(B, P('celesta'), b0 + 2, up + 12, 1, .24)
            if k in (0, 4, 8):                                                  # harp rolls at phrase starts
                s.chord(B, P('harp'), b0, [r + 12] + [n + 12 for n in tri], vel=.36 if rep == 0 else .42, strum=.07)
        harp_lift(s, B, rep * 48 + 46.5, [55, 59, 62, 67, 71, 74], step=.25)     # back up into the next pass
    s.add(B, P('glock'), 48, 96, 1, .26); s.add(B, P('glock'), 49, 93, 1, .22)
    s.add(B, P('marktree'), 47, 64, 4, .22)
    sp['balance'] = {'base': {'piano': 0, 'flute': -1, 'harp': -7, 'vc': -10, 'vla': -11, 'vln': -10, 'celesta': -10, 'glock': -10, 'marktree': -14}}
    return sp

# ============================================================== THEME (the ending, plays once)
# 100 bpm, slowing at the end. Two bars of F and G swell into A MAJOR, then his theme with the whole
# orchestra (his thirds in the brass and strings, the singing line on top), and a big F - G - A ending.
def theme():
    sp = song('theme', 100, 0, {'base': 128}, {'base': -17}, once=True)
    s = sp['score']; B = 'base'
    spb = 0.6
    RIT = 60                      # beat where the broadening starts
    def tmap(beat):
        if beat <= RIT: return beat * spb
        x = beat - RIT; t = RIT * spb; i = 0
        while i + 1 <= x:
            t += spb * (1 + 0.06 * min(i, 8) ** 1.15); i += 1
        return t + (x - i) * spb * (1 + 0.06 * min(i, 8) ** 1.15)
    s.tempo_map = tmap
    # ---- intro: F then G, swelling (beats 0-8)
    for b0, root, tri in ((0, 41, [53, 57, 60]), (4, 43, [55, 59, 62])):
        pad_chord(s, B, b0, tri, 4, .4 + b0 * .03, top=tri[2] + 12, gain=.7)
        s.chord(B, P('horn'), b0, [tri[1], tri[2]], 4, .5 + b0 * .03)
        s.add(B, P('vc'), b0, root, 4, .5); s.add(B, P('cb_pizz'), b0, root - 12 if root - 12 >= 28 else root, 1, .55)
        s.add(B, P('timp'), b0, root if root >= 40 else root + 12, 2, .55)
    s.add(B, P('timp_roll'), 4, 43, 4, .5)
    s.add(B, P('perc'), 6, I.SN_ROLL, 2, .4)
    for j, n in enumerate([55, 59, 62, 67, 71, 74, 79, 83, 86]):
        s.add(B, P('harp'), 6 + j * .22, n, 1, .36 + j * .02)
    # his opening motif announced by the trumpets over the G chord (G/B, as in his bar 2)
    for i in range(8):
        s.add(B, P('tpt_stac'), 4 + i * .5, 71, .5, .5 + i * .03)
    # ---- his theme, in A major, beats 8-56
    O = 8
    for k in range(12):
        b0 = O + k * 4
        r = LT_BASS[k]
        if k in (0, 2, 9, 10): tri = [57, 61, 64]                       # A major
        elif k in (7, 8): r = 48; tri = [55, 60, 64]                    # his E/G over C
        else: tri = TRIAD[r]
        full = k >= 4
        # his thirds: violins (upper, eighths) and violas (lower), trumpets on the beats, glockenspiel sparkle
        put_lt(s, B, b0, k, up=[('vln_spic', 12, .5 if full else .44)], low=[('vla_spic', 0, .46)], major=True, ring=False)
        put_lt(s, B, b0, k, up=[('tpt_stac', 0, .48 if full else .4)], low=[('horn_stac', 0, .45)], major=True, ring=False, beats_only=True)
        if k % 2 == 0: put_lt(s, B, b0, k, up=[('glock', 24, .2)], low=[], major=True, ring=False, beats_only=True)
        # the singing line: flute + violins, horns an octave below from bar 5
        for (bb, m, d) in song_bar(k, major=True):
            s.add(B, P('flute'), b0 + bb, m + 12 if m + 12 <= 93 else m, d, .5)
            s.add(B, P('vln'), b0 + bb, m, d, .52 if full else .42)
            if full: s.add(B, P('horn'), b0 + bb, m - 12, d, .58)
        # harmony + bass
        pad_chord(s, B, b0, [tri[0], tri[2]], 4, .4 if not full else .48, gain=.5)
        s.add(B, P('vc'), b0, r if r >= 40 else r + 12, 4, .5)
        s.add(B, P('cb_pizz'), b0, r - 12 if r - 12 >= 28 else r, 1, .55); s.add(B, P('cb_pizz'), b0 + 2, r - 12 if r - 12 >= 28 else r, 1, .45)
        s.add(B, P('tuba_stac'), b0, r - 12 if r - 12 >= 29 else r, 1, .45)
        s.add(B, P('timp'), b0, r if r >= 40 else r + 12, 1, .55)
        if full: s.add(B, P('timp'), b0 + 2, r if r >= 40 else r + 12, 1, .42)
        s.add(B, P('bd'), b0, 62, 1, .5)
        if full:
            s.add(B, P('snare'), b0 + 1, 60, 1, .32); s.add(B, P('snare'), b0 + 3, 60, 1, .36)
        if k in (0, 4, 9): s.add(B, P('crash'), b0, 60, 4, .45)
        if k in (0, 4, 8):
            for j, n in enumerate([tri[0], tri[1], tri[2], tri[0] + 12, tri[1] + 12, tri[2] + 12, tri[0] + 24]):
                s.add(B, P('harp'), b0 + j * .25, n, 1, .36)
    # ---- ending: F, G, then a big A major (beats 56-...)
    E = O + 48
    for b0, root, tri, k in ((E, 41, [53, 57, 60], 4), (E + 4, 43, [55, 59, 62], 5)):
        put_lt(s, B, b0, k, up=[('vln_spic', 12, .55), ('tpt_stac', 0, .55)], low=[('vla_spic', 0, .5), ('horn_stac', 0, .5)], ring=False)
        pad_chord(s, B, b0, tri, 4, .55, top=tri[2] + 12, gain=.6)
        s.chord(B, P('horn'), b0, [tri[1], tri[2]], 4, .62)
        s.add(B, P('vc'), b0, root, 4, .6); s.add(B, P('cb_pizz'), b0, root - 12, 1, .6); s.add(B, P('tuba_stac'), b0, root - 12, 1, .5)
        s.add(B, P('timp'), b0, root, 1, .6); s.add(B, P('timp'), b0 + 2, root, 1, .5)
        s.add(B, P('snare'), b0 + 1, 60, 1, .4); s.add(B, P('snare'), b0 + 3, 60, 1, .42)
    s.add(B, P('flute'), E, 84, 4, .5); s.add(B, P('flute'), E + 4, 86, 4, .55)          # the flute climbs C - D - (E)
    s.add(B, P('vln'), E, 72, 4, .55); s.add(B, P('vln'), E + 4, 74, 4, .6)
    s.add(B, P('timp_roll'), E + 6, 43, 2, .5); s.add(B, P('perc'), E + 6, I.SN_ROLL, 2, .45)
    f = E + 8                                                                           # the final chord
    s.add(B, P('crash'), f, 60, 4, .6); s.add(B, P('bd'), f, 62, 1, .7); s.add(B, P('gong'), f, 60, 4, .3)
    for i in range(4):                                                                  # his pulse, one last time, on A/C#
        s.add(B, P('tpt_stac'), f + i * .5, 73, .5, .58 - i * .03); s.add(B, P('vln_spic'), f + i * .5, 85, .5, .5)
        if i % 2 == 0: s.add(B, P('horn_stac'), f + i * .5, 69, .5, .55)
    s.chord(B, P('horn'), f + 2, [57, 61, 64, 69], 6, .65)
    pad_chord(s, B, f, [57, 61, 64], 8, .6, top=76, gain=.6)
    s.add(B, P('vln'), f, 81, 8, .55); s.add(B, P('flute'), f, 88, 8, .5)
    s.add(B, P('vc'), f, 45, 8, .62); s.add(B, P('vc'), f, 57, 8, .5)
    s.add(B, P('timp_roll'), f, 45, 5.5, .55)
    s.add(B, P('cb_pizz'), f, 33, 1, .65); s.add(B, P('tuba_stac'), f, 33, 1, .55)
    for j, n in enumerate([57, 61, 64, 69, 73, 76, 81, 85, 88, 93]):
        s.add(B, P('harp'), f + 1 + j * .2, n, 1, .38)
    s.add(B, P('glock'), f + 2, 97, 1, .3); s.add(B, P('glock'), f + 2.5, 100, 1, .25)
    s.add(B, P('marktree'), f + 1.5, 61, 4, .3)
    s.add(B, P('timp'), f + 6, 45, 2, .62)                                              # the button
    s.chord(B, P('vc_pizz'), f + 6, [45, 57], vel=.6); s.add(B, P('cb_pizz'), f + 6, 33, 1, .65)
    s.chord(B, P('tpt_stac'), f + 6, [69, 73, 76], vel=.5); s.add(B, P('glock'), f + 6, 93, 1, .3)
    sp['total_beats'] = f + 6
    sp['balance'] = {'base': {'flute': 0, 'vln': -1, 'horn': -1, 'vln_spic': -3, 'vla_spic': -7, 'tpt_stac': -3, 'horn_stac': -6,
                              'glock': -11, 'harp': -6, 'vc': -6, 'vla': -9, 'cb_pizz': -8, 'tuba_stac': -9, 'timp': -4, 'timp_roll': -7,
                              'crash': -9, 'bd': -7, 'snare': -10, 'perc': -10, 'marktree': -14, 'vc_pizz': -8, 'gong': -12}}
    return sp

# ============================================================== MARS (explore + combat)
# 108 bpm, 24 bars = 53.3 s. base: his theme on a soft high piano (his own register) with a low piano
# bass, harp and gentle strings; the second time the harp carries his thirds while the piano sings the
# melody in octaves (a Breath of the Wild sort of piano). perc: drums, toms, shaker, timpani.
# drive: cello gallop, pizzicato bass, and the horns hammering his thirds on every beat.
def mars():
    sp = song('mars', 108, 96, {'base': 128, 'perc': 112, 'drive': 112}, {'base': -18, 'perc': -23, 'drive': -22})
    s = sp['score']; B = 'base'
    for rep in (0, 1):
        for k in range(12):
            b0 = (rep * 12 + k) * 4
            r = LT_BASS[k]; tri = TRIAD[r]
            if rep == 0:
                put_lt(s, B, b0, k, up=[('piano', 12, .42)], low=[('piano', 12, .36)])
                s.add(B, P('piano'), b0, r, 4, .34)                                       # low bass note and its octave
                s.add(B, P('piano'), b0, r + 12, 4, .22)
                if k in (0, 2, 9): s.add(B, P('piano'), b0 + 3, 71, 1, .22)              # a soft B (the ninth) floats in
                if k >= 4: pad_chord(s, B, b0, [tri[0], tri[2]], 4, .3)
                if k in (0, 4, 8): s.chord(B, P('harp'), b0, [r + 12] + [n + 12 for n in tri], vel=.38, strum=.08)
            else:
                put_lt(s, B, b0, k, up=[('harp', 12, .4)], low=[('harp', 12, .34)])
                for (bb, m, d) in song_bar(k):
                    s.add(B, P('piano'), b0 + bb, m, d, .46); s.add(B, P('piano'), b0 + bb, m - 12, d, .34)
                s.add(B, P('piano'), b0, r, 4, .3)
                pad_chord(s, B, b0, tri, 4, .38)
                s.add(B, P('vc'), b0, r, 4, .36)
            if k in (0, 9):
                s.add(B, P('glock'), b0, 96, 1, .28); s.add(B, P('glock'), b0 + 1, 88, 1, .22)
        harp_lift(s, B, rep * 48 + 46.5, [55, 59, 62, 67, 71, 74], step=.25, vel=.28)
    s.add(B, P('marktree'), 47, 64, 4, .22)
    # ---------- perc layer
    for bar in range(24):
        b0 = bar * 4; k = bar % 12; ph = k % 4
        s.add('perc', P('bd'), b0, 62, 1, .62 if ph == 0 else .5)
        s.add('perc', P('bd'), b0 + 1.5, 62, 1, .4); s.add('perc', P('bd'), b0 + 2.5, 62, 1, .5)
        s.add('perc', P('snare'), b0 + 1, 60, 1, .42); s.add('perc', P('snare'), b0 + 3, 60, 1, .46)
        for i in range(8):
            s.add('perc', P('shaker'), b0 + i * .5, 62 if i % 2 else 63, .5, .5 if i % 2 else .38)
        s.add('perc', P('tamb'), b0 + 1, 60, 1, .4); s.add('perc', P('tamb'), b0 + 3, 60, 1, .44)
        if ph == 3:
            for i, (t, inst) in enumerate([(2, 'tom_hi'), (2.25, 'tom_hi'), (2.5, 'tom_lo'), (2.75, 'tom_lo'), (3, 'tom_hi'), (3.25, 'tom_hi'), (3.5, 'tom_lo'), (3.75, 'tom_lo')]):
                s.add('perc', P(inst), b0 + t, 62, 1, .45 + i * .025)
        else:
            s.add('perc', P('tom_lo'), b0 + .75, 62, 1, .42); s.add('perc', P('tom_hi'), b0 + 3.5, 62, 1, .4)
        r = LT_BASS[k]
        s.add('perc', P('timp'), b0, r if r >= 40 else r + 12, 2, .58)
        if ph == 0: s.add('perc', P('crash'), b0, 60, 4, .45 if k == 0 else .36)
    # ---------- drive layer
    for bar in range(24):
        b0 = bar * 4; k = bar % 12
        r = LT_BASS[k]; rr = r if r >= 40 else r + 12; tri = TRIAD[r]
        for beat in range(4):                                  # cello gallop: 8th + two 16ths
            s.add('drive', P('vc_spic'), b0 + beat, rr, .5, .62 if beat in (0, 2) else .5)
            s.add('drive', P('vc_spic'), b0 + beat + .5, rr, .25, .45)
            s.add('drive', P('vc_spic'), b0 + beat + .75, rr, .25, .48)
        for i in range(8):
            s.add('drive', P('vla_spic'), b0 + i * .5, tri[2] if i % 2 else tri[0], .5, .42 if i % 2 else .34)
        s.add('drive', P('cb_pizz'), b0, rr - 12, 2, .62); s.add('drive', P('cb_pizz'), b0 + 2, rr - 12, 2, .5)
        lo, up = LT[k]
        for (bb, m, ln, v, acc) in lt_bar(k, ring=False, extras=False):       # his thirds, struck together on his left-hand beats
            if v == 'low':
                s.chord('drive', P('horn_stac'), b0 + bb, [m - 12, m - 12 + (up - lo)], vel=.55 * acc)
        s.chord('drive', P('tbn_stac'), b0, [rr, rr + 7], vel=.55)
    sp['balance'] = {
        'base': {'piano': 0, 'harp': -5, 'vc': -10, 'vla': -11, 'vln': -11, 'glock': -10, 'marktree': -14},
        'perc': {'bd': 0, 'tom_lo': -2, 'tom_hi': -3, 'snare': -5, 'timp': -2, 'tamb': -10, 'shaker': -11, 'crash': -9},
        'drive': {'horn_stac': 0, 'vc_spic': -1, 'vla_spic': -7, 'tbn_stac': -6, 'cb_pizz': -4}}
    return sp

# ============================================================== CAPTAIN (Mars boss)
# 150 bpm, 32 bars = 51.2 s. One stem. His theme twice, heroic: first his thirds as a brass fanfare
# (trumpets pulsing his upper note, horns striking the lower one), then the singing line in horns and
# violins over his pulse on trumpets and xylophone; galloping cellos and drums throughout. Then an 8-bar
# build on his chords that ends with his E-D-F-E wiggle blasted by the brass.
CAP_BRIDGE = [(41, 65, 69), (43, 67, 71), (45, 69, 72), (45, 69, 72), (41, 65, 69), (43, 67, 71), (40, 68, 71), (40, 68, 71)]
def captain():
    sp = song('captain', 150, 128, {'base': 128}, {'base': -17})
    s = sp['score']; B = 'base'
    for bar in range(32):
        b0 = bar * 4
        if bar < 24:
            k = bar % 12; rep = bar // 12
            r = LT_BASS[k]
            if rep == 0:       # his thirds as a brass fanfare: trumpets pulse the upper note, horns strike the lower
                put_lt(s, B, b0, k, up=[('tpt_stac', 0, .58), ('vln_spic', 12, .42)], low=[('horn_stac', 0, .58), ('vla_spic', 12, .4)], ring=False)
            else:              # the singing line in horns and violins, his pulse on trumpets and xylophone
                put_lt(s, B, b0, k, up=[('tpt_stac', 0, .5), ('xylo', 24, .42)], low=[('vla_spic', 12, .42), ('horn_stac', 0, .45)], ring=False)
                for (bb, m, d) in song_bar(k):
                    s.add(B, P('horn'), b0 + bb, m - 12, d, .66)
                    s.add(B, P('vln'), b0 + bb, m, d, .5)
        else:
            j = bar - 24; r, lo, up = CAP_BRIDGE[j]
            if j < 6:
                for i in range(8):          # his pulse, low and urgent, in the strings
                    s.add(B, P('vla_spic'), b0 + i * .5, up - 12, .5, .5 if i % 2 == 0 else .42)
                    if i % 2 == 0: s.add(B, P('vc_spic'), b0 + i * .5, lo - 12, .5, .5)
                s.add(B, P('horn'), b0, lo, 4, .5 + j * .03)                         # his lower line, held, rising
                if j >= 4:
                    for i in range(8): s.add(B, P('tpt_stac'), b0 + i * .5, up, .5, .45 + i * .01)
            else:
                for rep in range(2):        # the wiggle, E D F E, blasted by the brass over E
                    for i, n in enumerate([64, 62, 65, 64]):
                        t = b0 + rep * 2 + i * .5
                        s.chord(B, P('tbn_stac'), t, [n - 12, n - 24 if n - 24 >= 34 else n - 12], vel=.6 + i * .02)
                        s.add(B, P('horn_stac'), t, n, .5, .58)
                        s.add(B, P('tpt_stac'), t, n + 12, .5, .5)
                pad_chord(s, B, b0, [52, 56, 59, 62], 4, .45, gain=.6)
        rb = r if r >= 40 else r + 12
        # strings engine: cello 8ths on the root, pizzicato bass, violin pad
        for i in range(8):
            s.add(B, P('vc_spic'), b0 + i * .5, rb, .5, .64 if i % 4 == 0 else .5)
        s.add(B, P('cb_pizz'), b0, rb - 12, 2, .66); s.add(B, P('cb_pizz'), b0 + 2.5, rb - 12, 1, .5)
        pad_chord(s, B, b0, TRIAD[r] if bar < 24 else [r + 12, r + 19], 4, .34, gain=.6)
        s.chord(B, P('tbn_stac'), b0, [rb, rb + 7], vel=.6)
        s.add(B, P('timp'), b0, rb, 2, .7); s.add(B, P('timp'), b0 + 2, rb, 2, .55)
        # drums
        s.add(B, P('bd'), b0, 62, 1, .68); s.add(B, P('bd'), b0 + 1.5, 62, 1, .45); s.add(B, P('bd'), b0 + 2, 62, 1, .58)
        s.add(B, P('snare'), b0 + 1, 60, 1, .55); s.add(B, P('snare'), b0 + 3, 60, 1, .6)
        for i in range(8):
            s.add(B, P('tamb'), b0 + i * .5, 60, .5, .42 if i % 2 else .3)
        last = (bar % 12 == 11 and bar < 24) or bar in (27, 31)
        if last:
            for i, t in enumerate([2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75]):
                s.add(B, P('tom_hi' if i % 2 == 0 else 'tom_lo'), b0 + t, 62, 1, .48 + .025 * i)
        else:
            s.add(B, P('tom_lo'), b0 + 1.5, 62, 1, .5); s.add(B, P('tom_hi'), b0 + 3.5, 62, 1, .45)
        if bar in (0, 4, 8, 12, 16, 20, 24, 28): s.add(B, P('crash'), b0, 60, 4, .55)
        if bar == 31: s.add(B, P('perc'), b0, I.SN_ROLL, 4, .5)
    sp['balance'] = {'base': {'tpt_stac': 0, 'horn': 0, 'horn_stac': -2, 'vln_spic': -5, 'xylo': -6, 'vln': -3, 'vla_spic': -7, 'vc_spic': -5,
                              'cb_pizz': -6, 'tbn_stac': -6, 'vc': -10, 'vla': -11, 'snare': -4, 'bd': -6,
                              'tom_lo': -5, 'tom_hi': -5, 'timp': -3, 'tamb': -11, 'crash': -9, 'perc': -8}}
    return sp

# ============================================================== SHIP (mothership)
# 96 bpm, 24 bars = 60 s. His theme, note for note, over strange new bass notes, so his A/C and G/B
# turn into glassy Lydian and eerie minor/augmented chords. base: celesta (his upper voice) and vibes
# (his lower voice), glass pad, bowed vibes, wine glasses, sub bass; the second time a low flute plays
# his lower line slowly. perc: alien hand drums. drive: cello ostinato and horn hits.
SHIP_BASS = [38, 39, 41, 41, 38, 37, 46, 45, 48, 38, 41, 39]
SHIP_PAD = [[50, 57, 60, 65], [51, 55, 59, 62], [53, 57, 60, 67], [53, 59, 64, 67], [50, 57, 62, 65], [49, 55, 59, 64],
            [58, 62, 65, 69], [57, 62, 64, 67], [48, 55, 64, 71], [50, 57, 60, 65], [53, 57, 60, 67], [51, 55, 59, 62]]
def ship():
    sp = song('ship', 96, 96, {'base': 128, 'perc': 112, 'drive': 112}, {'base': -18, 'perc': -23, 'drive': -22}, reverb='big')
    s = sp['score']; B = 'base'
    for rep in (0, 1):
        for k in range(12):
            b0 = (rep * 12 + k) * 4
            bass, pad = SHIP_BASS[k], SHIP_PAD[k]
            put_lt(s, B, b0, k, up=[('celesta', 12, .5)], low=[('vibes', 12 if rep == 0 else 0, .45)])
            s.add(B, P('pad_glass'), b0, pad[0], 4, .5); s.add(B, P('pad_glass'), b0, pad[2], 4, .38); s.add(B, P('pad_glass'), b0, pad[3], 4, .32)
            s.add(B, P('vibes_bowed'), b0, pad[1] + 12 if pad[1] + 12 <= 76 else pad[1], 4, .45)
            s.add(B, P('sub'), b0, bass, 3.75, .55)
            s.add(B, P('harp'), b0, bass + 12, 1, .42)
            lo, up = LT[k]
            if rep == 1:
                if k == 7:                                       # his wiggle, slowly: E D F E
                    for i, n in enumerate([64, 62, 65, 64]): s.add(B, P('flute'), b0 + i, n, 1, .46)
                else:
                    s.add(B, P('flute'), b0, lo, 4 if k != 11 else 3, .46)
                if k % 2 == 0: s.add(B, P('glass'), b0 + .5, up + 12 if up + 12 <= 86 else up, 3.5, .45)
            elif k in (0, 4, 8):
                s.add(B, P('glass'), b0 + 1, up + 12 if up + 12 <= 86 else up, 3, .42)
            if k in (0, 6) and rep == 0: s.add(B, P('marktree'), b0, 65, 4, .2)
    # ---------- perc: alien-ish hand drums
    for bar in range(24):
        b0 = bar * 4; k = bar % 12
        hits = [(0, 'frame', 61, .62), (.75, 'frame', 64, .4), (1.5, 'frame', 61, .5), (2.5, 'frame', 64, .45), (3, 'frame', 61, .55),
                (1, 'perc', I.LOG_HI, .45), (2.75, 'perc', I.LOG_LO, .5), (3.5, 'perc', I.LOG_HI, .4)]
        for t, inst, n, v in hits: s.add('perc', P(inst), b0 + t, n, 1, v)
        for i in range(16):
            s.add('perc', P('shaker'), b0 + i * .25, 62 if i % 2 else 63, .25, .42 if i % 4 == 2 else .3)
        s.add('perc', P('bd'), b0, 62, 1, .5); s.add('perc', P('bd'), b0 + 2.5, 62, 1, .4)
        if bar % 2 == 1: s.add('perc', P('tamb'), b0 + 3, 60, 1, .4)
        if k % 4 == 3:
            for i, t in enumerate([2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75]):
                s.add('perc', P('tom_hi' if i % 2 == 0 else 'tom_lo'), b0 + t, 62, 1, .42 + .04 * i)
        r = SHIP_BASS[k]; r = r if r >= 40 else r + 12
        s.add('perc', P('timp'), b0, r, 2, .5)
    # ---------- drive: cello/bass ostinato + horn hits on the eerie chords
    for bar in range(24):
        b0 = bar * 4; k = bar % 12
        bass, pad = SHIP_BASS[k], SHIP_PAD[k]
        r = bass if bass >= 40 else bass + 12
        for i in range(8):
            n = [r, r, r + 7, r, r + 12, r, r + 7, r + 12][i]
            s.add('drive', P('vc_spic'), b0 + i * .5, n, .5, .62 if i % 4 == 0 else .45)
        lo, up = LT[k]
        for i in range(8):
            s.add('drive', P('vla_spic'), b0 + i * .5 + .25, (up if i % 2 else lo) - 12, .25, .32)
        s.add('drive', P('cb_pizz'), b0, bass if bass >= 28 else bass + 12, 2, .6); s.add('drive', P('cb_pizz'), b0 + 2, bass, 2, .5)
        s.chord('drive', P('horn_stac'), b0, [pad[1], pad[2], pad[3]], vel=.55)
        s.chord('drive', P('horn_stac'), b0 + 1.5, [pad[1], pad[2], pad[3]], vel=.45)
        s.chord('drive', P('tbn_stac'), b0 + 3, [r, r + (8 if k in (1, 11) else 6 if k == 5 else 7)], vel=.45)
    sp['balance'] = {
        'base': {'celesta': 0, 'vibes': -2, 'flute': -1, 'pad_glass': -9, 'vibes_bowed': -10, 'glass': -8, 'sub': -7, 'harp': -9, 'marktree': -14},
        'perc': {'frame': 0, 'perc': -3, 'bd': -4, 'timp': -3, 'tom_hi': -4, 'tom_lo': -4, 'shaker': -11, 'tamb': -10},
        'drive': {'vc_spic': 0, 'horn_stac': -3, 'vla_spic': -8, 'tbn_stac': -5, 'cb_pizz': -4}}
    return sp

# ============================================================== GLORBAX (boss2)
# 168 bpm. A 4-bar boss intro (plays once): two big diminished stabs a semitone apart, his opening motif
# shrieked by trumpets and xylophone over racing toms, then the bass riff alone. The 36-bar loop is his
# theme fast and minor over a galloping, crunchy bass riff on his chords: first at double speed on
# xylophone and piccolo, then at about his own speed in the trumpets and horns (with the xylophone still
# racing at double speed, and his E-D-F-E wiggle in the trombones in the second half).
# rage = double-time toms, held organ, glockenspiel shrieks, anvil.
RIFF = [0, 0, 12, 0, 1, 0, 12, -1]
def boss2():
    IB = 16
    sp = song('boss2', 168, 144, {'base': 128, 'rage': 112}, {'base': -17, 'rage': -21}, intro_beats=IB)
    s = sp['score']; B = 'base'; R = 'rage'
    o = dict(intro=True)
    # ---- intro (4 bars)
    for b0, dim in ((0, [56, 59, 62, 65]), (4, [57, 60, 63, 66])):
        s.chord(B, P('organ'), b0, [n + 12 for n in dim], 3.5, .8, **o)
        s.chord(B, P('tbn_stac'), b0, [dim[0] - 12, dim[0]], vel=.85, **o)
        s.chord(B, P('horn'), b0, dim, 3, .7, **o)
        s.add(B, P('timp'), b0, dim[0] - 12, 3, .9, **o)
        s.add(B, P('gong'), b0, 60, 4, .55, **o)
        s.add(B, P('bd'), b0, 62, 2, .8, **o)
        s.chord(B, P('vc_trem'), b0, [dim[0] - 12, dim[2] - 12], 3.8, .6, **o)
    for i in range(8):                       # bar 3: his opening motif, shrieked: A/C four times, G/B four times
        lo, up = (69, 72) if i < 4 else (67, 71)
        t = 8 + i * .5
        s.add(B, P('tpt_stac'), t, up, .5, .6 + i * .02, **o); s.add(B, P('xylo'), t, up + 24, .5, .55, **o)
        s.add(B, P('horn_stac'), t, lo, .5, .55, **o)
        s.add(B, P('tom_lo' if i < 4 else 'tom_hi'), t, 62, 1, .5 + i * .03, **o)
        s.add(B, P('tom_lo' if i < 4 else 'tom_hi'), t + .25, 62, 1, .42 + i * .03, **o)
    for i in range(8):                       # bar 4: the riff alone, with a snare roll
        n = 45 + RIFF[i]
        s.add(B, P('vc_spic'), 12 + i * .5, n, .5, .5, **o); s.add(B, P('cb_pizz'), 12 + i * .5, n - 12, .5, .45, **o)
    s.add(B, P('perc'), 12, I.SN_ROLL, 4, .7, **o)
    s.add(B, P('scym'), 12, 66, 4, .6, **o)
    # ---- loop. Bars 0-11: his theme at double speed (one of his bars per bar), frantic, on xylophone and
    # piccolo. Bars 12-35: his theme at about his own speed (one of his bars per two bars) in the brass,
    # with the frantic xylophone still going and, in the second half, his wiggle in the trombones.
    for bar in range(36):
        b0 = bar * 4                                   # loop beats (the builder places them after the intro)
        slow = bar >= 12
        k = (bar - 12) // 2 if slow else bar
        first = not slow or (bar - 12) % 2 == 0        # first bar of his bar
        r = LT_BASS[k]; lo, up = LT[k]
        root = r if r >= 40 else r + 12
        for i in range(8):                   # the riff
            n = root + RIFF[i]
            s.add(B, P('vc_spic'), b0 + i * .5, n, .5, .64 if i % 2 == 0 else .5)
            s.add(B, P('cb_pizz'), b0 + i * .5, n - 12 if n - 12 >= 28 else n, .5, .5 if i % 2 == 0 else .36)
            s.add(B, P('bassoon'), b0 + i * .5, n, .5, .5)
        if not slow:
            put_lt(s, B, b0, k, up=[('xylo', 12, .55), ('piccolo', 24, .4)], low=[('xylo', 12, .45)], ring=False)
        else:
            put_lt(s, B, b0, k, up=[('xylo', 24, .36)], low=[], ring=False)                    # the frantic echo
            if first:
                put_lt(s, B, b0, k, up=[('tpt_stac', 0, .6), ('piccolo', 24, .3)], low=[('horn_stac', 0, .58), ('tbn_stac', -12, .45)], ring=False, scale=2)
            if k >= 6:
                for i, w in enumerate([0, -2, 1, 0]):  # his wiggle on the chord's root, in the trombones
                    s.add(B, P('tbn_stac'), b0 + i, root + w, 1, .5)
        # organ stabs: the chord on beat 1 and the "and" of 2
        tri = TRIAD[r]
        for t, v in ((0, .62), (1.5, .5)):
            s.chord(B, P('organ'), b0 + t, [n + 12 for n in tri], .5, v)
        # drums
        for t in (0, 1.5, 2, 3.5):
            s.add(B, P('bd'), b0 + t, 62, 1, .7 if t == 0 else .55)
        s.add(B, P('snare'), b0 + 1, 61, 1, .6); s.add(B, P('snare'), b0 + 3, 61, 1, .62)
        for i in range(8): s.add(B, P('tamb'), b0 + i * .5, 60, .5, .38 if i % 2 else .28)
        s.add(B, P('timp'), b0, root, 2, .62)
        if bar in (11, 35):                  # end of each section: a crazy chromatic xylophone run and a tom fill
            for i in range(8):
                s.add(B, P('xylo'), b0 + 2 + i * .25, 79 + i, .25, .5 + i * .03)
            for i, t in enumerate([2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75]):
                s.add(B, P('tom_hi' if i % 2 == 0 else 'tom_lo'), b0 + t, 62, 1, .48 + .025 * i)
        if bar in (0, 12, 24): s.add(B, P('crash'), b0, 60, 4, .55)
        if bar % 4 == 3 and bar not in (11, 35): s.add(B, P('perc'), b0 + 2, I.RATCHET, 1, .45)
        # ---- rage layer
        for st in range(16):
            s.add(R, P('tom_hi' if st % 4 in (1, 3) else 'tom_lo'), b0 + st * .25, 62, 1, .5 if st % 4 == 0 else .38)
        s.chord(R, P('organ'), b0, [n + 24 for n in tri], 4, .55)
        for i in range(4):
            s.add(R, P('glock'), b0 + i, up + 24, 1, .35)
        s.add(R, P('perc'), b0 + 1, I.ANVIL, 1, .38); s.add(R, P('perc'), b0 + 3, I.ANVIL, 1, .42)
        s.chord(R, P('tbn_stac'), b0 + 3.5, [root, root + 7], vel=.6)
    sp['balance'] = {
        'base': {'vc_spic': 0, 'bassoon': -6, 'cb_pizz': -4, 'organ': -5, 'xylo': -2, 'piccolo': -6, 'tpt_stac': 0, 'horn_stac': -3,
                 'horn': -1, 'tbn_stac': -4, 'bd': -4, 'snare': -3, 'tamb': -11, 'timp': -2, 'tom_hi': -4, 'tom_lo': -4, 'crash': -9,
                 'perc': -6, 'gong': -4, 'vc_trem': -4, 'scym': -9},
        'rage': {'tom_lo': 0, 'tom_hi': 0, 'organ': -2, 'glock': -6, 'perc': -6, 'tbn_stac': -3}}
    return sp

# ============================================================== INTRO (tense cutscene)
# 80 bpm, 16 bars = 48 s. A dark, slow fragment of his motif: his A/C and G/B as a quiet low pulse
# (a heartbeat) under tremolo cellos, the horn holding his thirds, the shape turning darker
# (G sharp, his wiggle as a creeping semitone) before it starts again.
INTRO_PLAN = [  # (bass, his lower, his upper) per bar
    (45, 57, 60), (45, 57, 60), (43, 55, 59), (43, 55, 59),
    (45, 57, 60), (45, 57, 60), (44, 56, 59), (44, 56, 59),
    (41, 53, 57), (41, 53, 57), (40, 52, 55), (40, 52, 55),
    (45, 57, 60), (43, 55, 59), (44, 56, 59), (40, 56, 59),
]
def intro():
    sp = song('intro', 80, 64, {'base': 128}, {'base': -19})
    s = sp['score']; B = 'base'
    for bar, (bass, lo, up) in enumerate(INTRO_PLAN):
        b0 = bar * 4
        for i in range(8):                                        # his pulse, low: pizzicato upper voice, harp lower voice
            s.add(B, P('vc_pizz'), b0 + i * .5, up, .5, .46 if i % 2 == 0 else .36)
            if i % 2 == 0: s.add(B, P('harp'), b0 + i * .5, lo - 12 if lo - 12 >= 40 else lo, 1, .3)
        if bar % 4 in (0, 2): s.add(B, P('harp'), b0 + 3.5, lo - 12 if lo - 12 >= 40 else lo, 1, .32)   # his "and of 4" pickup
        s.add(B, P('vc_trem'), b0, bass, 4, .55); s.add(B, P('vc_trem'), b0, bass + 7, 4, .4)
        s.add(B, P('pad_warm'), b0, bass - 12, 4, .5)
        if bar == 0 or INTRO_PLAN[bar - 1][1:] != (lo, up):          # the horn holds his third until it changes
            n = 1
            while bar + n < 16 and INTRO_PLAN[bar + n][1:] == (lo, up): n += 1
            s.chord(B, P('horn'), b0, [lo, up], 4 * n, .4)
        if bar in (10, 11):                                       # his wiggle as a creeping semitone: E F E F
            for i, n in enumerate([52, 53, 52, 53]): s.add(B, P('vc_trem'), b0 + i, n + 12, 1, .4)
        s.add(B, P('timp'), b0, bass if bass >= 40 else bass + 12, 2, .55)
        s.add(B, P('timp'), b0 + 3.5, bass if bass >= 40 else bass + 12, 1, .35)
        s.add(B, P('vln'), b0, 86, 4, .24)                         # a thin, high D over everything
        if bar % 4 == 3: s.add(B, P('scym'), b0, 66, 4, .4)
        if bar == 15: s.add(B, P('timp_roll'), b0, 40, 4, .45)
    for k in range(16):
        s.add(B, P('perc'), k * 4 + 2, I.CLAVES, 1, .22)
    sp['balance'] = {'base': {'vc_trem': 0, 'vc_pizz': -3, 'harp': -6, 'horn': -4, 'timp': -2, 'vln': -10, 'pad_warm': -8, 'scym': -9, 'timp_roll': -4, 'perc': -15}}
    return sp

SONGS = dict(mars=mars, captain=captain, ship=ship, boss2=boss2, title=title, theme=theme, intro=intro)
