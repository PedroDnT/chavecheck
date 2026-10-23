import { z } from "zod";
import { ApiError, assertSameOrigin, errorResponse, noStoreHeaders, rateLimit, readJson } from "@/lib/server/guard";
import { openAIRequest, realtimeModel } from "@/lib/server/openai";
import { instructionsWithContext, realtimeTools } from "@/lib/server/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  sdp: z.string().min(10).max(65_536).refine(value => value.startsWith("v=0")),
  context: z.string().max(40_000),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "realtime", 6);
    const { sdp, context } = await readJson(request, schema, 128_000);
    const form = new FormData();
    form.set("sdp", sdp);
    form.set("session", JSON.stringify({
      type: "realtime",
      model: realtimeModel(),
      instructions: instructionsWithContext(context),
      output_modalities: ["audio"],
      max_output_tokens: 900,
      audio: {
        input: {
          transcription: { model: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe", language: "pt" },
          turn_detection: { type: "semantic_vad", eagerness: "medium", create_response: false, interrupt_response: true },
        },
        output: { voice: "marin" },
      },
      tools: realtimeTools,
      tool_choice: "auto",
    }));
    const response = await openAIRequest("/realtime/calls", form, false, request.signal);
    const answer = await response.text();
    if (!answer.startsWith("v=0") || answer.length > 100_000) throw new ApiError(502, "A conexão de áudio recebeu uma resposta inválida.");
    return new Response(answer, { status: 200, headers: { ...noStoreHeaders, "Content-Type": "application/sdp" } });
  } catch (error) {
    return errorResponse(error);
  }
}
