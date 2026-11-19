import { HEROES, type HeroId } from "./heroes";

/**
 * Hero skill trees. Every night survived with a hero gives it 1 XP; XP thresholds hand out skill
 * points, spent on three short branches (learned in order, freely reset). Effects are modest —
 * a fully-trained hero is a nice edge, not a different game.
 */
export type SkillBranch = "might" | "guard" | "fortune";

export interface SkillMods {
  heroDamage: number;
  critChance: number;
  abilityCooldown: number;
  heroHp: number;
  wallHp: number;
  allyPower: number;
  carry: number;
  magnet: number;
  heroSpeed: number;
  startCoins: number;
  income: number;
  /** Capstones. */
  bossDamage: number;
  hallArmor: number;
  drops: number;
}

export interface SkillDef {
  id: string;
  branch: SkillBranch;
  /** 1..3 within the branch; needs the previous tier. */
  tier: number;
  name: string;
  icon: string;
  desc: string;
  apply: (m: SkillMods) => void;
}

export const SKILL_BRANCHES: { id: SkillBranch; name: string; icon: string }[] = [
  { id: "might", name: "Might", icon: "⚔️" },
  { id: "guard", name: "Guard", icon: "🛡️" },
  { id: "fortune", name: "Fortune", icon: "💰" },
];

export const SKILLS: SkillDef[] = [
  { id: "edge", branch: "might", tier: 1, name: "Keen Edge", icon: "🗡️", desc: "Hero damage +8%", apply: (m) => { m.heroDamage *= 1.08; } },
  { id: "aim", branch: "might", tier: 2, name: "Steady Aim", icon: "🎯", desc: "+4% critical hit chance", apply: (m) => { m.critChance += 0.04; } },
  { id: "focus", branch: "might", tier: 3, name: "Focus", icon: "⚡", desc: "Ability charges 15% faster", apply: (m) => { m.abilityCooldown *= 0.85; } },
  { id: "tough", branch: "guard", tier: 1, name: "Tough", icon: "❤️", desc: "Hero HP +15%", apply: (m) => { m.heroHp *= 1.15; } },
  { id: "mortar", branch: "guard", tier: 2, name: "Mortar", icon: "🧱", desc: "Wall HP +8%", apply: (m) => { m.wallHp *= 1.08; } },
  { id: "rally", branch: "guard", tier: 3, name: "Rally Cry", icon: "📯", desc: "Soldiers +20% HP and damage", apply: (m) => { m.allyPower *= 1.2; } },
  { id: "purse", branch: "fortune", tier: 1, name: "Deep Purse", icon: "🎒", desc: "Carry +10 coins, wider magnet", apply: (m) => { m.carry += 10; m.magnet *= 1.15; } },
  { id: "stride", branch: "fortune", tier: 2, name: "Long Stride", icon: "👢", desc: "Move 8% faster", apply: (m) => { m.heroSpeed *= 1.08; } },
  { id: "executioner", branch: "might", tier: 4, name: "Executioner", icon: "🪓", desc: "+20% damage to bosses", apply: (m) => { m.bossDamage *= 1.2; } },
  { id: "bulwark", branch: "guard", tier: 4, name: "Bulwark", icon: "🏰", desc: "The hall takes 15% less damage", apply: (m) => { m.hallArmor *= 0.85; } },
  { id: "midas", branch: "fortune", tier: 4, name: "Midas", icon: "✨", desc: "Foes drop 15% more coins", apply: (m) => { m.drops *= 1.15; } },
  { id: "mint", branch: "fortune", tier: 3, name: "Royal Mint", icon: "👑", desc: "Start with +10 coins, hall income +10%", apply: (m) => { m.startCoins += 10; m.income *= 1.1; } },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** Total nights survived with a hero needed for each skill point. */
export const SKILL_THRESHOLDS = [5, 15, 30, 50, 75, 105, 140, 180, 225, 280, 340, 400];

export interface HeroProgress {
  xp: number;
  skills: string[];
}

export function newHeroProgress(): Record<HeroId, HeroProgress> {
  return Object.fromEntries(HEROES.map((h) => [h.id, { xp: 0, skills: [] }])) as unknown as Record<HeroId, HeroProgress>;
}

export function skillPoints(xp: number): number {
  return SKILL_THRESHOLDS.filter((t) => xp >= t).length;
}

/** XP needed for the next point, or null when all points are earned. */
export function nextSkillThreshold(xp: number): number | null {
  return SKILL_THRESHOLDS.find((t) => xp < t) ?? null;
}

export function freePoints(p: HeroProgress): number {
  return skillPoints(p.xp) - p.skills.length;
}

export function canLearn(p: HeroProgress, id: string): boolean {
  const d = SKILL_BY_ID[id];
  if (!d || p.skills.includes(id) || freePoints(p) <= 0) return false;
  if (d.tier === 1) return true;
  return SKILLS.some((o) => o.branch === d.branch && o.tier === d.tier - 1 && p.skills.includes(o.id));
}

export function learnSkill(p: HeroProgress, id: string): boolean {
  if (!canLearn(p, id)) return false;
  p.skills.push(id);
  return true;
}

export function resetSkills(p: HeroProgress): void {
  p.skills = [];
}

/** Combined effect of a hero's learned skills (multipliers start at 1, additions at 0). */
export function skillMods(skills: string[]): SkillMods {
  const m: SkillMods = { heroDamage: 1, critChance: 0, abilityCooldown: 1, heroHp: 1, wallHp: 1, allyPower: 1, carry: 0, magnet: 1, heroSpeed: 1, startCoins: 0, income: 1, bossDamage: 1, hallArmor: 1, drops: 1 };
  for (const id of skills) SKILL_BY_ID[id]?.apply(m);
  return m;
}

/** Validates stored hero progress: known heroes, finite XP, learned skills legal in order. */
export function sanitizeHeroProgress(raw: unknown): Record<HeroId, HeroProgress> {
  const d = newHeroProgress();
  if (!raw || typeof raw !== "object") return d;
  for (const h of HEROES) {
    const r = (raw as Record<string, unknown>)[h.id] as Partial<HeroProgress> | undefined;
    if (!r || typeof r !== "object") continue;
    const xp = typeof r.xp === "number" && Number.isFinite(r.xp) ? Math.max(0, Math.min(1e6, Math.floor(r.xp))) : 0;
    const p: HeroProgress = { xp, skills: [] };
    // Re-learn in stored order so an edited save can't skip tiers or exceed its points.
    const want = Array.isArray(r.skills) ? r.skills.filter((x): x is string => typeof x === "string") : [];
    for (let pass = 0; pass < 3; pass++) for (const id of want) learnSkill(p, id);
    d[h.id] = p;
  }
  return d;
}
