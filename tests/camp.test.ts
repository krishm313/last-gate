import { describe, expect, it } from "vitest";
import { campBotStep } from "../src/camp/bot";
import { CAMP, applyBlessing, carryCap, chooseBlessing, chooseTowerSpec, createCamp, drainEvents, MAGE_LEVELS, plotCost, RALLY, reduction, rollWeather, spawnEnemy, SPIKES, step, type Camp, type CampInput } from "../src/camp/sim";
import { STEP, WALL_Y } from "../src/camp/world";
import { rollBlessings } from "../src/camp/blessings";
import { createRng } from "../src/core/rng";

const still: CampInput = { move: { x: 0, y: 0 } };
function run(c: Camp, seconds: number, input = still) {
  for (let i = 0; i < seconds / STEP; i++) step(c, input);
}

describe("camp", () => {
  it("is deterministic", () => {
    const play = () => {
      const c = createCamp(42);
      for (let i = 0; i < 120 / STEP && c.phase !== "lost"; i++) campBotStep(c);
      return [c.wave, c.kills, Math.round(c.hallHp), c.hero.coins];
    };
    expect(play()).toEqual(play());
  });

  it("the wall blocks the hero except at the gate", () => {
    const c = createCamp(1);
    c.hero.x = 100;
    c.hero.y = WALL_Y + 40;
    run(c, 2, { move: { x: 0, y: -1 } });
    expect(c.hero.y).toBeGreaterThan(WALL_Y);
    c.hero.x = 360;
    run(c, 2, { move: { x: 0, y: -1 } });
    expect(c.hero.y).toBeLessThan(WALL_Y);
  });

  it("standing on a plot with coins builds it", () => {
    const c = createCamp(1);
    const plot = c.plots.find((p) => p.id === "tower-1")!;
    c.hero.x = plot.x;
    c.hero.y = plot.y;
    c.hero.coins = plotCost(plot);
    run(c, 3);
    expect(plot.level).toBe(1);
    expect(c.hero.coins).toBe(0);
    expect(drainEvents(c).some((e) => e.type === "build")).toBe(true);
  });

  it("the repair plot takes no coins while the wall is whole, and repairs once damaged", () => {
    const c = createCamp(1);
    const plot = c.plots.find((p) => p.kind === "repair")!;
    c.hero.x = plot.x;
    c.hero.y = plot.y;
    c.hero.coins = 30;
    c.incomePile = 0;
    c.mods.income = 1e-9; // (no hall income: the courier would otherwise top up the King's purse)
    run(c, 3);
    expect(c.hero.coins).toBe(30);
    expect(plot.paid).toBe(0);
    c.segments[2]!.hp = 10;
    run(c, 4);
    expect(c.segments[2]!.hp).toBe(c.segments[2]!.maxHp);
    expect(c.hero.coins).toBe(30 - plotCost({ ...plot, level: 0 }));
  });

  it("the hall's income pile can be collected", () => {
    const c = createCamp(1);
    c.hero.coins = 0;
    c.hero.x = 470;
    c.hero.y = 1050;
    run(c, 0.2);
    expect(c.hero.coins).toBeGreaterThan(0);
    expect(c.hero.coins).toBeLessThanOrEqual(CAMP.carryCap);
  });

  it("undefended, enemies break the wall and destroy the hall", () => {
    const c = createCamp(3);
    c.hero.x = 700;
    c.hero.y = 1280; // out of the way
    let broke = false;
    for (let i = 0; i < 900 / STEP && c.phase !== "lost"; i++) {
      if (c.phase === "pick") chooseBlessing(c, c.offers[0]!.id);
      step(c, { ...still, callWave: true });
      if (drainEvents(c).some((e) => e.type === "wallBreak")) broke = true;
      c.hero.hp = c.hero.maxHp; // keep the hero out of it
    }
    expect(broke).toBe(true);
    expect(c.phase).toBe("lost");
  });

  it("enemy kills drop coins the hero can vacuum up", () => {
    const c = createCamp(1);
    c.hero.coins = 0;
    c.incomePile = 0;
    c.mods.income = 1e-9; // (isolate the dropped coin from the hall courier)
    c.coins.push({ id: 999, x: c.hero.x + 40, y: c.hero.y, vx: 0, vy: 0, z: 0, vz: 0, homing: false });
    run(c, 1);
    expect(c.hero.coins).toBe(1);
    expect(c.coins.length).toBe(0);
  });

  it("the bot survives several waves by building towers", () => {
    const c = createCamp(7);
    for (let i = 0; i < 600 / STEP && c.phase !== "lost" && c.wave < 5; i++) campBotStep(c);
    expect(c.wave).toBeGreaterThanOrEqual(5);
    expect(c.plots.filter((p) => p.kind === "tower" && p.level > 0).length).toBeGreaterThanOrEqual(3);
  });

  it("clearing a wave offers 3 blessings and pauses until one is chosen", () => {
    const c = createCamp(7);
    for (let i = 0; i < 300 / STEP && c.phase !== "pick"; i++) campBotStepNoPick(c);
    expect(c.phase).toBe("pick");
    expect(c.offers.length).toBe(3);
    const t = c.time;
    step(c, still);
    expect(c.time).toBe(t);
    expect(chooseBlessing(c, c.offers[0]!.id)).toBe(true);
    expect(c.phase).toBe("build");
  });

  it("blessings change the run (wall HP, carry cap)", () => {
    const c = createCamp(1);
    const before = c.segments[0]!.maxHp;
    applyBlessing(c, "walls");
    expect(c.segments[0]!.maxHp).toBeGreaterThan(before);
    applyBlessing(c, "pockets");
    expect(c.mods.carry).toBe(20);
  });
});

