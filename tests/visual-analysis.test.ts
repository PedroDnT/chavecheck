import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { POST as analyzeRoute } from "../src/app/api/analyze/route";
import { POST as referenceRoute } from "../src/app/api/reference-analysis/route";
import { analyzeRequestSchema, referenceRequestSchema, regionSchema, type AnalyzeRequest, type ReferenceAnalysis } from "../src/lib/visual-analysis";
import { BASELINE_PROMPT_VERSION, REFERENCE_IDENTITY_VERSION, createVisualAnalysisService, groundVisualResult } from "../src/lib/server/visual-analysis";
import { openAIRequest } from "../src/lib/server/openai";

const region = { x: 0.1, y: 0.1, width: 0.6, height: 0.5 };
const inventory = {
  lighting: "Luz lateral da janela", sharpness: "Textura distinguível",
  apparentColors: ["Cinza na captura"], limitations: ["Parte inferior oculta pelo móvel"],
  observations: [{ label: "Acabamento da parede", description: "Textura irregular de cimento queimado", kind: "finish", region }],
};
const baseline: ReferenceAnalysis = {
  ...inventory, id: "baseline-example", referenceId: "foto-001", sha256: "a".repeat(64),
  model: "test-model", promptVersion: BASELINE_PROMPT_VERSION, createdAt: "2026-10-23T12:00:00.000Z",
  observations: [{ ...inventory.observations[0], kind: "finish", id: "foto-001-obs-1" }],
};
const cleanResult = () => ({
  status: "conforme", summary: "Acabamento preservado no trecho verificado.", justification: "A mesma textura está visível nas duas imagens.",
  nextAction: "Enquadre a canaleta inferior.", needsPhoto: false,
  quality: { usable: true, reason: "Textura e limites visíveis", lighting: "Atual mais clara, sem ocultar a textura", sharpness: "Nítida", viewMatch: "same_area" },
  findings: [{
    evidenceId: null,
    title: "Textura da parede", referenceId: "foto-001", referenceObservationId: "foto-001-obs-1", referenceRegion: region,
    currentRegion: region, before: "Texto reescrito pelo modelo", after: "Mesma textura irregular", assessment: "unchanged", reason: "Desenho e acabamento correspondem.",
  }],
  unverified: [] as string[],
});
const input: AnalyzeRequest = {
  evidenceId: "capture-1", item: { id: "wall-1", room: "Sala", title: "Parede", expectedCondition: "  Cimento queimado, sem avaria.  ", source: "Declaração do usuário, não cláusula contratual.\nPreservar literalmente." },
  image: "data:image/jpeg;base64,YWJj", references: ["foto-001"], requestReason: "Confira a textura.",
};
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const previousCapture = () => ({
  evidenceId: "previous-capture", itemId: input.item.id, image: "data:image/jpeg;base64,cHJldmlvdXM=", createdAt: "2026-10-23T12:00:00.000Z",
  requirement: { condition: input.item.expectedCondition, source: input.item.source },
});

test("visual input is bounded and has a fixed reference allowlist", () => {
  assert.equal(analyzeRequestSchema.safeParse(input).success, true);
  assert.equal(analyzeRequestSchema.safeParse({ ...input, references: [] }).success, true);
  assert.equal(analyzeRequestSchema.safeParse({ ...input, image: "https://example.test/image.jpg" }).success, false);
  assert.equal(analyzeRequestSchema.safeParse({ ...input, image: "data:image/svg+xml;base64,YWJj" }).success, false);
  assert.equal(analyzeRequestSchema.safeParse({ ...input, references: ["../.env.local"] }).success, false);
  assert.equal(analyzeRequestSchema.safeParse({ ...input, references: ["foto-001", "foto-002", "foto-001"] }).success, false);
  assert.equal(analyzeRequestSchema.safeParse({ ...input, confidence: 99 }).success, false);
  assert.equal(referenceRequestSchema.safeParse({ references: [] }).success, false);
  assert.equal(regionSchema.safeParse({ ...region, x: 0.7 }).success, false);
  assert.equal(regionSchema.safeParse({ ...region, width: 0 }).success, false);
});

