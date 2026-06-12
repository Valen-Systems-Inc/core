#!/usr/bin/env bash
# Local ValenGateway hook smoke test (scripted JSON harness — not production M2).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/runtime"
npm install
npm run proof:agent-desk
echo ""
echo "============================================================"
echo " Live Agent Desk — LOCAL HOOK SMOKE TEST (honest scope)"
echo "============================================================"
echo " Open: http://localhost:${PORT:-9252}/gateway-proof.html"
echo " Click 'Run smoke test' — UI shows JSON from hooks, not 3D cards."
echo " Scripted ticks auto-advance. No human approval in this preview."
echo "============================================================"
PORT="${PORT:-9252}"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  OLD_PID="$(lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
  echo " Port $PORT in use (pid ${OLD_PID:-?}) — stopping previous server..."
  kill "$OLD_PID" 2>/dev/null || true
  sleep 0.5
fi
if command -v open >/dev/null 2>&1; then
  (sleep 1.2 && open "http://localhost:${PORT}/gateway-proof.html") &
fi
export VALEN_GATEWAY_DEMO=1
exec node scripts/dev-server.mjs