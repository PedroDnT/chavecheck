import { isConfigured, realtimeModel } from "@/lib/server/openai";
import { noStoreHeaders } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ configured: isConfigured(), model: realtimeModel() }, { headers: noStoreHeaders });
}