test("support captures must belong to the exact same item and requirement with unique IDs", () => {
  const previous = previousCapture();
  assert.equal(analyzeRequestSchema.safeParse({ ...input, previousEvidence: [previous] }).success, true);
  for (const invalid of [
    { ...previous, itemId: "other-item" },
    { ...previous, evidenceId: input.evidenceId },
    { ...previous, requirement: { ...previous.requirement, source: "Outra fonte" } },
    { ...previous, requirement: { ...previous.requirement, condition: "Outro requisito" } },
    { ...previous, image: "https://example.test/photo.jpg" },
    { ...previous, createdAt: "not-a-date" },
  ]) assert.equal(analyzeRequestSchema.safeParse({ ...input, previousEvidence: [invalid] }).success, false);
  assert.equal(analyzeRequestSchema.safeParse({ ...input, previousEvidence: [previous, previous] }).success, false);
  assert.equal(analyzeRequestSchema.safeParse({ ...input, previousEvidence: [previous, { ...previous, evidenceId: "second" }, { ...previous, evidenceId: "third" }] }).success, false);
});

test("a conclusion uses exact original observations and validates anchors", () => {
  const result = groundVisualResult(cleanResult(), [baseline]);
  assert.equal(result.status, "conforme");
  assert.equal(result.findings[0].before, baseline.observations[0].description);
  assert.deepEqual(result.findings[0].referenceRegion, baseline.observations[0].region);
});

test("finding capture IDs resolve to the actual current or allowed support image", () => {
  const options = { currentEvidenceId: "current", allowedEvidenceIds: ["prior-one"] };
  const current = groundVisualResult(cleanResult(), [baseline], options);
  assert.equal(current.findings[0].evidenceId, "current");
  const raw = cleanResult();
  Object.assign(raw.findings[0], { evidenceId: "prior-one" });
  assert.equal(groundVisualResult(raw, [baseline], options).findings[0].evidenceId, "prior-one");
  Object.assign(raw.findings[0], { evidenceId: "foreign-photo" });
  const rejected = groundVisualResult(raw, [baseline], options);
  assert.equal(rejected.status, "inconclusivo");
  assert.deepEqual(rejected.findings, [], "A foreign capture must never fall back to the principal photo");
  assert.match(rejected.justification, /captura.*não ficou comprovada/);
  assert.match(rejected.unverified.join(" "), /Textura da parede/);
  assert.doesNotMatch(JSON.stringify(rejected), /Mesma textura irregular/, "An observation from an unknown capture must not survive as current evidence");
  assert.equal(rejected.needsPhoto, true);
  assert.equal(groundVisualResult(raw, [baseline]).status, "inconclusivo", "Without a supplied allowlist only null/current legacy findings are accepted");
  const mixed = { ...raw, findings: [...raw.findings, cleanResult().findings[0]] };
  const partlyGrounded = groundVisualResult(mixed, [baseline], options);
  assert.equal(partlyGrounded.status, "inconclusivo");
  assert.equal(partlyGrounded.findings.length, 1, "Valid observations are preserved while the foreign one is excluded");
  assert.equal(partlyGrounded.findings[0].evidenceId, "current");
});

test("invalid IDs, missing regions and fabricated coordinates cannot support a decision", () => {
  for (const mutation of [
    { referenceId: "invented" }, { referenceObservationId: "invented" },
    { referenceRegion: { x: 0, y: 0, width: 0.2, height: 0.2 } },
    { referenceRegion: null }, { currentRegion: null },
    { currentRegion: { x: 0.9, y: 0.1, width: 0.3, height: 0.2 } },
  ]) {
    const raw = cleanResult();
    Object.assign(raw.findings[0], mutation);
    const result = groundVisualResult(raw, [baseline]);
    assert.equal(result.status, "inconclusivo");
    assert.equal(result.findings[0].assessment, "uncertain");
    assert.equal(result.needsPhoto, true);
    assert.ok(result.unverified.length > 0);
  }
});

