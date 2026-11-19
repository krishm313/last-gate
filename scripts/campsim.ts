/** Camp balance simulator: `npm run campsim -- [runs] [chapter] [permLevel] [hero]` */
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { campBotStep } from "../src/camp/bot";
import { createCamp, drainEvents } from "../src/camp/sim";
import { campSetupFromSave } from "../src/camp/meta";
import { newSave, PERMS } from "../src/core/meta";

const runs = Number(process.argv[2] ?? 20);
const chapter = CHAPTER_BY_ID[Number(process.argv[3] ?? 1)]!;
const permLevel = Number(process.argv[4] ?? 0);
const save = newSave();
for (const p of PERMS) if (!p.capstone) save.perms[p.id] = Math.min(p.max, permLevel);
const hero = (process.argv[5] ?? "ranger") as Parameters<typeof campSetupFromSave>[1];
const setup = () => campSetupFromSave(save, hero);
const reached: number[] = [];
let wins = 0;
let secs = 0;
const hallLost = new Map<number, number>();
const breaches = new Map<number, number>();
let built = "";
for (let r = 0; r < runs; r++) {
  const c = createCamp(500 + r, chapter, setup());
  for (let i = 0; i < 60 * 60 * 30 && c.phase !== "won" && c.phase !== "lost"; i++) {
    campBotStep(c);
    for (const e of drainEvents(c)) {
      if (e.type === "hallHit") hallLost.set(c.wave, (hallLost.get(c.wave) ?? 0) + e.damage);
      if (e.type === "wallBreak") breaches.set(c.wave, (breaches.get(c.wave) ?? 0) + 1);
    }
  }
  reached.push(c.wave);
  secs += c.time;
  if (c.phase === "won") wins++;
  if (r === 0) built = c.plots.map((p) => `${p.id}:${p.level}`).join(" ");
}
const hist = new Map<number, number>();
for (const w of reached) hist.set(w, (hist.get(w) ?? 0) + 1);
console.log(`perms L${permLevel} chapter ${chapter.id}: win ${Math.round((wins / runs) * 100)}%  avg ${(secs / runs / 60).toFixed(1)}min  ended ${[...hist].sort((a, b) => a[0] - b[0]).map(([w, n]) => `w${w}:${n}`).join(" ")}`);
console.log("  hall dmg/wave:", [...hallLost].sort((a, b) => a[0] - b[0]).map(([w, d]) => `w${w}:${Math.round(d / runs)}`).join(" "));
console.log("  breaches/wave:", [...breaches].sort((a, b) => a[0] - b[0]).map(([w, d]) => `w${w}:${(d / runs).toFixed(1)}`).join(" "));
console.log("  run0 plots:", built);
