import { parseRuntimeJson } from "../shape-runtime-cards/normalize-cards-and-build-starters.js";
import { ensureRuntimeStateMirror, updateRuntimeStateMirror } from "../own-runtime-state-and-dom/own-runtime-dom-and-state-mirror.js";

export function installValenRuntimeGlobal({ renderer, stageDirector, state }) {
  window.VALEN_RUNTIME = {
    renderer,
    dispose: () => {
      renderer.dispose?.();
      if (window.VALEN_RUNTIME?.renderer === renderer) delete window.VALEN_RUNTIME;
    },
    setExperiencePhase: (phaseId = "WorkspaceMode", cardNumber = null, reason = "external") => {
      const stagePhase = stageDirector.setExperiencePhase(phaseId, cardNumber);
      const activeObjectId = stagePhase?.activeObjectState || null;
      if (activeObjectId) document.body.dataset.valenActiveObjectId = activeObjectId;
      state.set("runtimeLastAction", `mode:${phaseId}:${activeObjectId || cardNumber || "default"}:${reason}`);
      updateRuntimeStateMirror({ activeCard: stagePhase?.activeCardNumber || cardNumber || "", activeObjectId, phaseId, reason });
      return stagePhase;
    },
    focusInput: (objectId = "card10", reason = "external") => renderer.panelLayer?.focusInput?.(objectId, reason),
    clearInput: (objectId = "card10", reason = "external") => renderer.panelLayer?.clearInput?.(objectId, reason),
    appendChatMessage: (objectId = "card10", message = {}) => renderer.panelLayer?.appendChatMessage?.(objectId, message),
    scrollChat: (objectId = "card10", deltaLines = 0) => renderer.panelLayer?.scrollChat?.(objectId, deltaLines),
    getRuntimeStateMirror: () => {
      const json = ensureRuntimeStateMirror()?.querySelector?.("[data-valen-runtime-state]");
      return parseRuntimeJson(json?.textContent, {});
    },
    refreshWorkspaceCards: (reason = "manual") => window.valenRuntimeActions?.refreshWorkspaceCards?.(reason)
  };
  return window.VALEN_RUNTIME;
}
