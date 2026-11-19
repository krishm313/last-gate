/** What a finished mini-game round paid out (shared by every side-stop view). */
export interface MiniResult {
  score: number;
  stars: number;
  gold: number;
  newStars: number;
  /** Today's Fair day game: the gold was doubled. */
  fair?: boolean;
}

/**
 * The end-of-round panel for the side-stop mini-games: title, score line, the three stars (newly
 * earned ones pop in one after another), gold (with a Fair day note), and Again / Back buttons.
 */
export function showEndPanel(
  root: HTMLElement,
  opts: { cls: string; title: string; r: MiniResult; extra?: string; again: string; onAgain: () => void; onBack: () => void },
): void {
  const { r } = opts;
  const box = document.createElement("div");
  box.className = `panel pop-in ${opts.cls} lgx-end`;
  const h = document.createElement("h1");
  h.className = "title";
  h.textContent = opts.title;
  const stars = document.createElement("div");
  stars.className = "lgx-stars";
  for (let i = 0; i < 3; i++) {
    const st = document.createElement("span");
    const earned = i < r.stars;
    const fresh = earned && i >= r.stars - r.newStars;
    st.className = `lgx-star${earned ? " on" : ""}${fresh ? " fresh" : ""}`;
    if (fresh) st.style.animationDelay = `${0.35 + (i - (r.stars - r.newStars)) * 0.3}s`;
    st.textContent = earned ? "★" : "☆";
    stars.append(st);
  }
  const p = document.createElement("p");
  p.className = "sub";
  p.textContent = `Score ${r.score}${opts.extra ? ` · ${opts.extra}` : ""}`;
  const gold = document.createElement("p");
  gold.className = "lgx-gold";
  gold.textContent = `+${r.gold} gold${r.fair ? " · 🎪 Fair day 2×!" : ""}${r.newStars ? ` · ${r.newStars} new star${r.newStars > 1 ? "s" : ""}!` : ""}`;
  const again = document.createElement("button");
  again.className = "btn";
  again.textContent = opts.again;
  again.onclick = opts.onAgain;
  const back = document.createElement("button");
  back.className = "btn btn-ghost";
  back.textContent = "Back to the map";
  back.onclick = opts.onBack;
  box.append(h, stars, p, gold, again, back);
  root.append(box);
}
