import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../../db";
import { hashApiKey } from "../../middleware/clientAuth";

export const adminClientsRouter = Router();

function generateRawApiKey(): string {
  // e.g. oruel_live_9f2c1a...  - easy to spot in logs/dashboards, hard to guess.
  return `oruel_live_${crypto.randomBytes(24).toString("hex")}`;
}

adminClientsRouter.get("/", async (_req, res, next) => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        apiKeyPrefix: true,
        active: true,
        spendCapUsd: true,
        createdAt: true,
        revokedAt: true,
        _count: { select: { deployments: true, requests: true } },
      },
    });
    res.json(clients);
  } catch (err) {
    next(err);
  }
});

// Create a new client (e.g. "Podstack - Production"). Returns the raw API
// key exactly once - only the hash is stored, so it cannot be recovered
// later. If it's lost, revoke and issue a new one.
adminClientsRouter.post("/", async (req, res, next) => {
  try {
    const { name, spendCapUsd } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }

    const rawKey = generateRawApiKey();
    const client = await prisma.client.create({
      data: {
        name,
        apiKeyHash: hashApiKey(rawKey),
        apiKeyPrefix: rawKey.slice(0, 18),
        spendCapUsd: spendCapUsd ?? null,
      },
    });

    res.status(201).json({
      id: client.id,
      name: client.name,
      apiKey: rawKey, // shown ONLY on creation
      apiKeyPrefix: client.apiKeyPrefix,
    });
  } catch (err) {
    next(err);
  }
});

adminClientsRouter.post("/:id/revoke", async (req, res, next) => {
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { active: false, revokedAt: new Date() },
    });
    res.json({ ok: true, client });
  } catch (err) {
    next(err);
  }
});

adminClientsRouter.post("/:id/reactivate", async (req, res, next) => {
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { active: true, revokedAt: null },
    });
    res.json({ ok: true, client });
  } catch (err) {
    next(err);
  }
});

// Rotate a client's key: revokes the old hash, issues a brand new raw key.
adminClientsRouter.post("/:id/rotate", async (req, res, next) => {
  try {
    const rawKey = generateRawApiKey();
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        apiKeyHash: hashApiKey(rawKey),
        apiKeyPrefix: rawKey.slice(0, 18),
        active: true,
        revokedAt: null,
      },
    });
    res.json({ id: client.id, apiKey: rawKey, apiKeyPrefix: client.apiKeyPrefix });
  } catch (err) {
    next(err);
  }
});

adminClientsRouter.patch("/:id/spend-cap", async (req, res, next) => {
  try {
    const { spendCapUsd } = req.body ?? {};
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { spendCapUsd: spendCapUsd === null ? null : Number(spendCapUsd) },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});
