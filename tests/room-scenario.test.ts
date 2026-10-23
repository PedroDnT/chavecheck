import {test} from "node:test";
import assert from "node:assert/strict";
import {compareItem, inspectionContext} from "../src/lib/inspection";
import {createRoomScenario, ROOM_INPUT, ROOM_SCENARIO_ID} from "../src/lib/room-scenario";

test("room scenario starts with four unverified checks and no current observations", () => {
  const inspection = createRoomScenario();
  assert.equal(inspection.scenarioId, ROOM_SCENARIO_ID);
  assert.equal(inspection.originalInput, ROOM_INPUT);
  assert.deepEqual(inspection.items.map(item => item.id), ["sala-paredes", "sala-canaleta", "sala-ar", "sala-mobiliario"]);
  assert.ok(inspection.items.every(item => item.room === "Sala" && item.status === "pendente" && item.note === "" && !item.suggestion && !item.reviewedAt));
  assert.deepEqual(inspection.history, []);
  assert.deepEqual(inspection.messages, []);
});

test("room references do not create evidence or fabricated quantity, value and deadline differences", () => {
  const inspection = createRoomScenario();
  assert.equal(inspection.referencePhotos?.length, 2);
  assert.deepEqual(inspection.evidence, []);
  for (const item of inspection.items) {
    assert.equal(item.expected.quantity, null);
    assert.equal(item.expected.value, null);
    assert.equal(item.expected.dueDate, null);
    assert.deepEqual(item.delivered, {quantity:null, value:null, completedDate:null, status:"nao_informado"});
    assert.deepEqual(compareItem(item, inspection.date), []);
    assert.deepEqual(compareItem(item, "2099-12-31"), []);
  }
  for (const photo of inspection.referencePhotos ?? []) {
    assert.match(photo.url, /^\/api\/reference-photos\/foto-00[12]$/);
    assert.ok(photo.itemIds.every(id => inspection.items.some(item => item.id === id)));
    assert.equal("dataUrl" in photo, false);
  }
});

test("inspection context labels previous references and keeps current evidence attached only to its item", () => {
  const inspection = createRoomScenario();
  inspection.evidence.push({id:"current-photo", itemId:"sala-paredes", dataUrl:"data:image/jpeg;base64,Y3VycmVudA==", createdAt:"2026-10-23T12:00:00Z", name:"Parede atual", origin:"camera"});
  const context = JSON.parse(inspectionContext(inspection, "sala-paredes"));
  assert.equal(context.activeItemId, "sala-paredes");
  assert.equal(context.referencePhotos.length, 2);
  assert.ok(context.referencePhotos.every((photo: {role:string}) => photo.role === "referencia_anterior_nao_evidencia_atual"));
  assert.match(context.comparisonRules, /condição esperada declarada/);
  assert.match(context.comparisonRules, /não uma certificação/);
  assert.match(context.comparisonRules, /Não aprove o estado atual com base na referência/);
  assert.match(context.comparisonRules, /confirmação humana/);
  assert.deepEqual(context.items[0].evidence, [{id:"current-photo", name:"Parede atual", createdAt:"2026-10-23T12:00:00Z"}]);
  assert.ok(context.items.slice(1).every((item: {evidence:unknown[]}) => item.evidence.length === 0));
  assert.ok(context.items.every((item: {status:string; differences:unknown[]}) => item.status === "pendente" && item.differences.length === 0));
  assert.equal(JSON.stringify(context).includes("data:image"), false);
});

test("a new room scenario does not reuse mutable items or photo associations from an earlier inspection", () => {
  const first = createRoomScenario();
  first.items[0].status = "divergencia";
  first.items[0].expected.condition = "Condição alterada na revisão";
  first.referencePhotos![0].itemIds.push("other-item");
  first.referencePhotos![0].description = "Descrição alterada";
  const second = createRoomScenario();
  assert.notEqual(first.id, second.id);
  assert.equal(second.items[0].status, "pendente");
  assert.notEqual(second.items[0].expected.condition, first.items[0].expected.condition);
  assert.equal(second.referencePhotos![0].itemIds.includes("other-item"), false);
  assert.notEqual(second.referencePhotos![0].description, first.referencePhotos![0].description);
});
