# Screenshot checks

Playwright scripts that drive the dev build (http://localhost:5180) into a specific moment and save
PNGs to the current directory. Run `tools/shots/ensure.sh` first, then from a scratch folder:
`node /path/to/last-gate/tools/shots/<script>.mjs`. They print `{ errors: [] }` (page errors).

They use the debug hooks exposed on `window` in dev (`__camp()`, `__spawn(id, x, y)`, `__renderer`).
The iPhone 13 device preset has a 390x664 viewport.
