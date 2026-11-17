import { describe, expect, it } from "vitest";
import { campBotStep } from "../src/camp/bot";
import { CAMP, applyBlessing, chooseBlessing, createCamp, drainEvents, plotCost, step, type Camp } from "../src/camp/sim";
import { STEP, WALL_Y } from "../src/camp/world";

const still = { move: { x: 0, y: 0 } };
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
