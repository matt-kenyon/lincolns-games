# Stranded on Mars: test tools

These tools drive the real game in a headless Chromium (Playwright) and print what happened. They are not part of the
game. The game has no build step and doesn't need anything in this folder.

## One-time setup (macOS)

You need Node.js 18+ and Python 3 (both come with most Macs once Xcode command line tools / Homebrew are set up).

```sh
cd stranded-on-mars/dev
npm install                      # installs Playwright
npx playwright install chromium  # downloads the test browser
```

## Running

1. Serve the **repo root** on port 8765 (leave this running in its own terminal tab):

   ```sh
   cd <repo root>   # the folder with the arcade's index.html
   python3 -m http.server 8765
   ```

   The game is then at http://localhost:8765/stranded-on-mars/ (add `?debug` for test keys).

2. In another tab:

   ```sh
   cd stranded-on-mars/dev
   node run.mjs tests/full.json      # whole game, both levels, in about 2 minutes
   npm test                          # full + regress + chapters
   HEADED=1 node run.mjs tests/chapters.json   # watch it run in a visible window
   BROWSER=webkit node run.mjs tests/full.json  # Safari's engine (needs `npx playwright install webkit` once)
   BROWSER=chrome node run.mjs tests/full.json  # the Google Chrome installed on this Mac
   BROWSER=webkit node fps.mjs                  # real frame rate in every area, MacBook-sized window at 2x
   BROWSER=chrome node boot-time.mjs 3          # how long the game takes to load (fresh browser each run)
   BROWSER=chrome node cutscene-fps.mjs         # every cutscene in real time: slow frames per shot (see below)
   BROWSER=chrome node rover-fps.mjs            # real frame rate driving the rover flat out up the canyon
   ```

Each `eval` step prints its result, so a test reads like a log. The run ends with `OK, no errors` or a count of
problems (page errors or failed steps). Screenshots go to `dev/out/` (git-ignored). To review a batch of them in one
image:

```sh
node grid.mjs out/sheet.png 3 out/c4_reveal.png out/c5_pull.png out/c6_press.png
BROWSER=chrome node grid.mjs ...     # use the installed Chrome instead of Playwright's Chromium
```

`map.mjs` draws a top-down map of Mars with the path, force fields, checkpoints, parts, aliens and set pieces, each
walkable spot tinted by the area the game thinks it's in, and checks that the force fields really seal each area
(it floods the walkable ground from the start, opening one force field at a time):

```sh
node map.mjs                                                    # out/mars-map.png
MAP_SCALE=3 MAP_BOX=-380,-740,-60,-380 node map.mjs out/plains-map.png   # zoom in on the plains
```

(`BROWSER=chrome node grid.mjs ...` uses the installed Google Chrome, if Playwright's own Chromium isn't downloaded.)
To freeze the game for a screenshot after `game.debug.simulate()`, set `game.state = 'paused'` in an `eval` step
(it keeps drawing the frame without moving anything) and `'play'` again afterwards; `tests/rover.json` does this.

## The tests

| Test | What it checks |
| --- | --- |
| `full.json` | The whole game: Mars intro, a fight, every ship part the way a player gets it (the camp raid fight and cage, the wing on the mesa, real grenades cracking the ice), the supply crates, repair, the escape and capture cutscene, all mothership rooms and waves, GLORBAX, the escape pod, the end screen |
| `regress.json` | Dying and respawning on both levels (and during the camp raid), CONTINUE on Mars and on level 2 (the "CONTINUE: LEVEL 2" label), the Mars to level 2 handoff, old (v1, five-area) Mars saves migrating to the new route |
| `plains.json` | The Great Dust Plains on foot: no way onto the mesa or its ledge path without the rover (jumps off the ramp at every timing, climbing every side), the way down works, the plains can be crossed on foot, the force field holds until you have the wing |
| `plains-shots.json`, `quests-shots.json`, `plains-aerial.json` | Screenshots of the plains (ridge, kicker, mesa, ramps, arches, dust devils), the quests (supply crate, camp alarm and cage, the rover spot, the ice slab cracking) and the plains from the air |
| `chapters.json` | The title screen's chapter select (arrow keys + Enter) and Chapter 2 starting from the escape off Mars |
| `boss-balance.json` | Simulated boss fights on every difficulty, standing still and dodging (prints boss HP / player health every 5s) |
| `capture-shots.json` | Screenshots through the capture cutscene (lurch, reveal, tractor beam, cockpit, hangar, KA-BOOM) |
| `boss-intro.json` | Screenshots of GLORBAX's entrance and title card |
| `boss-shots.json` | Screenshots of each boss attack, rage mode and the death |
| `rooms.json` | One screenshot of every mothership room |
| `finale.json` | Screenshots of the escape pod ending and the end screen |
| `perf.json` | Draw calls and triangles in each area of both levels (including the camp, the plains and the frozen crater) |
| `rover.json` | Lincoln's rover: getting in, top speed, a hard turn (drift) and the handbrake, a 25 degree ramp jump (measured: lip speed, peak height, distance), a wall crash that tips it over and "Hold E" flipping it back, running an alien over (counted as beaten), an alien diving out of the way, the turret, ramming a hover-biker, half damage on the rover, getting out, "Hold R" calling it, dying while driving, debug `V`, the Alien Captain bouncing it off. Screenshots `out/rover*.png` |
| `astronaut.json` | Lincoln (the hero) in every cutscene shot he's in, plus a turntable of the model and his poses (`turntable.js`), and the first-person glove + blaster on Mars and the mothership. `turntable.js` also has `gunViews()`, the blaster from four angles |

