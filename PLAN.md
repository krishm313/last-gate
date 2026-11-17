# Last Gate — Game Plan (working title)

> **Direction change (after Phase 5):** the owner shared a reference screenshot of the kind of
> minigame they meant: a *camp-defense* loop, not a fixed-gate shooter. The game is being rebuilt
> around that loop — see **§0 Camp rebuild** below. Phases 0–5 (the gate shooter) stay in git
> history; their enemies, waves, bosses, upgrades, heroes, meta progression, FX and audio are
> reused. Everything stays original: no names, art or assets from any existing game.

## 0. Camp rebuild

**Core loop:** move your hero around a fortified camp with a virtual joystick. Enemies march out of
the forest in waves and batter the wooden palisade. You:
- **pick up coins** dropped by enemies and produced by your hall (they stack on your back),
- **walk onto build plots** to pour coins in and build/upgrade: archer towers on the wall, a
  lumber camp, a forge, barracks, wall repairs, new zones,
- **run production chains:** woodcutters chop trees → logs → the forge turns logs into bows →
  bows arm the archers in your towers; hire workers to automate the carrying,
- **fight:** your hero auto-attacks anything in range; step outside the gate to fight, or stay
  safe behind the wall,
- survive 10 waves (boss on 5 and 10). If the **town hall** falls, the run is lost.

Between waves: pick 1 of 3 blessings (reused upgrade system). Meta progression, chapters (maps),
heroes and the Armory carry over.

| Phase | Goal | Done when |
|---|---|---|
| C1 — Camp core | Camera + joystick hero, coin pickups & carry stack, build plots, palisade + gate + hall, enemy waves attacking the wall, hero auto-attack, buildable archer towers, win/lose | Building towers to hold 10 waves is already fun in greybox |
| C2 — Economy chains | Trees + lumber camp, forge (logs → bows), barracks/towers that need bows, workers that carry, hall income, wall repair plots | The camp feels alive and running it is half the fun |
| C3 — Run depth | Hall levels unlock new plots/zones, blessings between waves, bosses/specials adapted to walls, hero HP/respawn, balance sim with a bot | A run has a satisfying build-up arc and a climax |
| C4 — Art pass | Chunky, bright, outlined top-down art: grass, pine forest, palisade, towers, buildings, units, coin stacks | A screenshot looks like a real mobile game |
| C5 — Meta, juice, audio | Hub, chapters as maps, heroes, Armory, FX/SFX/music hooked into the camp | Full loop from menu → run → rewards → upgrades |
| C6 — Mobile polish & ship | PWA, performance, tutorial, settings | Installed on the phone home screen |

---

A fast, one-thumb medieval castle-defense game. You hold the castle gate against waves of enemies
that keep getting harder. Between waves you pick 1 of 3 upgrades, so every run builds differently.
It's our own design: no names, characters, art or audio from Kingshot or any other existing game.

---

## 1. The final goal

A polished mobile game (portrait, played one-handed on iPhone) where:

- A run lasts **8–15 minutes**, and losing still feels like progress.
- There are **5 chapters × 10 waves**, with a boss at the end of each chapter, plus an **Endless mode**.
- There are **30+ upgrades** with real combos, **10+ enemy types**, **5 bosses** and **4 unlockable heroes**.
- **Meta-progression** carries between runs: gold buys permanent castle upgrades, and stars unlock chapters.
- It ships first as an installable web app (PWA). Later it can be wrapped as a native iOS app for TestFlight / the App Store.

**The test of success:** after losing, you immediately hit "Play again".

---

## 2. Core loop

```
 ┌─► WAVE (30–60s): enemies march down toward the gate
 │      • archers on the wall fire automatically
 │      • YOU drag to aim the hero's volley, then tap abilities when charged
 │      • enemies that reach the gate hit it; gate HP 0 → run over
 │
 │   WAVE CLEARED → gold + XP
 │      • PICK 1 OF 3 UPGRADES  (the main source of decisions and fun)
 │      • every 5 waves: bonus pick or a shop
 └────────────────────────────────────────────┘
   RUN ENDS (win or lose) → gold → permanent upgrades → next run is a bit stronger
```

