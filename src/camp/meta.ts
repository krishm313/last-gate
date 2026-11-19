import { HERO_BY_ID, type HeroId } from "../core/heroes";
import type { SaveData } from "../core/meta";
import { skillMods } from "../core/skills";
import { activeFlair } from "../core/flair";
import { baseMods } from "./blessings";
import type { CampSetup } from "./sim";

/**
 * Share of in-run coins (battle loot) that converts into meta gold after a run. Camp runs drop far
 * more coins than the economy was planned for, so loot is converted at a reduced rate.
 */
export const LOOT_TO_GOLD = 0.3;

/** Camp-mode effect of each hero (passive + look). */
export const CAMP_HEROES: Record<HeroId, { look: string; passive: string; apply: (s: CampSetup) => void }> = {
  ranger: { look: "hero", passive: "Fires 15% faster.", apply: (s) => { s.mods!.heroRate *= 1.15; } },
  knight: { look: "hero_knight", passive: "+60% HP, +25% damage, walls +15%.", apply: (s) => { s.mods!.heroHp *= 1.6; s.mods!.heroDamage *= 1.25; s.mods!.wallHp *= 1.15; } },
  pyro: { look: "hero_pyro", passive: "Every arrow burns.", apply: (s) => { s.mods!.burn += 0.5; } },
  lancer: { look: "hero_lancer", passive: "Shoots 30% farther.", apply: (s) => { s.mods!.heroRange *= 1.3; } },
  warden: { look: "hero_warden", passive: "Every shot hits 1 extra target.", apply: (s) => { s.mods!.heroMultishot += 1; } },
  engineer: { look: "hero_engineer", passive: "Towers +25% damage, starts with a tower.", apply: (s) => { s.mods!.towerDamage *= 1.25; s.prebuilt!.push("tower-2"); } },
};

/** Turn the save's permanent upgrades + chosen hero into a run's starting setup. */
export function campSetupFromSave(save: SaveData, hero: HeroId = save.hero): CampSetup {
  const lv = (id: string) => save.perms[id] ?? 0;
  const s: CampSetup = { mods: baseMods(), startCoins: 12, prebuilt: [], critChance: 0.08 };
  const m = s.mods!;
  m.wallHp *= 1 + 0.1 * lv("walls");
  m.heroDamage *= 1 + 0.08 * lv("fletching");
  m.towerDamage *= 1 + 0.1 * lv("training");
  m.heroRate *= 1 + 0.05 * lv("drawspeed");
  if (lv("barracks") >= 1) s.prebuilt!.push("tower-1");
  if (lv("barracks") >= 2) s.prebuilt!.push("tower-3");
  m.repairAfterWave += 0.06 * lv("masons");
  s.critChance! += 0.03 * lv("keen");
  m.rerolls += lv("lucky");
  m.drops *= 1 + 0.1 * lv("treasury");
  m.income *= 1 + 0.1 * lv("treasury");
  s.startCoins! += 4 * lv("treasury");
  m.mageDamage *= 1 + 0.08 * lv("arcanum");
  m.spikeDamage *= 1 + 0.1 * lv("fieldworks");
  m.healerPower *= 1 + 0.05 * lv("fieldworks");
  m.heroDamage *= 1 + 0.03 * lv("legacy");
  m.towerDamage *= 1 + 0.03 * lv("legacy");
  m.wallHp *= 1 + 0.03 * lv("legacy");
  const h = CAMP_HEROES[hero];
  h.apply(s);
  s.heroLook = h.look;
  s.heroFlair = activeFlair(save);
  s.ability = HERO_BY_ID[hero].ability;
  s.abilityCooldown = HERO_BY_ID[hero].cooldown;
  // Hero skill tree.
  const k = skillMods(save.heroes?.[hero]?.skills ?? []);
  m.heroDamage *= k.heroDamage;
  s.critChance! += k.critChance;
  s.abilityCooldown *= k.abilityCooldown;
  m.heroHp *= k.heroHp;
  m.wallHp *= k.wallHp;
  m.allyPower *= k.allyPower;
  m.carry += k.carry;
  m.magnet *= k.magnet;
  m.heroSpeed *= k.heroSpeed;
  s.startCoins! += k.startCoins;
  m.income *= k.income;
  m.bossDamage *= k.bossDamage;
  m.hallArmor *= k.hallArmor;
  m.drops *= k.drops;
  return s;
}
