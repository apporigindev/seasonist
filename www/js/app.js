/**
 * app.js
 * Screen flow controller: consent → capture → analyzing → result → compare,
 * plus an info screen for Privacy / Terms / About.
 * All state lives in memory only; nothing personal is persisted (see PRIVACY.md).
 * A non-personal language preference is kept in localStorage (see i18n.js).
 */

import { initLandmarker, analyzeImage } from "./analysis.js";
import { classify } from "./classify.js";
import { localizeSeason } from "./palettes.js";
import { localizeDetails } from "./seasonDetails.js";
import { renderCompare } from "./compare.js";
import { LEGAL } from "./legalContent.js";
import { t, getLang, initI18n, applyStatic, onLangChange } from "./i18n.js";
import { initPurchases, getUnlockPrice, buyUnlock, getTryonPrice, buyTryon } from "./purchase.js";
import { listAnalyses, saveAnalysis, getAnalysis, newId } from "./savedAnalyses.js";
import { tryonAvailable as checkTryonAvailable, generateTryon } from "./tryonApi.js";

const $ = (id) => document.getElementById(id);

const state = {
  photo: null,       // HTMLImageElement of the captured/uploaded photo
  faceBox: null,     // normalized face bounding box
  seasonKey: null,   // key into SEASONS; localized to the active language at render
  metrics: null,     // classification metrics (keys, translated for display)
  stream: null,      // active camera MediaStream
  goodIdx: 0,        // selected flattering shade (left compare panel)
  badIdx: 0,         // selected clashing shade (right compare panel)
  errorKind: null,   // 'noFace' | 'lowLight' | 'generic' — for re-translation
  infoDoc: null,     // 'privacy' | 'terms' | 'about' — for re-translation
  infoReturn: "screen-consent",
  unlocked: false,   // has the current analysis been paid for?
  tryonAvailable: false, // is the paid "See it for real" tier live (backend up)?
  tryonImages: null, // generated try-on results for the current session
  tryonProof: null,  // { transactionId?, signedTransaction? } from the pack purchase
};

let unlockPrice = "€4.99"; // localized store price, resolved on init

/* ---------------- screen navigation ---------------- */

function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const el = $(screenId);
  el.classList.add("active");
  moveFocusTo(el);
}

// Move focus into the newly shown screen so screen-reader + keyboard users
// follow the change (otherwise focus is stranded on the now-hidden screen).
function moveFocusTo(screenEl) {
  const target = screenEl.querySelector("h1, .title") || screenEl;
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  requestAnimationFrame(() => {
    try {
      target.focus({ preventScroll: true });
    } catch {
      /* focus is best-effort */
    }
  });
}

function activeScreenId() {
  const el = [...document.querySelectorAll(".screen")].find((s) => s.classList.contains("active"));
  return el ? el.id : "screen-consent";
}

const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/* ---------------- consent ---------------- */

$("btn-consent").addEventListener("click", async () => {
  show("screen-capture");
  startCamera(); // fire and forget; upload remains the fallback
  initLandmarker().catch(() => {}); // warm up the model in the background
});

$("btn-decline").addEventListener("click", () => {
  // Respect the choice: stay on consent, no nagging.
  $("btn-decline").textContent = t("consent.declined");
});

/* ---------------- capture ---------------- */

async function startCamera() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 } },
      audio: false,
    });
    const video = $("camera-feed");
    video.srcObject = state.stream;
    // Reveal the video only once it actually has a frame + real dimensions —
    // otherwise it flashes at its intrinsic size before object-fit/positioning
    // settle (the "small rectangle, then snaps into the frame" glitch).
    const reveal = () => $("face-ring").classList.add("live");
    if (video.readyState >= 2) reveal();
    else video.addEventListener("loadeddata", reveal, { once: true });
  } catch {
    // Camera denied or unavailable — the gallery upload path still works.
    $("ring-hint").textContent = t("capture.cameraUnavailable");
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((tr) => tr.stop());
    state.stream = null;
    $("face-ring").classList.remove("live");
  }
}

$("btn-capture").addEventListener("click", () => {
  const video = $("camera-feed");
  if (!state.stream || video.videoWidth === 0) {
    $("file-input").click(); // no live feed → fall through to upload
    return;
  }
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0);
  const img = new Image();
  img.onload = () => { stopCamera(); runAnalysis(img); };
  img.src = c.toDataURL("image/jpeg", 0.95);
});

