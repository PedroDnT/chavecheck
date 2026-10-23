import {test} from "node:test";
import assert from "node:assert/strict";
import {createDemo} from "../src/lib/inspection";
import {createRoomScenario, ROOM_INPUT, ROOM_SCENARIO_ID} from "../src/lib/room-scenario";
import {
  createMappedInspection, getRoomProgress, getWorkflow, MAX_INSPECTION_PDF_BYTES,
  updateWorkflow, validateInspectionPdf, type InspectionDocumentMetadata,
} from "../src/lib/inspection-workflow";

const document: InspectionDocumentMetadata = {
  id: "document-original", name: "vistoria.pdf", size: 123, type: "application/pdf",
  sha256: "a".repeat(64), importedAt: "2026-10-23T12:00:00Z", mode: "mock", fixtureId: ROOM_SCENARIO_ID,
};

test("old inspections receive isolated workflow defaults without changing their records", () => {
  const inspection = createRoomScenario();
  const workflow = getWorkflow(inspection);
  assert.equal(workflow.startedRooms.length, 0);
  workflow.startedRooms.push("Sala");
  assert.deepEqual(getWorkflow(inspection), {startedRooms: []});
  assert.equal("workflow" in inspection, false);
});

test("room grouping retains document order and starts every room pending", () => {
  const inspection = createDemo();
  assert.deepEqual(getRoomProgress(inspection).map(room => ({
    name: room.name, total: room.total, reviewed: room.reviewed, status: room.status, action: room.action,
  })), [
    {name: "Sala", total: 2, reviewed: 0, status: "not_started", action: "Começar"},
    {name: "Cozinha", total: 1, reviewed: 0, status: "not_started", action: "Começar"},
    {name: "Quarto", total: 1, reviewed: 0, status: "not_started", action: "Começar"},
    {name: "Banheiro", total: 1, reviewed: 0, status: "not_started", action: "Começar"},
  ]);
  assert.equal(getRoomProgress(inspection)[0].items[0], inspection.items[0]);
});

test("starting a room and resuming it never reviews an item or discards existing history", () => {
  const inspection = createRoomScenario();
  inspection.history.push({id: "event", itemId: inspection.items[0].id, at: document.importedAt, action: "Observação", note: "Registro preservado"});
  const updated = updateWorkflow(inspection, {startedRooms: ["Sala"], activeItemId: inspection.items[0].id});
  assert.equal(updated.id, inspection.id);
  assert.equal(updated.items, inspection.items);
  assert.equal(updated.history, inspection.history);
  assert.deepEqual(getRoomProgress(updated).map(room => [room.status, room.action, room.reviewed]), [["in_progress", "Continuar", 0]]);
  assert.ok(updated.items.every(item => item.status === "pendente" && !item.reviewedAt));
  assert.equal(getWorkflow(updated).activeItemId, inspection.items[0].id);
  assert.deepEqual(getWorkflow(inspection).startedRooms, []);
});

test("an AI suggestion remains pending and resume chooses the first pending item in its room", () => {
  const inspection = createRoomScenario();
  inspection.items[0].status = "conforme";
  inspection.items[0].reviewedAt = document.importedAt;
  inspection.items[1].suggestion = {status: "divergencia", note: "Sugestão ainda não confirmada"};
  const [room] = getRoomProgress(inspection);
  assert.equal(room.reviewed, 1);
  assert.equal(room.firstItemId, "sala-canaleta");
  assert.equal(room.status, "in_progress");
  assert.equal(inspection.items[1].status, "pendente");
});

test("evidence and history independently mark work in progress without approving it", () => {
  const inspection = createDemo();
  inspection.evidence.push({id: "photo", itemId: "sala-tomadas", dataUrl: "data:image/png;base64,YQ==", createdAt: document.importedAt, name: "Foto atual", origin: "upload"});
  inspection.history.push({id: "event", itemId: "cozinha-torneira", at: document.importedAt, action: "Sugestão rejeitada", note: "Inspeção ainda pendente"});
  assert.deepEqual(getRoomProgress(inspection).map(room => [room.status, room.reviewed]), [
    ["in_progress", 0], ["in_progress", 0], ["not_started", 0], ["not_started", 0],
  ]);
});

