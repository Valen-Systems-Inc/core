import assert from "node:assert/strict";
import { createLocalValenCardHarness } from "./local-valen-card-harness.mjs";

const harness = createLocalValenCardHarness({ storePath: "/tmp/core-proof-agent-desk.json" });
await harness.reset();

const sessionId = "proof-session";
const start = await harness.handleHookRequest({
  hook: "start-live-agent-desk",
  method: "POST",
  body: { sessionId, builderName: "Builder", operatorName: "Operator" }
});
assert.equal(start.status, 200);
assert.equal(start.body.ok, true);

let done = false;
let ticks = 0;
while (!done && ticks < 12) {
  const tick = await harness.handleHookRequest({
    hook: "tick-live-agent-desk",
    method: "POST",
    body: { sessionId }
  });
  assert.equal(tick.status, 200);
  done = Boolean(tick.body.done);
  ticks += 1;
}
assert.ok(ticks >= 5, "expected multi-step desk script");
assert.equal(done, true);

const hooks = await harness.handleHookRequest({
  hook: "manage-valen-hooks",
  method: "GET",
  query: { sessionId }
});
assert.ok(hooks.body.hooks.includes("start-live-agent-desk"));

console.log("proof-agent-desk: ok", { ticks });