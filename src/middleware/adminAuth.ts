import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { prisma } from "../db";

export const ADMIN_COOKIE = "oruel_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(adminId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.adminSession.create({ data: { token, adminId, expiresAt } });
  return { token, expiresAt };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminId?: string;
    }
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated", code: "UNAUTHORIZED" });
  }
  const session = await prisma.adminSession.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    return res.status(401).json({ error: "Session expired", code: "UNAUTHORIZED" });
  }
  req.adminId = session.adminId;
  next();
}
