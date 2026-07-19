/**
 * Every field name (anywhere in a Spheron response, at any nesting depth)
 * that represents a USD amount Podstack would pay. Cross-referenced against
 * docs.spheron.ai/api-reference field-by-field:
 *  - gpu-offers: lowestPrice, highestPrice, averagePrice, price, originalPrice,
 *    discountedPrice, spot_price, extras.kubernetes_addon.total_cost_per_hour
 *  - deployments: hourlyRate, originalHourlyRate, totalCost
 *  - volumes: hourlyRate
 *  - volumes/pricing + volumes/regions: hourlyRatePerGb
 *
 * Deliberately NOT marked up: discountPercentage, hasDiscount (not currency),
 * and anything under /api/balance or /api/teams, which are never relayed to
 * Podstack in the first place (see routes/relay - those stay admin-only).
 */
const PRICE_FIELDS = new Set([
  "price",
  "lowestPrice",
  "highestPrice",
  "averagePrice",
  "originalPrice",
  "discountedPrice",
  "spot_price",
  "hourlyRate",
  "originalHourlyRate",
  "totalCost",
  "hourlyRatePerGb",
  "total_cost_per_hour",
]);

/**
 * Multiply every recognized price field by (1 + markupPercent / 100).
 * Rounds to 6 decimal places, which is generous enough for the smallest
 * observed unit (hourlyRatePerGb ~ 0.000109) without introducing float noise.
 */
export function applyMarkup<T>(payload: T, markupPercent: number): T {
  const factor = 1 + markupPercent / 100;
  return walk(payload, factor) as T;
}

function walk(value: unknown, factor: number): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, factor));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (PRICE_FIELDS.has(key) && typeof v === "number") {
        out[key] = roundMoney(v * factor);
      } else {
        out[key] = walk(v, factor);
      }
    }
    return out;
  }
  return value;
}

function roundMoney(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Reverse of applyMarkup's factor - given a billed (marked-up) number, recover the raw Spheron cost. Used by the dashboard to show true margin. */
export function stripMarkup(billed: number, markupPercent: number): number {
  const factor = 1 + markupPercent / 100;
  return roundMoney(billed / factor);
}
