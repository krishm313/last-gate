# Last Gate — Roadmap

The owner plays on an iPhone (home-screen web app, GitHub Pages). Every push to `main` goes live.
Goal: a game that keeps getting better — new features and content first, polish always.

## Phases

| # | Phase | Items |
|---|---|---|
| 1 | **New features** ✅ DONE | ✅ Royal courier · ✅ Tower specialisations · ✅ Spike traps · ✅ Mage Tower · ✅ Healer's tent · ✅ Blessing combos |
| 2 | **New content** ✅ DONE | New enemies (sappers that dig under, flyers that hit towers, shield-bearers that cover others) · Weather that changes play (rain, snow, storm) · Chapter 6 with a new boss |
| 3 | **Reasons to come back** ✅ DONE | Daily / weekly quests · Endless records board + milestone rewards · Hero skill trees · Unlockable hero looks · Run history / stats page |
| 4 | **Optional challenge** ✅ DONE | Hard / Nightmare modes with better rewards · Elite enemies with modifiers · Bosses with a second phase |
| 6 | **Polish & new ideas** (ongoing) | ✅ bug sweeps · ✅ coachmarks · ✅ perf · ✅ accessibility · ✅ Watchtower · ✅ The Warden · ✅ chapter 7 + Magma Titan + Fire Imp · ✅ Endless twists · ✅ daily twists · ✅ damage breakdown · ✅ A/B balance bot |
| 5 | **Sound & feel** ✅ DONE | Adaptive music that builds through a night, boss theme · Richer SFX + haptics |

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

- **Quests** (Phase 3, slice 1) — 3 daily quests (rotate at local midnight) + 1 weekly (Mondays),
  picked from the date so every device agrees. Each tracks a lifetime stat from the moment it's
  handed out (kills, nights, bosses, towers, logs, bows, flawless nights, gold earned, wins);
  rewards 50–100 / 400–500 gold, +25% per chapter cleared. Shown at the top of Trophies (blue edge
  daily, gold edge weekly, reset timer), claim with the usual coin burst; counted in the tab badge.
  Next slices: quest progress on the end-of-run screen; "quest done!" toast in a run.

- **Endless milestones** (Phase 3) — every 5 nights held in Endless pays a one-time bonus of
  30 gold × the night (night 5: 150, 10: 300, …), paid at the end of the run (end screen row
  "Milestone: night 5"); toast in-run when one is reached; the Endless card shows the next target.

- **Hero skill trees** (Phase 3) — every night survived gives that hero 1 XP; points at 5, 15,
  30, 50, 75, 105, 140, 180, 225 nights (9 total = the whole tree). Three branches learned in
  order: Might (dmg +8% → crit +4% → ability −15% cooldown), Guard (HP +15% → wall +8% → soldiers
  +20%), Fortune (carry +10/magnet → move +8% → +10 start coins & income +10%). Free reset. Panel
  under the selected hero on the Heroes tab (green learned, glowing learnable, grey locked), ★ chip
  on heroes with points, ★ badge on the tab, end screen announces new points. Old saves: nights
  already survived credit the current hero. campsim ch1 100% (bot has no skills).

- **Hero flair** (Phase 3 "unlockable looks") — the heroes are painted sprites (recolouring would
  look cheap), so looks are cosmetic flair worn by any hero: Golden Halo (6★: halo ring + orbiting
  sparkles), Ember Trail (clear ch4), Petal Trail (8 trophies), Shadow Wisps (Endless night 20),
  Frost Trail (clear ch6). Picker panel at the bottom of the Heroes tab (locked chips say how).

- **Difficulty modes** (Phase 4, slice 1) — Normal / 💀 Hard / ☠️ Nightmare selector on the Battle
  tab (after the first clear). Hard opens per chapter once it's cleared on Normal (foes +40% HP,
  +10% speed, +15% gate dmg, gold ×1.5); Nightmare once cleared on Hard (+90% HP, +20% speed, +30%
  gate, gold ×2.2). Stars and unlocks stay Normal-only; clears show as 💀 / ☠️ on the card; first
  clear doubles the win bonus and the end screen celebrates it. Endless & daily always Normal.
  Bot: ch2 @L4 normal 100% / hard 60% / nightmare 40%; ch1 hard 100%.

- **Elite enemies** (Phase 4, slice 2) — on Hard (8% of spawns) / Nightmare (15%) and Endless past
  night 10 (5% +1%/night, max 20%), fresh wave spawns may be elite: +60% HP, 3× coins, one modifier —
  Swift 💨 (+40% speed), Armored 🛡️ (+35% reduction), Vampiric 🩸 (heals 6% max HP per hit),
  Splitting 🧬 (bursts into two 30%-HP copies), Shielded 🔷 (barrier = 30% HP soaks damage first).
  Dashed coloured ground ring, badge over the head (above the night darkness), shield bubble,
  "Swift!" pop on spawn, shard burst when a shield breaks. Normal campaign untouched (RNG unchanged).

