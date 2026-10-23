import assert from "node:assert/strict";
import test from "node:test";
import { analysisMatchesCurrentItem, applyVisualAnalysis, restoreInterruptedAnalyses, selectSupportingEvidence } from "../src/lib/analysis-state";
import { inspectionContext, type Evidence, type Inspection } from "../src/lib/inspection";
import { createRoomScenario } from "../src/lib/room-scenario";
import type { ReferenceAnalysis, VisualAnalysis } from "../src/lib/visual-analysis";

function fixture() {
  const inspection = createRoomScenario();
  const item = inspection.items[0];
  const evidence: Evidence = {
    id: "current-wall-capture", itemId: item.id, dataUrl: "data:image/jpeg;base64,b3JpZ2luYWw=",
    analysisDataUrl: "data:image/jpeg;base64,YW5hbHlzaXM=", sha256: "a".repeat(64),
    createdAt: "2026-10-23T15:00:00.000Z", name: "Parede atual", origin: "camera", analysisState: "pending",
    analysisItem: { id: item.id, room: item.room, title: item.title, expectedCondition: item.expected.condition, source: item.source },
    referenceIds: ["foto-001", "foto-002"], requestReason: "Confira o acabamento de perto.",
    captureMetrics: { width: 1280, height: 960, meanLuminance: 122, darkFraction: 0.1, brightFraction: 0.05, detailVariance: 35 },
  };
  const baseline: ReferenceAnalysis = {
    id: "baseline-wall-original", referenceId: "foto-001", sha256: "b".repeat(64),
    model: "test-vision", promptVersion: "baseline-test-v1", createdAt: "2026-10-23T14:00:00.000Z",
    lighting: "Luz lateral", sharpness: "Nítida", apparentColors: ["Cinza na captura"], limitations: [],
    observations: [{ id: "foto-001-obs-1", label: "Acabamento", description: "Cimento queimado", kind: "finish", region: { x: 0, y: 0, width: 0.5, height: 1 } }],
  };
  const analysis: VisualAnalysis = {
    id: "analysis-wall-1", evidenceId: evidence.id, itemId: item.id, createdAt: "2026-10-23T15:00:10.000Z",
    model: "test-vision", promptVersion: "comparison-test-v1", imageSha256: evidence.sha256!,
    requirement: { condition: item.expected.condition, source: item.source }, references: [baseline],
    result: {
      status: "conforme", summary: "O trecho visível mantém o acabamento da referência.", justification: "Textura correspondente no mesmo trecho.",
      nextAction: "Enquadre a canaleta inferior.", needsPhoto: false,
      quality: { usable: true, reason: "Textura visível", lighting: "Luz difusa", sharpness: "Nítida", viewMatch: "same_area" },
      findings: [{ title: "Acabamento da parede", referenceId: "foto-001", referenceObservationId: "foto-001-obs-1", referenceRegion: baseline.observations[0].region,
        currentRegion: { x: 0.1, y: 0.1, width: 0.6, height: 0.7 }, before: "Cimento queimado", after: "Mesma textura", assessment: "unchanged", reason: "Correspondência de textura." }],
      unverified: [],
    },
  };
  inspection.evidence = [evidence];
  return { inspection, item, evidence, baseline, analysis };
}

test("a delayed result remains bound to its capture when a different checklist item is active", () => {
  const { inspection, analysis, item } = fixture();
  const activeId = inspection.items[2].id;
  // Navigation and list ordering may change while the request is in flight.
  inspection.items = [inspection.items[2], inspection.items[1], item, inspection.items[3]];
  const result = applyVisualAnalysis(inspection, analysis);
  const context = JSON.parse(inspectionContext(result, activeId));
  assert.equal(context.activeItemId, activeId);
  assert.equal(result.items.find(entry => entry.id === item.id)?.suggestion?.analysisId, analysis.id);
  assert.equal(result.items.find(entry => entry.id === activeId)?.suggestion, undefined);
  assert.equal(result.evidence[0].itemId, item.id);
  assert.equal(result.history.at(-1)?.itemId, item.id);
  assert.equal(result.history.at(-1)?.analysisId, analysis.id);
  assert.equal(result.items.find(entry => entry.id === item.id)?.status, "pendente");
});

