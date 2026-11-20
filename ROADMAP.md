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
- **Reverse mode: "Siege Lord"** — ✅ PLAYABLE (slices 1–3; polish next) (owner: "the reverse mode sounds soo tuff and fire" — TOP PRIORITY,
  ahead of the Archery Range screen) — you command the horde against a human castle. Built on the
  existing camp sim, flipped: the defence (King, towers, walls, hall) is played by the campaign bot
  (`campBotStep`, which already builds, upgrades, repairs and fights); the player controls the
  attack. Bottom bar: a deck of unit cards (Footman 2, Runner 2, Shieldbearer 3, Brute 4, Crossbow 3,
  Sapper 4, Bat swarm 3, Ram 6, then War Raven / Fire Imp / Tunneler unlocked by progress) paid from
  a War Chest that refills over time (+ a bounty for every tower or wall section destroyed). Tap a
  card, then tap the top of the field (the forest edge, one of 3 lanes) to send them. Win: destroy
  the hall before the defenders hold 8 nights (each "night" = a 45 s push; between pushes the bot
  gets a short build phase with income). Lose: the timer runs out. Stars for hall destroyed by night
  4/6/8. Siege maps reuse chapter grounds; the defenders get stronger per siege (bot perms level).
  Slices: (1) sim hooks — a `reverse` camp flag: no auto wave queue, `deploy(c, unit, lane)` from the
  player's chest, chest income, defender bot drives the hero/plots; tests (deploy costs, chest
  refills, hall death = win); (2) HUD: card bar + chest meter + lane tap targets, end screen;
  (3) map entry (a ⚔️ "Siege Lord" card above Endless) + 3 sieges with rising defences + stars/rewards
  in save.mini; (4) polish: horde banner fx, war drums, unit card art from bestiary portraits.

- **Campaign map + side stops** (owner request 2026-11-19) — (1) ✅ the chapter list becomes a map: a
  winding road from chapter 1 (bottom) to the final chapter (top); land bands in each chapter's
  colours; cleared stops fly a flag with stars/skulls, the next one glows with NEXT/NEW!, everything
  beyond is under fog as "???" (no names, bosses or details) and the last stop is a fogged citadel;
  tap a stop for its full card + Play. Daily + Endless stay as cards above. (2) next: side-stop
  mini-games between chapters for gold and stars — "Archery Range" (drag to aim, flick arrows at
  moving targets and diving ravens, 60 s score attack, 3 star thresholds), then "Supply Run" (steer
  a wagon down a road, dodge hazards, grab coins, ~90 s).

- **7th hero: The Cleric** — ✅ SHIPPED (slices 1–2; daily pool later). a support hero (every painted figure is taken, so the art is the mage
  sprite recoloured white-and-gold with PIL, like the moor props; portrait cut from it). Unlocks at
  22★ (of 27). Passive "Blessed hall": the hall's archers hit 30% harder (hallDamage mod). Ability
  **Sanctuary** (cd 22 s): heals the hall 10% of max HP, every standing wall section 20%, the
  hero to full and all soldiers; a gold ring + "SANCTUARY!" and rising motes. Keeps its charge
  when nothing is hurt ("All is well"). Achievement "Light of the Gate" (heal 5,000 HP with
  Sanctuary). Slices: (1) sim + data + test, (2) art + portrait + fx, (3) campsim vs King,
  daily hero pool from a future date.

- **Bestiary** — ✅ SHIPPED (slices 1–2). (Trophies tab, below Records) — every foe type (29) as a small tile: art (unit sprite
  where one exists, emoji otherwise), name, and its traits from `enemyTraits()`; foes you've never
  slain show a dark silhouette "???". Header "Bestiary · 12 / 29". Tracking: a `met_<id>` stat set on
  the first kill of each type (kills of bosses already counted for 4 of them backfill too). Trophy
  "Scholar of War": slay every kind of foe. Slices: (1) tracking + data helper + trophy + test,
  (2) UI tiles + SE / Large-text screenshots.

- **Chapter 9: Bloodmoon Moors** — ✅ SHIPPED (slices 1–3). The finale after the Sunken Citadel. Purple-red heath under a
  huge blood moon: heather-and-bracken ground (recolour of ground_5 toward plum/crimson, like ch6–8
  were made), "moor" prop atlas (summer atlas recoloured: wine-red pines, rust bracken bushes, dark
  slate rocks), drawMood 9 = deep red night wash + a blood moon disc low in the sky + drifting embers
  of red mist; no butterflies; dark ground palette. hpMult 4.0 (> 3.9), CAMP_CHAPTER_HP tuned so
  L10 lands near ch8 (~40–60%). Waves: every foe type, more elites late. Mid-boss night 5: Warlord
  ×0.5. Boss **The Blood Moon Warlord** (boss sprite with a crimson tint) with a new phase-2
  `bloodmoon`: every 12 s the moon flares — all foes on the field enrage for 5 s (+35% speed, +25%
  damage) with a red pulse; the King's hall arrows get +25% damage during a flare so it's a race.
  Achievement "Moonbreaker" (defeat the Warlord) + "Lord of the Moors" (clear ch9), hub boss icon,
  per-chapter confetti (crimson/plum), fanfare. Slices: (1) chapter data + ground + mood + balance,
  (2) moor props + decor, (3) Warlord + bloodmoon phase + trophies + Endless rotation.

