import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  baseUrl: process.env.BASE_URL ?? `http://localhost:${Number(process.env.PORT ?? 4000)}`,
  domain: process.env.DOMAIN ?? "localhost",

  spheronApiKey: required("SPHERON_API_KEY"),
  spheronBaseUrl: process.env.SPHERON_BASE_URL ?? "https://app.spheron.ai",

  defaultMarkupPercent: Number(process.env.DEFAULT_MARKUP_PERCENT ?? 20),

  adminSeedUsername: process.env.ADMIN_SEED_USERNAME ?? "admin",
  adminSeedPassword: process.env.ADMIN_SEED_PASSWORD ?? "change-me-immediately",

  costPollIntervalMs: Number(process.env.COST_POLL_INTERVAL_MS ?? 300_000),
};
