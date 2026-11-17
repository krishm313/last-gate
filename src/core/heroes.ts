export type HeroId = "ranger" | "knight" | "pyro" | "engineer";
export type AbilityId = "arrowRain" | "shieldBash" | "fireNova" | "overclock";

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  
  ability: AbilityId;
  abilityName: string;
  abilityDesc: string;
  /** Seconds to charge the ability. */
  cooldown: number;
  /** Total stars needed to unlock. */
  starsToUnlock: number;
  color: string;
}

export const HEROES: HeroDef[] = [
  {
    id: "ranger", name: "The King", title: "Lord of the Last Gate", color: "#d4a017",
    ability: "arrowRain", abilityName: "Arrow Rain", abilityDesc: "30 arrows fall on the enemy horde.",
    cooldown: 18, starsToUnlock: 0,
  },
  {
    id: "knight", name: "Knight Captain", title: "Shield of the Gate", color: "#9aa8c0",
    ability: "shieldBash", abilityName: "Shield Bash", abilityDesc: "Knock back and stun everything around you.",
    cooldown: 20, starsToUnlock: 3,
  },
  {
    id: "pyro", name: "Pyromancer", title: "Keeper of the Flame", color: "#e05a2a",
    ability: "fireNova", abilityName: "Fire Nova", abilityDesc: "A blast of fire all around you.",
    cooldown: 16, starsToUnlock: 6,
  },
  {
    id: "engineer", name: "Engineer", title: "Master of Engines", color: "#c08a3a",
    ability: "overclock", abilityName: "Overclock", abilityDesc: "All towers fire 2.5× faster for 6s.",
    cooldown: 22, starsToUnlock: 10,
  },
];

export const HERO_BY_ID: Record<HeroId, HeroDef> = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<HeroId, HeroDef>;
