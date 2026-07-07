# Seasonist — App Store Connect Submission Guide

> Copy-paste reference for creating the **Seasonist** iOS listing in App Store Connect.
> App: free, on-device personal color analysis. No accounts, no data collection.
> Capacitor wrapper around a web app. Bundle ID: `com.apporigin.seasonist`.

---

## 1. App Name & Subtitle

App Store enforces **≤30 characters** for each of these.

| Field | Suggested value | Chars |
|---|---|---|
| **App Name** | `Seasonist: Color Analysis` | 26 |
| **Subtitle** | `Find your seasonal palette` | 26 |

**Alternates (pick whichever reads best / is available):**

- App Name: `Seasonist — Color Analysis` (26)
- App Name: `Seasonist: Color Season` (23)
- Subtitle: `Your personal color season` (26)
- Subtitle: `Skin tone & palette finder` (26)

> The App Name carries the most ASO weight — keep the brand **Seasonist** first, then a high-value keyword phrase. Do not repeat words between Name and Subtitle (Apple indexes both, so duplication wastes coverage).

---

## 2. Promotional Text

*(≤170 chars. Editable any time without a new build — use it for seasonal/marketing hooks.)*

```
Discover your personal color season in seconds. Snap or upload a photo and get your custom palette — 100% on your device, no sign-up, no data collected.
```

---

## 3. App Store Description (English)

*(Paste into the **Description** field. ~3,000-char practical limit; this is well under.)*

```
Seasonist helps you discover your personal color season and the palette that makes you look your best — right on your phone, in seconds.

Personal color analysis (also called seasonal color analysis) matches your skin tone, hair, and eyes to the shades that suit you most. Instead of guessing at the store, Seasonist gives you a clear season and a ready-to-use color palette you can shop and style with confidence.

HOW IT WORKS
• Take a photo with your camera, or upload one from your gallery
• Seasonist analyzes your coloring on your device
• Get your color season and a personalized palette of flattering shades
• Use your palette to choose clothes, makeup, and accessories that suit you

WHY SEASONIST
• 100% on-device — your photos never leave your phone
• No account, no sign-up, no email required
• No data collection and no tracking
• Free to use
• Simple, fast, and beginner-friendly

WHO IT'S FOR
Anyone who wants to shop smarter and dress in colors that flatter them — whether you're new to color analysis or you already know your undertone and want a palette to carry with you.

PRIVACY FIRST
Seasonist processes your photo entirely on your device. We do not collect, store, or share your images or any personal information. There are no accounts and nothing to log in to.

Find your colors. Look your best. Download Seasonist and discover your season today.
```

---

## 4. Short Description (Bulgarian)

*(Use for a Bulgarian localization of the listing, or keep on hand for the BG market. Bulgarian is a supported App Store language.)*

```
Seasonist открива вашия личен цветови сезон и палитрата, която ви отива най-много — директно на телефона, за секунди.

Личният цветови анализ (сезонен анализ на цветовете) съпоставя тена на кожата, косата и очите ви с най-подходящите за вас нюанси. Направете снимка с камерата или качете снимка от галерията, а Seasonist ще анализира цветовете ви и ще ви даде вашия сезон и персонална палитра.

• 100% на устройството — снимките ви не напускат телефона
• Без регистрация и без акаунт
• Не събираме никакви данни
• Безплатно и лесно за използване

Открийте своите цветове и изглеждайте най-добре със Seasonist.
```

---

## 5. Keyword Field

*(App Store Connect **Keywords** field — comma-separated, **≤100 characters total including commas**. Do NOT repeat words already in the App Name/Subtitle; no spaces after commas to save characters; singular forms cover plurals.)*

```
personal,seasonal,undertone,skin tone,palette,makeup,outfit,style,winter,summer,autumn,spring
```

Character count: **93 / 100** ✓

> Tip: "color" and "analysis" are already in the App Name, so they're indexed — don't waste keyword characters repeating them. Swap in `beauty`, `wardrobe`, or `stylist` seasonally if you want to test alternatives.

---

## 6. App Privacy — "Data Not Collected"

In App Store Connect: **App Privacy → Get Started / Edit**.

### The answer

**Data Collection = "Data is NOT collected from this app."**

When you start the privacy questionnaire, the first question is:

> *"Do you or your third-party partners collect any data from this app?"*

