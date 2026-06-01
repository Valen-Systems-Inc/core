export const CARD_GLASS_RGB = [218, 222, 220];
export const CARD_GLASS_TONE = [0.78, 0.81, 0.8];
export const CARD_COPY_SURFACE_PROFILES = {
  "card-chat-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.05, visibility: 0.9 },
    rotation: [-0.006, 0.004, -0.002],
    regions: {
      title: { x: 82, y: 70, width: 720, line: 56, maxLines: 3, font: "900 50px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 88, y: 204, width: 690, line: 28, maxLines: 8, minFontPx: 20, font: "620 24px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      input: { x: 330, y: 448, width: 510, font: "720 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      submit: { x: 116, y: 446, width: 138, font: "900 28px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
    }
  },
  "card-chat-second-stage-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: -1.15, visibility: 0.9 },
    rotation: [-0.006, 0.004, -0.002],
    regions: {
      title: { x: 82, y: 70, width: 720, line: 56, maxLines: 3, font: "900 50px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 88, y: 204, width: 690, line: 28, maxLines: 8, minFontPx: 20, font: "620 24px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      transcript: { x: 78, y: 96, width: 760, line: 22, maxY: 404, font: "620 20px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      input: { x: 330, y: 448, width: 510, font: "720 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      submit: { x: 116, y: 446, width: 138, font: "900 28px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
    }
  },
  "card-base-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.048, visibility: 0.84 },
    rotation: [-0.004, 0.004, -0.002],
    regions: {
      title: { x: 76, y: 84, width: 750, line: 56, maxLines: 3, font: "900 52px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 84, y: 246, width: 650, line: 30, maxLines: 7, minFontPx: 20, font: "620 26px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
    }
  },
  "card-single-button-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.05, visibility: 0.86 },
    rotation: [-0.005, 0.004, -0.002],
    regions: {
      title: { x: 80, y: 78, width: 720, line: 54, maxLines: 3, font: "900 50px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 88, y: 226, width: 640, line: 29, maxLines: 7, minFontPx: 20, font: "620 25px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      offer: { x: 96, y: 352, width: 470, line: 48, font: "900 42px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      action: { x: 382, y: 452, width: 300, height: 56, font: "850 30px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
    }
  },
  "card-multi-button-asset": {
    frontNormal: [0, 0, -1],
    surface: { center: [0.5, 0.5], size: [1, 1], offset: 0.05, visibility: 0.86 },
    rotation: [-0.005, 0.004, -0.002],
    regions: {
      title: { x: 72, y: 70, width: 720, line: 52, maxLines: 3, font: "900 48px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      body: { x: 78, y: 202, width: 650, line: 27, maxLines: 7, minFontPx: 19, font: "620 23px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
      columns: [
        { x: 104, y: 312, width: 220 },
        { x: 400, y: 312, width: 240 },
        { x: 698, y: 312, width: 230 }
      ],
      buttons: [
        { x: 134, y: 454, width: 200, height: 58, font: "820 27px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
        { x: 432, y: 454, width: 200, height: 58, font: "820 27px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" },
        { x: 730, y: 454, width: 200, height: 58, font: "820 27px Space Grotesk, Neue Haas Grotesk Display, Arial, sans-serif" }
      ]
    }
  }
};
