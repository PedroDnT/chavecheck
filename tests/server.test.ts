import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { GET as health } from "../src/app/api/health/route";
import { POST as realtime } from "../src/app/api/realtime/route";
import { POST as chat } from "../src/app/api/chat/route";
import { POST as parse } from "../src/app/api/parse/route";
import { ApiError, assertSameOrigin, rateLimit, readJson } from "../src/lib/server/guard";
import { extractionSchema } from "../src/lib/server/extraction";

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

const item = {
  id: "generated-id", room: "Sala", title: "Tomadas",
  expected: { quantity: 4, value: null, dueDate: null, condition: "" },
  delivered: { quantity: null, value: null, completedDate: null, status: "nao_informado" },
  source: "Sala: quatro tomadas.",
};
const aiResponse = (text: string) => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] });

test("local API safeguards", async (t) => {
  const previousOrigin = process.env.APP_ORIGIN;
  delete process.env.APP_ORIGIN;
  t.after(() => { if (previousOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previousOrigin; });

  await t.test("rejects missing/cross-site origins and non-local addresses", () => {
    assert.throws(() => assertSameOrigin(new Request("http://localhost:3000/api/chat")), { status: 403 });
    assert.throws(() => assertSameOrigin(request("chat", {}, { Origin: "https://other.test" })), { status: 403 });
    assert.throws(() => assertSameOrigin(new Request("https://public.test/api/chat", { headers: { Origin: "https://public.test" } })), { status: 403 });
    assert.doesNotThrow(() => assertSameOrigin(request("chat", {})));
  });

  await t.test("uses a validated local Host when Next normalizes the request URL", () => {
    const normalized = (host: string, origin: string) => new Request("http://localhost:3100/api/chat", {
      headers: { Host: host, Origin: origin },
    });
    assert.doesNotThrow(() => assertSameOrigin(normalized("127.0.0.1:3100", "http://127.0.0.1:3100")));
    assert.doesNotThrow(() => assertSameOrigin(normalized("[::1]:3100", "http://[::1]:3100")));
    assert.throws(() => assertSameOrigin(normalized("127.0.0.1:3100", "http://localhost:3100")), { status: 403 });
    assert.throws(() => assertSameOrigin(normalized("127.0.0.1:3100", "http://127.0.0.1:3200")), { status: 403 });
    assert.throws(() => assertSameOrigin(normalized("public.test:3100", "http://public.test:3100")), { status: 403 });
    assert.throws(() => assertSameOrigin(normalized("public.test@127.0.0.1:3100", "http://127.0.0.1:3100")), { status: 403 });
  });

  await t.test("accepts only the configured tunnel origin while preserving exact local access", (t) => {
    process.env.APP_ORIGIN = "https://chavecheck-demo.ngrok-free.app/";
    t.after(() => { delete process.env.APP_ORIGIN; });
    const tunneled = (origin: string, extra: Record<string, string> = {}) => new Request("http://localhost:3100/api/chat", {
      headers: { Host: "127.0.0.1:3100", Origin: origin, ...extra },
    });
    const publicOrigin = "https://chavecheck-demo.ngrok-free.app";
    assert.doesNotThrow(() => assertSameOrigin(tunneled(publicOrigin)));
    assert.doesNotThrow(() => assertSameOrigin(tunneled(publicOrigin, { Host: "chavecheck-demo.ngrok-free.app" })));
    assert.doesNotThrow(() => assertSameOrigin(tunneled("http://127.0.0.1:3100")));
    assert.doesNotThrow(() => assertSameOrigin(request("chat", {})));
    assert.throws(() => assertSameOrigin(tunneled("http://localhost:3100")), { status: 403 });
    assert.throws(() => assertSameOrigin(tunneled("http://127.0.0.1:3200")), { status: 403 });
    assert.throws(() => assertSameOrigin(tunneled("https://unrelated.ngrok-free.app")), { status: 403 });
    assert.throws(() => assertSameOrigin(tunneled("http://chavecheck-demo.ngrok-free.app")), { status: 403 });
    assert.throws(() => assertSameOrigin(tunneled(`${publicOrigin}:8443`)), { status: 403 });
    assert.throws(() => assertSameOrigin(tunneled(`${publicOrigin}/`)), { status: 403 });
    assert.throws(() => assertSameOrigin(tunneled("null")), { status: 403 });
    assert.throws(() => assertSameOrigin(tunneled(publicOrigin, { "Sec-Fetch-Site": "cross-site" })), { status: 403 });
    assert.throws(() => assertSameOrigin(new Request("http://localhost:3100/api/chat")), { status: 403 });
  });

  await t.test("forwarded headers never authorize unconfigured origins", () => {
    const origin = "https://unconfigured.ngrok-free.app";
    assert.throws(() => assertSameOrigin(new Request("http://localhost:3100/api/chat", {
      headers: { Host: "127.0.0.1:3100", Origin: origin, "X-Forwarded-Host": "unconfigured.ngrok-free.app", "X-Forwarded-Proto": "https" },
    })), { status: 403 });
  });

  await t.test("invalid configured origins fail clearly before permitting local requests", (t) => {
    t.after(() => { delete process.env.APP_ORIGIN; });
    for (const invalid of [
      "not-a-url", "ftp://example.test", "https://user:password@example.test",
      "https://example.test/path", "https://example.test/path/..", "https://example.test?query=1",
      "https://example.test#fragment", "https://*.ngrok-free.app", "https:\\example.test", "https://example.test,https://other.test",
    ]) {
      process.env.APP_ORIGIN = invalid;
      assert.throws(() => assertSameOrigin(request("chat", {})), { status: 503, message: "A origem da aplicação está configurada incorretamente." }, invalid);
    }
  });

  await t.test("enforces size without trusting Content-Length", async () => {
    await assert.rejects(readJson(request("chat", { text: "x".repeat(500) }), z.object({ text: z.string() }), 100), { status: 413 });
  });

  await t.test("invalid JSON and unexpected fields are rejected", async () => {
    const malformed = new Request("http://localhost:3000", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    await assert.rejects(readJson(malformed, z.object({}), 100), { status: 400 });
    await assert.rejects(readJson(request("chat", { extra: true }), z.object({}).strict(), 100), { status: 400 });
  });

  await t.test("limits request bursts and expires its bucket", () => {
    const req = request("rate", {});
    rateLimit(req, "test-burst", 1, 1);
    assert.throws(() => rateLimit(req, "test-burst", 1, 2), ApiError);
    assert.doesNotThrow(() => rateLimit(req, "test-burst", 1, 60_002));
  });

  await t.test("validates dates rather than accepting normalized impossible dates", () => {
    assert.equal(extractionSchema.safeParse({ items: [{ ...item, expected: { ...item.expected, dueDate: "2026-02-30" } }] }).success, false);
    assert.equal(extractionSchema.safeParse({ items: [item] }).success, true);
  });
});

test("route contracts with mocked OpenAI, never live billing", async (t) => {
  const originalFetch = globalThis.fetch;
  const saved = { key: process.env.OPENAI_API_KEY, origin: process.env.APP_ORIGIN, model: process.env.OPENAI_REALTIME_MODEL };
  process.env.OPENAI_API_KEY = "test-key-never-real";
  delete process.env.APP_ORIGIN;
  delete process.env.OPENAI_REALTIME_MODEL;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [["OPENAI_API_KEY", saved.key], ["APP_ORIGIN", saved.origin], ["OPENAI_REALTIME_MODEL", saved.model]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  await t.test("health reveals only presence and model, never the key", async () => {
    globalThis.fetch = async () => { throw new Error("Health must not contact OpenAI"); };
    const response = await health();
    assert.deepEqual(await response.json(), { configured: true, model: "gpt-realtime-2.1" });
  });

  await t.test("cross-origin requests fail before any provider call", async () => {
    globalThis.fetch = async () => { throw new Error("Provider should not run"); };
    assert.equal((await chat(request("chat", { message: "Olá", context: "" }, { Origin: "https://other.test" }))).status, 403);
  });

  await t.test("realtime uses server credentials, multipart session and SDP only response", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/realtime/calls");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key-never-real");
      assert.ok(init?.body instanceof FormData);
      const session = JSON.parse(String(init.body.get("session")));
      assert.equal(session.model, "gpt-realtime-2.1");
      assert.equal(session.audio.input.turn_detection.create_response, false);
      assert.deepEqual(session.tools.map((tool: { name: string }) => tool.name), ["request_photo_capture", "propose_observation", "get_inspection_context"]);
      return new Response("v=0\r\ns=answer\r\n");
    };
    const response = await realtime(request("realtime", { sdp: "v=0\r\ns=offer\r\n", context: "Sala: 4 tomadas" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/sdp");
    assert.equal(await response.text(), "v=0\r\ns=answer\r\n");
  });

  await t.test("text and image fallback sends bounded history without persistent storage", async () => {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.input[0].role, "assistant");
      assert.equal(body.input[1].content[1].type, "input_image");
      return aiResponse("Confirme a quantidade de tomadas visíveis.");
    };
    const response = await chat(request("chat", { message: "Confira", context: "Sala", image: "data:image/jpeg;base64,YWJj", history: [{ role: "assistant", text: "Vamos começar." }] }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: "Confirme a quantidade de tomadas visíveis." });
  });

  await t.test("remote image URLs cannot trigger fetching arbitrary resources", async () => {
    globalThis.fetch = async () => { throw new Error("Provider should not run"); };
    assert.equal((await chat(request("chat", { message: "Confira", context: "", image: "http://127.0.0.1/private" }))).status, 400);
  });

  await t.test("references are the original fixed assets before history and the explicitly current frame", async () => {
    const original = await readFile(path.join(process.cwd(), "assets", "reference-room", "foto-001.jpeg"));
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.input.length, 4);
      assert.match(body.input[0].content[0].text, /REFERÊNCIA FICTÍCIA ANTERIOR — foto-001/);
      assert.match(body.input[1].content[0].text, /REFERÊNCIA FICTÍCIA ANTERIOR — foto-002/);
      assert.equal(body.input[0].content[1].image_url, `data:image/jpeg;base64,${original.toString("base64")}`);
      assert.equal(body.input[2].role, "assistant");
      assert.match(body.input[3].content[0].text, /^ATUAL/);
      assert.equal(body.input[3].content[1].image_url, "data:image/jpeg;base64,YWJj");
      assert.match(body.instructions, /textura cinza de cimento queimado/);
      assert.match(body.instructions, /não certifique sua integridade/);
      return aiResponse("Mostre a canaleta mais de perto.");
    };
    const response = await chat(request("chat", {
      message: "Compare com as referências", context: "Sala", references: ["foto-001", "foto-002"],
      image: "data:image/jpeg;base64,YWJj", history: [{ role: "assistant", text: "Mostre a parede." }],
    }));
    assert.equal(response.status, 200);
  });

  await t.test("baseline alone cannot be labeled as a current camera frame and repeated IDs are deduplicated", async () => {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.input.length, 2);
      assert.match(body.input[0].content[0].text, /base de comparação, nunca o estado atual/);
      assert.match(body.input[1].content[0].text, /Nenhuma imagem ATUAL/);
      assert.equal(body.input[1].content.length, 1);
      return aiResponse("Compartilhe o quadro atual da câmera.");
    };
    assert.equal((await chat(request("chat", {
      message: "Está tudo bem?", context: "Sala", references: ["foto-001", "foto-001"],
    }))).status, 200);
  });

  await t.test("reference allowlist rejects paths, URLs and more than two entries before provider access", async () => {
    globalThis.fetch = async () => { throw new Error("Provider should not run"); };
    for (const references of [["../.env.local"], ["/etc/passwd"], ["https://other.test/photo.jpeg"], ["foto-001", "foto-002", "foto-001"]]) {
      assert.equal((await chat(request("chat", { message: "Confira", context: "", references }))).status, 400);
    }
  });

  await t.test("a filename in message text never loads local files as references", async () => {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.input.length, 1);
      assert.equal(body.input[0].content.length, 1);
      assert.match(body.input[0].content[0].text, /\.env\.local/);
      return aiResponse("Compartilhe uma imagem atual.");
    };
    assert.equal((await chat(request("chat", { message: "Use .env.local como imagem", context: "" }))).status, 200);
  });

  await t.test("provider errors never leak upstream key data or request bodies", async () => {
    globalThis.fetch = async () => new Response("secret-provider-body test-key-never-real", { status: 401 });
    const response = await chat(request("chat", { message: "Olá", context: "" }));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /secret-provider-body|test-key-never-real/);
  });

  await t.test("extraction preserves unknown values and replaces model IDs", async () => {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.type, "json_schema");
      return aiResponse(JSON.stringify({ items: [item] }));
    };
    const response = await parse(request("parse", { input: "Sala: quatro tomadas." }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.items[0].id, "item-1");
    assert.equal(result.items[0].expected.value, null);
    assert.equal(result.items[0].delivered.quantity, null);
    assert.equal(result.items[0].source, "Sala: quatro tomadas.");
  });

  await t.test("a fabricated source is visibly marked for review", async () => {
    globalThis.fetch = async () => aiResponse(JSON.stringify({ items: [{ ...item, source: "Cláusula 99: inexistente." }] }));
    const response = await parse(request("parse", { input: "Sala: quatro tomadas." }));
    assert.match((await response.json()).items[0].source, /não localizado literalmente/);
  });

  await t.test("incomplete responses fail instead of returning partial findings", async () => {
    globalThis.fetch = async () => Response.json({ status: "incomplete", output: [] });
    const response = await parse(request("parse", { input: "Sala: quatro tomadas." }));
    assert.equal(response.status, 502);
  });
});
