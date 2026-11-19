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
await page.getByRole("button", { name: /Start the night/ }).click({ force: true }); await page.waitForTimeout(800);
await page.evaluate(() => { const c = __camp(); c.hallHp = 1; __spawn("brute", 360, 1000); });
for (let i = 0; i < 3; i++) { await page.waitForTimeout(i ? 450 : 6500); await page.screenshot({ path: `lose${i}.png` }); }
console.log({ errors }); await browser.close();
