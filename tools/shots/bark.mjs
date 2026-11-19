import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium, devices } = require("playwright");
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 3 })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { localStorage.setItem("lastgate.seenTitle", "1"); localStorage.setItem("lastgate.tutorial", "done"); localStorage.setItem("lastgate.tipPreview", "1"); });
await page.goto("http://localhost:5180/"); await page.waitForTimeout(1500);
await page.click(".chapter:not(.daily)", { force: true }); await page.waitForTimeout(1500);
console.log(await page.evaluate(() => { const c = __camp(); const p = c.plots.find((q) => q.kind === "barracks"); p.locked = false; c.hero.coins = 40; c.hero.logs = 10; c.hero.x = p.x; c.hero.y = p.y; return [p.x, p.y]; }));
await page.waitForTimeout(4000);
console.log(await page.evaluate(() => { const c = __camp(); return [c.plots.find((q) => q.kind === "barracks").level, c.allies.length]; }));
await page.getByRole("button", { name: /Start the night/ }).click({ force: true }); await page.waitForTimeout(2000);
console.log(await page.evaluate(() => { const c = __camp(); c.hero.x = 200; c.hero.y = 760; c.segments.forEach((s, i) => { if (i === 5 || i === 6) s.hp = 0; }); for (let i = 0; i < 4; i++) __spawn("footman", 330 + i * 20, 330); return c.allies.map((a) => [Math.round(a.x), Math.round(a.y)]); }));
for (let i = 0; i < 4; i++) { await page.waitForTimeout(800); await page.screenshot({ path: `bk${i}.png`, clip: { x: 60, y: 150, width: 270, height: 300 } }); }
console.log({ errors }); await browser.close();
