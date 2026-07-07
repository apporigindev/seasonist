/**
 * strings.js
 * UI string dictionary. STRINGS.en is authoritative; STRINGS.bg is the
 * Bulgarian translation (generated in strings.bg.js; missing keys fall back
 * to English in i18n.js).
 */

import { STRINGS_BG } from "./strings.bg.js";

export const STRINGS = {
  en: {
    "meta.title": "Seasonist — Personal Color Analysis",

    "lang.aria": "Change language",

    "consent.eyebrow": "Before we begin",
    "consent.title": "Your photo stays <em>yours</em>",
    "consent.body":
      "We'll ask for one daylight photo to read your undertone, depth, and contrast. Everything is analyzed on this device, in your browser — nothing is uploaded.",
    "consent.point1": "Your photo never leaves this device.",
    "consent.point2": "Your photo is never stored — it's gone when you close this page.",
    "consent.point3": "Nothing is shared or used to train any model.",
    "consent.agree": "I agree — continue",
    "consent.decline": "Not now",
    "consent.declined": "No problem — come back any time.",

    "capture.eyebrow": "Step 1 of 2",
    "capture.title": "Find soft, <em>even</em> daylight",
    "capture.body":
      "Face a window, skip filters and makeup if you can, and keep a neutral expression.",
    "capture.ringHint": "align face",
    "capture.cameraUnavailable": "camera unavailable — upload below",
    "capture.tip": "Natural light · No flash · Look straight ahead",
    "capture.take": "Take photo",
    "capture.upload": "Upload from gallery instead",

    "analyzing.step1": "Reading your coloring…",
    "analyzing.step2": "Measuring undertone…",
    "analyzing.step3": "Finding your season…",

    "result.eyebrow": "Your result",
    "result.toCompare": "See it on your photo",
    "result.retake": "Retake photo",
    "result.delete": "Delete my analysis",
    "result.trait.undertone": "Undertone",
    "result.trait.depth": "Depth",
    "result.trait.clarity": "Clarity",

    "metric.undertone.warm": "Warm",
    "metric.undertone.cool": "Cool",
    "metric.undertone.neutral": "Neutral",
    "metric.value.light": "Light",
    "metric.value.deep": "Deep",
    "metric.value.medium": "Medium",
    "metric.chroma.bright": "Bright",
    "metric.chroma.soft": "Soft",
    "metric.chroma.balanced": "Balanced",

    "compare.eyebrow": "Same photo, different shade",
    "compare.title": "See the <em>difference</em>",
    "compare.startOver": "Start over",
    "compare.delete": "Delete my analysis",

    "error.eyebrow": "Hmm",
    "error.default.title": "We couldn't read that photo",
    "error.default.text": "Make sure your face is clearly visible and well lit, then try again.",
    "error.noFace.title": "We couldn't find a face",
    "error.noFace.text":
      "Make sure your face fills the frame and is clearly visible, then try again.",
    "error.lowLight.title": "The photo is too dark",
    "error.lowLight.text":
      "Move closer to a window or brighter daylight and try again — good light is everything here.",
    "error.generic.title": "Something went wrong",
    "error.generic.text":
      "The analysis couldn't finish. Check your connection (the face model loads once from the web) and try again.",
    "error.retry": "Try again",

    "confirm.title": "Delete this analysis?",
    "confirm.text":
      "Your photo and result live only on this device — they were never uploaded or stored anywhere. This clears them from here now.",
    "confirm.delete": "Delete",
    "confirm.cancel": "Keep it",
    "toast.deleted":
      "Deleted. It only ever existed on this device — nothing was uploaded or stored.",

    "legal.back": "Back",
    "footer.privacy": "Privacy Policy",
    "footer.terms": "Terms of Use",
    "footer.about": "About",

    "about.eyebrow": "About",
    "about.title": "How Seasonist works",
    "about.body":
      "Seasonist reads the color of your skin, eyes, and hair from one daylight photo and matches you to one of the 12 seasonal color palettes. The analysis runs entirely on your device — your photo is never uploaded. Results are a styling guide, not a medical or professional assessment.",
    "about.contact": "Contact & support: development@app-origin.com",

    "unlock.eyebrow": "Full analysis",
    "unlock.feat1": "Your complete colour palette",
    "unlock.feat2": "See it on your photo — drape comparison",
    "unlock.feat3": "Your undertone, depth & clarity",
    "unlock.feat4": "Saved to your device — yours to keep",
    "unlock.cap": "one-time · this analysis is yours to keep",
    "unlock.cta": "Unlock full analysis",
    "unlock.fine": "A one-time purchase for this analysis. No subscription, nothing recurring.",
    "unlock.processing": "Contacting the App Store…",
    "unlock.done": "Unlocked — saved to this device.",
    "unlock.cancelled": "Purchase cancelled — nothing was charged.",
    "unlock.failed": "The purchase didn't complete. Nothing was charged.",

    "library.link": "Your analyses",
    "library.eyebrow": "Your analyses",
    "library.title": "Saved on this device",
    "library.new": "New analysis",
    "library.empty": "No saved analyses yet — unlock one to keep it here.",
    "library.you": "You",
  },

  // Bulgarian translation (generated). Missing keys fall back to English.
  bg: STRINGS_BG,
};