$("file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(img.src);
    stopCamera();
    runAnalysis(img);
  };
  img.onerror = () => {
    // Corrupt/unreadable file — fail gracefully instead of hanging.
    URL.revokeObjectURL(img.src);
    state.errorKind = "generic";
    applyError();
    show("screen-error");
  };
  img.src = URL.createObjectURL(file);
  e.target.value = ""; // allow re-selecting the same file
});

// The "Upload from gallery" control is a <label> for the hidden file input.
// A label isn't keyboard-operable by default, so open the picker on Enter/Space.
{
  const uploadLabel = document.querySelector('label[for="file-input"]');
  if (uploadLabel) {
    uploadLabel.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        $("file-input").click();
      }
    });
  }
}

/* ---------------- analysis ---------------- */

// Deterministic-result cache. The same photo MUST always yield the same season
// — a "sporadic" result would destroy user trust. We fingerprint the image
// (a fixed 96×96 downscale, which is a pure function of its pixels) and cache
// the classification, so re-analysing an identical image returns an identical
// result regardless of any floating-point jitter in on-device face detection
// or a face sitting near a classification boundary. In-memory only (per the
// privacy model — nothing is persisted).
const analysisCache = new Map();

function imageFingerprint(img) {
  const size = 96;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  // Two independent FNV-style hashes → a 64-bit key (collisions negligible).
  let h1 = 0x811c9dc5, h2 = 0xc2b2ae35 >>> 0;
  for (let i = 0; i < d.length; i += 4) {
    h1 = Math.imul(h1 ^ d[i], 0x01000193);
    h1 = Math.imul(h1 ^ d[i + 1], 0x01000193);
    h1 = Math.imul(h1 ^ d[i + 2], 0x01000193);
    h2 = Math.imul(h2 ^ d[i], 0x85ebca6b);
    h2 = Math.imul(h2 ^ d[i + 1], 0x85ebca6b);
    h2 = Math.imul(h2 ^ d[i + 2], 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

async function runAnalysis(img) {
  state.photo = img;
  show("screen-analyzing");
  const statusEl = $("analyzing-status");
  const steps = [t("analyzing.step1"), t("analyzing.step2"), t("analyzing.step3")];
  let i = 0;
  statusEl.textContent = steps[0];
  const ticker = setInterval(() => {
    statusEl.textContent = steps[Math.min(++i, steps.length - 1)];
  }, 900);

  try {
    // Same image → same result, always (see analysisCache above).
    const fingerprint = imageFingerprint(img);
    let out = analysisCache.get(fingerprint);
    if (!out) {
      const samples = await analyzeImage(img, $("work-canvas"));
      const { key, metrics } = classify(samples);
      out = { key, metrics, faceBox: samples.faceBox };
      analysisCache.set(fingerprint, out);
    }
    state.faceBox = out.faceBox;
    state.seasonKey = out.key;
    state.metrics = out.metrics;
    // A new analysis starts locked — unless the user already paid for a try-on
    // pack (proof held) and is just retaking for a better AI-photo framing.
    state.unlocked = !!state.tryonProof;
    clearInterval(ticker);
    renderResult();
    show("screen-result");
  } catch (err) {
    clearInterval(ticker);
    state.errorKind =
      err.message === "no-face" ? "noFace"
      : err.message === "low-light" ? "lowLight"
      : err.message === "blurry" ? "blurry"
      : "generic";
    applyError();
    show("screen-error");
  }
}

function applyError() {
  const kind = state.errorKind || "generic";
  $("error-title").textContent = t(`error.${kind}.title`);
  $("error-text").textContent = t(`error.${kind}.text`);
}

/* ---------------- result ---------------- */

function renderResult() {
  const s = localizeSeason(state.seasonKey, getLang());
  if (!s) return;
  $("season-name").textContent = s.name;
  $("season-desc").textContent = s.desc;

  // Free teaser: the first three hero colours (no labels).
  $("hero-swatches").innerHTML = s.swatches
    .slice(0, 3)
    .map((sw) => `<div class="chip" style="background:${sw.hex}"></div>`)
    .join("");

  // Premium palette (revealed only after unlock).
  $("swatch-row").innerHTML = s.swatches
    .map((sw) => `<div class="swatch" style="background:${sw.hex}"></div>`)
    .join("");
  $("swatch-labels").innerHTML = s.swatches
    .map((sw) => `<span>${esc(sw.label)}</span>`)
    .join("");

  const m = state.metrics;
  $("traits").innerHTML = `
    <div class="trait"><b>${t("result.trait.undertone")}</b><span>${t(`metric.undertone.${m.undertone}`)}</span></div>
    <div class="trait"><b>${t("result.trait.depth")}</b><span>${t(`metric.value.${m.value}`)}</span></div>
    <div class="trait"><b>${t("result.trait.clarity")}</b><span>${t(`metric.chroma.${m.chroma}`)}</span></div>
  `;

  renderDetails(getLang());

  $("unlock-price").textContent = unlockPrice;

  // Retint the ambient blobs with the user's own palette.
  const [c1, c2, c3, c4] = s.swatches.map((sw) => sw.hex);
  document.querySelector(".blob.b1").style.background =
    `conic-gradient(from 120deg, ${c1}, ${c2} 30%, ${c3} 60%, ${c4} 85%, ${c1})`;

  applyUnlockState();
}

/** A metallic CSS gradient for a metal name (matches by keyword, any language). */
function metalGradient(name) {
  const n = String(name).toLowerCase();
  const g = (a, b, c, d) => `linear-gradient(135deg, ${a} 0%, ${b} 38%, ${c} 62%, ${d} 100%)`;
  // rose gold first (contains "gold"), then the rest
  if (/rose|роз/.test(n)) return g("#F6D3C6", "#C98A78", "#EBB6A3", "#B76E79");
  if (/copper|мед/.test(n)) return g("#F0C199", "#C87B45", "#E1A170", "#9E5A2E");
  if (/bronze|бронз/.test(n)) return g("#E4C08A", "#A9793F", "#C99C5C", "#7E5A2E");
  if (/pewter|калай|gunmetal|graphite|графит/.test(n)) return g("#D6D6D2", "#8E8E88", "#B8B8B0", "#6E6E68");
  if (/platinum|платин|white gold|бяло злато/.test(n)) return g("#F1F0EE", "#C7C7C4", "#E3E2E0", "#ABABA8");
  if (/silver|сребро/.test(n)) return g("#F3F3F1", "#B6B6B2", "#DCDCDA", "#9C9C98");
  if (/gold|злато/.test(n)) return g("#F6E4A6", "#C9A227", "#EBCF77", "#A8811A");
  return g("#EAE6DE", "#B7AE9E", "#D8D2C6", "#9C9184");
}

/** Populate the premium detail sections (neutrals, metals, avoid, makeup, styling). */
function renderDetails(lang) {
  const d = localizeDetails(state.seasonKey, lang);
  if (!d) return;
  const swatches = (arr) =>
    arr.map((x) => `<div class="swatch" style="background:${x.hex}"></div>`).join("");
  const labels = (arr) => arr.map((x) => `<span>${esc(x.label)}</span>`).join("");

  $("neutral-row").innerHTML = swatches(d.neutrals);
  $("neutral-labels").innerHTML = labels(d.neutrals);
  $("avoid-row").innerHTML = swatches(d.avoid);
  $("avoid-labels").innerHTML = labels(d.avoid);
  $("metals-row").innerHTML = d.metals
    .map(
      (mtl) =>
        `<div class="metal"><span class="metal-swatch" style="background:${metalGradient(mtl)}"></span>` +
        `<span class="metal-label">${esc(mtl)}</span></div>`
    )
    .join("");
  $("makeup-list").innerHTML =
    `<div class="makeup-item"><dt>${esc(t("result.makeup.lips"))}</dt><dd>${esc(d.makeup.lips)}</dd></div>` +
    `<div class="makeup-item"><dt>${esc(t("result.makeup.eyes"))}</dt><dd>${esc(d.makeup.eyes)}</dd></div>` +
    `<div class="makeup-item"><dt>${esc(t("result.makeup.cheeks"))}</dt><dd>${esc(d.makeup.cheeks)}</dd></div>`;
  $("styling-list").innerHTML = d.styling.map((tip) => `<li>${esc(tip)}</li>`).join("");
}

/** Toggle free-teaser vs unlocked-premium visibility on the result screen. */
function applyUnlockState() {
  const on = state.unlocked;
  $("result-premium").hidden = !on;
  $("unlock-panel").hidden = on;
  $("hero-swatches").hidden = on; // teaser hides once the full palette shows
  $("btn-to-compare").hidden = !(on && state.photo);
  $("btn-library").hidden = listAnalyses().length === 0;
  // Higher tier on the paywall + the AI card after unlock: both exist only
  // when the backend tier is live (and the AI needs the live photo).
  $("tier-premium").hidden = !(state.tryonAvailable && state.photo);
  $("tryon-card").hidden = !(on && state.photo && state.tryonAvailable);
  applyTryonCardState();
  if (state.photo) ensureTryonChecked(); // re-probe (no-op once positive)
}

/** The AI card has three states: buy / included-not-generated / view results. */
function applyTryonCardState() {
  const price = $("tryon-price");
  const lead = document.querySelector("#tryon-card .tryon-lead");
  const fine = document.querySelector("#tryon-card .tryon-fine");
  const btn = $("btn-tryon");
  if (state.tryonImages) {
    price.hidden = true;
    lead.textContent = t("tryon.done.lead");
    btn.textContent = t("tryon.view");
    fine.hidden = true;
  } else if (state.tryonProof) {
    price.hidden = true;
    lead.textContent = t("tryon.included.lead");
    btn.textContent = t("tryon.create");
    fine.hidden = false;
  } else {
    price.hidden = false;
    lead.textContent = t("tryon.lead");
    btn.textContent = t("tryon.cta");
    fine.hidden = false;
  }
}

/* ---------------- unlock (pay per analysis) ---------------- */

async function doUnlock() {
  const btn = $("btn-unlock");
  btn.disabled = true;
  try {
    const res = await buyUnlock();
    if (res && res.ok) {
      state.unlocked = true;
      saveAnalysis({
        id: newId(),
        seasonKey: state.seasonKey,
        metrics: state.metrics,
        label: t("library.you"),
        unlockedAt: new Date().toISOString(),
      });
      applyUnlockState();
      showToast(t("unlock.done"));
    } else if (res && res.cancelled) {
      showToast(t("unlock.cancelled"));
    }
  } catch {
    showToast(t("unlock.failed"));
  } finally {
    btn.disabled = false;
  }
}

$("btn-unlock").addEventListener("click", doUnlock);

/**
 * Higher tier: one purchase (the try-on pack) unlocks EVERYTHING — the full
 * analysis plus the AI photos. The purchase proof is kept for generation; the
 * consent modal still gates the actual photo upload (GDPR: consent is separate
 * from payment and asked just-in-time before anything leaves the device).
 */
async function doUnlockPremium() {
  const btn = $("btn-unlock-premium");
  btn.disabled = true;
  try {
    const res = await buyTryon();
    if (res && res.ok) {
      state.tryonProof = {
        transactionId: res.transactionId || null,
        signedTransaction: res.signedTransaction || null,
      };
      state.unlocked = true;
      saveAnalysis({
        id: newId(),
        seasonKey: state.seasonKey,
        metrics: state.metrics,
        label: t("library.you"),
        unlockedAt: new Date().toISOString(),
      });
      applyUnlockState();
      showToast(t("unlock.premium.done"));
    } else if (res && res.cancelled) {
      showToast(t("unlock.cancelled"));
    }
  } catch {
    showToast(t("unlock.failed"));
  } finally {
    btn.disabled = false;
  }
}

$("btn-unlock-premium").addEventListener("click", doUnlockPremium);

/* ---------------- saved analyses library ---------------- */

function renderLibrary() {
  const list = listAnalyses();
  const el = $("saved-list");
  el.replaceChildren();
  if (!list.length) {
    el.innerHTML = `<p class="saved-empty">${esc(t("library.empty"))}</p>`;
    return;
  }
  for (const a of list) {
    const s = localizeSeason(a.seasonKey, getLang());
    if (!s) continue;
    const sw = s.swatches
      .slice(0, 4)
      .map((x) => `<span style="background:${x.hex}"></span>`)
      .join("");
    const dt = new Date(a.unlockedAt);
    const dstr = isNaN(dt.getTime()) ? "" : dt.toLocaleDateString();
    const card = document.createElement("button");
    card.type = "button";
    card.className = "saved-card";
    card.innerHTML =
      `<span class="sw">${sw}</span>` +
      `<span class="info"><span class="nm">${esc(s.name)}</span>` +
      `<span class="dt">${esc(a.label || "")}${dstr ? " · " + esc(dstr) : ""}</span></span>` +
      `<span class="chev" aria-hidden="true">›</span>`;
    card.addEventListener("click", () => openSaved(a.id));
    el.append(card);
  }
}

function openSaved(id) {
  const a = getAnalysis(id);
  if (!a) return;
  state.seasonKey = a.seasonKey;
  state.metrics = a.metrics;
  state.photo = null; // no photo kept → drape comparison unavailable for saved
  state.faceBox = null;
  state.unlocked = true;
  renderResult();
  show("screen-result");
}

$("btn-library").addEventListener("click", () => {
  renderLibrary();
  show("screen-library");
});
$("btn-library-back").addEventListener("click", () => show("screen-consent"));
$("btn-library-new").addEventListener("click", resetToCapture);

/* ---------------- compare (side-by-side) ---------------- */

// Split a season's compare shades into the flattering (match) and clashing
// (non-match) sets that drive the two panels.
function splitCompare(season) {
  const good = [], bad = [];
  season.compare.forEach((c) => (c.match ? good : bad).push(c));
  return { good, bad };
}

function buildToggle(container, shades, activeIdx, onPick) {
  container.innerHTML = "";
  shades.forEach((c, idx) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "swatch-dot" + (idx === activeIdx ? " active" : "");
    dot.style.background = c.hex;
    dot.setAttribute("role", "radio");
    dot.setAttribute("aria-checked", idx === activeIdx ? "true" : "false");
    dot.setAttribute("aria-label", c.note);
    dot.addEventListener("click", () => onPick(idx));
    container.appendChild(dot);
  });
}

function markActive(toggleId, idx) {
  $(toggleId).querySelectorAll(".swatch-dot").forEach((d, i) => {
    d.classList.toggle("active", i === idx);
    d.setAttribute("aria-checked", i === idx ? "true" : "false");
  });
}

function renderGood() {
  const { good } = splitCompare(localizeSeason(state.seasonKey, getLang()));
  const c = good[state.goodIdx] || good[0];
  if (!c) return;
  renderCompare($("compare-canvas-good"), state.photo, state.faceBox, c.hex);
  $("cap-note-good").textContent = c.note;
  markActive("toggle-good", state.goodIdx);
}

function renderBad() {
  const { bad } = splitCompare(localizeSeason(state.seasonKey, getLang()));
  const c = bad[state.badIdx] || bad[0];
  if (!c) return;
  renderCompare($("compare-canvas-bad"), state.photo, state.faceBox, c.hex);
  $("cap-note-bad").textContent = c.note;
  markActive("toggle-bad", state.badIdx);
}

function enterCompare() {
  const season = localizeSeason(state.seasonKey, getLang());
  if (!season) return;
  const { good, bad } = splitCompare(season);
  if (state.goodIdx >= good.length) state.goodIdx = 0;
  if (state.badIdx >= bad.length) state.badIdx = 0;
  buildToggle($("toggle-good"), good, state.goodIdx, (i) => { state.goodIdx = i; renderGood(); });
  buildToggle($("toggle-bad"), bad, state.badIdx, (i) => { state.badIdx = i; renderBad(); });
  renderGood();
  renderBad();
}

$("btn-to-compare").addEventListener("click", () => {
  if (!state.unlocked || !state.photo) return; // premium + needs the live photo
  state.goodIdx = 0;
  state.badIdx = 0;
  enterCompare();
  show("screen-compare");
});

/* ---------------- "See it for real" (generative try-on) ---------------- */

let tryonPrice = "€8.99";
let tryonChecked = false;
let tryonProbeInFlight = false;

// Backend availability probe. The feature stays hidden unless the backend is
// configured AND reports a live, verifiable provider (see tryonApi + config).
// We latch ONLY on a positive result, so a transient failure (cold start, no
// network at launch) doesn't hide the feature for the whole session — a later
// result-screen visit re-probes.
async function ensureTryonChecked() {
  if (tryonChecked || tryonProbeInFlight) return;
  tryonProbeInFlight = true;
  try {
    const ok = await checkTryonAvailable();
    state.tryonAvailable = ok;
    if (ok) tryonChecked = true;
  } catch {
    state.tryonAvailable = false;
  } finally {
    tryonProbeInFlight = false;
  }
  if (activeScreenId() === "screen-result") applyUnlockState();
}

/** A JPEG data URI of the current photo, downscaled to keep the payload small. */
function photoDataUri(maxDim = 1024) {
  const img = state.photo;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  c.getContext("2d").drawImage(img, 0, 0, cw, ch);
  return c.toDataURL("image/jpeg", 0.9);
}

// The AI recolors a garment (top or scarf), so it needs some of the neck /
// shoulders below the chin. A tight face-only close-up leaves nothing to dress.
function tryonFramingOk() {
  const fb = state.faceBox;
  if (!fb) return true;
  const belowChin = 1 - (fb.y + fb.h); // fraction of the image below the face
  return belowChin >= 0.14 && fb.h <= 0.66;
}

function openTryonConsent() {
  $("tryon-consent-overlay").hidden = false;
  $("tryon-consent-agree").focus();
}

$("btn-tryon").addEventListener("click", () => {
  if (!(state.unlocked && state.photo && state.tryonAvailable)) return;
  // Already generated → straight back to the gallery.
  if (state.tryonImages) {
    renderTryonGallery(state.tryonImages);
    setTryonState("gallery");
    show("screen-tryon");
    return;
  }
  // Too tight a close-up → explain and offer a reframe before we generate.
  if (!tryonFramingOk()) {
    $("tryon-frame-overlay").hidden = false;
    $("tryon-frame-retake").focus();
    return;
  }
  openTryonConsent();
});

/* ----- framing guidance (needs the neck/shoulders for a garment) ----- */
function closeTryonFrame() {
  $("tryon-frame-overlay").hidden = true;
}
$("tryon-frame-anyway").addEventListener("click", () => {
  closeTryonFrame();
  openTryonConsent();
});
$("tryon-frame-retake").addEventListener("click", () => {
  closeTryonFrame();
  // Keep the paid pack (tryonProof) — just get a better-framed photo.
  state.photo = null;
  state.faceBox = null;
  state.tryonImages = null;
  show("screen-capture");
  startCamera();
});
$("tryon-frame-overlay").addEventListener("click", (e) => {
  if (e.target === $("tryon-frame-overlay")) closeTryonFrame();
});

function closeTryonConsent() {
  $("tryon-consent-overlay").hidden = true;
}
$("tryon-consent-cancel").addEventListener("click", closeTryonConsent);
$("tryon-consent-overlay").addEventListener("click", (e) => {
  if (e.target === $("tryon-consent-overlay")) closeTryonConsent();
});
$("tryon-consent-privacy").addEventListener("click", (e) => {
  e.preventDefault();
  closeTryonConsent();
  openDoc("privacy");
});
$("tryon-consent-agree").addEventListener("click", onTryonConsentAgree);

// Record the (non-personal) consent decision + policy version for audit.
function recordTryonConsent() {
  try {
    localStorage.setItem(
      "seasonist_tryon_consent",
      JSON.stringify({ acceptedAt: new Date().toISOString(), version: "1" })
    );
  } catch {
    /* non-fatal */
  }
}

async function onTryonConsentAgree() {
  closeTryonConsent();
  recordTryonConsent();
  const btn = $("btn-tryon");
  btn.disabled = true;
  try {
    // Pack already included (higher tier) → no second payment, just generate.
    if (!state.tryonProof) {
      const res = await buyTryon();
      if (!res || !res.ok) {
        if (res && res.cancelled) showToast(t("unlock.cancelled"));
        return;
      }
      state.tryonProof = {
        transactionId: res.transactionId || null,
        signedTransaction: res.signedTransaction || null,
      };
    }
    await runTryon();
  } catch {
    showToast(t("tryon.err.generic"));
  } finally {
    btn.disabled = false;
    applyTryonCardState();
  }
}

// How many palette colours to render (a clean 2×2 grid; fewer = faster).
const TRYON_COLORS = 4;

function setTryonState(name) {
  // 'loading' (skeletons + status) | 'gallery' (real images) | 'error'
  $("tryon-status").hidden = name !== "loading";
  $("tryon-gallery").hidden = name === "error";
  $("tryon-error").hidden = name !== "error";
}

// Generate (or re-generate) the try-on images with the current proof. A failed
// render does NOT consume the purchase server-side, so retry reuses the proof.
async function runTryon() {
  if (!state.photo || !state.tryonProof) return;
  show("screen-tryon");
  const season = localizeSeason(state.seasonKey, getLang());
  const colors = season.swatches.slice(0, TRYON_COLORS).map((sw) => ({ name: sw.label, hex: sw.hex }));
  // Ghost cards immediately — the user sees the shape of the result, not an
  // open-ended spinner, and each Save stays disabled until its image lands.
  renderTryonSkeletons(colors);
  setTryonState("loading");
  try {
    const images = await generateTryon({
      photo: photoDataUri(1024),
      season: season.name,
      colors,
      proof: state.tryonProof,
    });
    if (!images.length) throw new Error("empty");
    state.tryonImages = images;
    renderTryonGallery(images);
    setTryonState("gallery");
  } catch (err) {
    $("tryon-error-text").textContent = tryonErrorText(err);
    setTryonState("error");
  }
}

/** Ghost placeholder cards (one per colour) shown while images generate. */
function renderTryonSkeletons(colors) {
  const el = $("tryon-gallery");
  el.replaceChildren();
  for (const c of colors) {
    const fig = document.createElement("figure");
    fig.className = "tryon-item";
    const ph = document.createElement("div");
    ph.className = "tryon-skeleton";
    ph.setAttribute("aria-hidden", "true");
    const cap = document.createElement("figcaption");
    cap.textContent = c.name;
    const save = document.createElement("button");
    save.type = "button";
    save.className = "tryon-save";
    save.disabled = true; // greyed until this picture exists
    save.textContent = t("tryon.save");
    fig.append(ph, cap, save);
    el.append(fig);
  }
}

function renderTryonGallery(images) {
  const el = $("tryon-gallery");
  el.replaceChildren();
  for (const im of images) {
    const fig = document.createElement("figure");
    fig.className = "tryon-item";
    const img = document.createElement("img");
    img.src = im.dataUrl;
    img.alt = im.colorName;
    img.loading = "lazy";
    const cap = document.createElement("figcaption");
    cap.textContent = im.colorName;
    const save = document.createElement("button");
    save.type = "button";
    save.className = "tryon-save";
    save.textContent = t("tryon.save");
    save.addEventListener("click", () => saveImage(im.dataUrl, im.colorName));
    fig.append(img, cap, save);
    el.append(fig);
  }
}

async function saveImage(dataUrl, name) {
  const filename = `seasonist-${String(name).toLowerCase().replace(/\s+/g, "-")}.jpg`;
  try {
    if (navigator.share && navigator.canShare) {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    }
  } catch {
    /* fall through to download */
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function tryonErrorText(err) {
  const code = err && err.code;
  if (code === "already_used") return t("tryon.err.used");
  if (code === "attempts_exhausted") return t("tryon.err.exhausted");
  if (code === "not_entitled") return t("tryon.err.entitle");
  if (code === "tryon_unavailable") return t("tryon.err.unavailable");
  if (code === "rate_limited") return t("tryon.err.busy");
  if (code === "image_too_large") return t("tryon.err.image");
  return t("tryon.err.generic"); // generation_failed, bad_request, network → retryable
}

$("btn-tryon-retry").addEventListener("click", runTryon);
$("btn-tryon-back").addEventListener("click", () => show("screen-result"));

/** Clear any generated try-on results from memory + the screen. */
function clearTryon() {
  state.tryonImages = null;
  state.tryonProof = null;
  const g = $("tryon-gallery");
  if (g) g.replaceChildren();
}

/* ---------------- info: privacy / terms / about ---------------- */

function renderInfo(title, bodyHtml) {
  $("info-title").textContent = title;
  const body = $("info-body");
  body.innerHTML = bodyHtml;
  body.scrollTop = 0;
}

function openDoc(docKey) {
  const byLang = LEGAL[docKey][getLang()];
  const doc = byLang && byLang.sections && byLang.sections.length ? byLang : LEGAL[docKey].en;
  const html = doc.sections
    .map(
      (s) =>
        (s.heading ? `<h2>${esc(s.heading)}</h2>` : "") +
        `<p>${esc(s.body).replace(/\n+/g, "<br><br>")}</p>`
    )
    .join("");
  if (activeScreenId() !== "screen-info") state.infoReturn = activeScreenId();
  state.infoDoc = docKey;
  renderInfo(doc.title, html);
  show("screen-info");
}

function openAbout() {
  if (activeScreenId() !== "screen-info") state.infoReturn = activeScreenId();
  state.infoDoc = "about";
  const html = `<p>${esc(t("about.body"))}</p><p class="info-muted">${esc(t("about.contact"))}</p>`;
  renderInfo(t("about.title"), html);
  show("screen-info");
}

document.querySelectorAll("[data-doc]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const d = btn.dataset.doc;
    if (d === "about") openAbout();
    else openDoc(d);
  });
});

$("btn-info-back").addEventListener("click", () => show(state.infoReturn));

/* ---------------- retake / restart / delete ---------------- */

function resetToCapture() {
  state.photo = null;
  state.faceBox = null;
  state.unlocked = false;
  clearTryon();
  show("screen-capture");
  startCamera();
}

$("btn-retake").addEventListener("click", resetToCapture);
$("btn-error-retry").addEventListener("click", resetToCapture);
$("btn-start-over").addEventListener("click", () => {
  state.photo = null;
  state.faceBox = null;
  state.seasonKey = null;
  state.unlocked = false;
  clearTryon();
  show("screen-consent");
});

// Nothing is ever persisted (no backend, no storage — see PRIVACY.md), so
// "delete" purges every trace of the analysis from memory and the screen now.
function deleteAnalysis() {
  stopCamera();

  state.photo = null;
  state.faceBox = null;
  state.seasonKey = null;
  state.metrics = null;
  state.unlocked = false;
  clearTryon();

  ["compare-canvas-good", "compare-canvas-bad"].forEach((id) => {
    const canvas = $(id);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.removeAttribute("width");
    canvas.removeAttribute("height");
  });

  $("season-name").textContent = "—";
  $("season-desc").textContent = "";
  $("swatch-row").innerHTML = "";
  $("swatch-labels").innerHTML = "";
  $("traits").innerHTML = "";
  $("toggle-good").innerHTML = "";
  $("toggle-bad").innerHTML = "";
  $("cap-note-good").textContent = "";
  $("cap-note-bad").textContent = "";

  document.querySelector(".blob.b1").style.background = "";

  closeConfirm();
  show("screen-consent");
  showToast(t("toast.deleted"));
}

function openConfirm() {
  $("confirm-overlay").hidden = false;
  $("confirm-delete").focus();
}
function closeConfirm() {
  $("confirm-overlay").hidden = true;
}

$("btn-delete-result").addEventListener("click", openConfirm);
$("btn-delete-compare").addEventListener("click", openConfirm);
$("confirm-cancel").addEventListener("click", closeConfirm);
$("confirm-delete").addEventListener("click", deleteAnalysis);
$("confirm-overlay").addEventListener("click", (e) => {
  if (e.target === $("confirm-overlay")) closeConfirm();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("confirm-overlay").hidden) closeConfirm();
});