## 3. Design pillars

1. **One thumb, zero friction.** Drag to aim, tap to cast. No pausing to manage menus mid-wave.
2. **Juice everything.** Hits flash, numbers pop, the screen shakes, enemies burst. Fighting should *feel* good.
3. **Meaningful picks.** Every upgrade choice should be a small, interesting decision, and combos should feel like discoveries.
4. **Pressure with relief.** Hard waves are followed by breather waves. Bosses are spikes. Close calls are the best moments.
5. **Always progressing.** Even a bad run earns something.

---

## 4. Gameplay spec

### Screen layout (portrait 9:16)
- **Top 70%:** the battlefield. Enemies spawn at the top edge and march down 3 loose lanes.
- **Bottom 30%:** the castle wall and gate, with archers along the wall and the hero in the centre.
- **HUD:** gate HP bar, wave counter, gold. Ability buttons sit within thumb reach at the bottom.

### Player controls
| Action | Input |
|---|---|
| Aim the hero's volley | Touch and drag anywhere on the battlefield (the hero fires continuously at your finger) |
| Hero ability | Tap the button when charged (e.g. Arrow Storm, Boiling Oil, Catapult Strike) |
| Pick an upgrade | Tap 1 of 3 cards |

Archers auto-target (nearest enemy by default; upgrades can change this to strongest / fastest).

### Defenders
- **Hero** (player-aimed): high damage, the main thing you control.
- **Wall archers** (automatic): start with 2, more come from upgrades.
- **Later unlocks:** a catapult tower (splash), a mage tower (chain lightning), a ballista (pierce).

### Enemy roster (each one forces a new tactic)
| Enemy | Trait | What it teaches |
|---|---|---|
| Footman | Basic | Baseline |
| Runner | Fast, low HP | Prioritise targets |
| Shieldbearer | Blocks frontal arrows, must be hit from an angle or by splash | Aiming / splash upgrades |
| Brute | Slow, huge HP, heavy gate damage | Focus fire |
| Archer | Stops at range and shoots your archers | Kill priority |
| Ram crew | Ignores everything, rushes the gate | Panic moments |
| Splitter (slime/goblin pack) | Splits into 3 on death | AoE value |
| Shaman | Heals and shields nearby enemies | Snipe the support |
| Bat swarm | Flying, ignores lane spacing | Multi-shot |
| Sapper | Explodes at the gate | Kill before contact |

**Bosses (end of each chapter):** Warlord (summons waves), Siege Golem (armour phases), Bone Dragon
(flies across the screen), Witch Queen (curses your upgrades temporarily), Iron Colossus (final, multi-phase).

### Upgrade system (pick 1 of 3)
Rarities: **Common / Rare / Epic / Legendary**. Odds improve as waves go on. Upgrade categories:
- **Hero:** +damage, +fire rate, multishot, pierce, crit chance, ricochet
- **Elements:** fire (burn DoT), frost (slow), lightning (chain), poison (stacking)
- **Archers:** +1 archer, faster archers, archers inherit 50% of hero elements
- **Castle:** +gate HP, gate repair per wave, spiked gate (thorns), boiling oil ability
- **Economy:** +gold per kill, interest on banked gold, reroll tokens
- **Towers:** unlock / upgrade a catapult, mage tower or ballista

**Combos** (the long-term hook), for example:
- Pierce + Ricochet → arrows bounce through whole lines
- Frost + Shatter → frozen enemies explode
- Fire + Oil → oil pools ignite into burning lanes
- Multishot + Archers inherit → screen-filling volleys

Duplicate picks stack. Some Legendaries only appear once you own a prerequisite, which signposts combos.

