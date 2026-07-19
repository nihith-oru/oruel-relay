import { Request, Response, NextFunction } from "express";
import { SpheronApiError } from "../spheron/client";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof SpheronApiError) {
    return res.status(err.status).json(err.body);
  }
  console.error("[relay] unhandled error:", err);
  res.status(500).json({ error: "Internal relay error", code: "INTERNAL_ERROR" });
}
