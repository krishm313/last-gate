/** Dragon Dodge balance: a bot that walks to the nearest safe coin and flees marks, re-deciding every `react` s. `npx vite-node scripts/dragonsim.ts [runs] [react]` */
import { createDragon, DRAGON, dragonStars, inBlast, steerTo, stepDragon } from "../src/mini/dragon";

const runs = Number(process.argv[2] ?? 10);
const react = Number(process.argv[3] ?? 0.2);
const out: string[] = [];
for (let r = 0; r < runs; r++) {
  const s = createDragon(500 + r);
  let cd = 0;
  while (!s.over) {
    stepDragon(s, 1 / 60);
    cd -= 1 / 60;
    if (cd > 0) continue;
    cd = react;
    const danger = (x: number, y: number) => s.blasts.some((b) => !b.fired && inBlast(b, x, y, DRAGON.kingR + 6));
    // Candidate spots: coins first, then a ring of escape points; pick the nearest safe one.
    const cands: [number, number, number][] = s.coins.map((c) => [c.x, c.y, 0]);
    for (let a = 0; a < 16; a++) for (const rad of [60, 110]) cands.push([s.x + Math.cos(a / 16 * Math.PI * 2) * rad, s.y + Math.sin(a / 16 * Math.PI * 2) * rad, 40]);
    const ok = cands.filter(([x, y]) => x > DRAGON.x0 && x < DRAGON.x1 && y > DRAGON.y0 && y < DRAGON.y1 && !danger(x, y));
    if (danger(s.x, s.y) || s.coins.length) {
      const best = ok.sort((a, b) => Math.hypot(a[0] - s.x, a[1] - s.y) + a[2] - (Math.hypot(b[0] - s.x, b[1] - s.y) + b[2]))[0];
      if (best) steerTo(s, best[0], best[1]);
    }
  }
  out.push(`${s.score}${s.lost ? "✗" : ""}(${dragonStars(s.score)}★)`);
}
console.log(`react ${react}s: ${out.join(" ")}`);
