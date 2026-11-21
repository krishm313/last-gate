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

| 7 | **Smooth & solid** (owner Nov 21: "fix them all") | ✅ S1 FPS/quality readout (Settings toggle) · ✅ S2 Quality: Auto / Smooth / Pretty · ☐ S3 maxed buildings cached as sprites · ◐ S4 effects budget (glow/particle/twinkle caps via tiers ✅; coin sprite cache tried, no gain) · ✅ S5 hit feel (hitstop, flash, per-weapon sfx) · ✅ S6 one-thumb control tuning · ✅ S7 busy-night readability (boss telegraphs, outlines) · ✅ S8 late-chapter balance curve (bots ch3 13% / ch5 0% / ch8 6%) · ✅ S9 first-five-minutes pass · ✅ S10 broader regression bots (late camps, all bosses, Siege) |
| 8 | **Replay & endgame** (owner Nov 21: "feels as if i finished the game… repetitive or expected" → "fix them all") | ✅ R1 rule-changing blessings + combos · ✅ R2 night events (Treasure Night, Swarm Night, Cursed Shrine = opt-in Elite Raid, Wandering Merchant) · ⏸ R3 building draft per run (switched off: owner "too much to read mid game… better before") · ✅ R4 Ascension (reset maxed Armory → crown bonus + new tier) · ✅ R5 cosmetics shop for gold (Royal Bazaar) · ✅ R6 Next-goals panel (missing trophies/stars/milestones) · ✅ R7 Hard/Nightmare rule changes + own trophies/rewards · ✅ R8 opt-in challenge levels (Heat) · ✅ R9 weekly challenge runs · ✅ R10 hero mastery quests + capstones |

| 9 | **Look & feel overhaul** (owner Nov 21 night: "no features… repetitive · upgrade animations aren't extravagant · watch tower / cart / health tent are 2D, not proper" → "through that whole plan… don't stop until fully finished") | ✅ B3 upgrade sequence for every building · ✅ B4 Mastery moment · ✅ B5 new parts fly in · ✅ A1 3D re-model: Watchtower, Healer's Tent, Merchant cart, Shrine, Mage Tower, spikes · ✅ A2 per-level looks per building · ✅ D12 less reading mid-game · ✅ C6 random camp layouts · ✅ C7 new enemy types · ✅ C8 boss signature attacks · ✅ C9 hero weapons · ✅ C10 companion pet · ☐ C11 kingdom view · ☐ FINAL full self-review |