test("changed source, condition, title or room preserves the earlier analysis without suggesting it for the changed item", () => {
  const changes: Array<[string, (inspection: Inspection) => void]> = [
    ["source", value => { value.items[0].source = "Nova declaração do responsável."; }],
    ["condition", value => { value.items[0].expected.condition = "Pintura branca lisa."; }],
    ["title", value => { value.items[0].title = "Porta do corredor"; }],
    ["room", value => { value.items[0].room = "Cozinha"; }],
  ];
  for (const [field, change] of changes) {
    const { inspection, analysis } = fixture();
    change(inspection);
    const editedItem = structuredClone(inspection.items[0]);
    assert.equal(analysisMatchesCurrentItem(inspection, analysis), false, field);
    const result = applyVisualAnalysis(inspection, analysis);
    assert.deepEqual(result.items[0], editedItem, field);
    assert.equal(result.analyses?.at(-1)?.id, analysis.id, field);
    assert.equal(result.analyses?.at(-1)?.requirement.source, analysis.requirement.source, field);
    assert.equal(result.history.at(-1)?.analysisId, analysis.id, field);
    assert.match(result.history.at(-1)?.note ?? "", /Parede atual/, field);
    assert.equal(result.evidence[0].analysisState, "complete", field);
    assert.equal(result.baselines?.[0].id, analysis.references[0].id, field);
  }
});

test("AI suggestions never overwrite a person's status, note, review time or delivered quantities", () => {
  const { inspection, analysis } = fixture();
  const item = inspection.items[0];
  item.status = "divergencia";
  item.note = "Revisão humana: lascado confirmado na quina.";
  item.reviewedAt = "2026-10-23T15:00:05.000Z";
  item.delivered.quantity = 3;
  inspection.history = [{ id: "human-review", itemId: item.id, at: item.reviewedAt, action: "Revisão humana", note: item.note, status: item.status }];
  const before = structuredClone(inspection);
  const result = applyVisualAnalysis(inspection, analysis);
  assert.equal(result.items[0].status, item.status);
  assert.equal(result.items[0].note, item.note);
  assert.equal(result.items[0].reviewedAt, item.reviewedAt);
  assert.deepEqual(result.items[0].delivered, item.delivered);
  assert.equal(result.items[0].suggestion?.status, "conforme");
  assert.deepEqual(result.history[0], before.history[0]);
  assert.equal(result.history.length, 2);
  assert.deepEqual(inspection, before, "Applying a result must not mutate a previously saved snapshot");
});

test("results without their exact capture-to-item association are rejected", () => {
  const mutations: Array<(inspection: Inspection, analysis: VisualAnalysis) => void> = [
    value => { value.evidence = []; },
    value => { value.evidence[0].id = "another-photo"; },
    value => { value.evidence[0].itemId = value.items[1].id; },
    (_value, analysis) => { analysis.evidenceId = "unknown-photo"; },
    (_value, analysis) => { analysis.itemId = "unknown-item"; },
  ];
  for (const mutate of mutations) {
    const { inspection, analysis } = fixture();
    mutate(inspection, analysis);
    const before = structuredClone(inspection);
    assert.strictEqual(applyVisualAnalysis(inspection, analysis), inspection);
    assert.deepEqual(inspection, before);
  }
});

test("a duplicate analysis ID cannot duplicate history or replace a newer result", () => {
  const { inspection, analysis } = fixture();
  const first = applyVisualAnalysis(inspection, analysis);
  const replay = structuredClone(analysis);
  replay.result.status = "divergencia";
  replay.result.summary = "Conteúdo inesperado em um ID já registrado.";
  const result = applyVisualAnalysis(first, replay);
  assert.strictEqual(result, first);
  assert.equal(result.analyses?.length, 1);
  assert.equal(result.history.length, 1);
  assert.equal(result.items[0].suggestion?.status, "conforme");
});

test("reanalysis appends an auditable record and reuses the same original inventory", () => {
  const { inspection, analysis } = fixture();
  const first = applyVisualAnalysis(inspection, analysis);
  const newer = structuredClone(analysis);
  newer.id = "analysis-wall-2";
  newer.createdAt = "2026-10-23T15:01:00.000Z";
  newer.result.status = "inconclusivo";
  newer.result.summary = "Outro detalhe precisa de aproximação.";
  const result = applyVisualAnalysis(first, newer);
  assert.deepEqual(result.analyses?.map(entry => entry.id), [analysis.id, newer.id]);
  assert.deepEqual(result.history.map(entry => entry.analysisId), [analysis.id, newer.id]);
  assert.equal(result.baselines?.length, 1);
  assert.equal(result.items[0].suggestion?.analysisId, newer.id);
  assert.equal(result.items[0].status, "pendente");
});

