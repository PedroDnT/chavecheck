"use client";

import {useCallback,useEffect,useRef,useState,type Dispatch,type SetStateAction} from "react";
import type {Evidence,Inspection} from "@/lib/inspection";
import {analysisMatchesCurrentItem,applyVisualAnalysis,registerCapturedEvidence,selectSupportingEvidence} from "@/lib/analysis-state";
import {imageDigest,prepareAnalysisImage} from "@/lib/image-capture";
import {referenceIdSchema,visualAnalysisSchema,type VisualAnalysis} from "@/lib/visual-analysis";
import {saveInspection} from "@/lib/storage";

type Options={inspection:Inspection|null;setInspection:Dispatch<SetStateAction<Inspection|null>>;onBegin:(itemId:string)=>void;onFinish:(completed:boolean)=>void;onResult:(analysis:VisualAnalysis)=>void;onError:(message:string)=>void};
type Operation={controller:AbortController;inspectionId:string;evidenceId?:string};
type Progress={stage:"idle"|"preparing"|"analyzing";itemId:string;evidenceId?:string};

export function useVisualInspection(options:Options){
  const latest=useRef(options);latest.current=options;
  const operation=useRef<Operation|null>(null);
  const [progress,setProgress]=useState<Progress>({stage:"idle",itemId:""});
  const cancel=useCallback(()=>{
    const run=operation.current;if(!run)return;
    operation.current=null;run.controller.abort();
    latest.current.setInspection(old=>old?.id===run.inspectionId?{...old,evidence:old.evidence.map(e=>e.id===run.evidenceId?{...e,analysisState:"error",analysisError:"Análise interrompida. A foto foi preservada para reenvio."}:e)}:old);
    setProgress({stage:"idle",itemId:""});latest.current.onFinish(false);
  },[]);
  useEffect(()=>{if(operation.current&&operation.current.inspectionId!==options.inspection?.id)cancel();},[options.inspection?.id,cancel]);
  useEffect(()=>()=>{operation.current?.controller.abort();operation.current=null;},[]);

  const runAnalysis=useCallback(async(dataUrl:string,origin:Evidence["origin"],itemId:string,reason?:string,retry?:Evidence,name?:string)=>{
    if(operation.current)return;
    const start=latest.current.inspection;
    const item=start?.items.find(i=>i.id===itemId);
    if(!start||!item)return;
    const run:Operation={controller:new AbortController(),inspectionId:start.id,evidenceId:retry?.id};
    let completed=false;
    operation.current=run;latest.current.onBegin(itemId);setProgress({stage:"preparing",itemId});
    const current=()=>{
      if(operation.current!==run||latest.current.inspection?.id!==start.id)return false;
      if(run.controller.signal.aborted)throw new Error("Análise interrompida por tempo limite.");
      return true;
    };
    const timeout=setTimeout(()=>run.controller.abort(),210_000);
    try {
      const prepared=retry?.analysisDataUrl?{analysisDataUrl:retry.analysisDataUrl,sha256:retry.sha256,captureMetrics:retry.captureMetrics}:await prepareAnalysisImage(dataUrl);
      if(!current())return;
      const previousPhotos=retry?(retry.previousEvidenceIds??[]).map(id=>{
        const previous=start.evidence.find(photo=>photo.id===id);
        if(!previous?.analysisDataUrl||!previous.analysisItem)throw new Error("Uma captura anterior desta comparação não está disponível. Faça uma nova captura para continuar.");
        return previous;
      }):selectSupportingEvidence(start,itemId);
      const previousEvidence=previousPhotos.map(photo=>({evidenceId:photo.id,itemId:photo.itemId,image:photo.analysisDataUrl!,createdAt:photo.createdAt,requirement:{condition:photo.analysisItem!.expectedCondition,source:photo.analysisItem!.source}}));
      const evidence:Evidence=retry?{...retry,analysisState:"pending",analysisError:undefined}:{id:crypto.randomUUID(),itemId,dataUrl,origin,createdAt:new Date().toISOString(),name:name?.trim().slice(0,180)||`${item.title} · ${new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date())}`,analysisState:"pending",...prepared,
        analysisItem:{id:item.id,room:item.room,title:item.title,expectedCondition:item.expected.condition,source:item.source},
        referenceIds:(start.referencePhotos??[]).filter(p=>p.itemIds.includes(itemId)).map(p=>referenceIdSchema.parse(p.id)),requestReason:reason,previousEvidenceIds:previousPhotos.map(photo=>photo.id)};
      run.evidenceId=evidence.id;
      const snapshot=latest.current.inspection!;
      const saved=registerCapturedEvidence(snapshot,evidence);
      latest.current.setInspection(saved);
      // Preserve the actual capture before issuing a verdict that depends on it.
      await saveInspection(saved);
      if(!current())return;
      setProgress({stage:"analyzing",itemId,evidenceId:evidence.id});
      const response=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},signal:run.controller.signal,body:JSON.stringify({evidenceId:evidence.id,item:evidence.analysisItem??{id:item.id,room:item.room,title:item.title,expectedCondition:item.expected.condition,source:item.source},image:prepared.analysisDataUrl,references:evidence.referenceIds??[],requestReason:evidence.requestReason,previousEvidence})});
      const payload=await response.json();
      if(!current())return;
      if(!response.ok)throw new Error(typeof payload.error==="string"?payload.error:"Não foi possível analisar a foto.");
      const analysis=visualAnalysisSchema.parse(payload.analysis);
      const expectedHash=await imageDigest(prepared.analysisDataUrl);
      if(!current())return;
      if(analysis.itemId!==itemId||analysis.evidenceId!==evidence.id||analysis.imageSha256!==expectedHash)throw new Error("A resposta não corresponde à foto enviada. Reenvie a mesma foto.");
      if(analysis.requirement.condition!==(evidence.analysisItem?.expectedCondition??item.expected.condition)||analysis.requirement.source!==(evidence.analysisItem?.source??item.source))throw new Error("A resposta não corresponde à fonte do item. Reenvie a foto.");
      const supports=analysis.supportingEvidence??[];
      if(analysis.model!=="deterministic-reference-match"){
        const expectedSupports=await Promise.all(previousEvidence.map(async photo=>({evidenceId:photo.evidenceId,sha256:await imageDigest(photo.image),createdAt:photo.createdAt})));
        if(supports.length!==expectedSupports.length||new Set(supports.map(photo=>photo.evidenceId)).size!==supports.length||supports.some(photo=>!expectedSupports.some(expected=>expected.evidenceId===photo.evidenceId&&expected.sha256===photo.sha256&&expected.createdAt===photo.createdAt)))throw new Error("A resposta não corresponde às capturas anteriores enviadas. Reenvie a foto.");
      }
      if(!current())return;
      latest.current.setInspection(old=>old?.id===start.id?applyVisualAnalysis(old,analysis):old);
      if(analysisMatchesCurrentItem(latest.current.inspection!,analysis)){
        completed=true;latest.current.onResult(analysis);
      }else latest.current.onError("O item foi alterado durante a análise. A comparação com a condição anterior foi guardada no histórico. Faça uma nova captura para conferir a condição atual.");
    } catch(error){
      if(operation.current!==run||latest.current.inspection?.id!==start.id)return;
      const message=run.controller.signal.aborted?"A análise demorou demais. Sua foto foi mantida; toque em Reanalisar.":error instanceof Error?error.message:"Falha ao analisar. Sua foto foi preservada.";
      latest.current.setInspection(old=>old?.id===start.id?{...old,evidence:old.evidence.map(e=>e.id===run.evidenceId?{...e,analysisState:"error",analysisError:message}:e)}:old);
      latest.current.onError(message);
    } finally {
      clearTimeout(timeout);
      if(operation.current===run){operation.current=null;setProgress({stage:"idle",itemId:""});latest.current.onFinish(completed);}
    }
  },[]);
  const retry=useCallback((evidence:Evidence)=>runAnalysis(evidence.dataUrl,evidence.origin,evidence.itemId,evidence.requestReason,evidence),[runAnalysis]);
  return {progress,busy:progress.stage!=="idle",capture:runAnalysis,retry,cancel};
}
