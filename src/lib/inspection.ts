export type CheckStatus = "pendente" | "conforme" | "divergencia" | "inconclusivo";
export interface CheckItem {
  id: string; room: string; title: string;
  expected: {quantity: number | null; value: number | null; dueDate: string | null; condition: string};
  delivered: {quantity: number | null; value: number | null; completedDate: string | null; status: "entregue" | "pendente" | "nao_informado"};
  source: string;
  status: CheckStatus;
  note: string;
  suggestion?: {status: Exclude<CheckStatus, "pendente">; note: string};
  reviewedAt?: string;
}
export interface Evidence {id:string;itemId:string;dataUrl:string;createdAt:string;name:string;origin:"camera"|"upload"}
export interface ReviewEvent {id: string; itemId: string; at: string; action: string; note: string}
export interface ReferencePhoto {id: string; url: string; label: string; description: string; itemIds: string[]}
export interface Inspection {
  version: 1; id: string; property: string; date: string; demo: boolean; originalInput?: string;
  scenarioId?: string; referencePhotos?: ReferencePhoto[];
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

export function inspectionContext(inspection:Inspection,activeId:string) {
  return JSON.stringify({property:inspection.property,inspectionDate:inspection.date,fictitious:inspection.demo,activeItemId:activeId,referencePhotos:inspection.referencePhotos?.map(({id,label,description,itemIds})=>({id,label,description,itemIds,role:"referencia_anterior_nao_evidencia_atual"})),comparisonRules:inspection.referencePhotos?.length?"Compare as imagens ATUAIS com as REFERÊNCIAS anteriores e a condição esperada declarada pelo usuário. A textura de cimento queimado é acabamento intencional, não avaria. Ausência de avarias é a condição esperada para o teste, não uma certificação das fotos. Não aprove o estado atual com base na referência; peça enquadramento equivalente e aproximações, especialmente da canaleta inferior parcialmente visível. Funcionamento elétrico e refrigeração dependem de confirmação humana.":undefined,items:inspection.items.map(item=>({...item,differences:compareItem(item,inspection.date),evidence:inspection.evidence.filter(e=>e.itemId===item.id).map(({id,name,createdAt})=>({id,name,createdAt}))}))});
}

export const DEMO_INPUT = `Imóvel fictício: Apartamento Aurora 302. Data: 23/10/2026.
Sala: conferir quatro tomadas previstas no contrato, cláusula 4.1. A tabela de entrega registra três. Funcionamento ainda não verificado.
Sala: verificar pintura branca, sem marcas descritas no laudo inicial, seção Sala.
Cozinha: reparo de torneira previsto até 20/10/2026 no anexo de reparos, item 2. A tabela de entrega informa pendente em 23/10/2026.
Quarto: uma janela prevista no termo, seção Quarto. Registro de entrega: uma janela. Verificar abertura e fechamento.
Banheiro: instalação de acessório prevista em R$ 180 no contrato, item 6. Tabela de entrega/comprovante fictício registra R$ 260.`;