- **Boss second phases** (Phase 4, slice 3) — below half HP, on top of enraging: Ogre — SLAM every
  5 s (hurts hero/soldiers within 130, dust shockwave); Warlord — WAR CRY every 10 s (foes within
  260 rallied 6 s: faster + tougher, red rings); Siege Golem — lobs a boulder at the nearest tower
  every 6 s (0.9 s arc with shadow, lands → stun 1.8 s); Swamp Hag — CURSE once as she turns
  (foes within 320 healed 15%). Frost Wyrm already has its nova. campsim ch1 100%.

- **Adaptive music** (Phase 5, slice 1) — `musicIntensity()` (pure, tested) drives the procedural
  score: day = calm pads (Am–F–C–G) + sparse plucks, no drums; nightfall = march drums; intensity
  rises with campaign progress, through each night, and sharply when the hall drops under 50% (tom
  fills, faster tempo 96→130 bpm); boss alive = darker progression + low filtered brass. Level eases
  toward the target (~2 s) so layers swell instead of switching.

- **Performance pass** (Phase 6) — measured in Chromium, 4× CPU throttle, 81 enemies at night in
  a storm: canvas calls per frame were ~450 save/restore, 182 radial gradients (one per unit shadow),
  560 drawImage. `softShadow` now blits one cached shadow disc → gradients 182 → 21, save/restore 449
  → 285, arcs 201 → 37 per frame. Frame cost is dominated by pixel fill (headless software raster:
  66 ms/frame at 3× density with 0 foes vs 20 ms at 1×; 80 foes add only ~3 ms), which the iPhone's
  GPU handles and `perfSample` already steps down (3 → 2 → 1.5 → 1×) if a device can't hold 24 fps.

- **Watchtower** (Phase 6 new building) — plot right of the road by the hall (unlocks after night 5,
  2 levels, 70/120 coins + 6/12 logs): archer towers within 340/420 get +20%/+35% range and
  +10%/+20% fire rate, and fog/rain don't shorten their range. Stilted timber lookout with a lantern
  (brighter at night) and a pennant; standing on it shows its reach and highlights boosted towers.
  Placement matters: from its corner it covers the right-hand towers first.

- **Balance coverage for new buildings** — the campsim bot now has an "explorer" style on odd seeds
  that favours Mage / Healer / Watchtower from night 5 (cheapest-first never reached them).
  `scripts/campsplit.ts` compares the two: before, explorer lost ground (ch3 @L3 1/8 vs 3/8, ch2 @L2
  6/8 vs 7/8) → the new buildings were overpriced. Now Mage 50/85/140, Healer 40/75/120, Watchtower
  60/110 with +25/40% range, +15/25% rate → explorer 5/8 vs 3/8 (ch3), 7/8 vs 7/8 (ch2).

- **Endless weekly twists** — one of 6 rules applies to every Endless siege for a week (Mon–Sun,
  rotating so all 6 come round in 6 weeks): Iron Horde (+30% HP, +30% coins), Gold Rush (coins ×1.6,
  +20% HP), Storm Season (storms most nights), Glass Walls (walls −30%, towers +25%), Elite Week
  (elites 12% from night 1, coins +20%), Hero's Week (hero +40%, towers −20%). Shown on the Endless
  card and as a toast when a siege starts.

- **Chapter 7: Ashen Caldera** (slice 1) — unlocked after chapter 6. Basalt ground recoloured from
  ground_1 with glowing orange cracks (ground_7.webp); mood 7 = red heat haze + rising embers +
  falling ash; smoky nights (fog 38%, storm 8% — storms help the player, so volcano storms were cut);
  every enemy type in the mix; Bone Dragon mid-boss, Colossus finale for now. CAMP_CHAPTER_HP 7: 2.5
  → campsim ch7 @L7 33%, @L10 75% (ch6 @L10 58–75%). Next: Magma Titan boss, charred "ash" props.

- **The Magma Titan** (ch7 finale) — armoured walker boss (3000 HP, 25% armour) that calls brutes
  (sappers once enraged). Phase 2: every 6 s an ERUPTION drops 3 lava pools (one under the hero if
  close, two just inside the wall ahead) for 5 s: 16 dps to the hero and soldiers — and 24 dps to
  walkers crossing them, so luring the horde through is a play. Molten halo + embers on the boss,
  bubbling pools with scorched rims that cool and crust, ERUPTION! pop, rumble SFX, 🌋 on the hub.
  campsim ch7: @L7 17%, @L10 75% (hardest chapter, as the finale should be).

