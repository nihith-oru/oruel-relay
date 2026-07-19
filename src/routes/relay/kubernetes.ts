import { Router } from "express";
import { spheronRequest } from "../../spheron/client";

export const kubernetesRouter = Router();

// GET /api/kubernetes/versions
kubernetesRouter.get("/versions", async (req, res, next) => {
  try {
    const data = await spheronRequest("/api/kubernetes/versions", {
      query: { provider: req.query.provider as string },
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/kubernetes/:clusterId/health
// Note: cluster IDs are opaque UUIDs only known to whoever provisioned the
// cluster, so this is not independently ownership-checked against our
// DeploymentRecord table (v1 limitation - see README "Known limitations").
kubernetesRouter.get("/:clusterId/health", async (req, res, next) => {
  try {
    const data = await spheronRequest(`/api/kubernetes/${req.params.clusterId}/health`);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
