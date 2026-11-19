// Offline cache: network-first for the page (so updates arrive), cache-first for hashed assets.
// Responses are cloned synchronously, before they are returned: cloning later (after the browser has
// started reading the body) throws, which silently left the cache empty and broke offline play.
const CACHE = "lastgate-v4";
// Match regardless of request headers: servers send "Vary: Origin" / "Vary: Accept-Encoding", and the
// browser's script/module requests carry headers the install-time downloads didn't.
const ANY = { ignoreVary: true, ignoreSearch: false };
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png"];

// Every file of the build is listed in precache.json with a content hash. On install, download
// whatever is missing or changed (a deploy re-fetches only what it changed), so the whole game —
// every chapter, enemy and sound — works offline after the first launch.
const MAP_KEY = "./__precache-map";
async function precacheAll() {
  const c = await caches.open(CACHE);
  await c.addAll(CORE);
  let list;
  try {
    list = await (await fetch("./precache.json", { cache: "no-store" })).json();
  } catch {
    return; // dev server or offline: nothing to do
  }
  const prev = await c.match(MAP_KEY).then((r) => (r ? r.json() : {})).catch(() => ({}));
  const next = {};
  const todo = list.files.filter((f) => prev[f.u] !== f.h);
  for (const f of list.files) if (prev[f.u] === f.h) next[f.u] = f.h;
  // A few at a time; one failed file must not abort the rest.
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(
      todo.slice(i, i + 6).map(async (f) => {
        try {
          const r = await fetch("./" + f.u, { cache: "reload" });
          if (r.ok) {
            await c.put("./" + f.u, r);
            next[f.u] = f.h;
          }
        } catch {}
      }),
    );
  }
  await c.put(MAP_KEY, new Response(JSON.stringify(next), { headers: { "content-type": "application/json" } }));
}

self.addEventListener("install", (e) => {
  e.waitUntil(precacheAll());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Hashed build files look like /assets/index-AbC123.js: a new deploy adds new names.
// Vite's hash is 8 chars and may itself contain "-", so anchor on exactly 8 before the extension.
const HASHED = /\/assets\/(.+?)-[A-Za-z0-9_-]{8}\.(\w+)$/;

function store(req, res) {
  if (!res || !res.ok) return res;
  const copy = res.clone();
  caches.open(CACHE).then(async (c) => {
    await c.put(req, copy);
    // Drop older builds of the same file so the cache doesn't grow with every deploy.
    const m = new URL(req.url).pathname.match(HASHED);
    if (!m) return;
    for (const old of await c.keys()) {
      const o = new URL(old.url).pathname.match(HASHED);
      if (o && o[1] === m[1] && o[2] === m[2] && old.url !== req.url) await c.delete(old);
    }
  });
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // The update check must always ask the network (a cached answer would hide new deploys).
  if (new URL(req.url).pathname.endsWith("/version.json")) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => store(req, r))
        .catch(() => caches.match(req, ANY).then((r) => r || caches.match("./index.html", ANY))),
    );
    return;
  }
  // Hashed build files never change: cache-first. Everything else (manifest, icons): serve the cached
  // copy at once but refresh it in the background, so updates still reach installed players.
  if (HASHED.test(new URL(req.url).pathname)) {
    e.respondWith(caches.match(req, ANY).then((hit) => hit || fetch(req).then((r) => store(req, r))));
    return;
  }
  const fresh = fetch(req).then((r) => store(req, r));
  e.waitUntil(fresh.catch(() => {})); // keep the worker alive until the background refresh lands
  e.respondWith(caches.match(req, ANY).then((hit) => hit || fresh));
});
