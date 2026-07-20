import path from "path";
import fs from "fs";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import yaml from "js-yaml";
import { rateLimit } from "express-rate-limit";
import { config } from "./config";
import { relayRouter } from "./routes/relay";
import { adminApiRouter } from "./routes/admin";
import { errorHandler } from "./middleware/errorHandler";
import { startCostPoller } from "./services/costPoller";
import { requireClientApiKey } from "./middleware/clientAuth";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(cors({
  origin: [config.baseUrl, "http://localhost:4000", "http://localhost:3000"],
  credentials: true,
}));

// --- API documentation for Podstack (public, no auth needed to read docs) ---
const openapiSpec = yaml.load(
  fs.readFileSync(path.join(__dirname, "..", "openapi", "openapi.yaml"), "utf8")
) as Record<string, unknown>;
app.get("/docs/openapi.json", (_req, res) => res.json(openapiSpec));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: "Oru'el GPU Relay API",
}));

// Mirrors Spheron's own published limits (250 req / 15 min general,
// 10 req / 15 min for deployment creation) so Podstack sees the same
// shape of throttling either way. Per-client (not per-IP) since Podstack
// itself is the one identifiable caller.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 250,
  keyGenerator: (req) => req.client?.id ?? req.ip ?? "anonymous",
  standardHeaders: true,
  legacyHeaders: false,
});
const deployLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.client?.id ?? req.ip ?? "anonymous",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== "POST",
});

// --- Public relay surface, consumed by Podstack ---
// Auth runs first so downstream rate limiters can key by client id rather
// than raw IP (Podstack calls us from a small set of server IPs).
app.use("/api", requireClientApiKey);
app.use("/api/deployments", deployLimiter);
app.use("/api", generalLimiter, relayRouter);

// --- Internal Oru'el admin dashboard ---
app.use("/admin/api", adminApiRouter);
app.use("/admin", express.static(path.join(__dirname, "..", "public")));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Oru'el <-> Spheron relay listening on :${config.port}`);
  console.log(`Dashboard: http://localhost:${config.port}/admin`);
});

startCostPoller();
