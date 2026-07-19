import { config } from "../config";

export class SpheronApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Spheron API error (${status})`);
    this.status = status;
    this.body = body;
  }
}

export interface SpheronRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/**
 * Thin wrapper around the Spheron AI REST API (https://docs.spheron.ai/api-reference).
 * This is the ONLY place Oru'el's real Spheron API key is used. Every relay
 * route calls through here rather than talking to Spheron directly, so the
 * key never leaks into logs, responses, or downstream callers.
 */
export async function spheronRequest<T = unknown>(
  path: string,
  opts: SpheronRequestOptions = {}
): Promise<T> {
  const url = new URL(path, config.spheronBaseUrl);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${config.spheronApiKey}`,
      "Content-Type": "application/json",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const json = text ? safeJsonParse(text) : undefined;

  if (!res.ok) {
    throw new SpheronApiError(res.status, json ?? text);
  }

  return json as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
