/**
 * app.js
 * Screen flow controller: consent → capture → analyzing → result → compare.
 * All state lives in memory only; nothing is persisted (see PRIVACY.md).
 */

import { initLandmarker, analyzeImage } from "./analysis.js";
import { classify } from "./classify.js";
import { SEASONS } from "./palettes.js";
import { renderCompare } from "./compare.js";

const $ = (id) => document.getElementById(id);

const state = {
  photo: null,      // HTMLImageElement of the captured/uploaded photo
  faceBox: null,    // normalized face bounding box
  season: null,     // classified season data
  metrics: null,    // classification metrics
  stream: null,     // active camera MediaStream
};

/* ---------------- screen navigation ---------------- */

function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(screenId).classList.add("active");
}

/* ---------------- consent ---------------- */

$("btn-consent").addEventListener("click", async () => {
  show("screen-capture");
  startCamera(); // fire and forget; upload remains the fallback
  initLandmarker().catch(() => {}); // warm up the model in the background
});

$("btn-decline").addEventListener("click", () => {
  // Respect the choice: stay on consent, no nagging.
  $("btn-decline").textContent = "No problem — come back any time.";
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
    $("face-ring").classList.add("live");
  } catch {
    // Camera denied or unavailable — the gallery upload path still works.
    $("ring-hint").textContent = "camera unavailable — upload below";
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
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
  // Un-mirror: draw the raw (non-flipped) frame for analysis fidelity
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
  img.src = URL.createObjectURL(file);
});

/* ---------------- analysis ---------------- */

async function runAnalysis(img) {
  state.photo = img;
  show("screen-analyzing");
  const statusEl = $("analyzing-status");
  const steps = ["Reading your coloring…", "Measuring undertone…", "Finding your season…"];
  let i = 0;
  const ticker = setInterval(() => {
    statusEl.textContent = steps[Math.min(++i, steps.length - 1)];
  }, 900);

  try {
    const samples = await analyzeImage(img, $("work-canvas"));
    const { key, metrics } = classify(samples);
    state.faceBox = samples.faceBox;
    state.season = SEASONS[key];
    state.metrics = metrics;
    clearInterval(ticker);
    renderResult();
    show("screen-result");
  } catch (err) {
    clearInterval(ticker);
    if (err.message === "no-face") {
      $("error-title").textContent = "We couldn't find a face";
      $("error-text").textContent =
        "Make sure your face fills the frame and is clearly visible, then try again.";
    } else if (err.message === "low-light") {
      $("error-title").textContent = "The photo is too dark";
      $("error-text").textContent =
        "Move closer to a window or brighter daylight and try again — good light is everything here.";
    } else {
      $("error-title").textContent = "Something went wrong";
      $("error-text").textContent =
        "The analysis couldn't finish. Check your connection (the face model loads once from the web) and try again.";
    }
    show("screen-error");
  }
}

/* ---------------- result ---------------- */

function renderResult() {
  const s = state.season;
  $("season-name").textContent = s.name;
  $("season-desc").textContent = s.desc;

  $("swatch-row").innerHTML = s.swatches
    .map((sw) => `<div class="swatch" style="background:${sw.hex}"></div>`)
    .join("");
  $("swatch-labels").innerHTML = s.swatches
    .map((sw) => `<span>${sw.label}</span>`)
    .join("");

  const m = state.metrics;
  $("traits").innerHTML = `
    <div class="trait"><b>Undertone</b><span>${m.undertone}</span></div>
    <div class="trait"><b>Depth</b><span>${m.value}</span></div>
    <div class="trait"><b>Clarity</b><span>${m.chroma}</span></div>
  `;

  // Retint the ambient blobs with the user's own palette — the app
  // itself dresses in their colors from this point on.
  const [c1, c2, c3, c4] = s.swatches.map((sw) => sw.hex);
  document.querySelector(".blob.b1").style.background =
    `conic-gradient(from 120deg, ${c1}, ${c2} 30%, ${c3} 60%, ${c4} 85%, ${c1})`;
}

/* ---------------- compare ---------------- */

$("btn-to-compare").addEventListener("click", () => {
  const toggle = $("compare-toggle");
  toggle.innerHTML = "";
  state.season.compare.forEach((c, idx) => {
    const dot = document.createElement("button");
    dot.className = "swatch-dot" + (idx === 0 ? " active" : "");
    dot.style.background = c.hex;
    dot.setAttribute("role", "radio");
    dot.setAttribute("aria-checked", idx === 0 ? "true" : "false");
    dot.setAttribute("aria-label", c.note);
    dot.addEventListener("click", () => selectShade(idx));
    toggle.appendChild(dot);
  });
  selectShade(0);
  show("screen-compare");
});

function selectShade(idx) {
  const c = state.season.compare[idx];
  document.querySelectorAll(".swatch-dot").forEach((d, i) => {
    d.classList.toggle("active", i === idx);
    d.setAttribute("aria-checked", i === idx ? "true" : "false");
  });
  renderCompare($("compare-canvas"), state.photo, state.faceBox, c.hex);
  const firstWord = c.note.split(" ")[0];
  $("verdict").innerHTML = `<b>${firstWord}</b>${c.note.slice(firstWord.length)}`;
}

/* ---------------- retake / restart ---------------- */

function resetToCapture() {
  state.photo = null;
  state.faceBox = null;
  show("screen-capture");
  startCamera();
}

$("btn-retake").addEventListener("click", resetToCapture);
$("btn-error-retry").addEventListener("click", resetToCapture);
$("btn-start-over").addEventListener("click", () => {
  state.photo = null;
  state.faceBox = null;
  state.season = null;
  show("screen-consent");
});

/* ---------------- PWA ---------------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline support is progressive enhancement — the app works without it.
    });
  });
}
