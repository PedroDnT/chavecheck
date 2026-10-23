import assert from "node:assert/strict";
import test from "node:test";
import { compactVisualAnalysis, createDemo, inspectionContext, type CheckItem } from "../src/lib/inspection";
import type { VisualAnalysis } from "../src/lib/visual-analysis";

const region={x:.1,y:.2,width:.3,height:.4};
function analysisFor(item:CheckItem):VisualAnalysis {
  return {
    id:`analysis-${item.id}`,itemId:item.id,evidenceId:`evidence-${item.id}`,createdAt:"2026-10-23T12:00:00Z",
    model:"test-model",promptVersion:"test-prompt",imageSha256:"a".repeat(64),
    requirement:{condition:item.expected.condition,source:item.source},references:[],
    result:{status:"inconclusivo",summary:"A tampa ainda está parcialmente fora do quadro.",justification:"A extremidade não pôde ser comparada.",nextAction:"Inclua a extremidade da canaleta e envie a foto.",needsPhoto:true,
      quality:{usable:true,reason:"Tampa visível, extremidade oculta",lighting:"Luz suficiente",sharpness:"Nítida",viewMatch:"partial"},
      findings:[{title:"Tampa",referenceId:"foto-001",referenceObservationId:"foto-001-obs-1",referenceRegion:region,currentRegion:region,before:"Tampa parcialmente visível",after:"Tampa no centro da foto",assessment:"uncertain",reason:"Falta a extremidade"}],
      unverified:["Extremidade da canaleta não enquadrada"],
    },
  };
}

test("speech summary keeps decision limits and exact anchors without changing the complete record",()=>{
  const analysis=analysisFor(createDemo().items[0]);
  const before=JSON.stringify(analysis);
  const compact=compactVisualAnalysis(analysis);
  assert.equal(compact.result.status,"inconclusivo");
  assert.equal(compact.result.needsPhoto,true);
  assert.equal(compact.result.quality.viewMatch,"partial");
  assert.deepEqual(compact.result.unverified,analysis.result.unverified);
  assert.equal(compact.evidenceId,analysis.evidenceId);
  assert.equal(compact.result.findings[0].evidenceId,analysis.evidenceId);
  assert.deepEqual(compact.supportingEvidenceIds,[]);
  assert.equal(compact.result.findings[0].referenceObservationId,"foto-001-obs-1");
  assert.deepEqual(compact.result.findings[0].currentRegion,region);
  assert.equal(JSON.stringify(analysis),before);
});

test("a combined analysis keeps each finding linked to its own current-inspection capture",()=>{
  const analysis=analysisFor(createDemo().items[0]);
  analysis.supportingEvidence=[{evidenceId:"earlier-current-capture",sha256:"b".repeat(64),createdAt:"2026-10-23T11:50:00Z"}];
  const priorFinding={...analysis.result.findings[0],title:"Extremidade já fotografada",evidenceId:"earlier-current-capture"};
  analysis.result.findings.push(priorFinding);
  const before=JSON.stringify(analysis);
  const compact=compactVisualAnalysis(analysis);
  assert.equal(compact.result.findings[0].evidenceId,analysis.evidenceId);
  assert.equal(compact.result.findings[1].evidenceId,"earlier-current-capture");
  assert.deepEqual(compact.supportingEvidenceIds,["earlier-current-capture"]);
  assert.equal(compact.result.needsPhoto,true);
  assert.deepEqual(compact.result.unverified,analysis.result.unverified);
  assert.equal(JSON.stringify(compact).includes("b".repeat(64)),false);
  assert.equal(JSON.stringify(analysis),before);
});

test("speech summary prioritizes changed and uncertain details and declares omissions",()=>{
  const analysis=analysisFor(createDemo().items[0]);
  const base=analysis.result.findings[0];
  analysis.result.findings=Array.from({length:8},(_,index)=>({...base,title:`Parte ${index}`,assessment:index===7?"changed":index===6?"uncertain":"unchanged"}));
  analysis.result.unverified=Array.from({length:16},(_,index)=>`Detalhe ${index} ainda não verificado`);
  const compact=compactVisualAnalysis(analysis);
  assert.equal(compact.result.findings[0].assessment,"changed");
  assert.equal(compact.result.findings[1].assessment,"uncertain");
  assert.equal(compact.summaryScope.omittedFindings,5);
  assert.equal(compact.summaryScope.totalUnverified,16);
  assert.equal(compact.summaryScope.omittedUnverified,6);
  assert.match(compact.summaryScope.note,/não significam que o restante foi verificado/);
  assert.equal(analysis.result.findings.length,8);
});

