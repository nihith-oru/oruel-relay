import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { prisma } from "../db";

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      client?: { id: string; name: string; spendCapUsd: number | null };
    }
  }
}

/**
 * Every route under /api/* (the surface Podstack calls) is protected by
 * this. Podstack sends: X-API-Key: <key we issued them>.
 */
export async function requireClientApiKey(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const rawKey = req.header("X-API-Key");
  if (!rawKey) {
    return res.status(401).json({
      error: "Missing X-API-Key header",
      code: "UNAUTHORIZED",
    });
  }

  const keyHash = hashApiKey(rawKey);
  const client = await prisma.client.findUnique({ where: { apiKeyHash: keyHash } });

  if (!client || !client.active || client.revokedAt) {
    return res.status(401).json({
      error: "Invalid or revoked API key",
      code: "UNAUTHORIZED",
    });
  }

  req.client = {
    id: client.id,
    name: client.name,
    spendCapUsd: client.spendCapUsd,
  };
  next();
}
