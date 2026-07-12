/**
 * savedAnalyses.js — unlocked analyses the user has paid for, kept on-device.
 *
 * A one-time purchase per analysis: once unlocked, the result is saved locally
 * so the user keeps what they paid for. Stores only the season result (no
 * photo, no personal data) in localStorage — the user's own device, their data.
 */

const KEY = "seasonist:analyses";

export function listAnalyses() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function getAnalysis(id) {
  return listAnalyses().find((a) => a.id === id) || null;
}

export function saveAnalysis(rec) {
  try {
    const all = listAnalyses();
    all.unshift(rec);
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}

export function newId() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return "a-" + Math.random().toString(36).slice(2) + "-" + Date.now();
}

/* -------- re-run grace: refine your OWN analysis without paying again --------
 * A single unlock also grants free re-runs for a short window, so a different/
 * better photo of yourself (lighting shifts the read) doesn't feel like paying
 * twice. Bounded by time AND count so it doesn't become unlimited free analyses.
 * On-device only; nothing personal. */
const GRACE_KEY = "seasonist:unlock-grace";
const GRACE_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours
const GRACE_MAX_RERUNS = 5;

export function startUnlockGrace() {
  try {
    localStorage.setItem(GRACE_KEY, JSON.stringify({ at: Date.now(), reruns: 0 }));
  } catch {
    /* private mode — re-run grace just won't persist */
  }
}

function readGrace() {
  try {
    const g = JSON.parse(localStorage.getItem(GRACE_KEY) || "null");
    return g && typeof g.at === "number" ? g : null;
  } catch {
    return null;
  }
}

/** Is a paid re-run still available (within the window and under the cap)? */
export function unlockGraceActive() {
  const g = readGrace();
  if (!g) return false;
  return Date.now() - g.at < GRACE_WINDOW_MS && (g.reruns || 0) < GRACE_MAX_RERUNS;
}

export function consumeUnlockRerun() {
  const g = readGrace();
  if (!g) return;
  g.reruns = (g.reruns || 0) + 1;
  try {
    localStorage.setItem(GRACE_KEY, JSON.stringify(g));
  } catch {
    /* ignore */
  }
}
