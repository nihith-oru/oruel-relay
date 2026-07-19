import { Router } from "express";
import { requestLogger } from "../../middleware/requestLogger";
import { providersRouter } from "./providers";
import { gpuOffersRouter } from "./gpuOffers";
import { deploymentsRouter } from "./deployments";
import { kubernetesRouter } from "./kubernetes";
import { sshKeysRouter } from "./sshKeys";
import { volumesRouter } from "./volumes";

export const relayRouter = Router();

// Client auth already ran in server.ts (before rate limiting, so the
// limiter can key off req.client.id). This just wires up logging.
relayRouter.use(requestLogger);

relayRouter.use("/providers", providersRouter);
relayRouter.use("/gpu-offers", gpuOffersRouter);
relayRouter.use("/deployments", deploymentsRouter);
relayRouter.use("/kubernetes", kubernetesRouter);
relayRouter.use("/ssh-keys", sshKeysRouter);
relayRouter.use("/volumes", volumesRouter);

// Deliberately NOT relayed: /api/balance and /api/teams. Those expose
// Oru'el's own Spheron account balance and team membership, which is
// internal business information, not something Podstack should ever see.
// If Podstack needs a "how much have I spent" number, that's served from
// our own DeploymentRecord/RequestLog data via the admin dashboard, or a
// future scoped /api/usage endpoint - not Spheron's raw balance endpoint.