test("all reviewed outcomes complete a room, including divergence and inconclusive", () => {
  const inspection = createRoomScenario();
  inspection.items.forEach((item, index) => {item.status = index % 2 ? "inconclusivo" : "divergencia";});
  const [room] = getRoomProgress(inspection);
  assert.equal(room.reviewed, 2);
  assert.equal(room.status, "reviewed");
  assert.equal(room.action, "Revisar");
  assert.equal(room.firstItemId, inspection.items[0].id);
});

test("finalizing a report preserves pending items, suggestions and earlier workflow metadata", () => {
  const inspection = updateWorkflow(createRoomScenario(), {document, startedRooms: ["Sala"], activeItemId: "sala-canaleta"});
  inspection.items[0].suggestion = {status: "conforme", note: "Aguardando revisão"};
  const finalized = updateWorkflow(inspection, {finalizedAt: "2026-10-23T14:00:00Z"});
  assert.equal(finalized.items, inspection.items);
  assert.ok(finalized.items.every(item => item.status === "pendente"));
  assert.equal(getRoomProgress(finalized)[0].reviewed, 0);
  assert.equal(getWorkflow(finalized).document?.sha256, document.sha256);
  assert.equal(getWorkflow(finalized).activeItemId, "sala-canaleta");
  assert.equal(getWorkflow(inspection).finalizedAt, undefined);
  const reopened = updateWorkflow(finalized, {finalizedAt: undefined});
  assert.equal(getWorkflow(reopened).finalizedAt, undefined);
});

test("mock PDF mapping preserves fixture provenance and keeps the original PDF metadata separate", () => {
  const mapped = createMappedInspection(document);
  assert.equal(mapped.demo, true);
  assert.equal(mapped.scenarioId, ROOM_SCENARIO_ID);
  assert.equal(mapped.originalInput, ROOM_INPUT);
  assert.equal(mapped.items.length, 2);
  assert.deepEqual(mapped.history, []);
  assert.deepEqual(mapped.evidence, []);
  assert.deepEqual(getWorkflow(mapped).document, document);
  assert.ok(mapped.items.every(item => item.status === "pendente" && !item.source.includes(document.name)));
  assert.notEqual(getWorkflow(mapped).document, document);
});

test("PDF validation accepts a real signature, uppercase extension and absent browser MIME", async () => {
  await validateInspectionPdf(new File(["%PDF-1.7\nbody"], "VISTORIA.PDF", {type: "application/pdf"}));
  await validateInspectionPdf(new File(["leading bytes\n%PDF-1.4\nbody"], "vistoria.pdf"));
});

test("PDF validation rejects an incorrect extension, explicit wrong MIME, empty content and renamed text", async () => {
  await assert.rejects(validateInspectionPdf(new File(["%PDF-1.7"], "vistoria.txt", {type: "application/pdf"})), /Selecione um arquivo PDF/);
  await assert.rejects(validateInspectionPdf(new File(["%PDF-1.7"], "vistoria.pdf", {type: "text/plain"})), /Selecione um arquivo PDF/);
  await assert.rejects(validateInspectionPdf(new File([], "vistoria.pdf")), /está vazio/);
  await assert.rejects(validateInspectionPdf(new File(["arquivo renomeado"], "vistoria.pdf", {type: "application/pdf"})), /PDF válido/);
});

test("PDF validation only recognizes a complete signature inside the first 1024 bytes", async () => {
  await validateInspectionPdf(new File([new Uint8Array(1019), "%PDF-1.7"], "vistoria.pdf"));
  await assert.rejects(validateInspectionPdf(new File([new Uint8Array(1020), "%PDF-1.7"], "vistoria.pdf")), /PDF válido/);
});

test("PDF validation accepts the size boundary and rejects a larger original", async () => {
  const body = new Uint8Array(MAX_INSPECTION_PDF_BYTES - 5);
  await validateInspectionPdf(new File(["%PDF-", body], "vistoria.pdf"));
  await assert.rejects(validateInspectionPdf(new File(["%PDF-", body, "x"], "vistoria.pdf")), /no máximo 25 MB/);
});