test("quality failures and unmatched scenes downgrade conclusions with cause-specific guidance", () => {
  for (const quality of [
    { usable: false }, { viewMatch: "different" }, { viewMatch: "unknown" }, { viewMatch: "partial" },
  ]) {
    const raw = cleanResult();
    Object.assign(raw.quality, quality);
    const result = groundVisualResult(raw, [baseline]);
    assert.equal(result.status, "inconclusivo");
    assert.doesNotMatch(result.summary, /preservado/);
    assert.match(result.nextAction, /foto/);
    assert.notEqual(result.nextAction, raw.nextAction);
  }
});

test("poor focus preserves the concrete capture instruction", () => {
  const raw = cleanResult();
  raw.quality.usable = false;
  raw.quality.reason = "Reflexo encobre a tampa da canaleta";
  raw.nextAction = "Desloque a câmera para a esquerda, tire o reflexo da tampa e envie a foto.";
  raw.needsPhoto = true;
  const result = groundVisualResult(raw, [baseline]);
  assert.equal(result.status, "inconclusivo");
  assert.match(result.summary, /Reflexo encobre/);
  assert.equal(result.nextAction, raw.nextAction);
  assert.equal(result.needsPhoto, true);
});

test("a pending operating test preserves observed condition without requiring another photo", () => {
  const raw = cleanResult();
  raw.unverified = ["Funcionamento do ar-condicionado ainda não testado"];
  raw.nextAction = "Acione o equipamento pelo controle e registre se ele responde.";
  raw.needsPhoto = false;
  const result = groundVisualResult(raw, [baseline]);
  assert.equal(result.status, "inconclusivo");
  assert.match(result.summary, /No trecho visível/);
  assert.match(result.summary, /Mesma textura irregular/);
  assert.match(result.summary, /Funcionamento do ar-condicionado/);
  assert.equal(result.nextAction, raw.nextAction);
  assert.equal(result.needsPhoto, false);
  raw.nextAction = "Tire outra foto do equipamento.";
  raw.needsPhoto = true;
  const noPhotoLoop = groundVisualResult(raw, [baseline]);
  assert.equal(noPhotoLoop.needsPhoto, false);
  assert.match(noPhotoLoop.nextAction, /funcionamento pendente/);
});

test("partial views retain located facts and ask for the missing section", () => {
  const raw = cleanResult();
  raw.quality.viewMatch = "partial";
  raw.unverified = ["Trecho da canaleta atrás do armário"];
  raw.nextAction = "Enquadre a canaleta à direita do armário e envie a foto.";
  raw.needsPhoto = true;
  const result = groundVisualResult(raw, [baseline]);
  assert.equal(result.status, "inconclusivo");
  assert.match(result.summary, /No trecho visível/);
  assert.match(result.summary, /Mesma textura irregular/);
  assert.match(result.summary, /Trecho da canaleta atrás/);
  assert.equal(result.nextAction, raw.nextAction);
  assert.equal(result.needsPhoto, true);
});

test("a real missing visual section cannot end with an optional instruction and needsPhoto false", () => {
  for (const status of ["conforme", "inconclusivo"]) {
    const raw = cleanResult();
    raw.status = status;
    raw.quality.viewMatch = "same_area";
    raw.unverified = ["Trechos atrás da mesa e fora do enquadramento não foram vistos; se houver suspeita, verificar depois."];
    raw.nextAction = "Sem ação corretiva. Se desejar checar, envie outra foto.";
    raw.needsPhoto = false;
    const result = groundVisualResult(raw, [baseline]);
    assert.equal(result.status, "inconclusivo");
    assert.equal(result.needsPhoto, true);
    assert.match(result.nextAction, /^Envie uma foto/);
    assert.match(result.nextAction, /atrás da mesa/);
    assert.doesNotMatch(result.nextAction, /se houver|se desejar|sem ação/i);
  }
});

