import { Request, Response, NextFunction } from "express";
import { logRequest } from "../services/usageLogger";

/**
 * Mounted after requireClientApiKey. Routes can attach extra context via
 * `res.locals.relayMeta = { gpuType, provider, ... }` before responding;
 * this middleware picks it up once the response finishes and writes one
 * RequestLog row per call, without slowing down the response itself.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    if (!req.client) return; // unauthenticated calls (e.g. failed auth) aren't attributable
    void logRequest({
      clientId: req.client.id,
      method: req.method,
      path: req.baseUrl + req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      metadata: {
        query: req.query,
        ...(res.locals.relayMeta ?? {}),
      },
    });
  });
  next();
}