### Difficulty model (data-driven, all tunable in JSON)
- Enemy HP: `base × 1.11^wave`
- Enemy count: `base + 1.4 × wave`
- Spawn interval shrinks toward a floor
- **Every 4th wave is a breather:** fewer, weaker enemies and a bonus pick
- **A new enemy type every 2–3 waves**, introduced alone first, then mixed in
- **Wave 5 of each chapter:** mini-boss. **Wave 10:** boss.
- Each chapter multiplies the base stats and adds affixes (e.g. "enemies are 20% faster", "shields regenerate")
- **Endless mode:** the formulas keep going with stacking random affixes, plus a leaderboard score

All waves, enemies and upgrades live in **JSON data files**, so balancing never needs code changes.

### Meta-progression
- **Gold** (kept after every run) buys permanent upgrades: starting gate HP, starting archers, hero damage, reroll count.
- **Stars** (1–3 per chapter: clear, clear above 50% gate HP, clear without losing an archer) unlock chapters and heroes.
- **Heroes** (each changes how you play):
  - Ranger: fast arrows, the default hero
  - Knight Captain: a short-range sweep that knocks enemies back
  - Pyromancer: fire hero, burn-focused
  - Engineer: buffs the towers
- Progress is saved locally (localStorage first, iCloud/cloud sync only if this goes native).

---

## 5. Tech stack

| Area | Choice | Why |
|---|---|---|
| Engine | **Custom TypeScript + Canvas 2D** (decided in Phase 0, replacing Phaser) | Pure, deterministic simulation core that also runs headless for the balance simulator; tiny bundle; no engine API surprises |
| Build | **Vite** | Instant reloads, tiny config |
| Tests | **Vitest** for pure logic (damage, waves, upgrade rolls) | Balance math stays correct |
| Data | JSON files for waves, enemies, upgrades and heroes, with types | Tune without touching code |
| Save | localStorage behind a small save module | Easy to swap for cloud later |
| Mobile | PWA first, then **Capacitor** for an iOS build | Playable on iPhone in Safari from day 1 |
| Art | Greybox shapes → free/CC0 medieval asset packs → custom art if it's worth it | Gameplay before looks |
| Audio | CC0 SFX + one music loop, plus the Web Audio API | |

**Folder:** this repository is a self-contained project with its own `package.json`.

```
games/castle-defense/
  PLAN.md
  package.json, vite.config.ts, tsconfig.json, index.html
  src/
    main.ts               boot + fixed-step loop
    core/                 pure simulation: state, waves, combat, upgrades, data (no DOM)
    render/               Canvas renderer, sprites, particles, screen shake, damage numbers
    ui/                   DOM overlays: HUD, menus, upgrade cards
    audio/                Web Audio SFX + music
  tests/                  pure-logic tests + a headless balance simulator
  (art is drawn procedurally in src/render; the repo's .gitignore ignores public/)
```

---

## 6. Phases

Progress: see `PROGRESS.md`.

Each phase ends with something playable. Don't move on until the "done when" line is true.

### Phase 0 — Setup (½ day)
- Scaffold Vite + Phaser + TS in `games/castle-defense/`, with portrait scaling and touch input
- A `npm run dev` that opens on a phone over LAN
- **Done when:** a blank battlefield renders correctly on both iPhone Safari and desktop.

### Phase 1 — Greybox core loop (1–2 days) ⭐ the most important phase
- Gate with HP; hero that fires at your dragged finger; 2 auto-archers
- One enemy type (Footman) marching down; collisions; damage; deaths
- Wave director: 10 hand-tuned waves; win and lose screens; restart
- Everything is coloured rectangles and circles
- **Done when:** playing for 3 minutes with zero art is already a little bit fun. If it isn't, tune
  speeds, counts and fire rates until it is. Nothing later fixes a boring core.

### Phase 2 — Upgrade picks (2–3 days)
- A pick-1-of-3 card screen between waves, with rarity weights and rerolls
- The first 15 upgrades (hero, archers, castle, 2 elements), stacking rules, the first 3 combos
- **Done when:** two runs feel noticeably different because of the picks.