- **The Warden** (5th hero, unlocks at 14★) — hooded archer (painted archer sprite + portrait cut
  from it). Passive: every shot hits 1 extra target. Ability "Snare Field" (20 s): vines root every
  walker within 240 for 3 s (bosses 1 s) and snared foes take +30% damage — sets up towers, catapults
  and lava. Green rings + "SNARED!" + vines coiling at the feet of rooted foes. Has its own skill tree
  progress like every hero.

- **Fire Imp** (ch7 enemy, intro night 3) — quick flyer (18 HP) that dives at the nearest support
  building (catapult, Mage, Healer, spikes, Watchtower, forge) and sets it ablaze for 5 s: it stops
  working. The King standing on it stamps the fire out at once ("Fire out!"). Orange recoloured bat
  rig with a flame glow and sparks; flames, smoke and a "🔥 Stamp it out!" hint on the burning
  building; crackle / hiss SFX.

- **Difficulty payout check** (`scripts/campgold.ts`, bot gold per minute incl. applyRun bonuses):
  ch2 @L6 normal 49 / hard 65 / nightmare 85 gold/min at 100/75/50% wins; ch4 @L8 normal 68 / hard
  70 / nightmare 63 at 88/25/0%. Harder pays more only while you can win; Nightmare ch2 out-earns
  Normal ch4 but at a coin-flip — a fair risk premium, not a farm. No change.

- **Perf check, chapter moods** (60 foes at night, dpr 1, headless): ch1 6.1 ms/draw, ch6 (snow) 5.3,
  ch7 (embers + haze) 4.9 — the new overlays cost nothing measurable. Golden Halo's shadowBlur (the
  last one in the renderer) swapped for a cached glow blob.

