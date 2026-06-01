import { CORE_RUNTIME_MANIFEST } from "../describe-runtime-scenes/assemble-core-runtime-manifest.js";
export function detectRuntimeCapabilities() {
  const canvas = document.createElement("canvas");
  const webgl2 = !!canvas.getContext("webgl2", { antialias: true });
  const webgl1 = !!canvas.getContext("webgl", { antialias: true }) || !!canvas.getContext("experimental-webgl", { antialias: true });
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrowViewport = window.matchMedia("(max-width: 920px)").matches;
  const shortViewport = window.innerHeight < 820;
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const mobileDevice = coarsePointer || touchPoints > 0;
  const portraitViewport = window.innerHeight > window.innerWidth;
  const compactViewport = window.innerWidth <= 820 || (narrowViewport && window.innerHeight <= 1060) || (portraitViewport && window.innerWidth <= 920);
  const compactStageFit = compactViewport;
  const mobileSafari = mobileDevice &&
    /safari/i.test(window.navigator?.userAgent || "") &&
    !/(chrome|chromium|crios|fxios|edg)/i.test(window.navigator?.userAgent || "");
  const mobileOptimized = mobileDevice;
  return {
    webgl2,
    webgl1,
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    reducedMotion,
    audioContext: !!AudioContext,
    coarsePointer,
    touchPoints,
    mobileDevice,
    mobileSafari,
    compactViewport,
    compactStageFit,
    mobileOptimized,
    dpr: Math.min(window.devicePixelRatio || 1, CORE_RUNTIME_MANIFEST.performance.maxDpr)
  };
}
