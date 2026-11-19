#!/bin/bash
# Start the Vite dev server for the game on :5180 if it is not answering.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if ! curl -s -o /dev/null http://localhost:5180/lookdev.html; then
  cd "$ROOT"
  setsid nohup npx vite --port 5180 --host > /tmp/lastgate-vite.log 2>&1 < /dev/null &
  for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:5180/lookdev.html && break; sleep 1; done
fi
