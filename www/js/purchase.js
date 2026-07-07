/**
 * purchase.js — one-time "unlock this analysis" consumable purchase.
 *
 * On a device this drives the native In-App Purchase sheet (StoreKit 2 on iOS,
 * Play Billing on Android) via the cordova-plugin-purchase plugin. Digital
 * unlocks MUST go through Apple/Google — external processors (Stripe, Revolut,
 * direct card) are not allowed for in-app digital goods. The user's own cards
 * and Apple Pay / Google Pay are what the system sheet pays with.
 *
 * In the browser (dev / preview) a clearly-labelled simulated sheet stands in
 * so the flow is testable without a device.
 */

export const UNLOCK_PRODUCT_ID = "seasonist.analysis.unlock";
const PRICE_FALLBACK = "€4.99";

function nativeStore() {
  return typeof window !== "undefined" && window.CdvPurchase ? window.CdvPurchase : null;
}

let initialized = false;

export async function initPurchases() {
  const Cdv = nativeStore();
  if (!Cdv || initialized) return;
  const { store, ProductType, Platform } = Cdv;
  store.register([
    { id: UNLOCK_PRODUCT_ID, type: ProductType.CONSUMABLE, platform: Platform.APPLE_APPSTORE },
  ]);
  // Verify then finish every approved transaction (on-device verification).
  store.when().approved((t) => t.verify());
  store.when().verified((r) => r.finish());
  await store.initialize([Platform.APPLE_APPSTORE]);
  initialized = true;
}

/** Localized store price (e.g. "€4.99", "$4.99", "9,99 лв") or a fallback. */
export async function getUnlockPrice() {
  const Cdv = nativeStore();
  if (Cdv) {
    try {
      const product = Cdv.store.get(UNLOCK_PRODUCT_ID);
      const offer = product && product.getOffer && product.getOffer();
      const price = offer?.pricingPhases?.[0]?.price;
      if (price) return price;
    } catch {
      /* fall through to fallback */
    }
  }
  return PRICE_FALLBACK;
}

/**
 * Runs the purchase. Resolves { ok: true } on success,
 * { ok: false, cancelled: true } if the user backs out, and throws on error.
 */
export async function buyUnlock() {
  const Cdv = nativeStore();
  if (Cdv) return nativeBuy(Cdv);
  return simulatedBuy();
}

async function nativeBuy(Cdv) {
  const product = Cdv.store.get(UNLOCK_PRODUCT_ID);
  if (!product) throw new Error("Product not available");
  const offer = product.getOffer();
  // The plugin presents the OS payment sheet; approved→verify→finish is wired
  // in initPurchases(). order() resolves once the transaction is placed.
  await offer.order();
  return { ok: true };
}

/* ---------------- simulated sheet (dev / browser preview only) ---------------- */

function simulatedBuy() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "pay-sheet-overlay";
    overlay.innerHTML = `
      <div class="pay-sheet" role="dialog" aria-modal="true" aria-label="App Store purchase">
        <div class="pay-note">Simulated App Store purchase — dev only. On a device this is Apple's system sheet.</div>
        <div class="pay-head">
          <div class="pay-app">
            <div class="pay-icon" aria-hidden="true"></div>
            <div><div class="pay-name">Seasonist</div><div class="pay-item">Full analysis</div></div>
          </div>
          <div class="pay-price">${PRICE_FALLBACK}</div>
        </div>
        <div class="pay-method">
          <span> Pay with your card / Apple Pay</span>
          <span class="pay-acct">Apple&nbsp;ID</span>
        </div>
        <button class="pay-confirm" type="button">Confirm — Double-click to Pay</button>
        <button class="pay-cancel" type="button">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);

    const done = (result) => {
      overlay.remove();
      resolve(result);
    };
    overlay.querySelector(".pay-cancel").addEventListener("click", () => done({ ok: false, cancelled: true }));
    overlay.querySelector(".pay-sheet").addEventListener("click", (e) => e.stopPropagation());
    overlay.addEventListener("click", () => done({ ok: false, cancelled: true }));
    overlay.querySelector(".pay-confirm").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      btn.textContent = "Processing…";
      btn.disabled = true;
      overlay.querySelector(".pay-cancel").style.visibility = "hidden";
      setTimeout(() => done({ ok: true, simulated: true }), 1100);
    });
  });
}
