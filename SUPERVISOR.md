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

**B0 audit (2026-11-27)** — variety that exists: 44 blessings (8 rule-changers + combos), tower paths,
night events, visitors (merchant/shrine), weather, mirrored layouts, Heat, elites, weekly/daily twists,
hero weapons, pets, building masteries. Finding: almost all of it changes *numbers* or *the moment*,
not *strategy*. Every run unlocks the same buildings on the same nights at the same prices, so the best
build order is the same every run — the root of "I finished it / repetitive". Gap to fill: a choice
before the run that changes what you build and how you play.
**B1 design — War Banners**: in the chapter sheet (next to Heat, once chapter 1 is cleared; never a
mid-game prompt), pick one banner for the run — each a real strategic fork with an upside and a
cost: Iron Bastion (walls), Hunter's Pact (hero economy), Siege Engineers (catapults/mage early,
towers capped), Golden Hoard (rich start, tougher foes), Levy (soldiers), Pyre Lords (burning arrows).
Unlock gradually by stars. Each validated with campsim (bot win rate near the no-banner baseline).

**Stage C — Grow (long term, on a rhythm)**
- C1 New content on a cadence (a chapter / enemy / hero per batch), each with a designed hook.
- C2 Revisit priorities with whatever signal exists (owner reactions, bot fun metrics).

**C1 batch 2 — Chapter 11 "The Storm Coast" (design, 2026-11-27)** — built behind `CH11_ENABLED`
(src/core/features.ts) and switched on only when every slice is done.
- Hook: a wind-lashed sea cliff where storms roll in most nights — lightning can smoke out a tower,
  so you spread your defence; the boss calls the storm down on purpose.
- Affixes: "Squall: storms most nights" (storm weather odds high) · "Gale: flyers +20% speed".
- Waves: the late-game cast in new combinations (Siege Towers, Bombers, Shield Walls, Climbers,
  Stalkers, Wraiths, Imps); a mid-chapter mini-boss (Bone Dragon, reduced HP) and the finale.
- Boss — **The Thunder Giant**: the walking boss body tinted storm-blue with a crackling aura;
  signature (enraged) "thunder": three telegraphed lightning strikes on towers / wall ahead of it
  (stun + wall damage), plus the arena theme (rain-grey tint, blue sparks).
- Terrain: new "coast" palette (grey-green windswept pines, pale sand, sea spray) via the
  propgen tint pipeline; mood 11 everywhere a chapter mood is mapped.
- Kingdom: an 11th landmark, a 3D **Storm Lighthouse** on the cliff edge.
- Plumbing: heatAllowed / endless scenery / weekly pools take chapter 11; chapter 11 unlocks after
  10; achievements stay "chapters 1–10" (no retroactive goalpost moves).