**Answer: No.**

Selecting **No** completes the privacy section — you will **not** be asked to declare any data types, and your product page will show **"Data Not Collected."**

### Why this is correct (justification to keep on record)

- All personal color analysis runs **on-device**. Photos are processed locally and never uploaded to a server.
- There are **no user accounts**, no email/sign-up, and no login.
- The app does **not** transmit photos, contacts, identifiers, location, usage analytics, or diagnostics to you or any third party.
- The Capacitor web wrapper is self-contained; it does not embed third-party analytics, ad, or tracking SDKs that would collect data.

### Important caveats before you answer "No"

Apple's definition of "collect" = transmitting data off the device. Confirm **all** of the following are true, otherwise the honest answer changes:

- [ ] No crash/analytics SDK (Firebase, Sentry, Crashlytics, Google Analytics, etc.) is bundled.
- [ ] No advertising or attribution SDK is present.
- [ ] The web content does not call out to a backend that logs requests with user data.
- [ ] No remote logging of photos or results.

If every box is checked, **"Data Not Collected"** is accurate. (Given Seasonist is fully on-device with no backend, this is expected to be the case.)

### App Tracking Transparency (ATT)

Because nothing is tracked across apps/websites, **do not** add `NSUserTrackingUsageDescription` and do not call the ATT prompt. No tracking = no ATT requirement.

---

## 7. Age Rating

Set **Age Rating = 4+**.

In the Age Rating questionnaire, answer **None / No** to every content category:

- Violence (cartoon, realistic, prolonged): **None**
- Sexual content / nudity: **None**
- Profanity / crude humor: **None**
- Alcohol, tobacco, drugs: **None**
- Simulated gambling / real gambling: **None**
- Horror / fear themes: **None**
- Medical/treatment information: **None**
- Unrestricted web access: **No** (the app loads its own bundled content, not an open browser)
- User-generated content / messaging: **No**

Result: **4+** — no objectionable content.

---

## 8. Categories

| Slot | Suggestion | Rationale |
|---|---|---|
| **Primary Category** | **Lifestyle** | Best fit for personal styling / color analysis; strong discovery for beauty & style users. |
| **Secondary Category** | **Photo & Video** | The core interaction is capturing/analyzing a photo. |

**Alternate primary:** if Lifestyle feels too broad, **Utilities** is defensible (a focused tool), but **Lifestyle** is recommended for reach and relevance in this niche.

---

## 9. URLs (App Information & Version)

Base site (landing + legal, published from `site/`): `https://apporigindev.github.io/seasonist/`

| Field | URL | Required? |
|---|---|---|
| **Privacy Policy URL** | `https://apporigindev.github.io/seasonist/privacy.html` | **Required** |
| **Support URL** | `https://apporigindev.github.io/seasonist/` | **Required** |
| **Marketing URL** | `https://apporigindev.github.io/seasonist/` | Optional |

Notes:

- **Privacy Policy URL** → `privacy.html` (a bilingual EN/BG page rendering the same policy shown in-app). `terms.html` holds the Terms of Use.
- **Support URL** → the landing page satisfies Apple's requirement: it explains how the app works and shows a contact email (`development@app-origin.com`). No separate support page needed.
- **Marketing URL** → the site root (the landing).

**Action item for the owner:** create a `/support` page (and confirm `/privacy` resolves) before submitting, so both required URLs return HTTP 200.

---

## 10. Camera Usage & Permissions

- `NSCameraUsageDescription` **is already set** in the app's `Info.plist`. Good — the app must not crash when requesting camera access.
- **App Review WILL test the camera.** Reviewers run on real devices and will trigger the camera flow, so make sure the permission prompt appears with a clear, human-readable purpose string (e.g. *"Seasonist uses the camera to take a photo for your personal color analysis."*).
- **Gallery / upload fallback:** the app also lets users **upload a photo from their gallery** instead of using the live camera. Call this out in the Review Notes (below) so a reviewer on a device where the camera is awkward (e.g. simulator-like conditions, no good lighting) can still complete the flow via gallery upload.
- If the app reads from the photo library, ensure `NSPhotoLibraryUsageDescription` (and/or `NSPhotoLibraryAddUsageDescription` if it saves results) is also present with a clear string. Verify these in `Info.plist` before archiving.
- Do **not** request camera/photo access at launch — request it only when the user starts an analysis, so the flow feels intentional.

