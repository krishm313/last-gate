/** Balance A/B: classic bot (even seeds) vs explorer bot that builds Mage/Healer/Watchtower (odd seeds). `npx vite-node scripts/campsplit.ts <chapter> <permLevel> [runs]` */
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { campBotStep } from "../src/camp/bot";
import { createCamp } from "../src/camp/sim";
import { campSetupFromSave } from "../src/camp/meta";
import { newSave, PERMS } from "../src/core/meta";
const [ch, perm, n] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4] ?? 16)];
const save = newSave();
for (const p of PERMS) save.perms[p.id] = Math.min(p.max, perm);
const res = { 0: [0, 0], 1: [0, 0] } as Record<number, number[]>;
const built: Record<string, number> = {};
for (let r = 0; r < n; r++) {
  const c = createCamp(500 + r, CHAPTER_BY_ID[ch]!, campSetupFromSave(save));
  for (let i = 0; i < 60 * 60 * 30 && c.phase !== "won" && c.phase !== "lost"; i++) campBotStep(c);
  const k = (500 + r) % 2;
  res[k]![1]++;
  if (c.phase === "won") res[k]![0]++;
  if (k === 1) for (const p of c.plots) if (["mage", "healer", "watch"].includes(p.kind) && p.level > 0) built[p.kind] = (built[p.kind] ?? 0) + 1;
}
console.log(`ch${ch} L${perm}: classic ${res[0]![0]}/${res[0]![1]}, explorer ${res[1]![0]}/${res[1]![1]}, explorer built`, built);
