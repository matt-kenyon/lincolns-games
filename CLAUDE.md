# Lincoln's Arcade

Browser games made by Lincoln Kenyon (a kid) with his dad, Matt. This is a static site with no build step:
Cloudflare Pages deploys the `main` branch to https://lincolns.games as soon as it's pushed.

- `index.html`: the arcade homepage (one card per game).
- `stranded-on-mars/`: a 3D first-person adventure (three.js) with two levels. **Read
  `stranded-on-mars/CLAUDE.md` and `stranded-on-mars/HANDOFF.md` before working on it.**
- `saber-duel/`: a lightsaber fighting game (a single HTML file).
- The Photo Comic Maker card links to a separate site (comics.lincolns.games), which isn't in this repo.

Run locally with `python3 -m http.server 8765` from this folder, then open http://localhost:8765/.

Keep everything kid-friendly. Ship by fast-forwarding `main` once things are tested, and send the family the link.
