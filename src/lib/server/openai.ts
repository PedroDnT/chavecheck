import { ApiError } from "./guard";

export function realtimeModel() {
  return process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-2.1";
}

export function liveModel() {
  return process.env.OPENAI_LIVE_MODEL?.trim() || "gpt-live-1";
}

export function textModel() {
  return process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-6-luna";
}

export function textModelOptions() {
  const model = textModel();
  // Preserve the prior text model's effective effort and short voice-response budget.
  return { model, ...(/^gpt-6-luna(?:-|$)/.test(model) ? { reasoning: { effort: "none" as const } } : {}) };
}

export function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function openAIRequest(path: "/responses" | "/realtime/calls" | "/live/sessions", body: BodyInit, json = true, signal?: AbortSignal, timeoutMs = 45_000) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ApiError(503, "Configure a chave da OpenAI no servidor para usar a IA.");
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, ...(json ? { "Content-Type": "application/json" } : {}) },
      body,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(502, "A conexão com a OpenAI não foi concluída. Confira sua conexão e tente novamente.");
  }
  if (!response.ok) {
    // Never forward provider bodies: they can contain request content or key metadata.
    await response.body?.cancel();
    if (response.status === 429) throw new ApiError(429, "A OpenAI atingiu um limite de uso ou de saldo. Confira o projeto e tente novamente.");
    if ([401, 403].includes(response.status)) throw new ApiError(503, "A chave ou o projeto da OpenAI não autorizou esta operação. Confira a configuração do servidor.");
    if (response.status === 400 || response.status === 404) throw new ApiError(502, "A OpenAI recusou a configuração da solicitação. Confira o modelo e o acesso do projeto.");
    throw new ApiError(502, "A OpenAI está indisponível no momento. Tente novamente.");
  }
  return response;
}

export function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new ApiError(502, "A OpenAI retornou uma resposta inválida.");
  const value = payload as { status?: string; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
  if (value.status && value.status !== "completed") throw new ApiError(502, "A resposta da IA ficou incompleta. Tente com uma solicitação menor.");
  const result = value.output?.filter(item => item.type === "message")
    .flatMap(item => item.content ?? [])
    .filter(item => item.type === "output_text" && typeof item.text === "string")
    .map(item => item.text).join("\n").trim();
  if (!result) throw new ApiError(502, "A IA não retornou uma resposta utilizável. Reformule a solicitação.");
  return result;
}
