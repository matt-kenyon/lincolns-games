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
   `?v=N` (currently `?v=5`). When you change anything in `js/`, find-and-replace `?v=N` with `?v=N+1` in
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

Debug keys (with `?debug`): `1`-`5` jump to checkpoints, `K` defeats the aliens in the current area, `I` toggles
invincibility, `L` gives all Mars ship parts, `9` jumps to level 2, `0` jumps to level 2's escape pod.

The title screen has a **chapter select**. Chapter 1 is Mars from the start. Chapter 2 starts with the escape from
Mars (`startOutro`), runs the capture cutscene and then level 2.

## Debug API (in the browser console, or from tests)

`window.game` is the Game. `game.debug`:

| Call | Does |
| --- | --- |
| `stage2(cp)` | Jump into level 2 at checkpoint `cp`, with everything before it done. Checkpoints: 0 hangar, 1 reactor, 2 lab, 3 bridge, 4 creature pit (wakes GLORBAX), 5 escape pod bay (boss already beaten) |
| `teleport(cp)` | Move to checkpoint `cp` of the current level (Mars has 0-4) |
| `killZone(z)` | Defeat every alien in area `z` (default: the current one) |
| `openAll()` / `allParts()` | Mars: open every force field / collect all 5 ship parts |
| `skipIntro()` | Skip the Mars intro cutscene |
| `cineShot(n, t)` | Fast-forward the running cutscene to shot `n`, `t` seconds in (use 99 to finish it) |
| `simulate(sec, input, track)` | Run gameplay without rendering. `input` like `{fire: true, moveX: 1, jumpEvery: 1.3, interact: true}`. `track = true` auto-aims at the nearest alien, or the boss's eye |
| `look(yaw, pitch)` | Point the camera |

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
- **Level interface.** `Level` (level.js, Mars) and `ShipLevel` (shiplevel.js) both provide `checkpointAt`,
  `zoneName`, `startBanner`, `currentZone`, `objectiveText`, `bossInfo` (HUD boss bar), `drawMapIcons`,
  `save`/`applySave`, `onStart`, `onAlienDefeated`, `onPlayerDown`, `respawn`, `onGateBump`, `update`,
  `exploreMusic`.
- **Data vs. building.** `layout.js` (Mars path, zones, aliens, parts) and `shiplayout.js` (rooms, halls, holes,
  doors, waves, checkpoints) are plain data. Tune the levels there.
- **Aliens** (`aliens.js`): the models, AI and `AlienManager`. Level 2 waves: aliens with `wave > 0` start
  `dormant` and `startWave(zone, wave)` beams them in. The boss plugs into `AlienManager.boss` as a duck-typed
  target (`hitSegment`, `isArmored`, `armorHit`, `hurt`, `blast`, `aimPoint`, `targetable`...).
- **Boss** (`boss.js`): GLORBAX. States `hidden → intro → idle ⇄ slam / spit / laser`, `roar` (phase change at
  66% / 33% HP, summons helper waves), then `dying → dead`. Only the open eye takes damage. Its tentacles are
  InstancedMeshes in world space, posed with Bezier curves. Balance knobs: `maxHp` (110 × difficulty),
  `slamWindup()`, the laser `turn` speed, the spit count and the `toIdle()` cooldowns.
- **Cutscenes.** `cinematics.js` runs shot lists and owns the space scene. It holds the Mars intro and the outro,
  which ends in level 2's capture. `cutscenes2.js` has the level 2 shots: the capture, GLORBAX's entrance and the
  finale. A shot is `{dur, fov, world, start(), update(t, dt)}`. `world: true` renders the current stage's scene
  instead of space. Each cutscene function keeps its private flags in its own `const S = {}`. Don't put shot state
  on the shared Cinematics object (a stale flag crashed the outro once).
- **Toon look** (`toon.js`): `toonMaterial()` (MeshToonMaterial plus shader patches for rim light, paint noise,
  plant sway, a glowing vertex attribute and hex floors), `addOutline()` (inverted-hull ink lines), `glowSprite()`.
  `GeoBuilder` merges many primitives into one vertex-colored mesh. **Gotcha:** a color callback receives vertex
  positions after the part's position, rotation and scale are applied, so measure relative to the part's center.
- **Audio** (`audio.js`): everything is synthesized with WebAudio (no sound files). `play(name, pos)`,
  `setMusic('title'|'intro'|'theme'|'explore'|'combat'|'ship'|'boss2'|'none')`, `setAmbience('wind'|'ship')` (Mars wind or the ship's hum),
  `alarm(on)`, `tractor(on)`, `say(text)` (speech synthesis).
- **HUD** (`hud.js`): hearts and shield, compass markers, the minimap, the boss bar, toasts, banners and prompts.

## Gotchas

- **Lights:** adding or removing a light makes three.js recompile every shader (a visible stutter). Cutscenes reuse
  spare lights that always exist in the space scene (`c.greenLight`, `c.redLight`, `c.sun`). Move them or change
  their intensity rather than adding new ones. Put `c.sun` back to `c.sunHome` afterwards.
- **Saves** are in localStorage, key `strandedOnMars.save.v1`. Mars format:
  `{v:1, diff, cp, have, gates, dome, captain, stats}`. Level 2 format: `{v:1, stage:2, diff, cp, cleared, bossSeen,
  boss, stats}`. Settings: `strandedOnMars.settings`.
- **Headless testing on Linux** uses software WebGL and runs at a few frames per second, so real-time waits (like
  the 2.8s death screen) take much longer there. Prefer `game.debug.simulate()` and `cineShot()` over waiting.
- **Controls:** keyboard + mouse or a gamepad. Touch isn't supported (the title shows a notice on touch-only
  devices).
- **Kid-friendly balance:** dying keeps progress (checkpoints, the boss's damage), and when you respawn in the boss
  fight its helper aliens beam out. Keep it that way unless the family asks otherwise.