test("partial coverage supports localized divergence but cannot approve the whole requirement", () => {
  const raw = cleanResult();
  raw.status = "divergencia";
  raw.quality.viewMatch = "partial";
  raw.findings[0].assessment = "changed";
  raw.findings[0].after = "Lascado na borda visível";
  raw.unverified = ["Restante da parede fora do enquadramento"];
  assert.equal(groundVisualResult(raw, [baseline]).status, "divergencia");
  raw.status = "conforme";
  raw.findings[0].assessment = "unchanged";
  assert.equal(groundVisualResult(raw, [baseline]).status, "inconclusivo");
});

test("conformity with unresolved essential tests and divergence without a change are blocked", () => {
  const raw = cleanResult();
  raw.unverified = ["Funcionamento do ar-condicionado ainda não testado"];
  assert.equal(groundVisualResult(raw, [baseline]).status, "inconclusivo");
  raw.unverified = [];
  raw.status = "divergencia";
  assert.equal(groundVisualResult(raw, [baseline]).status, "inconclusivo");
  raw.findings = [];
  assert.equal(groundVisualResult(raw, [baseline]).status, "inconclusivo");
});

test("custom requirements without reference photos do not gain fabricated reference links", () => {
  const raw = cleanResult();
  assert.equal(groundVisualResult(raw, []).status, "inconclusivo");
  Object.assign(raw.findings[0], { referenceId: null, referenceObservationId: null, referenceRegion: null });
  const result = groundVisualResult(raw, []);
  assert.equal(result.status, "conforme");
  assert.equal(result.findings[0].referenceId, null);
});

test("provider output bounds reject oversized narratives and unknown fields", () => {
  const raw = cleanResult();
  raw.justification = "x".repeat(1_801);
  assert.throws(() => groundVisualResult(raw, [baseline]), { status: 502 });
  assert.throws(() => groundVisualResult({ ...cleanResult(), confidence: 95 }, [baseline]), { status: 502 });
});

test("inventory and current decisions preserve hash provenance and exact supplied source", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const original = Buffer.from("original-fixed-asset");
  const service = createVisualAnalysisService({
    cacheDir: null, model: () => "test-model", readAsset: async () => original,
    provider: async body => { calls.push(body); return calls.length === 1 ? inventory : cleanResult(); },
  });
  const result = await service.analyze(input);
  assert.equal(result.imageSha256, hash(Buffer.from("abc")));
  assert.equal(result.references[0].sha256, hash(original));
  assert.equal(result.requirement.condition, input.item.expectedCondition);
  assert.equal(result.requirement.source, input.item.source);
  assert.equal(result.evidenceId, input.evidenceId);
  assert.equal(result.itemId, input.item.id);
  assert.equal(calls.length, 2);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.store, false);
    assert.equal(call.reasoning, undefined, "Custom model families must not receive unsupported reasoning options");
    assert.equal(call.max_output_tokens, index === 0 ? 6_500 : 3_200);
    const format = (call.text as { format: { strict: boolean; type: string; schema: { additionalProperties: boolean } } }).format;
    assert.equal(format.strict, true);
    assert.equal(format.type, "json_schema");
    assert.equal(format.schema.additionalProperties, false);
  }
  const sent = calls[1].input as Array<{ content: Array<{ type: string; text?: string; image_url?: string }> }>;
  assert.equal(sent[0].content[1].image_url, `data:image/jpeg;base64,${original.toString("base64")}`);
  assert.equal(sent[1].content[1].image_url, input.image);
  assert.match(sent[1].content[0].text!, /IMAGEM ATUAL/);
  assert.match(String(calls[0].instructions), /lux|cor física/);
  assert.match(String(calls[1].instructions), /Marcas já presentes na referência não são novas/);
  assert.match(String(calls[1].instructions), /MESMO TRECHO físico/);
  assert.match(String(calls[1].instructions), /Parede com a mesma cor ou textura em outro lado do cômodo NÃO é correspondência/);
  assert.match(String(calls[1].instructions), /Não acrescente obrigações sobre interior de aparelhos/);
});