let toastTimer;
function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4500);
}

/* ---------------- language ---------------- */

// When the language changes, re-translate static DOM (done by i18n) and
// re-render any dynamic screen currently showing.
onLangChange(() => {
  const screen = activeScreenId();
  if (state.errorKind) applyError();
  if (state.seasonKey && screen === "screen-result") renderResult();
  if (state.seasonKey && screen === "screen-compare") enterCompare();
  if (screen === "screen-tryon" && state.tryonImages) renderTryonGallery(state.tryonImages);
  if (screen === "screen-library") renderLibrary();
  if (screen === "screen-info" && state.infoDoc) {
    state.infoDoc === "about" ? openAbout() : openDoc(state.infoDoc);
  }
});

initI18n();

// Resolve the localized store price for the unlock button (native only;
// falls back to a default in the browser).
initPurchases()
  .then(getUnlockPrice)
  .then((p) => {
    unlockPrice = p;
    const el = $("unlock-price");
    if (el) el.textContent = p;
  })
  .catch(() => {});

// Resolve the try-on pack price and probe whether the tier is live.
getTryonPrice()
  .then((p) => {
    tryonPrice = p;
    for (const id of ["tryon-price", "premium-price"]) {
      const el = $(id);
      if (el) el.textContent = p;
    }
  })
  .catch(() => {});
