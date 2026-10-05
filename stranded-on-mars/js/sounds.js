// ============================================================
// SOUNDS — which audio files the game uses (plain data)
//  - SFX: recorded sound effects in audio/sfx/. A sound with no entry here
//    keeps its synthesized version from audio.js.
//  - MUSIC: songs in audio/music/, each split into stems (layers) of the same
//    length that loop together. MUSIC_SETS say which song and which layers play
//    for each music mode the game asks for (explore, combat, boss...).
// Bump AUDIO_V when you replace a file with a new version under the same name.
// ============================================================

export const AUDIO_V = 2;

// name: { files: [...], gain, rate: [min, max] (random pitch), offset (s), dur (s) }
// files are paths under audio/sfx/ without the .mp3; one is picked at random each time.
// Sources: Kenney (CC0), OpenGameArt rubberduck (CC0), Sonniss #GameAudioGDC bundles and Mixkit
// (both royalty-free for games, no credit needed). Which file came from where: dev/audio-src/MAPPING.md
// (git-ignored, with LICENSES.md). Gains start out matching the loudness of the old synth sounds.
// typing, countBeep and grrr (Lincoln's ship straining) stay synthesized.
export const SFX_FILES = {
    blaster: { files: ['blaster_1', 'blaster_2'], gain: 0.119, rate: [0.94, 1.06] },
    boltHit: { files: ['boltHit_1', 'boltHit_2', 'boltHit_3'], gain: 0.018, rate: [0.85, 1.2] },
    jump: { files: ['jump'], gain: 0.05, rate: [0.95, 1.05] },
    land: { files: ['land'], gain: 0.166, rate: [0.95, 1.05] },
    step: { files: ['step_1', 'step_2', 'step_3', 'step_4', 'step_5'], gain: 0.028, rate: [0.9, 1.1] },
    playerShieldHit: { files: ['playerShieldHit'], gain: 0.044, rate: [0.95, 1.05] },
    shieldDown: { files: ['shieldDown'], gain: 0.041 },
    shieldCharge: { files: ['shieldCharge'], gain: 0.07 },
    playerHurt: { files: ['playerHurt'], gain: 0.193 },
    overheat: { files: ['overheat'], gain: 0.49 },
    vented: { files: ['vented'], gain: 0.048 },
    empty: { files: ['empty'], gain: 0.086 },
    throw: { files: ['throw'], gain: 0.027, rate: [0.95, 1.05] },
    pickup: { files: ['pickup'], gain: 0.086 },
    heart: { files: ['heart'], gain: 0.08 },
    fanfare: { files: ['fanfare'], gain: 0.288 },
    alienShoot: { files: ['alienShoot_1', 'alienShoot_2', 'alienShoot_3'], gain: 0.15, rate: [0.9, 1.12] },
    bossShoot: { files: ['bossShoot_1', 'bossShoot_2', 'bossShoot_3'], gain: 0.168, rate: [0.95, 1.05] },
    alienHurt: { files: ['alienHurt_1', 'alienHurt_2', 'alienHurt_3', 'alienHurt_4'], gain: 0.097, rate: [0.9, 1.15] },
    bonk: { files: ['bonk'], gain: 0.057, rate: [0.95, 1.08] },
    alienDie: { files: ['alienDie'], gain: 0.083 },
    poof: { files: ['poof'], gain: 0.111, rate: [0.92, 1.08] },
    alienAlert: { files: ['alienAlert_1', 'alienAlert_2'], gain: 0.064, rate: [0.92, 1.1] },
    alienCheer: { files: ['alienCheer_1', 'alienCheer_2'], gain: 0.068 },
    shieldHit: { files: ['shieldHit_1', 'shieldHit_2', 'shieldHit_3'], gain: 0.135, rate: [0.95, 1.1] },
    shieldBreak: { files: ['shieldBreak'], gain: 0.452 },
    shieldUp: { files: ['shieldUp'], gain: 0.066 },
    teleport: { files: ['teleport'], gain: 0.106, rate: [0.95, 1.05] },
    explosion: { files: ['explosion'], gain: 0.394, rate: [0.92, 1.06] },
    stick: { files: ['stick'], gain: 0.108 },
    bounce: { files: ['bounce_1', 'bounce_2', 'bounce_3', 'bounce_4', 'bounce_5'], gain: 0.062, rate: [0.9, 1.1] },
    shieldZap: { files: ['shieldZap_1', 'shieldZap_2', 'shieldZap_3'], gain: 0.012, rate: [0.95, 1.05] },
    gateDown: { files: ['gateDown'], gain: 0.15 },
    clunk: { files: ['clunk'], gain: 0.093 },
    sparkle: { files: ['sparkle'], gain: 0.029 },
    powerUp: { files: ['powerUp'], gain: 0.168 },
    whoosh: { files: ['whoosh'], gain: 0.071 },
    boing: { files: ['boing'], gain: 0.108 },
    uiMove: { files: ['uiMove'], gain: 0.11 },
    uiSelect: { files: ['uiSelect'], gain: 0.035 },
    // typing: keep synthesized
    eject: { files: ['eject'], gain: 0.172 },
    chute: { files: ['chute'], gain: 0.065 },
    crash: { files: ['crash'], gain: 0.944 },
    // grrr: keep synthesized
    lurch: { files: ['lurch'], gain: 0.327 },
    sting: { files: ['sting'], gain: 0.468 },
    click: { files: ['click'], gain: 0.073 },
    bigButton: { files: ['bigButton'], gain: 0.168 },
    // countBeep: keep synthesized
    rumble: { files: ['rumble'], gain: 0.245 },
    splash: { files: ['splash'], gain: 0.452, rate: [0.92, 1.08] },
    bossRise: { files: ['bossRise'], gain: 0.17 },
    eyeOpen: { files: ['eyeOpen'], gain: 0.102 },
    titleSting: { files: ['titleSting'], gain: 0.355 },
    podLaunch: { files: ['podLaunch'], gain: 0.157 },
    mothershipBoom: { files: ['mothershipBoom'], gain: 1.189 },
    doorSlam: { files: ['doorSlam'], gain: 0.351 },
    doorOpen: { files: ['doorOpen_1', 'doorOpen_2', 'doorOpen_3'], gain: 0.066 },
    waveAlarm: { files: ['waveAlarm'], gain: 0.048 },
    armorClank: { files: ['armorClank_1', 'armorClank_2', 'armorClank_3', 'armorClank_4', 'armorClank_5'], gain: 0.087, rate: [0.92, 1.12] },
    bossHurt: { files: ['bossHurt_1', 'bossHurt_2', 'bossHurt_3'], gain: 0.145, rate: [0.9, 1.1] },
    bossRoar: { files: ['bossRoar'], gain: 0.432 },
    bossSlamWarn: { files: ['bossSlamWarn'], gain: 0.085 },
    bossSlam: { files: ['bossSlam'], gain: 0.575 },
    bossGurgle: { files: ['bossGurgle'], gain: 0.132 },
    bossSpit: { files: ['bossSpit'], gain: 0.197 },
    laserCharge: { files: ['laserCharge'], gain: 0.16 },
    laserFire: { files: ['laserFire'], gain: 0.197 },
    laserBuzz: { files: ['laserBuzz_1', 'laserBuzz_2', 'laserBuzz_3', 'laserBuzz_4'], gain: 0.088, rate: [0.9, 1.1] },
    bossDie: { files: ['bossDie'], gain: 0.248 },
    bigPoof: { files: ['bigPoof'], gain: 0.531 },
    heartbeat: { files: ['heartbeat'], gain: 0.153 },
};