### Phase 3 — Enemy variety and bosses (3–4 days)
- Runner, Shieldbearer, Brute, Archer, Ram, Splitter, Shaman
- Mini-boss + first boss (Warlord); boss health bar and phases
- Breather waves, new-enemy intro waves, a data-driven `waves.json`
- **Done when:** chapter 1 (10 waves + boss) is a complete arc with a clear difficulty rise and a boss climax.

### Phase 4 — Game feel / juice (2–3 days)
- Hit flash, knockback, damage numbers, crit pops, death bursts, screen shake on gate hits
- Gate cracks as HP drops, low-HP warning pulse, slow-mo on boss kill
- Placeholder SFX on every action, plus a music loop
- **Done when:** muting the sound and watching someone else play still looks satisfying.

### Phase 5 — Progression and content (4–6 days)
- Chapters 2–5 with new enemies (Bats, Sapper), affixes and bosses 2–5
- Full upgrade pool (30+) and towers (catapult, mage, ballista)
- Meta: gold, the permanent upgrade tree, stars, chapter select, hero unlocks (4 heroes)
- Save/load
- **Done when:** someone has a reason to come back tomorrow (unlocks they're close to, a chapter they almost beat).

### Phase 6 — Art and audio pass (3–5 days)
- Swap greybox for a cohesive medieval asset set: castle wall, gate states, units, projectiles, battlefield
- Hand-drawn UI frames, a fantasy font, card art per upgrade category
- Final SFX set and 2–3 music tracks (menu, battle, boss)
- **Done when:** a screenshot looks like a real game.

### Phase 7 — Balance and playtesting (ongoing, focused 3–4 days)
- A **headless simulator**: run thousands of auto-played runs with random picks and log the wave where each one dies
- Targets: chapter 1 is cleared by most first-timers; chapter 5 needs meta upgrades plus good picks; no single upgrade is always right
- Local telemetry (death wave, picks taken, run length) exported to JSON
- 3–5 real playtesters; watch them without helping
- **Done when:** the difficulty curve looks smooth in the sim data and playtesters ask for "one more run".

### Phase 8 — Mobile polish and shipping (2–4 days)
- PWA: manifest, icon, offline cache, "Add to Home Screen" so it plays full-screen like an app
- Performance: object pooling, stable 60fps with 150+ enemies on an iPhone
- Settings (sound, haptics, reduced shake), a pause menu, a first-time tutorial (wave 1 teaches drag-to-aim)
- Optional: Capacitor iOS build → TestFlight (needs a Mac with Xcode and an Apple Developer account, $99/yr)
- **Done when:** it's installed on your phone home screen and you play it on the couch.

### Phase 9 — Post-launch extras (optional)
- Endless mode + local/online leaderboard
- A daily challenge (fixed seed + affixes, so everyone plays the same run)
- New heroes / chapters as content drops

**Rough total:** ~4–6 weeks of part-time iteration to a polished v1. Phase 1 alone gives a playable toy in a day or two.

---

## 7. Risks and how we handle them
| Risk | Mitigation |
|---|---|
| The core isn't fun | Phase 1 gate: don't proceed until greybox is fun |
| Difficulty spikes or walls | Data-driven waves + simulator + breather waves |
| Too many enemies hurts phone FPS | Object pooling, simple physics (circles), particle caps |
| Art inconsistency from mixed packs | Choose one asset family; greybox until then |
| Scope creep | Each phase has a "done when"; extras go to Phase 9 |
| Too close to an existing game | Original names, art, enemies and UI; genre mechanics only |

## 8. Non-goals (for v1)
- No monetization, ads or accounts
- No multiplayer
- No copied branding or assets from Kingshot or any other game

---

## Next step
Start **Phase 0 + Phase 1**: scaffold the project and get the greybox loop playable in the browser.
