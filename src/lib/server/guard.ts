import { createHash } from "node:crypto";
import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Bucket = { count: number; expiresAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  let publicOrigin: string | undefined;
  if (configuredOrigin) {
    try {
      const configured = new URL(configuredOrigin);
      if (
        !/^https?:\/\/[^/?#\\\s]+\/?$/i.test(configuredOrigin) ||
        configured.username || configured.password || configured.hostname.includes("*") ||
        configured.pathname !== "/" || configured.search || configured.hash
      ) throw new Error("Expected a single HTTP(S) origin");
      publicOrigin = configured.origin;
    } catch {
      throw new ApiError(503, "A origem da aplicação está configurada incorretamente.");
    }
  }
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Origem da solicitação não permitida.");
  }
  // A tunnel can leave request.url normalized to localhost. Only the explicitly
  // configured public origin is trusted; forwarded headers do not grant access.
  if (publicOrigin && origin === publicOrigin) return;

  // Keep local testing available alongside the tunnel. Next can also normalize
  // 127.0.0.1 to localhost, so validate the actual local Host and its exact port.
  const host = request.headers.get("host") || url.host;
  let destination: URL;
  try {
    destination = new URL(`${url.protocol}//${host}`);
  } catch {
    throw new ApiError(403, "Endereço da solicitação não permitido.");
  }
  if (
    !["http:", "https:"].includes(destination.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname) ||
    destination.host !== host.toLowerCase() || destination.username || destination.password ||
    destination.pathname !== "/" || destination.search || destination.hash
  ) {
    throw new ApiError(403, "Endereço não configurado. Use o acesso local ou o endereço definido em APP_ORIGIN.");
  }
  if (origin !== destination.origin) {
    throw new ApiError(403, "Origem da solicitação não permitida.");
  }
}

export function rateLimit(request: Request, scope: string, limit: number, now = Date.now()) {
  for (const [key, value] of buckets) if (value.expiresAt <= now) buckets.delete(key);
  // Direct local Next.js requests do not expose a trustworthy remote IP.
  // Trust a forwarding header only behind an explicitly configured trusted proxy.
  const address = process.env.TRUST_PROXY === "true"
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
    : "local";
  const identity = createHash("sha256").update(address).digest("hex").slice(0, 24);
  const keys = [{ key: `${scope}:${identity}`, max: limit }, { key: "global", max: 120 }];
  for (const { key, max } of keys) {
    if ((buckets.get(key)?.count ?? 0) >= max) {
      throw new ApiError(429, "Muitas solicitações. Aguarde um minuto antes de tentar novamente.");
    }
  }
  for (const { key } of keys) {
    const current = buckets.get(key);
    buckets.set(key, { count: (current?.count ?? 0) + 1, expiresAt: current?.expiresAt ?? now + WINDOW_MS });
  }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>, maxBytes: number): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Envie os dados como JSON.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new ApiError(413, "O conteúdo enviado excede o limite permitido.");
  if (!request.body) throw new ApiError(400, "Os dados da solicitação estão ausentes.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "O conteúdo enviado excede o limite permitido.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "Não foi possível ler o JSON enviado.");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new ApiError(400, "Dados inválidos. Confira os campos e o tamanho do conteúdo enviado.");
  return result.data;
}

export function errorResponse(error: unknown): Response {
  const known = error instanceof ApiError;
  return Response.json(
    { error: known ? error.message : "Não foi possível concluir a solicitação. Tente novamente." },
    { status: known ? error.status : 500, headers: { "Cache-Control": "no-store", ...(known && error.status === 429 ? { "Retry-After": "60" } : {}) } },
  );
}

export const noStoreHeaders = { "Cache-Control": "no-store" };
