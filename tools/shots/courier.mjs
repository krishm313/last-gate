import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium, devices } = require("playwright");
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { localStorage.setItem("lastgate.seenTitle", "1"); localStorage.setItem("lastgate.tutorial", "done"); localStorage.setItem("lastgate.tipPreview", "1"); });
await page.goto("http://localhost:5180/"); await page.waitForTimeout(1500);
await page.click(".chapter:not(.daily)", { force: true }); await page.waitForTimeout(1200);
await page.evaluate(() => { const c = __camp(); c.hero.coins = 0; c.hero.x = 360; c.hero.y = 760; c.incomePile = 12; });
const counts = [];
for (let i = 0; i < 4; i++) { await page.waitForTimeout(i ? 250 : 120); counts.push(await page.evaluate(() => [__camp().hero.coins, __camp().incomePile])); await page.screenshot({ path: `cr${i}.png` }); }
console.log(counts, { errors }); await browser.close();
