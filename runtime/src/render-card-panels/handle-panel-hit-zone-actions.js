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

export const runtimePanelActionMethods = {
  getCopySignature(object) {
    const inputState = this.getRuntimeInputState(object.id);
    return [
      this.cardInteractionState.version,
      this.visualPanelGeometryVersion,
      inputState.version,
      inputState.inputValue,
      inputState.inputCaret,
      inputState.messages.length,
      inputState.messages[inputState.messages.length - 1]?.content || "",
      inputState.messages.map((message) => `${message.role}:${message.content}`).join("\u001f").slice(-4000),
      inputState.streamingText,
      inputState.isStreaming ? "streaming" : "idle",
      inputState.toolName,
      inputState.chatScrollLine,
      inputState.chatAutoScroll ? "auto" : "manual",
      this.getInputCaretPhase(object),
      this.cardInteractionState.activeZoneId,
      this.state.get("pressedMeshId") || "none",
      this.state.get("pressedZoneId") || "none",
      JSON.stringify(object.copy || {}),
      object.id
    ].join("|");
  },

  ensureCopyTexture(object) {
    if (!object.copy) return;
    const signature = this.getCopySignature(object);
    if (this.copyTextureSignatures.get(object.id) === signature) return;
    const previous = this.copyTextures.get(object.id);
    const texture = this.createCopyTexture(object);
    this.copyTextures.set(object.id, texture);
    this.copyTextureSignatures.set(object.id, signature);
    if (previous && previous !== this.blankTexture) this.gl.deleteTexture(previous);
  },

  ensureTypeTexture(object, cardGeometry = null) {
    if (!object.spatialType?.enabled) return;
    const signature = this.getCopySignature(object);
    if (this.typeTextureSignatures.get(object.id) === signature) return;
    const previous = this.typeTextures.get(object.id);
    const texture = this.createTypeTexture(object, this.getRuntimePanelLayerGeometry(object, cardGeometry || this.getGeometryForObject(object)));
    this.typeTextures.set(object.id, texture);
    this.typeTextureSignatures.set(object.id, signature);
    if (previous && previous !== this.blankTexture) this.gl.deleteTexture(previous);
  },

  getHitTargets() {
    return this.hitTargets;
  },

  bindCardBaseMaterialUniforms(geometry = this.geometry) {
    const slots = geometry?.materialSlots || [];
    const profile = this.cardMaterialProfiles.get(geometry?.source) || this.cardMaterialProfiles.get(this.defaultCardAssetId) || {};
    const gl = this.gl;
    for (let index = 0; index < 4; index += 1) {
      const slot = slots[index] || slots[0] || {};
      const base = slot.baseColor || profile.baseColor || [0.22, 0.22, 0.22, 0.28];
      const transmission = slot.transmission ?? profile.transmission ?? 1;
      gl.uniform4f(
        this.locations.materialBaseColors[index],
        base[0] ?? 0.22,
        base[1] ?? 0.22,
        base[2] ?? 0.22,
        base[3] ?? 0.28
      );
      gl.uniform1f(this.locations.materialRoughnesses[index], slot.roughness ?? profile.roughness ?? 0.1);
      gl.uniform1f(this.locations.materialMetallics[index], slot.metallic ?? profile.metallic ?? 0);
      gl.uniform1f(this.locations.materialIors[index], slot.ior ?? profile.ior ?? 1.45);
      gl.uniform1f(this.locations.materialTransmissions[index], transmission);
      gl.uniform1f(this.locations.materialCoats[index], slot.coatWeight ?? profile.coatWeight ?? 0.25);
      gl.uniform1f(this.locations.materialCoatRoughnesses[index], slot.coatRoughness ?? profile.coatRoughness ?? 0.15);
    }
  },

  handleClick(target) {
    if (!target) return;
    if (target.zone) {
      this.activateZone(target.zone, target);
      return;
    }
    this.scrollToRoute(target.route);
  },

  activateZone(zone, target) {
    const runtimeZoneId = `${target.id}:${zone.id}`;
    this.setActiveRuntimeZone(runtimeZoneId, `zone:${zone.id}`);
    this.state.set("activeLabel", runtimeZoneId);
    if (target.role === "input" && zone.id === "input") return;
    if ((target.id === "card1" || target.id === "card10") && zone.id === "primaryCta") {
      window.valenRuntimeActions?.submitChat?.(this.getRuntimeInputState(target.id).inputValue, target.id);
      return;
    }
    if (this.isEmailInputObject(target) && zone.id === "primaryCta") {
      window.valenRuntimeActions?.submitEmailGrab?.(
        this.getRuntimeInputState(target.id).inputValue,
        target.id === PUBLIC_INPUT_CARD ? "public-input" : "secondary-input"
      );
      return;
    }
    if (zone.action === "tryLocal") {
      window.valenRuntimeActions?.tryLocal?.();
      return;
    }
    if (zone.action === "secondaryInput") {
      window.valenRuntimeActions?.openSecondaryInput?.();
      return;
    }
    if (zone.action === "workspaceAction" && zone.verb) {
      window.valenRuntimeActions?.handleWorkspaceCardAction?.(target.id, zone.verb);
      return;
    }
    if (zone.action === "route") {
      this.scrollToRoute(zone.route || target.route);
      return;
    }
    if (target.id === "card4") {
      window.valenRuntimeActions?.requestExample?.();
      return;
    }
    if (target.id === "card5" && zone.id === "secondary-input") {
      window.valenRuntimeActions?.openSecondaryInput?.();
      return;
    }
    if (zone.domTarget?.includes("secondary-input")) {
      window.valenRuntimeActions?.openSecondaryInput?.();
      return;
    }
    if (zone.domTarget?.includes("open-demo") || zone.domTarget?.includes("demo-open")) {
      window.valenRuntimeActions?.requestExample?.();
      return;
    }
    this.scrollToRoute(zone.route || target.route);
  },

  findDomTarget(selector) {
    if (!selector) return null;
    return selector.split(",").map((part) => document.querySelector(part.trim())).find(Boolean) || null;
  },

  scrollToRoute(route) {
    if (!route) return;
    const element = document.querySelector(route);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", route);
  },
};
