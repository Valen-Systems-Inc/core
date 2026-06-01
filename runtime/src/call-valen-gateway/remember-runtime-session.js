export function normalizeValenRuntimeSessionId(value) {
  return String(value || "").trim();
}

export function readValenRuntimeQuerySessionId() {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeValenRuntimeSessionId(
      params.get("sessionId") || params.get("valenSessionId") || params.get("valen_session_id") || ""
    );
  } catch {
    return "";
  }
}

export function readValenStoredRuntimeSessionId(key) {
  try {
    return normalizeValenRuntimeSessionId(window.localStorage?.getItem(key) || "");
  } catch {
    return "";
  }
}

export function isNumericValenRuntimeSessionId(value) {
  return /^\d+$/.test(normalizeValenRuntimeSessionId(value));
}

export function createValenRuntimeSessionId() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function persistValenRuntimeSessionId(sessionId) {
  const next = normalizeValenRuntimeSessionId(sessionId);
  if (!next) return "";
  try {
    window.localStorage?.setItem("valen:agent-chat-session", next);
    window.localStorage?.setItem("valen_session_id", next);
  } catch {}
  window.sessionId = next;
  window.__SESSION_ID__ = next;
  return next;
}

export function getValenChatSessionId() {
  const explicit = readValenRuntimeQuerySessionId()
    || normalizeValenRuntimeSessionId(window.sessionId)
    || normalizeValenRuntimeSessionId(window.__SESSION_ID__);
  if (explicit) return persistValenRuntimeSessionId(explicit);

  const stored = readValenStoredRuntimeSessionId("valen_session_id")
    || readValenStoredRuntimeSessionId("valen:agent-chat-session");
  if (isNumericValenRuntimeSessionId(stored)) return persistValenRuntimeSessionId(stored);

  return persistValenRuntimeSessionId(createValenRuntimeSessionId());
}