test("current and previous captures are sent separately and each finding retains its source image and hash", async () => {
  const previous = previousCapture();
  const calls: Array<Record<string, unknown>> = [];
  const service = createVisualAnalysisService({
    cacheDir: null, model: () => "test-model", readAsset: async () => Buffer.from("historical-original"),
    provider: async body => {
      calls.push(body);
      if (calls.length === 1) return inventory;
      const raw = cleanResult();
      const supportFinding = { ...raw.findings[0], evidenceId: previous.evidenceId, title: "Trecho coberto na captura anterior" };
      return { ...raw, findings: [raw.findings[0], supportFinding] };
    },
  });
  const result = await service.analyze({ ...input, previousEvidence: [previous] });
  assert.equal(result.result.status, "conforme");
  assert.deepEqual(result.result.findings.map(finding => finding.evidenceId), [input.evidenceId, previous.evidenceId]);
  assert.deepEqual(result.supportingEvidence, [{ evidenceId: previous.evidenceId, sha256: hash(Buffer.from("previous")), createdAt: previous.createdAt }]);
  assert.equal(result.imageSha256, hash(Buffer.from("abc")));
  const sent = calls[1].input as Array<{ content: Array<{ type: string; text?: string; image_url?: string }> }>;
  assert.equal(sent.length, 3);
  assert.match(sent[0].content[0].text!, /FOTO ORIGINAL ANTERIOR/);
  assert.match(sent[1].content[0].text!, /CAPTURA ATUAL ANTERIOR DA MESMA VERIFICAÇÃO/);
  assert.match(sent[1].content[0].text!, /previous-capture/);
  assert.equal(sent[1].content[1].image_url, previous.image);
  assert.match(sent[2].content[0].text!, /CAPTURA PRINCIPAL/);
  assert.equal(sent[2].content[1].image_url, input.image);
  assert.match(String(calls[1].instructions), /CONJUNTO dessas capturas/);
  assert.match(String(calls[1].instructions), /não peça novamente um trecho/);
});

test("visual analysis uses fast Luna comparisons while keeping cached inventories at medium effort", async (t) => {
  const savedVision = process.env.OPENAI_VISION_MODEL;
  const savedText = process.env.OPENAI_TEXT_MODEL;
  delete process.env.OPENAI_VISION_MODEL;
  process.env.OPENAI_TEXT_MODEL = "unrelated-text-model";
  t.after(() => {
    if (savedVision === undefined) delete process.env.OPENAI_VISION_MODEL; else process.env.OPENAI_VISION_MODEL = savedVision;
    if (savedText === undefined) delete process.env.OPENAI_TEXT_MODEL; else process.env.OPENAI_TEXT_MODEL = savedText;
  });
  for (const selected of [undefined, "gpt-6-luna", "gpt-5.4-mini", "custom-vision-model", "gpt-5.40", "gpt-6-lunar"]) {
    if (selected === undefined) delete process.env.OPENAI_VISION_MODEL; else process.env.OPENAI_VISION_MODEL = selected;
    const calls: Array<Record<string, unknown>> = [];
    const service = createVisualAnalysisService({
      cacheDir: null, readAsset: async () => Buffer.from("previous-original"),
      provider: async body => { calls.push(body); return calls.length === 1 ? inventory : cleanResult(); },
    });
    const result = await service.analyze(input);
    const expectedModel = selected ?? "gpt-6-luna";
    assert.equal(result.model, expectedModel);
    assert.equal(result.references[0].model, expectedModel);
    assert.equal(calls.length, 2);
    for (const [index, call] of calls.entries()) {
      assert.equal(call.model, expectedModel);
      assert.equal(call.max_output_tokens, index === 0 ? 6_500 : 3_200);
      if (expectedModel === "gpt-6-luna") assert.deepEqual(call.reasoning, { effort: index === 0 ? "medium" : "none" });
      else if (expectedModel === "gpt-5.4-mini") assert.deepEqual(call.reasoning, { effort: "medium" });
      else assert.equal(call.reasoning, undefined);
    }
  }
});

