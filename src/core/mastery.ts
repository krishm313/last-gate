import { HERO_BY_ID, type HeroId } from "./heroes";
import type { SaveData } from "./meta";

/** Hero mastery: three goals per hero; all three unlock the capstone (an empowered ability). */
export const MASTERY = { nights: 60, wins: 3, casts: 100, power: 1.4, cooldown: 0.85 };

export interface MasteryGoal {
  icon: string;
  text: string;
  cur: number;
  goal: number;
}

/** Runs won with a hero (counted from now on, or from the run history for older wins). */
export function heroWins(s: SaveData, hero: HeroId): number {
  return Math.max(s.stats[`wins_${hero}`] ?? 0, s.history.filter((r) => r.won && r.hero === hero).length);
}

export function masteryGoals(s: SaveData, hero: HeroId): MasteryGoal[] {
  const h = HERO_BY_ID[hero];
  return [
    { icon: "🌙", text: `Hold ${MASTERY.nights} nights`, cur: s.heroes[hero]?.xp ?? 0, goal: MASTERY.nights },
    { icon: "🏆", text: `Win ${MASTERY.wins} runs`, cur: heroWins(s, hero), goal: MASTERY.wins },
    { icon: "⚡", text: `Use ${h.abilityName} ${MASTERY.casts} times`, cur: s.stats[`ab_${h.ability}`] ?? 0, goal: MASTERY.casts },
  ];
}

export function mastered(s: SaveData, hero: HeroId): boolean {
  return masteryGoals(s, hero).every((g) => g.cur >= g.goal);
}

/** What mastery does to this hero's ability, in a line. */
export function masteryPerk(hero: HeroId): string {
  const a = HERO_BY_ID[hero].ability;
  const what: Record<string, string> = {
    arrowRain: "42 arrows instead of 30",
    shieldBash: "the bash hits 40% harder",
    fireNova: "the nova burns 40% hotter",
    overclock: "towers stay overclocked for 7 s instead of 5",
    snare: "vines hold 40% longer",
    lance: "the lance strikes 40% harder",
    sanctuary: "heals 40% more",
    callToArms: "6 militia answer instead of 4",
    acidFlask: "the acid eats 40% faster",
  };
  return `${HERO_BY_ID[hero].abilityName}: ${what[a] ?? "40% stronger"}, and it recharges 15% faster`;
}
