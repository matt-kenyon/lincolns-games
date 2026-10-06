# Handoff: Stranded on Mars (October 2026)

This is where the project stands, for whoever picks it up next (most likely Claude Code running locally on a Mac).
Read `CLAUDE.md` in this folder first: it has the working rules, the debug API and the architecture.

## TL;DR

- The game is **finished and live** at https://lincolns.games/stranded-on-mars/ with two levels, cutscenes, a boss,
  an ending and a chapter select. Everything is on `main` (Cloudflare Pages deploys it automatically).
- The work branch is `claude/stranded-on-mars`, kept identical to `main`.
- Testing so far has only been automated, in headless Chromium on Linux, which is slow. **Nobody has played level 2
  on real hardware yet.** First job on the Mac: play both chapters in Safari and Chrome and fix whatever feels off.
- Test tools now live in `dev/` (see `dev/README.md`). `node run.mjs tests/full.json` plays the whole game in about
  2 minutes.

## Continuing on the Mac

**Option A: move the cloud session itself (keeps the whole conversation).** In a terminal, inside a clone of
`matt-kenyon/lincolns-games` with a clean working tree, signed in to the same claude.ai account:

```sh
claude --teleport
```

Pick the Stranded on Mars session from the list (or use **Open in > Terminal** in the session's menu on
claude.ai/code, which copies a command with the session ID filled in). It checks out the branch and loads the
conversation. This needs the Claude Code command-line tool, not the desktop app. Docs:
https://code.claude.com/docs/en/claude-code-on-the-web

**Option B: start fresh.** `git clone https://github.com/matt-kenyon/lincolns-games`, open Claude Code in it and
say "read stranded-on-mars/CLAUDE.md and HANDOFF.md". The docs plus the code are enough to carry on.

## What the game is

Lincoln's story: his ship overloads on the way to the Moon, he crash-lands on Mars, fights blue fanged aliens, finds
the 5 missing ship parts, beats the Alien Captain, fixes the ship and flies home... and then, his Level 2 idea (his
words, lightly trimmed):

> ...as you're flying toward the moon, the exact same cutscene keeps playing... the camera stays behind the ship. The
> ship goes, grrr, and it lurches forward, and all of a sudden it stops. And it won't fly toward the moon... the
> camera rotates quickly to the front of the ship, facing the back, to reveal that you're being chased by an alien
> mothership, and caught in their tractor beam. And then the tractor beam pulls the ship in... cut to an inside shot
> of the cockpit where Lincoln presses some buttons to set the ship to self-destruct. And right before the ship
> self-destructs, he launches out of the ship into the landing bay of the alien ship. He has to fight his way
> through each wave of alien until he gets to the escape pod... at the very end, he has to fight a big alien boss...
> a different type of NPC, different attacks, could be like a creature... introductory cutscene like Ocarina of
> Time... crazy music... once he beats the boss, he goes to the escape pod, and there's a cutscene that shows him
> using the escape pod to launch to the moon. And then that's the real ending of the game.

All of that is built.

### Chapter 1: Mars (level 1)
Intro cutscene, then five areas along a canyon path (Landing Site, Red Rock Canyon, Crystal Forest, Frozen Crater,
the Crash Site). Force-field gates open when an area's aliens are beaten, the 5 ship parts are scattered around, and
the Alien Captain guards the crash site under a dome. Then a repair sequence and the escape cutscene.

### Chapter 2: The Mothership (level 2)
- **The capture cutscene** (end of the outro): the ship stalls, the camera whips round and the purple mothership
  appears (angry yellow eyes, a fanged hangar mouth, a green tractor beam). It reels the ship in. In the cockpit
  Lincoln flips the cover and hits SELF-DESTRUCT (with a countdown voice). He ejects into the hangar bay, the
  LINCOLN-1 goes KA-BOOM, and a "LEVEL 2: THE MOTHERSHIP" card appears.
- **Six areas**: Hangar Bay, Reactor Core, Specimen Lab (a cow, a duck, a fish and blobs in tubes), Command Bridge
  (big space window), The Creature Pit and the Escape Pod Bay. In each room, waves of aliens beam in (2-3 waves)
  and the door unlocks when every wave is beaten. Aliens drop hearts and grenades.
