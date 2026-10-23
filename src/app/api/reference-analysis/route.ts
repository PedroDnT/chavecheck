import { referenceRequestSchema } from "@/lib/visual-analysis";
import { assertSameOrigin, errorResponse, noStoreHeaders, rateLimit, readJson } from "@/lib/server/guard";
import { visualAnalysisService } from "@/lib/server/visual-analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "reference-analysis", 12);
    const data = await readJson(request, referenceRequestSchema, 4_000);
    const baselines = await visualAnalysisService.references(data.references, request.signal);
    return Response.json({ baselines }, { headers: noStoreHeaders });
  } catch (error) { return errorResponse(error); }
}