Slices: (1) flag + chapter data + plumbing [hidden] → (2) terrain palette + mood → (3) boss +
signature + arena → (4) lighthouse landmark + Bestiary/portraits → (5) balance + full playtest →
switch on, ROADMAP line.

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
- 2026-11-27 Ch11 slice 3 (hidden): The Thunder Giant boss (walking boss body, storm-blue crackling aura, summons ravens → climbers when enraged; signature "thunder": 3 jagged lightning strikes on the nearest towers (stun) / the wall in front (scorch), screen flash, arena theme), telegraph colours for all phase-2 kinds, Bestiary gated by enemyEnabled() until CH11 ships.
- 2026-11-27 Ch11 slice 2 (hidden): coast palette — painted ground_11.webp (grey-green grass, pale sand) from gen_terrain.py palette 11, coast.webp props (summer atlas HSV-shifted to windswept sea-green), mood 11 wired (prop tint, painted ground, leaf colour). Checked in-game with the flag on locally.
- 2026-11-27 Ch11 slice 1 (hidden, flag off): CH11_ENABLED switch, Storm Coast chapter data (10 waves, storm-heavy weather, Bone Dragon mini-boss, placeholder finale boss), isCampaignChapter() replaces hard-coded ≤10 in Heat / Endless scenery / weekly pools, CAMP_CHAPTER_HP[11]=3.0 (first bot pass at 2.7: L8 13%, L10 35% — too easy). Flag-on run of the suite caught a 10-chapter assumption in a test.
- 2026-11-27 C1 batch 1 ✅ Siege Tower (4 tuning rounds; night-6 debut spiked losses, moved to night 9). Next batch idea: a chapter 11 is the big one (terrain atlas + boss) — plan it as a multi-slice batch; meanwhile keep lanes (feel, health).
- 2026-11-27 B1 ✅ B2 ✅ (B3 continues as the code-health lane). Stage C started: C1 batch 1 = Siege Tower (rolling tower that unloads Wall Climbers at the wall; 3D prop), ch 9–10 + Endless.
- 2026-11-27 B3 slice 2: foeFx.ts. Lesson: when cutting by doc-comment boundaries, check for undocumented methods swallowed at the end (drawParts was; restored from HEAD).
- 2026-11-27 Game-feel slice: animated kingdom view (clouds, birds, chimney smoke, flag sway; on-screen only).
- 2026-11-27 B2 slice 2: Conquest milestone in Next goals (first goal for graduates).
- 2026-11-27 B2 slice 1: Conquest board (18 milestones, gold, Trophies panel, kingdom flags). Next: B2 slice 2 (look at what a chapter-10 graduate does next session — Endless / weekly payoff), interleave a game-feel slice.
- 2026-11-27 B3 slice 1: bossFx.ts extracted (BossFxEnv adapter). Pattern for future slices: move a self-contained effect family + its state into a class, pass a small env object.
- 2026-11-27 Game-feel slice: new-foe deaths (Shield Wall/Climber corpses; Balloon Bomber pop + falling basket).
- 2026-11-27 B1 slice 3: banner blessings (one exclusive epic per banner, ×3 weight). Next: game-feel lane slice, then B1 close-out review (does a banner run *feel* different? playtest each once).
- 2026-11-27 B1 slice 2: War Banner emblem on the plaza banners (in-run identity).
- 2026-11-27 B1 slice 1 ✅ War Banners shipped (6 banners, chapter sheet, tuned in 3 rounds: Bastion was 31/27/54% → 13/8/16; Pyre/Hunter/Levy buffed). Next B1 slice: give banners visible identity in-run (HUD chip + themed camp flag) and see whether a second fork (mid-run) is needed — prefer extending existing systems over new prompts.
- 2026-11-27 B0 ✅ audit written above; B1 War Banners designed.
- 2026-11-27 A3 ✅ 3D-castle icon (192/512/apple), share-link preview image + og/twitter meta. Stage A complete (A4 parked by rule). Next: B0 variety audit.
- 2026-11-27 A2 ✅ perf profile at 4× CPU: JS ≈ small, raster dominates, no hotspot → S3 closed, S4 done. Save guards added (field-coverage check vs sanitizeSave, round-trip of weapon/pet/crowns, 400-round junk fuzz). A1 ✅ after two slices.
- 2026-11-27 A1 slice 2: "rusher" persona (taps Start the night without building) saw "Drag to walk" all night and the go-fight nudge was hidden behind it — 0 kills in a minute. Fixed: pre-night tips skip once night falls; the go-fight nudge outranks tutorial tips; a towerless player back at dawn with coins gets the build tip again.
- 2026-11-27 A1 slice 1: fresh-player playtest (real drags, tutorial-following bot) found two problems — the tower info card covered the screen all night (and mentioned the Forge before it exists), and nothing told an idle new player to go fight, so night 1 dragged past a minute. Fixed: card shrinks to its title at night, Forge line only once a Forge is built; new "foes at the wall — walk over" nudge + guide arrow (retires after being answered twice). Night 1 now clears in ~43 s when followed.
- 2026-11-27 A0 ✅ dated rotations verified for Nov 22 → Mar 2027 (Endless twists incl. Tidal from Jan 4, daily hero pool with Cleric/Marshal, weekly quests; side-game quests stay filtered). Test added.
- 2026-11-27 Supervisor plan written; Stage A started.
