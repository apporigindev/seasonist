# Seasonist — Claude Code Guide

## What Is This App

**Seasonist** is a **personal colour-analysis** mobile app. From one daylight selfie it
reads the user's undertone, depth, and contrast and matches them to their **12-season
colour palette**, then sells a detailed paid result and (optionally) AI-generated photos
of the user wearing their colours.

- **Privacy is the pitch:** the core analysis runs **100% on-device** (in the WebView).
  The photo is never uploaded for the analysis. The **only** exception is the optional,
  paid "See it for real" AI feature, which sends the selfie to a generative API **after
  explicit opt-in consent** (see below).
- Formerly "Hue". Owner: **App-Origin** (ЕИК 206649741 / VAT BG206649741 /
  development@app-origin.com). Repo: `github.com/apporigindev/seasonist` (**public**),
  authed via `gh` as `apporigindev`.
- Bundle id **`com.apporigin.seasonist`**. Two languages: **English + Bulgarian**
  (BG default when the device is Bulgarian; БГ/EN toggle persists).

> Second app is BidPazar (`C:\Apps\bidpazar`), a totally separate marketplace. **Never mix
> Seasonist and BidPazar in one branch/commit.** This session's working dir is often
> `C:\Apps\bidpazar` but Seasonist lives at `C:\Apps\seasonist` — edit files there.

---

## Structure

| Path | What | Notes |
|---|---|---|
| `www/` | The app — **static vanilla-JS** (no build step, no framework) | Wrapped by Capacitor into the iOS binary |
| `backend/` | Fastify (TS, ESM) **try-on + purchase-verification** service | Only used by the paid AI tier; deployed on Railway |
| `site/` | Public landing + legal pages (GitHub Pages) | `index.html`, `privacy.html`, `terms.html` |
| `ios/` | Capacitor 8 iOS project (SPM, no CocoaPods) | Fastlane + GitHub Actions → TestFlight |

