import { describe, expect, it } from "vitest";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { newSave, sanitizeSave } from "../src/core/meta";
import { BANNERS } from "../src/core/banners";
import { applyBanner, bannerFor, campSetupFromSave } from "../src/camp/meta";
import { createCamp } from "../src/camp/sim";

const camp = (id: Parameters<typeof applyBanner>[1]) => { const s = campSetupFromSave(newSave()); applyBanner(s, id); return createCamp(3, CHAPTER_BY_ID[3]!, s); };

describe("War Banners (B1)", () => {
  it("pick survives reload and needs its stars", () => {
    const s = newSave();
    for (let i = 1; i <= 4; i++) s.stars[i] = 3; // 12 stars
    s.banner = "engineers";
    expect(bannerFor(sanitizeSave(JSON.parse(JSON.stringify(s))))).toBe("engineers");
    s.banner = "pyre";
    expect(bannerFor(s)).toBe("none");
  });
  it("each banner really changes the run", () => {
    const base = camp("none");
    const tower = (c: ReturnType<typeof camp>) => c.plots.find((p) => p.id === "tower-1")!;
    expect(tower(camp("bastion")).costs[0]).toBeGreaterThan(tower(base).costs[0]!);
    expect(camp("bastion").segments[0]!.maxHp).toBeGreaterThan(base.segments[0]!.maxHp);
    expect(camp("hunter").mods.drops).toBe(base.mods.drops * 2);
    expect(camp("hoard").hero.coins).toBe(base.hero.coins + 60);
    const eng = camp("engineers");
    expect(eng.plots.filter((p) => p.kind === "catapult" || p.kind === "mage").every((p) => !p.locked)).toBe(true);
    expect(tower(eng).maxLevel).toBe(3);
    expect(camp("levy").plots.find((p) => p.kind === "barracks")!.locked).toBe(false);
    expect(camp("pyre").mods.burn).toBeGreaterThan(base.mods.burn);
  });
  it("every banner has an upside and (except none) a cost", () => {
    for (const b of BANNERS) { expect(b.up.length).toBeGreaterThan(5); if (b.id !== "none") expect(b.down.length).toBeGreaterThan(5); }
  });
});
