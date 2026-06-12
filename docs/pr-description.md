## Summary

**Local ValenGateway hook smoke test** — scripted `start` / `tick` loop, JSON card upserts in the local harness, and an honest DOM page that displays hook responses. **Not** production Milestone 2, **not** human-in-the-loop, **not** 3D runtime wiring.

## What this PR proves

- Hook URL shape: `/api/hooks/execute/{spaceId}/{hook}`
- Local harness can upsert work-object records and return `foreground` / `orbit` buckets
- `npm --prefix runtime run proof:agent-desk` passes (scripted ticks until `done`)

## What this PR does not claim

- ❌ Humans approving on cards (approval step is a **fixture**; ticks auto-advance)
- ❌ 3D GLB panels moving (gateway-proof shows **JSON records** only)
- ❌ Hosted gateway or production agent runtime
- ❌ “M2 ships” — this is a **contributor sketch** for upstream review

## Hooks

| Hook | Role |
|------|------|
| `start-live-agent-desk` | Start scripted session |
| `tick-live-agent-desk` | Advance script; return card buckets |
| `get-live-agent-desk-status` | Read desk state |
| `stop-live-agent-desk` | Stop run |

## How to try it

```bash
npm install --prefix runtime
npm run check
npm --prefix runtime run proof:agent-desk
npm run demo:gateway
```

Open http://localhost:9252/gateway-proof.html → click **Run smoke test**. Right panel shows harness JSON, not WebGL cards.

## Test plan

- [x] `npm run check`
- [x] `npm --prefix runtime run proof:agent-desk`
- [x] Manual: `npm run demo:gateway` → `/gateway-proof.html` → run completes; approval step labeled fixture; no fake animation without server

## Context

Public Core (M1) is a manual spatial UI with real 3D cards. A future M2 would let agents call a gateway **and** keep humans on approval surfaces. This PR only sketches the **localhost hook + JSON card loop** piece — labeled honestly in docs and UI.