function campBotStepNoPick(c: Camp) {
  if (c.phase !== "pick") campBotStep(c);
}

describe("camp meta setup", () => {
  it("prebuilt towers from perks / heroes start built (regression: crashed at run start)", async () => {
    const { campSetupFromSave } = await import("../src/camp/meta");
    const { newSave } = await import("../src/core/meta");
    const save = newSave();
    save.perms.barracks = 2;
    const c = createCamp(1, undefined, campSetupFromSave(save, "engineer"));
    expect(c.plots.filter((p) => p.kind === "tower" && p.level === 1).map((p) => p.id).sort()).toEqual(["tower-1", "tower-2", "tower-3"]);
  });
});

describe("treasure goblin", () => {
  it("shows up in some waves and either escapes or drops a pile of coins", async () => {
    const { campBotStep } = await import("../src/camp/bot");
    let seen = 0;
    let resolved = 0;
    for (let seed = 1; seed <= 6 && seen < 2; seed++) {
      const c = createCamp(seed);
      let thiefId = -1;
      for (let i = 0; i < 600 / STEP && c.phase !== "lost" && c.phase !== "won" && c.wave <= 6; i++) {
        campBotStep(c);
        for (const e of drainEvents(c)) {
          if (e.type === "thief") {
            seen++;
            thiefId = c.enemies.find((x) => x.def.id === "thief")?.id ?? -1;
          }
          if (e.type === "thiefEscaped" || (e.type === "kill" && e.enemy.id === "thief")) resolved++;
        }
      }
      expect(c.enemies.some((x) => x.id === thiefId && x.def.id === "thief" && c.phase === "build")).toBe(false);
    }
    expect(seen).toBeGreaterThan(0);
    expect(resolved).toBeGreaterThan(0);
  });
});

describe("treasure goblin escape", () => {
  it("does not count as a kill, give XP or emit a kill event (regression)", async () => {
    const { spawnThief } = await import("../src/camp/sim");
    const c = createCamp(3);
    c.hero.x = 360;
    c.hero.y = 1200; // far away, so nobody shoots it
    spawnThief(c);
    const t = c.enemies.find((e) => e.def.id === "thief")!;
    t.x = (t.targetX ?? 0) + (t.targetX! > 0 ? -2 : 2); // one step from the far edge
    drainEvents(c);
    const kills = c.kills;
    const xp = c.heroXp;
    run(c, 0.5);
    const evs = drainEvents(c);
    expect(evs.some((e) => e.type === "thiefEscaped")).toBe(true);
    expect(evs.some((e) => e.type === "kill")).toBe(false);
    expect(c.kills).toBe(kills);
    expect(c.heroXp).toBe(xp);
    expect(c.enemies.some((e) => e.def.id === "thief")).toBe(false);
  });
});

