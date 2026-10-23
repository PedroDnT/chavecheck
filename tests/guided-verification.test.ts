import assert from "node:assert/strict";
import test from "node:test";
import {canReviewSuggestion, getGuidedProgress} from "../src/lib/guided-verification";
import {applyVisualAnalysis} from "../src/lib/analysis-state";
import {createDemo, type CheckItem, type Evidence, type Inspection} from "../src/lib/inspection";
import type {VisualAnalysis} from "../src/lib/visual-analysis";

function reviewed(inspection: Inspection, itemId: string, status: CheckItem["status"] = "conforme") {
  return {...inspection, items: inspection.items.map(item => item.id === itemId
    ? {...item, status, reviewedAt: "2026-10-23T15:01:00.000Z", suggestion: undefined} : item)};
}

function fixture() {
  const inspection = createDemo();
  const item = inspection.items[1];
  const evidence: Evidence = {
    id: "current-wall-photo", itemId: item.id, dataUrl: "data:image/jpeg;base64,YQ==", origin: "camera",
    name: "Parede atual", createdAt: "2026-10-23T15:00:00.000Z", analysisState: "pending",
    analysisItem: {id: item.id, room: item.room, title: item.title, expectedCondition: item.expected.condition, source: item.source},
  };
  const analysis: VisualAnalysis = {
    id: "wall-analysis", itemId: item.id, evidenceId: evidence.id, createdAt: "2026-10-23T15:00:10.000Z",
    model: "test-vision", promptVersion: "test", imageSha256: "a".repeat(64), references: [],
    requirement: {condition: item.expected.condition, source: item.source},
    result: {
      status: "conforme", summary: "Acabamento sem diferenças visíveis.", justification: "Trecho comparado na foto atual.",
      nextAction: "Confirme a conclusão para continuar.", needsPhoto: false,
      quality: {usable: true, reason: "Trecho nítido", lighting: "Luz difusa", sharpness: "Nítida", viewMatch: "same_area"},
      findings: [], unverified: [],
    },
  };
  inspection.evidence = [evidence];
  return {inspection: applyVisualAnalysis(inspection, analysis), item, evidence, analysis};
}

test("guidance stays in the active room before continuing in document room order", () => {
  const inspection = createDemo();
  // A room's items may not be adjacent in a customized checklist.
  inspection.items = [inspection.items[0], inspection.items[2], inspection.items[1], ...inspection.items.slice(3)];
  const first = reviewed(inspection, "sala-tomadas");
  assert.equal(getGuidedProgress(first, "sala-tomadas").nextItem?.id, "sala-pintura");
  const second = reviewed(first, "sala-pintura");
  assert.equal(getGuidedProgress(second, "sala-pintura").nextItem?.id, "cozinha-torneira");
  assert.equal(getGuidedProgress(second, "sala-pintura").complete, false);
  assert.equal(getGuidedProgress(second, "sala-pintura").reviewed, 2);
});

test("the last item remains pending until a human reviews it, then the whole inspection is complete", () => {
  let inspection = createDemo();
  for (const item of inspection.items.slice(0, -1)) inspection = reviewed(inspection, item.id);
  const lastId = inspection.items.at(-1)!.id;
  assert.deepEqual(getGuidedProgress(inspection, lastId), {reviewed: 4, total: 5, remaining: 1, complete: false, nextItem: undefined});
  inspection = reviewed(inspection, lastId, "divergencia");
  assert.deepEqual(getGuidedProgress(inspection, lastId), {reviewed: 5, total: 5, remaining: 0, complete: true, nextItem: undefined});
});

