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

export const runtimePanelPresentationMethods = {
  getPresentationPose(object, transform, stagePhase = this.stagePhase, time = performance.now(), hover = 0, active = 0, pressed = 0) {
    const hasHolographicCopy = !!object.spatialType?.enabled;
    const cardOrbit = hasHolographicCopy ? Math.sin(time * 0.00032 + (object.priority || 0) * 0.22) * 0.14 * Math.max(active, 0.32) : 0;
    const cardBreathPitch = hasHolographicCopy ? Math.sin(time * 0.00024 + 1.2 + (object.priority || 0) * 0.18) * 0.026 * Math.max(active, 0.28) : 0;
    const displayMotionTarget = object.id === stagePhase?.activeObjectState
      || (object.id === stagePhase?.previousObjectId && stagePhase?.transitionPhase !== "idle");
    const gestureRead = displayMotionTarget
      ? RuntimeMath.clamp(this.gestureLean || 0, -1, 1) * RuntimeMath.clamp(0.42 + active * 0.54, 0, 1)
      : 0;
    const gestureYaw = gestureRead * 0.34;
    const gesturePitch = Math.abs(gestureRead) * -0.052;
    const gestureRoll = gestureRead * -0.056;
    const scaleBoost = 1 + hover * 0.058 + pressed * 0.04;
    return {
      position: [
        transform.position[0],
        transform.position[1],
        transform.position[2] - pressed * 0.035
      ],
      rotation: [
        transform.rotation[0] + cardBreathPitch + gesturePitch + (this.interaction.pointer.y - 0.5) * 0.072 * hover,
        transform.rotation[1] + cardOrbit + gestureYaw + (this.interaction.pointer.x - 0.5) * 0.092 * hover,
        transform.rotation[2] + gestureRoll
      ],
      scale: [
        transform.scale[0] * scaleBoost,
        transform.scale[1] * scaleBoost,
        transform.scale[2]
      ]
    };
  },

  getCardCopySurfaceProfile(object) {
    return CARD_COPY_SURFACE_PROFILES[this.getRuntimePanelLayerAssetId(object)] || CARD_COPY_SURFACE_PROFILES[this.defaultCardAssetId] || {
      frontNormal: [0, 0, -1],
      surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.04, visibility: 0.86 },
      rotation: [0, 0, 0],
      regions: {}
    };
  },

  holographicGlowScale() {
    return this.isSafariRuntime() ? 0.1 : 0.8;
  },

  isSafariRuntime() {
    const userAgent = window.navigator?.userAgent || "";
    return /safari/i.test(userAgent) && !/(chrome|chromium|crios|fxios|edg)/i.test(userAgent);
  },

  holographicCanvasFont(font) {
    if (!this.isSafariRuntime()) return font;
    return String(font || "")
      .replace(/^(\d{3})(?=\s)/, (_, weight) => String(Math.max(380, Number(weight) - 320)))
      .replace(/(\d+(?:\.\d+)?)px/, (_, size) => `${Math.round(Number(size) * 7.8) / 10}px`);
  },

  holographicInkStyle(defaultStyle, safariStyle) {
    return this.isSafariRuntime() ? safariStyle : defaultStyle;
  },

  getCardFrontNormal(object) {
    return this.getCardCopySurfaceProfile(object).frontNormal || [0, 0, -1];
  },

  getYawForCardFrontDirection(object, targetX, targetZ, extraYaw = 0) {
    const frontNormal = this.getCardFrontNormal(object);
    const localFrontAngle = Math.atan2(frontNormal[0] || 0, frontNormal[2] || 1);
    const targetAngle = Math.atan2(targetX, targetZ);
    return targetAngle - localFrontAngle + extraYaw;
  },

  getPartBounds(cardGeometry, matchers = []) {
    const parts = Array.isArray(cardGeometry?.parts) ? cardGeometry.parts : [];
    if (!parts.length) return null;
    const normalizedMatchers = matchers.map((matcher) => String(matcher).toLowerCase());
    const nodeMatch = parts.find((entry) => {
      const nodeName = String(entry.nodeName || "").toLowerCase();
      return normalizedMatchers.some((matcher) => nodeName.includes(matcher));
    });
    const part = nodeMatch || parts.find((entry) => {
      const meshName = String(entry.meshName || "").toLowerCase();
      return normalizedMatchers.some((matcher) => meshName.includes(matcher));
    });
    return part?.bounds || null;
  },

  boundsToAtlasRegion(cardGeometry, bounds, padding = {}) {
    const card = cardGeometry?.bounds;
    if (!card || !bounds) return null;
    const atlasWidth = 1024;
    const atlasHeight = 512;
    const cardWidth = Math.max(0.001, card.maxX - card.minX);
    const cardHeight = Math.max(0.001, card.maxY - card.minY);
    const padX = padding.x || 0;
    const padY = padding.y || 0;
    const u0 = RuntimeMath.clamp((bounds.minX - card.minX) / cardWidth, 0, 1);
    const u1 = RuntimeMath.clamp((bounds.maxX - card.minX) / cardWidth, 0, 1);
    const v0 = RuntimeMath.clamp((bounds.minY - card.minY) / cardHeight, 0, 1);
    const v1 = RuntimeMath.clamp((bounds.maxY - card.minY) / cardHeight, 0, 1);
    const x = u0 * atlasWidth - padX;
    const y = (1 - v1) * atlasHeight - padY;
    const width = (u1 - u0) * atlasWidth + padX * 2;
    const height = (v1 - v0) * atlasHeight + padY * 2;
    const meshCenterX = ((u0 + u1) * 0.5) * atlasWidth;
    const meshCenterY = (1 - ((v0 + v1) * 0.5)) * atlasHeight;
    return {
      x: RuntimeMath.clamp(x, 0, atlasWidth),
      y: RuntimeMath.clamp(y, 0, atlasHeight),
      width: RuntimeMath.clamp(width, 1, atlasWidth),
      height: RuntimeMath.clamp(height, 1, atlasHeight),
      centerX: RuntimeMath.clamp(x + width * 0.5, 0, atlasWidth),
      centerY: RuntimeMath.clamp(y + height * 0.5, 0, atlasHeight),
      meshCenterX: RuntimeMath.clamp(meshCenterX, 0, atlasWidth),
      meshCenterY: RuntimeMath.clamp(meshCenterY, 0, atlasHeight),
      meshMinY: RuntimeMath.clamp((1 - v1) * atlasHeight, 0, atlasHeight),
      meshMaxY: RuntimeMath.clamp((1 - v0) * atlasHeight, 0, atlasHeight)
    };
  },

  getPartAtlasRegion(cardGeometry, matchers, padding = {}) {
    return this.boundsToAtlasRegion(cardGeometry, this.getPartBounds(cardGeometry, matchers), padding);
  },

  geometryBackedCopyRegions(object, cardGeometry) {
    const profile = this.getCardCopySurfaceProfile(object);
    const assetId = this.getRuntimePanelLayerAssetId(object);
    const regions = {
      ...(profile.regions || {})
    };
    const insetX = assetId === "card-multi-button-asset" ? 76 : 86;
    const titleWidth = assetId === "card-base-asset" ? 720 : assetId === "card-multi-button-asset" ? 700 : 680;
    const titleY = assetId === "card-base-asset" ? 84 : 72;
    const bodyY = assetId === "card-multi-button-asset" ? 202 : assetId === "card-base-asset" ? 238 : 220;
    if (!regions.title) {
      regions.title = {
        x: insetX,
        y: titleY,
        width: titleWidth,
        line: assetId === "card-base-asset" ? 62 : assetId === "card-multi-button-asset" ? 61 : 64,
        maxLines: 2,
        font: assetId === "card-multi-button-asset"
          ? "900 56px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
          : "900 58px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
      };
    }
    if (!regions.body) {
      regions.body = {
        x: insetX + 6,
        y: bodyY,
        width: assetId === "card-base-asset" ? 610 : assetId === "card-multi-button-asset" ? 585 : 560,
        line: assetId === "card-multi-button-asset" ? 43 : 46,
        maxLines: assetId === "card-multi-button-asset" ? 2 : 3,
        font: assetId === "card-multi-button-asset"
          ? "620 36px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
          : "620 37px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
      };
    }

    if (assetId === "card-chat-asset" || assetId === "card-chat-second-stage-asset") {
      const input = this.getPartAtlasRegion(cardGeometry, ["cardchatinputfield"], { x: 10, y: 4 });
      const submit = this.getPartAtlasRegion(cardGeometry, ["cardchatsendbutton"], { x: 8, y: 4 });
      const isSecondStageChat = assetId === "card-chat-second-stage-asset";
      if (input) {
        const inputTextOffsetY = isSecondStageChat ? 6.5 : 0;
        regions.input = {
          ...input,
          paddingX: 28,
          font: `${isSecondStageChat ? "720 18px" : "720 29px"} Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`,
          ...(isSecondStageChat ? { alignY: "mesh-bounds", textMinY: input.meshMinY + inputTextOffsetY, textMaxY: input.meshMaxY + inputTextOffsetY } : {})
        };
      }
      if (submit) {
        const submitTextOffsetX = isSecondStageChat ? 5 : 0;
        const submitTextOffsetY = isSecondStageChat ? -10 : 0;
        regions.submit = {
          ...submit,
          font: `${isSecondStageChat ? "900 18px" : "900 28px"} Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`,
          ...(isSecondStageChat ? { alignY: "mesh-bounds", textCenterX: submit.meshCenterX + submitTextOffsetX, textMinY: submit.meshMinY + submitTextOffsetY, textMaxY: submit.meshMaxY + submitTextOffsetY } : {})
        };
      }
    }

    if (assetId === "card-single-button-asset") {
      const action = this.getPartAtlasRegion(cardGeometry, ["cardsinglebuttoncontrol"], { x: 8, y: 4 });
      if (action) {
        regions.action = {
          ...action,
          font: "850 28px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
        };
      }
    }

    if (assetId === "card-multi-button-asset") {
      const buttonMatchers = [
        ["cardmultibuttonleft"],
        ["cardmultibuttonmiddle"],
        ["cardmultibuttonright"]
      ];
      const buttons = buttonMatchers
        .map((matchers) => this.getPartAtlasRegion(cardGeometry, matchers, { x: 7, y: 4 }))
        .filter(Boolean)
        .map((button) => ({
          ...button,
          font: "820 26px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
        }));
      if (buttons.length) {
        regions.buttons = buttons;
        regions.columns = buttons.map((button) => {
          const width = Math.max(178, button.width + 18);
          return {
            x: RuntimeMath.clamp(button.centerX - width * 0.5, 34, 1024 - width - 34),
            y: object.copy?.mode === "pricing" ? Math.max(286, button.y - 98) : Math.max(286, button.y - 96),
            width,
            priceFont: "850 36px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif",
            labelFont: "700 23px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif",
            indexFont: "800 23px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif"
          };
        });
      }
    }
    return regions;
  },

  rotateLocalDirection(direction, rotation) {
    const matrix = this.zoneModelMatrix;
    RuntimeMath.compose(matrix, [0, 0, 0], rotation, [1, 1, 1]);
    return [
      matrix[0] * direction[0] + matrix[4] * direction[1] + matrix[8] * direction[2],
      matrix[1] * direction[0] + matrix[5] * direction[1] + matrix[9] * direction[2],
      matrix[2] * direction[0] + matrix[6] * direction[1] + matrix[10] * direction[2]
    ];
  },

  getCardFacingAmount(rotation, frontNormal = [0, 0, 1]) {
    const worldFront = this.rotateLocalDirection(frontNormal, rotation);
    return RuntimeMath.smoothstep(0.02, 0.72, worldFront[2]);
  },

  getHolographicCopyLayout(object, cardGeometry) {
    const profile = this.getCardCopySurfaceProfile(object);
    const bounds = cardGeometry?.bounds || { minX: -1, minY: -1, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 };
    const hasAuthoredGeometry = Array.isArray(cardGeometry?.parts) && cardGeometry.parts.length > 0;
    const surface = profile.surface || {};
    const frontNormal = profile.frontNormal || [0, 0, 1];
    const width = Math.max(0.001, bounds.maxX - bounds.minX);
    const height = Math.max(0.001, bounds.maxY - bounds.minY);
    const frontZ = frontNormal[2] >= 0 ? bounds.maxZ ?? 0 : bounds.minZ ?? 0;
    const center = surface.center || (hasAuthoredGeometry ? [0.5, 0.52] : [0.5, 0.56]);
    const size = surface.size || (hasAuthoredGeometry ? [0.76, 0.58] : [0.78, 0.64]);
    const offset = surface.offset ?? 0.04;
    return {
      frontNormal,
      position: [
        bounds.minX + center[0] * width + frontNormal[0] * offset,
        bounds.minY + center[1] * height + frontNormal[1] * offset,
        frontZ + frontNormal[2] * offset
      ],
      rotation: profile.rotation || [0, 0, 0],
      scale: [
        width * size[0] * 0.5 * (frontNormal[2] < 0 ? -1 : 1),
        height * size[1] * 0.5,
        1
      ],
      visibility: surface.visibility ?? 0.86
    };
  },

  getHolographicCopyVisibility(object, baseTransform, active, hover, baseCopyVisibility, frontNormal = [0, 0, 1]) {
    const facing = this.getCardFacingAmount(baseTransform.rotation, frontNormal);
    const isActive = object.id === this.stagePhase?.activeObjectState;
    const isHandoff = object.id === this.stagePhase?.previousObjectId && this.stagePhase?.transitionPhase !== "idle";
    const isLatent = this.stagePhase?.latentObjectStates?.includes(object.id);
    const activeRead = isActive ? facing * (0.72 + active * 0.28) : 0;
    const latentRead = isLatent ? facing * 0.16 : 0;
    const hoverRead = hover * facing * 0.16;
    const handoffRead = isHandoff ? facing * 0.44 : 0;
    const stateRead = Math.max(activeRead, latentRead, hoverRead, handoffRead, baseCopyVisibility * facing * 0.68);
    return RuntimeMath.clamp(stateRead, 0, 1);
  },
};