- **The boss, GLORBAX** ("Tentacled Terror of the Mothership"): a giant one-eyed purple space kraken in a pit. Its
  Ocarina-style entrance has a rumble, tentacles bursting out, the eye snapping open, a roar, a title card and its
  own boss music. Only its eye can be hurt (its skin clanks and the game gives a hint). It attacks with tentacle
  slams (red warning circle, then a shockwave you jump over), goo spit and a tracking eye laser you dodge or hide
  behind a pillar from. At 66% and 33% HP it roars and calls in alien helpers. In the last phase it turns red and
  slams twice. When it dies there's slow motion, puffs of smoke and a big poof. Then the alarm sounds:
  "GET TO THE ESCAPE POD!"
- **Finale**: Lincoln hops in the pod, the hatch irises open, BLAST OFF. Out in space the mothership explodes
  (KA-BOOOOOM), the pod lands at the Moon base, there's a flag, "MISSION COMPLETE!", THE END and the stats screen.

### Title screen
**Pick a chapter**: two cards (arrow keys / d-pad + Enter / A, or click). Chapter 2 skips Mars and starts at
"Ship repaired! All systems... GO!", then plays the liftoff, the capture and level 2. Also CONTINUE (which reads
"CONTINUE: LEVEL 2" for a level-2 save), difficulty (Cadet / Pilot / Commander), How to Play and Settings (mouse and
look sensitivity, invert, volume).

## History

1. Level 1 built and launched (PR #2), then mouse/look sensitivity settings.
2. A Safari "module" error after an update. Fixed by loading every module with `?v=N` through an import map. Bump
   N on every JS change (CLAUDE.md, golden rule 1).
3. Level 2 (commit `230fc25`): engine refactor into stages; the mothership; waves; GLORBAX; cutscenes; sounds and
   music; drops; saves and CONTINUE.
4. Chapter select (commit `d0792f0`), then `?v=5` (`8fa5ee5`).
5. Smoother cutscenes (October 2026, after Matt saw stutter on the Mac): shaders for everything the cutscenes show
   are compiled and linked behind the loading/black screens, the space scene and the mothership are built before
   they're needed, shot changes no longer jump, cards and captions run on the cutscene's own clock, and quality is
   pinned during cutscenes. Measure with `dev/cutscene-fps.mjs`.
6. The October 2026 Mac session (local clone at `~/Projects/lincolns-games`), all on `claude/stranded-on-mars`,
   **not on `main` yet** until Matt has listened and looked:
   - **Lincoln's astronaut** redesigned (bubble helmet, blue visor, orange "L" patch, mitten gloves; feet on the
     ground, knees), and a matching first-person glove and toy ray-gun blaster (`models.js`, `player.js`).
   - **Aliens** redesigned as blue fanged cartoon critters with per-type looks and full animation (`aliens.js`).
     Any hit on the head counts as a headshot, lower jaw included (Matt's call).
   - **GLORBAX**: smooth tube tentacles with suckers, squishy body, expressive eye, red rage phase (`boss.js`).
   - **Combat effects**: tracers, muzzle flash, impacts, toon poof, cartoon grenade blasts, hit markers, light
     camera kick and shake, 3-frame hit-stop on kills (`effects.js`, `combat.js`, `hud.js`).
   - **Audio from files**: recorded sound effects and loops (`audio/sfx/`), layered music (`audio/music/`) in
     sets: `mix` (Woodland on Mars + our own songs elsewhere, the default for now) and `ours` (our own songs
     everywhere), plus the classic synth music behind the Classic music setting. GLORBAX's music adds a rage
     layer after its first roar and fully in the red phase. Debug keys `M`, `Shift+M`, `N`; `dev/soundboard.html`.
     Our songs are composed as code in `dev/music/`. Sources and licenses: `js/sounds.js` comments, and the
     git-ignored `dev/audio-src/LICENSES.md` + `MAPPING.md`.
   - Test browsers are muted (`dev/mute.mjs`), `BROWSER=chrome|webkit` picks the browser, `dev/fps.mjs` measures
     real frame rates (60 fps everywhere on an M1 Pro).

Decisions and fixes worth knowing about:
- The mothership was retuned for the reveal: lit from the front (the space sun moves for the capture shots), given a
  face and fangs, and framed from a 3/4 angle. Front-lit from below it read as a dark bowl.
- Lincoln's helmet visor was on the **side** of his head in every cutscene (a SphereGeometry `phiStart` bug in
  `models.js`). Fixed, so it faces forward now.
