# Instrument palette shared by every song, so the soundtrack sounds like one band.
# All sampled instruments are CC0 (VSCO 2 Community Edition, VCSL) except the celesta,
# which comes from GeneralUser GS (free for music creation, see its LICENSE.txt).
import os, functools
from engine import SfzInstrument, SynthPad, Sf2Instrument, HERE, SAMPLES

V = os.path.join(HERE, 'sfz', 'vsco')
C = os.path.join(HERE, 'sfz', 'vcsl')
GU = os.path.join(SAMPLES, 'GeneralUser-GS', 'GeneralUser-GS.sf2')

@functools.lru_cache(None)
def get(name):
    f = {
        # keys / plucked / mallets
        'piano':      lambda: SfzInstrument(f'{C}/Grand Piano, Steinway B.sfz', release=0.9, gain_db=-8, vel_db=22, reverb=0.32, humanize=0.008),
        'harp':       lambda: SfzInstrument(f'{V}/Harp.sfz', oneshot=True, max_len=4.0, release=0.8, gain_db=-4, vel_db=18, reverb=0.4, pan=-0.25, lead=0.006),
        'glock':      lambda: SfzInstrument(f'{V}/Glockenspiel.sfz', oneshot=True, max_len=3.0, release=0.8, transpose=-12, gain_db=-2, vel_db=16, reverb=0.45, pan=0.3),
        'xylo':       lambda: SfzInstrument(f'{V}/Xylophone.sfz', oneshot=True, max_len=1.5, release=0.4, transpose=-12, gain_db=-12, vel_db=16, reverb=0.25, pan=0.25),
        'marimba':    lambda: SfzInstrument(f'{V}/Marimba.sfz', oneshot=True, max_len=2.0, release=0.5, gain_db=-2, vel_db=16, reverb=0.3, pan=-0.2),
        'vibes':      lambda: SfzInstrument(f'{C}/Vibraphone - Soft Mallets.sfz', oneshot=True, max_len=4.0, release=1.0, gain_db=-8, vel_db=18, reverb=0.45, pan=0.2),
        'vibes_bowed':lambda: SfzInstrument(f'{C}/Vibraphone - Bowed.sfz', attack=0.25, release=1.2, gain_db=0, vel_db=12, reverb=0.55, pan=-0.3),
        'glass':      lambda: SfzInstrument(f'{C}/Wine Glasses - Slow.sfz', attack=0.4, release=1.2, gain_db=-14, vel_db=10, reverb=0.6, pan=0.35),
        'celesta':    lambda: Sf2Instrument(GU, 'Celeste', gain_db=-10, decay=2.2, release=0.5, pan=0.15, reverb=0.45),
        # strings
        'vln':        lambda: SfzInstrument(f'{V}/ViolinEnsSusVib.sfz', attack=0.18, release=0.6, gain_db=-4, vel_db=14, lead=0.04, reverb=0.45, pan=-0.35),
        'vla':        lambda: SfzInstrument(f'{V}/ViolaEnsSusVib.sfz', attack=0.18, release=0.6, gain_db=-16, vel_db=14, lead=0.04, reverb=0.45, pan=0.15),
        'vc':         lambda: SfzInstrument(f'{V}/CelloEnsSusVib.sfz', attack=0.16, release=0.6, gain_db=-5, vel_db=14, lead=0.04, reverb=0.4, pan=0.35),
        'vln_spic':   lambda: SfzInstrument(f'{V}/ViolinEnsSpic.sfz', oneshot=True, max_len=0.9, release=0.25, gain_db=-8, vel_db=16, reverb=0.3, pan=-0.4, humanize=0.004, lead=0.025),
        'vla_spic':   lambda: SfzInstrument(f'{V}/ViolaEnsSpic.sfz', oneshot=True, max_len=0.9, release=0.25, gain_db=-10, vel_db=16, reverb=0.3, pan=0.1, humanize=0.004, lead=0.025),
        'vc_spic':    lambda: SfzInstrument(f'{V}/CelloEnsSpic.sfz', oneshot=True, max_len=0.9, release=0.25, gain_db=-8, vel_db=16, reverb=0.28, pan=0.35, humanize=0.004, lead=0.025),
        'vln_pizz':   lambda: SfzInstrument(f'{V}/ViolinEnsPizz.sfz', oneshot=True, max_len=1.2, release=0.3, gain_db=-12, vel_db=16, reverb=0.35, pan=-0.3, lead=0.01),
        'vc_pizz':    lambda: SfzInstrument(f'{V}/CelloEnsPizz.sfz', oneshot=True, max_len=1.6, release=0.4, gain_db=-10, vel_db=16, reverb=0.3, pan=0.3, lead=0.012),
        'vc_trem':    lambda: SfzInstrument(f'{V}/CelloEnsTrem.sfz', attack=0.3, release=0.8, gain_db=-22, vel_db=14, lead=0.05, reverb=0.45, pan=0.3),
        'cb_pizz':    lambda: SfzInstrument(f'{V}/ContrabassPizz.sfz', oneshot=True, max_len=1.6, release=0.4, gain_db=-8, vel_db=14, reverb=0.25, pan=0.1, lead=0.012),
        # winds and brass
        'flute':      lambda: SfzInstrument(f'{V}/FluteSusVib.sfz', attack=0.06, release=0.35, gain_db=-8, vel_db=12, lead=0.02, reverb=0.45, pan=0.1),
        'piccolo':    lambda: SfzInstrument(f'{V}/PiccoloStac.sfz', oneshot=True, max_len=0.6, release=0.2, transpose=-12, gain_db=-16, vel_db=14, reverb=0.3, pan=0.3),
        'bassoon':    lambda: SfzInstrument(f'{V}/BassoonStac.sfz', oneshot=True, max_len=0.7, release=0.2, gain_db=-18, vel_db=12, reverb=0.25, pan=-0.1, lead=0.01),
        'horn':       lambda: SfzInstrument(f'{V}/FHornSus.sfz', attack=0.05, release=0.45, gain_db=-12, vel_db=16, lead=0.02, reverb=0.5, pan=-0.15),
        'horn_stac':  lambda: SfzInstrument(f'{V}/FHornStac.sfz', oneshot=True, max_len=1.0, release=0.3, gain_db=-12, vel_db=16, reverb=0.45, pan=-0.15, lead=0.012),
        'tbn_stac':   lambda: SfzInstrument(f'{V}/TromboneStac.sfz', oneshot=True, max_len=1.0, release=0.3, gain_db=-4, vel_db=16, reverb=0.4, pan=0.2, lead=0.01),
        'tpt_stac':   lambda: SfzInstrument(f'{V}/TrumpetStac.sfz', oneshot=True, max_len=0.9, release=0.25, gain_db=-10, vel_db=16, reverb=0.4, pan=0.05, lead=0.01),
        'tuba_stac':  lambda: SfzInstrument(f'{V}/TubaStac.sfz', oneshot=True, max_len=1.0, release=0.3, gain_db=-4, vel_db=14, reverb=0.3, pan=0.0),
        'organ':      lambda: SfzInstrument(f'{V}/OrganLoud.sfz', attack=0.01, release=0.35, gain_db=-8, vel_db=8, reverb=0.45, pan=0.0),
        # percussion
        'timp':       lambda: SfzInstrument(f'{V}/Timpani.sfz', oneshot=True, max_len=4.0, release=1.0, gain_db=-4, vel_db=20, reverb=0.35, pan=0.0, humanize=0.003),
        'timp_roll':  lambda: SfzInstrument(f'{V}/TimpaniRolls.sfz', attack=0.0, release=1.0, gain_db=-14, vel_db=16, reverb=0.35),
        'perc':       lambda: SfzInstrument(f'{V}/GM-StylePerc.sfz', oneshot=True, max_len=2.5, release=0.6, gain_db=-16, vel_db=20, reverb=0.25, humanize=0.003),
        'snare':      lambda: SfzInstrument(f'{C}/Snare Drum, Modern 1.sfz', oneshot=True, max_len=1.2, release=0.4, gain_db=-10, vel_db=20, reverb=0.22, pan=0.1, humanize=0.003),
        'bd':         lambda: SfzInstrument(f'{C}/Bass Drum 2.sfz', oneshot=True, max_len=1.2, release=0.5, gain_db=-17, vel_db=18, reverb=0.25, humanize=0.003),
        'tom_hi':     lambda: SfzInstrument(f'{C}/Tom 1.sfz', oneshot=True, max_len=1.2, release=0.4, gain_db=-14, vel_db=18, reverb=0.25, pan=-0.25, humanize=0.003),
        'tom_lo':     lambda: SfzInstrument(f'{C}/Tom 2.sfz', oneshot=True, max_len=1.5, release=0.5, gain_db=-12, vel_db=18, reverb=0.25, pan=0.25, humanize=0.003),
        'frame':      lambda: SfzInstrument(f'{C}/Frame Drum.sfz', oneshot=True, max_len=1.5, release=0.4, gain_db=-12, vel_db=18, reverb=0.3, pan=-0.2, humanize=0.003),
        'tamb':       lambda: SfzInstrument(f'{C}/Tambourine 1.sfz', oneshot=True, max_len=1.0, release=0.3, gain_db=-14, vel_db=16, reverb=0.25, pan=0.4, humanize=0.003),
        'shaker':     lambda: SfzInstrument(f'{C}/Shaker, Small.sfz', oneshot=True, max_len=0.5, release=0.15, gain_db=-10, vel_db=14, reverb=0.2, pan=0.45, humanize=0.004, lead=0.015),
        'crash':      lambda: SfzInstrument(f'{C}/Clash Cymbals 1.sfz', oneshot=True, max_len=5.0, release=1.5, gain_db=-12, vel_db=16, reverb=0.3, pan=-0.1),
        'scym':       lambda: SfzInstrument(f'{C}/Suspended Cymbal 1.sfz', oneshot=True, max_len=6.0, release=1.5, gain_db=-20, vel_db=12, reverb=0.35, pan=0.2),
        'marktree':   lambda: SfzInstrument(f'{C}/Mark Trees.sfz', oneshot=True, max_len=5.0, release=1.5, gain_db=-22, vel_db=12, reverb=0.4, pan=0.4),
        'gong':       lambda: SfzInstrument(f'{C}/Gong 1.sfz', oneshot=True, max_len=6.0, release=2.0, gain_db=-14, vel_db=14, reverb=0.35),
        # synths
        'pad_glass':  lambda: SynthPad('glass', gain_db=-6, attack=1.2, release=1.6, reverb=0.6),
        'pad_warm':   lambda: SynthPad('warm', gain_db=-8, attack=0.9, release=1.4, reverb=0.5),
        'pad_choir':  lambda: SynthPad('choir', gain_db=-10, attack=1.0, release=1.4, reverb=0.6),
        'sub':        lambda: SynthPad('sub', gain_db=-12, attack=0.01, release=0.15, reverb=0.0),
    }[name]
    inst = f(); inst.key = name
    return inst

# GM-style percussion keys in VSCO's GM-StylePerc.sfz
BD, SN_TAP, SN, SN_ROLL, TAMB_SHAKE, TAMB, TAMB_ROLL, ANVIL, RATCHET, CLAVES, LOG_HI, LOG_LO, TRI_M, TRI, SLEIGH, BELLTREE = 36, 37, 38, 39, 53, 54, 55, 67, 70, 75, 76, 77, 78, 79, 82, 83
