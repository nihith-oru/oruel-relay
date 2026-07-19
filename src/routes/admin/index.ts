import { Router } from "express";
import { adminAuthRouter } from "./auth";
import { adminClientsRouter } from "./clients";
import { adminSettingsRouter } from "./settings";
import { adminUsageRouter } from "./usage";
import { adminOffersRouter } from "./offers";
import { requireAdmin } from "../../middleware/adminAuth";

export const adminApiRouter = Router();

// Login/logout/me are public-ish (login has no prior session by definition).
adminApiRouter.use("/auth", adminAuthRouter);

// Everything else requires an authenticated Oru'el admin session.
adminApiRouter.use("/clients", requireAdmin, adminClientsRouter);
adminApiRouter.use("/settings", requireAdmin, adminSettingsRouter);
adminApiRouter.use("/usage", requireAdmin, adminUsageRouter);
adminApiRouter.use("/offers", requireAdmin, adminOffersRouter);