- **6th hero: The Lancer** — ✅ SHIPPED (Charge became a thrown **Piercing Lance**: the hero can't
  cross the wall, so a dash would stall; a line throw works over it). (polish ran dry after sweeps 4–5: ch1 run, end screens, ch6/7 at night) —
  uses the unused painted "spearman" art; unlocked at 18★ (24 max). Passive "Long reach": hero melee
  range +35%. Ability **Charge** (cd 18 s): dashes up to 170 px toward the densest foe cluster in
  front, dealing 3× hero damage to every walker within 34 px of the path and knocking them back;
  bosses take the damage but aren't knocked. Sim moves the hero (deterministic), emits an ability
  event; render draws a dust trail + streak and "CHARGE!". New `charged` stat + achievement
  "Unstoppable" (hit 300 foes with Charge). Slices: (1) sim + data + test, (2) look: trail, portrait
  cut from the sprite, hub card, (3) campsim check that the hero isn't stronger than the Warden.

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

- **Chapter 8: Sunken Citadel** (slice 1) — unlocked after chapter 7. Mossy camp island amid flooded
  outskirts (ground_8 recoloured from ground_1 with puddles + glints), mood 8 = sea-green wash,
  drifting sea mist and fine drizzle; marsh props + ponds; rain 50% / fog 20% of nights; every foe incl.
  imps; Swamp Hag mid-boss (×0.5), Colossus finale for now. CAMP_CHAPTER_HP 8: 2.2 → campsim @L7 33%,
  @L10 58%. Next: Drowned King boss (tide), sunken props.