## Shipped (newest first)
- "This week" strip above Recent runs on Trophies: runs, wins, nights held and best Endless night since Monday (test).
- Pause menu status strip adds difficulty (💀 Hard / ☠️ Nightmare), tonight's weather and this week's Endless twist.
- End screen "Earned this run": chips for each trophy unlocked and quest completed during the run.
- Hawkeye (legendary combo: Eagle Towers + a built Watchtower): towers in the Watchtower's reach deal +10% and crit 15% of the time — the first way towers can crit (test).
- Trophies "Warden of the Woods" (snare 200 foes) and "Firefighter" (stamp out 25 fires); Fire Imps join Endless waves.
- "How to play" updated for everything new (tower paths, new buildings, weather, fires, combos, skills & quests, courier) and compacted so the whole guide + button fit one screen even on a 320×568 iPhone SE.
- Heroes tab: every unlocked hero's card shows skills learned and an XP bar to their next skill point.
- Balance bot stamps out Fire Imp fires (like a player would): ch7 @L10 42% → 67%, @L7 25% — on target, no retune needed.
- Fire Imp: ch7 flyer that sets support buildings ablaze until the King stamps the fire out (art, fx, SFX, test).
- New hero: The Warden — extra-target shots and Snare Field (roots foes, +30% damage taken); 14★ to unlock (test).
- Daily variety: 4 new twists using the newer systems (Elite Rush, Fog of War, Storm Day, Iron Walls) + Bounty Hunter / Vigor as starting blessings — from 2026-11-20 so days already played keep their daily (test).
- End screen "Damage dealt": top 3 sources with share bars (towers, hero, catapults, soldiers, Mage, burning, spikes, lightning, lava) — sim credits every damage source in runStats.dmg (test).
- 5 new trophies (Hardened, Stuff of Nightmares, Elite Hunter ×25, Wyrmslayer, Titanfall); Endless now rotates in the Frost Wyrm (night 40) and Magma Titan (night 45) and mixes in Ravens, Tunnelers and Banner-bearers (bot @L5 still reaches nights 18–27).
- Ashen Caldera scenery: charred pines and trees with glowing ember seams, smouldering bushes, ash-grey rocks (ash prop atlas).
- The Magma Titan: ch7 boss whose phase-2 eruptions leave lava pools that burn the hero AND the horde (fx, SFX, test).
- Chapter 7 "Ashen Caldera": volcanic ground, heat haze, embers and ash, smoky nights, achievement (balance-tuned).
- Endless weekly twists: 6 rotating rules (Iron Horde, Gold Rush, Storm Season, Glass Walls, Elite Week, Hero's Week) on the Endless card (tests).
- Cheaper Mage Tower / Healer's Tent / Watchtower (stronger Watchtower) after A/B balance runs showed they were overpriced.
- Watchtower: new building that extends and speeds up nearby archer towers and cuts through fog (art, reach ring, info card, test).
- Accessibility: "Reduced motion" (no shake, flashes or slow-mo; on by default if the OS asks) and "Large text" (+15% fonts via a text-only CSS unit, layout unchanged); Vibration row hidden where unsupported (iPhone Safari can't vibrate).
- Performance: unit shadows use one cached sprite instead of a new gradient each (−160 gradients/frame in big fights).
- 4 new blessings: Arcane Focus (Mage +30% dmg, +1 hop), Field Medic (Healer reach +30%, heals +40%), Cruel Stakes (spikes +60%), Bounty Hunter (bosses & elites drop double coins) — building ones only offered once built (tests).
- Onboarding coachmarks: one-time bubbles under the tab that holds a new system (quests, skill points, hero flair); gone once the tab is opened. Bug sweep (autoplay ch1, ch3, ch6 Hard): no errors.
- SFX for the new content: frost nova shimmer, frozen-tower crack, boss slam boom, war horn, curse, boulder whoosh, elite sting, shield shatter, mage zap, storm thunder, spike ticks, digging, spec chord; haptic buzz on slams/novas/stuns (all rate-limited).
- Adaptive music: calm by day, drums at nightfall, builds through the night and in danger, boss brass layer (test).
- Boss second phases: Ogre slam, Warlord war cry, Golem boulder toss, Hag curse (fx at night, tests).
- Elite enemies: 5 modifiers on Hard/Nightmare and deep Endless (rings, badges, shield bubble; tests).
- Difficulty modes: Hard & Nightmare per chapter (more HP/speed/gate damage, ×1.5 / ×2.2 gold), skull badges (tests).
- Hero flair: 5 unlockable cosmetic trails/halos (ember, frost, petals, shadow wisps, golden halo), picker on Heroes tab (test).
- Run history: last 20 runs (chapter/daily/endless, hero, nights, kills, gold) with win rate, under Records on Trophies (test).
- Hero skill trees: XP from nights survived, 3 branches × 3 skills per hero, Heroes tab panel, end-screen notice (tests).
- Endless milestones: one-time gold for every 5 nights held, next-target line on the Endless card (test).
- Quests slice 2: "📜 Quest complete" toast mid-run; end screen says how many quests are ready to claim.
- Daily & weekly quests on the Trophies tab (rotate by date, claim for gold; save migration + tests).
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
- **2026-11-19 10:37** — deploys 86–90 green (chapter 6, Frost Wyrm, scenery). Phase 2 complete.
  Found and fixed a hidden trap: per-chapter camp HP table silently defaulted new chapters to ×1
  (ch6 was trivially easy) — now test-guarded. Lesson: when a chapter "feels" off in campsim, diff
  it against a clone of a known chapter with only the id changed.
- **2026-11-19 11:40** — deploys 88–102 all green. Phases 3, 4 and 5 shipped this hour (quests,
  Endless milestones, skill trees, history, flair; Hard/Nightmare, elites, boss phases; adaptive
  music, SFX + haptics). Balance: ch1 100% throughout; ch3 @L3 38% (16 runs) after golem boulders —
  inside noise vs 42–50%, left as is. Lessons: (1) render effects drawn with "lighter" vanish on
  bright day grass — use normal-blend tints/shapes for things that must read by day (flair pass 1);
  (2) the game re-saves on pagehide, so Playwright save edits must go in an init script; (3) audio
  can't be eyeballed — keep its decision logic in pure tested functions (musicIntensity).
- **2026-11-19 12:38** — deploys 100–111 all green. This hour (Phase 6): autoplay bug sweep (clean),
  coachmarks, 4 blessings, cached unit shadows (−160 gradients/frame), Reduced motion + Large text,
  Watchtower, explorer-bot A/B → cheaper Mage/Healer/Watchtower, Endless weekly twists, chapter 7.
  Lessons: (1) a cheapest-first bot never measures pricey buildings — A/B bot styles (campsplit.ts)
  found they were overpriced; (2) weather that damages foes (storms) makes a chapter EASIER — use fog
  for "harsh" chapters; (3) iPhone Safari can't vibrate — I'd claimed haptics on iPhone, corrected.
- **2026-11-19 13:37** — deploys 109–123 green (120 cancelled: superseded by 121 a minute later —
  Pages' concurrency, harmless). This hour: chapter 7 slices 2–3 (Magma Titan, ash props), 7 trophies,
  Endless roster, damage breakdown, daily twists, SE layout check (clean), The Warden, Fire Imp, bot
  stamps fires, hero XP bars, how-to-play rewrite, 2nd bug sweep (clean). Lessons: (1) a new enemy
  mechanic the bot can't answer (fires) skews balance — teach the bot the counter before tuning;
  (2) adding content to a date-seeded rotation reshuffles today's — gate it from tomorrow;
  (3) when a guide grows, re-check it fits the smallest phone.
