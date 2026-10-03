// ============================================================
// GAME TUNING — difficulty levels and player stats
// ============================================================

export const DIFFICULTY = {
    easy: {
        label: 'CADET',
        boltSpeed: 10,      // alien plasma speed (m/s) — slow enough to dodge
        damage: 1,          // half-hearts per alien hit
        fireRate: 0.5,      // multiplier on how often aliens shoot
        alienHp: 0.75,
        aimAssist: 0.08,    // radians of "magnetism" toward aliens
        sight: 26,
        lead: 0.0,          // how much aliens aim ahead of you
        spread: 0.09,
        shield: 10,
        reaction: 1.2,
    },
    normal: {
        label: 'PILOT',
        boltSpeed: 14,
        damage: 1,
        fireRate: 0.85,
        alienHp: 1.0,
        aimAssist: 0.055,
        sight: 32,
        lead: 0.3,
        spread: 0.055,
        shield: 6,
        reaction: 0.8,
    },
    hard: {
        label: 'COMMANDER',
        boltSpeed: 19,
        damage: 2,
        fireRate: 1.1,
        alienHp: 1.3,
        aimAssist: 0.035,
        sight: 38,
        lead: 0.65,
        spread: 0.03,
        shield: 4,
        reaction: 0.5,
    },
};

export const PLAYER = {
    hearts: 5,              // health = hearts * 2 half-hearts
    height: 1.75,
    eye: 1.62,
    radius: 0.42,
    walk: 6.4,
    sprint: 10.5,
    accel: 55,
    airAccel: 14,
    friction: 10,
    gravity: 13,            // Mars has low gravity — big floaty jumps!
    jumpHeight: 2.35,
    shieldDelay: 3.2,       // seconds without getting hit before the shield recharges
    shieldRate: 3.5,        // shield points per second
    fireRate: 7,            // blaster shots per second
    heatPerShot: 0.072,
    coolRate: 0.55,
    overheatTime: 1.6,
    boltSpeed: 120,
    grenades: 2,
    maxGrenades: 4,
    grenadeDamage: 9,
    grenadeRadius: 6.5,
};
