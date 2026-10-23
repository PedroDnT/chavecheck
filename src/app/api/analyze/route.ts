import { analyzeRequestSchema } from "@/lib/visual-analysis";
import { assertSameOrigin, errorResponse, noStoreHeaders, rateLimit, readJson } from "@/lib/server/guard";
import { visualAnalysisService } from "@/lib/server/visual-analysis";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "visual-analysis", 12);
    const data = await readJson(request, analyzeRequestSchema, 13_000_000);
    const analysis = await visualAnalysisService.analyze(data, request.signal);
    return Response.json({ analysis }, { headers: noStoreHeaders });
  } catch (error) { return errorResponse(error); }
}
