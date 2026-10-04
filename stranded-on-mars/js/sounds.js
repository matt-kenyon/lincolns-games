// ============================================================
// SOUNDS — which audio files the game uses (plain data)
//  - SFX: recorded sound effects in audio/sfx/. A sound with no entry here
//    keeps its synthesized version from audio.js.
//  - MUSIC: songs in audio/music/, each split into stems (layers) of the same
//    length that loop together. MODES says which song and which layers play
//    for each music mode the game asks for (explore, combat, boss...).
// Bump AUDIO_V when you replace a file with a new version under the same name.
// ============================================================

export const AUDIO_V = 1;

// name: { files: [...], gain, rate: [min, max] (random pitch), offset (s), dur (s) }
// files are paths under audio/sfx/ without the .mp3; one is picked at random each time
export const SFX_FILES = {
};

// song: { loop (seconds, the exact loop length), once (play once, don't loop),
//         stems: { layer: 'file under audio/music/ without .mp3' }, gain }
export const MUSIC = {
};

// music mode: { song, layers: { layer: gain } }. Layers not listed fade out.
export const MODES = {
};

// Which songs to load ahead of time for each stage
export const PRELOAD = {
    mars: [],
    ship: [],
};