- In the boss fight, dying used to reset GLORBAX's helper aliens to full health right next to the respawn point (a
  death loop). Now the helpers beam out when you respawn, and one helper's spawn point was moved away from the
  entrance.
- GLORBAX keeps its damage when you die (kid-friendly). Its body sits a little higher and its idle tentacles a
  little lower, so shots at the eye aren't blocked by tentacles most of the time.

## Boss balance (simulated, perfect aim)

| Difficulty | Standing still at the entrance | Strafing + jumping |
| --- | --- | --- |
| Cadet (easy), 83 HP | ~50s, 1 death | ~45s, 0 deaths |
| Pilot (normal), 110 HP | ~53s, 0 deaths (finished on 1.4 hearts) | ~55s, 0 deaths |
| Commander (hard), 143 HP | ~57s, 3 deaths | ~74s, 0 deaths |

A real kid aims worse, so expect 1.5-3 minutes. If Lincoln finds it too hard or too easy, tune `maxHp` and the
`toIdle()` cooldowns in `boss.js` first, then re-run `dev/tests/boss-balance.json`.

## Not verified yet / rough edges

- **Real hardware**: performance and feel of level 2 on the Mac (Safari + Chrome) and with a game controller. In
  headless tests the mothership draws fewer triangles than Mars (130-250k vs about 600k) with similar draw calls
  (35-420 depending on the room), so it should run at least as well as Mars.
- **Shipped (October 2026):** the October work is live on `main`. **The soundtrack is Lincoln's own theme**: he
  recorded a keyboard demo, it was transcribed (A minor, 102 bpm, 12 bars of parallel thirds; notes in
  `dev/music/songs.py` as `LT`) and every `home-*` song is built on it. **Lincoln confirmed the transcription is his
  song** (2026-10-05), so keep his notes as they are; ask him before changing them. `MUSIC_SET = 'ours'` is the
  default; Woodland and the classic synth music stay reachable with `?debug` + `M`. His recording and video are
  only in the git-ignored `dev/audio-src/lincoln-theme/` (the repo is public: never commit them). The recorded
  sound effects (Sonniss/Mixkit included) and the end-screen credits went live as recommended. Nobody has
  reviewed every sound by ear yet; the claude.ai sound review page (Keep / Swap per sound) is where Matt marks them.
- Not Lincoln's: the singing counter-line `LT_SONG`, the G# notes and the mothership's bass notes were added by
  the arranger. The ending switches to A major (his C becomes C#) on purpose.
- The over-the-shoulder self-destruct shot still has Lincoln's helmet in about 30% of the frame.
- Touch devices aren't supported (keyboard/mouse or gamepad only).
- No automated tests run in CI. The `dev/` tests are run by hand.

## Ideas if the family wants more

(Only build what Lincoln/Matt ask for. These are just candidates.)
- A level 3 on the Moon base, or a secret area / easter egg (the cow in the specimen lab is begging for one).
- A boss rush or time-trial mode, now that there's a chapter select.
- Collectibles on the mothership; achievements on the end screen.
- Touch controls for an iPad.

## How Matt and Lincoln like to work

- Requests often arrive as voice memos (long, conversational). Pull out every concrete detail Lincoln mentions, since
  he cares about the specifics (the "grrr", the camera move, the Ocarina-style intro, the crazy music).
- They want things **live** quickly: push to `main` when done and send the link.
- They play on a Mac, so check Safari (that's where the module-cache bug showed up).
- "Iterate until it's perfect": test a lot, look at screenshots, fix what looks off before calling it done.