ensureTryonChecked();

/* ---------------- demo / testing shortcut ---------------- */

// ?demo skips the camera and drops you straight onto a sample locked result,
// so the unlock → payment → detailed-result flow can be tested without taking
// a selfie. (Harmless in production — only fires when the flag is present.
// The on-photo drape comparison still needs a real photo, so upload a selfie
// to see that part.)
if (/[?&]demo\b/i.test(location.search)) {
  state.seasonKey = "trueAutumn";
  state.metrics = { undertone: "warm", value: "deep", chroma: "soft" };
  state.unlocked = false;
  // A synthetic portrait + faceBox so the photo-dependent parts of the flow
  // (drape compare, the AI tier) are testable in the browser demo too.
  {
    const c = document.createElement("canvas");
    c.width = 480; c.height = 600;
    const x = c.getContext("2d");
    x.fillStyle = "#E7DECF"; x.fillRect(0, 0, 480, 600);
    x.fillStyle = "#5E4630";
    x.beginPath(); x.ellipse(240, 200, 150, 175, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#E4B48C";
    x.beginPath(); x.ellipse(240, 215, 118, 150, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#3A2A22";
    x.beginPath(); x.ellipse(200, 200, 12, 8, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(280, 200, 12, 8, 0, 0, Math.PI * 2); x.fill();
    const img = new Image();
    img.onload = () => {
      state.photo = img;
      state.faceBox = { x: 0.255, y: 0.11, w: 0.49, h: 0.5 };
      renderResult();
    };
    img.src = c.toDataURL("image/png");
  }
  renderResult();
  show("screen-result");
}

/* ---------------- PWA ---------------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline support is progressive enhancement — the app works without it.
    });
  });
}