// Looping sounds, started and stopped by code (audio.js): Mars wind, mothership hum, tractor beam,
// rocket engine (files[0] rumble x level, files[1] thruster x level^1.5) and the ship alarm
export const LOOP_FILES = {
    wind: { files: ['wind'], gain: 0.12 },
    hum: { files: ['hum'], gain: 0.596 },
    tractor: { files: ['tractor'], gain: 0.562 },
    engine: { files: ['engine_1', 'engine_2'], gain: 0.302 },
    alarm: { files: ['alarm'], gain: 0.065 },
};

// song: { loop (seconds, the exact loop length), pad (seconds of overlap copied onto each end
//         of the file, usually 0.5), intro (seconds that play once before the loop starts),
//         once (play once, don't loop), stems: { layer: 'file under audio/music/ without .mp3' },
//         gain, fadeIn }
export const MUSIC = {
    // Woodland Music Vol 1 by JC Sounds (CC BY 4.0), remixed into game loops by dev/build-music.py
    'woodland-level': { loop: 144, pad: 0.5, gain: 0.8, stems: { base: 'woodland-level-base', drums: 'woodland-level-drums' } },
    'woodland-boss': { loop: 100.64517, pad: 0.5, gain: 0.32, stems: { main: 'woodland-boss' } },
    // Our own songs, all built on Lincoln's theme (his keyboard demo, transcribed), played with CC0 instrument
    // samples (VSCO 2 CE and VCSL by Versilian Studios) plus a GeneralUser GS celesta. Scores: dev/music/songs.py.
    'home-mars': { loop: 53.333333, pad: 0.5, gain: 0.87, stems: { base: 'home-mars-base', perc: 'home-mars-perc', drive: 'home-mars-drive' } },
    'home-captain': { loop: 51.2, pad: 0.5, gain: 0.76, stems: { base: 'home-captain-base' } },
    'home-title': { loop: 60, pad: 0.5, gain: 0.77, stems: { base: 'home-title-base' } },
    'home-intro': { loop: 48, pad: 0.5, gain: 0.86, stems: { base: 'home-intro-base' } },
    'home-ship': { loop: 60, pad: 0.5, gain: 0.77, stems: { base: 'home-ship-base', perc: 'home-ship-perc', drive: 'home-ship-drive' } },
    'home-boss2': { intro: 5.714286, loop: 51.428571, gain: 0.76, stems: { base: 'home-boss2-base', rage: 'home-boss2-rage' } },
    'home-theme': { once: true, gain: 0.76, stems: { base: 'home-theme-base' } },
};