describe("sapper self-destruct", () => {
  it("damages the wall but is not credited as a player kill (regression)", async () => {
    const { spawnEnemy } = await import("../src/camp/sim");
    const c = createCamp(4);
    c.hero.x = 360;
    c.hero.y = 1250; // out of range of everything
    const e = spawnEnemy(c, { at: 0, enemy: "sapper", hpMult: 50, lane: null }, { x: 100, y: WALL_Y - 40 });
    drainEvents(c);
    const kills = c.kills;
    const xp = c.heroXp;
    const wallBefore = c.segments.reduce((a, s) => a + s.hp, 0);
    run(c, 3);
    const evs = drainEvents(c);
    expect(evs.some((ev) => ev.type === "sapper")).toBe(true);
    expect(evs.some((ev) => ev.type === "kill")).toBe(false);
    expect(c.enemies.includes(e)).toBe(false);
    expect(c.kills).toBe(kills);
    expect(c.heroXp).toBe(xp);
    expect(c.segments.reduce((a, s) => a + s.hp, 0)).toBeLessThan(wallBefore);
  });
});

describe("wave-end sweep", () => {
  it("coins left on the field fly to the hero when a wave is held", () => {
    const c = createCamp(2);
    c.phase = "wave";
    c.wave = 1;
    c.queue = [];
    c.hero.coins = 0;
    c.coins.push({ id: 900, x: 100, y: 300, vx: 0, vy: 0, z: 0, vz: 0, homing: false });
    c.coins.push({ id: 901, x: 600, y: 1200, vx: 0, vy: 0, z: 0, vz: 0, homing: false });
    step(c, { move: { x: 0, y: 0 } }); // wave clears (no enemies) → sweep
    for (let i = 0; i < 4 / STEP && (c.phase as string) !== "pick"; i++) step(c, { move: { x: 0, y: 0 } });
    // The sim pauses in "pick"; coins keep homing once building resumes.
    if ((c.phase as string) === "pick") chooseBlessing(c, c.offers[0]!.id);
    for (let i = 0; i < 4 / STEP; i++) step(c, { move: { x: 0, y: 0 } });
    expect(c.hero.coins).toBeGreaterThanOrEqual(2);
  });
});

describe("building blessings", () => {
  it("are only offered once their building exists", async () => {
    const { rollBlessings } = await import("../src/camp/blessings");
    const { createRng } = await import("../src/core/rng");
    const ids = (built: string[]) => {
      const seen = new Set<string>();
      const rng = createRng(3);
      for (let i = 0; i < 300; i++) for (const b of rollBlessings(rng, 5, {}, 3, new Set(built))) seen.add(b.id);
      return seen;
    };
    expect(ids([]).has("soldiers")).toBe(false);
    expect(ids(["barracks"]).has("soldiers")).toBe(true);
    expect(ids(["forge"]).has("smith")).toBe(true);
  });
});

describe("logic review regressions", () => {
  it("Inferno doubles burning regardless of pick order", () => {
    const burn = (order: string[]) => {
      const c = createCamp(1);
      for (const id of order) applyBlessing(c, id);
      return c.mods.burn * c.mods.burnMult;
    };
    expect(burn(["fire", "inferno", "fire"])).toBe(burn(["fire", "fire", "inferno"]));
    expect(burn(["fire", "fire", "inferno"])).toBe(2);
  });

  it("Shield Bash can't knock a walker through an intact wall", async () => {
    const { spawnEnemy } = await import("../src/camp/sim");
    const c = createCamp(1, undefined, { ability: "shieldBash" });
    c.phase = "wave";
    c.abilityCharge = 1;
    c.hero.x = 300;
    c.hero.y = WALL_Y - 90;
    const e = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 50, lane: null }, { x: 300, y: WALL_Y - 40 });
    step(c, { move: { x: 0, y: 0 }, callWave: false, ability: true });
    expect(e.y).toBeLessThan(WALL_Y);
  });
});

describe("riseScale (build animation)", () => {
  it("grows from the ground, overshoots, and settles at full size", async () => {
    const { riseScale } = await import("../src/camp/buildings");
    expect(riseScale(0)[1]).toBeLessThan(0.1);
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => riseScale(i * 0.011)[1]));
    expect(peak).toBeGreaterThan(1.02);
    expect(riseScale(0.6)).toEqual([1, 1]);
    expect(riseScale(-1)).toEqual([1, 1]);
  });
});

describe("royal courier", () => {
  it("sends the hall's coins to the King wherever he is, and holds them while he's full", () => {
    const c = createCamp(1);
    c.hero.x = 360; c.hero.y = 660; // far from the hall, on no plot
    c.hero.coins = 0;
    c.incomePile = 10;
    c.mods.income = 1e-9;
    run(c, 2);
    expect(c.hero.coins).toBe(10);
    expect(c.incomePile).toBe(0);
    c.hero.coins = carryCap(c);
    c.incomePile = 5;
    run(c, 2);
    expect(c.hero.coins).toBe(carryCap(c));
    expect(c.incomePile).toBe(5);
  });
});