test("editing a condition or source removes stale decisions from the voice context",()=>{
  const inspection=createDemo();
  const item=inspection.items[0];
  const valid=analysisFor(item);
  inspection.analyses=[valid,{...valid,id:"stale-newest",requirement:{...valid.requirement,source:"Fonte anterior"}}];
  const initial=JSON.parse(inspectionContext(inspection,item.id));
  assert.equal(initial.latestAnalyses.length,1);
  assert.equal(initial.latestAnalyses[0].id,valid.id);
  item.expected.condition="Novo requisito não comparado";
  const edited=JSON.parse(inspectionContext(inspection,item.id));
  assert.deepEqual(edited.latestAnalyses,[]);
  assert.equal(inspection.analyses.length,2);
});

test("large escaped narratives, ten checks and many photos stay below the API context limit",()=>{
  const inspection=createDemo();
  const escaped='\\\u0000"'.repeat(2_000);
  const template=inspection.items[0];
  inspection.property=escaped;
  inspection.items=Array.from({length:10},(_,index)=>({...structuredClone(template),id:`item-${index}`,title:`Item ${index}`,source:escaped,expected:{...template.expected,condition:escaped},note:escaped}));
  inspection.analyses=inspection.items.map(item=>{
    const analysis=analysisFor(item);
    const finding=analysis.result.findings[0];
    analysis.result.summary=escaped;
    analysis.result.justification=escaped;
    analysis.result.nextAction=escaped;
    analysis.result.findings=Array.from({length:12},()=>({...finding,title:escaped,before:escaped,after:escaped,reason:escaped}));
    analysis.result.unverified=Array.from({length:16},()=>escaped);
    return analysis;
  });
  inspection.evidence=inspection.items.flatMap(item=>Array.from({length:100},(_,index)=>({id:`${item.id}-photo-${index}`,itemId:item.id,name:escaped,createdAt:"2026-10-23T12:00:00Z",origin:"camera" as const,dataUrl:`data:image/jpeg;base64,${"A".repeat(10_000)}`})));
  const context=inspectionContext(inspection,"item-9");
  assert.ok(context.length<=32_000,`context length ${context.length}`);
  const data=JSON.parse(context);
  assert.equal(data.items.length,10);
  assert.equal(data.activeItemId,"item-9");
  assert.ok(data.latestAnalyses.some((entry:{itemId:string})=>entry.itemId==="item-9"));
  assert.equal(data.items[9].evidenceCount,100);
  assert.equal(data.items[9].evidence.length,3);
  assert.equal(context.includes("data:image"),false);
  for(const analysis of inspection.analyses){
    assert.ok(JSON.stringify(compactVisualAnalysis(analysis)).length<=10_500);
    assert.ok(JSON.stringify(compactVisualAnalysis(analysis,"brief")).length<=3_500);
  }
  assert.equal(inspection.analyses[9].result.unverified.length,16);
  assert.equal(inspection.items[9].source,escaped);
  assert.equal(inspection.evidence.length,1_000);
});

test("conversation during a new photo cannot repeat an earlier result as current",()=>{
  const inspection=createDemo();
  const item=inspection.items[0];
  const previous=analysisFor(item);
  inspection.analyses=[previous];
  item.suggestion={status:previous.result.status,note:previous.result.summary,analysisId:previous.id};
  const busy=JSON.parse(inspectionContext(inspection,item.id,item.id));
  assert.equal(busy.analysisInProgress.itemId,item.id);
  assert.equal(busy.analysisInProgress.state,"processing");
  assert.deepEqual(busy.latestAnalyses,[]);
  assert.equal(busy.items[0].suggestion,undefined);
  assert.equal(inspection.analyses.length,1);
  const done=JSON.parse(inspectionContext(inspection,item.id));
  assert.equal(done.analysisInProgress,null);
  assert.equal(done.latestAnalyses[0].id,previous.id);
});

test("a failed new capture cannot reactivate the old visual conclusion in conversation",()=>{
  const inspection=createDemo();const item=inspection.items[0];
  inspection.analyses=[analysisFor(item)];
  inspection.evidence=[{id:"new-failed-photo",itemId:item.id,dataUrl:"data:image/jpeg;base64,YQ==",createdAt:"2026-10-23T13:00:00Z",name:"Nova foto",origin:"camera",analysisState:"error",analysisError:"Rede indisponível"}];
  const context=JSON.parse(inspectionContext(inspection,item.id));
  assert.deepEqual(context.latestAnalyses,[]);
  assert.equal(context.items[0].latestCaptureState,"error");
  assert.equal(context.items[0].latestCaptureError,"Rede indisponível");
  assert.equal(inspection.analyses.length,1);
});