test("reference warmup runs both inventories concurrently and leaves one model request per current photo", async () => {
  const pending: Array<() => void> = [];
  const names: string[] = [];
  const service = createVisualAnalysisService({
    cacheDir: null, model: () => "gpt-6-luna", readAsset: async id => Buffer.from(id),
    provider: async body => {
      const name = (body.text as { format: { name: string } }).format.name;
      names.push(name);
      if (name === "reference_inventory") {
        await new Promise<void>(resolve => pending.push(resolve));
        return inventory;
      }
      assert.deepEqual(body.reasoning, { effort: "none" });
      assert.match(String(body.instructions), /um a três achados decisivos/);
      const messages = body.input as Array<{ content: Array<{ type: string; detail?: string }> }>;
      assert.ok(messages.every(message => message.content.filter(part => part.type === "input_image").every(image => image.detail === "high")), "Latency improvements preserve the image detail needed for surface defects");
      return cleanResult();
    },
  });
  const warmed = service.references(["foto-001", "foto-002"]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2, "Both reference requests start before either has completed");
  const sharedWarmup = service.references(["foto-001", "foto-002"]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2, "Concurrent screen warmup shares existing inventory work");
  pending.forEach(resolve => resolve());
  await Promise.all([warmed, sharedWarmup]);
  const decision = await service.analyze({ ...input, references: ["foto-001", "foto-002"] });
  assert.equal(decision.result.status, "conforme");
  assert.deepEqual(names, ["reference_inventory", "reference_inventory", "visual_comparison"]);
  await service.analyze({ ...input, evidenceId: "capture-2", references: ["foto-001", "foto-002"] });
  assert.deepEqual(names, ["reference_inventory", "reference_inventory", "visual_comparison", "visual_comparison"]);
});

test("visual inventory and comparison allow more processing time without changing the shared request default", async (t) => {
  const savedFetch = globalThis.fetch;
  const savedTimeout = AbortSignal.timeout;
  const savedKey = process.env.OPENAI_API_KEY;
  const timeouts: number[] = [];
  process.env.OPENAI_API_KEY = "test-key-never-real";
  AbortSignal.timeout = milliseconds => { timeouts.push(milliseconds); return new AbortController().signal; };
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const result = body.text?.format?.name === "reference_inventory" ? inventory : cleanResult();
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] });
  };
  t.after(() => {
    globalThis.fetch = savedFetch;
    AbortSignal.timeout = savedTimeout;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
  });
  await openAIRequest("/responses", JSON.stringify({ model: "test-model" }));
  const service = createVisualAnalysisService({ cacheDir: null, model: () => "test-model", readAsset: async () => Buffer.from("previous-original") });
  await service.analyze(input);
  assert.deepEqual(timeouts, [45_000, 90_000, 90_000]);
});

test("initial inventory keeps localized existing marks and analyzes each original independently", async () => {
  let calls = 0;
  const smallRegion = { x: 0.15, y: 0.72, width: 0.025, height: 0.02 };
  const service = createVisualAnalysisService({
    cacheDir: null, model: () => "test-model", readAsset: async id => Buffer.from(id),
    provider: async body => {
      calls += 1;
      const sent = body.input as Array<{ content: Array<{ type: string; text?: string; image_url?: string }> }>;
      assert.equal(sent.length, 1, "Each original receives a separate inventory");
      assert.equal(sent[0].content.filter(entry => entry.type === "input_image").length, 1);
      assert.match(String(body.instructions), /somente elementos e detalhes que EXISTEM VISUALMENTE NA FOTO/);
      assert.match(String(body.instructions), /Uma pequena marca já visível deve ser uma observação própria/);
      assert.match(String(body.instructions), /Não inclua ressalvas genéricas de objetos ausentes/);
      assert.doesNotMatch(String(body.instructions), /furo circular da mesa|faixa escura na canaleta/);
      return { ...inventory, limitations: [], observations: [{ label: "Marca clara na borda do móvel", description: "Pequeno ponto claro visível na borda frontal", kind: "mark", region: smallRegion }] };
    },
  });
  const records = await service.references(["foto-001", "foto-002"]);
  assert.equal(calls, 2);
  assert.deepEqual(records.map(record => record.referenceId), ["foto-001", "foto-002"]);
  for (const record of records) {
    assert.equal(record.promptVersion, BASELINE_PROMPT_VERSION);
    assert.equal(record.observations[0].kind, "mark");
    assert.deepEqual(record.observations[0].region, smallRegion);
    assert.deepEqual(record.limitations, []);
  }
});

