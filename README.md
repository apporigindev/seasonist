# Seasonist — wear your season

Personal color analysis from a single daylight photo. Fully client-side: the photo never leaves the user's device.

## User journey

1. **Consent** — clear, honest privacy screen (no photo storage, no upload, no training)
2. **Capture** — live selfie camera in a liquid-shaped frame, or gallery upload fallback
3. **Analysis** — MediaPipe Face Landmarker (WASM, on-device) samples skin, iris, and hair colors; a rule-based classifier maps them to one of the 12 seasons
4. **Result** — season name, description, 5 signature swatches, and the measured traits (undertone / depth / clarity). The app's ambient liquid background re-tints itself with the user's own palette.
5. **Compare** — the user's own photo rendered with a fabric "drape" under the chin in alternating matching and mismatching shades, with a one-line verdict for each

## Run locally

No build step. The web app lives in `www/` — serve that folder:

```bash
npx serve www
# or
cd www && python3 -m http.server 8000
```

Then open `http://localhost:8000`. **HTTPS (or localhost) is required** for camera access — for phone testing, use `npx serve` + a tunnel (e.g. `ngrok`) or deploy to any static host (Netlify / Vercel / GitHub Pages).

## Deploy

**No public web app** — Seasonist ships as a native mobile app only. GitHub
Pages hosts just a **landing + legal site** (`site/`) at
**https://apporigindev.github.io/seasonist/** (also the App Store privacy/
support URL target). Every push to `main` redeploys it via GitHub Actions
(`.github/workflows/pages.yml`, no build step). The app itself lives in `www/`
and is bundled into the native binary — it is **not** deployed as a web
product (a free working web version would undercut the paid app).

One-time setup on a fresh repo: **Settings → Pages → Build and deployment → Source: "GitHub Actions"** — the workflow's default token cannot enable Pages by itself, so the first run fails until this is set.

> The MediaPipe model (~3 MB) loads from CDN on first run, then is cached by the browser. Everything else is static.

## Architecture

```
www/                 the web app (deployed to GitHub Pages as-is)
  index.html         all screens in one document, module entry
  css/styles.css     design tokens + all component styles
  js/app.js          screen flow controller, camera lifecycle, i18n wiring
  js/analysis.js     MediaPipe landmarks → skin/eye/hair color samples → Lab
  js/classify.js     rule-based 12-season decision tree (returns metric keys)
  js/palettes.js     the 12 seasons (hex + match); localizeSeason(key, lang)
  js/compare.js      canvas renderer: photo + colored drape + ambient tint
  js/i18n.js         language detect / persist / apply; STRINGS lookup
  js/strings.js      EN UI strings (+ strings.bg.js = BG, generated)
  js/seasons.bg.js   Bulgarian season text (generated)
  js/legalContent.js Privacy Policy + Terms, EN + BG (generated)
site/                public landing + legal site (deployed to GitHub Pages)
  index.html         bilingual marketing landing (App Store CTA)
  privacy.html       privacy policy page (EN + BG)
  terms.html         terms of use page (EN + BG)
  og-image.png       social-share image
ios/                 Capacitor 8 iOS wrapper (SPM, no CocoaPods)
assets/brand/        Season Drape master SVG
docs/                TestFlight setup + App Store submission guides
```

## Languages

The app is bilingual (English / Bulgarian). Language is chosen automatically:
the device's **primary** language decides the default — Bulgarian if the device
is set to Bulgarian, English otherwise — and a persistent БГ/EN toggle lets the
user override it (the choice is kept in `localStorage`, a non-personal setting).
EN strings in `strings.js` are authoritative; BG lives in the generated
`*.bg.js` files and falls back to EN for any missing key.

## Legal & App Store

- **In-app**: Privacy Policy, Terms of Use, and About are reachable from the
  consent screen footer, rendered from `js/legalContent.js` (EN + BG).
- **Public site** (`site/`): landing page + `privacy.html` + `terms.html` (both bilingual). Privacy URL for the App Store: `https://apporigindev.github.io/seasonist/privacy.html`.
- **Submission**: copy-paste listing text, App Privacy answers, and the
  "create the app" checklist are in
  [docs/app-store-submission.md](docs/app-store-submission.md).
- Provider identity in the legal docs (ЕИК 206649741 / VAT BG206649741 /
  development@app-origin.com) and the `[EFFECTIVE DATE]` placeholders **must be
  confirmed/filled by the owner** before publishing.

## iOS / TestFlight

The app ships to TestFlight as a Capacitor wrapper around `www/`. Repo side
is complete — Apple portal + GitHub secrets steps are in
[docs/ios-testflight-setup.md](docs/ios-testflight-setup.md). Trigger builds
manually: Actions → “iOS — Build & Upload to TestFlight”.

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
