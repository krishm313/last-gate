/** Ghost Lanterns balance: a bot that taps every `react` s — the most urgent wraith, else the lowest lantern. `npx vite-node scripts/lanternsim.ts [runs] [react]` */
import { createLanterns, LANTERN, lanternStars, stepLanterns, tapLantern } from "../src/mini/lanterns";

const runs = Number(process.argv[2] ?? 10);
const react = Number(process.argv[3] ?? 0.3);
const out: string[] = [];
for (let r = 0; r < runs; r++) {
  const s = createLanterns(700 + r);
  let cd = 0;
  while (!s.over) {
    stepLanterns(s, 1 / 60);
    cd -= 1 / 60;
    if (cd > 0) continue;
    const w = s.wraiths.filter((k) => k.gone < 0).sort((a, b) => b.y - a.y)[0];
    const low = s.lamps.map((l, i) => ({ l, i })).filter((o) => o.l.lit).sort((a, b) => a.l.oil - b.l.oil)[0];
    if (low && low.l.oil < 0.3) tapLantern(s, LANTERN.xs[low.i]!, LANTERN.y);
    else if (w) tapLantern(s, w.x, w.y);
    else if (low && low.l.oil < 0.6) tapLantern(s, LANTERN.xs[low.i]!, LANTERN.y);
    else continue;
    cd = react;
  }
  out.push(`${s.score}${s.lost ? "✗" : ""}(${lanternStars(s.score)}★)`);
}
console.log(`react ${react}s: ${out.join(" ")}`);