test("invalid baseline regions are not published as located observations", async () => {
  const service = createVisualAnalysisService({
    cacheDir: null, model: () => "test-model", readAsset: async () => Buffer.from("original"),
    provider: async () => ({ ...inventory, observations: [{ ...inventory.observations[0], region: { x: 0, y: 0, width: 9, height: 1 } }] }),
  });
  const result = await service.reference("foto-001");
  assert.equal(result.observations.length, 0);
  assert.match(result.limitations.join(" "), /localizar com segurança/);
});

test("shared inventories survive one caller cancellation and are deduplicated", async () => {
  let calls = 0;
  let complete: ((value: unknown) => void) | undefined;
  const service = createVisualAnalysisService({
    cacheDir: null, model: () => "test-model", readAsset: async () => Buffer.from("original"),
    provider: async (_body, signal) => {
      calls += 1;
      assert.equal(signal, undefined);
      return new Promise(resolve => { complete = resolve; });
    },
  });
  const controller = new AbortController();
  const first = service.reference("foto-001", controller.signal);
  const second = service.reference("foto-001");
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(first, { status: 499 });
  complete!(inventory);
  const record = await second;
  assert.equal(calls, 1);
  record.observations[0].description = "Mutação externa";
  assert.equal((await service.reference("foto-001")).observations[0].description, inventory.observations[0].description);
});

test("disk inventory persists across service restarts and invalidates on model and original changes", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "chavecheck-baseline-test-"));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  let calls = 0;
  let model = "test-model-one";
  let original = "first-original";
  const opts = {
    cacheDir: directory, model: () => model, readAsset: async () => Buffer.from(original),
    provider: async () => { calls += 1; return inventory; },
  };
  const first = await createVisualAnalysisService(opts).reference("foto-001");
  const second = await createVisualAnalysisService(opts).reference("foto-001");
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  model = "test-model-two";
  assert.notEqual((await createVisualAnalysisService(opts).reference("foto-001")).id, first.id);
  original = "second-original";
  assert.notEqual((await createVisualAnalysisService(opts).reference("foto-001")).sha256, first.sha256);
  assert.equal(calls, 3);
});

test("original replacement between inventory and comparison cannot use a stale baseline", async () => {
  let reads = 0;
  let calls = 0;
  const service = createVisualAnalysisService({
    cacheDir: null, model: () => "test-model", readAsset: async () => Buffer.from(++reads === 1 ? "old" : "changed"),
    provider: async () => { calls += 1; return inventory; },
  });
  await assert.rejects(service.analyze(input), { status: 409 });
  assert.equal(calls, 1);
});

test("an exact original reused as current evidence is identified without calling the visual comparator", async () => {
  let calls = 0;
  const original = Buffer.from("exact-original-image-bytes");
  const service = createVisualAnalysisService({
    cacheDir: null, model: () => "test-model", readAsset: async () => original,
    provider: async body => {
      calls += 1;
      const format = (body.text as { format: { name: string } }).format;
      assert.equal(format.name, "reference_inventory", "The comparison provider must never see the reused original");
      return inventory;
    },
  });
  const reusedInput = { ...input, image: `data:image/jpeg;base64,${original.toString("base64")}` };
  const result = await service.analyze(reusedInput);
  assert.equal(calls, 1, "Only the initial inventory is generated");
  assert.equal(result.model, "deterministic-reference-match");
  assert.equal(result.promptVersion, REFERENCE_IDENTITY_VERSION);
  assert.equal(result.imageSha256, hash(original));
  assert.equal(result.references[0].sha256, result.imageSha256);
  assert.equal(result.requirement.source, input.item.source);
  assert.equal(result.evidenceId, input.evidenceId);
  assert.equal(result.result.status, "inconclusivo");
  assert.match(result.result.summary, /mesma imagem da referência anterior/);
  assert.match(result.result.justification, /comparador visual não foi chamado/);
  assert.equal(result.result.needsPhoto, true);
  assert.match(result.result.nextAction, /nova foto do ambiente agora/);
  assert.deepEqual(result.result.findings, []);
  await service.analyze(reusedInput);
  assert.equal(calls, 1, "Repeating the original reuses its inventory and still avoids the comparator");
  const withSupport = await service.analyze({ ...reusedInput, previousEvidence: [previousCapture()] });
  assert.equal(withSupport.model, "deterministic-reference-match", "Support never turns an exact reused original into a new principal capture");
  assert.equal(calls, 1);
});