test("inconclusive suggestions remain pending while an explicit human inconclusive review permits continuing", () => {
  const {inspection, item, analysis} = fixture();
  analysis.result.status = "inconclusivo";
  analysis.result.needsPhoto = true;
  inspection.items.find(entry => entry.id === item.id)!.suggestion!.status = "inconclusivo";
  assert.equal(canReviewSuggestion(inspection, item.id), false);
  assert.equal(getGuidedProgress(inspection, item.id).reviewed, 0);
  const manual = reviewed(inspection, item.id, "inconclusivo");
  assert.equal(getGuidedProgress(manual, item.id).reviewed, 1);
  assert.equal(getGuidedProgress(manual, item.id).nextItem?.id, "sala-tomadas");
  assert.equal(manual.items.find(entry => entry.id === item.id)?.status, "inconclusivo");
  assert.equal(inspection.items.find(entry => entry.id === item.id)?.status, "pendente");
});

test("empty and unknown selections do not invent a completed inspection", () => {
  const inspection = createDemo();
  assert.equal(getGuidedProgress(inspection, "missing").nextItem?.id, inspection.items[0].id);
  inspection.items = [];
  assert.deepEqual(getGuidedProgress(inspection, "missing"), {reviewed: 0, total: 0, remaining: 0, complete: false, nextItem: undefined});
});

test("a completed current suggestion is confirmable without the helper approving or mutating it", () => {
  const {inspection, item} = fixture();
  const before = structuredClone(inspection);
  assert.equal(canReviewSuggestion(inspection, item.id), true);
  assert.equal(getGuidedProgress(inspection, item.id).reviewed, 0);
  assert.deepEqual(inspection, before);
});

test("missing, stale or mismatched analyses cannot be confirmed", () => {
  const changes: Array<(inspection: Inspection, itemId: string) => void> = [
    value => {value.analyses = [];},
    value => {value.evidence = [];},
    (value, id) => {value.items.find(item => item.id === id)!.suggestion!.analysisId = "missing";},
    (value, id) => {delete value.items.find(item => item.id === id)!.suggestion!.analysisId;},
    (value, id) => {value.items.find(item => item.id === id)!.source = "Fonte alterada";},
    (value, id) => {value.items.find(item => item.id === id)!.expected.condition = "Condição alterada";},
    (value, id) => {value.items.find(item => item.id === id)!.title = "Outro item";},
    (value, id) => {value.items.find(item => item.id === id)!.room = "Outro cômodo";},
    (value, id) => {value.items.find(item => item.id === id)!.suggestion!.status = "divergencia";},
    value => {value.evidence[0].itemId = "other-item";},
    value => {value.analyses!.push({...value.analyses![0], id: "newer-result"});},
  ];
  for (const change of changes) {
    const {inspection, item} = fixture();
    change(inspection, item.id);
    assert.equal(canReviewSuggestion(inspection, item.id), false);
  }
  assert.equal(canReviewSuggestion(fixture().inspection, "missing"), false);
});

test("pending, failed and newer unanalysed photos prevent confirmation of an earlier conclusion", () => {
  for (const state of ["pending", "error"] as const) {
    const {inspection, item} = fixture();
    inspection.evidence[0].analysisState = state;
    assert.equal(canReviewSuggestion(inspection, item.id), false);
  }
  for (const state of ["pending", "error", "complete", undefined] as const) {
    const {inspection, item} = fixture();
    inspection.evidence.push({...inspection.evidence[0], id: "new-photo", createdAt: "2026-10-23T15:02:00.000Z", analysisState: state});
    assert.equal(canReviewSuggestion(inspection, item.id), false);
  }
});

test("a new successful capture can recover from an earlier failed capture", () => {
  const {inspection, item} = fixture();
  inspection.evidence.unshift({...inspection.evidence[0], id: "old-failed-photo", createdAt: "2026-10-23T14:00:00.000Z", analysisState: "error"});
  assert.equal(canReviewSuggestion(inspection, item.id), true);
});

test("the normal confirmation waits for requested photography even if the proposed status is conforming", () => {
  const {inspection, item} = fixture();
  inspection.analyses![0].result.needsPhoto = true;
  assert.equal(canReviewSuggestion(inspection, item.id), false);
  assert.equal(inspection.items.find(entry => entry.id === item.id)?.status, "pendente");
});
