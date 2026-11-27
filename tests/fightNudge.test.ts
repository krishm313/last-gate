import { beforeEach, describe, expect, it, vi } from "vitest";

// A1: the "foes at the wall — go fight" nudge for new players.
const store = new Map<string, string>();
vi.mock("../src/ui/store", () => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }));

describe("fight nudge (A1)", () => {
  beforeEach(() => store.clear());
  it("appears after 4 s idling far from foes at the wall, points at them, and retires after being answered twice", async () => {
    const { Tutorial } = await import("../src/camp/tutorial");
    const { CHAPTER_BY_ID } = await import("../src/core/chapters");
    const { createCamp, spawnEnemy } = await import("../src/camp/sim");
    const { WALL_Y } = await import("../src/camp/world");
    const t = new Tutorial();
    const c = createCamp(1, CHAPTER_BY_ID[1]!, {});
    c.phase = "wave";
    const e = spawnEnemy(c, { at: 0, enemy: "footman", hpMult: 1, lane: null }, { x: 600, y: WALL_Y - 25 });
    e.attacking = true;
    c.hero.x = 80; c.hero.y = WALL_Y + 80;
    for (let k = 0; k < 2; k++) {
      let got = null;
      for (let i = 0; i < 60 * 5 && !got; i++) got = t.fightNudge(c, 1 / 60);
      expect(got?.text).toMatch(/walk over/);
      expect(Math.abs(got!.at.x - 600)).toBeLessThan(5);
      c.hero.x = 590; // answer it
      expect(t.fightNudge(c, 1 / 60)).toBeNull();
      c.hero.x = 80;
    }
    expect(store.get("lastgate.tipFight")).toBe("done");
    // A ranged foe shooting from deep in the field never triggers it.
    const t2 = new Tutorial();
    e.y = WALL_Y - 200;
    for (let i = 0; i < 60 * 6; i++) expect(t2.fightNudge(c, 1 / 60)).toBeNull();
    for (let i = 0; i < 60 * 6; i++) expect(t.fightNudge(c, 1 / 60)).toBeNull();
  });
  it("tips skip ahead once night falls, and a towerless player at dawn with coins is told to build", async () => {
    const { Tutorial } = await import("../src/camp/tutorial");
    const { CHAPTER_BY_ID } = await import("../src/core/chapters");
    const { createCamp } = await import("../src/camp/sim");
    const t = new Tutorial();
    const c = createCamp(1, CHAPTER_BY_ID[1]!, {});
    c.wave = 1; c.phase = "wave";
    expect(t.update(c, 1 / 60, false)).toMatch(/shoot automatically/);
    c.phase = "build";
    c.hero.coins = 30;
    let tip = null;
    for (let i = 0; i < 60 * 3 && !tip; i++) tip = t.buildNudge(c, 1 / 60);
    expect(tip).toMatch(/build an Archer Tower/);
    c.plots.find((p) => p.kind === "tower")!.level = 1;
    expect(t.buildNudge(c, 1 / 60)).toBeNull();
  });
});
