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
   ```

Each `eval` step prints its result, so a test reads like a log. The run ends with `OK, no errors` or a count of
problems (page errors or failed steps). Screenshots go to `dev/out/` (git-ignored). To review a batch of them in one
image:

```sh
node grid.mjs out/sheet.png 3 out/c4_reveal.png out/c5_pull.png out/c6_press.png
```

## The tests

| Test | What it checks |
| --- | --- |
| `full.json` | The whole game: Mars intro, a fight, a part pickup, repair, the escape and capture cutscene, all mothership rooms and waves, GLORBAX, the escape pod, the end screen |
| `regress.json` | Dying and respawning on both levels, CONTINUE on Mars and on level 2 (the "CONTINUE: LEVEL 2" label), the Mars to level 2 handoff |
| `chapters.json` | The title screen's chapter select (arrow keys + Enter) and Chapter 2 starting from the escape off Mars |
| `boss-balance.json` | Simulated boss fights on every difficulty, standing still and dodging (prints boss HP / player health every 5s) |
| `capture-shots.json` | Screenshots through the capture cutscene (lurch, reveal, tractor beam, cockpit, hangar, KA-BOOM) |
| `boss-intro.json` | Screenshots of GLORBAX's entrance and title card |
| `boss-shots.json` | Screenshots of each boss attack, rage mode and the death |
| `rooms.json` | One screenshot of every mothership room |
| `finale.json` | Screenshots of the escape pod ending and the end screen |
| `perf.json` | Draw calls and triangles in each area of both levels |

## Writing a test

A test is a JSON array of steps (see the top of `run.mjs`). Most of the work happens in `eval` steps that call the
game's debug helpers on `window.game` (they are listed in `../CLAUDE.md`). For example, `game.debug.simulate(5,
{fire: true}, true)` runs 5 seconds of gameplay with the trigger held and the aim locked on the nearest enemy.
`game.debug.cineShot(4, 2.5)` fast-forwards the current cutscene to shot 4, 2.5 seconds in.

## Reviewing sounds

`dev/soundboard.html` plays every sound effect old (synthesized) and new (recorded file) side by side, every music
mode in new and classic versions, and the loops. Open http://localhost:8765/stranded-on-mars/dev/soundboard.html
with the server running. The file lists are in `../js/sounds.js`.

## Notes

- Test browsers are muted (`mute.mjs`), so tests don't play sounds through the speakers. Use it in any new script.

- On a Mac both Chrome and WebKit render on the real GPU (an M1 Pro: about 60 fps in every area at 1512x945, 2x,
  checked October 2026). Close other heavy apps before `fps.mjs`, because anything else using the machine shows up as
  slow frames.
- On Linux (cloud containers) the runner uses the SwiftShader software renderer, which is very slow (a frame can
  take a second). Waits in the tests are generous for that reason. On a Mac with a GPU everything runs much faster.
- Quality: `&quality=low` / `&quality=high` in the URL pins the resolution so screenshots are repeatable.
