# Live Agent Desk — local hook smoke test (not production M2)

Scripted localhost proof of **ValenGateway-shaped hook URLs** and **foreground/orbit JSON card records** in the local harness. This is a contributor smoke test, not shipped Milestone 2 behavior.

## What this is

| Yes | No |
|-----|-----|
| Hook names + `/api/hooks/execute/{spaceId}/{hook}` shape on localhost | Hosted ValenGateway |
| `tick-live-agent-desk` advances a **scripted** state machine | Human-in-the-loop approval |
| Upserts work-object records in **local JSON** | 3D runtime panels updating from hooks |
| `proof:agent-desk` CI-style harness test | Production agent orchestration |

## Hooks (local harness only)

| Hook | Role |
|------|------|
| `start-live-agent-desk` | Start scripted session + first upsert |
| `tick-live-agent-desk` | Advance script; return `foreground` / `orbit` buckets |
| `get-live-agent-desk-status` | Read desk + runtime report |
| `stop-live-agent-desk` | Stop the run |
| `manage-valen-hooks` | List local hook surface |

## Run the smoke-test UI

```bash
npm install --prefix runtime
npm run demo:gateway
```

Open [http://localhost:9252/gateway-proof.html](http://localhost:9252/gateway-proof.html)

- **Left:** what each script step means (honest labels).
- **Right:** card **records** returned by hooks — not the cinematic GLB panels in `/`.

Click **Run smoke test** (or rely on server). If the dev server is not running, the page shows an error instead of faking motion.

## Run proofs only

```bash
npm --prefix runtime run proof:agent-desk
npm run check
```

## What a “card” means here

In Valen Core, a **card** is a **work object** (preview, approval, tracker, etc.) with spatial state:

- **Foreground** — needs attention now
- **Orbit** — kept context in the background

Main Core renders these as 3D panels. This smoke test only manipulates **JSON records** in the local store to prove the hook loop and bucket shape.

## Future M2 (out of scope for this PR)

Production Milestone 2 would wire hooks to the real runtime, hosted gateway, and **stop** on approval cards until a human clicks Approve. This PR does not implement that.