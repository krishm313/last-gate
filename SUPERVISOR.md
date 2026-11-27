# Last Gate — Supervisor plan (Phase 10 onward)

Started 2026-11-27. The owner asked for this to run from start to end without needing to step in.
This file is the source of truth for that work: every wake reads it, takes the next open item, and
records what happened. Chat memory is never the plan.

## Direction (decided — not re-litigated each cycle)
The game is feature-rich and polished. Its real gaps are (1) nobody but the owner has played it,
(2) "it feels like I finished it / repetitive" — a run-structure problem, not a juice problem,
(3) the codebase is heavy (render.ts is over 7,000 lines), which slows every change.
So: get it ready for real players first, then deepen replayability, keep game feel and code health
as steady lanes, and grow content on a rhythm.

## Stages
**Stage A — Ready for players (short term)**
- A0 Dated checks missed while idle: Nov 23 (Endless "Tidal Week" twist + weekly quest pool),
  Nov 24 (daily `CLERIC_FROM`). Verify they behave on today's date.
- A1 First five minutes: play a fresh save like a new player (real taps, phone viewport, bot
  personas: careless / rusher / turtle). Fix every confusing, flat or slow moment until chapter 1's
  first two nights feel great.
- A2 Stability: low-end phone perf (CPU-throttled fights, quality tiers), save robustness (fuzzed and
  old saves load; every save field survives sanitizeSave), finish Phase 7 leftovers S3/S4 if open.
- A3 Shareable: proper app name/icon/splash, installable, share-link preview (title, image).
- A4 Player stats — PARKED: sending any data off the device needs the owner's explicit OK
  (privacy). Do not build external telemetry. Local-only insight is fine.

**Stage B — Replay depth (medium term)**
- B0 Audit first: list every run-to-run variety system that exists (blessings, rule cards, night
  events, visitors, weather, layouts, heat, elites, weapons, pets…) and how often each actually
  changes decisions. Design from the gaps, not from scratch.
- B1 Runs that play differently: choices that define a run's strategy (build archetypes that
  change how you play, not just bigger numbers).
- B2 Reasons to come back after chapter 10: long goals, Endless/weekly rewards that matter.
- B3 Refactor while touching: split render.ts by area as code is changed (no big-bang rewrite).

**Stage C — Grow (long term, on a rhythm)**
- C1 New content on a cadence (a chapter / enemy / hero per batch), each with a designed hook.
- C2 Revisit priorities with whatever signal exists (owner reactions, bot fun metrics).

## Lanes inside every batch (rough share)
40% current stage item · 30% game feel & animation · 20% bugs / perf / code health · 10% wild idea.

## Each cycle
1. Read this file + ROADMAP "Shipped". Pick the next open item (stage order; lane mix per batch).
2. Check: typecheck, all tests, phone-viewport screenshots with real taps.
3. Build one small, complete slice. Verify by LOOKING (frame strips at phone scale).
4. Gates — revert instead of shipping if any fails:
   - tests + typecheck green;
   - balance: campsim A/B within noise on affected chapters (sim changes only); siegesim
     100/100/100/66/28/47; chapter 1 stays easily winnable;
   - perf: late-game chapter 10 draw median ≤ ~6 ms at 1×, no new stutter;
   - clarity: effects never hide threats or text; nothing to read mid-fight beyond a few words.
5. Commit + push (goes live), add a ROADMAP "Shipped" line, tick the item here, log below.
6. Re-arm the wake-up. At the end of each batch (about every 12–24 h) write the owner a summary.

## Hard rules
Side mini-games stay off · never remove a feature the owner liked without asking · no external data
collection · balance-neutral unless the item is about balance · nothing unrelated to this game lives
in this repo.

## Log (newest first)
- 2026-11-27 A0 ✅ dated rotations verified for Nov 22 → Mar 2027 (Endless twists incl. Tidal from Jan 4, daily hero pool with Cleric/Marshal, weekly quests; side-game quests stay filtered). Test added.
- 2026-11-27 Supervisor plan written; Stage A started.
