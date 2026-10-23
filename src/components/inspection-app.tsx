"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ArrowRight,Camera,Check,CheckCheck,ChevronDown,ChevronRight,ClipboardList,FileText,Focus,House,ImagePlus,Info,LoaderCircle,Pencil,ScanLine,ShieldCheck,X} from "lucide-react";
import {useCamera} from "@/hooks/use-camera";
import {useLive as useRealtime} from "@/hooks/use-live";
import {useReferenceImages} from "@/hooks/use-reference-images";
import {useVisualInspection} from "@/hooks/use-visual-inspection";
import {analysisMatchesCurrentItem,restoreInterruptedAnalyses} from "@/lib/analysis-state";
import {referenceAnalysisSchema} from "@/lib/visual-analysis";
import {createRoomScenario,ROOM_SCENARIO_ID} from "@/lib/room-scenario";
import {compareItem,createDemo,dateLabel,inspectionContext,compactVisualAnalysis,statusLabel,type CheckItem,type CheckStatus,type Evidence,type Inspection} from "@/lib/inspection";
import {archiveInspection,downloadPreviousInspection,loadInspection,saveInspection} from "@/lib/storage";
import {ItemEditor} from "./item-editor";
import {Preparation} from "./preparation";
import {Report} from "./report";
import {ReferencePhotos} from "./reference-photos";
import {AnalysisCard} from "./analysis-card";
import {BaselineInventory} from "./baseline-inventory";
import {getWorkflow,updateWorkflow} from "@/lib/inspection-workflow";
import {canReviewSuggestion,getGuidedProgress} from "@/lib/guided-verification";
import {GuidedCamera} from "./guided-camera";
import {GuidedConversation} from "./guided-conversation";
import "./guided-verification.css";

type View="inspect"|"prepare"|"report";
type PhotoDraft={existingId?:string;dataUrl:string;itemId:string;name:string;origin:Evidence["origin"]};

type InspectionAppProps={initialInspection?:Inspection;initialItemId?:string;onInspectionChange?:(inspection:Inspection)=>void;onExit?:(inspection:Inspection)=>void;onComplete?:(inspection:Inspection)=>void};

