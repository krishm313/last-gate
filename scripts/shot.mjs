// Usage: node scripts/shot.mjs <url> <out.png> [actions-json]
// Drives the game in headless Chromium (iPhone-ish viewport) and screenshots it.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium } = require("playwright");
const [url, out, actionsJson] = process.argv.slice(2);
const actions = actionsJson ? JSON.parse(actionsJson) : [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(500);
for (const a of actions) {
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.click) await page.click(a.click, { force: true });
  if (a.eval) logs.push("eval: " + JSON.stringify(await page.evaluate(a.eval)));
  if (a.mouse) { await page.mouse.move(a.mouse[0], a.mouse[1]); await page.mouse.down(); }
  if (a.up) await page.mouse.up();
  if (a.shot) await page.screenshot({ path: a.shot });
}
await page.screenshot({ path: out });
console.log(logs.join("\n"));
await browser.close();
