# Downloads only the CC0 sample folders the songs use, from the official GitHub repos:
#   VSCO 2 Community Edition  https://github.com/sgossner/VSCO-2-CE  (CC0)
#   Versilian Community Sample Library  https://github.com/sgossner/VCSL  (CC0)
# Trees were listed with:  gh api repos/sgossner/<repo>/git/trees/master?recursive=1
import re, os, sys, urllib.parse, subprocess
ROOT = os.path.join(os.path.dirname(__file__), '..', 'audio-src', 'samples')
SEL = {
 'VSCO-2-CE': ('vsco_tree.txt', [
   r'^Strings/Harp/', r'^Percussion/Glock/', r'^Percussion/Xylo/', r'^Percussion/Marimba/',
   r'^Strings/Violin Section/(susVib|Spic|Pizz)/', r'^Strings/Viola Section/(susvib|spic)/',
   r'^Strings/Cello Section/(susvib|spic|pizzT|trem)/.*_v[12]_', r'^Strings/Solo Contrabass/Pizz/.*_v[13]_rr1',
   r'^Brass/F Horn/(sus|stac)/', r'^Brass/Tenor Trombone/stac/', r'^Brass/Trumpet/stac/', r'^Brass/Tuba/stac/.*rr1',
   r'^Woodwinds/Flute/susvib/', r'^Woodwinds/Piccolo/', r'^Woodwinds/Bassoon/stac/',
   r'^Percussion/Timpani/', r'^Keys/Organ/Loud/',
   r'^Percussion/(LogDrum|Snare2-|Tamb1-|Triangle3-|BDrumNewhit|Sleighbells|Ratchet|Claves|BellTree|Anvil)',
 ]),
 'VCSL': ('vcsl_tree.txt', [
   r'Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_(C|D|E|F#|G#|A#)[3-6]_vl[23]_rr1\.wav$',
   r'Grand Piano, Steinway B/Sus/JHPiano_Sus_Close_(C|D|E|F#|G#|A#)2_vl2_rr1\.wav$',
   r'/Vibraphone/.*Vibes_(bowed|soft)_', r'/Wine Glasses/(?!Releases)', r'/Ocarina, Typical/.*StdOcarina_SusVib_[^r]*\.wav$',
   r'/Tom [12]/.*HitM', r'/Snare Drum, Modern 1/', r'/Bass Drum 2/bassdrum_hit_', r'/Suspended Cymbal 1/susCymb1_(cresc_[24]s|hit_f)',
   r'/Clash Cymbals 1/', r'/Tambourine 1/', r'/Shaker, Small/', r'/Mark Trees/', r'/Frame Drum/', r'/Gong 1/',
 ]),
}
# Long-ringing samples: fetch only the first N bytes (the loader tolerates truncated WAVs).
TRUNC = [(r'Grand Piano', 2_700_000), (r'/Gong 1/', 2_000_000), (r'/Vibraphone/', 1_600_000)]
jobs = []; total = 0
for repo, (tree, pats) in SEL.items():
    for line in open(os.path.join(os.path.dirname(__file__), tree)):
        size, path = line.rstrip('\n').split('\t')
        if not path.lower().endswith('.wav'): continue
        if any(re.search(p, path) for p in pats):
            dst = os.path.join(ROOT, repo, path)
            want = int(size)
            for tp, nb in TRUNC:
                if re.search(tp, path): want = min(want, nb)
            total += want
            if not os.path.exists(dst) or os.path.getsize(dst) != want:
                jobs.append((f'https://raw.githubusercontent.com/sgossner/{repo}/master/' + urllib.parse.quote(path), dst, want, int(size)))
print(f'{len(jobs)} files to fetch; selection total {total/1e6:.0f} MB')
if '--go' in sys.argv:
    with open('/tmp/_fetch_list.txt' if False else os.path.join(ROOT, '_fetch.txt'), 'w') as f:
        for u, d, want, full in jobs:
            os.makedirs(os.path.dirname(d), exist_ok=True)
            f.write(f'url = "{u}"\noutput = "{d}"\n' + (f'range = "0-{want-1}"\n' if want < full else ''))
    subprocess.run(['curl', '-sfL', '--parallel', '--parallel-max', '4', '--retry', '3', '-K', os.path.join(ROOT, '_fetch.txt')], check=False)
