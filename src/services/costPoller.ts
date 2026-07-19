import { prisma } from "../db";
import { spheronRequest } from "../spheron/client";
import { config } from "../config";

/**
 * Keeps DeploymentRecord.status / spheronTotalCostUsd fresh for the
 * dashboard even when nobody is actively calling GET /api/deployments/:id
 * through the relay (which also refreshes on read). Without this, a
 * long-running instance that Podstack never re-polls would show a stale
 * $0 cost on the Oru'el dashboard.
 */
export function startCostPoller() {
  const tick = async () => {
    try {
      const active = await prisma.deploymentRecord.findMany({
        where: { status: { in: ["running", "deploying"] } },
      });

      for (const record of active) {
        try {
          const live: any = await spheronRequest(
            `/api/deployments/${record.spheronDeploymentId}`
          );
          await prisma.deploymentRecord.update({
            where: { id: record.id },
            data: {
              status: live.status,
              spheronHourlyRate: live.originalHourlyRate ?? live.hourlyRate ?? record.spheronHourlyRate,
              spheronTotalCostUsd: live.totalCost ?? record.spheronTotalCostUsd,
              terminatedAt: live.stoppedAt ? new Date(live.stoppedAt) : record.terminatedAt,
            },
          });
        } catch (err) {
          console.error(`[costPoller] failed to refresh ${record.spheronDeploymentId}`, err);
        }
      }
    } catch (err) {
      console.error("[costPoller] tick failed", err);
    }
  };

  void tick();
  setInterval(tick, config.costPollIntervalMs);
}
