import {
  normalizeWorkspaceCardStatus,
  normalizeWorkspaceCardType,
  runtimeWorkspaceCardBucket,
  runtimeWorkspaceSpatialState,
  workspaceCardId
} from "../shape-runtime-cards/normalize-cards-and-build-starters.js";
import { runtimeObjectById, updateRuntimeStateMirror } from "../own-runtime-state-and-dom/own-runtime-dom-and-state-mirror.js";
import {
  cardDataForRuntime,
  copyForWorkspaceCard,
  normalizeWorkspaceCards,
  primaryVerbForWorkspaceCard,
  selectUsageWorkspaceLayout
} from "./arrange-local-workspace-cards.js";

export function bindWorkspaceModeCardActions({ state, stageDirector, valenWorkspace }) {
  const updateWorkspaceCardSlots = (layout = {}) => {
    ["card13", "card14", "card15", "card16"].forEach((slotId, index) => {
      const object = runtimeObjectById(slotId);
      if (!object) return;
      const card = layout.visibleCards?.[index] || null;
      object.workspaceCardId = card ? workspaceCardId(card) : null;
      object.workspaceCardType = card ? normalizeWorkspaceCardType(card) : "";
      object.workspaceCardStatus = card ? normalizeWorkspaceCardStatus(card) : "";
      object.workspaceCardBucket = card ? runtimeWorkspaceCardBucket(card) : "";
      object.workspaceCardSpatialState = card ? runtimeWorkspaceSpatialState(card) : null;
      object.workspaceCardPrimaryVerb = card ? primaryVerbForWorkspaceCard(card) : "";
      object.workspaceCardData = cardDataForRuntime(card);
      object.copy = card ? copyForWorkspaceCard(card) : {
        eyebrow: "LOCAL WORKSPACE",
        title: "Work objects loading.",
        body: "The local adapter is bringing objects into this space.",
        meta: "LOCAL FIXTURE"
      };
    });
  };

  const refreshWorkspaceCards = async (reason = "refresh") => {
    const data = await valenWorkspace.loadCards();
    const { foreground, orbit, dismissed, archived } = normalizeWorkspaceCards(data);
    const cards = [...foreground, ...orbit, ...dismissed, ...archived];
    const layout = selectUsageWorkspaceLayout(foreground, orbit);
    updateWorkspaceCardSlots(layout);
    const stagePhase = stageDirector.setExperiencePhase("WorkspaceMode", layout.desiredActiveCard);
    const activeCard = stagePhase?.activeCardNumber || layout.desiredActiveCard;
    const activeObjectId = stagePhase?.activeObjectState || layout.desiredActiveCard;
    state.set("runtimeLastAction", `workspace:cards:${reason}:${cards.length}`);
    updateRuntimeStateMirror({ phaseId: "WorkspaceMode", activeCard, activeObjectId, reason, cards });
    await valenWorkspace.reportStatus({ phase: "WorkspaceMode", scene: activeCard, totalCardCount: cards.length });
    return data;
  };

  const handleWorkspaceCardAction = async (objectId = "", verb = "keep") => {
    const object = runtimeObjectById(objectId);
    if (!object?.workspaceCardId) return refreshWorkspaceCards(`empty-${verb}`);
    const resolvedVerb = object.workspaceCardPrimaryVerb || verb;
    await valenWorkspace.action(object.workspaceCardId, resolvedVerb, { requestedVerb: verb });
    return refreshWorkspaceCards(`card-${resolvedVerb}`);
  };

  return { handleWorkspaceCardAction, refreshWorkspaceCards, updateWorkspaceCardSlots };
}
