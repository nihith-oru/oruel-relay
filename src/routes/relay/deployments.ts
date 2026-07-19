import { Router } from "express";
import { spheronRequest } from "../../spheron/client";
import { applyMarkup } from "../../markup";
import { getMarkupPercent } from "../../services/settingsService";
import { prisma } from "../../db";

export const deploymentsRouter = Router();

// POST /api/deployments - launch a GPU instance.
// teamId is stripped: that's Oru'el's own Spheron team structure and must
// never be set by a downstream caller.
deploymentsRouter.post("/", async (req, res, next) => {
  try {
    const { teamId, ...rest } = req.body ?? {};
    const created: any = await spheronRequest("/api/deployments", {
      method: "POST",
      body: rest,
    });

    await prisma.deploymentRecord.create({
      data: {
        clientId: req.client!.id,
        spheronDeploymentId: created.id,
        name: created.name ?? null,
        provider: created.providerId,
        gpuType: created.gpuType,
        offerId: created.offerId,
        region: created.region,
        instanceType: created.instanceType,
        status: created.status,
        spheronHourlyRate: created.originalHourlyRate ?? created.hourlyRate ?? 0,
        spheronTotalCostUsd: created.totalCost ?? 0,
      },
    });

    const markupPercent = await getMarkupPercent();
    res.locals.relayMeta = {
      offerId: rest.offerId,
      provider: rest.provider,
      gpuType: rest.gpuType,
      gpuCount: rest.gpuCount,
      region: rest.region,
      spheronDeploymentId: created.id,
    };
    res.status(201).json(applyMarkup(created, markupPercent));
  } catch (err) {
    next(err);
  }
});

// GET /api/deployments - only this client's own deployments, never Oru'el's
// whole Spheron fleet (which may include other Podstack-equivalent partners).
deploymentsRouter.get("/", async (req, res, next) => {
  try {
    const { status } = req.query;
    const own = await prisma.deploymentRecord.findMany({
      where: {
        clientId: req.client!.id,
        ...(status && status !== "all"
          ? status === "active"
            ? { status: { in: ["running", "deploying"] } }
            : status === "inactive"
            ? { status: { in: ["terminated", "failed", "terminated-provider"] } }
            : { status: String(status) }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const markupPercent = await getMarkupPercent();
    const result = own.map((d) =>
      applyMarkup(
        {
          id: d.spheronDeploymentId,
          name: d.name,
          providerId: d.provider,
          gpuType: d.gpuType,
          offerId: d.offerId,
          region: d.region,
          instanceType: d.instanceType,
          status: d.status,
          hourlyRate: d.spheronHourlyRate,
          totalCost: d.spheronTotalCostUsd,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          terminatedAt: d.terminatedAt,
        },
        markupPercent
      )
    );

    res.locals.relayMeta = { count: result.length, status };
    res.json(result);
  } catch (err) {
    next(err);
  }
});

async function requireOwnedDeployment(clientId: string, spheronDeploymentId: string) {
  const record = await prisma.deploymentRecord.findUnique({
    where: { spheronDeploymentId },
  });
  if (!record || record.clientId !== clientId) return null;
  return record;
}

// GET /api/deployments/:id - live detail, refreshed from Spheron and cached.
deploymentsRouter.get("/:id", async (req, res, next) => {
  try {
    const record = await requireOwnedDeployment(req.client!.id, req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Deployment not found", code: "NOT_FOUND" });
    }

    const live: any = await spheronRequest(`/api/deployments/${req.params.id}`);

    await prisma.deploymentRecord.update({
      where: { spheronDeploymentId: req.params.id },
      data: {
        status: live.status,
        spheronHourlyRate: live.originalHourlyRate ?? live.hourlyRate ?? record.spheronHourlyRate,
        spheronTotalCostUsd: live.totalCost ?? record.spheronTotalCostUsd,
        terminatedAt: live.stoppedAt ? new Date(live.stoppedAt) : record.terminatedAt,
      },
    });

    const markupPercent = await getMarkupPercent();
    res.locals.relayMeta = { spheronDeploymentId: req.params.id, status: live.status };
    res.json(applyMarkup(live, markupPercent));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/deployments/:id - rename only (per Spheron's own update rules).
deploymentsRouter.patch("/:id", async (req, res, next) => {
  try {
    const record = await requireOwnedDeployment(req.client!.id, req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Deployment not found", code: "NOT_FOUND" });
    }
    const updated: any = await spheronRequest(`/api/deployments/${req.params.id}`, {
      method: "PATCH",
      body: { name: req.body?.name },
    });
    await prisma.deploymentRecord.update({
      where: { spheronDeploymentId: req.params.id },
      data: { name: updated.name },
    });
    const markupPercent = await getMarkupPercent();
    res.locals.relayMeta = { spheronDeploymentId: req.params.id, action: "rename" };
    res.json(applyMarkup(updated, markupPercent));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/deployments/:id - terminate.
deploymentsRouter.delete("/:id", async (req, res, next) => {
  try {
    const record = await requireOwnedDeployment(req.client!.id, req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Deployment not found", code: "NOT_FOUND" });
    }
    const result: any = await spheronRequest(`/api/deployments/${req.params.id}`, {
      method: "DELETE",
    });
    await prisma.deploymentRecord.update({
      where: { spheronDeploymentId: req.params.id },
      data: { status: "terminated", terminatedAt: new Date() },
    });
    res.locals.relayMeta = { spheronDeploymentId: req.params.id, action: "terminate" };
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/deployments/:id/can-terminate - passthrough, no pricing involved.
deploymentsRouter.get("/:id/can-terminate", async (req, res, next) => {
  try {
    const record = await requireOwnedDeployment(req.client!.id, req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Deployment not found", code: "NOT_FOUND" });
    }
    const data = await spheronRequest(`/api/deployments/${req.params.id}/can-terminate`);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
