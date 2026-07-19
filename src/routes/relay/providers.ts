import { Router } from "express";
import { spheronRequest } from "../../spheron/client";

export const providersRouter = Router();

// GET /api/providers - no pricing data, nothing to mark up, straight passthrough.
providersRouter.get("/", async (req, res, next) => {
  try {
    const data = await spheronRequest("/api/providers");
    res.json(data);
  } catch (err) {
    next(err);
  }
});
