import { describe, expect, it } from "vitest";
import { CHAPTERS, ENDLESS } from "../src/core/chapters";
import { HEROES } from "../src/core/heroes";
import { newSave, PERMS } from "../src/core/meta";
import { createRng, next } from "../src/core/rng";
import { campSetupFromSave } from "../src/camp/meta";
import { chooseBlessing, createCamp, rerollBlessings, step, type Camp } from "../src/camp/sim";

function finite(c: Camp): boolean {
  const nums = [c.hero.x, c.hero.y, c.hero.hp, c.hallHp, c.hero.coins, c.hero.logs, c.hero.bows, c.lumberPile, c.incomePile];
  for (const e of c.enemies) nums.push(e.x, e.y, e.hp);
  for (const s of c.segments) nums.push(s.hp);
  return nums.every(Number.isFinite);
}

describe("fuzz: random players never break the sim", () => {
  for (const chapter of [...CHAPTERS, ENDLESS]) {
    it(`chapter ${chapter.id} with every hero and random perks`, () => {
      for (const hero of HEROES) {
        const rng = createRng(chapter.id * 100 + hero.id.length);
        const save = newSave();
        for (const p of PERMS) save.perms[p.id] = Math.floor(next(rng) * (p.max + 1));
        const c = createCamp(chapter.id * 7 + hero.id.length, chapter, campSetupFromSave(save, hero.id));
        // Rich enough to build things, so plots/forge/hall paths get exercised.
        c.hero.coins = 40;
        let move = { x: 0, y: 0 };
        const maxSteps = (chapter.endless ? 8 : 25) * 60 * 60;
        for (let i = 0; i < maxSteps && c.phase !== "won" && c.phase !== "lost"; i++) {
          if (i % 30 === 0) move = { x: next(rng) * 2 - 1, y: next(rng) * 2 - 1 };
          if (c.phase === "pick") {
            if (next(rng) < 0.3) rerollBlessings(c);
            chooseBlessing(c, c.offers[Math.floor(next(rng) * c.offers.length)]!.id);
          }
          step(c, { move, callWave: next(rng) < 0.01, ability: next(rng) < 0.02 });
          if (i % 600 === 0) {
            c.hero.coins = Math.min(c.hero.coins + 15, 60); // keep feeding coins/logs to touch more plots
            c.hero.logs = Math.min(c.hero.logs + 3, 20);
            expect(finite(c), `${hero.id} step ${i}`).toBe(true);
          }
        }
        expect(finite(c)).toBe(true);
        expect(c.hallHp).toBeGreaterThanOrEqual(0);
        expect(c.hero.coins).toBeGreaterThanOrEqual(0);
        if (!chapter.endless) expect(["won", "lost"], `${hero.id} ch${chapter.id} finished`).toContain(c.phase);
      }
    }, 60_000);
  }
});
