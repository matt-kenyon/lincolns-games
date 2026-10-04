# Stranded on Mars

A 3D first-person space adventure by **Lincoln Kenyon**. Your ship's energy overloads on the way to the
Moon, you crash-land on Mars and eject far from the ship. Blast your way past blue fanged aliens, collect the
5 missing ship parts, take your ship back from the Alien Captain, and fly home to the Moon.

...or so you think. **Level 2:** on the way home an alien mothership grabs your ship in its tractor beam. You hit
self-destruct, eject into its hangar bay, and fight through the mothership room by room, beating every wave of
aliens to unlock the doors. In the creature pit you face GLORBAX, a giant one-eyed space kraken (shoot its eye!),
then escape in a pod and land on the Moon for real.

Play it at `/stranded-on-mars/` on the arcade. It's plain HTML + JavaScript modules (no build step), using a
bundled copy of [three.js](https://threejs.org) in `vendor/`.

On the title screen, **PICK A CHAPTER**: Chapter 1 (Mars) starts from the very beginning; Chapter 2 (The
Mothership) starts as you blast off from Mars, so you see the capture, then play level 2. Click a chapter, or
choose with the arrow keys / d-pad and press Enter / A.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move |
| Mouse | Look around |
| Click (hold) | Shoot the plasma blaster (it overheats!) |
| Right-click / G | Throw a sticky plasma grenade |
| Space | Jump (Mars gravity = big jumps) |
| Shift | Sprint |
| E | Pick up / use |
| Esc | Pause |
| M | Mute |

An Xbox-style game controller works too.

**Settings** (the SETTINGS button on the title screen, or press Esc to pause): mouse sensitivity, look
sensitivity for a game controller's right stick, up/down look speed, invert up/down, volume and music. They're
saved in the browser, and RESET LOOK SETTINGS puts the look options back to normal.

## Where things live

| File | What's in it |
| --- | --- |
| `js/layout.js` | The level: canyon path, alien positions, where the ship parts landed |
| `js/config.js` | Difficulty levels and player stats (speed, jump height, blaster heat...) |
| `js/aliens.js` | Alien looks, ranks (scout / trooper / major / captain) and how they fight |
| `js/cinematics.js` | The intro "pre-show" and the ending on the Moon |
| `js/world.js` | Sky, terrain decorations, force fields, the crash site |
| `js/ship.js` | The LINCOLN-1 spaceship and its 5 detachable parts |
| `js/audio.js` | All sounds and music (synthesized, no audio files) |
| `js/toon.js` | The cartoon "Breath of the Wild"-style shading |
| `js/shiplayout.js` | Level 2's map: rooms, hallways, doors, alien waves, checkpoints |
| `js/shiplevel.js` | Level 2's rules: waves, doors, checkpoints, saving, the escape pod |
| `js/mothership.js` | The mothership's insides: walls, floors, force-field doors, lights, space outside |
| `js/shipprops.js` | Mothership decorations: fighters, reactor, specimen tubes (with a cow), bridge, pit, pod |
| `js/shipmodels.js` | Level 2 models: alien fighters, escape pod, the mothership from outside, the cockpit |
| `js/boss.js` | GLORBAX, the tentacled creature boss, and its attacks |
| `js/cutscenes2.js` | Level 2 cutscenes: the capture, self-destruct, GLORBAX's entrance, the escape-pod ending |
| `js/drops.js` | Hearts and grenades that aliens drop on the mothership |

## Updating the game

Every code file is loaded with a version number (`?v=6`) set in `index.html`. **Whenever you change anything in
`js/`, bump that number everywhere in `index.html`** (find and replace `?v=6` with `?v=7`). Otherwise browsers that
kept old files (Safari especially) can mix old and new code after the update and fail to start.

## Testing tips

Add `?debug` to the URL for test keys: `1`-`5` jump to checkpoints, `K` defeats the aliens in the current
area, `I` toggles invincibility, `L` gives all ship parts, `9` jumps to level 2 (the mothership) and `0` jumps to
its escape pod. On the mothership, `5` is the creature pit. Add `&quality=low` or `&quality=high` to pin the
graphics quality (normally it adjusts itself to keep the game smooth).

Automated tests (a full playthrough of both levels, boss balance, cutscene screenshots) live in `dev/`. See
`dev/README.md`. Notes for Claude (architecture, debug API, rules) are in `CLAUDE.md` and `HANDOFF.md`.
