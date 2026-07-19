import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across the app (and across
// tsx watch reloads in dev) to avoid exhausting Postgres connections.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (config_isDev()) {
  global.__prisma = prisma;
}

function config_isDev() {
  return process.env.NODE_ENV !== "production";
}
