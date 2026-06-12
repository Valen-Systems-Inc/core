import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  advanceAgentDeskState,
  emptyAgentDeskState,
  liveAgentDeskStep
} from "./live-agent-desk-script.mjs";

const DEFAULT_STORE_PATH = path.join(os.tmpdir(), "core-public-local-card-store.json");

const WORKSPACE_WINDOWS = [
  "Preview",
  "Testing",
  "Approvals",
  "Local fixtures",
  "Developer tools"
];

export function createLocalValenCardHarness(options = {}) {
  const storePath = options.storePath || process.env.CORE_LOCAL_VALEN_STORE || DEFAULT_STORE_PATH;
  let loaded = false;
  let store = emptyStore();

  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
      const raw = await readFile(storePath, "utf8");
      store = normalizeStore(JSON.parse(raw));
    } catch {
      store = emptyStore();
    }
  }

  async function persist() {
    await mkdir(path.dirname(storePath), { recursive: true });
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`);
  }

  async function handleHookRequest({ hook, method = "GET", query = {}, body = {} }) {
    await ensureLoaded();
    const hookName = String(hook || "").trim();
    if (!hookName) return response(404, { ok: false, error: "missing_hook" });

    if (hookName === "get-cards") {
      const sessionId = getSessionId({ query, body });
      return response(200, getCards(sessionId));
    }

    if (hookName === "reset-local-workspace") {
      store = emptyStore();
      await persist();
      return response(200, { ok: true, success: true });
    }

    if (hookName === "stop-live-agent-desk") {
      const sessionId = getSessionId({ query, body });
      if (store.agentDesks[sessionId]) {
        store.agentDesks[sessionId].running = false;
        store.agentDesks[sessionId].completedAt = new Date().toISOString();
      }
      await persist();
      return response(200, { ok: true, success: true, sessionId, source: "stop-live-agent-desk" });
    }

    if (hookName === "upsert-card") {
      const sessionId = getSessionId({ query, body });
      const card = upsertCard(sessionId, body);
      await persist();
      return response(200, { ok: true, success: true, sessionId, created: card.created ? 1 : 0, updated: card.created ? 0 : 1, card: card.value });
    }

    if (hookName === "bulk-upsert-cards") {
      const sessionId = getSessionId({ query, body });
      const result = bulkUpsertCards(sessionId, Array.isArray(body.cards) ? body.cards : [], body.source || "local-harness");
      await persist();
      return response(200, { ok: true, success: true, sessionId, ...result, source: "bulk-upsert-cards" });
    }

    if (hookName === "create-business-starter-cards") {
      const sessionId = getSessionId({ query, body });
      const cards = Array.isArray(body.cards) && body.cards.length ? body.cards : starterCards(body);
      const result = bulkUpsertCards(sessionId, cards, body.source || "local-business-starter");
      await persist();
      return response(200, { ok: true, success: true, sessionId, ...result, source: "create-business-starter-cards" });
    }

    if (hookName === "process-card-action") {
      const sessionId = getSessionId({ query, body });
      const cardId = String(body.cardId || body.card_id || "").trim();
      const verb = String(body.action || body.verb || "").trim();
      const result = processCardAction(sessionId, cardId, verb, body.payload || {});
      await persist();
      return response(200, { ok: true, success: true, sessionId, ...result });
    }

    if (hookName === "report-runtime-status") {
      const sessionId = getSessionId({ query, body });
      const latestRuntimeReport = {
        ...body,
        sessionId,
        reportedAt: new Date().toISOString()
      };
      store.runtimeStatus[sessionId] = latestRuntimeReport;
      await persist();
      return response(200, { ok: true, success: true, sessionId, latestRuntimeReport });
    }

    if (hookName === "get-runtime-status") {
      const sessionId = getSessionId({ query, body });
      return response(200, getRuntimeStatus(sessionId));
    }

    if (hookName === "get-workspace-capabilities") {
      const sessionId = getSessionId({ query, body });
      return response(200, {
        ok: true,
        success: true,
        sessionId,
        windows: WORKSPACE_WINDOWS.map((sourceWindow) => ({
          sourceWindow,
          hiddenCapability: sourceWindow.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
        })),
        count: WORKSPACE_WINDOWS.length,
        source: "local-valen-card-harness"
      });
    }

    if (hookName === "queue-capability-work-object") {
      const sessionId = getSessionId({ query, body });
      const capability = String(body.capability || body.sourceWindow || body.window || "Workspace capability").trim();
      const card = upsertCard(sessionId, {
        id: body.id || `capability-${slug(capability)}`,
        title: body.title || `${capability} work object`,
        card_type: body.card_type || "work_object",
        status: body.status || "focused",
        card_data: {
          title: body.title || `${capability} work object`,
          body: body.body || "Local harness queued this as a card-ready capability object.",
          next_action: body.nextAction || "Review"
        },
        spatial_state: body.spatial_state || { space: "foreground", cluster: "capabilities" },
        source: body.source || "local-capability-queue"
      });
      await persist();
      return response(200, { ok: true, success: true, sessionId, card: card.value, source: "queue-capability-work-object" });
    }

    if (hookName === "start-live-agent-desk") {
      const sessionId = getSessionId({ query, body });
      store.agentDesks[sessionId] = {
        ...emptyAgentDeskState(),
        running: true,
        stepIndex: 0,
        startedAt: new Date().toISOString(),
        label: "starting",
        profile: {
          operatorName: body.operatorName || "Operator",
          builderName: body.builderName || "Builder",
          companyName: body.companyName || "Demo Co"
        }
      };
      store.cards = store.cards.filter((card) => {
        const cluster = parseJsonish(card.spatial_state).cluster;
        return !(String(card.sessionId) === String(sessionId) && cluster === "agent-desk");
      });
      await persist();
      const tick = await handleHookRequest({
        hook: "tick-live-agent-desk",
        method: "POST",
        body: { sessionId }
      });
      return response(200, {
        ok: true,
        success: true,
        sessionId,
        source: "start-live-agent-desk",
        desk: store.agentDesks[sessionId],
        ...(tick?.body || {})
      });
    }

    if (hookName === "tick-live-agent-desk") {
      const sessionId = getSessionId({ query, body });
      const desk = store.agentDesks[sessionId] || { ...emptyAgentDeskState(), running: true, profile: {} };
      if (!desk.running) {
        return response(400, { ok: false, success: false, error: "agent_desk_not_running", sessionId });
      }
      const frame = liveAgentDeskStep(desk, desk.profile || {});
      if (!frame.done && frame.cards?.length) {
        bulkUpsertCards(sessionId, frame.cards, "live-agent-desk");
      }
      const latestRuntimeReport = {
        ...frame.report,
        sessionId,
        reportedAt: new Date().toISOString(),
        agentDesk: true
      };
      store.runtimeStatus[sessionId] = latestRuntimeReport;
      desk.label = frame.label;
      desk.agentPhase = frame.report?.agentPhase || desk.agentPhase;
      desk.sculpturePulse = frame.report?.sculpturePulse ?? desk.sculpturePulse;
      if (frame.done) {
        desk.running = false;
        desk.completedAt = new Date().toISOString();
      } else {
        Object.assign(desk, advanceAgentDeskState(desk));
      }
      store.agentDesks[sessionId] = desk;
      const cards = getCards(sessionId);
      void persist();
      return response(200, {
        ok: true,
        success: true,
        sessionId,
        source: "tick-live-agent-desk",
        done: frame.done,
        label: frame.label,
        desk,
        latestRuntimeReport,
        ...cards
      });
    }

    if (hookName === "get-live-agent-desk-status") {
      const sessionId = getSessionId({ query, body });
      const desk = store.agentDesks[sessionId] || emptyAgentDeskState();
      return response(200, { ok: true, success: true, sessionId, desk, runtime: getRuntimeStatus(sessionId) });
    }

    if (hookName === "manage-valen-hooks") {
      const sessionId = getSessionId({ query, body });
      return response(200, {
        ok: true,
        success: true,
        sessionId,
        hooks: [
          "get-cards",
          "start-live-agent-desk",
          "tick-live-agent-desk",
          "get-live-agent-desk-status",
          "manage-valen-hooks",
          "queue-capability-work-object",
          "process-card-action",
          "report-runtime-status"
        ],
        gateway: "public-local-m2-preview",
        source: "manage-valen-hooks"
      });
    }

    return response(404, { ok: false, success: false, error: "local_harness_hook_not_implemented", hook: hookName });
  }

  return {
    handleHookRequest,
    storePath,
    async reset() {
      store = emptyStore();
      loaded = true;
      await persist();
    }
  };

  function getCards(sessionId) {
    const cards = cardsForSession(sessionId);
    const buckets = bucketCards(cards);
    return {
      ok: true,
      success: true,
      sessionId,
      session_id: sessionId,
      counts: countsForBuckets(buckets),
      summary: countsForBuckets(buckets),
      ...buckets,
      visibleCards: [...buckets.foreground, ...buckets.orbit]
    };
  }

  function getRuntimeStatus(sessionId) {
    const cards = getCards(sessionId);
    const latestRuntimeReport = store.runtimeStatus[sessionId] || null;
    const latestCardUpdate = cards.visibleCards
      .map((card) => Date.parse(card.updated_at || ""))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0] || 0;
    const reportedAt = Date.parse(latestRuntimeReport?.reportedAt || latestRuntimeReport?.updatedAt || "") || 0;
    const reportIsStale = Boolean(latestRuntimeReport && latestCardUpdate && reportedAt < latestCardUpdate);

    return {
      ok: true,
      success: true,
      sessionId,
      phase: latestRuntimeReport?.phase || latestRuntimeReport?.phaseId || "WorkspaceMode",
      scene: latestRuntimeReport?.scene || latestRuntimeReport?.activeCard || "card10",
      counts: cards.counts,
      foreground: cards.foreground,
      orbit: cards.orbit,
      dismissed: cards.dismissed,
      archived: cards.archived,
      visibleCards: cards.visibleCards,
      latestRuntimeReport,
      reportIsStale,
      truthSource: "local_persisted_cards_plus_latest_runtime_report"
    };
  }

  function upsertCard(sessionId, input = {}) {
    if (!sessionId) throw new Error("missing_session_id");
    const id = String(input.id || input.cardId || input.idempotency_key || `${input.card_type || "card"}-${Date.now()}`).trim();
    if (!id) throw new Error("missing_card_id");
    const now = new Date().toISOString();
    const existingIndex = store.cards.findIndex((card) => String(card.sessionId) === String(sessionId) && String(card.id) === id);
    const existing = existingIndex >= 0 ? store.cards[existingIndex] : null;
    const next = normalizeCard({
      ...existing,
      ...input,
      id,
      sessionId,
      session_id: sessionId,
      created_at: existing?.created_at || now,
      updated_at: now
    });
    if (existingIndex >= 0) store.cards[existingIndex] = next;
    else store.cards.push(next);
    return { created: existingIndex < 0, value: next };
  }

  function bulkUpsertCards(sessionId, cards = [], source = "local-harness") {
    let created = 0;
    let updated = 0;
    const results = cards.map((card) => {
      const result = upsertCard(sessionId, { source, ...card });
      if (result.created) created += 1;
      else updated += 1;
      return result.value;
    });
    return { created, updated, cards: results };
  }

  function processCardAction(sessionId, cardId, verb, payload = {}) {
    const index = store.cards.findIndex((card) => String(card.sessionId) === String(sessionId) && String(card.id) === cardId);
    if (index < 0) {
      return { ok: false, success: false, error: "card_not_found", cardId, action: verb };
    }
    const card = store.cards[index];
    const next = { ...card, updated_at: new Date().toISOString() };
    const action = verb || "keep";
    if (action === "keep") {
      next.status = "kept";
      next.spatial_state = { ...parseJsonish(next.spatial_state), space: "orbit" };
    } else if (action === "dismiss") {
      next.status = "dismissed";
      next.spatial_state = { ...parseJsonish(next.spatial_state), space: "dismissed" };
    } else if (action === "archive") {
      next.status = "archived";
      next.spatial_state = { ...parseJsonish(next.spatial_state), space: "archived" };
    } else if (action === "recall") {
      next.status = "focused";
      next.spatial_state = { ...parseJsonish(next.spatial_state), space: "foreground" };
    } else if (action === "approve") {
      next.status = "approved";
      next.card_data = { ...parseJsonish(next.card_data), approval_state: "approved", approval_payload: payload };
    } else {
      next.card_data = { ...parseJsonish(next.card_data), last_action: action, action_payload: payload };
    }
    store.cards[index] = normalizeCard(next);
    return {
      action,
      cardId,
      newStatus: store.cards[index].status,
      newBucket: bucketForCard(store.cards[index]),
      spatial_state: store.cards[index].spatial_state,
      card: store.cards[index]
    };
  }

  function cardsForSession(sessionId) {
    return store.cards
      .filter((card) => String(card.sessionId) === String(sessionId))
      .map(normalizeCard)
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.id).localeCompare(String(b.id)));
  }
}

function emptyStore() {
  return { cards: [], runtimeStatus: {}, agentDesks: {} };
}

function normalizeStore(value) {
  return {
    cards: Array.isArray(value?.cards) ? value.cards.map(normalizeCard) : [],
    runtimeStatus: value?.runtimeStatus && typeof value.runtimeStatus === "object" ? value.runtimeStatus : {},
    agentDesks: value?.agentDesks && typeof value.agentDesks === "object" ? value.agentDesks : {}
  };
}

function normalizeCard(card = {}) {
  const cardData = parseJsonish(card.card_data || card.cardData || card.data);
  const spatialState = parseJsonish(card.spatial_state || card.spatialState);
  const cardType = String(card.card_type || card.type || "work_object");
  const status = String(card.status || "focused");
  const bucket = bucketForStatusAndSpace(status, spatialState.space || card.bucket);
  return {
    ...card,
    id: String(card.id || card.cardId || card.idempotency_key || `${cardType}-${Date.now()}`),
    sessionId: String(card.sessionId || card.session_id || ""),
    session_id: String(card.session_id || card.sessionId || ""),
    card_type: cardType,
    type: String(card.type || cardType),
    title: String(card.title || cardData.title || cardType.replace(/_/g, " ")),
    status,
    bucket,
    card_data: cardData,
    spatial_state: spatialState,
    priority: Number.isFinite(Number(card.priority)) ? Number(card.priority) : 0
  };
}

function getSessionId({ query = {}, body = {} }) {
  return String(query.sessionId || query.session_id || body.sessionId || body.session_id || "local-session").trim();
}

function parseJsonish(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function bucketCards(cards = []) {
  return cards.reduce((buckets, card) => {
    buckets[bucketForCard(card)].push(card);
    return buckets;
  }, { foreground: [], orbit: [], dismissed: [], archived: [] });
}

function bucketForCard(card = {}) {
  return bucketForStatusAndSpace(card.status, parseJsonish(card.spatial_state).space || card.bucket);
}

function bucketForStatusAndSpace(status = "", space = "") {
  const normalizedStatus = String(status || "").toLowerCase();
  const normalizedSpace = String(space || "").toLowerCase();
  if (normalizedStatus === "archived" || normalizedSpace === "archived") return "archived";
  if (normalizedStatus === "dismissed" || normalizedSpace === "dismissed") return "dismissed";
  if (normalizedStatus === "kept" || normalizedSpace === "orbit") return "orbit";
  return "foreground";
}

function countsForBuckets(buckets) {
  const foreground = buckets.foreground.length;
  const orbit = buckets.orbit.length;
  const dismissed = buckets.dismissed.length;
  const archived = buckets.archived.length;
  return {
    foreground,
    orbit,
    dismissed,
    archived,
    active: foreground + orbit,
    visible: foreground + orbit,
    total: foreground + orbit + dismissed + archived
  };
}

function response(status, body) {
  return { status, body };
}

function slug(value = "") {
  return String(value || "card").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";
}

function starterCards(body = {}) {
  const businessType = String(body.businessType || body.business_type || "business");
  const market = String(body.market || "local market");
  const goal = String(body.goal || "Create the first workspace objects.");
  const prefix = `${slug(businessType)}-${slug(market)}`;
  return [
    {
      id: `${prefix}-site-preview`,
      title: `Lead site for ${market}`,
      card_type: "site_preview",
      status: "focused",
      priority: 100,
      card_data: {
        title: `Lead site for ${market}`,
        body: goal,
        next_action: "Review preview"
      },
      spatial_state: { space: "foreground", cluster: "growth" }
    },
    {
      id: `${prefix}-tracker`,
      title: `${businessType} lead tracker`,
      card_type: "client_tracker",
      status: "kept",
      priority: 80,
      card_data: {
        title: `${businessType} lead tracker`,
        body: "Starter object for customers, leads, jobs, and follow-up."
      },
      spatial_state: { space: "orbit", cluster: "operations" }
    },
    {
      id: `${prefix}-approval`,
      title: "Approval gate",
      card_type: "approval",
      status: "focused",
      priority: 70,
      card_data: {
        title: "Approval gate",
        body: "External sends, publishes, charges, and domain changes wait here.",
        approval_state: "pending"
      },
      spatial_state: { space: "foreground", cluster: "approvals" }
    }
  ];
}
