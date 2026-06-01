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

export const runtimePanelCopyDrawMethods = {
  drawTitleCopy(ctx, object, region) {
    return this.drawWrappedText(ctx, object.copy?.title || object.label, region.x, region.y, region.width, region.line, region.maxLines || 2);
  },

  getBodyCopyMaxY(object, regions, bodyStartY) {
    const controls = [
      regions.input?.y,
      regions.action?.y,
      ...(regions.buttons || []).map((button) => button.y)
    ].filter((value) => Number.isFinite(value));
    const controlY = controls.length ? Math.min(...controls) : 430;
    return Math.max(bodyStartY + 56, controlY - 18);
  },

  parseCanvasFontSize(font = "") {
    const match = String(font).match(/(\d+(?:\.\d+)?)px/);
    return match ? Number(match[1]) : 24;
  },

  scaleCanvasFont(font, nextSize) {
    return String(font).replace(/(\d+(?:\.\d+)?)px/, `${Number(nextSize).toFixed(nextSize % 1 ? 1 : 0)}px`);
  },

  wrapTextRows(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const rows = [];
    let row = "";
    words.forEach((word) => {
      const next = row ? `${row} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !row) {
        row = next;
        return;
      }
      rows.push(row);
      row = word;
    });
    if (row) rows.push(row);
    return rows;
  },

  drawChatTranscript(ctx, inputState, object, region) {
    const maxY = region.maxY ?? (region.y + (region.maxLines || 8) * (region.line || 30));
    const viewportHeight = Math.max(24, maxY - region.y);
    const baseFont = this.holographicCanvasFont(region.font || "620 24px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif");
    const baseSize = this.fontSizeFromCss(baseFont, 24);
    const lineHeight = Math.max(18, Math.min(region.line || baseSize * 1.2, 30));
    const transcriptTextCap = this.capabilities.mobileOptimized ? 34 : 23;
    const transcriptLabelSize = this.capabilities.mobileOptimized ? 19 : 14;
    const labelFont = this.holographicCanvasFont(`820 ${transcriptLabelSize}px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif`);
    const textFont = this.holographicCanvasFont(this.scaleCanvasFont(baseFont, Math.min(baseSize, transcriptTextCap)));
    const messageWidth = Math.max(80, (region.width || 520) - 18);
    const rows = [];
    const pushMessage = (message = {}) => {
      const content = String(message.content || "").trim();
      if (!content) return;
      const role = String(message.role || "assistant").toLowerCase();
      const label = role === "user" ? "YOU" : role === "tool" ? "TOOL" : "VALEN";
      rows.push({ kind: "label", text: label, role });
      ctx.font = textFont;
      this.wrapTextRows(ctx, content, messageWidth).forEach((line) => {
        rows.push({ kind: "content", text: line, role });
      });
      rows.push({ kind: "gap", text: "", role });
    };

    inputState.messages.forEach(pushMessage);
    if (inputState.streamingText) {
      pushMessage({
        role: inputState.toolName ? "tool" : "assistant",
        content: `${inputState.streamingText}${inputState.isStreaming ? " |" : ""}`
      });
    }
    if (!rows.length) {
      inputState.chatTranscriptRows = 0;
      return this.drawFittedWrappedText(ctx, object.copy?.body || "", region);
    }

    const allowedLines = Math.max(1, Math.floor(viewportHeight / lineHeight));
    const maxScroll = Math.max(0, rows.length - allowedLines);
    const startLine = inputState.chatAutoScroll || !Number.isFinite(inputState.chatScrollLine)
      ? maxScroll
      : RuntimeMath.clamp(Math.round(inputState.chatScrollLine), 0, maxScroll);
    inputState.chatScrollLine = startLine;
    inputState.chatTranscriptRows = rows.length;

    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x - 4, region.y - 2, region.width + 8, viewportHeight + 4);
    ctx.clip();
    rows.slice(startLine, startLine + allowedLines).forEach((row, index) => {
      if (row.kind === "gap") return;
      const y = region.y + index * lineHeight;
      if (row.kind === "label") {
        ctx.font = labelFont;
        ctx.fillStyle = row.role === "user"
          ? "rgba(250, 247, 238, 0.66)"
          : "rgba(147, 219, 221, 0.72)";
        ctx.fillText(row.text, region.x, y, region.width);
        return;
      }
      ctx.font = textFont;
      ctx.fillStyle = row.role === "user"
        ? "rgba(250, 247, 238, 0.78)"
        : "rgba(231, 243, 244, 0.62)";
      ctx.fillText(row.text, region.x + 12, y, messageWidth);
    });
    ctx.restore();

    if (rows.length > allowedLines) {
      const trackX = region.x + region.width + 10;
      const trackHeight = Math.max(18, viewportHeight - 6);
      const thumbHeight = Math.max(16, trackHeight * (allowedLines / rows.length));
      const thumbY = region.y + 3 + (trackHeight - thumbHeight) * (startLine / Math.max(1, maxScroll));
      ctx.fillStyle = "rgba(147, 219, 221, 0.16)";
      ctx.fillRect(trackX, region.y + 3, 2, trackHeight);
      ctx.fillStyle = "rgba(212, 244, 255, 0.42)";
      ctx.fillRect(trackX - 1, thumbY, 4, thumbHeight);
    }

    return region.y + Math.min(rows.length - startLine, allowedLines) * lineHeight;
  },

  drawFittedWrappedText(ctx, text, region) {
    const originalFont = ctx.font;
    const originalSize = this.parseCanvasFontSize(originalFont);
    const minSize = region.minFontPx || Math.max(17, originalSize * 0.72);
    let size = originalSize;
    let lineHeight = region.line || originalSize * 1.22;
    let rows = [];
    let allowedLines = region.maxLines || 3;
    const maxY = region.maxY ?? (region.y + allowedLines * lineHeight);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      ctx.font = this.scaleCanvasFont(originalFont, size);
      lineHeight = (region.line || originalSize * 1.22) * (size / originalSize);
      allowedLines = Math.max(1, Math.min(region.maxLines || 12, Math.floor((maxY - region.y) / Math.max(1, lineHeight))));
      rows = this.wrapTextRows(ctx, text, region.width);
      if (rows.length <= allowedLines || size <= minSize) break;
      size = Math.max(minSize, size - 2);
    }
    rows.slice(0, allowedLines).forEach((row, index) => ctx.fillText(row, region.x, region.y + index * lineHeight));
    ctx.font = originalFont;
    return region.y + Math.min(rows.length, allowedLines) * lineHeight;
  },

  drawCenteredCopyText(ctx, text, region) {
    const height = region.height ?? 50;
    ctx.save();
    ctx.textAlign = "center";
    const centerX = Number.isFinite(region.textCenterX) ? region.textCenterX : region.x + region.width * 0.5;
    if (region.alignY === "mesh-bounds") {
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, centerX, this.meshBoundedTextBaseline(ctx, text, region), region.width * 0.92);
    } else {
      ctx.textBaseline = "middle";
      ctx.fillText(text, centerX, region.y + height * 0.5, region.width * 0.92);
    }
    ctx.restore();
  },

  drawFieldCopyText(ctx, text, region) {
    const paddingX = region.paddingX ?? 22;
    const fontSize = this.fontSizeFromCss(region.font, 24);
    const height = region.height ?? fontSize * 1.8;
    const y = region.alignY === "mesh-bounds"
      ? this.meshBoundedTextBaseline(ctx, text, region)
      : region.y + Math.max(0, (height - fontSize) * 0.5) - 1;
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = region.alignY === "mesh-bounds" ? "alphabetic" : "top";
    ctx.fillText(text, region.x + paddingX, y, Math.max(24, region.width - paddingX * 1.55));
    ctx.restore();
  },

  meshTextCenterY(region) {
    if (Number.isFinite(region.textMinY) && Number.isFinite(region.textMaxY)) {
      return (region.textMinY + region.textMaxY) * 0.5;
    }
    if (Number.isFinite(region.meshCenterY)) return region.meshCenterY;
    if (Number.isFinite(region.textCenterY)) return region.textCenterY;
    return NaN;
  },

  meshBoundedTextBaseline(ctx, text, region) {
    const centerY = this.meshTextCenterY(region);
    if (!Number.isFinite(centerY)) return region.y ?? 0;
    const metrics = ctx.measureText(text || "M");
    const fontSize = this.fontSizeFromCss(ctx.font, 24);
    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent) ? metrics.actualBoundingBoxAscent : fontSize * 0.72;
    const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : fontSize * 0.22;
    return centerY + (ascent - descent) * 0.5;
  },

  fontSizeFromCss(font, fallback = 24) {
    const match = String(font || "").match(/(\d+(?:\.\d+)?)px/);
    return match ? Number(match[1]) : fallback;
  },

  roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  drawTrackedText(ctx, text, x, y, tracking) {
    let cursor = x;
    String(text || "").split("").forEach((letter) => {
      ctx.fillText(letter, cursor, y);
      cursor += ctx.measureText(letter).width + tracking;
    });
    return cursor;
  },

  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
        return;
      }
      lines.push(line);
      line = word;
    });
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((row, index) => ctx.fillText(row, x, y + index * lineHeight));
    return y + Math.min(lines.length, maxLines) * lineHeight;
  }
};
