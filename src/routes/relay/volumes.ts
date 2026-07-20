import { Router } from "express";
import { spheronRequest } from "../../spheron/client";
import { applyMarkup } from "../../markup";
import { getMarkupPercent } from "../../services/settingsService";

export const volumesRouter = Router();

// IMPORTANT: static/specific sub-paths (pricing, regions) must be registered
// before the "/:volumeId" catch-all routes below, or Express will try to
// treat "pricing"/"regions" as a volumeId.

volumesRouter.get("/pricing", async (req, res, next) => {
  try {
    const data: any = await spheronRequest("/api/volumes/pricing", {
      query: {
        provider: req.query.provider as string,
        cloudId: req.query.cloudId as string,
        region: req.query.region as string,
      },
    });
    const markupPercent = await getMarkupPercent();
    res.json(applyMarkup(data, markupPercent));
  } catch (err) {
    next(err);
  }
});

volumesRouter.get("/regions", async (req, res, next) => {
  try {
    const data = await spheronRequest("/api/volumes/regions", {
      query: { provider: req.query.provider as string },
    });
    const markupPercent = await getMarkupPercent();
    res.json(applyMarkup(data, markupPercent));
  } catch (err) {
    next(err);
  }
});

volumesRouter.get("/", async (req, res, next) => {
  try {
    const data = await spheronRequest("/api/volumes", {
      query: {
        page: req.query.page as string,
        limit: req.query.limit as string,
        status: req.query.status as string,
      },
    });
    const markupPercent = await getMarkupPercent();
    res.json(applyMarkup(data, markupPercent));
  } catch (err) {
    next(err);
  }
});

volumesRouter.post("/", async (req, res, next) => {
  try {
    const { teamId, ...rest } = req.body ?? {};
    const data = await spheronRequest("/api/volumes", { method: "POST", body: rest });
    res.locals.relayMeta = { provider: rest.provider, sizeInGb: rest.sizeInGb };
    const markupPercent = await getMarkupPercent();
    res.status(201).json(applyMarkup(data, markupPercent));
  } catch (err) {
    next(err);
  }
});

volumesRouter.get("/:volumeId", async (req, res, next) => {
  try {
    const data = await spheronRequest(`/api/volumes/${req.params.volumeId}`);
    const markupPercent = await getMarkupPercent();
    res.json(applyMarkup(data, markupPercent));
  } catch (err) {
    next(err);
  }
});

volumesRouter.patch("/:volumeId", async (req, res, next) => {
  try {
    const data = await spheronRequest(`/api/volumes/${req.params.volumeId}`, {
      method: "PATCH",
      body: req.body,
    });
    const markupPercent = await getMarkupPercent();
    res.json(applyMarkup(data, markupPercent));
  } catch (err) {
    next(err);
  }
});

volumesRouter.delete("/:volumeId", async (req, res, next) => {
  try {
    const data = await spheronRequest(`/api/volumes/${req.params.volumeId}`, {
      method: "DELETE",
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

volumesRouter.post("/:volumeId/attach", async (req, res, next) => {
  try {
    const data = await spheronRequest(`/api/volumes/${req.params.volumeId}/attach`, {
      method: "POST",
      body: req.body,
    });
    res.locals.relayMeta = { volumeId: req.params.volumeId, action: "attach" };
    res.json(data);
  } catch (err) {
    next(err);
  }
});

volumesRouter.post("/:volumeId/detach", async (req, res, next) => {
  try {
    const data = await spheronRequest(`/api/volumes/${req.params.volumeId}/detach`, {
      method: "POST",
      body: req.body,
    });
    res.locals.relayMeta = { volumeId: req.params.volumeId, action: "detach" };
    res.json(data);
  } catch (err) {
    next(err);
  }
});
