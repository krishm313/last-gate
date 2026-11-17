/**
 * Whole-campaign simulator: the bot plays run after run, banks gold, buys the cheapest permanent
 * upgrade it can afford, and pushes the furthest unlocked chapter. Reports how many runs/minutes
 * it takes to clear each chapter.   npm run metasim -- [maxRuns] [seed]
 */
import { campBotStep } from "../src/camp/bot";
import { campSetupFromSave, LOOT_TO_GOLD } from "../src/camp/meta";
import { createCamp } from "../src/camp/sim";
import { CHAPTER_BY_ID, CHAPTERS } from "../src/core/chapters";
import { applyRun, buyPerm, canBuy, chapterUnlocked, newSave, PERMS, permCost } from "../src/core/meta";

const maxRuns = Number(process.argv[2] ?? 60);
const seed = Number(process.argv[3] ?? 1);
const save = newSave();
let minutes = 0;
const cleared: Record<number, { run: number; minutes: number }> = {};

for (let run = 1; run <= maxRuns; run++) {
  const ch = [...CHAPTERS].reverse().find((c) => chapterUnlocked(save, c.id) && !(save.stars[c.id] ?? 0)) ?? CHAPTERS[CHAPTERS.length - 1]!;
  const c = createCamp(seed * 1000 + run, CHAPTER_BY_ID[ch.id]!, campSetupFromSave(save));
  for (let i = 0; i < 60 * 60 * 30 && c.phase !== "won" && c.phase !== "lost"; i++) campBotStep(c);
  minutes += c.time / 60;
  const won = c.phase === "won";
  const r = applyRun(save, { chapter: ch.id, won, wave: c.wave, gateFrac: c.hallHp / c.hallMaxHp, goldFromKills: Math.round(c.goldEarned * LOOT_TO_GOLD) });
  // Spend: cheapest affordable perm, repeatedly.
  for (;;) {
    const options = PERMS.filter((p) => canBuy(save, p.id)).sort((a, b) => permCost(a, save.perms[a.id] ?? 0) - permCost(b, save.perms[b.id] ?? 0));
    if (!options.length) break;
    buyPerm(save, options[0]!.id);
  }
  if (won && !cleared[ch.id]) cleared[ch.id] = { run, minutes: Math.round(minutes) };
  console.log(`run ${String(run).padStart(2)} ch${ch.id} ${won ? "WON " : "lost"} w${c.wave}  +${r.gold}g  perms ${PERMS.map((p) => save.perms[p.id] ?? 0).join("")}`);
  if (save.stars[5]) break;
}
console.log("\nfirst clears:", Object.entries(cleared).map(([k, v]) => `ch${k}@run${v.run} (${v.minutes}min)`).join("  "));
