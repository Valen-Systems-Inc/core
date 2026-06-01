export function parseRuntimeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeWorkspaceCardType(card = {}) {
  return String(card.card_type || card.cardType || card.type || "work_object");
}

export function normalizeWorkspaceCardStatus(card = {}) {
  const status = String(card.status || "focused").toLowerCase();
  if (status === "foreground" || status === "pending") return "focused";
  if (status === "orbit") return "kept";
  return status;
}

export function runtimeWorkspaceCardBucket(card = {}) {
  const status = normalizeWorkspaceCardStatus(card);
  const spatialState = runtimeWorkspaceSpatialState(card);
  if (status === "archived" || spatialState.space === "archived") return "archived";
  if (status === "dismissed" || spatialState.space === "dismissed") return "dismissed";
  if (status === "kept" || spatialState.space === "orbit") return "orbit";
  return "foreground";
}

export function runtimeWorkspaceSpatialState(card = {}) {
  return parseRuntimeJson(card.spatial_state || card.spatialState, {});
}

export function workspaceCardId(card = {}) {
  return String(card.id || card.card_id || card.cardId || card.idempotency_key || "");
}

export function cleanRuntimeText(value = "", maxLength = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function runtimeSlug(value = "") {
  return cleanRuntimeText(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "local";
}

export function inferRuntimeBusinessProfile(input = {}) {
  return {
    businessType: cleanRuntimeText(input.businessType || input.business_type || "studio", 60),
    market: cleanRuntimeText(input.market || "local", 80),
    goal: cleanRuntimeText(input.goal || input.message || "Improve the local spatial workspace.", 240),
    shouldCreate: true
  };
}

export function runtimeStarterCard(cardType, title, body, action, priority, space, cluster) {
  return {
    id: runtimeSlug(`${cardType}-${title}`),
    card_type: cardType,
    title,
    status: space === "orbit" ? "kept" : "focused",
    priority,
    card_data: { title, body, action },
    spatial_state: { space, cluster }
  };
}

export function buildRuntimeBusinessStarterCards(input = {}) {
  const profile = inferRuntimeBusinessProfile(input);
  return [
    runtimeStarterCard("site_preview", "Review the local site preview", profile.goal, "Review preview", 100, "foreground", "design"),
    runtimeStarterCard("approval", "Approve the next local experiment", "Changes remain local until you choose to keep them.", "Approve", 80, "foreground", "approvals"),
    runtimeStarterCard("tracker", `${profile.businessType} workspace notes`, "Keep a useful object nearby while you tune the interface.", "Keep nearby", 60, "orbit", "workspace")
  ];
}

export function scopeRuntimeCardsToSession(cards = [], sessionId = "") {
  return cards.map((card) => ({
    ...card,
    sessionId: String(sessionId),
    session_id: String(sessionId),
    idempotencyKey: card.idempotencyKey || `session-${sessionId}-${workspaceCardId(card)}`
  }));
}
