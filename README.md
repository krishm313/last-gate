# Last Gate (working title)

A camp-defense game for phones: walk your hero around a fortified camp, gather coins and logs,
build and upgrade defenses, and hold the town hall against waves of enemies pouring out of the forest.
Original game in the camp-defense genre — see `PLAN.md` for the design and `PROGRESS.md` for the
build log.

## Play

```bash
npm install
npm run dev        # http://localhost:5180 — also served on your LAN IP
```

**On your iPhone:** open **https://krishm313.github.io/last-gate/** in Safari, keep it open on
Wi-Fi for about a minute (it downloads the whole game, ~40 MB, for offline play), then Share →
**Add to Home Screen**. It launches full-screen like an app and works offline. Every push to `main`
redeploys it (`.github/workflows/pages.yml`); installed copies update the next time they open
online. For local testing, `npm run dev` also serves on your LAN IP ("Network:" URL).

**Controls:** drag anywhere to walk (WASD / arrows on desktop) · tap ✦ (or Space) for your hero's
ability · ▶ (or F) to fast-forward · "Call wave now" (or C / Enter) to start the next wave early for
bonus coins · II (or P / Esc) to pause · M mutes · 1 / 2 / 3 pick a blessing, R rerolls · in menus Enter plays
the next chapter / confirms and Esc backs out. **Gamepad:** stick or d-pad walk, A ability/confirm,
B back, X call wave, Y/RB speed, Start pause. On wide screens a side panel lists the keys.

## What's in it

- **Camp:** archer towers (6 slots, 4 levels), catapults (splash), barracks (soldiers who defend
  breaches), wall repair and fortify (wood → banded → stone → battlements), lumber camp with
  woodcutters, forge (logs → bows that boost towers), hall upgrades. Buildings unlock over the
  first five waves.
- **Hero:** carries coin / log / bow stacks, auto-shoots, levels up during a run, respawns if it falls.
  4 heroes (Ranger, Knight, Pyromancer, Engineer), each with a passive and a tap ability
  (Arrow Rain, Shield Bash, Fire Nova, Overclock).
- **Enemies:** 13 types (shieldbearers, crossbowmen, goblin mobs that split, healer shamans, rams,
  bats that fly over the wall, sappers, armoured knights, phasing wraiths…) and 7 bosses with
  cinematic entrances.
- **Runs:** 5 chapters × 10 waves with their own looks and modifiers; pick-1-of-3 blessings between
  waves; next-wave preview; Endless Siege with rotating bosses; a daily challenge with a twist.
- **Meta:** gold from every run, Armory permanent upgrades, stars, hero unlocks, trophies.
- **Feel:** juicy hit effects, screen shake, coin streak chimes, kill-streak callouts
  (RAMPAGE! → GODLIKE!), per-wave recap, glowing eyes in the night chapter, adaptive music,
  satisfying menu feedback (purchase pops, count-ups, unlock reveals), settings
  (music / sfx / shake / vibration, respects "reduce motion"), first-run tutorial that drops new
  players straight into chapter 1, desktop side panels, offline PWA.
  Victory confetti, a heartbeat when the hall is in danger, flawless-wave callouts, a chosen-card
  pop when picking blessings, tap feedback on every button, and a guide arrow that always points
  at the next useful thing. Star marks on the hall bar, a "next star" hint after a win, a tappable
  wave preview that explains each enemy, tap-for-details on your blessing build, a greyed battlefield
  while the hero is down (and a "Back!" on respawn), early-call bonus pops, hall-hit flashes.
- **Quality of life:** remembered game speed, adaptive resolution on slow devices, save codes with
  one-tap backup before erasing, multi-tab safe saves, corrupt-save recovery, gamepad hints.
- **Controls:** touch drag, WASD / arrows, gamepad; keyboard shortcuts for everything (Space ability,
  C call wave, F speed, P/Esc pause, 1-2-3/R blessings, M mute, Enter for the main menu action)
  plus Tab navigation with a visible focus ring.

## Develop

```bash
npm test                  # unit, behaviour, fuzz and hub-UI (happy-dom) tests (vitest)
npm run typecheck
npm run campsim -- 40 1   # balance sim: 40 bot runs of chapter 1 (optional 3rd arg: perm level)
npm run metasim -- 60 1   # whole-campaign sim: bot plays, earns gold, buys perks, advances chapters
npm run build             # static build in dist/
npx vite preview          # serve the production build locally
node scripts/make-icons.mjs   # regenerate app icons into static/
```

Code map: `src/camp/` (simulation, renderer, art, buildings, HUD, bot, blessings, tutorial),
`src/core/` (enemies, chapters, waves, heroes, meta/save, daily, achievements, rng),
`src/render/fx.ts` (particles & effects), `src/audio/` (procedural SFX + music), `src/ui/`
(hub menus, settings, save, styles). The simulation is deterministic and has no DOM, so the bot
and tests run it headless.
