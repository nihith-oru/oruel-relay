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
    const data: any = await spheronRequest("/api/gpu-offers", {
      query: {
        page: page as string,
        limit: limit as string,
        search: search as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as string,
        instanceType: instanceType as string,
      },
    });

    // Post-process the response before it goes back to the caller. Two things
    // happen here, both of which are relay-layer polish over what Spheron
    // returns directly:
    //
    //  (1) Nested instanceType filter. Spheron's `?instanceType=DEDICATED`
    //      filter operates at the GROUP level: it returns any GPU model group
    //      whose offers[] contains at least one DEDICATED offer, but the
    //      nested offers array still includes the group's SPOT and CLUSTER
    //      offers too. Left unpatched, a customer asking for DEDICATED could
    //      pick up a SPOT offerId from the response and get billed for a
    //      preemption. Filter the offers[] inside each group to only those
    //      matching the requested type, and drop groups that end up empty.
    //
    //  (2) Region backfill. Spheron's live /api/gpu-offers response omits a
    //      top-level `region` on each offer (only `clusters`, an array of
    //      cluster identifiers, is present). POST /api/deployments requires a
    //      single `region` string, so a customer browsing offers has to guess
    //      one from clusters[0]. Do that once, here, so `region` is always
    //      populated the way our OpenAPI spec (GpuOffer.region) promises.
    const wantedType =
      typeof instanceType === "string" && instanceType.trim() !== ""
        ? instanceType.toUpperCase()
        : null;

    if (Array.isArray(data?.data)) {
      for (const group of data.data) {
        if (!Array.isArray(group?.offers)) continue;

        if (wantedType) {
          group.offers = group.offers.filter(
            (o: any) =>
              typeof o?.instanceType === "string" &&
              o.instanceType.toUpperCase() === wantedType
          );
        }

        for (const offer of group.offers) {
          if (
            offer &&
            (offer.region === undefined ||
              offer.region === null ||
              offer.region === "") &&
            Array.isArray(offer.clusters) &&
            offer.clusters.length > 0
          ) {
            offer.region = offer.clusters[0];
          }
        }
      }

      if (wantedType) {
        data.data = data.data.filter(
          (g: any) => Array.isArray(g?.offers) && g.offers.length > 0
        );
      }
    }

    const markupPercent = await getMarkupPercent();
    const marked = applyMarkup(data, markupPercent);

    res.locals.relayMeta = { search, instanceType, markupPercent };
    res.json(marked);
  } catch (err) {
    next(err);
  }
});