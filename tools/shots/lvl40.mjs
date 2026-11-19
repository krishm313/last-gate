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
await page.evaluate(() => { const c = __camp(); c.hero.x = 360; c.hero.y = 470; c.hero.coins = 40;
  }); await page.waitForTimeout(1500); await page.evaluate(() => { const c = __camp(); c.events.push({ type: "levelUp", x: c.hero.x, y: c.hero.y, level: 2 }); });
for (let i = 0; i < 4; i++) { await page.waitForTimeout(i ? 380 : 60); await page.screenshot({ path: `lv${i}.png`, clip: { x: 95, y: 170, width: 200, height: 290 } }); }
console.log({ errors }); await browser.close();
