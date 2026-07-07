# Seasonist — wear your season

Personal color analysis from a single daylight photo. Fully client-side: the photo never leaves the user's device. (Repo and live URL still carry the working name "hue".)

## User journey

1. **Consent** — clear, honest privacy screen (no photo storage, no upload, no training)
2. **Capture** — live selfie camera in a liquid-shaped frame, or gallery upload fallback
3. **Analysis** — MediaPipe Face Landmarker (WASM, on-device) samples skin, iris, and hair colors; a rule-based classifier maps them to one of the 12 seasons
4. **Result** — season name, description, 5 signature swatches, and the measured traits (undertone / depth / clarity). The app's ambient liquid background re-tints itself with the user's own palette.
5. **Compare** — the user's own photo rendered with a fabric "drape" under the chin in alternating matching and mismatching shades, with a one-line verdict for each

## Run locally

No build step. Any static server works:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open `http://localhost:8000`. **HTTPS (or localhost) is required** for camera access — for phone testing, use `npx serve` + a tunnel (e.g. `ngrok`) or deploy to any static host (Netlify / Vercel / GitHub Pages).

## Deploy

Live at **https://apporigindev.github.io/hue/** — every push to `main` redeploys automatically via GitHub Actions (`.github/workflows/pages.yml`). No build step: the workflow stamps the commit SHA into `sw.js` (so returning visitors' service worker picks up every deploy) and uploads the repo root to GitHub Pages as-is.

One-time setup on a fresh repo: **Settings → Pages → Build and deployment → Source: "GitHub Actions"** — the workflow's default token cannot enable Pages by itself, so the first run fails until this is set.

> The MediaPipe model (~3 MB) loads from CDN on first run, then is cached by the browser. Everything else is static.

## Architecture

```
index.html          all five screens in one document, module entry
css/styles.css      design tokens + all component styles
js/app.js           screen flow controller, camera lifecycle, state
js/analysis.js      MediaPipe landmarks → skin/eye/hair color samples → Lab
js/classify.js      rule-based 12-season decision tree (warmth/depth/chroma)
js/palettes.js      the 12 seasons: copy, swatches, compare shades
js/compare.js       canvas renderer: photo + colored drape + ambient tint
```

## Design system

- **Palette**: warm stone (`#ECE7E1`) + ink (`#1B1814`); seasonal swatches carry all the color
- **Type**: Cormorant Garamond (italic serif, brand voice + editorial moments) / Manrope (body) / JetBrains Mono (system labels)
- **Brand**: the Season Drape mark — one silk S-stroke in the pastel "veil" gradient (peach `#E29B7B` → butter `#E5C185` → sage `#B9C6AC` → mist `#9DAEC4`); slogan “Wear your season.”
- **Signature**: slow-morphing liquid blobs, ambient at low opacity, re-tinted with the user's own palette after analysis
- Respects `prefers-reduced-motion`; keyboard focus visible throughout

## ⚠️ Before launch: classifier tuning

The thresholds in `js/classify.js` are **sensible starting points, not validated truths**. Personal color analysis has no single scientific standard, and skin-tone measurement from consumer photos is sensitive to lighting and white balance. Before calling this production-ready:

1. Assemble a diverse test set — varied skin tones (full Monk/Fitzpatrick range), lighting conditions, and cameras
2. Compare classifier output against a professional colorist's assessment for the same people
3. Tune `warmth`, `depth`, and `brightness` thresholds until agreement is acceptable **across all skin tones, not just on average** — biased results for darker skin tones is the classic failure mode of this product category
4. Consider adding a white-balance normalization step (e.g. grey-world assumption or a reference-card flow) if results vary too much between devices

## Roadmap

- [ ] Classifier tuning against real test set (see above)
- [ ] White-balance normalization
- [x] PWA manifest + offline caching of the MediaPipe model (`manifest.webmanifest`, `sw.js`, `icons/`)
- [ ] Shareable result card (rendered image download)
- [ ] Realistic garment recoloring on the photo (v2 — generative)
