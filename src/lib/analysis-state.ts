import {statusLabel,type Evidence,type Inspection} from "./inspection";
import type {VisualAnalysis} from "./visual-analysis";

export function analysisMatchesCurrentItem(inspection:Inspection,analysis:VisualAnalysis):boolean {
  const item=inspection.items.find(i=>i.id===analysis.itemId);
  const capture=inspection.evidence.find(e=>e.id===analysis.evidenceId)?.analysisItem;
  return !!item&&item.expected.condition===analysis.requirement.condition&&item.source===analysis.requirement.source
    &&(!capture||(capture.title===item.title&&capture.room===item.room));
}

/** Reuse useful captures of the same unchanged item, never reference-file copies. */
export function selectSupportingEvidence(inspection:Inspection,itemId:string,excludeId?:string):Evidence[] {
  return inspection.evidence.filter(photo=>photo.itemId===itemId&&photo.id!==excludeId&&photo.analysisState==="complete"&&photo.analysisDataUrl&&photo.analysisItem
    &&inspection.analyses?.some(analysis=>analysis.evidenceId===photo.id&&analysisMatchesCurrentItem(inspection,analysis)
      &&analysis.model!=="deterministic-reference-match"&&!analysis.references.some(reference=>reference.sha256===analysis.imageSha256)
      &&analysis.result.quality.usable&&analysis.result.findings.some(finding=>(finding.evidenceId??analysis.evidenceId)===photo.id&&finding.assessment!=="uncertain")))
    .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-2);
}

/** A person's new capture reopens their review; prior evidence and decisions remain in history. */
export function registerCapturedEvidence(inspection:Inspection,evidence:Evidence,at=new Date().toISOString()):Inspection {
  const item=inspection.items.find(entry=>entry.id===evidence.itemId);
  const existing=inspection.evidence.find(entry=>entry.id===evidence.id);
  if(!item||existing&&existing.itemId!==evidence.itemId)throw new Error("A foto não corresponde ao item da vistoria.");
  const reopening=item.status!=="pendente";
  return {
    ...inspection,
    evidence:existing?inspection.evidence.map(entry=>entry.id===evidence.id?evidence:entry):[...inspection.evidence,evidence],
    items:inspection.items.map(entry=>entry.id===item.id
      ?{...entry,status:"pendente",suggestion:undefined,reviewedAt:undefined}:entry),
    history:reopening?[...inspection.history,{
      id:crypto.randomUUID(),itemId:item.id,at,action:"Revisão reaberta por nova foto",status:"pendente",
      note:`Revisão anterior: ${statusLabel[item.status]}. Nova comparação solicitada com a foto ${evidence.name}.`,
    }]:inspection.history,
  };
}

export function applyVisualAnalysis(inspection:Inspection,analysis:VisualAnalysis):Inspection {
  const evidence=inspection.evidence.find(e=>e.id===analysis.evidenceId&&e.itemId===analysis.itemId);
  if(!evidence||inspection.analyses?.some(a=>a.id===analysis.id))return inspection;
  const supports=analysis.supportingEvidence??[];
  if(supports.some(support=>!inspection.evidence.some(photo=>photo.id===support.evidenceId&&photo.itemId===analysis.itemId)))return inspection;
  const allowedPhotos=new Set([analysis.evidenceId,...supports.map(photo=>photo.evidenceId)]);
  if(analysis.result.findings.some(finding=>finding.evidenceId&&!allowedPhotos.has(finding.evidenceId)))return inspection;
  const baselines=new Map((inspection.baselines??[]).map(b=>[b.referenceId,b]));
  for(const baseline of analysis.references)baselines.set(baseline.referenceId,baseline);
  return {...inspection,baselines:[...baselines.values()],analyses:[...(inspection.analyses??[]),analysis],
    evidence:inspection.evidence.map(e=>e.id===evidence.id?{...e,analysisState:"complete",analysisError:undefined}:e),
    items:inspection.items.map(item=>item.id===analysis.itemId&&analysisMatchesCurrentItem(inspection,analysis)
      ?{...item,suggestion:{status:analysis.result.status,note:analysis.result.summary,analysisId:analysis.id}}:item),
    history:[...inspection.history,{id:crypto.randomUUID(),itemId:analysis.itemId,analysisId:analysis.id,at:analysis.createdAt,action:"Análise visual registrada",note:`${analysis.result.summary} · Foto: ${evidence.name}`}],
  };
}

export function restoreInterruptedAnalyses(inspection:Inspection):Inspection {
  return {...inspection,evidence:inspection.evidence.map(e=>e.analysisState==="pending"?{...e,analysisState:"error",analysisError:"A sessão foi interrompida. A foto foi preservada; toque em Reanalisar."}:e)};
}
