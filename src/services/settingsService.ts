import { prisma } from "../db";
import { config } from "../config";

const MARKUP_KEY = "markup_percent";
const CACHE_TTL_MS = 5_000; // real-time-enough: dashboard changes reflect within 5s

let cachedMarkup: { value: number; expiresAt: number } | null = null;

export async function getMarkupPercent(): Promise<number> {
  if (cachedMarkup && cachedMarkup.expiresAt > Date.now()) {
    return cachedMarkup.value;
  }
  const row = await prisma.setting.findUnique({ where: { key: MARKUP_KEY } });
  const value = row ? Number(row.value) : config.defaultMarkupPercent;
  cachedMarkup = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function setMarkupPercent(percent: number): Promise<number> {
  if (!Number.isFinite(percent) || percent < 0 || percent > 500) {
    throw new Error("markupPercent must be a number between 0 and 500");
  }
  await prisma.setting.upsert({
    where: { key: MARKUP_KEY },
    update: { value: String(percent) },
    create: { key: MARKUP_KEY, value: String(percent) },
  });
  cachedMarkup = { value: percent, expiresAt: Date.now() + CACHE_TTL_MS };
  return percent;
}
