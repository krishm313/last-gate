/** Siege Lord balance: a simple attacker spends the War Chest as it fills (cycling cards and lanes). `npx vite-node scripts/siegesim.ts [runs] [chapter] [perm]` */
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { campBotStep } from "../src/camp/bot";
import { cardOpen, createCamp, deploy, WAR_CARDS } from "../src/camp/sim";
import { campSetupFromSave } from "../src/camp/meta";
import { newSave, PERMS } from "../src/core/meta";

const runs = Number(process.argv[2] ?? 10);
const chapter = CHAPTER_BY_ID[Number(process.argv[3] ?? 1)]!;
const perm = Number(process.argv[4] ?? 0);
const won = Number(process.argv[5] ?? 0);
const hero = (process.argv[6] ?? "ranger") as "ranger";
const deck = WAR_CARDS.filter((k) => cardOpen(k, won));
const save = newSave();
for (const p of PERMS) if (!p.capstone) save.perms[p.id] = Math.min(p.max, perm);
let wins = 0;
const ended: number[] = [];
for (let r = 0; r < runs; r++) {
  const c = createCamp(900 + r, chapter, { ...campSetupFromSave(save, hero), reverse: true, siegesWon: won, hordeHp: Number(process.argv[7] ?? 1) });
  let k = 0;
  for (let i = 0; i < 60 * 60 * 20 && !c.reverse!.result; i++) {
    // Save up, then dump the chest down one lane at a time (what a player tends to do).
    if (c.phase === "wave" && c.reverse!.chest >= 24) {
      const lane = k % 3;
      while (c.reverse!.chest >= 3) {
        const card = deck[k % deck.length]!;
        if (!deploy(c, card.id, lane)) { if (c.reverse!.chest < 7) break; }
        k++;
      }
    }
    campBotStep(c);
  }
  if (c.reverse!.result === "win") wins++;
  ended.push(c.reverse!.result === "win" ? c.wave : -Math.round((c.hallHp / c.hallMaxHp) * 100));
}
console.log(`siege ch${chapter.id} defenders L${perm} (won ${won}, ${hero}): horde wins ${Math.round((wins / runs) * 100)}%  (win: push taken · loss: -hall%) ${ended.join(",")}`);
