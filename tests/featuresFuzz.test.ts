import { describe, expect, it } from "vitest";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { chapterOnDifficulty, type DifficultyId } from "../src/core/difficulty";
import { ENEMIES } from "../src/core/enemies";
import { HEAT_BY_ID, HEATS } from "../src/core/heat";
import { newSave, PERMS } from "../src/core/meta";
import { createRng, next } from "../src/core/rng";
import { campSetupFromSave } from "../src/camp/meta";
import { chooseBlessing, chooseBuilding, createCamp, drainEvents, rerollBlessings, spawnEnemy, step, VISITOR, type Camp } from "../src/camp/sim";
import { STEP, WALL_Y } from "../src/camp/world";

function finite(c: Camp): boolean {
  const nums = [c.hero.x, c.hero.y, c.hero.hp, c.hallHp, c.hero.coins, c.lumberPile, c.incomePile, c.bloodmoon];
  for (const e of c.enemies) nums.push(e.x, e.y, e.hp);
  for (const s of c.segments) nums.push(s.hp);
  return nums.every(Number.isFinite);
}

/**
 * Regression bot for the newer systems together: late chapters on every difficulty with Heat on, a
 * random player who drafts buildings, takes rule cards, walks onto visitors and plays through night
 * events and Blood Moon surges. Nothing may throw, go NaN or hang.
 */
describe("regression: every new system at once", () => {
  for (const [ch, diff] of [[6, "normal"], [8, "hard"], [10, "nightmare"], [7, "hard"]] as [number, DifficultyId][]) {
    it(`chapter ${ch} on ${diff} with heat, rule cards, draft, visitors and events`, () => {
      const rng = createRng(ch * 31);
      const save = newSave();
      for (const p of PERMS) save.perms[p.id] = p.max;
      const setup = campSetupFromSave(save, "ranger");
      setup.mods = { ...setup.mods! };
      for (const h of HEATS.slice(0, 3)) {
        const d = HEAT_BY_ID[h.id]!;
        if (d.hp) setup.enemyHpMult = (setup.enemyHpMult ?? 1) * d.hp;
        if (d.wall) setup.mods.wallHp *= d.wall;
      }
      const c = createCamp(ch * 13 + 5, chapterOnDifficulty(CHAPTER_BY_ID[ch]!, diff), setup);
      const seen = new Set<string>();
      let move = { x: 0, y: 0 };
      for (let i = 0; i < 30 * 60 * 60 && c.phase !== "won" && c.phase !== "lost"; i++) {
        if (i % 40 === 0) move = { x: next(rng) * 2 - 1, y: next(rng) * 2 - 1 };
        // Walk onto today's visitor now and then (accepts shrines, pays merchants).
        if (c.visitor && !c.visitor.done && next(rng) < 0.002) { c.hero.x = c.visitor.x; c.hero.y = c.visitor.y; move = { x: 0, y: 0 }; }
        if (c.phase === "pick" && c.buildChoice) chooseBuilding(c, c.buildChoice[Math.floor(next(rng) * c.buildChoice.length)]!);
        if (c.phase === "pick") {
          if (next(rng) < 0.2) rerollBlessings(c);
          // Prefer the rule card when there is one, so rule-changers get exercised.
          const rule = c.offers.find((b) => b.rule);
          chooseBlessing(c, (rule && next(rng) < 0.7 ? rule : c.offers[Math.floor(next(rng) * c.offers.length)]!).id);
        }
        step(c, { move, callWave: next(rng) < 0.01, ability: next(rng) < 0.03 });
        for (const ev of drainEvents(c)) {
          if (ev.type === "rule") seen.add(`rule:${ev.rule}`);
          if (ev.type === "visitor") seen.add(`visitor:${ev.kind}:${ev.action}`);
          if (ev.type === "waveStart" && ev.event) seen.add(`event:${ev.event}`);
          if (ev.type === "bloodmoon") seen.add("bloodmoon");
        }
        if (i % 600 === 0) {
          c.hero.coins = Math.min(c.hero.coins + 20, 80);
          c.hero.logs = Math.min(c.hero.logs + 3, 20);
          expect(finite(c), `step ${i}`).toBe(true);
        }
      }
      expect(finite(c)).toBe(true);
      expect(["won", "lost"]).toContain(c.phase);
      // Something new should actually have happened in a full run.
      expect(seen.size, [...seen].join(", ")).toBeGreaterThan(0);
    }, 60_000);
  }

  it("every boss can spawn, use its specials and die without breaking the sim", () => {
    const bosses = Object.values(ENEMIES).filter((e) => e.boss);
    expect(bosses.length).toBeGreaterThan(5);
    for (const b of bosses) {
      const c = createCamp(7, CHAPTER_BY_ID[6]);
      c.phase = "wave";
      c.queue = [];
      const e = spawnEnemy(c, { at: 0, enemy: b.id, hpMult: 1, lane: 0.5 }, { x: 360, y: WALL_Y - 160 });
      e.hp = e.maxHp * 0.45; // second phase
      for (let i = 0; i < 20 / STEP; i++) step(c, { move: { x: 0, y: 0 }, ability: i % 300 === 0 });
      expect(finite(c), b.id).toBe(true);
      e.hp = 0;
      for (let i = 0; i < 2 / STEP; i++) step(c, { move: { x: 0, y: 0 } });
      expect(c.enemies.includes(e), b.id).toBe(false);
      expect(finite(c), b.id).toBe(true);
    }
  });
  void VISITOR;
});
