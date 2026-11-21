import { carryCap, chooseBlessing, chooseTowerSpec, towersAwaitingSpec, LUMBER_PILE, type TowerSpec, plotCost, plotLogCost, plotMaxed, siegeRepairLocked, step, type Camp, type CampInput, type Plot, type Vec } from "./sim";
import { GATE_SEGMENTS, INCOME_PILE, SEGMENT_W, WALL_Y } from "./world";

const GATE_X = ((GATE_SEGMENTS[0]! + GATE_SEGMENTS[GATE_SEGMENTS.length - 1]! + 1) / 2) * SEGMENT_W;

/**
 * Scripted camp player for balance sims and tests. Greedy: collect coins, pour them into the
 * cheapest useful plot, repair a battered wall, and fight from just behind the gate during waves.
 */
export function campBotInput(c: Camp): CampInput {
  const h = c.hero;
  if (h.dead) return { move: { x: 0, y: 0 } };
  const go = (dest: Vec): CampInput => {
    // The wall only opens at the gate: route through it when crossing sides.
    let t = dest;
    const heroOut = h.y < WALL_Y;
    const destOut = dest.y < WALL_Y;
    if (heroOut !== destOut && Math.abs(h.x - GATE_X) > 20) t = { x: GATE_X, y: heroOut ? WALL_Y - 40 : WALL_Y + 40 };
    else if (heroOut !== destOut) t = { x: GATE_X, y: dest.y };
    const dx = t.x - h.x;
    const dy = t.y - h.y;
    const d = Math.hypot(dx, dy);
    return { move: d < 6 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d } };
  };

  // 0. A building on fire (Fire Imp): go and stamp it out.
  const burning = c.plots.find((p) => (p.fire ?? 0) > 0.3);
  if (burning) return go({ x: burning.x, y: burning.y });

  // 1. Loose coins nearby (inside the wall, or just outside when no enemies are close).
  const safe = (v: Vec) => v.y > WALL_Y + 10 || c.enemies.every((e) => Math.hypot(e.x - v.x, e.y - v.y) > 120);
  let coin: Vec | null = null;
  let best = 1e9;
  for (const k of c.coins) {
    const d = Math.hypot(k.x - h.x, k.y - h.y);
    if (d < best && safe(k)) {
      best = d;
      coin = k;
    }
  }
  if (coin && h.coins < carryCap(c) && best < 400) return go(coin);

  // 2. Spend: wall repair if badly damaged, otherwise the cheapest unfinished plot we can afford soon.
  const wallFrac = c.segments.reduce((a, s) => a + s.hp / s.maxHp, 0) / c.segments.length;
  const repair = c.plots.find((p) => p.kind === "repair");
  // Only consider plots whose log needs we can actually meet; prefer a couple of towers before the lumber camp.
  const towersBuilt = c.plots.filter((p) => p.kind === "tower" && p.level > 0).length;
  const candidates = c.plots.filter(
    (p) => !plotMaxed(p) && !p.locked && p.kind !== "repair" && p.kind !== "forge" && plotLogCost(p) - p.paidLogs <= h.logs + c.lumberPile && !(p.kind === "lumber" && towersBuilt < 2),
  );
  let target: Plot | undefined;
  const breached = c.segments.some((sg) => sg.hp <= 0);
  // (Siege Lord: the castle can't repair mid-push — see updatePaying — so the bot doesn't wait at it.)
  const canRepair = !siegeRepairLocked(c);
  if (repair && canRepair && (wallFrac < 0.6 || breached) && h.coins >= plotCost(repair) - repair.paid) target = repair;
  else {
    // Half the bot's runs (by seed) also favour the newer buildings from night 5, so balance runs
    // measure them too (they're pricey and the cheapest-first rule would never reach them).
    const explorer = c.seed % 2 === 1 && c.wave >= 5;
    const price = (p: Plot) => (plotCost(p) - p.paid) * (explorer && p.level === 0 && (p.kind === "mage" || p.kind === "healer" || p.kind === "watch") ? 0.35 : 1);
    target = candidates.sort((a, b) => price(a) - price(b))[0];
  }
  if (target) {
    const needLogs = plotLogCost(target) - target.paidLogs;
    if (needLogs > h.logs && c.lumberPile > 0 && h.logs < 20) return go(LUMBER_PILE);
    const coinsOk = h.coins >= Math.min(plotCost(target) - target.paid, 25) && (plotCost(target) > target.paid ? h.coins > 0 : true);
    if (coinsOk && needLogs <= h.logs) return go(target);
  }

  // 3. Grab the hall's income.
  if (c.incomePile >= 5 && h.coins < carryCap(c)) return go(INCOME_PILE);

  // 4. During a wave, fight from behind the gate — but go out and hunt stragglers nothing can reach.
  if (c.phase === "wave") {
    const nearest = [...c.enemies].sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (nearest && c.queue.length === 0 && c.enemies.length <= 3 && Math.hypot(nearest.x - h.x, nearest.y - h.y) > 160) {
      return go({ x: nearest.x, y: nearest.y + 120 });
    }
    return go({ x: 360, y: WALL_Y + 70 });
  }
  return { ...go(INCOME_PILE), callWave: c.timer > 3 && h.coins < 5 && c.incomePile < 5 };
}

const BOT_PREF = ["drills", "eagle", "volley", "fire", "inferno", "wildfire", "frost", "split", "blades", "ricochet", "sharp", "cull", "quick", "goldvolley", "boulders", "soldiers", "walls", "maiden", "thorns", "masons", "guard", "woodsmen", "tax", "bounty", "pockets", "vigor", "smith", "boots", "banner", "lucky"];

/** The bot's blessing choice: a fixed preference order. */
export function campBotPick(c: Camp): string {
  // Unknown ids rank last (indexOf -1 would otherwise sort them first).
  const rank = (id: string) => (BOT_PREF.includes(id) ? BOT_PREF.indexOf(id) : BOT_PREF.length);
  return [...c.offers].sort((a, b) => rank(a.id) - rank(b.id))[0]!.id;
}

/** One sim step driven by the bot, including blessing picks. */
export function campBotStep(c: Camp): void {
  c.botDriven = true;
  if (c.phase === "pick") chooseBlessing(c, campBotPick(c));
  // Specialise towers in rotation (frost by the gate, fire and volley on the flanks).
  const ROT: TowerSpec[] = ["fire", "frost", "volley"];
  for (const p of towersAwaitingSpec(c)) chooseTowerSpec(c, p.id, ROT[c.plots.indexOf(p) % 3]!);
  const input = campBotInput(c);
  // Use the ability when there's a crowd nearby.
  // (The Cleric's Sanctuary is a heal: cast it when the hall or a wall section is hurt instead.)
  input.ability = c.abilityCharge >= 1 && (c.ability === "sanctuary"
    ? c.hallHp < c.hallMaxHp * 0.85 || c.segments.some((sg) => sg.hp > 0 && sg.hp < sg.maxHp * 0.6)
    : c.ability === "acidFlask"
      ? c.enemies.filter((e) => !e.def.flying && e.y > 120).length >= 6
      : c.enemies.filter((e) => Math.hypot(e.x - c.hero.x, e.y - c.hero.y) < 220).length >= 4);
  step(c, input);
}
