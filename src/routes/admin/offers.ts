import { Router } from "express";
import { spheronRequest } from "../../spheron/client";
import { applyMarkup } from "../../markup";
import { getMarkupPercent } from "../../services/settingsService";

export const adminOffersRouter = Router();

/**
 * Admin-only view of the full live GPU catalog, both as Spheron actually
 * returns it (raw, using Oru'el's real authenticated key - so this also
 * includes any Spheron team discount Oru'el has negotiated) and as Podstack
 * will see it through the relay (markup applied). This is the "what are we
 * actually exposing" screen.
 */
adminOffersRouter.get("/", async (req, res, next) => {
  try {
    const { search, instanceType, limit } = req.query;
    const raw: any = await spheronRequest("/api/gpu-offers", {
      query: {
        page: "1",
        limit: (limit as string) ?? "100",
        search: search as string,
        instanceType: instanceType as string,
        sortBy: "popularity",
        sortOrder: "desc",
      },
    });

    const markupPercent = await getMarkupPercent();
    const billed = applyMarkup(raw, markupPercent);

    res.json({
      markupPercent,
      total: raw.total,
      // Flattened, side-by-side comparison per individual offer (not just per GPU model).
      offers: flattenAndCompare(raw, billed),
    });
  } catch (err) {
    next(err);
  }
});

function flattenAndCompare(raw: any, billed: any) {
  const rows: any[] = [];
  const rawGroups = raw.data ?? [];
  const billedGroups = billed.data ?? [];

  for (let i = 0; i < rawGroups.length; i++) {
    const rg = rawGroups[i];
    const bg = billedGroups[i];
    for (let j = 0; j < (rg.offers ?? []).length; j++) {
      const ro = rg.offers[j];
      const bo = bg.offers[j];
      rows.push({
        gpuType: rg.gpuType,
        gpuModel: rg.gpuModel,
        provider: ro.provider,
        offerId: ro.offerId,
        region: ro.region,
        instanceType: ro.instanceType,
        vcpus: ro.vcpus,
        memory: ro.memory,
        storage: ro.storage,
        gpuCount: ro.gpuCount,
        available: ro.available,
        spheronRawPrice: ro.price,
        spheronDiscountedPrice: ro.discountedPrice ?? null,
        podstackSeesPrice: bo.price,
        podstackSeesDiscountedPrice: bo.discountedPrice ?? null,
        marginPerHour: round(bo.price - ro.price),
      });
    }
  }
  return rows;
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
