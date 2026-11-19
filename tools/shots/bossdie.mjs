import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium, devices } = require("playwright");
const browser = await chromium.launch();
const errors = [];
for (const hero of ["ranger"]) {
  const page = await (await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("lastgate.seenTitle", "1"); localStorage.setItem("lastgate.tutorial", "done"); localStorage.setItem("lastgate.tipPreview", "1"); });
  await page.goto("http://localhost:5180/"); await page.waitForTimeout(800);
  await page.addInitScript((h) => { const raw = localStorage.getItem("lastgate.save.v1"); if (!raw) return; const s = JSON.parse(raw); s.stars = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 }; s.hero = h; localStorage.setItem("lastgate.save.v1", JSON.stringify(s)); localStorage.setItem("lastgate.seenChapters", "[1,2,3,4,5,99]"); }, hero);
  await page.reload(); await page.waitForTimeout(1500);
  await page.locator(".chapter:not(.daily)").first().click({ force: true }); await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Start the night/ }).click({ force: true }); await page.waitForTimeout(2500);
  await page.evaluate(() => { const c = __camp(); c.hero.x = 360; c.hero.y = 700; __spawn("warlord", 360, 560); });
  await page.waitForTimeout(2600);
  await page.evaluate(() => { const b = __camp().enemies.find(e => e.def.boss); if (b) b.hp = 1; }); await page.waitForTimeout(600); console.log(await page.evaluate(() => window.__renderer.corpses.map(k => [k.id, Math.round(k.x), Math.round(k.y)]))); for (let i = 0; i < 6; i++) { await page.waitForTimeout(i ? 450 : 300); await page.screenshot({ path: `bd${i}.png`, clip: { x: 0, y: 200, width: 390, height: 420 } }); }
  await page.context().close();
}
console.log({ errors }); await browser.close();
