# Builds the game's Woodland music files (audio/music/woodland-*.mp3) from the Woodland Music Vol 1
# stems by JC Sounds (CC BY 4.0, https://opengameart.org/content/woodland-music-vol-1).
# The source stems live in dev/audio-src/music-eval/woodland-vol1/ (git-ignored).
#   decode -> sum stems into layers -> add the "Tail" ring-out onto the loop start ->
#   wrap-pad 0.5 s (loop end before, loop start after) -> MP3 (libmp3lame writes the gapless header)
# Run from stranded-on-mars/:  python3 dev/build-music.py
import subprocess, numpy as np, os

SR = 44100
SRC = 'dev/audio-src/music-eval/woodland-vol1/'
OUT = 'audio/music/'
PAD = int(0.5 * SR)

def dec(f):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2).copy()

def level_stem(name):
    loop = dec(f'{SRC}Level_130bpm_Main Loop - Pack 1_Exploration {name}.mp3')
    tail = dec(f'{SRC}Level_130bpm_Tail - Pack 1_Exploration {name}.mp3')
    loop[:len(tail)] += tail          # the last bar's ring-out continues into the next pass
    return loop

def write(name, a, loop_len, kbps):
    padded = np.concatenate([a[-PAD:], a, a[:PAD]])
    pcm = (np.clip(padded, -1, 1) * 32767).astype('<i2').tobytes()
    path = OUT + name + '.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], input=pcm, check=True)
    print(f'{name}: loop {loop_len / SR:.6f} s, peak {np.abs(a).max():.2f}, {os.path.getsize(path) // 1024} KB')

os.makedirs(OUT, exist_ok=True)
layers = {
    'woodland-level-base': (['WWind', 'Strings', 'Choir', 'Xtra Inst', 'Xperiments'], 128),
    'woodland-level-drums': (['E Drums 1', 'Perc', 'Xtra Perc'], 112),
}
for name, (stems, kbps) in layers.items():
    mix = sum(level_stem(n) for n in stems)
    write(name, mix, len(mix), kbps)
boss = dec(f'{SRC}Boss_155bpm_Main Loop - Master.mp3')
write('woodland-boss', boss, len(boss), 128)
