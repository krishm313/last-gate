import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * Offline play: after a build, list every file in dist with a content hash (precache.json). The
 * service worker downloads them all on first launch — and re-downloads only changed ones on each
 * deploy — so chapters and enemies you haven't seen yet still work without signal.
 */
function precacheManifest(): Plugin {
  return {
    name: "precache-manifest",
    apply: "build",
    closeBundle() {
      const out = "dist";
      const files: { u: string; h: string }[] = [];
      const walk = (dir: string): void => {
        for (const n of readdirSync(dir)) {
          const p = join(dir, n);
          if (statSync(p).isDirectory()) walk(p);
          else {
            const u = relative(out, p).split("\\").join("/");
            if (u === "sw.js" || u === "precache.json" || u.endsWith(".map")) continue;
            files.push({ u, h: createHash("sha1").update(readFileSync(p)).digest("hex").slice(0, 12) });
          }
        }
      };
      walk(out);
      files.sort((a, b) => a.u.localeCompare(b.u));
      const json = JSON.stringify({ files });
      writeFileSync(join(out, "precache.json"), json);
      // Stamp the service worker with the build's version: browsers only re-install a worker whose
      // bytes changed, so this makes every deploy (even an image-only one) reach installed phones.
      const sw = join(out, "sw.js");
      const ver = createHash("sha1").update(json).digest("hex").slice(0, 12);
      writeFileSync(sw, `// build ${ver}\n` + readFileSync(sw, "utf8"));
    },
  };
}

export default defineConfig({
  base: "./",
  // The repo-wide .gitignore ignores public/, so static files live in static/.
  publicDir: "static",
  plugins: [precacheManifest()],
  // host + allowedHosts so the game can be opened through a remote preview / tunnel URL.
  server: { port: 5180, host: true, allowedHosts: true },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
