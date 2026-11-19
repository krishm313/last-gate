# Last Gate — Roadmap

The owner plays on an iPhone (home-screen web app, GitHub Pages). Every push to `main` goes live.
Goal: a game that keeps getting better — new features and content first, polish always.

## Phases

| # | Phase | Items |
|---|---|---|
| 1 | **New features** ✅ DONE | ✅ Royal courier · ✅ Tower specialisations · ✅ Spike traps · ✅ Mage Tower · ✅ Healer's tent · ✅ Blessing combos |
| 2 | **New content** ✅ DONE | New enemies (sappers that dig under, flyers that hit towers, shield-bearers that cover others) · Weather that changes play (rain, snow, storm) · Chapter 6 with a new boss |
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
  hit effects (3) info card shows the path ✅. DONE.

- **Spike trap** — new plot (unlocks after night 3, 3 levels, coins + logs) that plants a strip of
  stakes in front of the gate: walkers crossing take 10/16/24 dmg/s (×chapter scale, armour applies)
  and are slowed 25/30/35%; flyers pass over. Stakes judder and flash where a foe is caught.

- **Mage Tower** — new plot (unlocks after night 4, 3 levels, coins): every 2.4/2.0/1.7 s strikes
  the foe nearest the wall within 300–340 with lightning that hops to 2/3/4 more foes (110 px hops,
  ×0.8 per hop), ignoring armour. Stone spire with a floating crystal that flares on each cast.

- **Healer's Tent** — new plot by the hall (unlocks after night 5, 3 levels, coins): heals the King
  and soldiers within 200/230/260 for 6/10/15 HP/s and mends every standing wall section by
  0.4/0.7/1.1% of max HP per second (broken ones still need Repair). Striped tent, red-cross banner,
  dashed green radius ring on the ground, green sparkles + "+" on whoever it heals.

- **Blessing combos** — `requires` can list several blessings; 5 new combos: Shatter (Frost + Tower
  Drills: slowed foes take +35%), Thermal Shock (Fire + Frost: burning 3× on slowed foes), Treasure
  Trove (Tax + Bounty), Bulwark (Thick Timber + Masons), Deadeye (Sharp + Split). Combo cards show
  "COMBO ❄️ + 🎯"; picking one fires a "COMBO!" banner, gold/violet shockwave, flash and shake.

- **Banner-bearer** (Phase 2 enemy 1) — rallies foes within 120: +30% speed, +25% damage reduction
  (bosses excepted). Footman body + tall red war banner, dashed red rally ring. Introduced in
  chapter 2 night 7 (scout card says "rallies nearby foes"). Kill him first.

- **War Raven** (Phase 2 enemy 2) — flyer (20 hp, fast) that ignores the wall and dives at the
  nearest archer tower: on impact it's spent and the tower is stunned 3.5 s (no shooting, dizzy
  stars, "STUNNED!"). Towers can shoot it down first. Bat model, bigger, red eyes + war-paint crest,
  feather trail. Introduced in chapter 3 night 3.

- **Tunneler** (Phase 2 enemy 3) — at the wall it digs under for 3 s (untargetable, immune, a
  heaving dirt mound crawls through) and surfaces ~20 px inside the camp, then goes for the hall.
  Doesn't damage the wall — it bypasses it. Counter: the King / barracks / Healer area inside.
  Sapper body in brown. Introduced in chapter 3 night 7.

- **Night weather** — from night 3 (never on breathers), each night rolls from the seed: Rain 15%
  (towers −15% range, Fire Archers burn half), Fog 12% (towers and Mage −25% range, King −20%),
  Storm 13% (a lightning bolt strikes a random foe every 3.2 s: dmg + short stun), else clear.
  Shown as an icon next to "NIGHT n" and a toast at nightfall. Rain streaks / drifting fog banks /
  forked sky bolts that hit the struck foe. campsim ch1 still 100%.

- **Chapter 6: Frostpeak Pass** — unlocked by clearing chapter 5. Snow-covered ground (painted
  ground_1 recoloured), cold blue wash + three layers of falling snow, white snow puffs where foes
  leave the treeline. Fog 40% / storm 8% of nights (per-chapter `weatherOdds`). Waves mix the three
  new enemies into the ch5 roster; Golem mid-boss, Colossus finale. campsim: ch5 @L7 ~20–25%, ch6 @L7
  25% / @L10 33%. Gotcha found: `CAMP_CHAPTER_HP` had no entry for new ids (ch6 was 100%) — a test now
  guards it. Next slices: a new boss with a 2nd phase; snow on trees/props.

- **The Frost Wyrm** (ch6 finale boss) — icy flying boss (dragon rig, recoloured sprite): strafes
  above the wall dropping frost shards, calls War Ravens (wraiths once enraged). Phase 2 (<50% HP):
  every 5.5 s a frost nova (big white/blue ring, shake) freezes every archer tower within 340 for
  3.2 s — towers are encased in ice with a "FROZEN!" pop. Cold halo + rising ice motes around it.
  Hub shows ❄️ boss. campsim ch6 @L10 75%; ch1 still 100%.

## Shipped (newest first)
- Frostpeak scenery: snow-laden pines, frosted round trees, snowy rocks/bushes (winter prop atlas), bare winter trees, no butterflies in the snow.
- The Frost Wyrm: new ch6 boss with a 2nd phase — frost nova freezes towers in ice (sprite, shards, nova fx, test).
- Chapter 6 "Frostpeak Pass": snowy ground, falling snow, foggy/stormy nights, new achievement (tests).
- Night weather: Rain / Fog / Storm change tower range, burn and add lightning strikes (visuals, HUD icon, toast, tests).
- Tunneler enemy: digs under the wall and surfaces inside (dirt mound, dirt bursts), chapter 3 intro, test.
- War Raven enemy: dives at towers and stuns them (stun stars, STUNNED!), chapter 3 intro, test.
- Banner-bearer enemy: rally aura (faster + tougher foes nearby), banner art + rally ring, chapter 2 intro, test.
- Blessing combos: 5 new two-part combos, combo badge shows its parts, big COMBO! moment (tests).
- Healer's Tent: heals the King/soldiers nearby and slowly mends the wall (plot, tent art, aura ring, heal motes, test).
- Mage Tower: chain lightning that ignores armour (plot, spire + crystal art, purple bolts, tests).
- Lightning arcs now draw above the night darkness (they were nearly invisible at night).
- Spike trap: stakes before the gate wound + slow walkers (plot, info card, visuals, tests; campsim ch1 100%).
- Tower specialisations slice 3: info card shows the path (and hints "At Lv 3: choose…" on Lv 2 towers).
- Tower specialisations slice 2: path-coloured banners, glowing fire/frost arrows, fire sparks / frost shatter on hit.
- Tower specialisations slice 1: Fire / Frost / Volley choice at Lv 3 (sim, tests, choice screen).
- Royal courier: hall income flies to the King wherever he is (no walk back to collect).

## Self-reviews
- **2026-11-19 10:15** — 11 deploys since 09:06, all green. Shipped: courier, tower specs (3 slices),
  spikes, Mage Tower, Healer's Tent, blessing combos, Banner-bearer, War Raven. Balance (campsim,
  12 runs each, before enemies vs now): ch2 @perm L1 58% → 67%, ch3 @perm L3 50% → 42% — inside
  run-to-run noise; no rebalance needed. Lessons: (1) anything drawn in the world must be checked at
  night (lightning was invisible until moved above the darkness); (2) cards clip their edges — badges
  go inside; (3) the auto-player buys the cheapest plot, so pricey new buildings (Mage) rarely get
  measured — fine while they're optional extras.
