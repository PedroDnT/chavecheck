import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assertSameOrigin, errorResponse, noStoreHeaders, rateLimit, readJson } from "@/lib/server/guard";
import { extractOutputText, openAIRequest, textModel } from "@/lib/server/openai";
import { instructionsWithContext } from "@/lib/server/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const imageSchema = z.string().max(4_200_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  .refine(value => Buffer.byteLength(value.slice(value.indexOf(",") + 1), "base64") <= 3_000_000);
const schema = z.object({
  message: z.string().trim().min(1).max(6_000),
  context: z.string().max(40_000),
  image: imageSchema.optional(),
  references: z.array(z.enum(["foto-001", "foto-002"])).max(2).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6_000) }).strict()).max(16).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "chat", 30);
    const { message, context, image, history, references } = await readJson(request, schema, 4_500_000);
    // The enum selects fixed project assets. Never resolve a path/URL supplied by the caller.
    const referenceInput = await Promise.all([...new Set(references ?? [])].map(async (id) => {
      const file = id === "foto-001" ? "foto-001.jpeg" : "foto-002.jpeg";
      const bytes = await readFile(path.join(process.cwd(), "assets", "reference-room", file));
      return {
        role: "user",
        content: [
          { type: "input_text", text: `REFERÊNCIA FICTÍCIA ANTERIOR — ${id}. Esta foto mostra a base de comparação, nunca o estado atual. Não aprova itens nem comprova ausência de avarias. Compare apenas quando receber uma imagem marcada ATUAL.` },
          { type: "input_image", image_url: `data:image/jpeg;base64,${bytes.toString("base64")}`, detail: "auto" },
        ],
      };
    }));
    const content: Array<Record<string, string>> = [{
      type: "input_text",
      text: image
        ? `ATUAL — quadro da câmera compartilhado agora. Compare-o com as referências anteriores, se houver. É uma amostra visual, sem aprovação de evidência.\nMensagem do usuário: ${message}`
        : `Nenhuma imagem ATUAL foi anexada a esta mensagem. As referências anteriores não mostram a câmera atual.\nMensagem do usuário: ${message}`,
    }];
    if (image) content.push({ type: "input_image", image_url: image, detail: "auto" });
    const response = await openAIRequest("/responses", JSON.stringify({
      model: textModel(),
      store: false,
      instructions: instructionsWithContext(context),
      input: [
        ...referenceInput,
        ...(history ?? []).map(entry => ({ role: entry.role, content: entry.text })),
        { role: "user", content },
      ],
      max_output_tokens: 1_200,
    }), true, request.signal);
    return Response.json({ text: extractOutputText(await response.json()) }, { headers: noStoreHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
