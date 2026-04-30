// Unified HTTP client. Centralizes base URL, JSON encoding, and error envelopes.

import { runtimeConfig } from "../runtimeConfig";

export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export class ApiError extends Error {
  status: number;
  envelope: ErrorEnvelope;

  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.message || `HTTP ${status}`);
    this.status = status;
    this.envelope = envelope;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const DEFAULT_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

function joinUrl(base: string, path: string): string {
  if (!base) return path;
  if (base.endsWith("/") && path.startsWith("/")) return base + path.slice(1);
  if (!base.endsWith("/") && !path.startsWith("/")) return `${base}/${path}`;
  return base + path;
}

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.append(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}

export async function apiFetch<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const { body, query, headers, ...rest } = options;
  const url = joinUrl(runtimeConfig.apiBaseUrl, path) + buildQuery(query);

  const init: RequestInit = {
    ...rest,
    headers: { ...DEFAULT_HEADERS, ...(headers || {}) },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new ApiError(0, {
      code: "network_error",
      message: error instanceof Error ? error.message : "Network error",
    });
  }

  const text = await response.text();
  const parsed = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const envelope: ErrorEnvelope =
      parsed && typeof parsed === "object" && parsed !== null && "code" in parsed
        ? (parsed as ErrorEnvelope)
        : { code: "http_error", message: response.statusText };
    throw new ApiError(response.status, envelope);
  }

  return parsed as TResponse;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const apiClient = {
  get: <T>(path: string, query?: RequestOptions["query"]) =>
    apiFetch<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body }),
};
