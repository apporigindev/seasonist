# Seasonist — TestFlight setup (user-side steps)

The repo side is fully wired: Capacitor iOS project in `ios/`, Fastlane lane
`beta` in `ios/App/fastlane/`, and the manual workflow
`.github/workflows/ios-testflight.yml`. What remains needs your Apple
Developer account and takes ~20 minutes. It mirrors the BidPazar setup
(`bidpazar/docs/ios-testflight-setup.md`) — several assets are **reused**, not
recreated.

## 1. Apple Developer portal (developer.apple.com)

1. **Identifiers → “+”** — register App ID `com.apporigin.seasonist`
   (type App, no extra capabilities needed).
2. **Certificates** — **reuse the existing “Apple Distribution” certificate**
   from the BidPazar setup. One distribution certificate covers every app in
   the team. Only create a new one if none exists yet.
3. **Profiles → “+”** — create an **App Store** provisioning profile for
   `com.apporigin.seasonist`, select the Apple Distribution certificate, and
   name it exactly **`Seasonist App Store`** (the Fastfile references this
   name verbatim). Download the `.mobileprovision` file.

## 2. App Store Connect (appstoreconnect.apple.com)

1. **My Apps → “+” → New App**: platform iOS, name **Seasonist**, primary
   language English, bundle ID `com.apporigin.seasonist`, SKU e.g.
   `seasonist-001`.
2. Privacy policy URL (required before external TestFlight/review):
   `https://apporigindev.github.io/seasonist/PRIVACY.md` works, or a page on
   app-origin.com.
3. The **ASC API key is reused** from BidPazar (Users and Access → Keys) —
   no new key needed.

## 3. GitHub secrets (github.com/apporigindev/seasonist → Settings → Secrets → Actions)

Same six names as the BidPazar repo — copy the values across, except the
provisioning profile which is the new Seasonist one:

| Secret | Value |
|---|---|
| `IOS_DIST_CERTIFICATE_P12_BASE64` | same as BidPazar (the exported .p12, base64) |
| `IOS_DIST_CERTIFICATE_PASSWORD` | same as BidPazar |
| `IOS_PROVISIONING_PROFILE_BASE64` | base64 of the **Seasonist App Store** `.mobileprovision` |
| `ASC_KEY_ID` | same as BidPazar |
| `ASC_ISSUER_ID` | same as BidPazar |
| `ASC_KEY_CONTENT` | same as BidPazar (the .p8, base64) |
| `ASC_TEAM_ID` | same as BidPazar (10-char team ID) |

To base64 a file on Windows (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\Seasonist_App_Store.mobileprovision")) | Set-Clipboard
```

## 4. Run it

Actions tab → **iOS — Build & Upload to TestFlight** → Run workflow. The
build lands in App Store Connect → TestFlight in ~15–25 minutes; add yourself
to an internal testing group and install via the TestFlight app.

## Technical notes

- The iOS app is a Capacitor 8 wrapper: the static web app in `www/` is
  bundled into the binary (`npx cap sync ios` copies it at CI time — the
  copy in `ios/App/App/public` is gitignored, never committed).
- Capacitor 8 uses Swift Package Manager, so there is **no CocoaPods step**.
- Camera: `NSCameraUsageDescription` is set; WKWebView serves `getUserMedia`
  through the native camera permission prompt.
- The MediaPipe model still loads from CDN on first run (~3 MB) and is cached
  by the service worker afterwards.
