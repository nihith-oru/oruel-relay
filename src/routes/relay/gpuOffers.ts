import { Router } from "express";
import { spheronRequest } from "../../spheron/client";
import { applyMarkup } from "../../markup";
import { getMarkupPercent } from "../../services/settingsService";

export const gpuOffersRouter = Router();

// GET /api/gpu-offers - the main catalog Podstack (and its customers) browse.
// We intentionally call Spheron WITHOUT authentication ourselves here, so
// Podstack only ever sees Oru'el's base pricing + Oru'el's markup, never any
// team-specific Spheron discount Oru'el might separately negotiate.
gpuOffersRouter.get("/", async (req, res, next) => {
  try {
    const { page, limit, search, sortBy, sortOrder, instanceType } = req.query;
    const data = await spheronRequest("/api/gpu-offers", {
      query: {
        page: page as string,
        limit: limit as string,
        search: search as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as string,
        instanceType: instanceType as string,
      },
    });

    const markupPercent = await getMarkupPercent();
    const marked = applyMarkup(data, markupPercent);

    res.locals.relayMeta = { search, instanceType, markupPercent };
    res.json(marked);
  } catch (err) {
    next(err);
  }
});
