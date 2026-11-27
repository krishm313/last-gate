import { ACHIEVEMENTS } from "./achievements";
import { CHAPTERS } from "./chapters";
import { chapterUnlocked, endlessMilestoneReward, nextEndlessMilestone, totalStars, type SaveData } from "./meta";
import { BANNER_BY_ID } from "./banners";
import { CONQUEST, CONQUEST_BANNERS, conquestDone, conquestEntry } from "./conquest";
import { nextSkillThreshold, SKILL_THRESHOLDS } from "./skills";
import { HERO_BY_ID } from "./heroes";

/** Where tapping a goal takes the player. */
export type GoalAction = { kind: "chapter"; id: number } | { kind: "tab"; tab: "trophies" | "heroes" };

export interface Goal {
  key: string;
  icon: string;
  text: string;
  /** 0..1 (how close). */
  progress: number;
  /** Short progress label, e.g. "12 / 25". */
  label: string;
  /** Gold reward if any. */
  reward?: number;
  action: GoalAction;
}

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/**
 * "What's next?" for the hub: up to `max` concrete targets, most reachable first, mixing kinds so the
 * list isn't three trophies in a row. Chapter goals first (clear the next chapter / finish its stars),
 * then the nearest unearned trophies, the hero's next skill point and the next Endless milestone.
 */
export function nextGoals(s: SaveData, max = 3): Goal[] {
  const chapter: Goal[] = [];
  for (const ch of CHAPTERS) {
    if (!chapterUnlocked(s, ch.id)) continue;
    const st = s.stars[ch.id] ?? 0;
    if (st === 0) chapter.push({ key: `clear-${ch.id}`, icon: "🚩", text: `Clear ${ch.name}`, progress: 0, label: "Not cleared", action: { kind: "chapter", id: ch.id } });
    else if (st < 3) chapter.push({ key: `stars-${ch.id}`, icon: "⭐", text: `Earn ★★★ on ${ch.name}`, progress: st / 3, label: `${"★".repeat(st)}${"☆".repeat(3 - st)}`, action: { kind: "chapter", id: ch.id } });
  }
  const trophies: Goal[] = ACHIEVEMENTS.filter((a) => !s.claimed.includes(a.id))
    .map((a) => ({ a, p: Math.min(a.goal, a.progress(s)) }))
    .filter(({ a, p }) => p < a.goal)
    .sort((x, y) => y.p / y.a.goal - x.p / x.a.goal || x.a.goal - y.a.goal)
    .map(({ a, p }) => ({ key: `ach-${a.id}`, icon: a.icon, text: `${a.name}: ${a.desc}`, progress: p / a.goal, label: a.goal > 1 ? `${fmt(p)} / ${fmt(a.goal)}` : "Not yet", reward: a.reward, action: { kind: "tab", tab: "trophies" } as const }));
  const extra: Goal[] = [];
  const hp = s.heroes[s.hero];
  if (hp) {
    const next = nextSkillThreshold(hp.xp);
    if (next) {
      const prev = [0, ...SKILL_THRESHOLDS].filter((t) => t <= hp.xp).pop() ?? 0;
      extra.push({ key: "skill", icon: "★", text: `Next skill point for ${HERO_BY_ID[s.hero].name}`, progress: (hp.xp - prev) / (next - prev), label: `${hp.xp} / ${next} nights`, action: { kind: "tab", tab: "heroes" } });
    }
  }
  if (chapterUnlocked(s, 99)) {
    const m = nextEndlessMilestone(s);
    const best = s.best[99] ?? 0;
    extra.push({ key: "endless", icon: "♾️", text: `Reach night ${m} in Endless`, progress: Math.min(1, best / m), label: `Best: night ${best}`, reward: endlessMilestoneReward(m), action: { kind: "chapter", id: 99 } });
  }
  // Conquest: the next milestone under your banner (or a nudge to fly one), once chapter 1 is cleared.
  let conquestGoal: Goal | null = null;
  if ((s.stars[1] ?? 0) > 0) {
    const stars = totalStars(s);
    const flying = s.banner && s.banner !== "none" && stars >= BANNER_BY_ID[s.banner].stars ? s.banner : null;
    const cands = CONQUEST_BANNERS.filter((b) => stars >= b.stars).sort((a, b) => (a.id === flying ? -1 : b.id === flying ? 1 : 0));
    for (const b of cands) {
      const e = conquestEntry(s.conquest, b.id);
      const done = conquestDone(e);
      if (done === 3) continue;
      const step = !e.win ? { text: "win a chapter", reward: CONQUEST.gold.win, action: { kind: "chapter", id: Math.max(1, ...CHAPTERS.filter((c) => chapterUnlocked(s, c.id)).map((c) => c.id)) } as const }
        : !e.ch10 && chapterUnlocked(s, 10) ? { text: "win chapter 10", reward: CONQUEST.gold.ch10, action: { kind: "chapter", id: 10 } as const }
        : e.endless < CONQUEST.endlessGoal && chapterUnlocked(s, 99) ? { text: `hold ${CONQUEST.endlessGoal} Endless nights`, reward: CONQUEST.gold.endless, action: { kind: "chapter", id: 99 } as const }
        : null;
      if (!step) continue;
      conquestGoal = { key: `cq-${b.id}`, icon: b.icon, text: `${flying === b.id ? "" : "Fly "}${b.name}: ${step.text}`, progress: done / 3, label: `Conquest ${done} / 3`, reward: step.reward, action: step.action };
      break;
    }
  }
  // Interleave: one chapter goal, then the nearest trophies and extras by closeness.
  const out: Goal[] = [];
  if (chapter[0]) out.push(chapter[0]);
  // A campaign graduate's first goal is the Conquest board (otherwise it would sort last at 0%).
  if (conquestGoal && (!chapter.length || out.length < max)) out.push(conquestGoal);
  const rest = [...chapter.slice(1), ...trophies, ...extra].sort((a, b) => b.progress - a.progress);
  for (const g of rest) {
    if (out.length >= max) break;
    // At most two trophies, so the list keeps some variety.
    if (g.key.startsWith("ach-") && out.filter((o) => o.key.startsWith("ach-")).length >= 2) continue;
    out.push(g);
  }
  return out;
}