## Combat effects, frame by frame

`combat-shots.mjs` captures combat effects one game step at a time, which is how short effects (bolts, impacts,
poofs, grenade blasts) are reviewed. It holds the real game loop, advances the game in small steps and screenshots
each one, with `Math.random` seeded so runs repeat.

```sh
node combat-shots.mjs after                       # every scenario: out/combat-after/*.png, one sheet per scenario,
                                                  # and out/combat-after.png (one row per scenario)
node combat-shots.mjs try mars_poof ship_grenade  # just some scenarios
node combat-shots.mjs perf --perf                 # the heaviest fight (every Reactor Core wave at once), timed
node combat-shots.mjs probe --eval "fx.mars(); return game.combat.tally"   # run JS with the capture helpers
```

## Writing a test

A test is a JSON array of steps (see the top of `run.mjs`). Most of the work happens in `eval` steps that call the
game's debug helpers on `window.game` (they are listed in `../CLAUDE.md`). For example, `game.debug.simulate(5,
{fire: true}, true)` runs 5 seconds of gameplay with the trigger held and the aim locked on the nearest enemy.
`game.debug.cineShot(4, 2.5)` fast-forwards the current cutscene to shot 4, 2.5 seconds in.

## Reviewing sounds

`dev/soundboard.html` plays every sound effect old (synthesized) and new (recorded file) side by side, every music
mode in new and classic versions, and the loops. Open http://localhost:8765/stranded-on-mars/dev/soundboard.html
with the server running. The file lists are in `../js/sounds.js`.

## Cutscene frame timing (`cutscene-fps.mjs`)

`BROWSER=chrome|webkit node cutscene-fps.mjs [intro] [outro] [boss] [finale]` (default: all four) plays each cutscene
in real time from its start, in a freshly launched browser (so no shader is cached from an earlier run), in a
MacBook-sized window at 2x with the game's normal adaptive quality. Every frame is timed with
`requestAnimationFrame` and tagged with the shot and the time into the shot. Per shot it prints the frame rate, the
frames slower than 25 ms (`SPIKE=` to change), the worst frame, the number of compiled shader programs before and
after the shot (a jump means a shader compiled mid-shot, which is a stutter) and the resolution scale (a change means
the canvas was resized mid-shot). It then lists every slow frame (`s5@0.6 167ms(work 5.5)` = shot 5, 0.6 s in, a
167 ms frame of which 5.5 ms was the game's own frame code) and every camera jump: a frame that moves the camera
(without the shake) much further than the frames around it, and the jump at each shot change (a cut is fine; a
continuous move that jumps reads as a stutter). `RUNS=2` repeats each cutscene, because one-off slow frames come and
go between runs. Raw frames are saved to `out/cutscene-<browser>-<name>.json`. Run one browser at a time and close
heavy apps first.

## Notes

- Test browsers are muted (`mute.mjs`), so tests don't play sounds through the speakers. Use it in any new script.

- On a Mac both Chrome and WebKit render on the real GPU (an M1 Pro: about 60 fps in every area at 1512x945, 2x,
  checked October 2026). Close other heavy apps before `fps.mjs`, because anything else using the machine shows up as
  slow frames.
- On Linux (cloud containers) the runner uses the SwiftShader software renderer, which is very slow (a frame can
  take a second). Waits in the tests are generous for that reason. On a Mac with a GPU everything runs much faster.
- Quality: `&quality=low` / `&quality=high` in the URL pins the resolution so screenshots are repeatable.
