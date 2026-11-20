import { describe, expect, it } from "vitest";
import { newSave, sanitizeSave } from "../src/core/meta";

/**
 * Every piece of newer save data must survive a reload (sanitizeSave whitelists ids — Boss Rush's
 * stars were once dropped this way). Set everything, round-trip through JSON + sanitize, compare.
 */
describe("save round-trip", () => {
  it("keeps every newer field through sanitizeSave", () => {
    const s = newSave();
    for (let i = 1; i <= 9; i++) s.stars[i] = 3;
    s.stars[10] = 2;
    s.stars[98] = 1;
    s.best[10] = 10;
    s.best[98] = 7;
    s.best[99] = 31;
    s.diffCleared[10] = 1;
    s.hero = "marshal";
    s.flair = "grave";
    for (const k of ["archery", "supply", "watch", "catapult", "dragon", "lanterns", "siege1", "siege2", "siege3", "siege4", "siege5"]) s.mini[k] = { best: 42, stars: 2 };
    for (const k of ["levied", "miniPlays", "miniStars", "deployed", "hollowking", "sanctified", "lanced"]) s.stats[k] = 7;
    s.claimed.push("hollow", "throne", "marshal", "bossrush", "hollowkeep", "dragonheart", "fairground");
    s.heroes.marshal.xp = 12;
    s.heroes.marshal.skills = ["edge"];
    s.quests = { day: "2026-11-21", daily: [{ id: "d-mini", start: 0, claimed: false }, { id: "d-siege", start: 1, claimed: true }], week: 5, weekly: { id: "w-minis", start: 0, claimed: false } };
    const back = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(back).toMatchObject(s); // sanitize may add defaults (e.g. every perm at 0), never drop data
  });
});
