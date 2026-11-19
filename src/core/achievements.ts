import type { SaveData } from "./meta";

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  goal: number;
  reward: number;
  /** Current progress from the save. */
  progress: (s: SaveData) => number;
}

const stat = (k: string) => (s: SaveData) => s.stats[k] ?? 0;

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-wave", name: "First Stand", desc: "Survive your first night", icon: "🛡️", goal: 1, reward: 30, progress: stat("wavesHeld") },
  { id: "veteran", name: "Veteran", desc: "Survive 100 nights in total", icon: "⚔️", goal: 100, reward: 250, progress: stat("wavesHeld") },
  { id: "builder", name: "Master Builder", desc: "Build 25 archer towers", icon: "🏹", goal: 25, reward: 150, progress: stat("towersBuilt") },
  { id: "lumberjack", name: "Lumberjack", desc: "Gather 300 logs", icon: "🪓", goal: 300, reward: 150, progress: stat("logs") },
  { id: "smith", name: "Blacksmith", desc: "Forge 50 bows", icon: "🔨", goal: 50, reward: 150, progress: stat("bows") },
  { id: "slayer", name: "Giant Slayer", desc: "Defeat 10 bosses", icon: "👑", goal: 10, reward: 200, progress: stat("bosses") },
  { id: "horde", name: "Horde Breaker", desc: "Defeat 2,000 enemies", icon: "💀", goal: 2000, reward: 250, progress: stat("kills") },
  { id: "perfect", name: "Flawless", desc: "Earn 3 stars on any chapter", icon: "⭐", goal: 1, reward: 100, progress: (s) => (Object.values(s.stars).some((v) => v >= 3) ? 1 : 0) },
  { id: "endless15", name: "Unbreakable", desc: "Reach night 15 in Endless Siege", icon: "♾️", goal: 15, reward: 300, progress: (s) => s.best[99] ?? 0 },
  { id: "champion", name: "Champion of the Realm", desc: "Clear chapter 5", icon: "🏆", goal: 1, reward: 500, progress: (s) => ((s.stars[5] ?? 0) > 0 ? 1 : 0) },
  { id: "frostpeak", name: "King of the Mountain", desc: "Clear chapter 6, Frostpeak Pass", icon: "🏔️", goal: 1, reward: 700, progress: (s) => ((s.stars[6] ?? 0) > 0 ? 1 : 0) },
  { id: "caldera", name: "Through the Fire", desc: "Clear chapter 7, Ashen Caldera", icon: "🌋", goal: 1, reward: 900, progress: (s) => ((s.stars[7] ?? 0) > 0 ? 1 : 0) },
  { id: "untouchable", name: "Untouchable", desc: "Survive 10 nights without the wall or hall taking a hit", icon: "✨", goal: 10, reward: 200, progress: stat("flawlessWaves") },
  { id: "daily3", name: "Daily Grind", desc: "Clear 3 daily challenges", icon: "🏅", goal: 3, reward: 200, progress: stat("dailyWins") },
];

export function claimable(s: SaveData): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !s.claimed.includes(a.id) && a.progress(s) >= a.goal);
}

export function claim(s: SaveData, id: string): number {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || s.claimed.includes(id) || a.progress(s) < a.goal) return 0;
  s.claimed.push(id);
  s.gold += a.reward;
  return a.reward;
}