Preview launch configs (in bidpazar's `.claude/launch.json`): **`hue`** (the app, port 4175),
**`seasonist-site`** (landing, port 4176). Start with `preview_start name:"hue"`.

### `www/js` map
`app.js` (screen-flow controller + all state) · `analysis.js` (MediaPipe FaceLandmarker +
colour sampling + validation) · `classify.js` (rule-based 12-season classifier, quantised
for determinism) · `palettes.js` + `seasons.bg.js` (season data) · `seasonDetails.js`
(neutrals/metals/avoid/makeup/styling per season) · `compare.js` (on-photo drape renderer,
side-by-side) · `purchase.js` (StoreKit consumables via cordova-plugin-purchase + a
simulated sheet for dev) · `config.js` (try-on backend URL + API key + `TEST_UNLOCK`) ·
`tryonApi.js` (backend client) · `savedAnalyses.js` (on-device library + re-run grace) ·
`i18n.js` + `strings.js` + `strings.bg.js` · `legalContent.js` (Privacy/Terms EN+BG).

---

## Commands

```bash
# App (static — nothing to build; just serve www/)
preview_start name:"hue"          # via the preview tool (never `npm run` a server yourself)
npx cap sync ios                  # copy www/ into the iOS project

# Backend
cd backend
npm ci
npm test                          # vitest — 26 tests, mocked (no creds needed)
npm run dev                       # tsx watch on :8080
npm run build                     # fetches Apple root certs + tsc
npm run migrate                   # DATABASE_URL=… node scripts/migrate.mjs
```

**In the preview, the service worker caches aggressively** — after editing `www/`, clear it
before checking: `navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); caches.keys().then(k=>k.forEach(c=>caches.delete(c)))` then reload with a cache-bust query.

---

## The Analysis Pipeline (`analysis.js` + `classify.js`)

1. **MediaPipe FaceLandmarker** (WASM, GPU delegate, loaded from jsDelivr CDN) finds face
   landmarks — fully on-device.
2. Sample skin/eye/hair colours → CIELAB → rule-based classifier → one of 12 seasons +
   metrics (undertone / depth / clarity).
3. **Determinism matters** (trust): the same photo always yields the same season — an
   in-memory fingerprint cache + **metric quantisation** (grid aligned to thresholds) so
   borderline faces don't flip. Different photos of the same person *can* still differ
   (lighting) — that's what the re-run grace handles.
4. **Validation / edge cases** — `analyzeImage` throws: `no-face` (not a face / irrelevant),
   `low-light` (skin luma < 30), `blurry` (Laplacian variance on the face crop < ~9,
   conservative to avoid false rejects). Each maps to a clear error screen + retry.

**Known open issue (do NOT blind-patch):** skin-tone bias — deep-skin collapse, warm-bias,
low-light gate reject correctly-exposed dark selfies. Needs a diverse test set + **white-
balance normalisation** + a **"borderline / between two seasons"** indicator (the real
root-cause fix for cross-photo consistency). Flagged must-fix before broad launch.

---

## Monetization & Paywall

**Two consumable tiers** (one-time IAPs, NOT subscriptions):

| Product id | Price | Grants |
|---|---|---|
| `seasonist.analysis.unlock` | **€4.99** | Full detailed result (palette, neutrals, metals, avoid, makeup, styling) + on-photo drape compare |
| `seasonist.tryon.unlock` | **€8.99** | *Everything above* **+** AI photos of you wearing your colours |

- The **locked result shows BOTH tiers** side-by-side (€8.99 flagged "Best value"). Buying
  €8.99 unlocks everything in one tap; the AI card then reads "included". The €4.99-then-
  upgrade path is preserved.
- **Re-run grace** (`savedAnalyses.js`): a purchase grants **free re-runs for 48h / up to 5
  photos** so refining your own photo (lighting shifts the read) doesn't feel like paying
  twice. Bounded by time AND count. On-device only.
- A **differing re-run** (new season vs the last saved one) surfaces an honest note
  ("this photo reads as X — a bit different from your earlier Y; both are saved") instead
  of silently overwriting. A retake keeps the paid try-on pack; only Start-over/Delete clears it.
- Digital goods MUST use Apple IAP / Play Billing (no Stripe/Revolut/card). Apple takes 15%
  (Small Business Program).

---

## "See it for real" — Generative Try-On Tier

Optional, paid, **off by default**. The app shows it only when the backend `/health` reports
`tryonAvailable: true`.

- **Provider:** fal.ai, model **`fal-ai/flux-pro/kontext`** (FLUX.1 Kontext, image-EDIT path
  — never text-to-image). ~$0.04/render; a 4-image pack ~$0.16. Server-side only; the fal
  key never ships in the app.
- **Prompt** recolors the top; if it's a close-up with no top, **adds a scarf** in the colour.
  Built from the regex-validated hex + a server-computed colour word (the client's free-form
  colour name never enters the prompt — injection guard). Pinned per-attempt seed.
- **Framing:** the app checks the face box; a tight face-only close-up (little room below the
  chin) prompts a reframe ("needs your neck/shoulders") before generating.
- **Entitlement:** app sends the StoreKit `transactionId`; the backend verifies it via the
  **App Store Server API** (`@apple/app-store-server-library`), asserts the product, and
  blocks replay/double-spend with a unique `tx_key` (migration `002`). Bounded-retry cost
  cap (`TRYON_MAX_ATTEMPTS`), and a failed render doesn't consume the pack.
- **Loading UX:** skeleton/ghost cards (one per colour), each Save disabled until its image
  lands. No open-ended spinner.
- **Privacy:** the photo is held in memory only, never stored or logged; the provider result
  URL is inlined so it never reaches the client. A dedicated "AI photo editing" section is in
  the Privacy Policy + Terms carve-outs (EN+BG) — the "photo never leaves your device"
  promise is scoped to everything *except* this opt-in feature.

Endpoint: `POST /v1/tryon` (guarded by `x-api-key` when `APP_API_KEY` is set). Env in
`backend/.env.example`; activation checklist in `backend/README.md`.

---

## Deployment

- **Backend → Railway**, project **`seasonist-api`** (service `seasonist-api` + `Postgres`),
  live at **`https://seasonist-api-production.up.railway.app`**. `config.js TRYON_API_BASE`
  points at it. Build fetches Apple root certs; migrations via `scripts/migrate.mjs`.
  One-shot re-provision helper: `backend/scripts/railway-activate.sh`. The Railway CLI
  database picker needs a TTY — provision Postgres via GraphQL (`templateDeployV2`) instead;
  never pipe `railway` through `head` (SIGPIPE kills it).
- **Landing/legal → GitHub Pages** from `site/` (auto-deploys on push to `main`).
- **iOS → TestFlight** via `.github/workflows/ios-testflight.yml` (manual
  `workflow_dispatch`). Build number auto-increments; `npx cap sync ios` bundles `www/`; a
  step stamps the SW cache version (`__BUILD__`) so updates aren't stale. Trigger:
  `gh workflow run ios-testflight.yml --ref <branch> -R apporigindev/seasonist [-f test_unlock=true]`.
- **Test mode** (for testing before Apple/fal are fully set up): the workflow input
  `test_unlock=true` stamps `TEST_UNLOCK=true` (simulated purchase sheets); the Railway
  backend can be set to `TRYON_PROVIDER=mock` + `TRYON_DEV_BYPASS=true` (placeholder images,
  no purchase verification). **MUST be reverted before App Store submission** — repo default
  is off; never submit a test_unlock build. See the "REVERT test mode" task.

Signing/creds are **shared with BidPazar**: distribution cert + ASC API key (`AuthKey_*.p8`)
live in `C:\Apps\bidpazar\ios\certs\` (gitignored). Secrets are GitHub Actions secrets
(write-only). **Never commit any key, issuer id, or API key** — this repo is public.

---

## Design System / Brand

- Fonts: **Cormorant Garamond** (display serif, italic accents), **Manrope** (body),
  **JetBrains Mono** (small labels/eyebrows). Loaded from Google Fonts.
- Palette tokens (`www/css/styles.css` `:root`): `--bg #ECE7E1`, `--ink #1B1814`,
  `--ink-soft #4A443C`, `--white #FBF9F6`, `--mauve #B98D86`, **`--mauve-deep #8F534C`**
  (mauve darkened to ≥4.5:1 for **text** — use this for mauve text, `--mauve` only for
  decorative), plus gold/honey/sage. The **"veil" gradient** (peach→butter→sage→mist,
  deeper cut `#D97F55…#7A93B5`) is the signature — the wordmark and prices wear it.
- Slogan: "Wear your season." Brand mark: silk "S" stroke in the veil gradient.
- Ambient morphing "blobs" behind screens, retinted to the user's palette on the result.

## Accessibility

Built to WCAG AA: inactive screens are `visibility:hidden` (only the active screen is in the
a11y tree); focus moves to the new screen's heading on navigation; mauve **text** meets
4.5:1 via `--mauve-deep`; `prefers-reduced-motion` disables all animation; visible focus
rings; the upload control is keyboard-operable. **Keep these when adding UI.**

---

## i18n & Legal

- **Every string in BOTH `strings.js` (EN) and `strings.bg.js` (BG)** — a missing BG key
  falls back to EN but should be added. `data-i18n` → textContent, `data-i18n-html` → innerHTML,
  `data-i18n-aria` → aria-label. `<html lang>` updates on toggle.
- Legal (`www/js/legalContent.js`, EN+BG): the on-device promise is reconciled with the AI
  feature (dedicated section + carve-outs). BG uses **statutory register** (ЗЗП / ОРЗД
  official terms) — never literal EN→BG. Update BOTH languages together. Site legal
  (`site/privacy.html` etc.) is separate and must be synced before public launch.

---

## Conventions

- **Never `fetch` a backend directly** except via `tryonApi.js`. The app is otherwise
  offline/on-device.
- Vanilla JS, `StyleSheet`-free — plain CSS with the tokens above. No framework, no build.
- Feature branches → PR → merge to `main`. gh CLI works for this repo.
- After editing `www/`, verify in the `hue` preview (clear the SW cache first). Screenshots
  via the preview tool are flaky this environment — verify with DOM measurements
  (`javascript_tool` / `read_page`) and, when a visual review is needed, render a mockup with
  `show_widget` (its CSP allows Google Fonts).

---

## Current State (2026-07) & Activation Checklist

**Live & working:** on-device analysis + validation; detailed 12-season paid result; two-tier
paywall; re-run grace + differing-result handling; on-photo compare; the full try-on tier
(backend deployed on Railway, app wired, real fal generation verified end-to-end);
accessibility pass; EN+BG; landing + legal; TestFlight CI. Active dev branch: `feat/tryon-tier`
(PR #1).

**Owner-only switches still gating the paid flows** (all account/payment actions I can't do):
1. **fal.ai balance** — key + card added, but the account balance was $0 ("Exhausted balance");
   top up at `fal.ai/dashboard/usage-billing/credits`. Backend is already on `fal`; a positive
   balance = real AI photos immediately.
2. **Paid Applications agreement → Active** (App Store Connect → Business → Agreements, Tax &
   Banking) — required before ANY IAP loads, even in sandbox.
3. **Create the IAP shell `seasonist.tryon.unlock`** (Consumable) in ASC — the ASC API returns
   403 on product CREATE (key role / agreement), so the shell is created in the UI; then the
   price/screenshot are scripted (`scratchpad/asc-create-tryon-iap.mjs`).
4. **Sandbox tester** (ASC → Users and Access → Sandbox) signed into the iPhone to test real
   purchases.

**Before public launch:** revert test mode (task), flip `APPLE_ENVIRONMENT` Sandbox→Production,
sign the fal.ai/Black Forest Labs DPA + fill the exact retention figure into the privacy
section, sync `site/` legal, add the App Privacy label (User Content → Photos), and do the
white-balance/borderline consistency work + a real-device VoiceOver pass.
