/** Mason's Tower balance: a bot that drops with a timing error of up to ±`err` s and waits `gap` s between drops. `npx vite-node scripts/masonsim.ts [runs] [err] [gap]` */
import { createMason, drop, MASON, masonStars, slideSpeed, stepMason } from "../src/mini/mason";

const runs = Number(process.argv[2] ?? 10);
const err = Number(process.argv[3] ?? 0.03);
const gap = Number(process.argv[4] ?? 0.6);
const out: string[] = [];
for (let r = 0; r < runs; r++) {
  const s = createMason();
  let seed = 17 + r * 31;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  let cool = gap, offset = 0, armed = false;
  while (!s.over) {
    stepMason(s, 1 / 60);
    cool -= 1 / 60;
    if (cool > 0) continue;
    const top = s.tower[s.tower.length - 1]!;
    if (!armed) { offset = (rnd() * 2 - 1) * err; armed = true; }
    // Time until the block's centre passes over the top block's centre (only while approaching).
    const d = (top.x - s.x) * s.dir;
    const eta = d / slideSpeed(s.tower.length - 1);
    const go = offset >= 0 ? d > 0 && eta <= offset : d <= 0 && eta <= offset && eta > offset - 0.05;
    if (go) { drop(s); cool = gap; armed = false; }
  }
  out.push(`${s.score}${s.lost ? "✗" : ""}(${masonStars(s.score)}★ h${s.tower.length - 1})`);
}
console.log(`err ${err} gap ${gap}: ${out.join(" ")} [stars ${MASON.stars}]`);