test("a historical original cannot bypass the current-evidence identity check through supporting captures", async () => {
  let calls = 0;
  const original = Buffer.from("historical-original");
  const service = createVisualAnalysisService({
    cacheDir: null, model: () => "test-model", readAsset: async () => original,
    provider: async () => { calls += 1; return inventory; },
  });
  await assert.rejects(service.analyze({ ...input, previousEvidence: [{ ...previousCapture(), image: `data:image/jpeg;base64,${original.toString("base64")}` }] }), { status: 400 });
  assert.equal(calls, 1, "Only inventory generation is allowed; there is no comparison call");
});

test("reference asset loader uses immutable project originals and rejects paths before reading", async () => {
  const original = await readFile(path.join(process.cwd(), "assets", "reference-room", "foto-001.jpeg"));
  const service = createVisualAnalysisService({ cacheDir: null, model: () => "test-model", provider: async () => inventory });
  assert.equal((await service.reference("foto-001")).sha256, hash(original));
  await assert.rejects(service.reference("../.env.local" as "foto-001"), { status: 400 });
});

test("visual routes reject cross-site, malformed and oversized requests before a provider call", async (t) => {
  const savedOrigin = process.env.APP_ORIGIN;
  const savedFetch = globalThis.fetch;
  delete process.env.APP_ORIGIN;
  globalThis.fetch = async () => { throw new Error("No provider call is allowed in validation tests"); };
  t.after(() => {
    globalThis.fetch = savedFetch;
    if (savedOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = savedOrigin;
  });
  const request = (body: unknown, origin = "http://localhost:3100") => new Request("http://localhost:3100/api/analyze", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
  assert.equal((await analyzeRoute(request(input, "https://other.test"))).status, 403);
  assert.equal((await analyzeRoute(request({ ...input, image: "http://localhost/private" }))).status, 400);
  assert.equal((await analyzeRoute(request({ ...input, image: `data:image/jpeg;base64,${"A".repeat(4_200_001)}` }))).status, 400);
  assert.equal((await referenceRoute(request({ references: ["../.env.local"] }))).status, 400);
  assert.equal((await referenceRoute(request({ references: [], model: "other" }))).status, 400);
  assert.equal((await analyzeRoute(request({ ...input, previousEvidence: [{ ...previousCapture(), itemId: "foreign-item" }] }))).status, 400);
  assert.equal((await analyzeRoute(request({ ...input, previousEvidence: [{ ...previousCapture(), requirement: { condition: input.item.expectedCondition, source: "foreign-source" } }] }))).status, 400);
  const overDecodedLimit = `data:image/jpeg;base64,${Buffer.alloc(3_000_001).toString("base64")}`;
  assert.equal((await analyzeRoute(request({ ...input, previousEvidence: [{ ...previousCapture(), image: overDecodedLimit }] }))).status, 413);
  const multiImageBody = { ...input, image: `data:image/jpeg;base64,${"A".repeat(3_000_000)}`, previousEvidence: [{ ...previousCapture(), image: `data:image/jpeg;base64,${"A".repeat(3_000_000)}`, itemId: "foreign-item" }] };
  assert.equal((await analyzeRoute(request(multiImageBody))).status, 400, "A six-megabyte multi-image body reaches validation rather than the former 4.5 MB cap");
  const tooLarge = new Request("http://localhost:3100/api/analyze", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3100", "Content-Length": "13000001" }, body: "{}" });
  assert.equal((await analyzeRoute(tooLarge)).status, 413);
});
