# Last Gate — Roadmap

The owner plays on an iPhone (home-screen web app, GitHub Pages). Every push to `main` goes live.
Goal: a game that keeps getting better — new features and content first, polish always.

## Phases

| # | Phase | Items |
|---|---|---|
| 1 | **New features** (more to do every run) | ✅ Royal courier (hall coins fly to the King) · Tower specialisations at Lv 3 (Fire / Frost / Volley) · Spike traps before the gate · Mage Tower · Healer's tent · Blessing combos ("COMBO!") |
| 2 | **New content** | New enemies (sappers that dig under, flyers that hit towers, shield-bearers that cover others) · Weather that changes play (rain, snow, storm) · Chapter 6 with a new boss |
| 3 | **Reasons to come back** | Daily / weekly quests · Endless records board + milestone rewards · Hero skill trees · Unlockable hero looks · Run history / stats page |
| 4 | **Optional challenge** | Hard / Nightmare modes with better rewards · Elite enemies with modifiers · Bosses with a second phase |
| 5 | **Sound & feel** | Adaptive music that builds through a night, boss theme · Richer SFX + haptics |

Polish between features: anything chunky, unreadable at night, overlapping, or not visible when it fires.

## Per-feature pipeline

1. **Design** — 3–5 lines here: what it is, why it's fun, how it reads on a phone.
2. **Balance** — `npm run campsim` (bot runs) before/after; keep chapter 1 winnable, no big swings.
3. **Build** — data-driven where possible; reuse fx/overlay/lateBars helpers (labels at night go
   through `overlay()`); namespace new CSS classes.
4. **Verify** — `npx tsc --noEmit -p .` + `npx vitest run` + a test for new sim rules; screenshots
   in day, night (Hollow Night), and the busy case (full 40-coin stack, boss wave) via `tools/shots/`.
5. **Ship** — commit + push to `main` (deploys); confirm the Pages run is green.
6. **Log** — one line in "Shipped" below.

Big features land in safe slices (sim + test first, then visuals), each slice shippable.

## Design notes
- **Tower specialisations** — at Lv 3 each archer tower picks a path (game waits on a 3-card choice,
  like blessings): Fire (burn 45% of hit dmg over 3 s), Frost (40% slow 1.6 s, 0.9× dmg),
  Volley (+2 arrows at nearby foes, 0.55× dmg). Permanent per tower. Bot rotates paths for campsim.
  Slices: (1) sim + tests + choice screen ✅ (2) in-world look ✅: tinted arrows, tower banner colour,
  hit effects (3) info card shows the path.

## Shipped (newest first)
- Tower specialisations slice 2: path-coloured banners, glowing fire/frost arrows, fire sparks / frost shatter on hit.
- Tower specialisations slice 1: Fire / Frost / Volley choice at Lv 3 (sim, tests, choice screen).
- Royal courier: hall income flies to the King wherever he is (no walk back to collect).
