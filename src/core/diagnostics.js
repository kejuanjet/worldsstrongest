const DIAGNOSTIC_HISTORY_KEY = "ws_diagnostic_history";
const DIAGNOSTIC_HISTORY_LIMIT = 75;

function toErrorMessage(error) {
  if (!error) return "Unknown error.";
  if (error instanceof Error) return error.message || "Unknown error.";
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toErrorStack(error) {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }

  return "No stack trace available.";
}

function classifyIssue(action, message) {
  const haystack = `${action} ${message}`.toLowerCase();

  if (haystack.includes("fetch") || haystack.includes("network") || haystack.includes("connect") || haystack.includes("host")) {
    return "NETWORK";
  }

  if (haystack.includes("asset") || haystack.includes("gltf") || haystack.includes("glb") || haystack.includes("texture") || haystack.includes("audio")) {
    return "ASSET_LOAD";
  }

  if (haystack.includes("save") || haystack.includes("storage") || haystack.includes("profile")) {
    return "SAVE_OR_PROFILE";
  }

  if (haystack.includes("webgl") || haystack.includes("render") || haystack.includes("canvas")) {
    return "RENDER_INIT";
  }

  return "GENERAL";
}

function shortIssuePrefix(issueType) {
  switch (issueType) {
    case "NETWORK":
      return "NET";
    case "ASSET_LOAD":
      return "ASSET";
    case "SAVE_OR_PROFILE":
      return "SAVE";
    case "RENDER_INIT":
      return "RENDER";
    default:
      return "GEN";
  }
}

function makeStableErrorId(action, issueType, message) {
  const input = `${action}|${issueType}|${(message || "").trim().toLowerCase()}`;
  let hash = 0;

  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }

  const positiveHash = (hash >>> 0).toString(16).padStart(8, "0").toUpperCase();
  return `WS-${shortIssuePrefix(issueType)}-${positiveHash.slice(0, 6)}`;
}

function friendlyMessageForType(type) {
  switch (type) {
    case "NETWORK":
      return "Could not connect right now. Check internet and host address, then try again.";
    case "ASSET_LOAD":
      return "Some game files did not load correctly. Retry the action, and if needed restart the game.";
    case "SAVE_OR_PROFILE":
      return "Your saved profile data could not be read correctly. You can continue, but some progress may not load.";
    case "RENDER_INIT":
      return "Graphics setup failed. Close heavy apps, then restart and try again.";
    default:
      return "Something went wrong. Use Copy Report and paste it into IDE chat for a faster fix.";
  }
}

function suggestionListForType(type) {
  switch (type) {
    case "NETWORK":
      return [
        "Check internet connection.",
        "Confirm host/IP is correct.",
        "Retry in 10 seconds.",
      ];
    case "ASSET_LOAD":
      return [
        "Retry the same action once.",
        "Restart the game if it repeats.",
        "Use Copy Report and send it to IDE chat.",
      ];
    case "SAVE_OR_PROFILE":
      return [
        "Try Continue again.",
        "If repeatable, start Solo and then report.",
        "Use Copy Report to include storage details.",
      ];
    case "RENDER_INIT":
      return [
        "Close other GPU-heavy apps.",
        "Restart the game window.",
        "Use Copy Report to share device details.",
      ];
    default:
      return [
        "Retry once.",
        "If it repeats, copy and share the report.",
        "Include what button you clicked right before the error.",
      ];
  }
}

function getHistory() {
  try {
    const raw = localStorage.getItem(DIAGNOSTIC_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setHistory(entries) {
  try {
    const bounded = entries.slice(-DIAGNOSTIC_HISTORY_LIMIT);
    localStorage.setItem(DIAGNOSTIC_HISTORY_KEY, JSON.stringify(bounded));
  } catch {
    // Ignore storage quota and privacy mode failures.
  }
}

export function appendDiagnosticHistory(entry) {
  const history = getHistory();
  history.push(entry);
  setHistory(history);
}

export function getRecentDiagnosticHistory(count = 8) {
  const history = getHistory();
  return history.slice(-Math.max(1, count));
}

export function buildDiagnosticReport({ action, error, context = {} }) {
  const message = toErrorMessage(error);
  const issueType = classifyIssue(action, message);
  const now = new Date();
  const errorId = makeStableErrorId(action, issueType, message);

  const report = {
    id: `diag-${now.getTime()}`,
    errorId,
    timestampIso: now.toISOString(),
    issueType,
    action,
    friendlyMessage: friendlyMessageForType(issueType),
    suggestions: suggestionListForType(issueType),
    technicalMessage: message,
    technicalStack: toErrorStack(error),
    context: {
      mode: context.mode || "UNKNOWN",
      characterId: context.characterId || "UNKNOWN",
      zoneId: context.zoneId || "UNKNOWN",
      hostAddress: context.hostAddress || "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown",
      recentEvents: getRecentDiagnosticHistory(6),
    },
  };

  appendDiagnosticHistory({
    ts: report.timestampIso,
    level: "error",
    action,
    issueType,
    message,
  });

  return report;
}

export function formatDiagnosticForClipboard(report) {
  const suggestions = report.suggestions.map((item, idx) => `${idx + 1}. ${item}`).join("\n");
  const recent = report.context.recentEvents
    .map((event) => `- ${event.ts} | ${event.issueType} | ${event.action} | ${event.message}`)
    .join("\n");

  return [
    "Worlds Strongest Diagnostic Report",
    `Time: ${report.timestampIso}`,
    `Error ID: ${report.errorId}`,
    `Report ID: ${report.id}`,
    `Issue Type: ${report.issueType}`,
    `Action: ${report.action}`,
    "",
    "What happened (plain language)",
    report.friendlyMessage,
    "",
    "What to try next",
    suggestions,
    "",
    "Context",
    `Mode: ${report.context.mode}`,
    `Character: ${report.context.characterId}`,
    `Zone: ${report.context.zoneId}`,
    `Host: ${report.context.hostAddress || "N/A"}`,
    `Viewport: ${report.context.viewport}`,
    "",
    "Recent Errors",
    recent || "- none",
    "",
    "Technical Details",
    `Message: ${report.technicalMessage}`,
    report.technicalStack,
  ].join("\n");
}

export async function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  textarea.remove();
  return copied;
}
