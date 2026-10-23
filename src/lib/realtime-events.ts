export type RealtimeMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

/** Realtime rejects client item IDs longer than 32 characters. */
export function createConversationItemId(): string {
  return `msg_${crypto.randomUUID().replaceAll("-", "").slice(0, 28)}`;
}

export type InspectionToolCall =
  | { name: "request_photo_capture"; args: { itemId: string; reason: string } }
  | {
      name: "propose_observation";
      args: {
        itemId: string;
        note: string;
        status: "conforme" | "divergencia" | "inconclusivo";
      };
    }
  | { name: "get_inspection_context"; args: Record<string, never> };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseToolCall(name: unknown, rawArguments: unknown): InspectionToolCall {
  if (typeof rawArguments !== "string") throw new Error("Argumentos ausentes.");
  const args: unknown = JSON.parse(rawArguments);
  if (!isRecord(args)) throw new Error("Argumentos inválidos.");
  if (name === "get_inspection_context") return { name, args: {} };
  if (typeof args.itemId !== "string" || !args.itemId || args.itemId.length > 120) {
    throw new Error("Informe o identificador de um item da vistoria.");
  }
  if (name === "request_photo_capture" && typeof args.reason === "string") {
    return { name, args: { itemId: args.itemId, reason: args.reason.slice(0, 2000) } };
  }
  if (
    name === "propose_observation" &&
    typeof args.note === "string" &&
    (args.status === "conforme" || args.status === "divergencia" || args.status === "inconclusivo")
  ) {
    return {
      name,
      args: { itemId: args.itemId, note: args.note.slice(0, 4000), status: args.status },
    };
  }
  throw new Error("Ferramenta ou argumentos não permitidos.");
}

export function updateTranscript(
  messages: RealtimeMessage[],
  id: string,
  role: RealtimeMessage["role"],
  text: string,
  append = false,
): RealtimeMessage[] {
  const index = messages.findIndex((message) => message.id === id);
  if (index < 0) return [...messages, { id, role, text }];
  return messages.map((message, i) =>
    i === index ? { ...message, text: append ? message.text + text : text } : message,
  );
}
