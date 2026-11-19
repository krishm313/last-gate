/** Wall Watch balance: a bot that taps the highest climber every `react` seconds. `npx vite-node scripts/watchsim.ts [runs] [react]` */
import { createWatch, stepWatch, tap, WATCH_GAME, watchStars } from "../src/mini/wallwatch";

const runs = Number(process.argv[2] ?? 10);
const react = Number(process.argv[3] ?? 0.35);
const out: string[] = [];
for (let r = 0; r < runs; r++) {
  const s = createWatch(100 + r);
  let cd = 0;
  while (!s.over) {
    stepWatch(s, 1 / 60);
    cd -= 1 / 60;
    if (cd <= 0) {
      const target = s.climbers.filter((c) => c.fall < 0 && !c.over && c.kind !== "builder").sort((a, b) => a.y - b.y)[0];
      if (target) { tap(s, WATCH_GAME.ladders[target.ladder]!, target.y); cd = react; }
    }
  }
  out.push(`${s.score}${s.lost ? "✗" : ""}(${watchStars(s.score)}★)`);
}
console.log(`react ${react}s: ${out.join(" ")}`);
