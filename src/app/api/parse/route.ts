import { z } from "zod";
import { ApiError, assertSameOrigin, errorResponse, noStoreHeaders, rateLimit, readJson } from "@/lib/server/guard";
import { extractOutputText, openAIRequest, textModel } from "@/lib/server/openai";
import { extractionInstructions, extractionJsonSchema, extractionSchema } from "@/lib/server/extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ input: z.string().trim().min(10).max(30_000) }).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "parse", 10);
    const { input } = await readJson(request, schema, 100_000);
    const response = await openAIRequest("/responses", JSON.stringify({
      model: textModel(),
      store: false,
      instructions: extractionInstructions,
      input: [{ role: "user", content: input }],
      text: { format: { type: "json_schema", name: "inspection_checklist", strict: true, schema: extractionJsonSchema } },
      max_output_tokens: 7_000,
    }), true, request.signal);
    let raw: unknown;
    try { raw = JSON.parse(extractOutputText(await response.json())); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, "A IA não retornou uma extração válida. Tente novamente ou use o exemplo editável.");
    }
    const result = extractionSchema.safeParse(raw);
    if (!result.success) throw new ApiError(502, "A extração contém campos inválidos. Tente novamente ou use o exemplo editável.");
    const items = result.data.items.map((item, index) => ({
      ...item,
      id: `item-${index + 1}`,
      source: input.includes(item.source) ? item.source : "Trecho de origem não localizado literalmente. Revise o texto original antes de confirmar.",
    }));
    return Response.json({ items }, { headers: noStoreHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
