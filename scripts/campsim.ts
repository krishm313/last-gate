/** Camp balance simulator: `npm run campsim -- [runs] [chapter] [permLevel] [hero] [difficulty]` */
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { campBotStep } from "../src/camp/bot";
import { campLayout, createCamp, drainEvents } from "../src/camp/sim";
import { applyBanner, campSetupFromSave } from "../src/camp/meta";
import type { BannerId } from "../src/core/banners";
import { newSave, PERMS } from "../src/core/meta";
import { chapterOnDifficulty, DIFF_BY_ID, type DifficultyId } from "../src/core/difficulty";

const runs = Number(process.argv[2] ?? 20);
const chapter = CHAPTER_BY_ID[Number(process.argv[3] ?? 1)]!;
const permLevel = Number(process.argv[4] ?? 0);
const save = newSave();
for (const p of PERMS) if (!p.capstone) save.perms[p.id] = Math.min(p.max, permLevel);
const hero = (process.argv[5] ?? "ranger") as Parameters<typeof campSetupFromSave>[1];
const diff = DIFF_BY_ID[(process.argv[6] ?? "normal") as DifficultyId];
// Same as a real run: difficulty HP + elites through the setup, speed and gate damage through the chapter.
// BANNER=<id> flies a War Banner for every run (default none).
const setup = () => { const s = campSetupFromSave(save, hero); if (process.env.BANNER) applyBanner(s, process.env.BANNER as BannerId); return diff.rank > 0 ? { ...s, enemyHpMult: (s.enemyHpMult ?? 1) * diff.hp, eliteChance: diff.elite } : s; };
const played = chapterOnDifficulty(chapter, diff.id);
const reached: number[] = [];
let wins = 0;
let secs = 0;
const hallLost = new Map<number, number>();
const breaches = new Map<number, number>();
let built = "";
for (let r = 0; r < runs; r++) {
  // LAYOUT=classic | mirror forces a camp layout; default: hashed per run like the game.
  const L = process.env.LAYOUT;
  const layout = L === "classic" ? campLayout(false) : L === "mirror" ? campLayout(true) : undefined;
  const c = createCamp(500 + r, played, layout ? { ...setup(), layout } : setup());
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
console.log(`perms L${permLevel} chapter ${chapter.id}${diff.rank ? ` (${diff.name})` : ""}: win ${Math.round((wins / runs) * 100)}%  avg ${(secs / runs / 60).toFixed(1)}min  ended ${[...hist].sort((a, b) => a[0] - b[0]).map(([w, n]) => `w${w}:${n}`).join(" ")}`);
console.log("  hall dmg/wave:", [...hallLost].sort((a, b) => a[0] - b[0]).map(([w, d]) => `w${w}:${Math.round(d / runs)}`).join(" "));
console.log("  breaches/wave:", [...breaches].sort((a, b) => a[0] - b[0]).map(([w, d]) => `w${w}:${(d / runs).toFixed(1)}`).join(" "));
console.log("  run0 plots:", built);
