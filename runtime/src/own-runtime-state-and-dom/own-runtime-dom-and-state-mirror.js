import {
  normalizeWorkspaceCardStatus,
  normalizeWorkspaceCardType,
  parseRuntimeJson,
  runtimeWorkspaceCardBucket,
  workspaceCardId
} from "../shape-runtime-cards/normalize-cards-and-build-starters.js";
import { CORE_RUNTIME_MANIFEST } from "../describe-runtime-scenes/assemble-core-runtime-manifest.js";

export function getRuntimeBootConfig() {
  if (typeof window === "undefined") return {};
  const configured = window.VALEN_RUNTIME_BOOT;
  return configured && typeof configured === "object" ? configured : {};
}

export function runtimeObjectById(objectId = "") {
  return CORE_RUNTIME_MANIFEST.runtimeObjectStates.find((object) => object.id === objectId) || null;
}

export function resolveBootObjectCardNumber(config = {}) {
  const object = runtimeObjectById(config.activeObjectId || config.activeObjectState || config.initialActiveObjectId);
  if (object?.cardNumber) return object.cardNumber;
  if (typeof config.activeCardNumber === "string" && config.activeCardNumber.trim()) return config.activeCardNumber.trim();
  if (typeof config.activeCard === "string" && config.activeCard.trim()) return config.activeCard.trim();
  return null;
}

export function applyRuntimeBootConfig(stageDirector, state, reason = "boot-config") {
  const config = getRuntimeBootConfig();
  const phaseId = config.initialPhase || config.phaseId || config.lockedPhase || "WorkspaceMode";
  const cardNumber = resolveBootObjectCardNumber(config) || "card10";
  if (!stageDirector) return null;

  const stagePhase = stageDirector.setExperiencePhase(phaseId, cardNumber);
  const activeObjectId = stagePhase?.activeObjectState || runtimeObjectById(config.activeObjectId)?.id || null;
  if (activeObjectId) document.body.dataset.valenActiveObjectId = activeObjectId;
  document.body.dataset.valenRuntimeBootPhase = phaseId;
  state.set("runtimeLastAction", `boot:${phaseId}:${activeObjectId || cardNumber}:${reason}`);
  return stagePhase;
}

export function runtimeStoredFlag(key, fallback = false) {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage?.getItem(key) === "1";
  } catch {
    return fallback;
  }
}

export function setRuntimeStoredFlag(key, enabled = false) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage?.setItem(key, "1");
    else window.localStorage?.removeItem(key);
  } catch {}
}

export function ensureRuntimeStateMirror() {
  if (typeof document === "undefined" || !document.body) return null;
  let node = document.getElementById("valen-runtime-state");
  if (!node) {
    node = document.createElement("section");
    node.id = "valen-runtime-state";
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("data-no-gl-click", "true");
    node.style.display = "none";
    document.body.appendChild(node);
  }
  return node;
}

export function updateRuntimeStateMirror(detail = {}) {
  const node = ensureRuntimeStateMirror();
  if (!node) return null;
  const existingState = parseRuntimeJson(node.querySelector("[data-valen-runtime-state]")?.textContent, {});
  const cards = Array.isArray(detail.cards) ? detail.cards : Array.isArray(existingState.cards) ? existingState.cards : [];
  const phaseId = detail.phaseId || detail.phase || document.body.dataset.valencorePhase || "WorkspaceMode";
  const activeCard = detail.activeCard || detail.scene || document.body.dataset.runtimeScene || "";
  const activeObjectId = detail.activeObjectId || document.body.dataset.valenActiveObjectId || "";

  document.body.dataset.valencorePhase = phaseId;
  if (activeCard) document.body.dataset.runtimeScene = activeCard;
  if (activeObjectId) document.body.dataset.valenActiveObjectId = activeObjectId;

  node.dataset.valencorePhase = phaseId;
  node.dataset.runtimeScene = activeCard;
  node.dataset.activeObjectId = activeObjectId;
  node.dataset.cardCount = String(cards.length);
  node.replaceChildren();

  const json = document.createElement("script");
  json.type = "application/json";
  json.dataset.valenRuntimeState = "true";
  json.textContent = JSON.stringify({
    phaseId,
    activeCard,
    activeObjectId,
    reason: detail.reason || "",
    bridgeReady: !!window.ValenWorkspace,
    cards: cards.map(toMirrorCard)
  });
  node.appendChild(json);

  cards.forEach((card) => {
    const mirrorCard = toMirrorCard(card);
    const marker = document.createElement("span");
    marker.dataset.valenCardId = mirrorCard.id;
    marker.dataset.valenCardType = mirrorCard.type;
    marker.dataset.valenCardStatus = mirrorCard.status;
    marker.dataset.valenCardBucket = mirrorCard.bucket;
    marker.dataset.valenCardTitle = mirrorCard.title;
    marker.setAttribute("aria-hidden", "true");
    node.appendChild(marker);
  });
  return node;
}

function toMirrorCard(card) {
  const cardData = parseRuntimeJson(card.card_data || card.cardData || card.data, {});
  return {
    id: String(workspaceCardId(card)),
    type: normalizeWorkspaceCardType(card),
    status: normalizeWorkspaceCardStatus(card),
    bucket: runtimeWorkspaceCardBucket(card),
    title: cardData.title || card.title || "",
    spatial_state: parseRuntimeJson(card.spatial_state || card.spatialState, null)
  };
}
