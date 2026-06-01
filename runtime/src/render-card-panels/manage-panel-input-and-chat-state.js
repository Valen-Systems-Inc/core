import { PUBLIC_INPUT_CARD } from "../configure-runtime/configure-runtime-hosts-and-gates.js";
import { CORE_RUNTIME_MANIFEST } from "../describe-runtime-scenes/assemble-core-runtime-manifest.js";
import {
  CARD_COPY_SURFACE_PROFILES,
  CARD_GLASS_RGB,
  CARD_GLASS_TONE
} from "../describe-runtime-scenes/describe-card-copy-surfaces.js";
import {
  CARD_RIBBON_HANDOFF,
  MOBILE_ACTIVE_CARD_SCALE,
  SLOT_SEQUENCE,
  STAGE_LATENT_SLOTS,
  TAU
} from "../describe-runtime-scenes/configure-stage-layout-and-camera.js";
import { RuntimeMath } from "../calculate-runtime-values/calculate-runtime-geometry-and-easing.js";

export const runtimePanelInputMethods = {
  installNativeInputOverlay() {
    if (this.nativeInputOverlay || typeof document === "undefined") return this.nativeInputOverlay;
    const input = document.createElement("input");
    input.id = "runtime-native-input-overlay";
    input.type = "text";
    input.name = "runtimeNativeInput";
    input.autocomplete = "off";
    input.autocapitalize = "sentences";
    input.spellcheck = true;
    input.inputMode = "text";
    input.enterKeyHint = "send";
    input.dataset.noGlClick = "true";
    input.dataset.runtimeNativeInput = "true";
    input.setAttribute("aria-label", "Message Valen");
    Object.assign(input.style, {
      position: "fixed",
      zIndex: "34",
      left: "0px",
      top: "0px",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "0",
      border: "0",
      outline: "0",
      borderRadius: "0",
      background: "transparent",
      color: "transparent",
      caretColor: "transparent",
      opacity: "0.02",
      pointerEvents: "none",
      transform: "translate3d(-9999px, -9999px, 0)",
      appearance: "none",
      WebkitAppearance: "none",
      font: "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    });
    input.addEventListener("focus", this.onNativeInputOverlayFocus);
    input.addEventListener("input", this.onNativeInputOverlayInput);
    input.addEventListener("keydown", this.onNativeInputOverlayKeyDown);
    input.addEventListener("blur", this.onNativeInputOverlayBlur);
    document.body.append(input);
    this.nativeInputOverlay = input;
    return input;
  },

  hideNativeInputOverlay() {
    if (!this.nativeInputOverlay) return;
    this.nativeInputOverlay.style.pointerEvents = "none";
    this.nativeInputOverlay.style.width = "1px";
    this.nativeInputOverlay.style.height = "1px";
    this.nativeInputOverlay.style.transform = "translate3d(-9999px, -9999px, 0)";
  },

  getRuntimeObjectById(objectId = "") {
    return this.objects.find((object) => object.id === objectId) || null;
  },

  isEmailInputObject(objectOrId = null) {
    const object = typeof objectOrId === "string" ? this.getRuntimeObjectById(objectOrId) : objectOrId;
    return object?.copy?.inputType === "email" || object?.role === "email" || object?.id === "card9";
  },

  updateNativeInputOverlay(target = null, zone = null) {
    const input = this.installNativeInputOverlay();
    if (!input || !this.capabilities.mobileDevice || !target || !zone) {
      this.hideNativeInputOverlay();
      return;
    }
    const viewWidth = Math.max(1, window.innerWidth || 1);
    const viewHeight = Math.max(1, window.innerHeight || 1);
    const rectWidth = Math.max(0.001, target.rect.maxX - target.rect.minX);
    const rectHeight = Math.max(0.001, target.rect.maxY - target.rect.minY);
    const [zoneX, zoneY, zoneW, zoneH] = zone.rect;
    const leftNorm = target.rect.minX + zoneX * rectWidth;
    const rightNorm = target.rect.minX + (zoneX + zoneW) * rectWidth;
    const bottomNorm = target.rect.minY + zoneY * rectHeight;
    const topNorm = target.rect.minY + (zoneY + zoneH) * rectHeight;
    const padX = 10;
    const padY = 8;
    const left = RuntimeMath.clamp(leftNorm * viewWidth - padX, 0, viewWidth - 24);
    const top = RuntimeMath.clamp((1 - topNorm) * viewHeight - padY, 0, viewHeight - 24);
    const width = RuntimeMath.clamp((rightNorm - leftNorm) * viewWidth + padX * 2, 44, viewWidth - left);
    const height = RuntimeMath.clamp((topNorm - bottomNorm) * viewHeight + padY * 2, 38, viewHeight - top);
    const inputState = this.getRuntimeInputState(target.id);
    const isEmailInput = this.isEmailInputObject(target);
    input.dataset.objectId = target.id;
    input.type = isEmailInput ? "email" : "text";
    input.inputMode = isEmailInput ? "email" : "text";
    input.autocomplete = isEmailInput ? "email" : "off";
    input.setAttribute("aria-label", isEmailInput ? "Email Valen" : "Message Valen");
    this.syncNativeInputOverlay(inputState);
    input.style.left = `${left}px`;
    input.style.top = `${top}px`;
    input.style.width = `${width}px`;
    input.style.height = `${height}px`;
    input.style.transform = "translate3d(0, 0, 0)";
    input.style.pointerEvents = "auto";
  },

  syncNativeInputOverlay(inputState = this.getActiveRuntimeInputState()) {
    const input = this.nativeInputOverlay;
    if (!input || !inputState || this.nativeInputOverlaySyncing) return;
    if (input.dataset.objectId !== inputState.objectId) return;
    this.nativeInputOverlaySyncing = true;
    const nextValue = inputState.inputValue || "";
    if (input.value !== nextValue) input.value = nextValue;
    if (document.activeElement === input) {
      const caret = RuntimeMath.clamp(inputState.inputCaret ?? nextValue.length, 0, nextValue.length);
      try {
        input.setSelectionRange(caret, caret);
      } catch {}
    }
    this.nativeInputOverlaySyncing = false;
  },

  onNativeInputOverlayFocus(event) {
    const objectId = event.currentTarget?.dataset.objectId || "card1";
    this.setActiveRuntimeZone(`${objectId}:input`, "native-input-focus");
  },

  onNativeInputOverlayInput(event) {
    if (this.nativeInputOverlaySyncing) return;
    const input = event.currentTarget;
    const objectId = input?.dataset.objectId || "card1";
    const inputState = this.getRuntimeInputState(objectId);
    inputState.inputValue = String(input.value || "").slice(0, 240);
    if (input.value !== inputState.inputValue) input.value = inputState.inputValue;
    const caret = Number.isFinite(input.selectionStart)
      ? input.selectionStart
      : inputState.inputValue.length;
    inputState.inputCaret = RuntimeMath.clamp(caret, 0, inputState.inputValue.length);
    if (this.getActiveInputObjectId() !== objectId) {
      this.setActiveRuntimeZone(`${objectId}:input`, "native-input-edit");
    } else {
      this.bumpRuntimeInputState(objectId, "native-input-edit");
    }
  },

  onNativeInputOverlayKeyDown(event) {
    event.stopPropagation();
    const objectId = event.currentTarget?.dataset.objectId || "card1";
    if (event.key === "Escape") {
      this.setActiveRuntimeZone("none", "native-input-blur");
      event.currentTarget?.blur?.();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const inputState = this.getRuntimeInputState(objectId);
    const isEmailGrab = this.isEmailInputObject(objectId);
    const action = isEmailGrab ? "email-submit" : "chat-submit";
    this.setActiveRuntimeZone(`${objectId}:primaryCta`, action);
    if (isEmailGrab) window.valenRuntimeActions?.submitEmailGrab?.(inputState.inputValue, objectId === PUBLIC_INPUT_CARD ? "public-input" : "secondary-input");
    else window.valenRuntimeActions?.submitChat?.(inputState.inputValue, objectId);
  },

  onNativeInputOverlayBlur(event) {
    const objectId = event.currentTarget?.dataset.objectId || "";
    if (this.getActiveInputObjectId() === objectId) {
      this.setActiveRuntimeZone("none", "native-input-blur");
    }
  },

  getRuntimeInputState(objectId = "card1") {
    const key = objectId || "card1";
    if (!this.runtimeInputStatesByObjectId.has(key)) {
      this.runtimeInputStatesByObjectId.set(key, {
        objectId: key,
        inputValue: "",
        inputCaret: 0,
        messages: [],
        streamingText: "",
        isStreaming: false,
        toolName: "",
        chatScrollLine: 0,
        chatAutoScroll: true,
        chatTranscriptRows: 0,
        lastAction: "none",
        version: 0
      });
    }
    return this.runtimeInputStatesByObjectId.get(key);
  },

  getActiveRuntimeInputState() {
    const objectId = this.getActiveInputObjectId();
    return objectId ? this.getRuntimeInputState(objectId) : null;
  },

  syncCardInteractionInputMirror(inputState = this.getActiveRuntimeInputState()) {
    this.cardInteractionState.inputValue = inputState?.inputValue || "";
    this.cardInteractionState.inputCaret = inputState?.inputCaret || 0;
  },

  bumpRuntimeInputState(objectId = this.getActiveInputObjectId(), lastAction = null) {
    const inputState = objectId ? this.getRuntimeInputState(objectId) : null;
    if (inputState) {
      inputState.version += 1;
      if (lastAction) inputState.lastAction = lastAction;
      this.syncCardInteractionInputMirror(inputState);
      this.state.set("runtimeInputObjectId", objectId);
      this.state.set("runtimeInputValue", inputState.inputValue);
      this.state.set("runtimeInputCaret", inputState.inputCaret);
      this.state.set("runtimeInputStreaming", inputState.streamingText);
      this.syncNativeInputOverlay(inputState);
    } else {
      this.state.set("runtimeInputObjectId", "none");
      this.state.set("runtimeInputValue", "");
      this.state.set("runtimeInputCaret", 0);
      this.state.set("runtimeInputStreaming", "");
    }
    if (lastAction) this.cardInteractionState.lastAction = lastAction;
    this.cardInteractionState.version += 1;
    this.state.set("runtimeLastAction", this.cardInteractionState.lastAction);
  },

  focusInput(objectId = "card1", reason = "external") {
    this.setActiveRuntimeZone(`${objectId}:input`, reason);
    return this.getRuntimeInputState(objectId);
  },

  clearInput(objectId = this.getActiveInputObjectId() || "card1", reason = "input-clear") {
    const inputState = this.getRuntimeInputState(objectId);
    inputState.inputValue = "";
    inputState.inputCaret = 0;
    this.bumpRuntimeInputState(objectId, reason);
  },

  appendChatMessage(objectId = "card10", message = {}) {
    const inputState = this.getRuntimeInputState(objectId);
    const role = message.role || "assistant";
    const content = String(message.content || "");
    if (content) inputState.messages.push({ role, content });
    inputState.chatAutoScroll = true;
    inputState.chatScrollLine = Number.POSITIVE_INFINITY;
    this.bumpRuntimeInputState(objectId, message.action || `chat:${role}`);
  },

  setChatStreaming(objectId = "card10", text = "", options = {}) {
    const inputState = this.getRuntimeInputState(objectId);
    inputState.streamingText = String(text || "");
    inputState.isStreaming = !!options.isStreaming;
    inputState.toolName = options.toolName || "";
    if (options.autoScroll !== false) {
      inputState.chatAutoScroll = true;
      inputState.chatScrollLine = Number.POSITIVE_INFINITY;
    }
    this.bumpRuntimeInputState(objectId, options.action || "chat:stream");
  },

  scrollChat(objectId = "card10", deltaLines = 0) {
    const inputState = this.getRuntimeInputState(objectId);
    const rowCount = Math.max(0, inputState.chatTranscriptRows || 0);
    const maxScroll = Math.max(0, rowCount - 1);
    const current = Number.isFinite(inputState.chatScrollLine)
      ? inputState.chatScrollLine
      : maxScroll;
    inputState.chatScrollLine = RuntimeMath.clamp(current + deltaLines, 0, maxScroll);
    inputState.chatAutoScroll = inputState.chatScrollLine >= Math.max(0, maxScroll - 4);
    this.bumpRuntimeInputState(objectId, "chat:scroll");
  },

  getActiveInputObjectId() {
    const activeZoneId = this.cardInteractionState.activeZoneId || "";
    if (!activeZoneId.endsWith(":input")) return null;
    return activeZoneId.slice(0, -":input".length);
  },

  onKeyDown(event) {
    const inputObjectId = this.getActiveInputObjectId();
    if (!inputObjectId) return;
    if (document.activeElement?.closest?.(".modal")) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const inputState = this.getRuntimeInputState(inputObjectId);
    if (event.key === "Escape") {
      this.setActiveRuntimeZone("none", "input-blur");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const isEmailGrab = this.isEmailInputObject(inputObjectId);
      const action = isEmailGrab ? "email-submit" : "chat-submit";
      this.setActiveRuntimeZone(`${inputObjectId}:primaryCta`, action);
      if (isEmailGrab) window.valenRuntimeActions?.submitEmailGrab?.(inputState.inputValue, inputObjectId === PUBLIC_INPUT_CARD ? "public-input" : "secondary-input");
      else window.valenRuntimeActions?.submitChat?.(inputState.inputValue, inputObjectId);
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      if (inputState.inputCaret > 0) {
        const before = inputState.inputValue.slice(0, inputState.inputCaret - 1);
        const after = inputState.inputValue.slice(inputState.inputCaret);
        inputState.inputValue = before + after;
        inputState.inputCaret = before.length;
        this.bumpRuntimeInputState(inputObjectId, "input-edit");
      }
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      const before = inputState.inputValue.slice(0, inputState.inputCaret);
      const after = inputState.inputValue.slice(inputState.inputCaret);
      inputState.inputValue = `${before}${event.key}${after}`.slice(0, 240);
      inputState.inputCaret = Math.min(inputState.inputValue.length, before.length + 1);
      this.bumpRuntimeInputState(inputObjectId, "input-edit");
    }
  },

  setActiveRuntimeZone(zoneId, lastAction = "zone") {
    this.cardInteractionState.activeZoneId = zoneId || "none";
    this.cardInteractionState.lastAction = lastAction;
    const zoneObjectId = this.cardInteractionState.activeZoneId.includes(":")
      ? this.cardInteractionState.activeZoneId.split(":")[0]
      : null;
    const inputObjectId = this.getActiveInputObjectId() || zoneObjectId;
    if (inputObjectId) this.getRuntimeInputState(inputObjectId);
    this.bumpRuntimeInputState(inputObjectId, lastAction);
    this.state.set("activeZoneId", this.cardInteractionState.activeZoneId);
  },

  bumpCardState() {
    this.bumpRuntimeInputState(this.getActiveInputObjectId(), this.cardInteractionState.lastAction);
  },

  isRuntimeZone(object, zoneId) {
    return this.cardInteractionState.activeZoneId === `${object.id}:${zoneId}`;
  },

  isPressedZone(object, zoneId) {
    return this.state.get("pressedMeshId") === object.id && this.state.get("pressedZoneId") === zoneId;
  },

  getInputCaretPhase(object) {
    if (!object || !this.isRuntimeZone(object, "input")) return 0;
    return Math.floor(performance.now() / 520) % 2;
  },
};
