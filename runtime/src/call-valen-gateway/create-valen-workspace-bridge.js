import { LOCAL_VALEN_SPACE_ID } from "../configure-runtime/configure-runtime-hosts-and-gates.js";
import {
  buildRuntimeBusinessStarterCards,
  inferRuntimeBusinessProfile,
  parseRuntimeJson,
  scopeRuntimeCardsToSession
} from "../shape-runtime-cards/normalize-cards-and-build-starters.js";
import {
  getValenChatSessionId,
  isNumericValenRuntimeSessionId,
  normalizeValenRuntimeSessionId,
  persistValenRuntimeSessionId,
  readValenRuntimeQuerySessionId
} from "./remember-runtime-session.js";

export function createValenWorkspaceBridge(spaceId = LOCAL_VALEN_SPACE_ID) {
  const hookBase = `/api/hooks/execute/${encodeURIComponent(spaceId)}`;

  const hookRequest = async (hook, { method = "GET", query = {}, body = {} } = {}) => {
    const url = new URL(`${hookBase}/${encodeURIComponent(hook)}`, window.location.origin);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    const response = await fetch(url, {
      method,
      headers: method === "GET" ? { accept: "application/json" } : { "Content-Type": "application/json", accept: "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body)
    });
    const text = await response.text().catch(() => "");
    const data = parseRuntimeJson(text, text ? { raw: text } : {});
    if (!response.ok) throw new Error(data.error || data.detail || text || `Local hook ${hook} failed: ${response.status}`);
    return data;
  };

  return {
    spaceId,
    hookBase,
    sessionId: null,
    init() {
      const candidate = normalizeValenRuntimeSessionId(readValenRuntimeQuerySessionId() || getValenChatSessionId());
      const next = isNumericValenRuntimeSessionId(candidate) ? candidate : getValenChatSessionId();
      this.sessionId = next;
      persistValenRuntimeSessionId(next);
      return next;
    },
    getHookSessionId() {
      return this.sessionId || this.init();
    },
    loadCards() {
      return hookRequest("get-cards", { query: { sessionId: this.getHookSessionId() } });
    },
    action(cardId, action, payload = {}) {
      return hookRequest("process-card-action", {
        method: "POST",
        body: { sessionId: this.getHookSessionId(), cardId, action, verb: action, payload }
      });
    },
    createBusinessStarterCards(payload = {}) {
      const profile = inferRuntimeBusinessProfile(payload);
      const sessionId = payload.sessionId || this.getHookSessionId();
      const cards = scopeRuntimeCardsToSession(payload.cards?.length ? payload.cards : buildRuntimeBusinessStarterCards(profile), sessionId);
      return hookRequest("create-business-starter-cards", {
        method: "POST",
        body: { sessionId, source: "runtime-local-starter", ...profile, cards }
      });
    },
    reportStatus(status = {}) {
      return hookRequest("report-runtime-status", { method: "POST", body: { sessionId: this.getHookSessionId(), ...status } });
    },
    getStatus(sessionId = this.getHookSessionId()) {
      return hookRequest("get-runtime-status", { query: { sessionId } });
    },
    callHook: hookRequest,
    keep: (cardId) => window.ValenWorkspace.action(cardId, "keep"),
    dismiss: (cardId) => window.ValenWorkspace.action(cardId, "dismiss"),
    recall: (cardId) => window.ValenWorkspace.action(cardId, "recall"),
    approve: (cardId, payload = {}) => window.ValenWorkspace.action(cardId, "approve", payload)
  };
}
