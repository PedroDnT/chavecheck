import { z } from "zod";
import { ApiError, assertSameOrigin, errorResponse, noStoreHeaders, rateLimit, readJson } from "@/lib/server/guard";
import { liveModel, openAIRequest, textModelOptions } from "@/lib/server/openai";
import { realtimeTools } from "@/lib/server/prompts";
import { compactLiveStartupContext, liveBackendInstructions, liveGreeting, liveVoiceInstructions } from "@/lib/server/live-prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  sdp: z.string().min(10).max(65_536).refine(value => value.startsWith("v=0")),
  context: z.string().max(40_000),
}).strict();

const answerSchema = z.object({
  session: z.object({ id: z.string().min(1).max(256) }),
  transport: z.object({
    type: z.literal("webrtc"),
    sdp: z.string().min(10).max(100_000).refine(value => value.startsWith("v=0")),
  }),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "live", 6);
    const { sdp, context } = await readJson(request, schema, 128_000);
    const response = await openAIRequest("/live/sessions", JSON.stringify({
      session: {
        model: liveModel(),
        instructions: liveVoiceInstructions,
        store: false,
        audio: { output: { voice: "bossa" } },
        input: [
          { type: "message", role: "developer", content: [{ type: "input_text", text: liveGreeting }] },
          { type: "message", role: "user", content: [{ type: "input_text", text: compactLiveStartupContext(context) }] },
        ],
        delegation: {
          type: "responses",
          responses: {
            ...textModelOptions(),
            instructions: liveBackendInstructions(context),
            tools: realtimeTools,
            tool_choice: "auto",
            parallel_tool_calls: false,
            max_output_tokens: 1_200,
          },
        },
      },
      transport: { type: "webrtc", sdp },
    }), true, request.signal);

    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new ApiError(502, "A conexão de áudio recebeu uma resposta inválida."); }
    const answer = answerSchema.safeParse(payload);
    if (!answer.success) throw new ApiError(502, "A conexão de áudio recebeu uma resposta inválida.");
    // The allowlisted schema strips upstream fields, credentials, and configuration.
    return Response.json(answer.data, { headers: noStoreHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
