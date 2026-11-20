/** Royal Forge balance: a bot that aims at the zone centre with a timing error of up to ±`err` s and at most one tap per `gap` s. `npx vite-node scripts/forgesim.ts [runs] [err] [gap]` */
import { createForge, FORGE, forgeSpeed, forgeStars, stepForge, strike } from "../src/mini/forge";

const runs = Number(process.argv[2] ?? 10);
const err = Number(process.argv[3] ?? 0.04);
const gap = Number(process.argv[4] ?? 0.4);
const out: string[] = [];
for (let r = 0; r < runs; r++) {
  const s = createForge(900 + r);
  let seed = 77 + r * 13;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  let cool = 0, offset = 0, armed = false;
  while (!s.over) {
    stepForge(s, 1 / 60);
    cool -= 1 / 60;
    if (cool > 0) continue;
    // Tap `offset` seconds away from the moment the marker crosses the centre.
    const d = (s.zone - s.pos) * s.dir; // >0: approaching
    if (!armed) { offset = (rnd() * 2 - 1) * err; armed = true; }
    const eta = d / forgeSpeed(s.time);
    // Early taps fire while approaching; late taps fire just after the marker passes the centre.
    const go = offset >= 0 ? d > 0 && eta <= offset : d <= 0 && eta <= offset && eta > offset - 0.05;
    if (go) { strike(s); cool = gap; armed = false; }
  }
  out.push(`${s.score}${s.lost ? "✗" : ""}(${forgeStars(s.score)}★ b${s.blades})`);
}
console.log(`err ${err} gap ${gap}: ${out.join(" ")} [stars ${FORGE.stars}]`);