Order (owner approved all): S1, S2 → R6 → R1 → R2 → R4 → R5 → R8 → R3 → R7 → R9 → R10 → S3–S10 interleaved (S8 with every sim change). Each item ships in small verified slices; balance rule applies to every sim change.

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
- C10: companion pets — a Companion panel under your hero (Heroes tab). **Hound** (4 ★): a 3D tan hunting dog with a red collar that lopes at the King's heel with a bounding hop (squash on landing, stretch at the top), and bounds off after coins lying out of the King's magnet reach, nosing each one up to him. **Falcon** (12 ★): a 3D slate peregrine that glides at the King's shoulder (banks into turns, wingbeats while flying, glides when hovering) and every ~3.4 s stoops on the nearest foe within 280 px for 1.4× a hero shot, with a feather burst. Saved through the sanitiser; the balance bot has no pet, so balance is untouched.
- C9: hero weapons — a Weapon panel under your hero in the Heroes tab reshapes every hero's auto-attack: **Signature** (the hero's own quick shot — the King's golden crescent, default), **Crossbow** (8 ★: half the rate, ×2.05 per shot, a bit more reach; heavy iron-headed bolts with a white streak that punch through into the foe behind for 60%), **War Staff** (16 ★: ×0.62 rate, ×1.25 per shot, a little less reach; crackling violet orbs that burst on every foe within 46 px for half). Saved with the run setup (and kept through the save sanitiser — caught a bug where a reload would have dropped the pick). The balance bot keeps Signature, so balance is untouched.
- C8: every boss now has a signature move once enraged, and its own arena. New moves for the three that had none: **Bone Dragon — Fire Breath** (a roaring sheet of flame sweeps across the wall below it: scorches those sections and smokes out the archer towers there), **Iron Colossus — Quake** (a rolling ring of churned earth with cracks splitting out from its feet: towers in reach rocked still, the wall cracks), **Marsh Troll — Bog** (three pools of sucking marsh, one under the King if he's close: they slow him, not the horde). All telegraphed with the existing boss ring + "!". **Arena:** while a boss is on the field the whole night takes its colour — an edge tint and drifting motes in its theme (embers for Dragon/Magma, snow for the Frost Wyrm, spores for Troll/Hag, ash for Golem/Colossus, sea-mist for the Drowned King, blood motes for the Bloodlord, violet wisps for the Hollow King, dust for Ogre/Warlord), deepening when it enrages; stateless motes, fewer on lower quality tiers. Balance within noise (bot ch2/4/5/7: 67/6/7/2% vs 65/6/8/3%, 96 runs).
- C7: three new foes. **Shield Wall** (ch 6+): a tall horde shield-bearer with a 3D tower shield; foes in the lane behind it take half damage (faint blue lane behind it, a little blue shield over each sheltered foe). **Wall Climber** (ch 5+): hooks a grapnel on the palisade, climbs over (still hittable — lifted into view above the stakes, rope and hook drawn), drops inside with an "Over the wall!" pop and runs at the hall. **Balloon Bomber** (ch 8+): a striped 3D hot-air balloon with a goblin bombardier in a wicker basket; ignores the King, hovers above the hall out of the wall towers' reach and drops lit bombs that burst on it — go pop it. All three are in the Bestiary with traits. Balance within noise (bot ch5–10: 8/14/3/9/1/13% vs 10/9/1/11/2/14%, 96 runs).
- C6: camp layouts — half of all runs (from chapter 2 on; never daily runs or Siege Lord) play in a mirrored camp: Lumber Camp, Forge, Barracks, Catapults, Mage Tower, Healer, Watchtower, the wood grove, the log pile, forge drop-offs, income pile and your spawn all swap sides, and enemy lanes reflect with them so it's an exact mirror (balance-neutral: bot 9/15% vs 13/17%, 96 runs, within noise). Picked from the run's seed, never touching its RNG. Shuffling the front-row pads was tried and dropped: moving the Mage Tower or Spike Trap changed how strong they are (bot win rate 15% → 4%). `?layout=mirror|classic` forces one for testing; campsim takes LAYOUT=classic|mirror.
- D12: less reading mid-game. Rule nights no longer add a 4th card — one of the usual three becomes the rule card, same size, picked out in violet with a small ✨ RULE chip. The tower path is a one-glance, one-tap choice: "Tower path" + Fire / Frost / Volley with a two-word effect each (Burns foes · Slows foes · Hits 3 at once), short cards. Trophy, quest and new-Bestiary toasts no longer pop during a fight or over the blessing cards: they're held and come out once at dawn, several combined into one line. Balance unchanged within noise (bot win rates 4/17/10/15% vs 6/13/15/17%, 48 runs).
- A2: every building now looks different at every level (3D, same pipeline as A1). Catapult ×4: iron bands + a shot pile (Lv 2), a plank mantlet shield and iron-plated uprights (Lv 3), a roaring fire brazier and red war banner at Firestorm (Lv 4). Barracks ×4: a sleeping tent and training dummy (Lv 2), a shield rack and blue banner (Lv 3), gilded trim and a crowned standard at Veterans (Lv 4). Lumber Camp ×3: a sawhorse and second woodpile (Lv 2), a log lean-to and a loaded handcart (Lv 3). Forge ×2: a second chimney with flames, a second furnace mouth, a sword rack and quench barrel (Lv 2).
- A1: the flat canvas-drawn pieces are now 3D-rendered like the rest (new models in src/lookdev/propgen.ts, packed into buildings.webp — now a 2048-wide shelf-packed sheet): Watchtower ×3 levels (timber stilts, braces, ladder, railed lookout, roof + pennant; stone footing and blue gold-trimmed roof at Lv 3; lantern glow kept), Healer's Tent ×4 (red-striped canvas, cross banner, awning at Lv 3, gold cross at Sanctum), Mage Tower ×4 (rune-banded spire, floating crystal, gold crown at Storm), merchant cart (striped awning, wares, wheels; rocks while rolling, squash-settles), Cursed Shrine (rune obelisk on a stepped base; eye pulse overlay, red once accepted), spike stakes (wood / iron). All use the shared build/upgrade bounce. The drawn versions stay as the fallback while the sheet loads.
- B5: new parts fly in — on every upgrade three pieces arc from the King into the building (staggered 70 ms, spinning, 0.32 s each) and land with a dust puff: arrow bundles (towers), boulders (catapults), crystals (Mage Tower), shields (Barracks), stakes (spikes), planks and stones (everything else).
- B4: Mastery moment — reaching any building's mastery level slams a column of light down from the sky onto it (holds, then thins), with a pool of light at the base, a 190-px gold shockwave, a gold-and-white spark burst, a 0.5 s slow-mo beat, a warm flash, a heavier shake, and a '★ MASTERED! <name>' banner with a chime (replacing the small level tag).
- B3: upgrade sequence — upgrades no longer regrow from the ground: the building crouches (0.12 s, wider as it squashes), then springs past full height and rings down (damped spring, 0.85 s total), with dust puffs from both sides, a second wider gold ring, a spark fountain off the top, a bigger shake and a big 'LV n!' badge ('★ LV n MAX!' in gold at the top level). While a building under the hero is popping, the hero fades to 35% so the animation shows through. (Healer/Watchtower/Mage get theirs with the 3D rebuild in A1.)
- Owner feedback (Nov 21 night): "two prompt level up… too much to read mid game… better before" → building draft switched off (BUILD_DRAFT = false): all buildings unlock together again, one pick per dawn. Code kept behind the flag.
- In-game upgrades: ⛺ Healer's Tent Lv 4 Sanctum (190c + 16 logs: reach 300, heals 21/s, mends walls faster; green base glow) and 🗼 Watchtower Lv 3 Eagle Eye (180c + 18 logs: watches 500 out, towers +50% range / +32% fire rate; gold base glow); both wear the bobbing mastery star. Barracks Veterans now show gold double chevrons over each veteran soldier. Every main building now has a mastery level. Bot stops at the old max: ch10 L8 17%/17%, siege ch10 28%/28%.
- In-game upgrade: ⚔️ Barracks Lv 4 Veterans (170c + 18 logs) — no 4th soldier, but the garrison gets +60% HP, +50% damage and gets back up in 4 s (vs 8). Info card shows '★ Next/Mastered: Veterans…' and the soldier count stays honest (3). Bot stops at Lv 3: ch8 L5 15%/15%, siege ch9 47%/47%. 301 tests.
- Polish: mastery cues on buildings — mastered Catapults (fiery orange) and Mage Tower (storm violet) breathe a coloured glow at the base and wear a bobbing, gently rocking gold star that pops in with an overshoot when mastered; Iron Maw spikes turn dark iron with bright tips.
- In-game upgrades: building masteries (a level past each old max, shown on the info card as '★ Next: …' / '★ Mastered: …'): 🪨 Catapult Lv 4 Firestorm Mastery (220c + 22 logs) — boulders set the whole splash ablaze (35% of the hit as burn for 3 s; flame ring + sparks on impact); 🔮 Mage Tower Lv 4 Storm Mastery (230c + 18 logs) — 5 chains and the first foe struck is stunned 0.5 s (not bosses); 🪤 Spike Trap Lv 4 Iron Maw (150c + 18 logs) — 30 dmg/s, slows 45%, denser stakes. PRE_MASTERY map keeps the balance bot (and Siege defenders) at the old max: ch8 L5 15%/15%, siege ch10 28%/28%. tests/buildMastery.test.ts. 300 tests.
- In-game upgrade: ★ Tower Spec Mastery — Archer Towers gain a 5th level (260–310 coins + 20 logs) that deepens their Lv-3 path: 🔥 Fire Mastery burns 2× as hard and 1.5 s longer; ❄️ Frost Mastery slows 60% (vs 40%) with no damage penalty; 🏹 Volley Mastery looses 4 extra arrows (vs 2) at 0.65× (vs 0.55×). Info card shows '★ Next: …' / '★ Mastered: …'; mastered towers fly the gold-star pennant, breathe a spec-coloured glow and shed embers / frost motes / gold sparks. The balance bot (and Siege defenders) stop at Lv 4, so balance numbers are unchanged (ch10 L8 19%/19%, siege ch6 66%/66%). tests/towerMastery.test.ts.
- Polish: reviewed all 9 ability casts frame by frame at phone scale (Arrow Rain, Shield Bash, Fire Nova, Snare, Lance, Sanctuary, Call to Arms, Acid Flask read well). Overclock was the weak one — its effect is on the towers, so near the hero only a faint flash showed: now an '⚙️ OVERCLOCK!' call-out and gold sparks at the hero, plus a spark ring jolting every built tower.
- Polish: toast overflow — at most 2 toasts at once (older ones fade early), and while the blessing pick is open toasts sit at the bottom instead of stacking over the cards (a wave ending with bestiary + trophy + quest toasts used to bury the top of the pick cards).
- S10: regression bot tests/featuresFuzz.test.ts — full runs of ch6 Normal, ch7/ch8 Hard and ch10 Nightmare with maxed perms and three Heats on, a random player who drafts buildings, prefers rule cards, steps onto visitors and plays through night events and Blood Moon surges (asserts finite state, run ends, new systems fire); plus every boss spawned in its second phase, using specials for 20 s, then killed. It caught a real bug: a foe brought to exactly 0 HP could be revived the same step by the Troll's regeneration, a healer's mend or the Hag's curse — all three now skip the fallen. Balance identical (ch5 L3 13%/13%, ch10 L8 19%/19% at 48 runs). 294 tests.
- S9: first-five-minutes walkthrough (fresh save, iPhone 13, real taps): title → Defend the camp → tips. Found: a new player still reading the first tip watched the day clock run out (20 s → night 1) before learning to build. Fix: while the first-run tips 'walk' and 'build a tower' are unfinished, the first day's clock holds at 12 s (campaign only); it releases the moment the first tower stands. Verified: idle → clock held at 12; walk → build tip; build → 'Ready? Start the night', clock runs.
- S8: smoothed the campaign curve's hole at chapter 5 (The Last Gate): night-5 Golem 45%→38% HP with fewer brutes in its escort, final-night Colossus at 85% HP. Bot (48 runs): ch5 L3 8% → 13% (now level with ch3 L1 ≈13% and ch8 L5 ≈13%; ch10 L8 ≈17%), ch5 L5 25% → 25%. Other chapters untouched.
- S6: thumb stick response curve — 10% dead zone (a resting thumb's jitter no longer walks the hero), full speed at 85% of the stick radius instead of 100%, gentle ease (^0.85) between for precise short steps. Drag test: hero still walks (250→457 in the same drag).
- S7: boss special telegraphs — in the last 0.9 s before a boss summon, second-phase power (slam/warcry/boulders/curse/eruption/tide/blood moon/grave-rise) or Frost Wyrm nova, the area fills in from the boss with a dashed ring at its edge (colour per power) and a "!" pops over its head with an overshoot then throbs. (Existing readability: per-strike red tighten ring, elite rings, moonlit silhouettes at night.)
- S5: hit feel — hitstop (sim runs at 6% for a few hundredths of a second; particles keep flying) on hero crits (0.035 s), elite kills (0.06 s) and ability casts (0.07 s), at most every 0.35 s, off in Reduced motion; crits also get a white impact ring. (Existing: enemy flash, knock-back recoil + springy squash, hit stars, damage numbers.) Probe: 59 hitstop samples over 25 s of a ch3 night, sim still advanced 24.3 s.
- R10: 🏅 Hero mastery (Heroes tab, under the selected hero) — three goals per hero: hold 60 nights, win 3 runs (counted from now on, older wins from history), use the ability 100 times. All three = Mastered: ability ×1.4 strength (damage; Overclock 7 s; Snare 40% longer; Sanctuary heals 40% more; Arrow Rain 42 arrows at normal strength; Call to Arms 6 militia) and 15% faster recharge. Balance bot/siege saves aren't mastered (unchanged). src/core/mastery.ts, tests/mastery.test.ts. PHASE 8 (Replay & endgame) COMPLETE.
- R9: 🗓️ Weekly Gauntlet (Battle tab, after ch3) — one fixed run per ISO week (same seed every attempt, so it can be learned): a cleared chapter (3–10 preferred), a daily-style twist and three forced Heats (their gold multiplier applies). First win of the week pays 500 + 150 per Heat; every run pays loot + 15/night. Best night and stars saved per week (card shows ★, 'Best: night N' or the prize). src/core/weekly.ts, tests/weekly.test.ts; daily twist application shared via applyTwist().
- R7: Hard and Nightmare change the rules, not just the numbers — Hard: 🌫️ foul weather 1.5× as likely (rain/fog/storm, capped at 85%); Nightmare: the same plus a 🌕 Blood Moon surge 10 s into every 3rd non-boss night (16 s: foes run/strike faster; red banner, existing red tint + sfx). New trophies Weathered (5 Hard clears, 600), Iron Campaign (all 10 on Hard, 1500), Moonstruck (3 Nightmare clears, 1200), Lord of Nightmares (all 10 on Nightmare, 3000); new flairs Iron Will (5 Hard clears; steel sparks) and Nightmare Crown (3 Nightmare clears; blood-iron crowns). Balance (48 runs): Normal untouched; ch3 L5 Hard 19% vs 21%, ch2 L8 Nightmare 67% vs 63%, ch6 L10 Hard 15% vs 25% (harder; optional mode, gold ×1.5). tests/hardRules.test.ts.
- R3: 🏗️ Building draft — when two or more building kinds would open on the same dawn (nights 3/4/5: forge·fortify·spikes, catapults·mage, hall·healer·watch), the pick screen first asks which to build first (green BUILDING cards with a one-line purpose, deal-in + chosen/passed beat); the others open next dawn; blessings follow. Max 3 options. Balance bot, dailies and Siege keep the fixed order (campsim identical: ch5 L3 48 runs 8% vs 8%). tests/draft.test.ts; fuzz/camp tests resolve the draft.
- R8: 🔥 Heat — six challenge toggles in the chapter sheet (once that chapter is cleared) and the Endless sheet, saved between runs: 🩸 Tough Hide (+30% HP, +25% gold), 💨 Swift Feet (+15% speed, +20%), 🧱 Brittle Walls (−30% wall HP, +20%), 🏚️ Lean Times (−40% income, +20%), 🎖️ Elite Blood (+10% elites, +25%), 🎲 No Second Chances (no rerolls, +10%); all six = gold ×2.20. Never on the daily, Boss Rush or Siege. Bonus paid on top of the run's gold and shown as its own '🔥 Heat bonus' row; nightfall toast lists the active heats. src/core/heat.ts, tests/heat.test.ts.
- R5: 🛒 Royal Bazaar (Heroes → Hero flair): five flairs bought with gold, two-tap buy, auto-wear — 🦋 Butterfly Escort 450 (three flapping butterflies looping round the hero, near half drawn in front), 🌈 Rainbow Trail 600 (rainbow unfurls over the head when standing, hue-cycling motes when walking), ⚡ Storm Crown 800 (two charged orbs at shoulder height with a jagged arc snapping between), 🌠 Starfall 1000 (four-pointed stars drift down and wink out), 🪙 Midas Steps 1500 (coins spinning on edge round the feet, coins flip up from each step). New drawFlairFront pass so flair parts can sit in front of the hero. tests/bazaar.test.ts.
- R4: 👑 Ascension — once every Armory upgrade (capstone too) is MAX, the Armory shows a glowing Ascend card (two-tap confirm): all upgrades reset to 0, gold kept, +1 Crown (max 10). Each Crown: +6% hero/tower damage and wall HP, +10% coins & income, forever; upgrade prices +30% per Crown (a real gold sink again). Crown drop celebration (rays, squash-and-settle drop, pop-in text). Crowns in the hub header. tests/ascend.test.ts.
- R2 slice 2: daytime visitors on ~30% of days (hashed; never dailies/Siege/Boss Rush or before the final night; the balance bot never triggers them) at the road above the hall: ⛩️ Cursed Shrine (rises from the ground with a dust ring; stand 1.3 s — a hold ring fills — to accept: tonight is an Elite Raid, dawn pays the elite bonus and the next pick adds a ✨ rule card) and 🛒 Wandering Merchant (cart rolls in with turning wheels and an overshoot settle, the hooded trader waves you over; sign shows the blessing + price, stand to pay coin by coin with a progress bar, SOLD! stamp + gold burst). Both leave at nightfall (cart rolls off / shrine sinks). src/camp/visitors.ts, tests/visitors.test.ts.
- R2 slice 1: Night events — 25% of eligible nights (≥3, not boss/breather/final, never dailies/Siege/Boss Rush; hashed from seed+wave so the run RNG is untouched): 💰 Treasure Night (double kill gold, a guaranteed treasure goblin, gold motes in the dark) and 🐀 Swarm Night (each foe comes as a half-HP pair; dust along the treeline). Banner subtitle + icon on the night counter + hero quip. Elite Raid tested as a random event: ch10 L8 15%→6–10% for the bot, so it becomes the opt-in Cursed Shrine (next). Balance (96 runs): ch8 L5 13% vs 13%, ch10 L8 18% vs 17%. Tests: tests/nightEvents.test.ts.
- R1: Rule cards — every 3rd night (not dailies) the pick adds a 4th, wide ✨ RULE CARD: Ricochet, Thorn Walls, Wildfire (needs Fire Arrows), Culling Blade, Rallying Banner (dashed reach ring around the hero), Golden Volley; rule combos Storm of Blades (Ricochet + Split Shot) and Iron Maiden (Thorns + Thick Timber). Each fires a visible flourish (`rule` events). Kept out of the regular 3 so stat picks aren't diluted. Balance: campsim ch5 L3 48 runs 4% vs 4%; ch10 L8 96 runs 17% vs 19% (noise); siegesim unchanged. Tests: tests/rules.test.ts.
- R6: 🎯 Next goals card on the Battle tab (core/goals.ts + tests): chapter to clear / stars to finish first, then the nearest unearned trophies (max 2), next skill point, next Endless milestone; each row shows progress + reward and taps through (play chapter / open tab).
- S1+S2: Settings → ✨ Graphics (Auto / Smooth / Pretty; tap cycles; picking Auto clears a remembered low tier) and 📈 Show FPS (battle readout: fps + tier). Also in the pause menu.
- Ability-ready pulse: static glow, scale-only animation (the animated box-shadow repainted the button every frame during play).
- Drag responsiveness: canvas rect measured once per touch instead of every pointermove (no forced layout mid-drag on busy nights).
- Lag emergency (Nov 21): adaptive quality tiers (density 2/1.5/1.25/1×, washes/twinkles/glows/particle caps drop per tier), phones start at tier 1, 1 s step-down window, long stalls ignored, tier remembered across launches; night layer at 0.34× res from tier 1. Ch6 boss-night bench: tier0 29.7 → tier1 15.7 → tier3 9.6 ms/frame.
- "How to play" covers the carry chain: logs are picked up at the Lumber Camp's pile, and the Forge turns logs into bows you carry to towers (+6% damage each) — neither was mentioned.
- Loading a save code asks first: the first tap on Load shows what's in the code next to your current progress (★ · gold · runs) and turns the button into "⚠️ Replace my progress"; only the second tap replaces it (pasting an older backup by mistake used to wipe newer progress at once). Bad codes still get "That doesn't look like a Last Gate save code."
- Heroes tab: newly unlocked heroes appear right under the hero you play (above the skill tree). The tab's NEW badge led to heroes buried below the whole skill grid — about 1.5 screens down on an iPhone SE. Also checked with real taps: Armory purchase (gold −40, card updates, one tap), Royal Gift (+60, "come back tomorrow"), switching heroes.
- Siege Lord starts fast: the castle's ~20 s opening build was dead time for the attacker (dimmed cards, frozen chest, "Attack in 20s"). The defenders are now fast-forwarded through it at siege start (same bot, same steps → same castle and balance; its events are dropped so nothing floods) and you get a 5 s countdown. Found in a first-time-player run of Siege 1.
- Toasts drop below the boss bar while a boss is up ("New in the Bestiary: …" sat right on top of it). Boss sweep, chapters 1–10 (boss nights forced, bars + phase 2 at 40% HP): no errors, names and bars readable.
- Siege Lord: no danger heartbeat when the castle's hall drops under 30% (that's the attacker's good news). Audit of other castle-side cues: campaign banners/stats already skipped in sieges; wall-break and hit buzzes read fine as the attacker's impact feedback; the defender's "Hold the line!" speech stays as an enemy taunt.
- Siege Lord sounds are on your side: taking the hall played the DEFEAT sound and the castle holding played the victory fanfare (the sim's "lost"/"won" are the castle's) — swapped for the attacker, with the win buzz. The castle's own feel-good sounds (its coin pickups/payments, "built!" chime + buzz, level-ups, ability-ready chime) no longer play for the attacker.
- Siege Lord loss panel ("The castle held") gives one tip from the run: chest sat full >25 s → keep sending; no wall broken → Rams/Sappers behind Shields; breached but hall above half → pour through before the castle repairs; close → mix in flyers and Diggers. Also on Daily Siege losses.
- Defeat tips only suggest buildings you could have built: a night-1 loss said "Build the Lumber Camp early" while it was still locked. Locked Lumber Camp / Fortify / Barracks are skipped, early losses get the basics ("Build Archer Towers by the wall before nightfall…"), and "towers to level 3+" waits until logs are possible (else "upgrade your towers").
- Card captions read right: plural cards get plural verbs ("Ravens — fly over the wall, dive at towers"), and the Sapper no longer says "explodes on the wall, smashes the wall" (also fixes its new-enemy banner).
- Siege Lord says what the picked card does: a caption above the war chest, in the Bestiary's words ("Imps — flies over the wall, sets buildings ablaze", "Knights — armoured", "Footmen — steady infantry"), so Sapper vs Diggers vs Ravens is no longer guesswork. Fits on iPhone SE.
- Siege Lord tells you about the repair lull: the push pill reads "🔨 Repairs · PUSH n/8 · Ns" during the first 8 s of a push while the wall is damaged, and a mid-push breach adds "Open till the next push" under WALL DOWN! (fits on iPhone SE).
- Siege Lord: a breach you open now stays open for the rest of that push — the castle only repairs in the first 8 s of each push (REVERSE.repairLull), and its bot no longer waits at the Repair plot mid-push. (It used to mend a breach almost at once whenever it had coins.) Retuned to keep the difficulty: Frost Citadel hordeHp 0.99, Hollow Keep 0.96 → 1, Alchemist 1.08 → 1.01. siegesim (32 runs): 100/100/100/66/28/47% (target 100/100/100/63/25/50). Campaign untouched (rule only applies in Siege Lord).
- Preload also covers foes the sim spawns outside the wave lists — the goblin thief, split-offs (mob → goblins) and boss-summoned minions — so they get their off-thread half sheet and calm-frame warm-up too (the thief was the last sheet built mid-fight). Campaign 150 s runs: 0 and 4 frames >50 ms. Debug hook __atlases() shows each sheet's state.
- Hitch-free first appearances: profiling a real siege traced the remaining 60–110 ms frames to the first draw (texture upload) of each character sheet. Sheets a run will use are now pre-drawn one per calm frame (build phase / near-empty field) at 2×2 px, nearly transparent. Siege A/B (2 real runs each): >50 ms frames 8 → 1 (770 → 51 ms). Campaign 150 s run: 3 (was 9–20 before today's two fixes).
- Fewer hitches when a new kind of foe appears: a full real chapter 1 run (won, no errors) logged 70–110 ms frames; profiling traced them to the first high-quality downscale of a 3.5k character sheet inside a frame. Sheets a run needs now build their half-size copy off the main thread (createImageBitmap resize) right after decoding, during the build phase. A/B over two 150 s runs each: >50 ms frames 20 → 9 (total 1581 → 785 ms). Remaining one-off hitches: the castle sprite and the lumberjack on first draw.
- "What's new" card describes Siege Lord as it plays now (flipped view, drag a card onto a lane) and mentions the phone polish; it still said "send units down 3 lanes". Checked fine, no change: auto-pause + audio suspend + save on app switch, auto-pause when turned sideways ("Turn your phone upright"), the game starts and plays with storage throwing (private mode / quota), standalone app stays inside the safe area.
- The hero no longer vanishes behind the gate: standing in the open gate (it's walkable), they sorted behind the gate boards — only the coin stack showed (seen on a chapter 8 night). Inside the gate's depth they now draw in front of the wall. Night readability on chapter 8 otherwise fine (labels, coins, damage numbers).
- Siege Lord pause button (27×27 on iPhone SE) gets the same bigger invisible tap area; siege cards measured 42×37 (fine). Full siege flow (pause → resume → win → retry → lose) re-checked with real taps.
- Bigger invisible hit areas on small phones, same look: touch-target audit on iPhone SE found the in-game ▶/II/🔊 buttons at 24×24, hub tabs 24 tall, the gear 26×26, claim buttons 24 tall and "Reset progress" 12 tall — each now has a transparent ::after extending its tap area (kept clear of neighbours). Real-tap audit still clean on every screen.
- Volume sliders are easier to grab: the touch target was 14 px tall on iPhone SE (a finger slightly off missed it) — now 24 px with the same look, and dragging no longer lets the panel scroll. Checked with a finger-style drag: 80% → 17%, saved, panel stays open.
- Long-session memory (4 min autoplay, chapter 5): JS heap flat at 14 MB, renderer maps all bounded — but canvases kept climbing (50 → 110 MB) as the crisp frame cache filled to 1500. Cap now 800 (canvases level off ~88 MB; rebuilds per minute unchanged), and the prop cache is bounded (300). iOS caps total canvas memory, so this matters on long nights.
- The in-game "Reduced motion" setting now also quiets the menus (pulsing buttons, sliding panels, confetti) — before, those only stopped when the phone's own Reduce Motion was on; it only removed shake/slow-mo in battle. Also checked: trophy claim with a real tap (+100 gold, badge clears).
- No tutorial tip while the hero is down ("Drag anywhere to walk" sat over the grey respawn screen); it returns when he rises. Death → respawn otherwise checked: "You fell!" banner, "Respawning in N" chip, rise at the hall.
- The carry chain is explained once: one-time hints when you first carry logs to a built Forge ("walk your logs past the Forge to feed it") and when its first bows are ready ("pick them up and walk past your towers, +6% damage each"), alongside the log-pile hint (shared oneTip helper, each shows once ever).
- New-enemy banners say what the foe does: "New enemy: War Raven — flies over the wall, dives at towers" (first two Bestiary traits). Brute and Battering Ram gained traits ("tough", "smashes the wall") so every introduced foe has one.
- One-time hint the first time logs pile up at the Lumber Camp while your pockets are empty: "walk over to pick them up" (nothing told new players the pile must be collected). Memory audit (chapter 5 night): live canvases 58 MB — terrain 18.5, crisp frame cache 17 (cap 1500 ≈ 43), half sheets 12 — nothing else large.
- Lighter ground: the baked terrain canvas was 2.5 px/world unit (36 MB of canvas) though the renderer caps at 2× density (~1.7 px/unit on phones) — now 1.8 (18.5 MB), and the 11 painted grounds re-encoded to match (13.5 → 7.8 MB total; chapter 1 1.7 → 0.93 MB). Side-by-side screenshots on iPhone 13: no visible difference. scripts/gen_terrain.py K updated.
- Faster, lighter first load: the title screen downloaded all 15 character animation sheets (~8 MB, ~190 MB decoded) — now only the 8 core ones; each run preloads its own chapter's foes and bosses during the build phase (Siege Lord: every war card; Endless/Boss Rush: all). First load 11.9 → 8.7 MB.
- Siege Lord: your walkers no longer "fight" the defending hero through a standing wall (they batter the wall instead; a breach still lets them at him). Also restores siege balance that the build-pause change had quietly shifted (the defending bot now spends without the pause; it's a player-finger fix). siegesim 16 runs: 100/100/63/25/50% (was 100/100/63/19/50 this morning; with the pause on the bot it had fallen to S4 25%, S5 0%). Campaign unchanged (through-the-wall rule kept Siege-only: in the campaign it moved ch10 bot wins 31→6%).
- FIX: the victory confetti layer covered the whole result panel and swallowed taps on "Next" / "Upgrades & map" / "Play again" (`#ui .overlay *` re-enabled pointer events on it, beating `.confetti { pointer-events: none }`). Decorations inside overlays (confetti, end hero, embers, floating gains, hall ticks, fly coins) now opt out explicitly; a test guards the rule. Found by a real-tap chapter 1 → chapter 2 check.
- Building no longer silently drains your purse: when a plot finishes a level, standing on it waits 1.1 s (the BUILT! pop lands, you can step off) before paying into the next level, and the pay ramp restarts slow. Found in a fresh-save chapter 1 playthrough (building the first tower spent all 19 coins into Lv2). campsim (16 runs) ch1 L0 100→94%, ch3 L1 0→13%, ch5 L3 0→0%, ch8 L5 0→6%, ch10 L8 19→31% (the bot spreads coins better too).
- Lag pass 2 (spikes): character sheets are decoded off the main thread before first use (img.decode) instead of on the first drawImage mid-battle; hit flashes use small per-cell white silhouettes (LRU 60) instead of a full-sheet copy (~14 MB canvas per character, built on the first hit). Profiling notes: in steady play draw is ~5 ms/frame at 1x (30–45 ms at 4x throttle); the remaining cost is raster, not JS; a deferred half-sheet build was tried and reverted (worse).
- Siege Lord: world-pinned weather and day-life effects (pond rain rings, puddles, lightning targets, crystal glints, clouds, gusts, butterflies) map through the flipped, zoomed view.
- Siege Lord flow: the finished siege stays on screen (flipped, effects settling) behind the result panel instead of jumping to the menu backdrop; pause panel speaks the attacker's language (siege name, push n/8, sent, broken, hall %, "Withdraw"); the defender's tower-range preview no longer shows on the attacker's field.
- Breached wall segments now read at a glance: scorched scar, jagged torn stumps (stone chunks for stone walls) and debris thrown inward, instead of a few faint brown dashes (both the defender and Siege Lord views).
- Siege Lord: rock-steady attacker camera (no drift under your finger while dragging; leans in only once units breach); torch-bearers' torches, coin glints and dropped fires placed correctly in the flipped view.
- Siege Lord: flyers (bats/ravens/imps) visible in the flipped view; castle-side popups (BUILT!, TO ARMS!, combos, level-ups) hidden for the attacker; lane chevrons fade while dragging.
- Siege Lord clarity: the push pill says "⚔️ Attack in 20s" before the first push and "🔨 Castle rebuilds · 12s" between pushes; the War Chest shows "+4/s" and glows "FULL" when income is going to waste; cards you can't afford yet fill from the bottom toward their cost. Fixed: starting a siege toasted every unclaimed trophy (a whole column of them). Hints now explain drag-and-drop.
- Siege Lord impact: when your horde breaks a wall section there's a big gold "WALL DOWN! +10" call-out, a heavier jolt, and the bounty's coins arc from the rubble into the War Chest meter (which pops); the castle's hall bar jolts and flashes each time your units hit the hall. The defender's red low-hall screen alarm no longer shows for the attacker, and the breach toast is gone (the call-out replaces it).
- Siege Lord drag-and-drop (owner's idea): drag a unit card onto the field — its portrait follows your finger, dashed outlines split the field into the three drop zones (from your edge up to the wall), the zone under your finger fills gold, and letting go drops the group there; dropping back on the deck cancels. Tap-a-card-then-tap-the-field still works.
- Side mini-games switched OFF (owner: "the current mini games are really trash — keep the battle siege and perfect that"): SIDE_GAMES_ENABLED=false in src/core/features.ts hides the 9 map side stops, the 🎪 Fair tile, the side-games records, their achievements, the Fairground flair and the mini-game quests. Saved progress for them is untouched (flip the switch to restore). Focus is now Siege Lord + the core game.
- SIEGE LORD REWORK pt 1 (user: "the screen should flip so it feels like I'm really attacking… the game is very finicky"): (1) Flipped view — the castle sits at the top and your horde marches UP from the bottom: the world is drawn mirrored, every object/label upright about its own base, depth order reversed, particles and damage numbers rise the right way, night light pools and wall torches follow the flip. (2) Zoomed out (0.8) and centred so all three lanes are always on screen. (3) Controls: no more Left/Middle/Right buttons over the field — tap anywhere on the field and the picked card goes up the lane under your finger; the picked card stays picked (Footmen picked at start), so repeated taps keep sending; lane chevrons at the horde's edge pulse until the first send and flash on each send; a card you can't afford shakes (+ deny sound). (4) The castle's own clutter is hidden for the attacker (price plates, captions, the defender's coin pops, level-up popups, threat arrows, kill streak). Sim untouched (siege balance unchanged).
- PERF: the in-run HUD rewrote ~10 DOM values every frame even when unchanged (XP bar width, level/bow text, ability fill, boss bar, pill visibility) — each write invalidates style/layout on iOS. Now written only on change (setText/setDisplay helpers; bar widths rounded to 0.1%). JS draw time measured at ~6–7 ms median (p95 9–11 ms) with 20 foes.
- PERF (user: "sometimes I sense a lag"): (1) the crisp-frame cache ran a per-pixel unsharp mask via getImageData for every new frame/size — ~19 builds/s in a normal wave, and getImageData forces a GPU→CPU readback on iPhones; removed (no visible difference in side-by-side shots), build budget 4 → 2 ms/frame, sizes snap to ~3% steps so similar enemies share frames. (2) Canvas density capped at 2× instead of 3× (3× drew 2.25× the pixels for no visible gain) and the adaptive step-down now triggers below ~40 fps instead of 24. 4× CPU throttle, ch5 wave: median 83 → 50 ms, p90 150 → 83, max 350 → 183.
- Endless scenery rotation: each week Endless is fought on a different cleared chapter's ground, props and lighting (looks only — waves, bosses, weather and records unchanged); the Endless card names "This week's battlefield". endlessSceneryFor + test.
- Mason's Tower sounds: a stone thud for a cut drop, a clean seat + chime for a perfect one (new sfx.mini kinds). Smoke sweep with all 9 side games + daily, Endless, Boss Rush, Siege 5: no page errors.
- Mason's Tower (9th side game, after chapter 7): a stone block slides on a crane rope — tap to drop it on the tower; the overhang breaks off and tumbles, a near-perfect drop keeps the width (a streak of 3+ grows it back); the camera rises with the tower and the sky darkens to stars; 60 s or until a block misses. Stars 60/130/220 (masonsim: ±0.04 s ≈ 2★), gold = score. Master Mason achievement; Champion of the Fair now 27 stars; Fair rotation from Nov 22; Trophies grid; What's-new.
- Fixed: the Royal Forge's Master Smith shared the id "smith" with Blacksmith (claiming one claimed both) — now "forgemaster", with a test that achievement ids are unique. Every hero now has an ability achievement: Storm of Arrows (King), Bulwark (Knight), Inferno (Pyromancer), Clockwork (Engineer) — 50 casts each, counted from the ability event (ab_<ability> stats).
- Boss Rush now follows the difficulty picker: Hard after a Normal clear, Nightmare after Hard (it always played Normal). The card shows "💀 Plays on Hard" / the lock reason and the best difficulty cleared; new achievement Unbroken Crown (Boss Rush on Nightmare, 1500). campsim gained a difficulty argument: Boss Rush L10 75% / 33% / 0% (Nightmare is 0% for the bot on every chapter).
- Perf: trail flairs shed particles at 0.06 s instead of 0.035 s. At 4× CPU throttle in chapter 10, Grave Wisps cost a full frame (66 vs 50 ms median); now back to 50 ms. The Alchemist (sprite + flask) costs nothing measurable; the acid pool gradient only exists for 5 s per cast.
- The Alchemist carries a glowing green flask in his free hand in battle, so he no longer reads as a green Pyromancer.
- What's-new card tightened: the Nov 21 "since you were here" card went from 13 lines to 6 grouped ones (chapter 10 + Boss Rush, two heroes + looks, five mini-games, Siege Lord, Shadowstalker, Royal Gift); the full card now says 6 sieges + Daily Siege and points at the Fair tile.
- Quests: daily "Win today's Daily Siege" (from Nov 27) and weekly "Win 4 Daily Sieges this week" (from the week of Dec 14), both only once Siege 1 is taken; earlier days/weeks keep their picks (diffed and tested). Checked: Endless milestones already continue every 5 nights uncapped, and Scholar of War counts every foe kind (now 31) automatically.
- Flair: Toxic Bubbles (lime bubble trail + green pool) — win a run with the Alchemist.
- Siege Lord tile reads "🗓️ Daily open" while today's Daily Siege prize is waiting; achievement Raider of the Realm (win 7 Daily Sieges, 500).
- Daily Siege (Siege Lord sheet, after Siege 1): a castle picked from the date — a chapter you've cleared as the ground, any hero defending, walls ≈0.6 per chapter (a level lower some days; King −1, Pyromancer/Alchemist −2 — they wipe packed pushes in siegesim) — first win of the day pays +250 gold (stats.dsiegeDay/dsiegeWins). No stars or cards; result panel shows the prize. src/core/dailySiege.ts + tests.
- Scouts report / next-wave preview: Tunneler and Banner-bearer use painted portraits; War Raven and Fire Imp show their Bestiary emoji (they used to fall back to a drawn footman).
- Siege Master achievement (all 18 Siege Lord stars, 1200 gold; Conqueror now reads "first three sieges"). The in-run next-wave preview and scouts report show the Shadowstalker's portrait (it fell back to a drawn figure).
- Siege 6: The Alchemist's Tower (Bloodmoon Moors ground, needs ch10 + Siege 5). The Alchemist's acid shreds clumped pushes (siegesim: 0% at L10 vs the Marshal's 63%), so the walls are L8 and the horde 8% tougher → 47% bot wins (32 runs). Prize: Stalkers ×2 war card (cost 6). Achievement Towerfall (900); Siege Lord stars now x/18.
- Achievement Brewmaster: splash 200 foes with the Alchemist's Acid Flask (300 gold; acidSplash events now count foes hit). Smoke sweep after the big batch (8 side games, daily, Endless, Boss Rush, Siege 5): no page errors.
- 9th hero: The Alchemist (28★). Passive: foes drop 15% more coins. Acid Flask (18 s): lobbed at the foe with the most ground foes around it; a 95-radius pool for 5 s deals 2.6× hero damage/s and foes inside take 25% more damage from everything. Art: the mage recoloured forest green (hue shift only) + portrait + Veteran look; flask arc, bubbling pool, splash fx and sounds; bot casts it with ≥6 ground foes up. campsim ch8 L10 (20 runs): Alchemist 75% vs Marshal 55%, Pyromancer 80% (first pass at 1.6×/85 radius was 35%). Joins the daily hero pool from Dec 3 (earlier days unchanged, tested). Also fixed: the mage's Veteran sprite now sways as a robe.
- The King's Veteran look: the Crimson King (black, crimson and gold), recoloured from both animation sheets (front + back view); the vet sheets load only when first worn. All 8 heroes now have a Veteran look.
- Veteran looks: every painted hero (not the King) unlocks a violet-and-gold outfit after 25 nights with them (the Cleric gets Golden robes); toggle under the picked hero on the Heroes tab ("Tap to wear" / "Wearing ✓" / "12 / 25 nights"). Sprites are smooth gradient-map recolours (charcoal → violet → gold, warm skin/wood kept); choice stored in stats.look_<hero>; camp heroVet picks `<sprite>_vet`. Test for unlock/round-trip/setup.
- New foe: the Shadowstalker (chapters 7–10 + Endless; intro night 6 of ch7) — every 3.8 s out in the field it blinks 64 px toward the wall (not while stunned/snared, never through the wall); HP 32. Shadow-violet recolour of the wraith with glowing eyes + portrait, violet halo, blink puff fx + sound, Bestiary trait "blinks forward". campsim L10 (40 runs ch10): first pass 25% → 15%, so ch10 uses a lighter share (now 25%); ch7 75%, ch8 79%, ch9 58% (24 runs).
- What's-new card now lists all 8 mini-games (it still said 6) plus the Royal Gift, without repeating lines on the Nov 21 card; Bell Tower's map stop nudged up so its label no longer touches The Last Gate pin.
- Side games started from the Fair sheet return to the sheet on "Back to the map" (started from the map, they still return to the map). Smoke sweep: all 8 side games, a daily, Endless, Boss Rush and Siege 5 with the new cards — no page errors.
- Battle tab: a 4th mode tile, 🎪 Fair (mini-game stars x/24), opens a sheet listing all 8 side games in unlock order — best score, stars, today's 2× GOLD flag and PLAY for open ones, "Clear chapter N to open" for the rest. The side-game table moved into hub.sideGames() (shared by the map and the sheet).
- Bell Tower (8th side game, after chapter 5): four bells ring a tune — ring it back in order; each tune you get adds a note and plays faster; a wrong bell cracks the tower and replays the tune (3 cracks end it); 90 s. Each bell has its own pitch (sfx.bell). Stars 110/230/350 (bellsim: remembering ~7 notes ≈ 1★, ~9 ≈ 2★, 12 ≈ 3★), gold score/2. Achievement Bellringer; Champion of the Fair now 24 stars; Fair day rotation from Nov 21; Trophies grid; What's-new line.
- Endless: two new weekly twists — Legion Week 🛡️ (soldiers & militia +70%, foes +15% HP) and Swift Week 💨 (hero +30% speed, +20% fire rate, foes +15% HP); twists now use a `since` date and can carry any run mods. Every week until they arrive is unchanged (tested); with the rotation they first come up the weeks of Feb 1 and Feb 8.
- Siege Lord: two new war cards — Shaman (heals the horde around it, cost 7, unlocked by winning Siege 4) and Black Knights ×2 (armoured, cost 8, unlocked by winning Siege 5, for replays). siegesim ch10 L10: cost 6 Shaman pushed Siege 5 from ~50% to 80% bot wins, so it costs 7 (bot 20–33% when cycling it evenly — a deliberate pick, not a free win). The card bar now lays out as two even rows (7+6) on phones.
- Four new daily twists from Nov 27 (earlier days keep theirs, tested): Swift Feet (hero +40% speed, +25% fire rate; foes +25% HP), Long Shots (towers +35% range, −20% fire rate), Rally Day (soldiers & militia +80%; hero −25%), Tax Day (double hall income, −40% drops). Twists can now carry any run-mod multipliers (`mods`).
- Royal Forge sound: strikes clang like hammer on steel, a perfect strike rings the anvil out, and a finished blade chimes. The Forge sits in unlock order in the Trophies side-games grid.
- Royal Forge (7th side game, after chapter 3): a marker sweeps the anvil bar — tap in the hot zone to strike, dead centre is perfect; 5 strikes forge a blade (+10, +10 more if flawless); zone narrows and speeds up over 60 s; 3 misses crack the anvil. Stars 250/450/650 (forgesim: ±40 ms timing ≈ 2–3★), gold score/4. Achievement Master Smith; Champion of the Fair now 21 stars; joins the Fair day rotation from Nov 21 (earlier days unchanged, tested); Trophies grid; What's-new line.
- Three new hero flairs: Fairground Lights (confetti trail, 9 mini-game stars), Warlord's Smoke (red-black embers, take the Hollow Keep), Royal Crown (three gold crowns circling the hero's feet, Royal Gift 7 days in a row). Battle tab shows a 🎁 badge while today's gift is unopened.
- Royal Gift: a chest at the top of the Battle tab opens once a day for gold on a 7-day ladder (60 → 350, a missed day restarts it); coins fly to the counter; achievement Loyal Subject (7 days in a row, 300); What's-new line. Lives in save stats (giftDay/giftStreak/giftBest/gifts) so no save-format change.
- Heroes tab: opening it with a later hero picked (e.g. the Marshal) scrolls straight to their card and skill tree instead of the top of the list.
- Trophies tab: claimed achievements fold into a "▸ ✔ Claimed (n)" toggle at the bottom, so the goals still open come first.
- Achievements Iron Crown (clear chapter 10 on Hard, 800) and Nightmare's End (on Nightmare, 1500). The Endless tile shows your record plus this week's twist icon ("Night 14 · 👑").
- Map quick-jump: the "N / 10 chapters cleared · ⬇ next" counter at the top of the map is a button that smooth-scrolls back down to your next stop.
- Nov 21 What's-new card: a line pointing at the new modes row above the map.
- Battle tab: Siege Lord, Endless and Boss Rush are now one compact row of three tiles above the map (icon, name, key stat, NEW! badge; locked tiles shake) — each opens its full card in a sheet. On an iPhone SE the map now starts about two big cards higher.
- Ghost Lanterns: wraith/lantern glows pre-rendered once instead of a radial gradient per wraith per frame. Mini-game perf at 4× throttle: the other five hold 16.7 ms; Lanterns 33 ms, and a profile shows 94% raster (software compositing of the light pools/fog) with the game code ~2% — fine on a phone GPU, left as is.
- Ghost Lanterns polish: a cold glow around each wraith, a curl of smoke when a lantern goes dark; the Nov 21 What's-new card now counts 6 mini-games.
- Ghost Lanterns (mini-game #6): 🏮 side stop beside chapter 10 (opens after chapter 10). Four lanterns burn down along the wall while wraiths drift toward them — tap a wraith to banish it (more points close to the lantern, combos ×2/×3), tap a lantern to refill it (+1 if it was low). A wraith that reaches a lantern snuffs it; all dark = over; 60 s. Stars 150/280/420, gold score/3. Fair day, achievement Lamplighter, Champion of the Fair now 18 stars (800), Trophies grid, save round-trip test. scripts/lanternsim.ts: perfect bot ~460; 0.7 s reactions lose.
- Save audit: a round-trip test (tests/saveRoundtrip.test.ts) sets every newer field — chapter 10 + Boss Rush stars/best, the Marshal + his skills, Grave Wisps, all mini-game/siege records, new stats, achievements, side-game quests — and checks sanitizeSave keeps them all. Everything else was already kept; only Boss Rush had been dropped (fixed in cb30a28).
- BUG FIX: Boss Rush stars and best night were dropped on every reload (sanitizeSave only kept campaign chapter ids + Endless best) — chapter 98 is now kept (test). Trophies side-games grid shows Boss Rush bosses beaten. Test for the siege horde-HP handicap.
- Siege Lord siege 5: "The Hollow Keep" on chapter 10's night ground (opens after siege 4 + chapter 10): max-level walls under the Marshal (who calls militia against you), horde units at 0.96× HP (new SIEGES.hordeHp → CampSetup.hordeHp → ReverseState.hordeHp; siegesim takes a 7th arg). siegesim ch10 L10 won-4 marshal: 55% (without the handicap 75%; 0.8× → 0% — very steep). Achievement Breaker of Thrones (800).
- Boss Rush finale is now the Hollow King (was the Blood Moon Warlord): campsim ch98 L10 80% → 70%. Card + What's-new text updated. Chapter 10 autoplay sweep (Marshal, King): no errors.
- Bestiary: the Hollow King's tile and entry use his painted portrait.
- Hero flair 👻 Grave Wisps (clear chapter 10): a pale-violet pool and lilac wisps rising as the hero walks (a few while standing).
- Chapter 10 follow-ups: Hollow King painted portrait (recoloured boss portrait) on the boss bar; he joins the Endless boss rotation (last, so only night 60+ changes); chapter 10 on the Nov 21 What's-new card.
- The Hollow King's own look: anim/hollowking_anim.webp = the boss sheet recoloured with numpy (warm skin → pale lilac-grey, browns/reds → deep violet; full walk/attack/hit/death frames).
- Chapter 10: The Hollow Throne (new finale after Bloodmoon Moors). A starless keep at night (ground_10 = ch4's night ground recoloured violet-slate with PIL; gravestone props; mist and night lighting shared with mood 4); wraiths every night; Warlord mid-boss; finale boss The Hollow King (3800 HP, armoured summoner of wraiths/knights; phase 2 "Grave Rise": every 11 s, 3 wraiths claw up ahead of the wall; violet aura). Tolling-bell fanfare, violet confetti, achievements Uncrowned + Lord of the Hollow Throne. campsim ch10 L10: 33% (ch9: 25%). Follow-up: unique Hollow King art (still the shared boss body).
- Endless twist #9 "Warlords' Week" (from Mon 7 Dec): a boss every 3rd night instead of every 5th · coins +25%. Engine: ChapterDef.bossEvery (endless waves). Twist picks diffed for Oct–Dec: only weeks from 7 Dec change.
- Siege Lord sheet: each unwon siege shows the war card its first win opens ("🃏 Win to unlock: Diggers"); card names now match the deck everywhere (CARD_NAME exported).
- Side-game weekly quests (from the week of Mon 2026-12-07): "Earn 6 new mini-game stars this week" (stat miniStars) and "Send 250 units in Siege Lord this week". Earlier weeks keep their pick (test). Coin/hall walking: already solved by the Royal courier (hall income flies to the King).
- Side-game daily quests (from 2026-11-21, once chapter 1 is cleared): "Finish 2 mini-game rounds" (stat miniPlays) and "Send 30 units in Siege Lord" (stat deployed). Earlier days keep their picks (test). Marshal skill tree: generic tree already fits (Rally Cry boosts militia).
- The Marshal's militia are drawn in his red-and-gold (not as blue barracks knights) and fade out as they march off.
- What's-new card for 2026-11-21 (from 00:00 UTC): Boss Rush, the Marshal, Dragon Dodge + Catapult Toss, Siege 4 and the perf work for players who saw the Nov 20 card; others get the Nov 20 list plus a Boss Rush/Marshal line.
- Marshal follow-ups: achievement Raise the Levy (call 100 militia, 300 gold; stat levied), war-drum horn sfx + buzz on Call to Arms, joins the daily hero pool from 2026-11-26 (daily output diffed for 60 days: only dates ≥ 11-26 change).
- 8th hero: The Marshal (25★) — Call to Arms: 4 militia fall in around him for 12 s (fight anything inside the walls or at the gate; no respawn); passive: soldiers +25% HP. Art: the swordsman recoloured crimson and gold with PIL (units/marshal.png + portrait). campsim ch7 L10: 58% (mid-pack). Test: summon count + march-off after 12 s.
- Boss Rush results: "Bosses slain: N/10" on a loss, "Kingslayer!" on a clear; one-time 🔓 NEW! ribbon on the card. Autoplay sweep of Boss Rush: no errors.
- Boss Rush banner: each night opens with "👑 Boss N/10" and the boss's name; the tenth is "👑 THE LAST BOSS".
- Boss Rush (new mode, opens after chapter 5): ten nights, a boss every night in campaign order (Ogre → Blood Moon Warlord) with nasty escorts (sappers, rams, tunnelers, ravens, imps). Always Normal, pays like chapter 6, its stars don't count toward the campaign total; achievement Kingslayer (800). Engine: ChapterDef.budgetMult (escort budget); the camp sim's CAMP_CHAPTER_HP needed an entry (98: 2.3) — without it the mode played at chapter-1 strength (100% bot wins at any level). campsim ch98: L10 80%, L6 50%; ch9 L10 is 25% for reference. Main-campaign profile at 4× throttle: no cheap win (crisp cache warming normally, ~106 ctx.save/frame; most time is raster).
- Perf (menus): (1) adaptive quality now samples only real play — sitting in the menu on a slow phone used to step the battle's pixel density down for good (iPhone 13 at 4× throttle: menu dropped it 3→1.5 before a run started); (2) the attract backdrop paces itself from its own work time: every 2nd/4th frame and a capped catch-up when slow. Menu at 4× throttle: median frame 83 ms → 16.7 ms; battle keeps density 3. Fast devices unchanged.
- Dragon Dodge polish: embers fly out of each fire burst (fixed per-blast directions, no randomness), the dragon roars when it draws breath for a row, and the King bobs and sways while running.
- Perf: the attract-mode camp (bot battle behind the menus) no longer simulates and draws while a full-screen mini-game is open. iPhone 13 profile at 4× CPU throttle: mini-games went from 15–20 fps (median 50–67 ms) to a steady 60 fps (16.7 ms).
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

## Investigated, not shipped
- (Nov 21) S4: coins drawn from 24 pre-rendered spin frames (8× sprites) instead of per-coin gradients — headless A/B with 118 coins at tier 1: 26.5 vs 23.6 ms/frame (no gain) — reverted. Glow/particle/twinkle caps already come from the quality tiers.
- (Nov 21) Warm night light pools into a low-res layer + one bounded blit at tier 1: headless A/B 15.8 vs 15.7 ms/frame (no gain; GPU fill win unproven) — reverted.
- Campaign walkers hitting the hero through a standing wall (fixed in Siege Lord only): enabling the same rule in the campaign is neutral for chapters 1–8 (campsim 16 runs 100/6/6/6) but makes chapter 10 harder (32 runs: 25% → 13%, losses pile up on the final night). No clean compensation without a new mechanic or a global wall buff that would soften chapters 1–8, so the campaign keeps today's behaviour.

## Self-reviews
- 20:32 Nov 20 — Deploys 366–369 all green. Hour's work: Heroes tab shows newly unlocked heroes right under yours (the NEW badge led to heroes ~1.5 screens below the skill tree on SE); Load save code shows the code's ★/gold/runs next to yours and needs a second tap before replacing; checked fine with real taps: Armory purchase, Royal Gift, hero switch, quest claim (+gold, ✓, badge). Investigated and NOT shipped: blocking through-wall hits in the campaign (ch10 25% → 13%; no clean compensation). Audits are now mostly coming back clean — the remaining known gaps are device-only (perf numbers, audio by ear).
- 19:37 Nov 20 — Deploys 363–365 all green. Hour's work: boss sweeps (mid + final bosses, ch1–10: no errors, bars/phase 2 readable) → toasts drop below the boss bar; first-time-player run of Siege Lord → the castle's 20 s opening build is fast-forwarded (same bot steps, same balance) so you start after a 5 s countdown; siege progression (card unlock → deck, stars, Daily appears) checked fine. Honest gaps: no device numbers; balance tuned on bot runs only.
- 18:43 Nov 20 — Deploys 359–362 all green. Hour's work: Siege Lord loss panel gives a tip from the run; Siege Lord audio was on the castle's side — victory/defeat sounds were swapped (taking the hall played the defeat sound) and the castle's reward sounds (its builds, coins, ability chime) played for the attacker; both fixed, plus no danger heartbeat when the castle's hall is low. Checked fine: Daily Siege repeat-win message; chapter 2–10 build + night screenshots (no errors; readable on every ground). Honest gaps: audio fixes verified by reading code (no audio in headless); baked edge trees slightly overlap the leftmost tower plot in a few chapters.
- 17:47 Nov 20 — Deploys 352–358 all green. Hour's work (Siege Lord feel + clarity): breaches now stay open for the rest of a push (the castle repairs only in each push's first 8 s), with sieges 4–6 retuned to keep difficulty (siegesim 32 runs: 66/28/47 vs 63/25/50 before); the push pill shows "🔨 Repairs" during the lull and breaches say "Open till the next push"; the sheet explains it; a caption says what the picked card does (plural-correct). Campaign: defeat tips no longer suggest locked buildings and early losses get the basics. Honest gaps: siege balance was tuned on bot runs only; no device numbers.
- 16:52 Nov 20 — Deploys 349–351 all green. Hour's work: lag — profiled real runs and found the remaining 60–110 ms frames were first-draw texture uploads of character sheets; sheets a run needs are now pre-drawn one per calm frame (siege A/B >50 ms frames 8 → 1) and the preload covers foes spawned outside the wave lists (thief, split-offs, summons). Real-run checks with no errors: sieges 4/5/6 with the full deck (siege 6 ≈ 50% for a naive player, matching siegesim), Endless (night 4, 0 long frames), Boss Rush, all 9 heroes' abilities fired with real taps (no-target taps keep the charge). Honest gaps: a few first-use canvases (plaza glow, chimney smoke) still cost one frame in headless; no device numbers. Next: Siege Lord breach payoff (defender can't repair mid-push), with siegesim before/after.
- 15:56 Nov 20 — Deploys 344–348 all green. Hour's work: Siege Lord pause tap area, hero visible in the gate, What's new card current; phone life events (app switch, sideways, storage errors, safe area) verified already handled; first full REAL chapter 1 run (no forced states) won with no errors and exposed the new-foe hitches → off-thread half sheets (A/B >50 ms frames 20 → 9); first real Siege Lord run with real taps won with no errors. Tried & reverted (no A/B gain): low-quality stand-in when the crisp budget is spent. Honest gaps: real sieges still show ~5 frames of 60–90 ms as the field fills (headless; steady state is 4.4 ms) — profiling next; still no on-device numbers.
- 14:46 Nov 20 — Deploys 338–343 all green. Hour's work (phone feel): forge/bows hints, no tutorial tip while the hero is down, in-game Reduced motion now quiets the menus, long-session canvas memory capped (crisp cache 800; canvases level off ~88 MB instead of climbing past 110), volume sliders easier to grab (14 → 24 px), and an iPhone SE touch-target audit → bigger invisible hit areas for the in-game ▶/II/🔊, hub tabs, gear, claim and "Reset progress" (24 px buttons on SE). Checked fine: death/respawn, trophy claim, Daily/Endless/Siege entry, Siege Lord drag on SE. Honest gaps: no on-device numbers; the SE in-game buttons are still drawn at 24 px (only their tap area grew).
- 13:52 Nov 20 — Deploys 331–337 all green. Hour's work: Siege Lord walkers no longer hit the hero through a standing wall, and the siege balance my build-pause change had quietly shifted is restored (lesson: every sim change now runs campsim AND siegesim); first load 11.9 → 8.7 MB (core sheets only, per-run preload); ground canvas memory halved and grounds 13.5 → 7.8 MB with no visible change; memory audit clean (58 MB live canvases); clarity: new-enemy banners say what the foe does, one-time hints explain the log pile → forge → bows → towers chain. Checked fine, no change: blessing pick, SE hub tabs, control latency, Daily/Endless/Siege entry. Honest gaps: still no device-side numbers for lag (headless timing is noisy); campaign walkers still hit the hero through the wall (a tuned pass is needed before changing it).
- 12:40 Nov 20 — Deploys 325–330 all green. Hour's work: Siege Lord finished (result panel keeps the battlefield, attacker pause panel, weather in the flip); lag pass 2 (sheets decoded off-thread, per-cell hit flashes — no measurable change in noisy headless timing, real memory saving); fresh-save chapter 1 playthrough found two real problems, both fixed: finishing a build silently drained the purse into the next level, and the victory confetti swallowed taps on the result buttons (the worst bug this session — earlier QA used forced clicks, which hid it). A real-tap audit across title/HUD/victory/hub tabs/chapter sheet/defeat is now clean. Lesson: QA must use real taps (mouse at element centre), never force/JS clicks. Next: blessing pick screen, chapter 2 opening, Heroes/Armory on iPhone SE.
- 11:40 Nov 20 — Deploys 319–324 all green. Hour's work (Siege Lord S1–S3): impact feel on wall breaks/hall hits, clearer push/chest status, trophy-toast flood fixed, flyers visible in the flipped view, castle-side popups hidden for the attacker, rock-steady attacker camera (drop zones no longer slide while dragging), night overlays placed right in the flip, breached wall segments now readable. S4 balance recheck (siegesim, 16 runs, sim untouched): sieges 1–3 100%, siege 4 63%, siege 5 19% (matches the logged 20–33% for a bot cycling the full deck), siege 6 50% — no change needed. Honest gaps: the defender bot repairs a breach mid-wave whenever it has coins, and walkers stop to fight the hero across the wall, so breaches can feel short-lived; weather puddles still unflipped. Next: S5 whole-flow polish (sheet → siege → end panel → retry, pause).
- 04:06 — Deploys 261–269 all green. This hour: Siege 5 The Hollow Keep (new horde-HP handicap), a real save bug fixed (Boss Rush stars/best were dropped on every reload — sanitizeSave whitelisted only campaign ids) plus a save round-trip test guarding every newer field, Ghost Lanterns (mini-game #6) + polish + glow caching, compact modes row on the Battle tab, What's-new lines. Tests 204→211. Lessons: whitelisting sanitizers silently eat new data — every new mode/stat needs a round-trip test entry (now in place); siege balance knobs can be cliff-steep (horde HP 1.0 → 75%, 0.8 → 0%); profile before optimising (Lanterns: 94% raster, gradients weren't it).
- 03:09 — Deploys 254–260 all green. This hour: chapter 10 The Hollow Throne (+ Hollow King with Grave Rise, own anim sheet + portrait, Grave Wisps flair, Boss Rush finale, Endless rotation, What's-new line), sweeps clean. Perf: ch10 ~50 ms median at 4× throttle — same as ch4 (the shared night lighting), mist isn't the cost (A/B with mist off: no change); raster-bound, left alone. Parked idea: Siege 5 on ch10 ground — the chapter's horde strength makes it trivial even with max-level defenders (75% at L10+); needs a per-siege horde-HP handicap first. Lessons: a boss recolour needs one rule for all warm tones (separate skin/cloth rules made the portrait blotchy); balance the mid-chapter boss and the finale separately (first ch10 pass lost on night 5, second on night 10).
- 02:12 — Deploys 244–253 green (244 cancelled = superseded by 245, same code). This hour: 8th hero The Marshal (+ achievement, horn sfx, militia in his colours, daily pool from 26 Nov), What's-new for 21 Nov, side-game daily (21 Nov) and weekly (7 Dec) quests, Siege Lord unlock hints + consistent card names, Endless Warlords' Week (7 Dec), Boss Rush results line. Tests 199→203. Lessons: a test that waits on a timer can be frozen by the blessing-pick pause (keep a foe alive); a fade via `globalAlpha /= fade` breaks at 0 — save/restore the alpha; date-gated rotations stay stable when the old slice size equals the old list length — diff anyway.
- 01:13 — Deploys 237–243 all green. This hour: two perf wins (mini-games 15→60 fps at 4× throttle by pausing the attract battle; menus 83→16.7 ms and a slow menu no longer permanently lowers in-battle pixel density), Dragon Dodge polish, Boss Rush (new mode: banner, NEW ribbon, results line). Session worker restarted ~00:30 — repo and scripts survived. Lessons: (1) id-keyed tables (CAMP_CHAPTER_HP) silently default special chapter ids to 1× — the first Boss Rush was trivially easy until found; grep for chapter.id when adding modes; (2) wave mix weights are relative — scaling them changes nothing; budget is the lever; (3) browser autoplay only steers the hero (no building), so judge balance with campsim, not autoplay losses. Next: design note for a bigger content slice (chapter 10 or 8th hero).
- 00:19 — Deploys 226–236 all green (226 cancelled = superseded by 227). This hour: Siege Lord card sprites, Catapult Toss (#4), Fair day, unified end panels (popping stars), siege 4 Frost Citadel, Dragon Dodge (#5) + winged-sprite fix (atlas sprites were shown one-winged on cards — caught while building the dragon), Trophies side-game bests, Siege Lord summary + Attack again. Sweeps: ch7/9/3 normal, ch5 Hard, ch3 Nightmare — clean. Tests 186→198. Lessons: an atlas sprite isn't a picture — check how the renderer draws a file before reusing it; a flag hanging off a map stop made the map scroll sideways (keep overlays inside the track); Fair day doubling everything would have doubled star bonuses — double only the repeatable part. Next: Dragon Dodge polish, perf check under CPU throttling.
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
- **05:04** — Deploys runs 270–281 all green (273 "Trophies fold" was cancelled because the roadmap commit 20 s later superseded it — 274 deployed the same code). Shipped this hour: Trophies claimed fold, Heroes tab scroll-to-picked, Royal Gift daily chest (+ badge, Loyal Subject), 3 new flairs, Royal Forge (7th side game) + anvil sounds. Tests 211 → 219. Watch: Royal Gift relies on the device's local date (same as the daily challenge) — fine; Forge balance from a bot only, revisit if real scores cluster at 0–1★. Next: a new daily/Endless twist gated to a future date, then Siege Lord content.
- **06:07** — Deploys runs 282–289 all green. Shipped this hour: 4 daily twists from Nov 27 (+ twist `mods`), Siege Lord Shaman & Black Knight cards (2-row card bar), Endless Legion/Swift Week, Bell Tower (8th side game), the 🎪 Fair tile + sheet (returns to the sheet), What's-new refresh. Smoke sweep (all 8 side games, daily, Endless, Boss Rush, Siege 5): no page errors. Tests 219 → 229. Watch: Shaman balance is bot-noisy (cost 7); the new twists only appear from Nov 27 / Feb. Next: a new content piece (enemy, hero or looks).
- **07:07** — Deploys runs 290–295 all green. Shipped this hour: the Shadowstalker (blinking late-game foe; ch10 share trimmed after campsim), Veteran looks for all 9 heroes (violet-and-gold, Golden robes, the Crimson King from recoloured anim sheets — lazy-loaded), The Alchemist (9th hero, Acid Flask; tuned 35% → 75% at ch8 L10) + Brewmaster achievement. Smoke sweep clean. Tests 229 → 233. Watch: Shadowstalker makes ch7–9 slightly easier by bot numbers (noise-level); Alchemist art is the Pyromancer figure in green. Next: Siege 6 with the Alchemist defending.
- **08:07** — Deploys runs 296–301 all green. Shipped this hour: Siege 6 The Alchemist's Tower (L8 walls + 1.08 horde → 47% bot; Stalkers war card prize; Towerfall), Siege Master achievement, wave-preview portraits fixed (Shadowstalker/Tunneler/Banner/Raven/Imp), Daily Siege (date-seeded castle, +250 first win; per-hero wall offsets from siegesim) + "🗓️ Daily open" tile + Raider of the Realm. Tests 233 → 235. Watch: siege balance is cliff-steep per wall level and hero; Daily Siege aims attacker-friendly. Next: Alchemist flair, Endless milestones past 30.
- **09:07** — Deploys runs 302–307 all green. Shipped this hour: Toxic Bubbles flair, Daily Siege quests (date-gated, diffed), What's-new card cut from 13 lines to 6, the Alchemist's green flask, and a perf fix (trail flairs cost a frame at 4× throttle in ch10; emit rate halved → back to 50 ms). Tests 235 → 236. Watch: trails are sparser now (still visible). Next: Boss Rush on Hard/Nightmare.
- **10:36** — Deploys runs 308–318 all green. Owner feedback at ~09:50 changed direction: lag, Siege Lord quality, "not a bunch of things that work mid". Since then: perf (no getImageData sharpening, 2× density cap, HUD writes only on change — 4× throttle median 83 → 50 ms), Siege Lord rework (flipped attacker's view, all lanes on screen, tap-to-send, then drag-and-drop with dashed drop zones per the owner's idea), side mini-games switched off. Before that this hour (pre-feedback): Boss Rush difficulties, achievement-id fix, Mason's Tower (now hidden), Endless scenery. Next: Siege Lord impact feel, clarity, unit readability in the flipped view.
