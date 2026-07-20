import { Router } from "express";
import { getMarkupPercent, setMarkupPercent } from "../../services/settingsService";

export const adminSettingsRouter = Router();

adminSettingsRouter.get("/markup", async (_req, res, next) => {
  try {
    const markupPercent = await getMarkupPercent();
    res.json({ markupPercent });
  } catch (err) {
    next(err);
  }
});

// Real-time adjustment: takes effect on the next relay request (within a
// few seconds, per the settings cache TTL) with no restart needed.
adminSettingsRouter.put("/markup", async (req, res, next) => {
  try {
    const markupPercent = await setMarkupPercent(Number(req.body?.markupPercent));
    res.json({ markupPercent });
  } catch (err) {
    next(err);
  }
});
