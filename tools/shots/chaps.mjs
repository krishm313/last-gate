import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium, devices } = require("playwright");
const browser = await chromium.launch();
const errors = [];
for (const n of [4]) {
  const page = await (await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem("lastgate.seenTitle", "1"); localStorage.setItem("lastgate.tutorial", "done"); localStorage.setItem("lastgate.tipPreview", "1"); });
  await page.goto("http://localhost:5180/"); await page.waitForTimeout(800);
  await page.addInitScript(() => { const raw = localStorage.getItem("lastgate.save.v1"); if (!raw) return; const s = JSON.parse(raw); s.stars = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 }; localStorage.setItem("lastgate.save.v1", JSON.stringify(s)); localStorage.setItem("lastgate.seenChapters", "[1,2,3,4,5,99]"); });
  await page.reload(); await page.waitForTimeout(1500);
  await page.locator(".chapter:not(.daily)").nth(n - 1).click({ force: true }); await page.waitForTimeout(2500);
  await page.screenshot({ path: `ch${n}.png` });
  await page.context().close();
}
console.log({ errors }); await browser.close();
