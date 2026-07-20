import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../db";
import { createSession, ADMIN_COOKIE, requireAdmin } from "../../middleware/adminAuth";
import { config } from "../../config";

export const adminAuthRouter = Router();

adminAuthRouter.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const admin = await prisma.adminUser.findUnique({ where: { username } });
    if (!admin) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { token, expiresAt } = await createSession(admin.id);
    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.nodeEnv === "production",
      expires: expiresAt,
    });
    res.json({ ok: true, username: admin.username });
  } catch (err) {
    next(err);
  }
});

adminAuthRouter.post("/logout", requireAdmin, async (req, res, next) => {
  try {
    const token = req.cookies?.[ADMIN_COOKIE];
    if (token) {
      await prisma.adminSession.delete({ where: { token } }).catch(() => undefined);
    }
    res.clearCookie(ADMIN_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.nodeEnv === "production",
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminAuthRouter.get("/me", requireAdmin, async (req, res, next) => {
  try {
    const admin = await prisma.adminUser.findUnique({ where: { id: req.adminId! } });
    res.json({ username: admin?.username });
  } catch (err) {
    next(err);
  }
});
