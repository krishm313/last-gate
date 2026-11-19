import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium, devices } = require("playwright");
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 3 })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { localStorage.setItem("lastgate.seenTitle", "1"); localStorage.setItem("lastgate.tutorial", "done"); localStorage.setItem("lastgate.tipPreview", "1"); });
await page.goto("http://localhost:5180/"); await page.waitForTimeout(1500);
await page.click(".chapter:not(.daily)", { force: true }); await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Start the night/ }).click({ force: true }); await page.waitForTimeout(2500);
await page.evaluate(() => { const c = __camp(); c.enemies.length = 0; c.queue.length = 0; c.hero.x = 360; c.hero.y = 470;
  const ids = ["footman","runner","shield","brute","crossbow","goblin","shaman","knight"]; ids.forEach((id, i) => __spawn(id, 250 + (i % 4) * 75, 280 + Math.floor(i / 4) * 60)); });
for (let i = 0; i < 3; i++) { await page.waitForTimeout(i ? 350 : 700); await page.screenshot({ path: `foe${i}.png`, clip: { x: 60, y: 120, width: 270, height: 260 } }); }
console.log({ errors }); await browser.close();
