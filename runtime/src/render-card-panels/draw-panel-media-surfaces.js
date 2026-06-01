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

export const runtimePanelMediaDrawMethods = {
  drawFloatingCardMedia(ctx, object, tone) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const bloom = ctx.createRadialGradient(492, 182, 18, 492, 182, 520);
    bloom.addColorStop(0, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.052)`);
    bloom.addColorStop(0.38, "rgba(214, 247, 255, 0.018)");
    bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.07)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(138, 300);
    ctx.bezierCurveTo(282, 248, 382, 318, 522, 248);
    ctx.bezierCurveTo(642, 188, 760, 250, 852, 182);
    ctx.stroke();

    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 14; i += 1) {
      const x = 112 + i * 58;
      const top = 112 + Math.sin(i * 0.82 + (object.priority || 0)) * 32;
      const bottom = 312 - Math.cos(i * 0.64) * 18;
      const grad = ctx.createLinearGradient(x, top, x, bottom);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.55, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.07)`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, top, 2.2, bottom - top);
    }
    ctx.restore();
  },

  drawMediaWash(ctx, object, tone) {
    const seed = (object.priority || 0) + 1;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const wash = ctx.createRadialGradient(760, 84, 40, 760, 84, 520);
    wash.addColorStop(0, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.052)`);
    wash.addColorStop(0.45, "rgba(255, 255, 255, 0.012)");
    wash.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(246, 241, 232, 0.005)";
    ctx.font = "900 150px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    ctx.fillText(String(object.copy?.eyebrow || object.label || "").slice(0, 8), 470, 270);
    ctx.restore();
  },

  drawMediaPlateStructure(ctx, object, tone) {
    const seed = (object.priority || 0) + 1;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const rail = ctx.createLinearGradient(730, 58, 952, 420);
    rail.addColorStop(0, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.026)`);
    rail.addColorStop(0.52, "rgba(246, 241, 232, 0.012)");
    rail.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = rail;
    this.roundedRect(ctx, 676, 72, 248, 300, 36);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.035)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(78, 284);
    ctx.lineTo(890, 284);
    ctx.moveTo(78, 318);
    ctx.lineTo(890, 318);
    ctx.stroke();

    ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.34)`;
    ctx.font = "800 13px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    ctx.fillText(`CORE ${String(object.role || "stage").toUpperCase()} SURFACE`, 678, 406);
    ctx.restore();
  },

  drawPricingRows(ctx, object, x, y) {
    const tone = CARD_GLASS_RGB;
    const tiers = [
      { id: "priceFounding", label: "Basic", price: "$49", note: "one-time", x: 0, width: 210 },
      { id: "pricePriority", label: "Premium", price: "$249", note: "priority", x: 272, width: 230, primary: true },
      { id: "secondary-input", label: "Custom", price: "Scope", note: "security + rollout", x: 592, width: 222 }
    ];
    ctx.save();
    ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.48)`;
    ctx.font = "800 15px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    ctx.fillText("CARD-NATIVE ACCESS CONTROLS", x, y - 34);
    tiers.forEach((tier, index) => {
      const rowX = x + tier.x;
      const pressed = this.isPressedZone(object, tier.id);
      const active = this.isRuntimeZone(object, tier.id);
      const pressY = pressed ? 4 : 0;
      ctx.fillStyle = "rgba(250, 247, 238, 0.94)";
      ctx.font = "850 32px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(tier.price, rowX + 24, y + 18 + pressY);
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.76)`;
      ctx.font = "800 19px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(tier.label, rowX + 24, y + 58 + pressY);
      ctx.fillStyle = "rgba(246, 241, 232, 0.52)";
      ctx.font = "650 13px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(tier.note, rowX + 24, y + 82 + pressY);
    });
    ctx.restore();
  },

  drawInputPreview(ctx, object, x, y, options = {}) {
    const tone = CARD_GLASS_RGB;
    const active = this.isRuntimeZone(object, "input");
    const inputState = this.getRuntimeInputState(object.id);
    const leftButton = options.layout === "left-button";
    const fieldX = leftButton ? x + 220 : x + 4;
    const fieldWidth = leftButton ? 624 : 690;
    const fieldHeight = 92;
    const sendX = leftButton ? x + 12 : x + 682;
    const value = inputState.inputValue || object.copy.field || "How can i help you?";
    ctx.fillStyle = inputState.inputValue ? "rgba(250, 247, 238, 0.9)" : "rgba(246, 241, 232, 0.52)";
    ctx.font = "700 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    ctx.fillText(value, fieldX + 30, y + 22);
    if (active && Math.floor(performance.now() / 520) % 2 === 0) {
      const caretText = inputState.inputValue
        ? value.slice(0, inputState.inputCaret)
        : "";
      const caretX = Math.min(fieldX + fieldWidth - 42, fieldX + 25 + ctx.measureText(caretText).width);
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.86)`;
      ctx.fillRect(caretX + 4, y + 17, 2, 31);
    }
    this.drawPill(ctx, options.buttonLabel ?? "Send", sendX, y - 4, 178, 74, tone, { pressed: this.isPressedZone(object, "primaryCta"), active: this.isRuntimeZone(object, "primaryCta") });
  },

  drawStepPreview(ctx, object, x, y) {
    const tone = CARD_GLASS_RGB;
    (object.copy.steps || []).forEach((step, index) => {
      const rowX = x + index * 230;
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0.62)`;
      ctx.font = "800 21px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(`0${index + 1}`, rowX, y);
      ctx.fillStyle = "rgba(250, 247, 238, 0.86)";
      ctx.font = "800 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
      ctx.fillText(step, rowX, y + 34);
    });
  },

  drawPill(ctx, text, x, y, width, height, tone, options = {}) {
    const pressY = options.pressed ? 3 : 0;
    if (!text) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${options.active ? 0.34 : 0.2})`;
      ctx.beginPath();
      ctx.arc(x + width * 0.5, y + height * 0.5 + pressY, 7 + (options.active ? 1.5 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = "rgba(250, 247, 238, 0.92)";
    ctx.font = "800 22px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif";
    this.drawCenteredCopyText(ctx, text, { x, y: y + pressY, width, height });
  }
};
