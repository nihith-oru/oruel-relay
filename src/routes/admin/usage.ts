import { Router } from "express";
import { prisma } from "../../db";
import { getMarkupPercent } from "../../services/settingsService";

export const adminUsageRouter = Router();

adminUsageRouter.get("/overview", async (_req, res, next) => {
  try {
    const markupPercent = await getMarkupPercent();
    const factor = 1 + markupPercent / 100;

    const [totalRequests, totalClients, activeClients, deployments, requestsLast24h] =
      await Promise.all([
        prisma.requestLog.count(),
        prisma.client.count(),
        prisma.client.count({ where: { active: true } }),
        prisma.deploymentRecord.findMany({
          select: { spheronTotalCostUsd: true, status: true },
        }),
        prisma.requestLog.count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
      ]);

    const spheronCostUsd = deployments.reduce((s, d) => s + d.spheronTotalCostUsd, 0);
    const billedCostUsd = spheronCostUsd * factor;
    const activeDeployments = deployments.filter((d) =>
      ["running", "deploying"].includes(d.status)
    ).length;

    res.json({
      markupPercent,
      totalRequests,
      requestsLast24h,
      totalClients,
      activeClients,
      totalDeployments: deployments.length,
      activeDeployments,
      spheronCostUsd: round(spheronCostUsd),
      billedCostUsd: round(billedCostUsd),
      marginUsd: round(billedCostUsd - spheronCostUsd),
    });
  } catch (err) {
    next(err);
  }
});

adminUsageRouter.get("/requests", async (req, res, next) => {
  try {
    const { clientId, path, limit } = req.query;
    const take = Math.min(Number(limit ?? 100), 500);
    const logs = await prisma.requestLog.findMany({
      where: {
        ...(clientId ? { clientId: String(clientId) } : {}),
        ...(path ? { path: { contains: String(path) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: { client: { select: { name: true } } },
    });
    res.json(
      logs.map((l) => ({
        id: l.id,
        clientId: l.clientId,
        clientName: l.client.name,
        method: l.method,
        path: l.path,
        statusCode: l.statusCode,
        durationMs: l.durationMs,
        createdAt: l.createdAt,
        metadata: l.metadata,
      }))
    );
  } catch (err) {
    next(err);
  }
});

adminUsageRouter.get("/deployments", async (req, res, next) => {
  try {
    const { clientId, status } = req.query;
    const markupPercent = await getMarkupPercent();
    const factor = 1 + markupPercent / 100;

    const rows = await prisma.deploymentRecord.findMany({
      where: {
        ...(clientId ? { clientId: String(clientId) } : {}),
        ...(status ? { status: String(status) } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    });

    res.json(
      rows.map((d) => ({
        id: d.id,
        spheronDeploymentId: d.spheronDeploymentId,
        clientId: d.clientId,
        clientName: d.client.name,
        name: d.name,
        provider: d.provider,
        gpuType: d.gpuType,
        region: d.region,
        instanceType: d.instanceType,
        status: d.status,
        spheronHourlyRate: d.spheronHourlyRate,
        billedHourlyRate: round(d.spheronHourlyRate * factor),
        spheronTotalCostUsd: round(d.spheronTotalCostUsd),
        billedTotalCostUsd: round(d.spheronTotalCostUsd * factor),
        marginUsd: round(d.spheronTotalCostUsd * factor - d.spheronTotalCostUsd),
        createdAt: d.createdAt,
        terminatedAt: d.terminatedAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

adminUsageRouter.get("/by-client", async (_req, res, next) => {
  try {
    const markupPercent = await getMarkupPercent();
    const factor = 1 + markupPercent / 100;

    const clients = await prisma.client.findMany({
      select: {
        id: true,
        name: true,
        active: true,
        _count: { select: { requests: true, deployments: true } },
        deployments: { select: { spheronTotalCostUsd: true, status: true } },
      },
    });

    res.json(
      clients.map((c) => {
        const spheronCostUsd = c.deployments.reduce((s, d) => s + d.spheronTotalCostUsd, 0);
        return {
          clientId: c.id,
          name: c.name,
          active: c.active,
          requestCount: c._count.requests,
          deploymentCount: c._count.deployments,
          activeDeployments: c.deployments.filter((d) =>
            ["running", "deploying"].includes(d.status)
          ).length,
          spheronCostUsd: round(spheronCostUsd),
          billedCostUsd: round(spheronCostUsd * factor),
          marginUsd: round(spheronCostUsd * factor - spheronCostUsd),
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
