# Stranded on Mars: notes for Claude

A 3D first-person space adventure designed by **Lincoln Kenyon** (a kid) and built with his dad, Matt. Lincoln's
ideas drive the game: keep it fun, cartoony and kid-friendly. Aliens go "poof" (no gore), checkpoints are generous,
and the boss keeps the damage you did if you respawn. The look is a cartoon "Breath of the Wild" style (toon shading,
ink outlines, warm colors).

Live at https://lincolns.games/stranded-on-mars/. The game is part of Lincoln's Arcade (this repo:
`matt-kenyon/lincolns-games`), and Cloudflare Pages deploys `main` automatically. Read `HANDOFF.md` for where the
project stands and what was done most recently. `README.md` is the player-facing overview with a file map.

## Golden rules

1. **Bump the module version on every JS change.** Every module is loaded through the import map in `index.html` with
   `?v=N` (currently `?v=8`). When you change anything in `js/`, find-and-replace `?v=N` with `?v=N+1` in
   `index.html` (and the number in README.md's "Updating the game" section). Safari otherwise mixes cached old modules
   with new ones and the game fails to start. This has happened before.
2. **No build step.** Plain ES modules plus a vendored three.js r186 (`vendor/three.module.min.js`). Don't add
   bundlers or npm dependencies to the game. (`dev/` has a package.json for the test tools only.)
3. **Test before pushing.** Run `dev/` tests (see `dev/README.md`): at least `tests/full.json` (whole game, both
   levels) and `tests/regress.json`. Look at screenshots for anything visual, because a test that passes can
   still look wrong.
4. **Shipping** = commit on a branch, then fast-forward `main` (`git push origin <branch>:main`). Commit messages look
   like `Stranded on Mars: <what changed>`. The family wants changes live, so after pushing give them the link.

## Running it locally

```sh
python3 -m http.server 8765        # from the repo root
open "http://localhost:8765/stranded-on-mars/?debug"
```

URL options: `?debug` turns on test keys and `window.game.debug`. `&quality=low|high` pins the resolution (it's
normally adaptive).

Debug keys (with `?debug`): `1`-`6` jump to checkpoints (`6` is Mars only), `K` defeats the aliens in the current
area, `I` toggles invincibility, `L` gives all Mars ship parts, `9` jumps to level 2, `0` jumps to level 2's escape pod,
`V` (Mars) puts the rover 6 m in front of you (and makes it "found"). `M` switches
the music set (each set in `sounds.js`, then the classic synth music), `Shift+M` holds one music mode (explore,
combat, boss / ship, shipCombat, boss2) to hear a song's layers, `N` switches between the recorded and the classic
synthesized sound effects. `dev/soundboard.html` plays every sound and song side by side.

The title screen has a **chapter select**. Chapter 1 is Mars from the start. Chapter 2 starts with the escape from
Mars (`startOutro`), runs the capture cutscene and then level 2.

## Debug API (in the browser console, or from tests)

`window.game` is the Game. `game.debug`:

| Call | Does |
| --- | --- |
| `stage2(cp)` | Jump into level 2 at checkpoint `cp`, with everything before it done. Checkpoints: 0 hangar, 1 reactor, 2 lab, 3 bridge, 4 creature pit (wakes GLORBAX), 5 escape pod bay (boss already beaten) |
| `teleport(cp)` | Move to checkpoint `cp` of the current level (Mars has 0-5: start, Red Rock Canyon, Crystal Forest, Great Dust Plains, Frozen Crater, Crash Site) |
| `killZone(z)` | Defeat every alien in area `z` (default: the current one) |
| `openAll()` / `allParts()` | Mars: open every force field / collect all 5 ship parts |
| `plains(spot)` | Mars: stand in the Great Dust Plains with the areas before them done. `spot`: `'gate'` (the way in), `'ridge'` (foot of the launch ridge), `'crest'` (the run-up), `'lip'` (top of the kicker ramp), `'mesa'` (on top, next to the wing), `'down'` (the ledge path down), `'exit'` (by the far force field) |
| `jumpUV()` | Mars: where you are in the wing jump's own coordinates: `u` meters past the ramp's lip, `v` sideways, `y` height above the plains floor (the mesa top is `MESA_HEIGHT`) |
| `raid()` | Mars: set off the Crystal Forest camp's alarm (the tent aliens rush out) |
| `crackIce(n)` | Mars: `n` grenade blasts on the Frozen Crater's ice slab (3 frees the thruster) |
| `skipIntro()` | Skip the Mars intro cutscene |
| `cineShot(n, t)` | Fast-forward the running cutscene to shot `n`, `t` seconds in (use 99 to finish it) |
| `simulate(sec, input, track)` | Run gameplay without rendering. `input` like `{fire: true, moveX: 1, jumpEvery: 1.3, interact: true}`. `track = true` auto-aims at the nearest alien, or the boss's eye |
| `look(yaw, pitch)` | Point the camera |
| `rover(x, z, yaw, opts)` | Mars: put the rover at (x, z) facing `yaw` (no arguments: 6 m in front of Lincoln). `opts.flipped` = upside down |

Also useful: `game.player.god = true`, `game.player.spawn(x, z, yaw)`, `game.level.boss` (GLORBAX),
`game.state`, `game.stage.key` (`'mars'` or `'ship'`).

## How the code fits together

- **`js/main.js`**: the `Game`. It handles boot, menus (chapter select, settings, pause), the state machine (`title`,
  `starting`, `intro`/`outro`/`cine` cutscenes, `play`, `paused`, `dead`, `repair`, `end`), the debug API and the
  render loop (dt is capped at 0.05s).
- **Stages.** Each level has its own `{scene, world, effects, aliens, combat, level}`. `game.useStage(st)` swaps them.
  Mars is built at boot. The mothership is built once, lazily, in `buildShipStage()` (behind a black screen,
  because compiling its shaders takes a moment) and entered with `enterShipStage()`.
- **World interface.** Both `World` (world.js, Mars terrain) and `Mothership` (mothership.js, signed-distance rooms
  and halls) implement the same methods, and the player, aliens, combat and HUD only use those: `groundAt`,
  `normalAt`, `ceilingAt`, `confinePlayer`, `confineAlien`, `isSolid`, `solidHit`, `lineOfSight`, `wallBounce`,
  gate methods, `mapImage()` (minimap), `update()`.
- **Mars, area by area** (`layout.js` `ZONES`, `ZONE` names the indices): 0 Landing Site (tail fin in its crater),
  1 Red Rock Canyon (a one-time supply crate behind the stone arch), 2 Crystal Forest (the alien camp raid: the fuel
  tank is in a cage; get close and the alarm calls four more aliens out of the tents (`wave: 1` aliens), beat them all
  to drop the cage; the ship's rover lies flipped at the camp's edge), 3 Great Dust Plains (a big open area for the
  rover: the wing sits on a mesa you reach only by jumping the rover off the alien kicker ramp at the end of the launch
  ridge; this area's force field opens when you have the wing, not when its aliens are beaten), 4 Frozen Crater (the
  thruster is frozen under an ice slab in the lake: three grenade blasts crack it, with a grenade crate on the shore),
  5 the Crash Site (the Alien Captain has the power core). The quests live in `missions.js` (`CampRaid`, `IceSlab`,
  `SupplyCrate`, the rover hooks); the plains' terrain shapes, meshes, colliders and dust devils in `plains.js`.
- **The wing jump** is tuned by three constants in `layout.js`: `RAMP_ANGLE`, `MESA_GAP` (lip to the mesa's edge) and
  `MESA_HEIGHT`; the ridge, the kicker and the mesa follow from them (`JUMP`). On foot nobody can get up there (checked
  by `dev/tests/plains.json`).
- **The rover** (`rover.js`, `game.rover`, Mars only) is placed by the level at the start (`missions.placeRover`:
  flipped at `ROVER_SPOT` until it's been found, then upright by the checkpoint), and calls back
  `game.rover.onFirstFlip` and `game.level.onRoverEnter()`. Grenades call `game.level.onExplosion(pos, radius)`.
- **The ice slab:** the terrain is dug out under it (so you can see into the ice); `World.groundAt` and `normalAt`
  keep the ground at the ice's surface around it (and on the slab), so always use the world's methods, not
  `world.terrain` directly.
- **Level interface.** `Level` (level.js, Mars) and `ShipLevel` (shiplevel.js) both provide `checkpointAt`,
  `zoneName`, `startBanner`, `currentZone`, `objectiveText`, `bossInfo` (HUD boss bar), `drawMapIcons`,
  `save`/`applySave`, `onStart`, `onAlienDefeated`, `onPlayerDown`, `respawn`, `onGateBump`, `update`,
  `exploreMusic`.
- **Data vs. building.** `layout.js` (Mars path, zones, aliens, parts) and `shiplayout.js` (rooms, halls, holes,
  doors, waves, checkpoints) are plain data. Tune the levels there.
- **Aliens** (`aliens.js`): the models, AI and `AlienManager`. Level 2 waves: aliens with `wave > 0` start
  `dormant` and `startWave(zone, wave)` beams them in. The boss plugs into `AlienManager.boss` as a duck-typed
  target (`hitSegment`, `isArmored`, `armorHit`, `hurt`, `blast`, `aimPoint`, `targetable`...).
  Hover-bike riders (type `'hoverbike'`) zoom around open ground, circle, strafe and dive-bomb. They spawn from
  `HOVERBIKES` at the end of `layout.js` (`{x, z, zone}`), passed to `AlienManager` as `extras`: they wake and sleep
  with their zone but don't count in `aliveInZone()`, so they never hold a force field closed. `Alien.launch(vel)`
  (bowled over by the rover: flies off spinning, then poofs, counted like a kill), `knock()` and `dive()` are the
  rover's hooks.
- **Rover** (`rover.js`, Mars only): the LINCOLN-1's emergency rover, Lincoln's idea ("commandeer a Mars rover and
  run over aliens", physics like Halo 3's Mongoose). A rigid body on four raycast spring wheels over
  `world.groundAt/normalAt`, sub-stepped at 240 Hz, with the game's gravity (`PLAYER.gravity`). Tuning is the
  `ROVER` table at the top of the file. Halo-style controls: the camera aims, W drives toward it, the turret fires
  the blaster's bolts (`combat.playerBolt`) along the crosshair ray. It collides through the World interface
  (`confinePlayer`, `blockByGates`, `domeBlocks`, `colliders`, steep ground with normal.y < 0.6 as a wall).
  Loose rocks up to knee height (untagged colliders no more than `BUMP_MAX` = 0.85 m tall) are bumps its wheels and
  belly roll over; taller rocks and every collider with a tag are walls it bounces off. So a collider that must
  stop the rover (like the bumper boulders at the mesa's far rim, tagged `'bumper'`) needs a tag. main.js calls
  `update()` after the player and `lateUpdate()` after the level (a level prompt with a key wins over the rover's
  E prompt); `Player.update` returns early while riding and `Player.updateCamera` hands
  the camera to `rover.applyCamera()`. Alien bolts hitting the rover or Lincoln on it do half damage
  (`Player.hurt` adds up fractions). **The level's interface (keep these exactly):**
  - `game.rover` exists on the Mars stage only (`useStage` swaps it; `null` aboard the mothership). It's hidden
    until placed.
  - `game.rover.place(x, z, yaw, { flipped })`: put it in the world (yaw 0 faces -Z, like the camera). No options =
    upright and `found`; `flipped: true` = upside down and not found yet, waiting for "Hold E: flip the rover".
  - `game.rover.driving` (boolean), `game.rover.pos` (Vector3, the body's center, about 0.9 m above the ground at
    rest), `game.rover.speed` (m/s), `game.rover.placed`, `game.rover.found` ("Hold R: call the rover" only works
    once found; set it for an old save, or place it upright).
  - `game.rover.onFirstFlip`: set it to a function; called when the player flips a not-yet-found rover upright.
  - `game.level.onRoverEnter?.()` is called every time the player gets in.
  - Dying while driving respawns normally and parks the rover near that checkpoint (`onPlayerSpawn`). Measured:
    0 to 24 m/s in about 4 s; off a 25 degree ramp (8 m long, 3.7 m tall) at full speed it leaves the lip at about
    20 m/s (at ~25-30 degrees: the springs kick), peaks 3.3 m above the lip, is back at the lip's height 24.5 m out
    and first touches flat ground about 30 m past the lip. `dev/tests/rover.json` measures it again. In the air it
    levels itself (and lines up with sloped ground just below it); the stick tips it about 18 degrees, so landings
    are mostly on the wheels and full-speed crashes into walls are what tip it over.
- **Boss** (`boss.js`): GLORBAX. States `hidden → intro → idle ⇄ slam / spit / laser`, `roar` (phase change at
  66% / 33% HP, summons helper waves), then `dying → dead`. Only the open eye takes damage. Its tentacles are
  one tube mesh in world space, bent along Bezier curves on the CPU every frame (the hit spheres are separate). Balance knobs: `maxHp` (110 × difficulty),
  `slamWindup()`, the laser `turn` speed, the spit count and the `toIdle()` cooldowns.
- **Cutscenes.** `cinematics.js` runs shot lists and owns the space scene. It holds the Mars intro and the outro,
  which ends in level 2's capture. `cutscenes2.js` has the level 2 shots: the capture, GLORBAX's entrance and the
  finale. A shot is `{dur, fov, world, start(), update(t, dt)}`. `world: true` renders the current stage's scene
  instead of space. Each cutscene function keeps its private flags in its own `const S = {}`. Don't put shot state
  on the shared Cinematics object (a stale flag crashed the outro once). A shot that continues the previous shot's
  camera move adds `blend: secs` (ease in from where the last shot left the camera) and, if the camera follows
  something moving, `anchor: () => vec`. Time everything in a shot with its `t` (never `setTimeout`) and scale
  per-frame motion by `dt`, so fast-forwarded tests and 120 Hz screens see the same thing.
- **Toon look** (`toon.js`): `toonMaterial()` (MeshToonMaterial plus shader patches for rim light, paint noise,
  plant sway, a glowing vertex attribute and hex floors), `addOutline()` (inverted-hull ink lines), `glowSprite()`.
  `GeoBuilder` merges many primitives into one vertex-colored mesh. **Gotcha:** a color callback receives vertex
  positions after the part's position, rotation and scale are applied, so measure relative to the part's center.
- **Audio** (`audio.js`, `samples.js`, file lists in `sounds.js`): sound effects and loops are recorded files in
  `audio/sfx/` (MP3); anything without a file falls back to its synthesized version in `audio.js`. Music plays in
  sets of songs from `audio/music/`, each split into stems that loop in sync; the music mode (`setMusic('title'|
  'intro'|'explore'|'combat'|'boss'|'ship'|'shipCombat'|'boss2'|'theme'|'none')`) picks the song and fades its layers
  in and out. Modes a set doesn't cover, and the **Classic music** setting, use the original synthesized music (class
  `Music`, kept on purpose). Music loops are wrap-padded (`pad`) so they loop gaplessly in Safari; MP3s must be
  encoded with libmp3lame (its gapless header makes them decode to the exact length). Every home-* song is built
  on Lincoln's own theme (transcribed from his keyboard demo; see `dev/music/README.md`). `dev/build-music.py` builds
  the Woodland files. Bump `AUDIO_V` in `sounds.js` when you replace a file under the same name. Also
  `setAmbience('wind'|'ship')`, `alarm(on)`, `tractor(on)`, `engine(level)`, `say(text)` (speech synthesis).
  Credits for the Woodland music (CC BY 4.0) are on the end screen and must stay while it's used.
- **HUD** (`hud.js`): hearts and shield, compass markers, the minimap, the boss bar, toasts, banners and prompts.

## Gotchas

- **Lights:** adding or removing a light makes three.js recompile every shader (a visible stutter). Cutscenes reuse
  spare lights that always exist in the space scene (`c.greenLight`, `c.redLight`, `c.sun`). Move them or change
  their intensity rather than adding new ones. Put `c.sun` back to `c.sunHome` afterwards.
- **Shader warm-up:** the first time a new kind of material is drawn in a scene, three.js compiles a shader and the
  GPU links it on first use: a 0.1-0.4 s freeze on a Mac. Everything the cutscenes show is compiled and linked up
  front (`Cinematics.warmUp()` at boot, `warmShip()` when the mothership is built). If you add a new kind of prop or
  material to a cutscene, add a throwaway copy to those lists, then check `dev/cutscene-fps.mjs` shows no `+N`
  programs during any shot. Build big props before the cutscene starts, not in a shot's `start()`.
- **Saves** are in localStorage, key `strandedOnMars.save.v1`. Mars format:
  `{v:2, diff, cp, have, gates, dome, captain, stats, raid, ice, crates, rover}` (`ice`: blasts so far, -1 once
  broken; `rover`: found). A `v:1` Mars save (from before the Great Dust Plains: five areas, four force fields) is
  migrated by `Level.migrate()` when it's loaded, so CONTINUE still works (`dev/tests/regress.json` checks it).
  Level 2 format: `{v:1, stage:2, diff, cp, cleared, bossSeen, boss, stats}`. Settings: `strandedOnMars.settings`.
- **Headless testing on Linux** uses software WebGL and runs at a few frames per second, so real-time waits (like
  the 2.8s death screen) take much longer there. Prefer `game.debug.simulate()` and `cineShot()` over waiting.
- **Controls:** keyboard + mouse or a gamepad. Touch isn't supported (the title shows a notice on touch-only
  devices).
- **Kid-friendly balance:** dying keeps progress (checkpoints, the boss's damage), and when you respawn in the boss
  fight its helper aliens beam out. Keep it that way unless the family asks otherwise.
