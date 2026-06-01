import {
  normalizeWorkspaceCardStatus,
  normalizeWorkspaceCardType,
  parseRuntimeJson,
  workspaceCardId
} from "../shape-runtime-cards/normalize-cards-and-build-starters.js";

export const normalizeWorkspaceCards = (data = {}) => {
  if (Array.isArray(data.cards)) {
    const normalizedCards = data.cards.map((card) => ({
      ...card,
      card_type: normalizeWorkspaceCardType(card),
      status: normalizeWorkspaceCardStatus(card)
    }));
    return {
      foreground: normalizedCards.filter((card) => card.status === "pending" || card.status === "focused"),
      orbit: normalizedCards.filter((card) => card.status === "kept"),
      dismissed: normalizedCards.filter((card) => card.status === "dismissed"),
      archived: normalizedCards.filter((card) => card.status === "archived")
    };
  }
  const normalizeBucket = (cards = []) => Array.isArray(cards)
    ? cards.map((card) => ({ ...card, card_type: normalizeWorkspaceCardType(card), status: normalizeWorkspaceCardStatus(card) }))
    : [];
  return {
    foreground: normalizeBucket(data.foreground),
    orbit: normalizeBucket(data.orbit),
    dismissed: normalizeBucket(data.dismissed),
    archived: normalizeBucket(data.archived)
  };
};

export const countWorkspaceCards = (data = {}) => {
  const { foreground, orbit, dismissed, archived } = normalizeWorkspaceCards(data);
  return foreground.length + orbit.length + dismissed.length + archived.length;
};

export const runtimeCardPriority = (card = {}) => {
  const priority = Number(card.priority ?? card.card_priority ?? card.cardData?.priority ?? 0);
  return Number.isFinite(priority) ? priority : 0;
};

export const runtimeCardCreatedAt = (card = {}) => {
  const createdAt = Date.parse(card.created_at || card.createdAt || "");
  return Number.isFinite(createdAt) ? createdAt : 0;
};

export const runtimeCardNumericId = (card = {}) => {
  const numericId = Number(workspaceCardId(card));
  return Number.isFinite(numericId) ? numericId : 0;
};

export const sortRuntimeCardsForAttention = (cards = []) => [...cards].sort((a, b) => {
  const priorityDelta = runtimeCardPriority(b) - runtimeCardPriority(a);
  if (priorityDelta) return priorityDelta;
  const createdDelta = runtimeCardCreatedAt(b) - runtimeCardCreatedAt(a);
  if (createdDelta) return createdDelta;
  return runtimeCardNumericId(b) - runtimeCardNumericId(a);
});

export const selectUsageWorkspaceLayout = (foreground = [], orbit = []) => {
  const foregroundCards = sortRuntimeCardsForAttention(foreground);
  const orbitCards = sortRuntimeCardsForAttention(orbit);
  const primaryCard = foregroundCards[0] || null;
  const retainedCards = primaryCard
    ? [...orbitCards, ...foregroundCards.slice(1)]
    : orbitCards;
  const visibleCards = primaryCard
    ? [primaryCard, ...retainedCards.slice(0, 3)]
    : retainedCards.slice(0, 4);
  return {
    primaryCard,
    orbitCards,
    retainedCards,
    visibleCards,
    desiredActiveCard: primaryCard ? "card13" : "card10"
  };
};

export const cardDataForRuntime = (card = {}) => {
  const source = card && typeof card === "object" ? card : {};
  return parseRuntimeJson(source.card_data || source.cardData || source.data, {});
};

export const formatCardType = (cardType = "") => String(cardType || "workspace")
  .replace(/_/g, " ")
  .replace(/\b\w/g, (char) => char.toUpperCase());

export const primaryVerbForWorkspaceCard = (card = {}) => {
  const status = normalizeWorkspaceCardStatus(card);
  const cardType = normalizeWorkspaceCardType(card);
  const cardData = cardDataForRuntime(card);
  if (status === "kept") return "recall";
  if (cardType === "approval" || cardData.approval_state === "pending") return "approve";
  return "keep";
};

export const actionLabelForWorkspaceCard = (card = {}) => {
  const verb = primaryVerbForWorkspaceCard(card);
  if (verb === "recall") return "Recall";
  if (verb === "approve") return "Approve";
  if (normalizeWorkspaceCardType(card) === "qr_code") return "Keep QR";
  return "Keep";
};

export const copyForWorkspaceCard = (card = {}) => {
  const cardData = cardDataForRuntime(card);
  const cardType = normalizeWorkspaceCardType(card);
  const title = cardData.title || card.title || formatCardType(cardType);
  const body = cardData.body
    || cardData.summary
    || cardData.metric_label
    || cardData.metric_value
    || cardData.qrPayload
    || cardData.url
    || "Valen queued this workspace object.";
  const action = cardData.action || actionLabelForWorkspaceCard(card);
  return {
    eyebrow: cardData.eyebrow || formatCardType(cardType),
    title,
    body,
    meta: cardData.meta || cardData.label || card.status || "pending",
    action
  };
};