export function InspectionApp({initialInspection,initialItemId,onInspectionChange,onExit,onComplete}:InspectionAppProps={}) {
  const initial=useRef({inspection:initialInspection,itemId:initialItemId});
  const embedded=!!onExit;
  const [inspection,setInspection]=useState<Inspection|null>(initialInspection??null);
  const [activeId,setActiveId]=useState(initialItemId??"sala-tomadas");
  const [view,setView]=useState<View>("inspect");
  const [checklistOpen,setChecklistOpen]=useState(false);
  const [sessionComplete,setSessionComplete]=useState(false);
  const completionRef=useRef(false);completionRef.current=sessionComplete;
  const [starting,setStarting]=useState(false);
  const [autoVoice,setAutoVoice]=useState(false);
  const startGeneration=useRef(0);
  const startingRef=useRef(false);
  const stageHeading=useRef<HTMLHeadingElement>(null);
  const [editing,setEditing]=useState<CheckItem|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [saveState,setSaveState]=useState("Carregando sessão…");
  const [configured,setConfigured]=useState<boolean|null>(null);
  const [message,setMessage]=useState("");
  const [chatBusy,setChatBusy]=useState(false);
  const [analysisInProgressId,setAnalysisInProgressId]=useState<string|undefined>();
  const analysisInProgressRef=useRef<string|undefined>(undefined);
  const [photoRequest,setPhotoRequest]=useState<{itemId:string;reason:string}|null>(null);
  const [photoDraft,setPhotoDraft]=useState<PhotoDraft|null>(null);
  const [scenarioBusy,setScenarioBusy]=useState(false);
  const [baselineBusy,setBaselineBusy]=useState(false);
  const baselineAbort=useRef<AbortController|null>(null);
  const photoDialog=useRef<HTMLDialogElement>(null);
  const imageInput=useRef<HTMLInputElement>(null);
  const chatEnd=useRef<HTMLDivElement>(null);
  const previousVoiceIds=useRef(new Set<string>());
  const inspectionRef=useRef(inspection);inspectionRef.current=inspection;
  const activeRef=useRef(activeId);activeRef.current=activeId;
  const textAbort=useRef<AbortController|null>(null);
  const camera=useCamera();
  const references=useReferenceImages(inspection?.referencePhotos);
  const context=useMemo(()=>inspection?inspectionContext(inspection,activeId,analysisInProgressId):"{}",[inspection,activeId,analysisInProgressId]);
  const onToolCall=useCallback((name:string,args:Record<string,unknown>)=>{
    const current=inspectionRef.current;
    if(!current)return {error:"Vistoria não carregada"};
    if(name==="get_inspection_context")return JSON.parse(inspectionContext(current,activeRef.current,analysisInProgressRef.current));
    const item=current.items.find(i=>i.id===args.itemId);
    if(!item)return {error:"Item desconhecido"};
    if(name==="request_photo_capture"){
      if(analysisInProgressRef.current)return {processing:true,message:"A foto já foi enviada e está em análise. Responda à pessoa sem pedir outra foto nem anunciar resultado."};
      if(completionRef.current)return {complete:true,message:"A verificação foi concluída. Oriente a abertura do relatório; não peça outra foto."};
      if(item.id!==activeRef.current)return {pending:true,message:"Mantenha o item ativo. O usuário confirma a revisão antes de avançar."};
      setActiveId(item.id);setPhotoRequest({itemId:item.id,reason:String(args.reason).slice(0,600)});
      return {pending:true,message:"Pedido exibido. Oriente o toque em Fotografar e analisar. Esse toque salva a captura e envia imediatamente para comparação; nenhuma conclusão é aprovada."};
    }
    if(name==="propose_observation"){
      if(analysisInProgressRef.current===item.id)return {processing:true,message:"A nova foto está em análise. A conclusão anterior não vale para esta captura; continue a conversa e aguarde o resultado."};
      const latestCapture=current.evidence.filter(photo=>photo.itemId===item.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).at(-1);
      if(latestCapture?.analysisState==="pending"||latestCapture?.analysisState==="error")return {pending:true,message:"A última foto ainda não tem resultado. Oriente reanalisar a foto preservada; não repita uma conclusão anterior como atual."};
      const analysis=current.analyses?.filter(a=>a.itemId===item.id&&analysisMatchesCurrentItem(current,a)).at(-1);
      if(!analysis)return {pending:true,message:"Ainda não existe análise registrada deste item. Oriente Fotografar e analisar; a foto e a conclusão serão vinculadas automaticamente."};
      return {recorded:true,reviewed:current.history.some(event=>event.analysisId===analysis.id&&event.action==="Análise confirmada pelo usuário"),...compactVisualAnalysis(analysis),message:"A análise já está registrada com evidência e fonte. Não crie outra conclusão; siga a próxima ação indicada e preserve a revisão humana."};
    }
    return {error:"Ação indisponível"};
  },[]);
  const realtime=useRealtime({context,onToolCall,referenceImages:references.images});
  const visual=useVisualInspection({inspection,setInspection,
    onBegin:itemId=>{analysisInProgressRef.current=itemId;setAnalysisInProgressId(itemId);textAbort.current?.abort();textAbort.current=null;setChatBusy(false);realtime.pauseForCapture();setNotice(null);},
    onFinish:completed=>{analysisInProgressRef.current=undefined;setAnalysisInProgressId(undefined);if(!completed)realtime.setAnalysisPending(false);},
    onError:setNotice,
    onResult:analysis=>{
      setPhotoRequest(request=>request?.itemId===analysis.itemId?null:request);
      appendMessage("assistant",`${analysis.result.summary}\n${analysis.result.nextAction}`);
      if(realtime.status==="connected"&&activeRef.current===analysis.itemId)void realtime.announceAnalysis(JSON.stringify({itemTitle:inspectionRef.current?.items.find(i=>i.id===analysis.itemId)?.title,...compactVisualAnalysis(analysis)}));
      else realtime.setAnalysisPending(false);
    },
  });

  useEffect(()=>{
    let live=true;
    (initial.current.inspection?Promise.resolve(initial.current.inspection):loadInspection()).then(saved=>{if(live){const next=saved?restoreInterruptedAnalyses(saved):createRoomScenario();setInspection(next);setActiveId(initial.current.itemId??next.items[0]?.id??"");setSaveState("Salvo neste navegador");}}).catch(()=>{if(live){setInspection(createRoomScenario());setSaveState("Armazenamento indisponível");setNotice("Não foi possível restaurar os dados locais. Exporte uma cópia antes de fechar.");}});
    fetch("/api/health").then(r=>r.json()).then(d=>{if(live)setConfigured(d.configured===true);}).catch(()=>{if(live)setConfigured(false);});
    return ()=>{live=false;startGeneration.current++;textAbort.current?.abort();baselineAbort.current?.abort();};
  },[]);
  useEffect(()=>{
    if(!inspection)return;
    const timeout=setTimeout(()=>{setSaveState("Salvando…");void saveInspection(inspection).then(()=>setSaveState("Salvo neste navegador")).catch((e:Error)=>{setSaveState("Falha ao salvar");setNotice(e.message);});},350);
    return ()=>clearTimeout(timeout);
  },[inspection]);
  useEffect(()=>{if(inspection)onInspectionChange?.(inspection);},[inspection,onInspectionChange]);
  useEffect(()=>{
    if(!realtime.messages.length){previousVoiceIds.current.clear();return;}
    const priorIds=previousVoiceIds.current;const incomingIds=new Set(realtime.messages.map(m=>m.id));previousVoiceIds.current=incomingIds;
    setInspection(old=>{if(!old)return old;const history=old.messages.filter(m=>!priorIds.has(m.id)&&!incomingIds.has(m.id));return {...old,messages:[...history,...realtime.messages].slice(-150)};});
  },[realtime.messages]);
  useEffect(()=>{const log=chatEnd.current?.parentElement;if(log)log.scrollTo({top:log.scrollHeight,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});},[inspection?.messages.length,realtime.messages,chatBusy]);
  useEffect(()=>{if(photoDraft&&!photoDialog.current?.open)photoDialog.current?.showModal();},[photoDraft]);
  useEffect(()=>{if(view!=="inspect"){startGeneration.current++;startingRef.current=false;setStarting(false);setAutoVoice(false);realtime.stop();camera.stop();}},[view,realtime.stop,camera.stop]);
  // Retain the user's start intent while reference images are still loading.
  useEffect(()=>{
    if(!autoVoice||!camera.active||configured===null||references.loading)return;
    setAutoVoice(false);
    if(configured===false||references.error){realtime.cancelPreparedAudio();return;}
    void realtime.start();
  },[autoVoice,camera.active,configured,references.loading,references.error,realtime.start,realtime.cancelPreparedAudio]);

  useEffect(()=>{
    if(configured===true&&inspection?.referencePhotos?.length)void prepareBaselines(true);
  },[configured,inspection?.id]);

  async function startGuidedSession(){
    if(startingRef.current||realtime.status==="closing")return;
    startingRef.current=true;setStarting(true);setNotice(null);
    const attempt=++startGeneration.current;
    realtime.prepareAudio();
    const opened=camera.active||await camera.start();
    if(attempt!==startGeneration.current)return;
    startingRef.current=false;setStarting(false);
    if(!opened){realtime.cancelPreparedAudio();return;}
    setAutoVoice(true);
  }
  function pauseGuidedSession(){
    startGeneration.current++;startingRef.current=false;setStarting(false);setAutoVoice(false);
    realtime.cancelPreparedAudio();realtime.stop();camera.stop();
  }

  const appendMessage=(role:"user"|"assistant",text:string)=>setInspection(old=>old?{...old,messages:[...old.messages,{id:crypto.randomUUID(),role,text}].slice(-150)}:old);
  async function sendText(text=message) {
    if(!text.trim()||chatBusy)return;
    setNotice(null);
    if(realtime.status==="connected"){
      if(realtime.sendText(text))setMessage("");
      return;
    }
    setMessage("");
    appendMessage("user",text);setChatBusy(true);
    const abort=new AbortController();textAbort.current=abort;
    const timeout=setTimeout(()=>abort.abort(),45000);
    try{
      const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,context,history:inspectionRef.current?.messages.slice(-12).map(({role,text})=>({role,text:text.slice(0,6000)}))}),signal:abort.signal});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"Não foi possível conversar com a IA.");
      appendMessage("assistant",data.text);
    }catch(e){if(!abort.signal.aborted||textAbort.current===abort)setNotice(e instanceof Error&&e.name!=="AbortError"?e.message:"A resposta demorou mais que o esperado. Tente novamente; seus dados foram mantidos.");}
    finally{clearTimeout(timeout);if(textAbort.current===abort){textAbort.current=null;setChatBusy(false);}}
  }
  function stopSession(){setAutoVoice(false);realtime.cancelPreparedAudio();realtime.stop();}
  function replaceInspection(next:Inspection){
    visual.cancel();baselineAbort.current?.abort();baselineAbort.current=null;setBaselineBusy(false);stopSession();camera.stop();realtime.clearMessages();textAbort.current?.abort();textAbort.current=null;setChatBusy(false);setInspection(next);setActiveId(next.items[0]?.id??"");setPhotoRequest(null);setPhotoDraft(null);setEditing(null);setMessage("");setSessionComplete(false);
  }
  async function loadPhotoScenario(){
    if(scenarioBusy)return;
    setScenarioBusy(true);stopSession();camera.stop();
    textAbort.current?.abort();textAbort.current=null;setChatBusy(false);
    try {
      const previous=inspectionRef.current;
      if(previous)await archiveInspection(previous);
      replaceInspection(createRoomScenario());setView("inspect");setChecklistOpen(false);
      setNotice("Cenário das duas fotos carregado. A vistoria anterior foi guardada e pode ser exportada na Preparação.");
    } catch(error){setNotice((error as Error).message);}
    finally{setScenarioBusy(false);}
  }
  async function exportPrevious(){
    try{if(!await downloadPreviousInspection())setNotice("Ainda não há uma vistoria anterior guardada.");}
    catch{setNotice("Não foi possível exportar a vistoria anterior.");}
  }
  function advanceAfterReview(current:Inspection,item:CheckItem){
    const progress=getGuidedProgress(current,item.id);
    setPhotoRequest(null);
    if(progress.complete){
      setSessionComplete(true);setAutoVoice(false);realtime.cancelPreparedAudio();camera.stop();
      appendMessage("assistant","Todos os itens foram revisados. A verificação está concluída; as divergências e os resultados inconclusivos permanecem no relatório.");
      if(realtime.status==="connected")void realtime.announceAnalysis(JSON.stringify({reviewedItem:item.title,verificationComplete:true,action:"Diga que todos os itens foram revisados e oriente Concluir e ver relatório. Preserve divergências e inconclusivos. Não peça mais fotos."}),"progress");
      return;
    }
    if(progress.nextItem){
      const next=progress.nextItem;
      setActiveId(next.id);
      setInspection(old=>old?updateWorkflow(old,{activeItemId:next.id,startedRooms:[...new Set([...getWorkflow(old).startedRooms,next.room])],finalizedAt:undefined}):old);
      appendMessage("assistant",`Agora vamos conferir ${next.title.toLocaleLowerCase("pt-BR")}, em ${next.room}. Enquadre o item e toque em Fotografar e analisar.`);
      if(realtime.status==="connected")void realtime.announceAnalysis(JSON.stringify({reviewedItem:item.title,nextItemId:next.id,nextItem:next.title,nextRoom:next.room,nextExpected:next.expected.condition,action:"Conduza o enquadramento do próximo item e aguarde a foto manual."}),"progress");
      requestAnimationFrame(()=>stageHeading.current?.focus({preventScroll:false}));
    }
  }
  function review(item:CheckItem,status:CheckStatus,note=item.note,action="Revisão manual",advance=false){
    const current=inspectionRef.current;if(!current)return;
    const at=new Date().toISOString();
    const proposed=current.analyses?.find(analysis=>analysis.id===item.suggestion?.analysisId);
    const analysisId=proposed&&analysisMatchesCurrentItem({...current,items:current.items.map(entry=>entry.id===item.id?item:entry)},proposed)?proposed.id:undefined;
    const next:Inspection={...current,items:current.items.map(entry=>entry.id===item.id?{...item,status,note,suggestion:undefined,reviewedAt:status==="pendente"?undefined:at}:entry),history:[...current.history,{id:crypto.randomUUID(),itemId:item.id,analysisId,status,at,action,note:`${statusLabel[status]}${note?`: ${note}`:""}`}]};
    setInspection(next);
    if(advance&&status!=="pendente")advanceAfterReview(next,item);
  }
  function capturePhoto(itemId=photoRequest?.itemId??activeId){
    try{void visual.capture(camera.capture(),"camera",itemId,photoRequest?.reason);}catch(e){setNotice((e as Error).message);}
  }
  async function prepareBaselines(background=false){
    const current=inspectionRef.current;if(!current?.referencePhotos?.length||baselineBusy)return;
    const controller=new AbortController();baselineAbort.current=controller;setBaselineBusy(true);if(!background)setNotice(null);
    try{
      const response=await fetch("/api/reference-analysis",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({references:current.referencePhotos.map(p=>p.id)})});
      const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Não foi possível ler as referências.");
      const baselines=referenceAnalysisSchema.array().parse(payload.baselines);
      if(!controller.signal.aborted)setInspection(old=>old?.id===current.id?{...old,baselines}:old);
    }catch(error){if(!controller.signal.aborted&&!background)setNotice((error as Error).message);}
    finally{if(baselineAbort.current===controller){baselineAbort.current=null;setBaselineBusy(false);}}
  }
  function confirmAndContinue(item:CheckItem){
    const current=inspectionRef.current;
    if(!current||visual.busy||!item.suggestion||!canReviewSuggestion(current,item.id))return;
    review(item,item.suggestion.status,item.suggestion.note,"Análise confirmada pelo usuário",true);
  }
  function finishVerification(){
    pauseGuidedSession();
    if(onComplete)onComplete(inspectionRef.current!);
    else setView("report");
  }
  async function uploadImage(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>10*1024*1024){setNotice("Escolha uma imagem JPEG, PNG ou WebP de até 10 MB.");return;}
    const reader=new FileReader();reader.onload=()=>setPhotoDraft({itemId:photoRequest?.itemId??activeId,dataUrl:String(reader.result),name:file.name,origin:"upload"});reader.onerror=()=>setNotice("Não foi possível abrir a imagem.");reader.readAsDataURL(file);
  }
  function savePhoto(){
    if(!photoDraft)return;const existing=inspection?.evidence.find(e=>e.id===photoDraft.existingId);const evidence:Evidence={...existing,dataUrl:photoDraft.dataUrl,itemId:existing?.analysisDataUrl?existing.itemId:photoDraft.itemId,name:photoDraft.name,origin:photoDraft.origin,id:existing?.id??crypto.randomUUID(),createdAt:existing?.createdAt??new Date().toISOString()};
    setInspection(old=>old?{...old,evidence:existing?old.evidence.map(e=>e.id===existing.id?evidence:e):[...old.evidence,evidence],history:[...old.history,{id:crypto.randomUUID(),itemId:evidence.itemId,at:new Date().toISOString(),action:existing?"Evidência atualizada":"Foto confirmada",note:evidence.name}]}:old);
    setPhotoDraft(null);setPhotoRequest(null);setNotice("Foto salva e vinculada ao item. A revisão continua sob seu controle.");
  }

  if(!inspection)return <main className="loading-screen"><div className="brand-mark"><ScanLine size={24}/></div><h1>ChaveCheck</h1><p>Preparando sua vistoria…</p></main>;
  const active=inspection.items.find(i=>i.id===activeId)??inspection.items[0];
  const rooms=[...new Set(inspection.items.map(i=>i.room))];
  const completed=inspection.items.filter(i=>i.status!=="pendente").length;
  const currentDiff=active?compareItem(active,inspection.date):[];
  const currentEvidence=inspection.evidence.filter(e=>e.itemId===active?.id);
  const latestAnalysis=inspection.analyses?.filter(a=>a.itemId===active?.id).at(-1);
  const pendingPhoto=inspection.evidence.find(e=>e.id===visual.progress.evidenceId);
  const failedPhotos=currentEvidence.filter(e=>e.analysisState==="error");
  const guidance=photoRequest?.itemId===active?.id?photoRequest.reason:latestAnalysis&&analysisMatchesCurrentItem(inspection,latestAnalysis)&&(active?.suggestion||latestAnalysis.result.needsPhoto)?latestAnalysis.result.nextAction:active?.id==="sala-paredes"?"Mostre a parede de frente, mantenha o celular parado e toque em Fotografar e analisar.":active?.id==="sala-canaleta"?"Aproxime a câmera da canaleta inferior. Inclua a tampa, as emendas e uma extremidade, sem tocar na instalação.":active?.id==="sala-ar"?"Enquadre o ar-condicionado inteiro e a parede ao redor. Toque em Fotografar e analisar.":active?.id==="sala-mobiliario"?"Mostre um grupo de móveis por vez, incluindo superfícies e bordas. Fotografe primeiro os armários, depois a mesa e as cadeiras.":"Enquadre o item de frente e toque em Fotografar e analisar. A captura fica vinculada a esta verificação.";
  const selectItem=(id:string)=>{setPhotoRequest(request=>request?.itemId===id?request:null);setActiveId(id);setInspection(old=>old?updateWorkflow(old,{activeItemId:id,finalizedAt:undefined}):old);setSessionComplete(false);setView("inspect");setChecklistOpen(false);};
  const roomItems=inspection.items.filter(item=>item.room===active?.room);
  const conformingCount=inspection.items.filter(item=>item.status==="conforme").length;
  const inconclusiveCount=inspection.items.filter(item=>item.status==="inconclusivo").length;
  const progress=getGuidedProgress(inspection,activeId);
  const reviewReady=active?canReviewSuggestion(inspection,active.id):false;
  return <div className={`app-shell guided-shell ${embedded?"wf-embedded":""}`}>
    {!embedded&&<header className="app-header">
      <a className="brand" href="/" aria-label="ChaveCheck, início"><span className="brand-mark"><ScanLine size={22}/></span><span>chave<span className="brand-light">check</span><span className="brand-dot">.</span></span></a>
      <nav className="main-nav" aria-label="Etapas da vistoria"><button aria-label="Preparação" className={view==="prepare"?"selected":""} onClick={()=>setView("prepare")}><ClipboardList size={16}/><span>Preparação</span></button><button aria-label="Vistoria ao vivo" className={view==="inspect"?"selected":""} onClick={()=>setView("inspect")}><Focus size={17}/><span>Vistoria ao vivo</span></button><button aria-label="Relatório" className={view==="report"?"selected":""} onClick={()=>{setView("report");}}><FileText size={16}/><span>Relatório</span></button></nav>
      <div className="header-status"><span className="badge neutral">Prova de conceito</span><span className="avatar" role="img" aria-label="Vistoriador">V</span></div>
    </header>}
    <main className="app-main">
      {embedded&&<div className="wf-item-heading"><button disabled={visual.busy||starting} onClick={()=>{pauseGuidedSession();onExit?.(inspection);}}><ChevronRight size={16} style={{transform:"rotate(180deg)"}}/>Cômodos / {active?.room}</button><div><div><h1 ref={stageHeading} tabIndex={-1}>{sessionComplete?"Verificação concluída":active?.title??"Conferir cômodo"}</h1><p>{sessionComplete?`${completed} de ${inspection.items.length} itens revisados`:`Item ${Math.max(1,roomItems.findIndex(item=>item.id===activeId)+1)} de ${roomItems.length} em ${active?.room}`}</p></div><button className="text-button" aria-expanded={checklistOpen} aria-controls="guided-checklist" onClick={()=>setChecklistOpen(!checklistOpen)}><ClipboardList size={16}/>Roteiro</button></div></div>}
      {!embedded&&<div className="property-bar"><div><div className="breadcrumb"><House size={13}/><span>Vistoria de entrega</span><ChevronRight size={12}/><span>{inspection.demo?"Caso fictício":"Sua vistoria"}</span></div><div className="property-title"><h1>{inspection.property}</h1><span className="badge neutral">Em revisão</span></div><p>{rooms.length} {rooms.length===1?"ambiente":"ambientes"} <span>·</span> {inspection.items.length} verificações <span>·</span> {dateLabel(inspection.date)}</p></div><button className="secondary report-shortcut" onClick={()=>{setView(view==="report"?"inspect":"report");}}><FileText size={16}/>{view==="report"?"Voltar à vistoria":"Ver relatório"}<ArrowRight size={15}/></button></div>}
      {(notice||realtime.error)&&<div className="notice" role="status"><Info size={17}/><span>{notice||realtime.error}</span><button className="icon-button" onClick={()=>{setNotice(null);if(realtime.error)realtime.stop();}} aria-label="Fechar aviso"><X size={16}/></button></div>}
      {!embedded&&inspection.scenarioId!==ROOM_SCENARIO_ID&&<div className="photo-scenario-banner"><div><strong>Experimente o cômodo das suas fotos</strong><p>Parede e canaleta · 2 verificações com as fotos anteriores.</p></div><button className="primary compact" disabled={scenarioBusy} onClick={loadPhotoScenario}>{scenarioBusy?"Carregando…":"Carregar cenário das fotos"}<ArrowRight size={15}/></button></div>}
      {!embedded&&view==="prepare"&&<Preparation inspection={inspection} onEdit={setEditing} onStart={()=>setView("inspect")} onMeta={(property,date)=>setInspection(old=>old?{...old,property,date}:old)} onReplace={(items,property,date,originalInput)=>replaceInspection({originalInput,version:1,id:crypto.randomUUID(),property,date,demo:false,items:items.map(i=>({...i,status:"pendente",note:""})),evidence:[],messages:[],history:[]})} onDemo={()=>replaceInspection(createDemo())} onPhotoDemo={loadPhotoScenario} scenarioBusy={scenarioBusy} onExportPrevious={exportPrevious}/>}
      {view==="report"&&<Report inspection={inspection} onBack={()=>setView("inspect")} onSelectItem={selectItem}/>}
      {view==="inspect"&&<>
        <div className="guided-progress"><span>{completed} de {inspection.items.length} itens revisados</span><progress value={completed} max={inspection.items.length||1} aria-label="Verificações revisadas"/></div>
        {checklistOpen&&<nav id="guided-checklist" className="guided-checklist" aria-label="Roteiro da vistoria">{rooms.map(room=><section key={room}><h2>{room}</h2>{inspection.items.filter(item=>item.room===room).map(item=><button key={item.id} disabled={visual.busy} aria-current={item.id===activeId?"step":undefined} onClick={()=>selectItem(item.id)}><span>{item.title}</span><span className={`badge ${item.status}`}>{statusLabel[item.status]}</span></button>)}</section>)}</nav>}
        {sessionComplete?<section className="guided-complete" aria-labelledby="guided-complete-heading"><CheckCheck size={36}/><h2 id="guided-complete-heading">Todos os itens foram revisados</h2><p>As fotos, comparações e suas decisões estão reunidas no relatório.</p><div className="guided-complete-counts"><span><strong>{conformingCount}</strong> {conformingCount===1?"conforme":"conformes"}</span><span><strong>{inspection.items.filter(item=>item.status==="divergencia").length}</strong> com divergência</span><span><strong>{inconclusiveCount}</strong> {inconclusiveCount===1?"inconclusivo":"inconclusivos"}</span></div><button className="primary" onClick={finishVerification}>Concluir e ver relatório<ArrowRight size={18}/></button>{realtime.status==="connected"&&<button className="text-button guided-completion-audio" onClick={stopSession}>Encerrar áudio da assistente</button>}</section>:<div className="guided-workspace">
          <div className="guided-capture-column">
            <GuidedCamera camera={camera} guidance={guidance} busy={visual.busy} starting={starting} canAnalyze={configured===true} onStart={()=>void startGuidedSession()} onStop={pauseGuidedSession} onCapture={()=>capturePhoto()} onUpload={()=>imageInput.current?.click()}/>
            {configured===false&&<p className="inline-error" role="alert">A IA está indisponível. Verifique a configuração para analisar fotos e conversar.</p>}
            {references.error&&<p className="inline-error" role="alert">{references.error} <button className="text-button" onClick={references.retry}>Carregar referências novamente</button></p>}
            {visual.busy&&<div className="analysis-progress" role="status">{pendingPhoto?<img src={pendingPhoto.dataUrl} alt="Foto enviada para análise"/>:<LoaderCircle className="spin" size={20}/>}<div><strong>{visual.progress.stage==="preparing"?"Salvando a foto…":"Comparando a foto…"}</strong><p>{inspection.items.find(item=>item.id===visual.progress.itemId)?.title}</p><button className="text-button" onClick={visual.cancel}>Cancelar análise e manter foto</button></div></div>}
            {failedPhotos.map(photo=><div className="analysis-failure" role="status" key={photo.id}><strong>Foto preservada</strong><p>{photo.analysisError}</p><button className="secondary" disabled={visual.busy||configured!==true} onClick={()=>visual.retry(photo)}>Reanalisar esta foto</button></div>)}
            {active?.suggestion&&latestAnalysis&&analysisMatchesCurrentItem(inspection,latestAnalysis)&&<section className="guided-result" aria-label="Resultado para revisar"><span className={`badge ${active.suggestion.status}`}>{statusLabel[active.suggestion.status]}</span><h2>{latestAnalysis.result.needsPhoto?"Vamos conferir mais um detalhe":reviewReady?"Confira o resultado para continuar":"Há uma captura pendente"}</h2><p>{latestAnalysis.result.summary}</p>{latestAnalysis.result.needsPhoto&&<p className="guided-result-action">{latestAnalysis.result.nextAction}</p>}<div className="guided-result-buttons">{reviewReady?<button className="primary" disabled={visual.busy} onClick={()=>confirmAndContinue(active)}>{progress.nextItem?"Confirmar e continuar":"Confirmar último item"}<ArrowRight size={17}/></button>:latestAnalysis.result.needsPhoto&&<button className="primary" disabled={!camera.active||visual.busy||configured!==true} onClick={()=>capturePhoto()}>Fotografar o detalhe<Camera size={17}/></button>}<button className="text-button" disabled={visual.busy} onClick={()=>setEditing({...active,note:active.suggestion!.note,status:active.suggestion!.status})}>Revisar manualmente</button></div></section>}
            {active&&active.status!=="pendente"&&!active.suggestion&&<div className="guided-reviewed"><span className={`badge ${active.status}`}>{statusLabel[active.status]}</span><button className="secondary" disabled={visual.busy} onClick={()=>advanceAfterReview(inspection,active)}>{progress.nextItem?"Continuar verificação":"Concluir verificação"}<ArrowRight size={16}/></button></div>}
          </div>
          <GuidedConversation voice={realtime} cameraActive={camera.active} starting={starting||autoVoice} complete={sessionComplete} messages={inspection.messages} message={message} busy={visual.busy} chatBusy={chatBusy} canStart={configured===true&&!references.loading&&!references.error} canSend={configured===true} endRef={chatEnd} onMessage={setMessage} onSend={()=>void sendText()} onStart={()=>void startGuidedSession()} onStop={stopSession}/>
        </div>}
        {!sessionComplete&&<div className="guided-records">
          {latestAnalysis&&<details key={`analysis-${activeId}`}><summary><FileText size={17}/>Ver comparação e justificativas<ChevronDown size={16}/></summary><AnalysisCard evidencePool={currentEvidence} requirementChanged={!analysisMatchesCurrentItem(inspection,latestAnalysis)} review={inspection.history.filter(event=>event.analysisId===latestAnalysis.id&&event.action!=="Análise visual registrada").at(-1)} analysis={latestAnalysis} evidence={inspection.evidence.find(e=>e.id===latestAnalysis.evidenceId)} referencePhotos={inspection.referencePhotos??[]}/></details>}
          {active&&<details key={`source-${activeId}`}><summary><ClipboardList size={17}/>Condição esperada e referências<ChevronDown size={16}/></summary><div className="guided-source"><h2>{active.title}</h2><p>{active.expected.condition||"Condição não informada."}</p><p className="muted">{active.source||"Fonte não informada."}</p>{currentDiff.map(diff=><p key={diff.kind}>{diff.kind}: {diff.expected} previsto → {diff.delivered} registrado na entrega.</p>)}<button className="text-button" disabled={visual.busy} onClick={()=>setEditing(active)}><Pencil size={15}/>Editar item ou registrar revisão</button></div>{inspection.referencePhotos?.length?<ReferencePhotos photos={inspection.referencePhotos.filter(photo=>photo.itemIds.includes(activeId))} title="Fotos de referência" compact/>:null}{inspection.baselines?.length?<BaselineInventory baselines={inspection.baselines} photos={inspection.referencePhotos??[]}/>:inspection.referencePhotos?.length?<button className="text-button" disabled={baselineBusy||visual.busy||configured!==true} onClick={()=>void prepareBaselines()}>{baselineBusy?"Lendo fotos iniciais…":"Ver detalhes das fotos iniciais"}</button>:null}</details>}
          <details key={`evidence-${activeId}`}><summary><ImagePlus size={17}/>Fotos deste item ({currentEvidence.length})<ChevronDown size={16}/></summary>{currentEvidence.length?<div className="evidence-list">{currentEvidence.map(photo=><button key={photo.id} className="evidence-thumb" onClick={()=>setPhotoDraft({existingId:photo.id,dataUrl:photo.dataUrl,itemId:photo.itemId,name:photo.name,origin:photo.origin})} title={`Ver ${photo.name}`}><img src={photo.dataUrl} alt={photo.name}/><span>{photo.name}</span></button>)}</div>:<p>As fotos aparecerão aqui depois da captura.</p>}</details>
        </div>}
      </>}
      <footer className="app-footer"><span><span className={`save-dot ${saveState.includes("Falha")?"error":""}`}/>{saveState}</span><span><ShieldCheck size={13}/>Evidências atuais e revisões salvas neste navegador</span><span>ChaveCheck · Hackathon 2026</span></footer>
    </main>
    <input ref={imageInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage}/>
    {editing&&<ItemEditor key={editing.id} item={editing} onClose={()=>setEditing(null)} onSave={item=>{review(item,item.status,item.note,"Item editado pelo usuário",true);setEditing(null);}}/>}
    {photoDraft&&<dialog ref={photoDialog} className="dialog photo-dialog" aria-labelledby="photo-title" onCancel={()=>setPhotoDraft(null)}><div className="dialog-heading"><div><span className="muted">Evidência da vistoria</span><h2 id="photo-title">{photoDraft.existingId?"Revisar evidência":"Revise antes de analisar"}</h2></div><button className="icon-button" onClick={()=>setPhotoDraft(null)} aria-label="Fechar foto"><X size={20}/></button></div><img className="photo-preview" src={photoDraft.dataUrl} alt="Foto capturada para revisão"/><label className="field">Descrição<input maxLength={180} value={photoDraft.name} onChange={e=>setPhotoDraft({...photoDraft,name:e.target.value})}/></label><label className="field">Vincular ao item<select disabled={!!photoDraft.existingId&&!!inspection.evidence.find(e=>e.id===photoDraft.existingId)?.analysisDataUrl} value={photoDraft.itemId} onChange={e=>setPhotoDraft({...photoDraft,itemId:e.target.value})}>{inspection.items.map(i=><option key={i.id} value={i.id}>{i.room} · {i.title}</option>)}</select></label><p className="muted small">{photoDraft.existingId?"A foto usada em uma análise mantém o vínculo original para preservar a comparação.":"Enviar salva a imagem neste navegador e inicia a comparação imediatamente. Isso não aprova o item."}</p><div className="dialog-actions">{photoDraft.existingId&&!inspection.evidence.find(e=>e.id===photoDraft.existingId)?.analysisDataUrl&&<button className="text-button" onClick={()=>{if(window.confirm("Excluir esta foto da vistoria?")){setInspection(old=>old?{...old,evidence:old.evidence.filter(e=>e.id!==photoDraft.existingId),history:[...old.history,{id:crypto.randomUUID(),itemId:photoDraft.itemId,at:new Date().toISOString(),action:"Evidência excluída",note:photoDraft.name}]}:old);setPhotoDraft(null);}}}>Excluir foto</button>}<button className="secondary" onClick={()=>setPhotoDraft(null)}>{photoDraft.existingId?"Cancelar":"Descartar"}</button><button className="primary" disabled={!photoDraft.name.trim()||visual.busy||(!photoDraft.existingId&&configured===false)} onClick={()=>{if(photoDraft.existingId){savePhoto();return;}const draft=photoDraft;setPhotoDraft(null);void visual.capture(draft.dataUrl,draft.origin,draft.itemId,photoRequest?.reason,undefined,draft.name);}}><Check size={16}/>{photoDraft.existingId?"Salvar alterações":"Enviar e analisar"}</button></div></dialog>}
  </div>;
}
