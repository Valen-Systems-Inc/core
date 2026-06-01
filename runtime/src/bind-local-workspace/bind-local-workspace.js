import { createValenWorkspaceBridge } from "../call-valen-gateway/create-valen-workspace-bridge.js";
import { ensureRuntimeStateMirror, updateRuntimeStateMirror } from "../own-runtime-state-and-dom/own-runtime-dom-and-state-mirror.js";
import { bindWorkspaceModeCardActions } from "./bind-local-workspace-card-actions.js";

export function bindUI(state, audio, stageDirector) {
  const valenWorkspace = createValenWorkspaceBridge();
  window.ValenWorkspace = valenWorkspace;
  valenWorkspace.init();
  ensureRuntimeStateMirror();

  const workspaceActions = bindWorkspaceModeCardActions({ state, stageDirector, valenWorkspace });
  window.valenRuntimeActions = {
    refreshWorkspaceCards: workspaceActions.refreshWorkspaceCards,
    handleWorkspaceCardAction: workspaceActions.handleWorkspaceCardAction,
    submitChat: async (message = "") => {
      const text = String(message || "").trim();
      if (!text) return null;
      const result = await valenWorkspace.callHook("queue-capability-work-object", {
        method: "POST",
        body: { sessionId: valenWorkspace.getHookSessionId(), capability: text, title: text }
      });
      await workspaceActions.refreshWorkspaceCards("local-input");
      return result;
    },
    createLocalStarterCards: async (payload = {}) => {
      const result = await valenWorkspace.createBusinessStarterCards(payload);
      await workspaceActions.refreshWorkspaceCards("manual-starter");
      return result;
    }
  };

  document.getElementById("audio-toggle")?.addEventListener("click", () => audio.toggle());
  document.getElementById("refresh-workspace")?.addEventListener("click", () => workspaceActions.refreshWorkspaceCards("button"));
  document.getElementById("reset-workspace")?.addEventListener("click", async () => {
    await valenWorkspace.callHook("reset-local-workspace", { method: "POST", body: { sessionId: valenWorkspace.getHookSessionId() } });
    await bootstrapLocalWorkspace();
  });

  updateRuntimeStateMirror({ phaseId: "WorkspaceMode", activeCard: "card10", activeObjectId: "card10", reason: "local-bind", cards: [] });
  window.setTimeout(bootstrapLocalWorkspace, 0);

  async function bootstrapLocalWorkspace() {
    const existing = await valenWorkspace.loadCards();
    if (!existing.visibleCards?.length) {
      await valenWorkspace.createBusinessStarterCards({
        source: "public-playground",
        businessType: "studio",
        market: "local",
        goal: "Improve a local spatial interface for AI agents."
      });
    }
    await workspaceActions.refreshWorkspaceCards("bootstrap");
  }
}
