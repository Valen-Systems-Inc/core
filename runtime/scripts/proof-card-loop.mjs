import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalValenCardHarness } from "./local-valen-card-harness.mjs";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "valencore-card-loop-proof-"));
const harness = createLocalValenCardHarness({
  storePath: path.join(tempDir, "store.json")
});

const primarySession = "124661";
const otherSession = "998877";

try {
  await harness.reset();

  const starter = await call("create-business-starter-cards", {
    method: "POST",
    body: {
      sessionId: primarySession,
      source: "proof-card-loop",
      businessType: "studio",
      market: "local",
      goal: "Improve the local spatial interface"
    }
  });
  assert(starter.ok && starter.created === 3, "starter cards should create three cards");

  const cards = await call("get-cards", { query: { sessionId: primarySession } });
  assert(cards.counts.foreground === 2, "starter foreground count should be 2");
  assert(cards.counts.orbit === 1, "starter orbit count should be 1");
  assert(cards.visibleCards.length === 3, "visible cards should include foreground and orbit");

  const siteCard = cards.foreground.find((card) => card.card_type === "site_preview");
  assert(siteCard, "site_preview foreground card should exist");

  const keep = await call("process-card-action", {
    method: "POST",
    body: {
      sessionId: primarySession,
      cardId: siteCard.id,
      action: "keep",
      payload: { reason: "proof" }
    }
  });
  assert(keep.newStatus === "kept" && keep.newBucket === "orbit", "keep should move the card to orbit");

  const afterKeep = await call("get-cards", { query: { sessionId: primarySession } });
  assert(afterKeep.orbit.some((card) => card.id === siteCard.id), "get-cards should read kept card in orbit");

  const approvalCard = afterKeep.foreground.find((card) => card.card_type === "approval");
  assert(approvalCard, "approval foreground card should exist before dismiss proof");

  const dismiss = await call("process-card-action", {
    method: "POST",
    body: {
      sessionId: primarySession,
      cardId: approvalCard.id,
      action: "dismiss"
    }
  });
  assert(dismiss.newStatus === "dismissed" && dismiss.newBucket === "dismissed", "dismiss should remove card from active buckets");

  const afterDismiss = await call("get-cards", { query: { sessionId: primarySession } });
  assert(afterDismiss.dismissed.some((card) => card.id === approvalCard.id), "dismissed card should read back as dismissed");
  assert(!afterDismiss.visibleCards.some((card) => card.id === approvalCard.id), "dismissed card should not be visible");

  const isolated = await call("get-cards", { query: { sessionId: otherSession } });
  assert(isolated.counts.total === 0, "second session should not see primary cards");

  await call("report-runtime-status", {
    method: "POST",
    body: {
      sessionId: primarySession,
      phase: "WorkspaceMode",
      scene: "card10",
      totalCardCount: afterDismiss.counts.total,
      visibleCards: afterDismiss.visibleCards.map((card) => ({ id: card.id, status: card.status, bucket: card.bucket }))
    }
  });

  const status = await call("get-runtime-status", { query: { sessionId: primarySession } });
  assert(status.counts.foreground === afterDismiss.counts.foreground, "runtime status foreground should match get-cards");
  assert(status.counts.orbit === afterDismiss.counts.orbit, "runtime status orbit should match get-cards");
  assert(status.counts.dismissed === afterDismiss.counts.dismissed, "runtime status dismissed should match get-cards");
  assert(status.latestRuntimeReport?.phase === "WorkspaceMode", "runtime report should be preserved separately");

  const secondStatus = await call("get-runtime-status", { query: { sessionId: otherSession } });
  assert(secondStatus.counts.total === 0, "runtime status should preserve session isolation");

  console.log(JSON.stringify({
    ok: true,
    harness: "local-valen-card-harness",
    storePath: harness.storePath,
    sessionId: primarySession,
    proof: {
      starterCreated: starter.created,
      directGetCards: cards.counts,
      keepOrbit: { cardId: siteCard.id, status: keep.newStatus, bucket: keep.newBucket },
      dismiss: { cardId: approvalCard.id, status: dismiss.newStatus, bucket: dismiss.newBucket },
      afterDismiss: afterDismiss.counts,
      sessionIsolation: { otherSession, counts: isolated.counts },
      runtimeStatus: {
        counts: status.counts,
        truthSource: status.truthSource,
        latestRuntimeReport: {
          phase: status.latestRuntimeReport.phase,
          scene: status.latestRuntimeReport.scene,
          reportedAt: status.latestRuntimeReport.reportedAt
        }
      }
    }
  }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function call(hook, options = {}) {
  const result = await harness.handleHookRequest({ hook, method: options.method || "GET", query: options.query || {}, body: options.body || {} });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${hook} failed: ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

function assert(condition, message) {
  if (!condition) throw new Error(`proof failed: ${message}`);
}
