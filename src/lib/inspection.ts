import type {AnalyzeRequest,ReferenceAnalysis,VisualAnalysis} from "./visual-analysis";

export type CheckStatus = "pendente" | "conforme" | "divergencia" | "inconclusivo";
export interface CheckItem {
  id: string; room: string; title: string;
  expected: {quantity: number | null; value: number | null; dueDate: string | null; condition: string};
  delivered: {quantity: number | null; value: number | null; completedDate: string | null; status: "entregue" | "pendente" | "nao_informado"};
  source: string;
  status: CheckStatus;
  note: string;
  suggestion?: {status: Exclude<CheckStatus, "pendente">; note: string; analysisId?:string};
  reviewedAt?: string;
}
export interface Evidence {
  id:string;itemId:string;dataUrl:string;createdAt:string;name:string;origin:"camera"|"upload";
  analysisDataUrl?:string;sha256?:string;analysisState?:"pending"|"complete"|"error";analysisError?:string;
  captureMetrics?:{width:number;height:number;meanLuminance:number;darkFraction:number;brightFraction:number;detailVariance:number};
  analysisItem?:AnalyzeRequest["item"];referenceIds?:AnalyzeRequest["references"];requestReason?:string;previousEvidenceIds?:string[];
}
export interface ReviewEvent {id: string; itemId: string; at: string; action: string; note: string; analysisId?:string; status?:CheckStatus}
export interface ReferencePhoto {id: string; url: string; label: string; description: string; itemIds: string[]}
export interface Inspection {
  version: 1; id: string; property: string; date: string; demo: boolean; originalInput?: string;
  scenarioId?: string; referencePhotos?: ReferencePhoto[];
  baselines?:ReferenceAnalysis[];analyses?:VisualAnalysis[];
  items: CheckItem[]; evidence: Evidence[]; history: ReviewEvent[];
  messages: {id:string;role:"user"|"assistant";text:string}[];
}
export const statusLabel: Record<CheckStatus,string> = {pendente:"Não verificado",conforme:"Conforme",divergencia:"Divergência",inconclusivo:"Inconclusivo"};
export const money = (n: number | null) => n === null ? "Não informado" : new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);
export const dateLabel = (date: string | null) => date ? new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`)) : "Não informado";
export const localDate = () => new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

export function compareItem(item: CheckItem, inspectionDate: string) {
  const differences: {kind: "Quantidade" | "Prazo" | "Valor"; expected: string; delivered: string}[] = [];
  if (item.expected.quantity !== null && item.delivered.quantity !== null && item.expected.quantity !== item.delivered.quantity)
    differences.push({kind:"Quantidade",expected:String(item.expected.quantity),delivered:String(item.delivered.quantity)});
  if (item.expected.value !== null && item.delivered.value !== null && item.expected.value !== item.delivered.value)
    differences.push({kind:"Valor",expected:money(item.expected.value),delivered:money(item.delivered.value)});
  if (item.expected.dueDate && ((item.delivered.completedDate && item.delivered.completedDate > item.expected.dueDate) || (item.delivered.status === "pendente" && inspectionDate > item.expected.dueDate)))
    differences.push({kind:"Prazo",expected:dateLabel(item.expected.dueDate),delivered:item.delivered.completedDate ? dateLabel(item.delivered.completedDate) : `Pendente em ${dateLabel(inspectionDate)}`});
  return differences;
}

export function createDemo(): Inspection {
  const base = (id:string,room:string,title:string,condition:string,source:string): CheckItem => ({id,room,title,expected:{quantity:null,value:null,dueDate:null,condition},delivered:{quantity:null,value:null,completedDate:null,status:"nao_informado"},source,status:"pendente",note:""});
  const outlets = base("sala-tomadas","Sala","Quantidade de tomadas","Quatro tomadas funcionais. Confirmar a contagem; funcionamento exige verificação humana.","Contrato fictício, cláusula 4.1: quatro tomadas. Tabela de entrega fictícia, linha 1: três tomadas.");
  outlets.expected.quantity=4; outlets.delivered.quantity=3; outlets.delivered.status="entregue";
  const paint = base("sala-pintura","Sala","Estado da pintura","Parede com pintura branca, sem marcas descritas no laudo inicial.","Laudo inicial fictício, seção Sala: pintura branca, sem marcas descritas.");
  const tap = base("cozinha-torneira","Cozinha","Reparo da torneira","Reparo entregue até 20/10/2026. Perguntar sobre vazamento; a foto não comprova funcionamento.","Anexo de reparos fictício, item 2: reparo até 20/10/2026. Tabela de entrega: pendente em 23/10/2026.");
  tap.expected.dueDate="2026-10-20"; tap.delivered.status="pendente";
  const window = base("quarto-janela","Quarto","Abertura da janela","Uma janela que abre e fecha. Solicitar confirmação de funcionamento.","Termo fictício, seção Quarto: uma janela com abertura e fechamento.");
  window.expected.quantity=1; window.delivered.quantity=1; window.delivered.status="entregue";
  const accessory = base("banheiro-acessorio","Banheiro","Valor do acessório","Instalação orçada em R$ 180. Confirmar o valor pelo registro de entrega.","Contrato fictício, item 6: R$ 180. Tabela/comprovante fictício: R$ 260.");
  accessory.expected.value=180; accessory.delivered.value=260; accessory.delivered.status="entregue";
  return {version:1,id:crypto.randomUUID(),property:"Apartamento Aurora 302",date:"2026-10-23",demo:true,items:[outlets,paint,tap,window,accessory],evidence:[],history:[],messages:[]};
}

function contextExcerpt(value:string,limit:number) {
  if(value.length<=limit)return value;
  return `${value.slice(0,Math.max(0,limit-22)).replace(/[\uD800-\uDBFF]$/u,"")}… [trecho abreviado]`;
}

/** Speech context is deliberately bounded; the immutable analysis remains complete. */
export function compactVisualAnalysis(analysis:VisualAnalysis,detail:"focus"|"brief"="focus") {
  const focused=detail==="focus";
  const findings=[...analysis.result.findings].sort((a,b)=>
    ({changed:0,uncertain:1,unchanged:2}[a.assessment])-({changed:0,uncertain:1,unchanged:2}[b.assessment]));
  const build=(scale:number)=>{
    let shortenedFields=0;
    const clip=(value:string,max:number)=>{
      const limit=Math.max(24,Math.floor(max*scale));
      if(value.length>limit)shortenedFields++;
      return contextExcerpt(value,limit);
    };
    const includedFindings=findings.slice(0,focused?3:1).map(finding=>({
      title:clip(finding.title,focused?140:70),assessment:finding.assessment,
      evidenceId:finding.evidenceId??analysis.evidenceId,
      referenceId:finding.referenceId,referenceObservationId:finding.referenceObservationId,
      referenceRegion:finding.referenceRegion,currentRegion:finding.currentRegion,
      before:clip(finding.before,focused?220:80),after:clip(finding.after,focused?220:80),reason:clip(finding.reason,focused?220:80),
    }));
    const unverified=analysis.result.unverified.slice(0,focused?10:3).map(value=>clip(value,focused?180:80));
    const record={
      id:analysis.id,itemId:analysis.itemId,evidenceId:analysis.evidenceId,createdAt:analysis.createdAt,
      supportingEvidenceIds:[...new Set((analysis.supportingEvidence??[]).map(evidence=>evidence.evidenceId))],
      requirement:{condition:clip(analysis.requirement.condition,focused?900:160),source:clip(analysis.requirement.source,focused?900:160)},
      result:{
        status:analysis.result.status,summary:clip(analysis.result.summary,focused?550:220),
        justification:clip(analysis.result.justification,focused?750:220),nextAction:clip(analysis.result.nextAction,focused?700:240),needsPhoto:analysis.result.needsPhoto,
        quality:{...analysis.result.quality,reason:clip(analysis.result.quality.reason,focused?300:100),lighting:clip(analysis.result.quality.lighting,focused?180:80),sharpness:clip(analysis.result.quality.sharpness,focused?180:80)},
        findings:includedFindings,unverified,
      },
      summaryScope:{
        shortenedFields:0,totalFindings:findings.length,omittedFindings:findings.length-includedFindings.length,
        totalUnverified:analysis.result.unverified.length,omittedUnverified:analysis.result.unverified.length-unverified.length,
        note:"Resumo para a conversa. O registro completo está no relatório. Trechos abreviados e achados omitidos não significam que o restante foi verificado; preserve o status e as limitações registradas.",
      },
    };
    record.summaryScope.shortenedFields=shortenedFields;
    return record;
  };
  let scale=1;
  let record=build(scale);
  const limit=focused?10_500:3_500;
  while(JSON.stringify(record).length>limit&&scale>1/32){scale/=2;record=build(scale);}
  return record;
}

export function inspectionContext(inspection:Inspection,activeId:string) {
  const active=inspection.items.find(item=>item.id===activeId);
  const selected=inspection.items.length<=10?inspection.items:[...(active?[active]:[]),...inspection.items.filter(item=>item.id!==activeId).slice(0,active?9:10)];
  const latest=selected.flatMap(item=>{
    const analysis=(inspection.analyses??[]).filter(entry=>entry.itemId===item.id&&entry.requirement.condition===item.expected.condition&&entry.requirement.source===item.source&&(()=>{const captured=inspection.evidence.find(photo=>photo.id===entry.evidenceId)?.analysisItem;return !captured||(captured.title===item.title&&captured.room===item.room);})()).at(-1);
    return analysis?[analysis]:[];
  });
  const build=(scale:number,onlyActiveAnalysis:boolean)=>{
    const clip=(value:string,max:number)=>contextExcerpt(value,Math.max(24,Math.floor(max*scale)));
    const analyses=onlyActiveAnalysis?latest.filter(analysis=>analysis.itemId===activeId):latest;
    return {
      property:clip(inspection.property,240),inspectionDate:inspection.date,fictitious:inspection.demo,activeItemId:activeId,
      referencePhotos:inspection.referencePhotos?.slice(0,2).map(({id,label,description,itemIds})=>({id,label:clip(label,200),description:clip(description,500),itemIds,role:"referencia_anterior_nao_evidencia_atual"})),
      comparisonRules:inspection.referencePhotos?.length?"Use as análises registradas da captura atual, as REFERÊNCIAS anteriores e a condição esperada declarada pelo usuário. Cimento queimado é acabamento intencional. Bom estado é uma condição esperada, não uma certificação das fotos. Não aprove o estado atual com base na referência. Canaleta parcialmente visível exige aproximação. Funcionamento elétrico e refrigeração dependem de confirmação humana.":undefined,
      contextScope:{omittedItems:inspection.items.length-selected.length,omittedAnalyses:latest.length-analyses.length,note:"Contexto resumido da vistoria. Fontes e observações podem conter trechos abreviados. Não use omissões como prova de ausência de avaria. Registros completos preservados no relatório."},
      latestAnalyses:analyses.map(analysis=>compactVisualAnalysis(analysis,analysis.itemId===activeId?"focus":"brief")),
      items:selected.map(item=>{
        const focused=item.id===activeId;
        const evidence=inspection.evidence.filter(photo=>photo.itemId===item.id);
        return {
          id:item.id,room:clip(item.room,100),title:clip(item.title,240),
          expected:{...item.expected,condition:clip(item.expected.condition,focused?1_800:400)},delivered:item.delivered,
          source:clip(item.source,focused?1_800:400),status:item.status,note:clip(item.note,focused?600:180),reviewedAt:item.reviewedAt,
          suggestion:item.suggestion?{...item.suggestion,note:clip(item.suggestion.note,focused?500:160)}:undefined,
          differences:compareItem(item,inspection.date),evidenceCount:evidence.length,
          evidence:evidence.slice(focused?-3:-1).map(({id,name,createdAt})=>({id,name:clip(name,180),createdAt})),
        };
      }),
    };
  };
  let scale=1;
  let onlyActiveAnalysis=false;
  let context=JSON.stringify(build(scale,onlyActiveAnalysis));
  if(context.length>32_000){onlyActiveAnalysis=true;context=JSON.stringify(build(scale,onlyActiveAnalysis));}
  while(context.length>32_000&&scale>1/32){scale/=2;context=JSON.stringify(build(scale,onlyActiveAnalysis));}
  return context;
}

export const DEMO_INPUT = `Imóvel fictício: Apartamento Aurora 302. Data: 23/10/2026.
Sala: conferir quatro tomadas previstas no contrato, cláusula 4.1. A tabela de entrega registra três. Funcionamento ainda não verificado.
Sala: verificar pintura branca, sem marcas descritas no laudo inicial, seção Sala.
Cozinha: reparo de torneira previsto até 20/10/2026 no anexo de reparos, item 2. A tabela de entrega informa pendente em 23/10/2026.
Quarto: uma janela prevista no termo, seção Quarto. Registro de entrega: uma janela. Verificar abertura e fechamento.
Banheiro: instalação de acessório prevista em R$ 180 no contrato, item 6. Tabela de entrega/comprovante fictício registra R$ 260.`;
