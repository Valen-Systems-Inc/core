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

export const runtimePanelTextureLifecycleMethods = {
  createBlankTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return texture;
  },

  configureCanvasTexture(texture) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const anisotropy = gl.getExtension("EXT_texture_filter_anisotropic") ||
      gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") ||
      gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
    if (anisotropy) {
      const max = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
      gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, max));
    }
    gl.generateMipmap(gl.TEXTURE_2D);
  },

  createCopyTextures() {
    const textures = new Map();
    this.objects.forEach((object) => {
      if (!object.copy) return;
      textures.set(object.id, this.createCopyTexture(object));
      this.copyTextureSignatures.set(object.id, this.getCopySignature(object));
    });
    return textures;
  },

  createTypeTextures() {
    const textures = new Map();
    this.objects.forEach((object) => {
      if (!object.spatialType?.enabled) return;
      textures.set(object.id, this.createTypeTexture(object, this.getRuntimePanelLayerGeometry(object, this.getGeometryForObject(object))));
      this.typeTextureSignatures.set(object.id, this.getCopySignature(object));
    });
    return textures;
  },

  createCopyTexture(object) {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) return this.blankTexture;
    ctx.scale(2, 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const tone = CARD_GLASS_RGB;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    const hasSpatialType = !!object.spatialType?.enabled;
    const floatingSurface = object.copy?.surface === "floating";

    if (hasSpatialType || floatingSurface) {
      this.drawFloatingCardMedia(ctx, object, tone);
      if (object.copy.mode === "input") {
        this.drawInputPreview(ctx, object, 78, 356, { layout: "left-button", buttonLabel: "Send" });
      }
      return this.canvasToTexture(canvas);
    }

    ctx.shadowColor = "rgba(0, 0, 0, 0.62)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.96)`;
    ctx.font = "800 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    this.drawTrackedText(ctx, object.copy.eyebrow || object.label, 78, 66, 7);

    ctx.fillStyle = "rgba(250, 247, 238, 0.99)";
    ctx.font = `${hasSpatialType ? "850 44px" : "850 54px"} Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`;
    const titleY = this.drawWrappedText(ctx, object.copy.title || object.label, 78, 128, 780, hasSpatialType ? 52 : 62, 2);

    ctx.fillStyle = "rgba(235, 234, 224, 0.84)";
    ctx.font = `${hasSpatialType ? "560 25px" : "560 27px"} Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`;
    const bodyY = this.drawWrappedText(ctx, object.copy.body || "", 78, titleY + 22, 760, hasSpatialType ? 35 : 38, 3);

    if (object.copy.mode === "pricing") {
      this.drawPricingRows(ctx, object, 78, 336);
    } else if (object.copy.mode === "input") {
      this.drawInputPreview(ctx, object, 78, Math.min(344, bodyY + 24));
    } else if (object.copy.mode === "steps") {
      this.drawStepPreview(ctx, object, 78, Math.min(344, bodyY + 18));
    } else if (object.copy.action) {
      this.drawPill(ctx, object.copy.action, 78, Math.min(354, bodyY + 28), 310, 52, tone);
    }

    if (!object.copy.mode && !object.copy.action) {
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.74)`;
      ctx.font = "700 21px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(object.copy.meta || object.route || "", 78, 424);
    }

    return this.canvasToTexture(canvas);
  },

  createTypeTexture(object, cardGeometry = null) {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) return this.blankTexture;
    ctx.scale(2, 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const tone = CARD_GLASS_RGB;
    const runtimeInputState = this.getRuntimeInputState(object.id);
    const lastChatMessage = runtimeInputState.messages[runtimeInputState.messages.length - 1];
    const runtimeBodyCopy = runtimeInputState.streamingText || lastChatMessage?.content || object.copy?.body || "";
    const assetId = this.getRuntimePanelLayerAssetId(object);
    const isRuntimeChatTranscript = object.id === "card10" || assetId === "card-chat-second-stage-asset";
    const profile = this.getCardCopySurfaceProfile(object);
    const regions = this.geometryBackedCopyRegions(object, cardGeometry) || profile.regions || {};
    const glowScale = this.holographicGlowScale();
    const titleInk = this.holographicInkStyle("rgba(250, 247, 238, 0.86)", "rgba(204, 216, 214, 0.3)");
    const bodyInk = this.holographicInkStyle("rgba(231, 243, 244, 0.56)", "rgba(190, 205, 204, 0.24)");
    const controlInk = this.holographicInkStyle(
      `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.74)`,
      "rgba(190, 205, 204, 0.29)"
    );
    const actionInk = this.holographicInkStyle(
      `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.78)`,
      "rgba(194, 208, 206, 0.31)"
    );
    const buttonInk = this.holographicInkStyle("rgba(250, 247, 238, 0.68)", "rgba(192, 207, 205, 0.28)");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";

    ctx.save();
    ctx.shadowColor = `rgba(212, 244, 255, ${0.22 * glowScale})`;
    ctx.shadowBlur = 11 * glowScale;
    ctx.fillStyle = titleInk;
    const titleRegion = regions.title || { x: 96, y: 86, width: 760, line: 46, font: "900 42px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
    ctx.font = this.holographicCanvasFont(titleRegion.font);
    const hasVisibleTitle = String(object.copy?.title || object.label || "").trim().length > 0;
    const bodyY = isRuntimeChatTranscript && !hasVisibleTitle
      ? titleRegion.y
      : this.drawTitleCopy(ctx, object, titleRegion);

    ctx.shadowColor = `rgba(212, 244, 255, ${0.1 * glowScale})`;
    ctx.shadowBlur = 6 * glowScale;
    ctx.fillStyle = bodyInk;
    const bodyRegion = isRuntimeChatTranscript && regions.transcript
      ? regions.transcript
      : regions.body || { x: titleRegion.x + 4, y: bodyY + 14, width: titleRegion.width * 0.88, line: 34, font: "620 27px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
    ctx.font = this.holographicCanvasFont(bodyRegion.font);
    const bodyStartY = isRuntimeChatTranscript && regions.transcript
      ? bodyRegion.y
      : Math.max(bodyRegion.y ?? Math.min(286, bodyY + 14), bodyY + (bodyRegion.gap ?? 14));
    const detailRegion = {
      ...bodyRegion,
      y: bodyStartY,
      maxY: bodyRegion.maxY ?? this.getBodyCopyMaxY(object, regions, bodyStartY)
    };
    if (this.capabilities.mobileOptimized && isRuntimeChatTranscript) {
      const transcriptFont = detailRegion.font || "620 20px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      detailRegion.font = this.scaleCanvasFont(transcriptFont, Math.max(this.parseCanvasFontSize(transcriptFont), 34));
      detailRegion.line = Math.max(detailRegion.line || 0, 38);
    }
    const detailY = isRuntimeChatTranscript
      ? this.drawChatTranscript(ctx, runtimeInputState, object, detailRegion)
      : this.drawFittedWrappedText(ctx, runtimeBodyCopy, detailRegion);

    const pricingOptions = Array.isArray(object.copy?.options)
      ? object.copy.options
      : Array.isArray(object.copy?.tiers)
        ? object.copy.tiers.map((tier) => {
          const [first, ...labelParts] = String(tier).split(" ");
          const hasPriceToken = /^[$\d]/.test(first || "");
          return {
            price: hasPriceToken ? first : "",
            label: hasPriceToken ? labelParts.join(" ") || tier : tier
          };
        })
        : [];
    if (object.copy?.mode === "input") {
      const rawInput = regions.input || { x: 140, y: 414, width: 360, font: "720 22px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
      const input = this.capabilities.mobileOptimized && isRuntimeChatTranscript
        ? {
          ...rawInput,
          font: this.scaleCanvasFont(rawInput.font, 23),
          ...(Number.isFinite(rawInput.meshMinY) && Number.isFinite(rawInput.meshMaxY)
            ? { textMinY: rawInput.meshMinY + 5, textMaxY: rawInput.meshMaxY + 5 }
            : {})
        }
        : rawInput;
      ctx.shadowColor = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${0.16 * glowScale})`;
      ctx.shadowBlur = 6 * glowScale;
      ctx.fillStyle = controlInk;
      const inputFont = this.holographicCanvasFont(input.font);
      ctx.font = inputFont;
      const fieldText = runtimeInputState.inputValue || object.copy?.field || "How can i help you?";
      this.drawFieldCopyText(ctx, fieldText, { ...input, font: inputFont });
      if (this.isRuntimeZone(object, "input") && this.getInputCaretPhase(object) === 0) {
        const paddingX = input.paddingX ?? 22;
        const fontSize = this.fontSizeFromCss(inputFont, 24);
        const height = input.height ?? fontSize * 1.8;
        const caretText = runtimeInputState.inputValue
          ? fieldText.slice(0, runtimeInputState.inputCaret)
          : "";
        const caretX = Math.min(input.x + input.width - paddingX, input.x + paddingX + ctx.measureText(caretText).width + 6);
        const caretCenterY = this.meshTextCenterY(input);
        const caretY = Number.isFinite(caretCenterY)
          ? caretCenterY - (fontSize + 6) * 0.5
          : input.y + Math.max(0, (height - fontSize) * 0.5) - 2;
        ctx.fillRect(caretX, caretY, 2, fontSize + 6);
      }
      const rawSubmit = regions.submit || { x: 826, y: 413, width: 52, font: "900 24px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
      const submit = this.capabilities.mobileOptimized && isRuntimeChatTranscript
        ? {
          ...rawSubmit,
          font: this.scaleCanvasFont(rawSubmit.font, 22),
          ...(Number.isFinite(rawSubmit.meshMinY) && Number.isFinite(rawSubmit.meshMaxY)
            ? { textMinY: rawSubmit.meshMinY - 14, textMaxY: rawSubmit.meshMaxY - 14 }
            : {})
        }
        : rawSubmit;
      ctx.fillStyle = buttonInk;
      ctx.font = this.holographicCanvasFont(submit.font);
      this.drawCenteredCopyText(ctx, "Send", submit);
    } else if (object.copy?.mode === "pricing" && pricingOptions.length) {
      const columns = regions.columns || [];
      const buttons = regions.buttons || [];
      ctx.shadowColor = `rgba(250, 247, 238, ${0.12 * glowScale})`;
      ctx.shadowBlur = 5 * glowScale;
      pricingOptions.slice(0, 3).forEach((option, optionIndex) => {
        const column = columns[optionIndex] || { x: 96 + optionIndex * 280, y: Math.min(330, detailY + 24), width: 220 };
        const button = buttons[optionIndex] || { x: column.x + 34, y: 414, width: 170 };
        const label = option.price ? `${option.price} ${option.label}` : option.label || "";
        ctx.fillStyle = buttonInk;
        ctx.font = this.holographicCanvasFont(button.font || "780 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif");
        this.drawCenteredCopyText(ctx, label || option.price || "", button);
      });
    } else if (object.copy?.mode === "steps") {
      const columns = regions.columns || [];
      const buttons = regions.buttons || [];
      const steps = object.copy.steps || ["Map", "Learn + Connect", "Run"];
      ctx.shadowColor = `rgba(250, 247, 238, ${0.12 * glowScale})`;
      ctx.shadowBlur = 5 * glowScale;
      steps.slice(0, 3).forEach((step, stepIndex) => {
        const column = columns[stepIndex] || { x: 96 + stepIndex * 265, y: Math.min(330, detailY + 24), width: 220 };
        const button = buttons[stepIndex] || { x: column.x + 34, y: 414, width: 170 };
        ctx.fillStyle = buttonInk;
        ctx.font = this.holographicCanvasFont(button.font || "780 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif");
        this.drawCenteredCopyText(ctx, step, button);
      });
    }
    if (object.copy?.strikePrice || object.copy?.salePrice) {
      const offer = regions.offer || { x: 96, y: Math.min(372, detailY + 32), width: 470, line: 48, font: "900 42px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
      const strikePrice = String(object.copy?.strikePrice || "").trim();
      const salePrice = String(object.copy?.salePrice || "").trim();
      ctx.shadowColor = `rgba(250, 247, 238, ${0.16 * glowScale})`;
      ctx.shadowBlur = 6 * glowScale;
      ctx.font = this.holographicCanvasFont(offer.font);
      ctx.fillStyle = "rgba(250, 247, 238, 0.46)";
      const strikeWidth = strikePrice ? ctx.measureText(strikePrice).width : 0;
      if (strikePrice) {
        ctx.fillText(strikePrice, offer.x, offer.y, offer.width);
        ctx.fillRect(offer.x - 4, offer.y + (offer.line || 48) * 0.46, strikeWidth + 8, 4);
      }
      if (salePrice) {
        ctx.fillStyle = actionInk;
        ctx.fillText(salePrice, offer.x + strikeWidth + (strikeWidth ? 34 : 0), offer.y, offer.width);
      }
    }
    if (object.copy?.action) {
      const action = regions.action || { x: 392, y: 412, width: 250, font: "850 23px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" };
      ctx.shadowColor = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${0.16 * glowScale})`;
      ctx.shadowBlur = 6 * glowScale;
      ctx.fillStyle = actionInk;
      ctx.font = this.holographicCanvasFont(action.font);
      this.drawCenteredCopyText(ctx, object.copy.action, action);
    }
    ctx.restore();

    return this.canvasToTexture(canvas);
  },

  canvasToTexture(canvas) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.configureCanvasTexture(texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    return texture;
  }
};