describe("tower specialisations", () => {
  const tower = (c: Camp) => c.plots.find((p) => p.kind === "tower")!;
  it("offers a choice when a tower reaches level 3, once, and locks it in", () => {
    const c = createCamp(1);
    const t = tower(c);
    t.level = 2;
    t.paid = 0;
    c.hero.x = t.x; c.hero.y = t.y; c.hero.coins = 200; c.hero.logs = 30;
    run(c, 6);
    expect(t.level).toBeGreaterThanOrEqual(3);
    expect(drainEvents(c).some((e) => e.type === "specChoice" && e.plot === t.id)).toBe(true);
    expect(chooseTowerSpec(c, t.id, "frost")).toBe(true);
    expect(t.spec).toBe("frost");
    expect(chooseTowerSpec(c, t.id, "fire")).toBe(false);
    expect(t.spec).toBe("frost");
  });
  it("can't specialise a tower below level 3", () => {
    const c = createCamp(1);
    const t = tower(c);
    t.level = 2;
    expect(chooseTowerSpec(c, t.id, "fire")).toBe(false);
  });
  it("fire arrows burn, frost arrows slow, volley shoots extra foes", () => {
    for (const spec of ["fire", "frost", "volley"] as const) {
      const c = createCamp(1);
      run(c, 0.1, { move: { x: 0, y: 0 }, callWave: true });
      expect(c.phase).toBe("wave");
      c.queue.length = 0;
      c.enemies.length = 0;
      const t = tower(c);
      t.level = 3; t.spec = spec; t.cooldown = 0;
      c.hero.x = 360; c.hero.y = 1150;
      for (let i = 0; i < 3; i++) spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 3, lane: 0.5 }, { x: t.x + i * 30, y: t.y - 160 });
      run(c, 1.5);
      const hit = c.enemies;
      if (spec === "fire") expect(hit.some((e) => e.burnTime > 0)).toBe(true);
      if (spec === "frost") expect(hit.some((e) => e.slowTime > 0 && e.slowPct >= 0.4)).toBe(true);
      if (spec === "volley") expect(hit.filter((e) => e.hp < e.maxHp).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("spike trap", () => {
  it("wounds and slows walkers crossing the strip before the gate, not flyers or foes elsewhere", () => {
    const c = createCamp(1);
    run(c, 0.1, { move: { x: 0, y: 0 }, callWave: true });
    c.queue.length = 0;
    c.enemies.length = 0;
    for (const p of c.plots) if (p.kind === "tower") p.level = 0;
    c.hero.x = 360; c.hero.y = 1150;
    const sp = c.plots.find((p) => p.kind === "spikes")!;
    sp.locked = false; sp.level = 2;
    const inside = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 5, lane: 0.5 }, { x: 360, y: SPIKES.y0 + 20 });
    const outside = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 5, lane: 0.5 }, { x: 120, y: SPIKES.y0 + 20 });
    const bat = spawnEnemy(c, { at: 0, enemy: "bat", hpMult: 5, lane: 0.5 }, { x: 380, y: SPIKES.y0 + 20 });
    const hp0 = [inside.hp, outside.hp, bat.hp];
    step(c, still);
    expect(inside.slowTime).toBeGreaterThan(0);
    run(c, 0.5);
    expect(inside.hp).toBeLessThan(hp0[0]!);
    expect(outside.hp).toBe(hp0[1]);
    expect(bat.hp).toBe(hp0[2]);
  });
  it("does nothing until built", () => {
    const c = createCamp(1);
    run(c, 0.1, { move: { x: 0, y: 0 }, callWave: true });
    c.queue.length = 0;
    c.enemies.length = 0;
    for (const p of c.plots) if (p.kind === "tower") p.level = 0;
    c.hero.x = 360; c.hero.y = 1150;
    const e = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 5, lane: 0.5 }, { x: 360, y: SPIKES.y0 + 20 });
    const hp = e.hp;
    step(c, still);
    expect(e.hp).toBe(hp);
  });
});

