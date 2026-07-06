/**
 * analysis.js
 * Face landmark detection (MediaPipe Tasks Vision, runs fully client-side)
 * + color sampling from skin / eye / hair regions.
 *
 * Output: { skin, eyes, hair } as {r,g,b} averages, plus derived
 * perceptual metrics used by classify.js.
 */

const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

let landmarkerPromise = null;

/**
 * Lazily initialize the MediaPipe FaceLandmarker (WASM, on-device).
 * The CDN bundle is imported dynamically so that loading it offline fails
 * as a catchable error inside runAnalysis (the "check your connection"
 * screen) instead of killing the whole module graph before any UI binds.
 * The in-flight promise is shared so the warm-up call and the first
 * analysis never initialize twice; a failure clears it so retry works.
 */
export function initLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import(MEDIAPIPE_CDN);
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN + "/wasm");
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFaceBlendshapes: false,
      });
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

/* ----- MediaPipe FaceMesh landmark indices for sample regions ----- */
// Skin patches chosen to avoid shadows, brows, lips, and specular highlights.
const REGIONS = {
  leftCheek: [50, 101, 118, 117, 123],
  rightCheek: [280, 330, 347, 346, 352],
  forehead: [10, 108, 151, 337, 299],
  chin: [200, 199, 175],
  leftIris: [468, 469, 470, 471, 472],
  rightIris: [473, 474, 475, 476, 477],
};

/**
 * Analyze an image element/canvas. Returns raw color samples or throws:
 *  - "no-face"  when no face detected
 *  - "low-light" when image is too dark to trust
 */
export async function analyzeImage(imageSource, workCanvas) {
  const lm = await initLandmarker();
  const result = lm.detect(imageSource);

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    throw new Error("no-face");
  }

  const points = result.faceLandmarks[0];
  const w = imageSource.naturalWidth || imageSource.videoWidth || imageSource.width;
  const h = imageSource.naturalHeight || imageSource.videoHeight || imageSource.height;

  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(imageSource, 0, 0, w, h);

  const sample = (indices, radius) =>
    averageColorAt(
      ctx,
      indices.map((i) => ({ x: points[i].x * w, y: points[i].y * h })),
      radius,
      w,
      h
    );

  const skinPatches = [
    sample(REGIONS.leftCheek, Math.round(w * 0.012)),
    sample(REGIONS.rightCheek, Math.round(w * 0.012)),
    sample(REGIONS.forehead, Math.round(w * 0.012)),
    sample(REGIONS.chin, Math.round(w * 0.01)),
  ];
  const skin = robustAverage(skinPatches);

  const eyes = robustAverage([
    sample(REGIONS.leftIris, Math.round(w * 0.004) || 2),
    sample(REGIONS.rightIris, Math.round(w * 0.004) || 2),
  ]);

  // Hair: sample a band above the forehead landmark, if inside frame.
  const top = points[10];
  const hairY = Math.max(0, top.y * h - h * 0.09);
  const hair = averageColorAt(
    ctx,
    [
      { x: top.x * w, y: hairY },
      { x: top.x * w - w * 0.06, y: hairY + h * 0.01 },
      { x: top.x * w + w * 0.06, y: hairY + h * 0.01 },
    ],
    Math.round(w * 0.015),
    w,
    h
  );

  // Basic quality gate: reject unusably dark photos.
  const skinLuma = 0.2126 * skin.r + 0.7152 * skin.g + 0.0722 * skin.b;
  if (skinLuma < 30) throw new Error("low-light");

  // Face bounding box (normalized) — used by the compare renderer.
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const faceBox = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };

  return { skin, eyes, hair, faceBox };
}

/* ---------------- pixel sampling helpers ---------------- */

function averageColorAt(ctx, centers, radius, maxW, maxH) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const c of centers) {
    const x0 = Math.max(0, Math.round(c.x - radius));
    const y0 = Math.max(0, Math.round(c.y - radius));
    const size = Math.min(radius * 2, maxW - x0, maxH - y0);
    if (size <= 0) continue;
    const data = ctx.getImageData(x0, y0, size, size).data;
    for (let i = 0; i < data.length; i += 4) {
      // Skip near-black and blown-out pixels (shadows / specular highlights)
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luma < 15 || luma > 250) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  if (n === 0) return { r: 0, g: 0, b: 0 };
  return { r: r / n, g: g / n, b: b / n };
}

/** Average a set of patches, discarding the outlier farthest from the mean. */
function robustAverage(patches) {
  const valid = patches.filter((p) => p.r + p.g + p.b > 0);
  if (valid.length === 0) return { r: 0, g: 0, b: 0 };
  if (valid.length <= 2) return meanOf(valid);
  const mean = meanOf(valid);
  const withDist = valid.map((p) => ({
    p,
    d: (p.r - mean.r) ** 2 + (p.g - mean.g) ** 2 + (p.b - mean.b) ** 2,
  }));
  withDist.sort((a, b) => a.d - b.d);
  return meanOf(withDist.slice(0, withDist.length - 1).map((x) => x.p));
}

function meanOf(arr) {
  const s = arr.reduce(
    (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
    { r: 0, g: 0, b: 0 }
  );
  return { r: s.r / arr.length, g: s.g / arr.length, b: s.b / arr.length };
}

/* ---------------- color space conversion ---------------- */

/** sRGB -> CIELAB (D65). Lab separates undertone (a,b) from lightness (L). */
export function rgbToLab({ r, g, b }) {
  let [R, G, B] = [r / 255, g / 255, b / 255].map((v) =>
    v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92
  );
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}
