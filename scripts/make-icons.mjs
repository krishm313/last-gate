// Renders the app icon to PNGs with headless Chromium: node scripts/make-icons.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium } = require("playwright");
const html = `<canvas id=c width=512 height=512></canvas><script>
const c = document.getElementById('c').getContext('2d');
const g = c.createLinearGradient(0,0,0,512); g.addColorStop(0,'#5a8fd8'); g.addColorStop(1,'#1e3a6a');
c.fillStyle=g; c.fillRect(0,0,512,512);
// grass
c.fillStyle='#5fa048'; c.beginPath(); c.ellipse(256,470,330,120,0,0,Math.PI*2); c.fill();
// shield
c.lineJoin='round'; c.lineWidth=18; c.strokeStyle='#1d1208';
c.fillStyle='#ffd56a';
c.beginPath(); c.moveTo(256,70); c.lineTo(420,120); c.quadraticCurveTo(420,330,256,440); c.quadraticCurveTo(92,330,92,120); c.closePath(); c.fill(); c.stroke();
c.fillStyle='#3d6aa8';
c.beginPath(); c.moveTo(256,105); c.lineTo(388,145); c.quadraticCurveTo(386,315,256,405); c.quadraticCurveTo(126,315,124,145); c.closePath(); c.fill();
// gate
c.fillStyle='#b4aea4'; c.lineWidth=12;
c.fillRect(170,200,172,150); c.strokeRect(170,200,172,150);
for (const x of [170,214,258,302]) { c.fillRect(x,168,40,36); c.strokeRect(x,168,40,36); }
c.fillStyle='#7a5230'; c.beginPath(); c.moveTo(216,350); c.lineTo(216,280); c.arc(256,280,40,Math.PI,0); c.lineTo(296,350); c.closePath(); c.fill(); c.stroke();
c.strokeStyle='#4a3020'; c.lineWidth=6; c.beginPath(); c.moveTo(256,245); c.lineTo(256,350); c.stroke();
</script>`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
const el = await page.$("#c");
for (const [name, size] of [["icon-512.png", 512], ["icon-192.png", 192], ["apple-touch-icon.png", 180]]) {
  await page.setViewportSize({ width: 512, height: 512 });
  const buf = await el.screenshot();
  if (size === 512) { (await import("node:fs")).writeFileSync(`static/${name}`, buf); continue; }
  const resized = await page.evaluate(async ({ b64, size }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
    cv.getContext("2d").drawImage(img, 0, 0, size, size);
    return cv.toDataURL("image/png").split(",")[1];
  }, { b64: buf.toString("base64"), size });
  (await import("node:fs")).writeFileSync(`static/${name}`, Buffer.from(resized, "base64"));
}
await browser.close();
console.log("icons written");
