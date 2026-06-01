import assert from "node:assert/strict";
import {
  buildRuntimeBusinessStarterCards,
  normalizeWorkspaceCardStatus,
  normalizeWorkspaceCardType,
  parseRuntimeJson,
  runtimeWorkspaceCardBucket,
  scopeRuntimeCardsToSession,
  workspaceCardId
} from "../src/shape-runtime-cards/normalize-cards-and-build-starters.js";

const cards = buildRuntimeBusinessStarterCards({
  businessType: "studio",
  market: "local",
  goal: "Improve the local spatial interface"
});

assert.equal(cards.length, 3);
assert.ok(cards.some((card) => card.card_type === "site_preview"));
assert.ok(cards.some((card) => card.card_type === "approval"));
assert.ok(cards.some((card) => card.card_type === "tracker"));

assert.equal(normalizeWorkspaceCardType({ cardType: "approval" }), "approval");
assert.equal(normalizeWorkspaceCardStatus({ status: "foreground" }), "focused");
assert.equal(normalizeWorkspaceCardStatus({ status: "orbit" }), "kept");
assert.equal(runtimeWorkspaceCardBucket({ status: "kept" }), "orbit");
assert.equal(runtimeWorkspaceCardBucket({ status: "dismissed" }), "dismissed");

const scoped = scopeRuntimeCardsToSession(cards, "124661");
assert.equal(scoped.length, cards.length);
assert.ok(scoped.every((card) => String(card.idempotencyKey).startsWith("session-124661-")));
assert.equal(scopeRuntimeCardsToSession(scoped, "124661")[0].idempotencyKey, scoped[0].idempotencyKey);
assert.equal(workspaceCardId({ card_id: "abc" }), "abc");

assert.deepEqual(parseRuntimeJson("{\"ok\":true}", {}), { ok: true });
assert.deepEqual(parseRuntimeJson("not json", { ok: false }), { ok: false });

console.log(JSON.stringify({
  ok: true,
  proof: "runtime-card-helpers",
  cards: cards.length,
  scopedCards: scoped.length,
  requiredTypes: ["site_preview", "approval", "tracker"]
}, null, 2));
