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