// A music set says, for each music mode the game asks for, which song plays and how loud each of
// its layers is (layers not listed fade out). A mode the set doesn't list plays the classic synth music.
// Mars modes: title, intro, explore, combat, boss (the Alien Captain).
// Mothership modes: ship, shipCombat (wave fights), boss2 (GLORBAX), boss2Mad (after its first roar),
// boss2Rage (the last third, when it turns red), theme (the ending).
const OURS = {
    title: { song: 'home-title', layers: { base: 1 } },
    intro: { song: 'home-intro', layers: { base: 1 } },
    explore: { song: 'home-mars', layers: { base: 1 } },
    combat: { song: 'home-mars', layers: { base: 1, perc: 1, drive: 1 } },
    boss: { song: 'home-captain', layers: { base: 1 } },
    ship: { song: 'home-ship', layers: { base: 1 } },
    shipCombat: { song: 'home-ship', layers: { base: 1, perc: 1, drive: 1 } },
    boss2: { song: 'home-boss2', layers: { base: 1 } },
    boss2Mad: { song: 'home-boss2', layers: { base: 1, rage: 0.6 } },
    boss2Rage: { song: 'home-boss2', layers: { base: 1, rage: 1 } },
    theme: { song: 'home-theme', layers: { base: 1 } },
};
export const MUSIC_SETS = {
    // Woodland on Mars, our own songs everywhere else
    mix: {
        ...OURS,
        title: { song: 'woodland-level', layers: { base: 0.8 } },
        explore: { song: 'woodland-level', layers: { base: 1 } },
        combat: { song: 'woodland-level', layers: { base: 1, drums: 1 } },
        boss: { song: 'woodland-boss', layers: { main: 1 } },
    },
    // our own songs everywhere
    ours: OURS,
};

export const MUSIC_SET = 'ours';   // the set players hear: Lincoln's theme everywhere (with ?debug, M switches sets)

// The songs each stage needs, loaded when the stage starts (and the other stage's songs freed)
export const STAGE_MODES = {
    mars: ['title', 'intro', 'explore', 'combat', 'boss'],
    ship: ['intro', 'ship', 'shipCombat', 'boss2', 'boss2Mad', 'boss2Rage', 'theme'],
};

// The classic synth music has fewer modes: these play as the mode on the right
export const CLASSIC_MODE = { shipCombat: 'combat', boss2Mad: 'boss2', boss2Rage: 'boss2' };
