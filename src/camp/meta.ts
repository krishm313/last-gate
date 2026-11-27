import { BANNER_BY_ID, type BannerId } from "../core/banners";
import { PET_BY_ID, type PetId } from "../core/pets";
import { WEAPON_BY_ID, type WeaponId } from "../core/weapons";
import { HERO_BY_ID, vetLookOn, type HeroId } from "../core/heroes";
import { ASCEND, type SaveData, totalStars } from "../core/meta";
import { MASTERY, mastered } from "../core/mastery";
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
  ranger: { look: "hero", passive: "Fires 25% faster.", apply: (s) => { s.mods!.heroRate *= 1.25; } },
  knight: { look: "hero_knight", passive: "+60% HP, +25% damage, walls +15%.", apply: (s) => { s.mods!.heroHp *= 1.6; s.mods!.heroDamage *= 1.25; s.mods!.wallHp *= 1.15; } },
  pyro: { look: "hero_pyro", passive: "Every arrow burns.", apply: (s) => { s.mods!.burn += 0.5; } },
  marshal: { look: "hero_marshal", passive: "Soldiers have 25% more health.", apply: (s) => { s.mods!.allyPower *= 1.25; } },
  alchemist: { look: "hero_alchemist", passive: "Foes drop 15% more coins.", apply: (s) => { s.mods!.drops *= 1.15; } },
  cleric: { look: "hero_cleric", passive: "The hall's archers hit 15% harder.", apply: (s) => { s.mods!.hallDamage *= 1.15; } },
  lancer: { look: "hero_lancer", passive: "Shoots 30% farther.", apply: (s) => { s.mods!.heroRange *= 1.3; } },
  warden: { look: "hero_warden", passive: "Every shot hits 1 extra target.", apply: (s) => { s.mods!.heroMultishot += 1; } },
  engineer: { look: "hero_engineer", passive: "Towers +25% damage, starts with a tower.", apply: (s) => { s.mods!.towerDamage *= 1.25; s.prebuilt!.push("tower-2"); } },
};

/** Turn the save's permanent upgrades + chosen hero into a run's starting setup. */
/** The weapon the King carries: the saved pick if it's unlocked, else the hero's own attack. */
export function weaponFor(save: SaveData): WeaponId {
  const w = save.weapon ? WEAPON_BY_ID[save.weapon] : undefined;
  return w && totalStars(save) >= w.stars ? w.id : "own";
}
/** The pet that comes along: the saved pick if it's unlocked, else none. */
export function petFor(save: SaveData): PetId {
  const p = save.pet ? PET_BY_ID[save.pet] : undefined;
  return p && totalStars(save) >= p.stars ? p.id : "none";
}
/** The banner a campaign run flies: the saved pick if it's unlocked, else none. */
export function bannerFor(save: SaveData): BannerId {
  const b = save.banner ? BANNER_BY_ID[save.banner] : undefined;
  return b && totalStars(save) >= b.stars ? b.id : "none";
}
/** Apply a War Banner's levers to a run setup. */
export function applyBanner(s: CampSetup, id: BannerId): void {
  const m = s.mods!;
  if (id === "bastion") { m.wallHp *= 1.3; m.repairAfterWave += 0.1; s.costMult = { ...s.costMult, tower: 1.45 }; }
  else if (id === "hunter") { m.heroDamage *= 1.6; m.drops *= 2; m.income *= 0.5; }
  else if (id === "hoard") { s.startCoins = (s.startCoins ?? 12) + 60; m.income *= 1.3; s.enemyHpMult = (s.enemyHpMult ?? 1) * 1.15; }
  else if (id === "engineers") { s.openEarly = [...(s.openEarly ?? []), "catapult", "mage"]; s.costMult = { ...s.costMult, catapult: 0.65, mage: 0.65 }; s.maxLevels = { ...s.maxLevels, tower: 4 }; }
  else if (id === "levy") { s.openEarly = [...(s.openEarly ?? []), "barracks"]; m.allyPower *= 1.9; m.heroDamage *= 0.8; }
  else if (id === "pyre") { m.burn += 0.7; m.towerDamage *= 0.9; }
}
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
  // Crowns (Ascension): a permanent edge on damage, walls and gold.
  const cr = save.crowns ?? 0;
  m.heroDamage *= 1 + ASCEND.power * cr;
  m.towerDamage *= 1 + ASCEND.power * cr;
  m.wallHp *= 1 + ASCEND.power * cr;
  m.drops *= 1 + ASCEND.gold * cr;
  m.income *= 1 + ASCEND.gold * cr;
  const h = CAMP_HEROES[hero];
  h.apply(s);
  s.heroLook = h.look;
  s.heroVet = vetLookOn(save, hero);
  s.heroFlair = activeFlair(save);
  s.weapon = weaponFor(save);
  s.pet = petFor(save);
  s.ability = HERO_BY_ID[hero].ability;
  s.abilityCooldown = HERO_BY_ID[hero].cooldown;
  // Hero mastery capstone: an empowered ability that recharges faster.
  if (mastered(save, hero)) {
    s.abilityPower = MASTERY.power;
    s.abilityCooldown *= MASTERY.cooldown;
  }
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
