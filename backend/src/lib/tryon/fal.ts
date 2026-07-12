/**
 * fal.ts — real generative provider backed by fal.ai.
 *
 * For each target color we ask an image-EDIT model to repaint the person's top
 * in that color while preserving their face, hair, pose and identity. The
 * selfie is passed inline (data URI) — nothing is uploaded to our own storage.
 * The model's result URL is fetched and inlined as a data URI before returning,
 * so the third-party URL is never handed to the client or persisted.
 *
 * The exact model id is configurable via TRYON_MODEL (an image-edit model such
 * as a Flux Kontext editor). Calls are made one-per-color with a small
 * concurrency cap.
 */
import type { GeneratedImage, TargetColor, TryOnJob, TryOnProvider } from "./provider.js";

const FAL_SYNC_BASE = "https://fal.run";
const CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 90_000;

export class FalProvider implements TryOnProvider {
  readonly name = "fal";

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async generate(job: TryOnJob): Promise<GeneratedImage[]> {
    // Partial-tolerant: a single color failing (timeout, safety flag, shape
    // mismatch) must NOT discard the colors that already succeeded and were
    // billed. Return every success; drop failures.
    const settled = await mapPoolSettled(job.colors, CONCURRENCY, (c) => this.one(job, c));
    return settled.filter((r): r is GeneratedImage => r !== null);
  }

  private async one(job: TryOnJob, color: TargetColor): Promise<GeneratedImage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${FAL_SYNC_BASE}/${this.model}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: job.photo,
          prompt: buildPrompt(color),
          // Kontext edit: low guidance keeps the edit faithful to the source.
          guidance_scale: 3.5,
          num_images: 1,
          // Deterministic per photo+color (same input → same result) but varied
          // by attempt, so retrying a deterministically-failing render differs.
          seed: seedFor(color.hex, job.season, job.attempt ?? 1),
          output_format: "jpeg",
          safety_tolerance: "2",
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`fal ${res.status}: ${await safeText(res)}`);
      }
      const data: any = await res.json();
      // If the model flagged the output, drop just this color — generate() is
      // partial-tolerant, so this does not fail the whole pack.
      if (Array.isArray(data?.has_nsfw_concepts) && data.has_nsfw_concepts.some(Boolean)) {
        throw new Error("fal: output failed safety check");
      }
      const url: string | undefined =
        data?.images?.[0]?.url ?? data?.image?.url ?? data?.output?.[0];
      if (!url) throw new Error("fal: no image URL in response");
      return { colorName: color.name, hex: color.hex, dataUrl: await toDataUrl(url) };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * A garment-only edit instruction. The explicit "keep everything else" clause
 * is the primary defence against identity drift (see the design note in the
 * backend README). We recolor only the top; the face is meant to be untouched.
 */
function buildPrompt(color: TargetColor): string {
  // Describe the target color from its regex-validated hex ONLY. The client-
  // supplied color.name is display-only and must never enter the model prompt
  // (it is free-form text and would be a prompt-injection vector).
  const c = `${describeHex(color.hex)} (hex ${color.hex})`;
  return (
    `Recolor the clothing the person is wearing to ${c}. If little or no clothing is ` +
    `visible because it is a close-up of the face, add an elegant ${c} scarf draped ` +
    `around the neck and shoulders in that exact colour. Keep the face, skin tone, hair, ` +
    `expression and pose exactly the same. Photorealistic, natural fabric, soft even lighting.`
  );
}

/** A coarse, server-computed color word from a #RRGGBB hex (never client text). */
function describeHex(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (d < 0.08) return l < 0.2 ? "black" : l < 0.45 ? "dark grey" : l < 0.75 ? "grey" : "white";
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const light = l > 0.7 ? "light " : l < 0.32 ? "deep " : "";
  const name =
    hue < 15 || hue >= 345 ? "red"
    : hue < 40 ? "orange"
    : hue < 65 ? "yellow"
    : hue < 95 ? "yellow-green"
    : hue < 150 ? "green"
    : hue < 195 ? "teal"
    : hue < 255 ? "blue"
    : hue < 290 ? "purple"
    : "pink";
  return (light + name).trim();
}

/** Deterministic per-color+attempt seed (FNV-1a over color + season + attempt). */
function seedFor(hex: string, season: string, attempt: number): number {
  let h = 0x811c9dc5;
  for (const ch of `${hex}|${season}|${attempt}`) {
    h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  }
  return (h >>> 0) % 2_147_483_647;
}

/** Fetch a result URL and inline it as a data URI (or pass through if already one). */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fal: fetching result failed (${res.status})`);
  const type = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buf.toString("base64")}`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "(no body)";
  }
}

/** Map with bounded concurrency; a failed item yields null (order preserved). */
async function mapPoolSettled<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch {
        out[i] = null; // drop this color; the pack still returns the rest
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
