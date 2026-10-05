# Our own music: scores and render scripts

The game's "home-*" songs (audio/music/home-*.mp3) are composed here as code and played with free sampled
instruments: VSCO 2 Community Edition and VCSL by Versilian Studios (CC0), plus a celesta from GeneralUser GS.

- `songs.py`: the scores (every song, its layers/stems, tempo and loop length). Every song is built on **Lincoln's theme**,
  the tune Lincoln played on his keyboard: `LT` and `lt_bar()` hold his notes (12 bars of A minor, his pulsing thirds),
  `LT_SONG` is the singing line written over his chords. His recording and the transcription stay in the git-ignored
  `../audio-src/lincoln-theme/` (the repo is public).
- `instruments.py`: the instrument palette; `engine.py`: the sampler, reverb, loop cutting and automatic mixing
- `build.py`: renders songs straight into ../../audio/music/ (wrap-padded MP3 loops via libmp3lame)
- `fetch_samples.py`: downloads the instrument samples (~1.1 GB) into ../audio-src/samples/ (git-ignored)
- `verify_music.cjs` + `verify_music.py`: decode every file in headless Chrome and WebKit (muted) and check length,
  offset, loop seams and loudness

```sh
python3 fetch_samples.py --go      # once
python3 build.py                   # all songs (about 3 minutes), or: python3 build.py ship boss2
node verify_music.cjs && python3 verify_music.py
```

After re-rendering, bump `AUDIO_V` in `js/sounds.js` so browsers don't keep the old files. `cache/` and `out/` are
scratch folders (git-ignored).
