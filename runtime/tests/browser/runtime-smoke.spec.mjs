import { expect, test } from "@playwright/test";

test("runtime boots, mirrors state, and renders local WorkspaceMode cards", async ({ page }) => {
  const assetFailures = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/Could not load|Three PBR asset layer unavailable|Failed to load resource/.test(text)) {
      assetFailures.push(`${message.type()}: ${text}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/assets/")) {
      assetFailures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`.trim());
    }
  });

  await page.goto("/?sessionId=424242");

  await page.waitForFunction(() => Boolean(window.VALEN_RUNTIME && window.ValenWorkspace));
  await page.waitForFunction(() => document.body.classList.contains("runtime-pbr-ready"));

  const result = await page.evaluate(async () => {
    const sessionId = window.ValenWorkspace.getHookSessionId();
    await window.ValenWorkspace.createBusinessStarterCards({
      sessionId,
      source: "browser-smoke",
      businessType: "studio",
      market: "local",
      goal: "Improve the local spatial interface"
    });
    window.VALEN_RUNTIME.setExperiencePhase("WorkspaceMode", "card10", "browser-smoke");
    await window.VALEN_RUNTIME.refreshWorkspaceCards("browser-smoke");
    return {
      bridgeReady: Boolean(window.ValenWorkspace.getHookSessionId && window.ValenWorkspace.loadCards),
      mirror: window.VALEN_RUNTIME.getRuntimeStateMirror(),
      hidden: window.getComputedStyle(document.getElementById("valen-runtime-state")).display === "none",
      pbrReady: document.body.classList.contains("runtime-pbr-ready"),
      bodyPhase: document.body.dataset.valencorePhase || "",
      visibleMarkers: document.querySelectorAll("#valen-runtime-state [data-valen-card-id]").length
    };
  });

  expect(assetFailures).toEqual([]);
  expect(result.bridgeReady).toBe(true);
  expect(result.hidden).toBe(true);
  expect(result.pbrReady).toBe(true);
  expect(result.bodyPhase).toBe("WorkspaceMode");
  expect(result.mirror.phaseId).toBe("WorkspaceMode");
  expect(result.mirror.cards.length).toBeGreaterThanOrEqual(3);
  expect(result.visibleMarkers).toBeGreaterThanOrEqual(3);
  expect(result.mirror.cards.some((card) => card.bucket === "foreground")).toBe(true);
  expect(result.mirror.cards.some((card) => card.bucket === "orbit")).toBe(true);
});