- **The Drowned King** (ch8 finale) — armoured walker (3200 HP) that calls shield-bearers (wraiths
  once enraged). Phase 2: every 7 s THE TIDE — a 170-high band of sea water across the whole field,
  centred between him and the hero, for 4 s: everyone wading in it (foes, the hero) moves at half
  speed, and it douses building fires. Translucent teal sheet with rolling foam edges and ripples,
  sea-green glow + drips on the boss, wave SFX, 🔱 on the hub. ch8 hpMult 3.9 (chapters must strictly
  increase — a test caught it after I'd pushed 3.8: always rerun tests after a late balance tweak).
  campsim ch8 @L7 25%, @L10 42% — the hardest chapter, as the finale should be.

- **Balance snapshot** (campsim, 10 runs each, classic+explorer bot mix):

  | Chapter | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  |---|---|---|---|---|---|---|---|---|
  | perms L5 | 100% | 100% | 100% | 60% | 0% | 20% | 0% | 0% |
  | perms L10 | 100% | 100% | 100% | 100% | 70% | 70% | 40% | 40% |

  A clean staircase: early chapters are learnable, 5+ need upgrades, 7–8 are the endgame. ch5 @L5 dips
  below ch6 (its night-5 Golem mid-boss is a wall at low upgrades) — inside noise at 10 runs; watch.

## Shipped (newest first)
- Siege Lord result: "Attack again" / "Try again" restarts the same siege straight away (with any cards just unlocked). Autoplay sweep on Hard (ch5, Cleric) and Nightmare (ch3, Lancer): no errors.
- Siege Lord results: units sent, walls broken, push taken (or hall % left), stars with "new best!" and chimes, gold, newly opened war cards, and the next siege (or what it needs).
- Trophies: a "Side games — best scores" grid under Records — best score + stars for each mini-game (locked ones stay "???") and Siege Lord stars.
- Dragon Dodge (mini-game #5): 🐉 side stop beside chapters 8–9 (opens after chapter 8). Drag anywhere and the King runs to just above your finger; the dragon circling overhead marks red circles (and from 20 s, whole breath rows) that burst into fire after a shrinking fuse. Coins +3, +1 per second survived; 3 burns = out; 60 s. Stars 60/100/150, gold = score. Joins Fair day; achievement Dragonheart (3★); Champion of the Fair now needs all 15 stars (700). New src/mini/flyer.ts draws the winged atlas sprites (body + mirrored wings) outside the main renderer — also fixes the Siege Lord Bats/Imps cards, which showed a one-winged atlas. scripts/dragonsim.ts: dodging bot 90–125.
- Siege Lord siege 4: "The Frost Citadel" on Frostpeak's snow (opens after siege 3 + chapter 6), defended by the Cleric with level-6 upgrades (the chapter's horde strength boosts the attacker, so the walls are much tougher). siegesim ch6 L6 cleric, full deck: horde wins 50% (L8: 0%). New achievement Winter's Fall (600). siegesim takes a 6th arg (defending hero).
- Mini-game end panels unified (src/mini/endPanel.ts): big stars with newly earned ones popping in one by one plus a rising chime each, the gold line notes "🎪 Fair day 2×!" when it applied. Fair day now doubles only the score gold, not the one-time star bonuses.
- Fair day: each day one of your open mini-games pays double gold (date-picked among opened side stops; src/mini/fair.ts + tests). Its map stop wears a pink "2× GOLD" flag. Autoplay sweep (ch7 Lancer, ch9 Cleric, ch3 Engineer on iPhone SE): no errors.
- Catapult Toss (mini-game #4): 🪨 side stop beside chapters 6–7 (opens after chapter 6). Siege towers (3 hits) and battering rams (1 hit) roll down the field; tap to lob a stone — it lands after a flight time that grows with distance, so lead the target; splash hits everything nearby; combos ×2/×3. 3 engines at the wall = lost; 60 s. Stars 100/200/300, gold = score/3 + first-time star bonuses (save.mini.catapult). New achievement Siegebreaker (3★); Champion of the Fair now needs all 12 mini-game stars (600 gold). scripts/catsim.ts: perfect-lead bot ~360, 40 px error ~290, 60 px error loses.
- Siege Lord deck art: Bats and Fire Imps cards use the in-game sprites instead of emoji.
- Mini-game polish: Supply Run wagon kicks up dust trails and its wheel treads roll; Wall Watch climbers hop and lean as they climb.
- Mini-game achievements: Marksman / Quartermaster / Sentinel (3★ in Archery / Supply Run / Wall Watch, 250 gold each) and Champion of the Fair (all 9 mini-game stars, 500). Map side stops show your best score; the three side-stop blocks in hub.ts are now one table-driven loop.
- Wall Watch (mini-game #3): 🛡️ side stop beside chapters 4–5 (opens after chapter 4). Goblins climb 5 ladders up the castle wall — tap them off (brutes take 2 taps; higher knock-offs and 4-in-a-row combos score more). Don't tap the builders in yellow hats (−5; they repair for +3 if they reach the top). 3 goblins over = lost; 60 s. Stars 120/220/300, gold = score/3 + first-time star bonuses (save.mini.watch). src/mini/wallwatch.ts + view + tests/wallwatch.test.ts + scripts/watchsim.ts (perfect bot ~310, slow 0.7 s bot loses).
- Siege Lord flyers: war cards can carry an HP boost — Bats 2.2× (were 0% in pair tests, now viable; ×4 overshot to 100%), Ravens 2× (so more reach their tower to stun it). Full-deck siegesim: siege 1 100% · siege 2 100% · siege 3 58% (was 42%).
- Hero balance (campsim ch7 L10, 20 runs): Lancer buffed — Piercing Lance longer (420→480), wider (26→30), harder (3.5→4.5×): 50%→65%. Engineer trimmed — Overclock 6s→5s: 95%→85%. (King 50%, Knight 70%, Cleric 90%, Warden 50%.)
- What's-new card for 2026-11-20 (shows from 00:00 UTC that day, once): campaign map, Siege Lord, Archery Range & Supply Run, the Cleric and the Bestiary.
- Siege Lord: 3 new war cards that open as you win sieges — War Ravens ×3 (💰3, tower hunters; win 1 siege), Diggers ×2 (💰6, tunnel under the wall; win 2), Fire Imps ×3 (💰5, flying arsonists; win 3). Deck grows to a 6-wide grid; locked cards show "🔒 Win N". siegesim takes a 5th arg (sieges won). Pair tests (with footmen, defenders L3): diggers 90%, imps 50%, ravens 0% alone (utility), brute/ram 100%, bats 0%.
- Side-game polish: the King holds a longbow on the Archery Range that turns toward the aim, with the string pulling back as you draw and an arrow nocked when ready. New sounds: bow twang, target thunk, bullseye ding (Archery); crash and pickup chimes (Supply Run).
- Supply Run PLAYABLE: 🛒 side stop on the map beside chapters 2–3 (opens after chapter 2). Full-screen road view (src/mini/supplyView.ts): tap left/right half or swipe (arrow keys on desktop) to change lane; horse-drawn wagon, rocks, logs, goblin ambushes, coin bags and crates; hearts, timer and star targets; end panel pays gold = score/4 + first-time star bonuses into save.mini.supply. Verified on iPhone SE screenshots.
- Supply Run slice 1 (not visible yet): seeded logic in src/mini/supply.ts — a wagon in 3 lanes on a road that speeds up (220→430 px/s), rows of rocks / logs / goblin ambushes that always leave a free lane, coin bags (+5) and crates (+15), 1 point per 200 px, 3 hits = breakdown, 90 s; stars 150/300/500; gold = score/4 + first-time star bonuses. scripts/supplysim.ts: an alert bot finishes at ~510–650 (3★), a sloppy one breaks down at ~270–420 (1–2★). Lesson: the first bot "crashed" every run because it wouldn't double-swipe past a blocked middle lane — a sim bot needs the moves a player has. Tests included.
- **Archery Range is playable**: a 🎯 side stop on the campaign map beside chapter 1–2 (opens after chapter 1) shows its stars and opens a full-screen 60 s range — drag back and release to shoot (dotted trajectory preview), bullseye boards, straw dummies and diving ravens, score / combo / timer HUD, end panel (score, stars, gold, Shoot again / Back to the map); best + stars saved in save.mini.archery. Checked on SE. (Polish later: a bow in the King's hands, hit sounds.)
- Siege Lord polish: war drums + horn on every deploy; first-siege coaching (the cards, then the lanes, glow gold until the first group is sent); trophies ⚔️ "Siege Lord" (take all 3 halls, 500) and 🏴 "Conqueror" (all 9 stars, 700).
- **Siege Lord is playable** (slices 2–3): a ⚔️ Siege Lord card on the Battle tab (after chapter 1) opens 3 sieges (each unlocks after the one before). In a siege the campaign bot defends; the screen shows the castle hall bar, PUSH n/8 + timer, a War Chest meter, 8 unit cards (portraits) and Left / Middle / Right lane buttons; the camera rides the horde's front line. Win = "The hall has fallen!" with stars by push + gold (100/200/300 + 5 per wall broken + first-time star bonuses); stars saved in save.mini.siegeN. The horde's kills don't touch campaign stats. Checked on SE + iPhone 13.
- Siege Lord slice 1 (not visible yet): reverse-mode sim — `reverse` camp flag (no wave queue / thief), `deploy(c, unit, lane)` from a War Chest (start 20, +4/s during pushes, cap 80, +10 per broken wall section), 8 cards (footman ×3 … ram), units at 1.4× HP; one continuous siege of 8 × 45 s pushes (survivors stay, the defenders' plots unlock and income arrives per push); hall falls = win, last push ends = loss; SIEGES ladder (Border Keep defenders L0 / L2 / L3 + Knight) and stars by push 8/6/4. scripts/siegesim.ts (a saving-then-massing attacker): L0 100% (push 2–3), L2 83% (push 4), L3 83%, L4 0%. Lesson: clearing survivors at each push made the siege unwinnable — the horde has to accumulate. Tests included.
- Archery Range slice 1 (not visible yet): pure, seeded game logic in src/mini/archery.ts — drag-to-aim shots with gravity, sliding boards/dummies on 4 lanes, diving ravens from 18 s, bullseye 3 / ring 1 / raven 5 × combo (up to 3×), 60 s round, stars at 30/60/100, gold = score + one-time star bonuses; save.mini records (sanitized). Tests for scoring, hits (swept per frame), reload, misses, determinism.
- **Campaign map** (owner request): the Battle tab's chapter list is now a winding road from chapter 1 to the final citadel; cleared stops = 🚩 + stars, the next stop glows (NEXT / NEW!), chapters beyond are fogged "???" with no details, the last stop is a fogged 🏯 until reached. Tap a stop → its full card + Play. Endless + Daily above. Hub test updated; checked on SE.
- Auto-update for the home-screen app: the owner's phone was still on a build from before chapter 6 (★ 15/15) because an iOS web app can stay suspended for days. Each build now writes version.json and bakes the id into the bundle; when the app returns to the front (or every 5 min on the menu, never mid-run) it checks and reloads into a newer deploy. The service worker never caches version.json.
- The King's passive: fires 25% faster (was 15%). campsim L10, 20 runs: ch7 45→55%, ch9 40→45%; ch1 L0 still 100%, ch3 L0 0% before and after (unchanged early curve).
- Bot: casts the Cleric's Sanctuary when the hall (<85%) or a wall section (<60%) is hurt instead of on crowds, so hero sims reflect real use. Sanctuary trimmed to 5% hall / 12% walls. Hero spread at ch7 L10 (20 runs each): King 45 · Lancer 50 · Warden 60 · Knight 65 · Cleric 80–85 · Engineer 95 — the Cleric sits inside the range; the Engineer is the outlier (to review later, carefully: players may rely on him).
- Daily challenge: the Cleric joins the hero pool from 2026-11-24 (days up to the 23rd diffed unchanged; test). Flair checked on the Cleric sprite.
- Cleric balance: first version won ch7 L10 75% vs the King's 45% (20 runs). Toned down to Sanctuary 7% hall / 15% walls, 30 s recharge, hall archers +15% → ch7 60%, ch9 30% (King 40%): on par within noise.
- New hero **The Cleric** (22★): the hall's archers hit 15% harder; Sanctuary (30 s) heals the hall 7%, every standing wall section 15%, the hero to full and all soldiers (keeps its charge when all is well). White-and-gold recolour of the mage art + portrait, ✨ icon, golden ring fx, "Light of the Gate" trophy (heal 5,000). Test included.
- One-time hint bubble under Trophies once 5 foe kinds are slain: "📖 New foes in your Bestiary!" (same coachmark system as quests / skills / flair).
- Bestiary: tap a slain foe for its card — portrait, traits, health / speed / hit / coins, and the chapters it marches in; Back returns to the grid. Checked on SE.
- In-run: the first kill of each foe kind shows "📖 New in the Bestiary: <name>" (bosses keep their own defeat banner), tying the Bestiary to play.
- Bestiary slice 2: "📖 Bestiary · N / 29" in the Trophies tab — painted portraits (emoji for flyers and bosses), names and up to two traits; foes not yet slain are "???" tiles; bosses get a red tile. Checked on SE, normal + Large text.
- Bestiary slice 1: each foe kind's first kill is tracked (met_<id>; the 4 late bosses also count from their older kill stats) and a 📖 "Scholar of War" trophy (slay every kind of foe, 29) shows progress (test). UI next.
- Checked: Endless HUD on SE — "BEST 25" while tying the record, "🏆 NEW RECORD" past it, twist + weather icons fit the label (night 31 with rain).
- Checked with Large text on iPhone SE: Armory (incl. Royal Legacy), Heroes tab Won chips, What's-new card — all fit, nothing clipped. Decision: quest rewards keep their +25%/cleared-chapter scaling (a 650 weekly pays ~2.1k at 9 chapters) now that Royal Legacy gives late gold somewhere to go.
- Armory capstone 👑 **Royal Legacy** (late-game gold sink): unlocks once every other upgrade is maxed (~25.6k gold); 10 levels, +3% hero & tower damage and wall HP each, ~20k gold total. Balance sims skip capstones, so the L5/L10 tables keep their meaning (test). Locked + open states checked on SE.
- Weekly quest 🌋 "Win 2 runs in chapter 7+ this week" (new lateWins stat) joins from the week of Mon 2026-11-30, only for players who have beaten chapter 7; this week and next are unchanged (tests). First appearance for a ch7 veteran: week of 21 Dec.
- Heroes tab: a "🏆 Won" chip on every hero that has won a run, so Band of Heroes progress is visible where you pick heroes.
- New trophy 🤝 **Band of Heroes** — win a run with every hero (600 gold). Wins are tracked per hero in stats (won_<hero>); older wins still in the run history count too (test).
- Test: the Blood Moon Warlord closes the first Endless boss cycle at night 55 and his blood-moon flare works in Endless too.
- Balance snapshot, all 9 chapters (campsim, King, 10 runs, win %): L5 100/100/90/90/0/30/10/0/0 · L10 100/100/100/100/90/70/20/30/40. Chapters 7–9 sit within noise of each other at L10 (earlier 12-run checks: 40/42/50) — no change.
- Legendary combo blessing ⚜️ **Last Bastion** (Kingslayer + Stone Hall): bosses take +25% damage, the hall 20% less, hero HP +25%; not in dailies (test). Card checked on SE with the combo badge.
- What's-new card "2026-11-19c": anyone who saw an earlier card today gets the newest bits (chapter 9 + Blood Moon Warlord, the Lancer, flairs, blessings, streak bonus); first-time viewers get the full list (now four new chapters).
- Two new blessings: ⚔️ Kingslayer (+20% damage to bosses, rare, ×2) and 🏯 Stone Hall (hall takes 15% less damage, rare, ×2). Marked `newer` and kept out of daily runs (classicBlessings), so a day's offers stay the same for everyone (test). Card checked on SE.
- Two new hero flairs: 🫧 Seafoam Trail (clear chapter 8: teal pool, foam bubbles while walking) and 🌕 Blood Moon Halo (clear chapter 9: crimson halo, red pool and motes). Flair picker on SE checked (test).
- Checked (no change needed): chapter 9 on Hard — "Clear on Normal first" until cleared, then 💀 PLAY; pause menu during a chapter 9 night on iPhone SE fits and reads cleanly.
- How to play: checked every line is still accurate; added "👑 Bosses enrage at half health and gain a new move" (still fits one iPhone SE screen).
- Loss tip for the blood moon: after 2+ flares, the end screen says to fall back near the hall during a flare (its archers hit harder) and save the ability for the rush. Flares counted in runStats.
- Victory fanfare for chapters 8 and 9 (own keys; the Moors in a minor key with a slow double heartbeat and a deep gong). Checked the hub chapter list on iPhone SE with 9 chapters + Endless (clean).
- Chapter 9 boss (slice 3): **The Blood Moon Warlord** — crimson-haloed summoner (knights, runners when enraged); phase 2 flares the blood moon every 12 s: all foes +35% speed and attack 25% faster for 5 s, the hall's arrows +25%, the field washes red with "BLOOD MOON!". Joins Endless's boss rotation; "Moonbreaker" trophy; 🌕 on the chapter card. bossHpMult 0.7 in ch9 → campsim L10 50% (was 0% at full HP). Test included.
- Chapter 9 scenery (slice 2): moor prop atlas — the summer set recoloured to wine-red heath trees and bracken with dark slate rocks (moor.webp, 91 KB); checked by day and at night.
- **Chapter 9: Bloodmoon Moors** (slice 1) — unlocked after the Sunken Citadel. Plum heath ground (ground_5 recoloured, hue blended the short way round so the path stays sandy), deep-red wash with blood-moon light pulsing from the north and crimson mist, dead trees + stumps, no butterflies, crimson leaf bursts, autumn props for now, crimson/plum confetti, "Lord of the Moors" trophy. hpMult 4.0; CAMP_CHAPTER_HP 2.45 → campsim L10 42% (= ch8), L5 0%. Final boss is the Iron Colossus until slice 3 brings the Blood Moon Warlord.
- Checked: Trophies tab on iPhone SE (quests, 24 achievements, records) renders cleanly and claiming pays (gold + badge update).
- Daily streaks now pay: +25 gold per streak day after the first, up to +150 from day 7, on top of the 150 victory bonus. The daily card's prize includes it ("+225 gold" on a 3-day streak) and the end screen shows a 🔥 Streak bonus row (test). Also checked: the Armory fits one iPhone SE screen.
- Lancer: "SKEWERED ×n" / "Out of reach!" float above the coin stack instead of on the count (found in a chapter 8 night pass with the Lancer — otherwise clean).
- Daily challenge: two new twists from 2026-11-21 — **High Tide** (free tide every 12 s at night, coins +20%) and **Last Stand** (walls −40%, hero +60% damage, coins +20%). Twists now carry a `since` date; days up to the 20th are byte-for-byte unchanged (diffed before/after). First High Tide: 25 Nov. Test included.
- Daily challenge: the Warden and the Lancer join the daily hero pool from 2026-11-21 (days up to the 20th keep their hero — the daily uses its own fixed hero list, so adding heroes never shifted past days). First Lancer daily: 29 Nov. Checked a Lancer daily starts as the Lancer (test).
- Endless: 8th weekly twist **Mist Week** 🌫️ (fog most nights cuts tower range; hero +25% damage, coins +10%), joining from Mon 2026-11-30 so this week (Elite) and next (Gold Rush) are unchanged; first comes round the week of 4 Jan. Test covers the gating.
- The Lancer is drawn at body height matching the other heroes (his raised spear made him look a size smaller and left the Golden Halo floating above his head). Flair checked on all 6 heroes.
- Balance check, King vs Lancer (campsim, 10 runs each, win %): L5 ch1–8 King 100/100/100/60/10/20/0/0 · Lancer 100/100/90/70/20/40/0/20; L10 King 100/100/100/100/100/70/40/40 · Lancer 100/100/100/100/70/70/40/70. On par within noise — no change.
- New loss tip for every hero: if you used your ability fewer times than nights survived (from night 3), the end screen names it — "Piercing Lance recharges fast — tap it whenever foes bunch up. You used it 1 time in 5 nights." Casts are tracked in runStats.
- What's-new card refreshed: players who dismissed the first card get a short one (the Lancer, weekly quests from Monday, chapter confetti, replay tutorial); anyone who never saw it gets the full update list, now naming both new heroes.
- Lancer: with no foe in reach the lance keeps its charge and says "Out of reach!" instead of flying at empty grass (test). Checked: the Battle tab names the hero in one line, so 6 heroes don't crowd the SE layout.
- New hero **The Lancer** (18★): shoots 30% farther; Piercing Lance (16 s) hurls a lance through the best-lined-up foes in reach (420 px line), 3.5× hero damage + knockback (not bosses), "SKEWERED ×n" with a hot streak. Painted spearman art + portrait, 🔱 icon, achievement "Unstoppable" (300 skewered). campsim ch5 L5: King 17% · Warden 17% · Lancer 25% (12 runs each; `campsim` now takes a hero arg). Test included.
- Victory confetti falls in front of the end panel (it ignores taps and fades in ~3 s) — on a phone the panel used to hide almost all of it.
- The King's speech bubble now clears his "40 FULL" coin tag (the tail used to poke into it) and bobs with him.
- HUD: the coin pill's FULL badge now hangs under the pill instead of covering the coin count (found in a ch1 browser playthrough).
- Weekly quests: three new ones join the rotation from the week of Mon 2026-11-23 — 30 elite foes (needs a cleared chapter), 10 flawless nights, 500 logs. The current week is unchanged (test).
- Victory confetti is tinted per chapter (meadow greens, bog, steel sparks, violet, royal fire, ice, embers, tide); Endless keeps the rainbow mix.
- Settings: "↺ Replay tutorial & hints" brings the tutorial and coachmark bubbles back; Reset progress now also clears the hint and seen-heroes flags.
- Endless: this week's twist icon on the in-run night label ("NIGHT 1 · ENDLESS 👑").
- One-time "What's new" card on the Battle tab for returning players (chapters 6–8, the Warden, skill trees & flair, Hard/Nightmare, quests & Endless twists, new buildings); "Let's go!" dismisses it for good.
- Quest fairness: daily quests now only include ones the player can do yet (elites / Hard wins need a cleared chapter so Hard is open; fires need chapter 7). Caught by checking tomorrow's quests in the browser with a faked date (test).
- Chapter 5's night-5 Golem mid-boss softened (HP ×0.6 → ×0.45): at perms L5, 9/16 runs used to die right there (13% wins) → 25% with a smoother ramp; @L10 100%.
- 3 new daily quests from 2026-11-20 (gated so today's stay put): defeat 5 elites, stamp out 3 fires, win a run on Hard/Nightmare (new hardWins stat). Skipped a Warden-only quest — dailies shouldn't need a specific hero (test).
- Loss tips cover the newer threats: buildings left burning (Fire Imps), towers stunned often (War Ravens), Tunnelers surfacing with no Barracks — from new run counters.
- Hero skill capstones: 3 more skill points (280 / 340 / 400 nights) and a tier-4 skill per branch — Executioner (+20% vs bosses), Bulwark (hall takes −15%), Midas (+15% coins) (test).
- Hub header shows trophies claimed (🏆 x/N) beside stars. Checked chapters 2–5 by day and night against the newer polish: consistent (ch4's drifting grave mist is intended).
- Blessing cards: combo badges also show the building a blessing needs ("COMBO 🦅 + 🗼"); Hawkeye gets its own 👁️ icon (it shared Eagle Towers' 🦅). Checked the new blessing cards on the pick screen.
- Endless twist #7 "Tidal Week" (a tide rolls in every 14 s at night, slowing you and the horde; coins +15%) — joins the rotation from Mon 23 Nov so the current week keeps its twist. Bug sweep 3 (ch8 + Warden, ch5 Hard): clean.
- Sunken Citadel scenery (sea-moss trees and bushes, barnacled grey-green rocks — sunken prop atlas); "Tidebreaker" trophy; the Drowned King joins Endless's boss rotation (night 50).
- The Drowned King: ch8 boss whose phase-2 tide slows everyone it covers and puts out fires (fx, SFX, test).
- Chapter 8 "Sunken Citadel": drowned-ruins map, sea mist and drizzle, rainy nights, achievement (balance-tuned).
- Chapter cards on Hard / Nightmare show that difficulty's progress ("💀 Best: night 6" / "💀 Cleared"); best night per chapter+difficulty saved (test).
- "Best Endless sieges" board on Trophies: top 5 Endless runs ever (nights, hero, date), kept apart from the 20-run history; existing records seed it (test).
- Per-chapter victory fanfare: own key per chapter, minor for Hollow Night / Caldera, glassy bells for Frostpeak, war drums for the Caldera, a held final chord.
- Armory: Arcanum (Mage Tower +8%/lvl) and Field Works (spikes +10%, Healer reach +5% /lvl), 5 levels each (test).
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
- 23:24 — Deploys 216–225 all green (223 cancelled = superseded by 224, same code). 11 slices since 22:40: Supply Run logic+view, Archery longbow+sfx, Siege Lord new cards + flyer buff, What's-new for Nov 20, hero balance (Lancer up, Overclock 5s), Wall Watch (mini-game #3), mini-game achievements + best scores, polish. Tests 180→186. Lessons: python heredoc with an apostrophe in a single-quoted string broke a ROADMAP edit (commit went out without it — fixed next commit); balance bots that spread money evenly undervalue optional cards — judge cards with pair tests too. Next: a 4th side stop for chapters 6–8, Siege Lord card art, mini-game daily best.
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
- **2026-11-19 14:41** — deploys 121–134 all green. This hour: how-to-play rewrite, 2 trophies, Fire
  Imps in Endless, sweep 2 (clean), Phase 6 row, campgold payout check (no change), Hawkeye combo,
  "Earned this run", pause status, mood perf check (no cost) + halo glow, "This week" strip, Armory
  Arcanum + Field Works, per-chapter fanfare, Best Endless sieges, Hard/Nightmare progress on cards.
  141 tests. Lesson: smaller UI slices ship fast but each must be eyeballed — the duplicate skull and
  a too-tall Armory card were both caught only in screenshots.
- **2026-11-19 15:40** — deploys 132–144 green except **136 failed** (chapter 8 slice 1): the Pages
  workflow runs the tests, and the hpMult ordering test failed, so that version never went live; 137
  (Drowned King + fix) deployed 8 min later. The safety net worked — but the rule stands: rerun
  `npx vitest run` after every late tweak, before committing. This hour: chapter 8 (data, Drowned
  King + tide, sunken props), Tidebreaker, Tidal Week, sweep 3 (clean), combo badge fix, hub 🏆
  count, older-chapter check, skill capstones, new loss tips, 8-chapter balance snapshot. 145 tests.
- **2026-11-19 16:40** — deploys 145–153 all green. This hour: 3 new daily quests (from 11-20) +
  eligibility fix, ch5 Golem softened, "What's new" card, Endless twist icon on the night label, SE
  label overflow check (fits), Settings replay tutorial & hints, per-chapter confetti, weekly quest
  expansion (from 11-23). 148 tests. Lesson: date-faked browser checks keep catching things the unit
  tests can't (unfair quests, a wrapping weekly card) — keep doing one per rotation change.
- **2026-11-19 17:40** — deploys 154–164 all green. This hour: browser playthrough polish (FULL badge
  over the coin count, King's speech bubble vs coin tag, confetti hidden behind the end panel), then
  polish ran dry → 6th hero **The Lancer** (Piercing Lance; dash idea dropped because the hero can't
  cross the wall) + out-of-reach charge keep, What's-new refresh, ability-unused loss tip, King vs
  Lancer sweep (on par), Lancer body size fix found by the flair check. 150 tests. Lesson: a design
  note's mechanic should be sanity-checked against the map rules before building (the dash).
- **2026-11-19 18:40** — deploys 165–173 all green. This hour: Endless Mist Week (from 11-30), Warden +
  Lancer in the daily hero pool and daily twists High Tide / Last Stand (from 11-21, past days diffed
  unchanged), daily streak bonus, lance labels, Armory + Trophies SE checks (clean), then chapter 9
  Bloodmoon Moors slices 1–2 (map, mood, balance L10 42%, moor props). 154 tests. Lessons: blend hues
  the short way round the wheel (the first ground recolour went green); chapter affix text must only
  promise what's built (caught "more elites" before shipping).
- **2026-11-19 19:41** — deploys 174–183 all green. This hour: Blood Moon Warlord (first try 0% at
  L10 → bossHpMult 0.7 → 50%), fanfare for ch8/9, blood-moon loss tip, How to play line, ch9 Hard +
  pause + SE list checks, Seafoam / Blood Moon flairs, Kingslayer / Stone Hall / Last Bastion
  (kept out of dailies), What's-new 19c. 156 tests. Lessons: re-run campsim after swapping a
  placeholder boss — boss HP stacks with the chapter's HP scale; screenshot hacks that replace UI
  state after it renders don't work — drive the real flow (rerolls) instead.
- **2026-11-19 20:40** — deploys 184–193 all green. This hour: 9-chapter balance snapshot, Endless
  night-55 test, ch2 fresh-player sweep (clean), Band of Heroes + Won chips, weekly ch7+ quest (from
  11-30), Royal Legacy capstone (late gold sink; sims skip capstones), Large-text + Endless HUD
  checks (clean), Bestiary slice 1 (tracking + Scholar of War). 162 tests. Lesson: when testing
  quest picks in the browser, reset the stored quest state in the seeded save — quests roll on the
  first load, before the seed applies.
- **2026-11-19 21:40** — deploys 194–203 all green. This hour: Bestiary UI + toast + info card +
  coachmark, 7th hero The Cleric (art recoloured from the mage) + two balance passes, Cleric in the
  daily pool (from 11-24), bot casts Sanctuary on damage. 164 tests. Lesson: check the sim bot
  actually plays a new ability sensibly before trusting balance numbers — the crowd-trigger rule
  undersold a heal; and compare a new hero against the whole roster, not just the King (the
  Engineer at 95% on ch7 is the real outlier).
- **2026-11-19 22:40** — deploys 204–214: all green except **210 failed** (Siege Lord sim): a test
  written for the push-by-push design broke when the siege became continuous, and my chained
  commit used a bare `grep` on the vitest output, which succeeds even on failure — so it committed
  and pushed. The Pages gate kept that build off the site; 211 (test fixed) deployed 8 min later.
  Rule now: gate commits on `grep -q "N passed"`. This hour, from the owner's requests: auto-update
  (the phone was stuck on a pre-chapter-6 build), the campaign map, Siege Lord (sim → playable →
  polish), Archery Range (logic → playable). 175 tests.