describe("mage tower", () => {
  const setup = () => {
    const c = createCamp(1);
    run(c, 0.1, { move: { x: 0, y: 0 }, callWave: true });
    c.queue.length = 0;
    c.enemies.length = 0;
    for (const p of c.plots) if (p.kind === "tower") p.level = 0;
    c.hero.x = 360; c.hero.y = 1150;
    const m = c.plots.find((p) => p.kind === "mage")!;
    m.locked = false; m.level = 1; m.cooldown = 0;
    return { c, m };
  };
  it("chains lightning through nearby foes (1 + chains), and only those in hop range", () => {
    const { c, m } = setup();
    const foes = [0, 1, 2, 3].map((i) => spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 10, lane: 0.5 }, { x: m.x + i * 50, y: m.y - 200 }));
    const far = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 10, lane: 0.5 }, { x: m.x + 400, y: m.y - 200 });
    const hp0 = foes.map((f) => f.hp);
    const farHp = far.hp;
    step(c, still);
    const hitCount = foes.filter((f, i) => f.hp < hp0[i]!).length;
    expect(hitCount).toBe(1 + MAGE_LEVELS[0]!.chains);
    expect(far.hp).toBe(farHp);
    expect(drainEvents(c).some((e) => e.type === "mageZap")).toBe(true);
  });
  it("ignores armour", () => {
    const { c, m } = setup();
    const k = spawnEnemy(c, { at: 0, enemy: "knight", hpMult: 10, lane: 0.5 }, { x: m.x, y: m.y - 200 });
    const hp = k.hp;
    step(c, still);
    expect(hp - k.hp).toBeCloseTo(MAGE_LEVELS[0]!.damage * c.chapter.hpMult ** 0.6, 3);
  });
});

describe("healer's tent", () => {
  it("heals the King within its radius, not outside it, and mends standing wall sections", () => {
    const c = createCamp(1);
    const t = c.plots.find((p) => p.kind === "healer")!;
    t.locked = false; t.level = 1;
    c.incomePile = 0; c.mods.income = 1e-9;
    c.hero.coins = 0;
    c.hero.x = t.x + 60; c.hero.y = t.y + 60; c.hero.hp = 50; c.hero.sinceHit = 0;
    c.segments[0]!.hp = c.segments[0]!.maxHp * 0.5;
    c.segments[1]!.hp = 0;
    const w0 = c.segments[0]!.hp;
    step(c, still);
    expect(c.hero.hp).toBeGreaterThan(50);
    expect(c.segments[0]!.hp).toBeGreaterThan(w0);
    expect(c.segments[1]!.hp).toBe(0);
    c.hero.x = t.x + 400; c.hero.y = t.y - 300; c.hero.hp = 50; c.hero.sinceHit = 0;
    step(c, still);
    expect(c.hero.hp).toBe(50);
  });
});

describe("blessing combos", () => {
  it("are only offered once every part is owned", () => {
    const offered = (owned: Record<string, number>) => {
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) for (const b of rollBlessings(createRng(i), 6, owned, 3, new Set())) seen.add(b.id);
      return seen;
    };
    expect(offered({ fire: 1 }).has("thermal")).toBe(false);
    expect(offered({ fire: 1, frost: 1 }).has("thermal")).toBe(true);
    expect(offered({ tax: 1 }).has("trove")).toBe(false);
    expect(offered({ tax: 1, bounty: 1 }).has("trove")).toBe(true);
  });
  it("Thermal Shock: burning bites 3x harder on slowed foes", () => {
    const c = createCamp(1);
    applyBlessing(c, "thermal");
    const a = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 20, lane: 0.5 }, { x: 200, y: 200 });
    const b = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 20, lane: 0.5 }, { x: 520, y: 200 });
    for (const e of [a, b]) { e.burnDps = 10; e.burnTime = 5; }
    b.slowTime = 5; b.slowPct = 0.3;
    const [ha, hb] = [a.hp, b.hp];
    step(c, still);
    expect((hb - b.hp) / (ha - a.hp)).toBeCloseTo(3, 1);
  });
});

describe("banner-bearer", () => {
  it("rallies foes near him: faster and tougher; foes far away are unaffected", () => {
    const c = createCamp(1);
    run(c, 0.1, { move: { x: 0, y: 0 }, callWave: true });
    c.queue.length = 0;
    c.enemies.length = 0;
    for (const p of c.plots) if (p.kind === "tower") p.level = 0;
    c.hero.x = 360; c.hero.y = 1150;
    spawnEnemy(c, { at: 0, enemy: "banner", hpMult: 1, lane: 0.5 }, { x: 200, y: 200 });
    const near = spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 1, lane: 0.5 }, { x: 240, y: 210 });
    const far = spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 1, lane: 0.5 }, { x: 600, y: 210 });
    step(c, still);
    expect(near.rallied).toBe(true);
    expect(far.rallied).toBe(false);
    expect(reduction(near)).toBeCloseTo(RALLY.armor, 5);
    expect(reduction(far)).toBe(0);
  });
});