test("interrupted captures retain originals, analyzed copies and retry context while completed results stay complete", () => {
  const { inspection, evidence } = fixture();
  const complete: Evidence = { ...evidence, id: "complete-photo", analysisState: "complete" };
  const failed: Evidence = { ...evidence, id: "failed-photo", analysisState: "error", analysisError: "Conexão indisponível." };
  const manual: Evidence = { id: "manual-photo", itemId: evidence.itemId, dataUrl: evidence.dataUrl, origin: "upload", createdAt: evidence.createdAt, name: "Registro manual" };
  inspection.evidence = [evidence, complete, failed, manual];
  const before = structuredClone(inspection);
  const result = restoreInterruptedAnalyses(inspection);
  assert.equal(result.evidence[0].analysisState, "error");
  assert.match(result.evidence[0].analysisError ?? "", /interrompida.*preservada.*Reanalisar/);
  const { analysisState: _state, analysisError: _error, ...restoredCapture } = result.evidence[0];
  const { analysisState: _originalState, analysisError: _originalError, ...originalCapture } = evidence;
  assert.deepEqual(restoredCapture, originalCapture);
  assert.deepEqual(result.evidence.slice(1), [complete, failed, manual]);
  assert.deepEqual(result.items, inspection.items);
  assert.deepEqual(result.history, inspection.history);
  assert.deepEqual(inspection, before);
  assert.deepEqual(restoreInterruptedAnalyses(result), result);
});


test("cumulative comparison selects only useful current captures of the unchanged item", () => {
  const {inspection,analysis,evidence}=fixture();
  const state=applyVisualAnalysis(inspection,analysis);
  assert.deepEqual(selectSupportingEvidence(state,evidence.itemId).map(photo=>photo.id),[evidence.id]);
  assert.deepEqual(selectSupportingEvidence(state,evidence.itemId,evidence.id),[]);
  for(const mutate of [
    (s:Inspection)=>{s.items[0].expected.condition="Outra condição";},
    (s:Inspection)=>{s.items[0].room="Outro cômodo";},
    (s:Inspection)=>{s.analyses![0].model="deterministic-reference-match";},
    (s:Inspection)=>{s.analyses![0].imageSha256=s.analyses![0].references[0].sha256;},
    (s:Inspection)=>{s.analyses![0].result.quality.usable=false;},
    (s:Inspection)=>{s.analyses![0].result.findings[0].assessment="uncertain";},
    (s:Inspection)=>{s.analyses![0].result.findings[0].evidenceId="different-photo";},
  ]){
    const changed=structuredClone(state);mutate(changed);
    assert.deepEqual(selectSupportingEvidence(changed,evidence.itemId),[]);
  }
});

test("cumulative evidence stays bounded to the two latest useful captures", () => {
  const {inspection,analysis,evidence}=fixture();
  for(let n=1;n<=4;n++){
    const photo={...evidence,id:`photo-${n}`,createdAt:`2026-10-23T15:0${n}:00.000Z`,analysisState:"complete" as const};
    inspection.evidence.push(photo);
    inspection.analyses??=[];
    inspection.analyses.push({...analysis,id:`analysis-${n}`,evidenceId:photo.id});
  }
  assert.deepEqual(selectSupportingEvidence(inspection,evidence.itemId).map(photo=>photo.id),["photo-3","photo-4"]);
});

test("a cumulative result cannot lose or cross-link its supporting photos", () => {
  const {inspection,analysis,evidence}=fixture();
  const supporting={...evidence,id:"earlier-photo"};
  inspection.evidence.push(supporting);
  analysis.supportingEvidence=[{evidenceId:supporting.id,sha256:"c".repeat(64),createdAt:supporting.createdAt}];
  analysis.result.findings[0].evidenceId=supporting.id;
  assert.equal(applyVisualAnalysis(inspection,analysis).analyses?.length,1);
  supporting.itemId=inspection.items[1].id;
  assert.strictEqual(applyVisualAnalysis(inspection,analysis),inspection);
  supporting.itemId=evidence.itemId;
  analysis.result.findings[0].evidenceId="unknown-photo";
  assert.strictEqual(applyVisualAnalysis(inspection,analysis),inspection);
});
