import { prisma } from "../db";

// Fields we never want sitting in the usage log even in summarized form.
const SENSITIVE_KEYS = new Set([
  "publicKey",
  "ssh_public_key",
  "authentication_config_b64",
  "kubeconfig",
  "privateKey",
]);

export function redact(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(redact);
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return obj;
}

export async function logRequest(params: {
  clientId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  metadata?: unknown;
}) {
  try {
    await prisma.requestLog.create({
      data: {
        clientId: params.clientId,
        method: params.method,
        path: params.path,
        statusCode: params.statusCode,
        durationMs: params.durationMs,
        metadata: (redact(params.metadata) as any) ?? undefined,
      },
    });
  } catch (err) {
    // Usage logging must never break the actual relay response.
    console.error("[usageLogger] failed to write log", err);
  }
}
