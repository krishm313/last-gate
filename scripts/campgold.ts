/** Gold per minute by difficulty (bot runs): `npx vite-node scripts/campgold.ts <chapter> <permLevel> [runs]` */
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { campBotStep } from "../src/camp/bot";
import { createCamp } from "../src/camp/sim";
import { campSetupFromSave, LOOT_TO_GOLD } from "../src/camp/meta";
import { applyRun, newSave, PERMS } from "../src/core/meta";
import { chapterOnDifficulty, DIFF_BY_ID, type DifficultyId } from "../src/core/difficulty";
const [ch, perm, n] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4] ?? 8)];
for (const d of ["normal", "hard", "nightmare"] as DifficultyId[]) {
  let gold = 0, mins = 0, wins = 0;
  for (let r = 0; r < n; r++) {
    const save = newSave();
    for (const p of PERMS) save.perms[p.id] = Math.min(p.max, perm);
    save.stars[ch] = 1; // replaying a cleared chapter (no first-clear bonus on Normal)
    save.diffCleared[ch] = 2;
    const s = campSetupFromSave(save);
    s.enemyHpMult = DIFF_BY_ID[d].hp;
    s.eliteChance = DIFF_BY_ID[d].elite;
    const c = createCamp(700 + r, chapterOnDifficulty(CHAPTER_BY_ID[ch]!, d), s);
    for (let i = 0; i < 60 * 60 * 30 && c.phase !== "won" && c.phase !== "lost"; i++) campBotStep(c);
    const won = c.phase === "won";
    if (won) wins++;
    const rw = applyRun(save, { chapter: ch, won, wave: c.wave, gateFrac: c.hallHp / c.hallMaxHp, goldFromKills: Math.round(c.goldEarned * LOOT_TO_GOLD), difficulty: d });
    gold += rw.gold;
    mins += c.time / 60;
  }
  console.log(`ch${ch} L${perm} ${d.padEnd(9)} win ${Math.round((wins / n) * 100)}%  gold/run ${Math.round(gold / n)}  gold/min ${(gold / mins).toFixed(1)}`);
}
