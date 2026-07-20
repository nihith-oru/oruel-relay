import { Router } from "express";
import { spheronRequest } from "../../spheron/client";

export const sshKeysRouter = Router();

// SSH keys have no pricing, so no markup applies here - straight passthrough.
// v1 limitation: keys are not scoped per-client the way deployments are (see
// README). Every key lives in Oru'el's single Spheron account/team.

sshKeysRouter.get("/", async (req, res, next) => {
  try {
    const data = await spheronRequest("/api/ssh-keys");
    res.json(data);
  } catch (err) {
    next(err);
  }
});

sshKeysRouter.post("/", async (req, res, next) => {
  try {
    const { teamId, ...rest } = req.body ?? {};
    const data = await spheronRequest("/api/ssh-keys", { method: "POST", body: rest });
    res.locals.relayMeta = { name: rest.name };
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

sshKeysRouter.get("/:id", async (req, res, next) => {
  try {
    const data = await spheronRequest(`/api/ssh-keys/${req.params.id}`);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

sshKeysRouter.delete("/:id", async (req, res, next) => {
  try {
    const data = await spheronRequest(`/api/ssh-keys/${req.params.id}`, { method: "DELETE" });
    res.json(data);
  } catch (err) {
    next(err);
  }
});