describe("war raven", () => {
  it("dives at the nearest archer tower and stuns it (the tower stops shooting), then is spent", () => {
    const c = createCamp(1);
    run(c, 0.1, { move: { x: 0, y: 0 }, callWave: true });
    c.queue.length = 0;
    c.enemies.length = 0;
    c.hero.x = 360; c.hero.y = 1150;
    for (const p of c.plots) if (p.kind === "tower") p.level = 0;
    const t = c.plots.find((p) => p.kind === "tower")!;
    t.level = 1;
    const r = spawnEnemy(c, { at: 0, enemy: "raven", hpMult: 50, lane: 0.5 }, { x: t.x, y: t.y - 120 });
    run(c, 3);
    expect(c.enemies.includes(r)).toBe(false);
    expect(t.stun ?? 0).toBeGreaterThan(0);
    // While stunned it ignores a foe in range.
    const f = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 5, lane: 0.5 }, { x: t.x, y: t.y - 150 });
    const hp = f.hp;
    run(c, 0.5);
    expect(f.hp).toBe(hp);
  });
});

describe("tunneler", () => {
  it("digs under an intact wall (can't be hurt meanwhile) and surfaces inside the camp", () => {
    const c = createCamp(1);
    run(c, 0.1, { move: { x: 0, y: 0 }, callWave: true });
    c.queue.length = 0;
    c.enemies.length = 0;
    for (const p of c.plots) if (p.kind === "tower") p.level = 0;
    c.hero.x = 360; c.hero.y = 1150;
    const t = spawnEnemy(c, { at: 0, enemy: "tunneler", hpMult: 1, lane: 0.5 }, { x: 120, y: WALL_Y - 60 });
    let sawBurrow = false;
    for (let i = 0; i < 60 * 8 && !(t.dug && !t.burrow); i++) {
      step(c, still);
      if (t.burrow && t.burrow > 0) {
        sawBurrow = true;
        expect(reduction(t)).toBe(1);
      }
    }
    expect(sawBurrow).toBe(true);
    expect(c.segments.every((s) => s.hp === s.maxHp)).toBe(true);
    expect(t.y).toBeGreaterThan(WALL_Y);
    step(c, still);
    expect(t.inside).toBe(true);
  });
});

describe("weather", () => {
  it("is deterministic per seed+night, clear before night 3 and on breathers, and varied overall", () => {
    expect(rollWeather(7, 5, false)).toBe(rollWeather(7, 5, false));
    for (let s = 0; s < 50; s++) {
      expect(rollWeather(s, 1, false)).toBe("clear");
      expect(rollWeather(s, 2, false)).toBe("clear");
      expect(rollWeather(s, 6, true)).toBe("clear");
    }
    const seen = new Set<string>();
    for (let s = 0; s < 400; s++) seen.add(rollWeather(s, 5, false));
    expect([...seen].sort()).toEqual(["clear", "fog", "rain", "storm"]);
  });
  it("fog shortens tower range; a storm strikes foes with lightning", () => {
    const c = createCamp(1);
    run(c, 0.1, { move: { x: 0, y: 0 }, callWave: true });
    c.queue.length = 0;
    c.enemies.length = 0;
    for (const p of c.plots) if (p.kind === "tower") p.level = 0;
    c.hero.x = 360; c.hero.y = 1150;
    const t = c.plots.find((p) => p.kind === "tower")!;
    t.level = 1; t.cooldown = 0;
    // A foe at ~230 px: in range on a clear night (250), out of range in fog (250 × 0.75).
    const f = spawnEnemy(c, { at: 0, enemy: "brute", hpMult: 10, lane: 0.5 }, { x: t.x, y: t.y - 230 });
    c.weather = "fog";
    step(c, still);
    expect(c.arrows.length).toBe(0);
    c.weather = "clear";
    step(c, still);
    expect(c.arrows.length).toBeGreaterThan(0);
    c.weather = "storm";
    c.stormTimer = 0;
    const hp = f.hp;
    step(c, still);
    expect(drainEvents(c).some((e) => e.type === "stormBolt")).toBe(true);
    expect(f.hp).toBeLessThan(hp);
  });
});