---

## 11. Review Notes for Apple

*(Paste into **App Review Information → Notes**. Sign-in demo account is **not** required — mark "Sign-in required? No".)*

```
Seasonist is a free personal color analysis app.

• No login or account is required. There is nothing to sign in to — the app is fully usable immediately on first launch.
• All analysis runs entirely ON-DEVICE. Photos are processed locally and are never uploaded, stored on a server, or shared. The app collects no personal data.
• To test: on the main screen, either (a) tap to take a photo with the camera, or (b) use the "upload from gallery" option to pick an existing photo. The app then returns a color season and a personalized palette.
• The camera permission prompt appears when you start an analysis; please allow it. If testing without a suitable live photo, use the gallery-upload path instead.
• The app is a Capacitor (web) wrapper; all content is bundled with the app.

No demo credentials are needed. Contact: development@app-origin.com
```

Also set:
- **Sign-in required:** No
- **Demo account:** leave blank / N/A
- **Contact info:** your name, phone, and `development@app-origin.com`

---

## 12. CHECKLIST — Create the app in App Store Connect

**Prerequisites (Apple Developer portal — do first)**
- [ ] Enrolled in the Apple Developer Program (paid, active).
- [ ] **App ID registered** with bundle ID `com.apporigin.seasonist` (Certificates, Identifiers & Profiles → Identifiers). Enable **Camera** capability if the App ID requires explicit capabilities (usually not needed for camera, but confirm).
- [ ] Distribution certificate + App Store provisioning profile available (Xcode-managed signing is fine).

**Create the app record**
- [ ] App Store Connect → **My Apps → + → New App**.
- [ ] **Platform:** iOS.
- [ ] **Name:** `Seasonist: Color Analysis` (must be globally unique; have a fallback ready in case it's taken).
- [ ] **Primary Language:** English (U.S.) — add **Bulgarian** as an additional localization if desired.
- [ ] **Bundle ID:** select `com.apporigin.seasonist` from the dropdown (it must already be registered as an App ID).
- [ ] **SKU:** a private internal identifier, e.g. `SEASONIST-IOS-001` (any unique string; never shown to users).
- [ ] **User Access:** Full Access (or as your team requires).

**Fill in App Information (left sidebar)**
- [ ] **Subtitle:** `Find your seasonal palette`
- [ ] **Category:** Primary = **Lifestyle**, Secondary = **Photo & Video**.
- [ ] **Age Rating:** complete questionnaire → all "None/No" → **4+**.
- [ ] **Privacy Policy URL:** `https://apporigindev.github.io/seasonist/privacy.html` (confirm it loads).

**App Privacy**
- [ ] **App Privacy → Get Started** → "Do you collect data?" → **No** → publish → shows **"Data Not Collected."**

**Prepare the version (e.g. 1.0)**
- [ ] **Promotional Text**, **Description** (English), **Keywords** — paste from sections 2, 3, 5 above.
- [ ] **Support URL:** `https://apporigindev.github.io/seasonist/` (landing page — serves as support).
- [ ] **Marketing URL:** `https://apporigindev.github.io/seasonist/` (optional).
- [ ] **Screenshots:** upload required sizes — 6.7"/6.9" iPhone (mandatory) and 6.5" iPhone; iPad only if you support iPad.
- [ ] **App Icon:** 1024×1024 PNG, no transparency, no rounded corners (delivered in the build's asset catalog).
- [ ] **(Optional) Bulgarian localization:** add the BG description from section 4.

**Build & submit**
- [ ] Archive in Xcode (or CI) with bundle ID `com.apporigin.seasonist`; verify `NSCameraUsageDescription` (and photo-library keys) are present in `Info.plist`.
- [ ] Upload the build (Xcode Organizer / Transporter) and wait for processing.
- [ ] Attach the processed build to the version.
- [ ] **App Review Information:** Sign-in required = **No**; paste **Review Notes** from section 11; add contact email `development@app-origin.com`.
- [ ] **Version Release:** choose automatic or manual release.
- [ ] **Add for Review → Submit for Review.**

**Post-submission**
- [ ] Confirm `/privacy` and `/support` URLs return HTTP 200 (reviewers will click them).
- [ ] Watch for the review outcome; if rejected for the camera flow, point them to the **gallery-upload fallback** in your reply.
