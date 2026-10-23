"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ArrowRight,ArrowUp,Camera,CameraOff,Check,CheckCheck,ChevronDown,ChevronRight,ClipboardList,FileText,Focus,House,ImagePlus,Info,LoaderCircle,Maximize2,MessageCircle,Mic,MicOff,MoreHorizontal,Pause, Pencil,Radio,RefreshCw,ScanLine,ShieldCheck,Sparkles,Square,Volume2,X} from "lucide-react";
import {useCamera} from "@/hooks/use-camera";
import {useRealtime} from "@/hooks/use-realtime";
import {useReferenceImages} from "@/hooks/use-reference-images";
import {createRoomScenario,ROOM_SCENARIO_ID} from "@/lib/room-scenario";
import {compareItem,createDemo,dateLabel,inspectionContext,money,statusLabel,type CheckItem,type CheckStatus,type Evidence,type Inspection} from "@/lib/inspection";
import {archiveInspection,downloadPreviousInspection,loadInspection,saveInspection} from "@/lib/storage";
import {ItemEditor} from "./item-editor";
import {Preparation} from "./preparation";
import {Report} from "./report";
import {ReferencePhotos} from "./reference-photos";

type View="inspect"|"prepare"|"report";
type PhotoDraft={existingId?:string;dataUrl:string;itemId:string;name:string;origin:Evidence["origin"]};

export function InspectionApp() {
  const [inspection,setInspection]=useState<Inspection|null>(null);
  const [activeId,setActiveId]=useState("sala-tomadas");
  const [view,setView]=useState<View>("inspect");
  const [mobileTab,setMobileTab]=useState<"camera"|"chat"|"checks">("camera");
  const [editing,setEditing]=useState<CheckItem|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [saveState,setSaveState]=useState("Carregando sessão…");
  const [configured,setConfigured]=useState<boolean|null>(null);
  const [message,setMessage]=useState("");
  const [chatBusy,setChatBusy]=useState(false);
  const [sharing,setSharing]=useState(false);
  const [frames,setFrames]=useState(0);
  const [photoRequest,setPhotoRequest]=useState<{itemId:string;reason:string}|null>(null);
  const [photoDraft,setPhotoDraft]=useState<PhotoDraft|null>(null);
  const [scenarioBusy,setScenarioBusy]=useState(false);
  const photoDialog=useRef<HTMLDialogElement>(null);
  const imageInput=useRef<HTMLInputElement>(null);
  const chatEnd=useRef<HTMLDivElement>(null);
  const inspectionRef=useRef(inspection);inspectionRef.current=inspection;
  const activeRef=useRef(activeId);activeRef.current=activeId;
  const textAbort=useRef<AbortController|null>(null);
  const camera=useCamera();
  const references=useReferenceImages(inspection?.referencePhotos);
  const context=useMemo(()=>inspection?inspectionContext(inspection,activeId):"{}",[inspection,activeId]);
  const onToolCall=useCallback((name:string,args:Record<string,unknown>)=>{
    const current=inspectionRef.current;
    if(!current)return {error:"Vistoria não carregada"};
    if(name==="get_inspection_context")return JSON.parse(inspectionContext(current,activeRef.current));
    const item=current.items.find(i=>i.id===args.itemId);
    if(!item)return {error:"Item desconhecido"};
    if(name==="request_photo_capture"){
      setPhotoRequest({itemId:item.id,reason:String(args.reason).slice(0,600)});
      return {pending:true,message:"Pedido exibido. O usuário precisa capturar e confirmar a foto na tela; nenhuma foto foi salva ainda."};
    }
    if(name==="propose_observation"){
      const status=args.status as Exclude<CheckStatus,"pendente">;
      if(!["conforme","divergencia","inconclusivo"].includes(status))return {error:"Status inválido"};
      const note=String(args.note).slice(0,2000);
      setInspection(old=>old?{...old,items:old.items.map(i=>i.id===item.id?{...i,suggestion:{status,note}}:i)}:old);
      return {proposed:true,reviewed:false,message:"Sugestão enviada para revisão humana, sem alterar a conclusão do item."};
    }
    return {error:"Ação indisponível"};
  },[]);
  const realtime=useRealtime({context,onToolCall,referenceImages:references.images});

  useEffect(()=>{
    let live=true;
    loadInspection().then(saved=>{if(live){const next=saved??createRoomScenario();setInspection(next);setActiveId(next.items[0]?.id??"");setSaveState("Salvo neste navegador");}}).catch(()=>{if(live){setInspection(createRoomScenario());setSaveState("Armazenamento indisponível");setNotice("Não foi possível restaurar os dados locais. Exporte uma cópia antes de fechar.");}});
    fetch("/api/health").then(r=>r.json()).then(d=>{if(live)setConfigured(d.configured===true);}).catch(()=>{if(live)setConfigured(false);});
    return ()=>{live=false;textAbort.current?.abort();};
  },[]);
  useEffect(()=>{
    if(!inspection)return;
    const timeout=setTimeout(()=>{setSaveState("Salvando…");void saveInspection(inspection).then(()=>setSaveState("Salvo neste navegador")).catch((e:Error)=>{setSaveState("Falha ao salvar");setNotice(e.message);});},350);
    return ()=>clearTimeout(timeout);
  },[inspection]);
  useEffect(()=>{
    if(!realtime.messages.length)return;
    setInspection(old=>{if(!old)return old;const merged=new Map(old.messages.map(m=>[m.id,m]));for(const m of realtime.messages)merged.set(m.id,m);return {...old,messages:[...merged.values()].slice(-150)};});
  },[realtime.messages]);
  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth",block:"nearest"});},[inspection?.messages.length,realtime.messages,chatBusy]);
  useEffect(()=>{if(photoDraft&&!photoDialog.current?.open)photoDialog.current?.showModal();},[photoDraft]);
  useEffect(()=>{if(view!=="inspect"){realtime.stop();camera.stop();setSharing(false);}},[view,realtime.stop,camera.stop]);
  useEffect(()=>{if(realtime.status!=="connected"||!camera.active)setSharing(false);},[realtime.status,camera.active]);
  useEffect(()=>{
    if(!sharing||!camera.active||realtime.status!=="connected")return;
    const timer=setInterval(()=>{
      if(document.visibilityState!=="visible"||realtime.isSpeaking)return;
      try{realtime.sendImage(camera.capture(true),"Quadro compartilhado com autorização. Comente apenas algo útil ao item ativo; peça confirmação para qualquer conclusão e solicite uma foto separada se necessário.");setFrames(n=>n+1);}catch{}
    },10000);
    return ()=>clearInterval(timer);
  },[sharing,camera.active,camera.capture,realtime.status,realtime.isSpeaking,realtime.sendImage]);

  const appendMessage=(role:"user"|"assistant",text:string)=>setInspection(old=>old?{...old,messages:[...old.messages,{id:crypto.randomUUID(),role,text}].slice(-150)}:old);
  async function sendText(text=message,image?:string) {
    if(!text.trim()||chatBusy)return;
    setMessage("");setNotice(null);
    if(realtime.status==="connected"){
      if(image){realtime.sendImage(image,text);setFrames(n=>n+1);}else realtime.sendText(text);
      return;
    }
    appendMessage("user",image?`${text}\n[Quadro enviado para análise]`:text);setChatBusy(true);
    const abort=new AbortController();textAbort.current=abort;
    const timeout=setTimeout(()=>abort.abort(),45000);
    try{
      const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,context,image,references:inspectionRef.current?.referencePhotos?.map(p=>p.id),history:inspectionRef.current?.messages.slice(-12).map(({role,text})=>({role,text:text.slice(0,6000)}))}),signal:abort.signal});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"Não foi possível conversar com a IA.");
      appendMessage("assistant",data.text);if(image)setFrames(n=>n+1);
    }catch(e){if(!abort.signal.aborted||textAbort.current===abort)setNotice(e instanceof Error&&e.name!=="AbortError"?e.message:"A resposta demorou mais que o esperado. Tente novamente; seus dados foram mantidos.");}
    finally{clearTimeout(timeout);if(textAbort.current===abort){textAbort.current=null;setChatBusy(false);}}
  }
  function stopSession(){realtime.stop();setSharing(false);}
  function replaceInspection(next:Inspection){
    stopSession();camera.stop();realtime.clearMessages();textAbort.current?.abort();textAbort.current=null;setChatBusy(false);setInspection(next);setActiveId(next.items[0]?.id??"");setPhotoRequest(null);setPhotoDraft(null);setEditing(null);setMessage("");setFrames(0);
  }
  async function loadPhotoScenario(){
    if(scenarioBusy)return;
    setScenarioBusy(true);stopSession();camera.stop();
    textAbort.current?.abort();textAbort.current=null;setChatBusy(false);
    try {
      const previous=inspectionRef.current;
      if(previous)await archiveInspection(previous);
      replaceInspection(createRoomScenario());setView("inspect");setMobileTab("camera");
      setNotice("Cenário das duas fotos carregado. A vistoria anterior foi guardada e pode ser exportada na Preparação.");
    } catch(error){setNotice((error as Error).message);}
    finally{setScenarioBusy(false);}
  }
  async function exportPrevious(){
    try{if(!await downloadPreviousInspection())setNotice("Ainda não há uma vistoria anterior guardada.");}
    catch{setNotice("Não foi possível exportar a vistoria anterior.");}
  }
  function review(item:CheckItem,status:CheckStatus,note=item.note,action="Revisão manual"){
    const at=new Date().toISOString();
    setInspection(old=>old?{...old,items:old.items.map(i=>i.id===item.id?{...item,status,note,suggestion:undefined,reviewedAt:status==="pendente"?undefined:at}:i),history:[...old.history,{id:crypto.randomUUID(),itemId:item.id,at,action,note:`${statusLabel[status]}${note?`: ${note}`:""}`}]}:old);
  }
  function capturePhoto(itemId=photoRequest?.itemId??activeId){
    try{const item=inspection?.items.find(i=>i.id===itemId);setPhotoDraft({itemId,dataUrl:camera.capture(),name:item?.title??"Evidência",origin:"camera"});}catch(e){setNotice((e as Error).message);}
  }
  async function uploadImage(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>10*1024*1024){setNotice("Escolha uma imagem JPEG, PNG ou WebP de até 10 MB.");return;}
    const reader=new FileReader();reader.onload=()=>setPhotoDraft({itemId:photoRequest?.itemId??activeId,dataUrl:String(reader.result),name:file.name,origin:"upload"});reader.onerror=()=>setNotice("Não foi possível abrir a imagem.");reader.readAsDataURL(file);
  }
  function savePhoto(){
    if(!photoDraft)return;const existing=inspection?.evidence.find(e=>e.id===photoDraft.existingId);const evidence:Evidence={dataUrl:photoDraft.dataUrl,itemId:photoDraft.itemId,name:photoDraft.name,origin:photoDraft.origin,id:existing?.id??crypto.randomUUID(),createdAt:existing?.createdAt??new Date().toISOString()};
    setInspection(old=>old?{...old,evidence:existing?old.evidence.map(e=>e.id===existing.id?evidence:e):[...old.evidence,evidence],history:[...old.history,{id:crypto.randomUUID(),itemId:evidence.itemId,at:new Date().toISOString(),action:existing?"Evidência atualizada":"Foto confirmada",note:evidence.name}]}:old);
    setPhotoDraft(null);setPhotoRequest(null);setNotice("Foto salva e vinculada ao item. A revisão continua sob seu controle.");
  }

  if(!inspection)return <main className="loading-screen"><div className="brand-mark"><ScanLine size={24}/></div><h1>ChaveCheck</h1><p>Preparando sua vistoria…</p></main>;
  const active=inspection.items.find(i=>i.id===activeId)??inspection.items[0];
  const rooms=[...new Set(inspection.items.map(i=>i.room))];
  const completed=inspection.items.filter(i=>i.status!=="pendente").length;
  const differences=inspection.items.flatMap(i=>compareItem(i,inspection.date));
  const currentDiff=active?compareItem(active,inspection.date):[];
  const currentEvidence=inspection.evidence.filter(e=>e.itemId===active?.id);
  const connected=realtime.status==="connected";
  const selectItem=(id:string)=>{setActiveId(id);setView("inspect");setMobileTab("camera");};
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="/" aria-label="ChaveCheck, início"><span className="brand-mark"><ScanLine size={22}/></span><span>chave<span className="brand-light">check</span><span className="brand-dot">.</span></span></a>
      <nav className="main-nav" aria-label="Etapas da vistoria"><button aria-label="Preparação" className={view==="prepare"?"selected":""} onClick={()=>setView("prepare")}><ClipboardList size={16}/><span>Preparação</span></button><button aria-label="Vistoria ao vivo" className={view==="inspect"?"selected":""} onClick={()=>setView("inspect")}><Focus size={17}/><span>Vistoria ao vivo</span></button><button aria-label="Relatório" className={view==="report"?"selected":""} onClick={()=>{setSharing(false);setView("report");}}><FileText size={16}/><span>Relatório</span></button></nav>
      <div className="header-status"><span className="badge neutral">Prova de conceito</span><span className="avatar" role="img" aria-label="Vistoriador">V</span></div>
    </header>
    <main className="app-main">
      <div className="property-bar"><div><div className="breadcrumb"><House size={13}/><span>Vistoria de entrega</span><ChevronRight size={12}/><span>{inspection.demo?"Caso fictício":"Sua vistoria"}</span></div><div className="property-title"><h1>{inspection.property}</h1><span className="badge neutral">Em revisão</span></div><p>{rooms.length} {rooms.length===1?"ambiente":"ambientes"} <span>·</span> {inspection.items.length} verificações <span>·</span> {dateLabel(inspection.date)}</p></div><button className="secondary report-shortcut" onClick={()=>{setSharing(false);setView(view==="report"?"inspect":"report");}}><FileText size={16}/>{view==="report"?"Voltar à vistoria":"Ver relatório"}<ArrowRight size={15}/></button></div>
      {(notice||realtime.error)&&<div className="notice" role="status"><Info size={17}/><span>{notice||realtime.error}</span><button className="icon-button" onClick={()=>{setNotice(null);if(realtime.error)realtime.stop();}} aria-label="Fechar aviso"><X size={16}/></button></div>}
      {inspection.scenarioId!==ROOM_SCENARIO_ID&&<div className="photo-scenario-banner"><div><strong>Experimente o cômodo das suas fotos</strong><p>Paredes, canaleta, ar-condicionado e mobiliário · 2 referências anteriores.</p></div><button className="primary compact" disabled={scenarioBusy} onClick={loadPhotoScenario}>{scenarioBusy?"Carregando…":"Carregar cenário das fotos"}<ArrowRight size={15}/></button></div>}
      {view==="prepare"&&<Preparation inspection={inspection} onEdit={setEditing} onStart={()=>setView("inspect")} onMeta={(property,date)=>setInspection(old=>old?{...old,property,date}:old)} onReplace={(items,property,date,originalInput)=>replaceInspection({originalInput,version:1,id:crypto.randomUUID(),property,date,demo:false,items:items.map(i=>({...i,status:"pendente",note:""})),evidence:[],messages:[],history:[]})} onDemo={()=>replaceInspection(createDemo())} onPhotoDemo={loadPhotoScenario} scenarioBusy={scenarioBusy} onExportPrevious={exportPrevious}/>}
      {view==="report"&&<Report inspection={inspection} onBack={()=>setView("inspect")} onSelectItem={selectItem}/>}
      {view==="inspect"&&<>
        <div className="mobile-tabs" role="tablist" aria-label="Área da vistoria">{([{key:"camera",label:"Câmera",icon:Camera},{key:"chat",label:"Conversa",icon:MessageCircle},{key:"checks",label:`Roteiro ${completed}/${inspection.items.length}`,icon:ClipboardList}] as const).map(t=><button key={t.key} role="tab" aria-selected={mobileTab===t.key} onClick={()=>setMobileTab(t.key)}><t.icon size={16}/>{t.label}</button>)}</div>
        <div className={`inspection-workspace mobile-${mobileTab}`}>
          <aside className="checklist-panel"><div className="panel-heading"><h2>Roteiro da vistoria</h2><button className="icon-button" onClick={()=>setView("prepare")} aria-label="Editar roteiro"><Pencil size={15}/></button></div><div className="progress-copy"><span>{completed} de {inspection.items.length} revisados</span><strong>{Math.round(completed/inspection.items.length*100)||0}%</strong></div><progress value={completed} max={inspection.items.length||1} aria-label="Verificações revisadas"/>
            <div className="room-list">{rooms.map(room=><section key={room}><div className="room-title"><House size={14}/><h3>{room}</h3><span>{inspection.items.filter(i=>i.room===room&&i.status!=="pendente").length}/{inspection.items.filter(i=>i.room===room).length}</span></div>{inspection.items.filter(i=>i.room===room).map(item=><button key={item.id} className={`checklist-item ${active?.id===item.id?"active":""}`} onClick={()=>selectItem(item.id)}><span className={`check-indicator ${item.status}`}>{item.status==="conforme"?<Check size={12}/>:item.status==="divergencia"?"!":item.status==="inconclusivo"?"?":null}</span><span className="checklist-copy">{item.title}<small>{item.suggestion?"Sugestão para revisar":statusLabel[item.status]}</small></span>{active?.id===item.id&&<ChevronRight size={14}/>}</button>)}</section>)}</div>
            <div className="source-count"><FileText size={17}/><div><strong>{inspection.referencePhotos?.length?`${inspection.referencePhotos.length} fotos de referência`:`${differences.length} diferenças nos registros`}</strong><span>{inspection.referencePhotos?.length?"Compare com o ambiente atual":"Quantidade, prazo e valor"}</span></div></div><button className="text-button" onClick={()=>setView("prepare")}>Revisar dados de entrada <ArrowRight size={14}/></button>
          </aside>
          <section className="camera-column" aria-label="Câmera e verificação ativa">
            <div className="camera-panel"><div className="camera-topbar"><span className={`camera-status ${camera.active?"on":""}`}><span/>{camera.active?"Câmera ao vivo":"Câmera desligada"}</span><span className="camera-room"><House size={13}/>{active?.room??"Ambiente"}</span></div>
              <video ref={camera.attach} autoPlay muted playsInline className={`camera-video ${camera.active?"visible":""} ${camera.facing==="user"?"mirrored":""}`} aria-label="Imagem ao vivo da câmera"/>
              {!camera.active&&<div className="camera-empty"><div className="camera-glyph"><Camera size={36} strokeWidth={1.25}/><span className="viewfinder tl"/><span className="viewfinder tr"/><span className="viewfinder bl"/><span className="viewfinder br"/></div><h2>Seu olhar, com uma ajuda.</h2><p>Mostre o ambiente. A assistente orienta<br/>o que conferir, um item de cada vez.</p><button className="camera-start" disabled={camera.loading} onClick={()=>camera.start()}>{camera.loading?<LoaderCircle className="spin" size={16}/>:<Camera size={16}/>} {camera.loading?"Abrindo câmera…":"Ativar câmera"}</button><small>Você decide quando compartilhar e salvar.</small></div>}
              {camera.active&&<><div className="frame-corner corner-tl"/><div className="frame-corner corner-tr"/><div className="frame-corner corner-bl"/><div className="frame-corner corner-br"/><div className="camera-live-caption">{sharing?"Compartilhando 1 quadro a cada 10 segundos":"Prévia privada · nenhum quadro enviado automaticamente"}</div></>}
              <div className="camera-toolbar"><button className="camera-tool" disabled={!camera.active} onClick={camera.switchCamera} aria-label="Trocar câmera"><RefreshCw size={18}/></button><button className="shutter" disabled={!camera.active} onClick={()=>capturePhoto()} aria-label="Fotografar evidência"><span/></button><button className="camera-tool" onClick={()=>imageInput.current?.click()} aria-label="Anexar foto"><ImagePlus size={19}/></button>{camera.active&&<button className="camera-off" onClick={()=>{camera.stop();setSharing(false);}} aria-label="Desligar câmera"><CameraOff size={16}/></button>}</div>
            </div>
            {camera.error&&<p className="inline-error" role="alert">{camera.error}</p>}
            <div className="vision-controls"><button className="secondary compact" disabled={!camera.active||chatBusy||configured===false} onClick={()=>{try{void sendText("Observe o quadro atual e me oriente sobre o item ativo. Separe o que é visível do que precisa da minha confirmação.",camera.capture(true));}catch(e){setNotice((e as Error).message);}}}><ScanLine size={16}/>Analisar agora</button><label className="switch-label"><input type="checkbox" checked={sharing} disabled={!camera.active||!connected} onChange={e=>setSharing(e.target.checked)}/><span className="switch"/>Compartilhar ao vivo</label></div>
            <p className="camera-help">{sharing?"Quadros reduzidos enviados à OpenAI; fotos de evidência exigem confirmação.":`${frames} quadro${frames!==1?"s":""} enviado${frames!==1?"s":""} nesta sessão. Ative a voz para compartilhar ao vivo.`}</p>
            {inspection.referencePhotos?.length?<ReferencePhotos photos={inspection.referencePhotos.filter(p=>p.itemIds.includes(activeId))} title="Compare com a referência" compact/>:null}
            {photoRequest&&<div className="capture-request"><Camera size={20}/><div><strong>A assistente pediu uma foto</strong><p>{photoRequest.reason}</p><small>{inspection.items.find(i=>i.id===photoRequest.itemId)?.title}</small><div className="inline-actions"><button className="primary compact" disabled={!camera.active} onClick={()=>capturePhoto(photoRequest.itemId)}>Capturar e revisar</button><button className="text-button" onClick={()=>imageInput.current?.click()}>Anexar</button><button className="text-button" onClick={()=>setPhotoRequest(null)}>Agora não</button></div></div></div>}
            {active&&<div className="active-check"><div className="active-check-heading"><div><span className="eyebrow">Conferindo agora</span><h2>{active.title}</h2></div><button className="icon-button" onClick={()=>setEditing(active)} aria-label="Editar item atual"><Pencil size={16}/></button></div><p>{active.expected.condition||"Condição não informada. Confirme com a fonte antes de concluir."}</p>{currentDiff.length>0&&<div className="comparison-strip">{currentDiff.map(d=><div key={d.kind}><span>{d.kind}</span><strong>{d.expected}<ArrowRight size={14}/>{d.delivered}</strong><small>Previsto → registro de entrega</small></div>)}</div>}<details className="source-details"><summary><FileText size={13}/>Ver fonte do item<ChevronDown size={13}/></summary><p>{active.source||"Fonte não informada."}</p></details>
              {active.suggestion&&<div className="suggestion"><span className="badge amber"><Sparkles size={12}/>Sugestão da IA · {statusLabel[active.suggestion.status]}</span><p>{active.suggestion.note}</p><div className="inline-actions"><button className="primary compact" onClick={()=>review(active,active.suggestion!.status,active.suggestion!.note,"Sugestão aprovada pelo usuário")}>Confirmar sugestão</button><button className="secondary compact" onClick={()=>setEditing({...active,note:active.suggestion!.note,status:active.suggestion!.status})}>Editar</button><button className="text-button" onClick={()=>{const at=new Date().toISOString();setInspection(old=>old?{...old,items:old.items.map(i=>i.id===active.id?{...i,suggestion:undefined}:i),history:[...old.history,{id:crypto.randomUUID(),itemId:active.id,at,action:"Sugestão rejeitada",note:active.suggestion!.note}]}:old);}}>Rejeitar</button></div></div>}
              <div className="review-row"><span className={`badge ${active.status}`}>{statusLabel[active.status]}</span><button className="text-button" onClick={()=>setEditing(active)}>Registrar minha revisão<ArrowRight size={14}/></button></div>
            </div>}
            <div className="evidence-area"><div className="panel-heading"><h3>Evidências deste item <span>{currentEvidence.length}</span></h3><button className="icon-button" onClick={()=>imageInput.current?.click()} aria-label="Adicionar evidência"><ImagePlus size={16}/></button></div>{currentEvidence.length?<div className="evidence-list">{currentEvidence.map(e=><button key={e.id} className="evidence-thumb" onClick={()=>setPhotoDraft({existingId:e.id,dataUrl:e.dataUrl,itemId:e.itemId,name:e.name,origin:e.origin})} title={`Ver ${e.name}`}><img src={e.dataUrl} alt={e.name}/><span>{e.name}</span></button>)}</div>:<p className="evidence-empty"><ImagePlus size={17}/>As fotos confirmadas aparecem aqui, vinculadas ao item.</p>}</div>
          </section>
          <section className="chat-panel" aria-label="Conversa com a assistente"><div className="chat-heading"><div className="assistant-symbol"><Sparkles size={19}/></div><div><h2>Assistente de vistoria</h2><p><span className={`connection-dot ${connected?"online":""}`}/>{connected?realtime.isSpeaking?"Falando com você":"Conectada · ouvindo":realtime.status==="connecting"?"Conectando…":configured===false?"IA não configurada":"Pronta para começar"}</p></div><span className="badge neutral">IA</span></div>
            <div className="chat-messages" tabIndex={0} role="log" aria-label="Mensagens da vistoria" aria-live="polite"><div className="conversation-start"><span>Vistoria de entrega</span><span>{inspection.demo?"Dados fictícios":"Roteiro personalizado"}</span></div><div className="welcome-message"><span className="message-author"><Sparkles size={13}/>ChaveCheck</span><p>{inspection.referencePhotos?.length?"Vamos comparar o cômodo com as fotos?":"Vamos conferir o imóvel juntos?"}</p><p>Seu roteiro tem <strong>{inspection.items.length} itens</strong>. {inspection.referencePhotos?.length?"As duas fotos são a referência anterior. Nenhum item atual foi verificado. ":""}Comece a conversa por voz ou escreva abaixo. Para analisar o ambiente, ative a câmera e escolha quando compartilhar.</p><span className="welcome-tag"><ShieldCheck size={13}/>Você confirma cada conclusão</span></div>
              {inspection.messages.filter(m=>m.text.trim()).map(m=><div key={m.id} className={`chat-message ${m.role}`}><span className="message-author">{m.role==="assistant"?<><Sparkles size={12}/>Assistente</>:"Você"}</span><p>{m.text}</p></div>)}{chatBusy&&<div className="typing-indicator"><span/><span/><span/><span className="sr-only">Analisando sua mensagem</span></div>}<div ref={chatEnd}/>
            </div>
            <div className="chat-bottom">{inspection.referencePhotos?.length?<p className="reference-sharing-note">As duas referências serão enviadas à OpenAI ao conversar. {references.loading?"Preparando fotos…":references.error?<><span role="alert">{references.error}</span> <button className="text-button" onClick={references.retry}>Tentar novamente</button></>:""}</p>:null}{!inspection.messages.length&&<button className="prompt-chip" disabled={chatBusy||configured===false} onClick={()=>sendText("Vamos começar pelo item ativo. O que preciso conferir?")}>Por onde começamos?<ArrowRight size={13}/></button>}
              {connected?<div className="voice-connected"><button className={`icon-button ${!realtime.micEnabled?"muted-mic":""}`} onClick={realtime.toggleMic} aria-label={realtime.micEnabled?"Silenciar microfone":"Ativar microfone"}>{realtime.micEnabled?<Mic size={18}/>:<MicOff size={18}/>}</button><span>{realtime.micEnabled?realtime.isSpeaking?"Assistente falando":"Pode falar, estou ouvindo":"Microfone silenciado"}</span><button className="icon-button" onClick={stopSession} aria-label="Encerrar conversa por voz"><Square size={15}/></button></div>:<button className="voice-start" disabled={realtime.status==="connecting"||chatBusy||configured===false||references.loading||!!references.error||scenarioBusy} onClick={()=>realtime.start()}>{realtime.status==="connecting"?<LoaderCircle size={18} className="spin"/>:<Mic size={18}/>} {realtime.status==="connecting"?"Conectando voz…":"Iniciar conversa por voz"}<span><Radio size={15}/></span></button>}
              <form className="chat-composer" onSubmit={e=>{e.preventDefault();void sendText();}}><textarea aria-label="Mensagem para a assistente" placeholder="Ou escreva sua observação…" value={message} maxLength={4000} rows={2} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void sendText();}}}/><div><span><ShieldCheck size={12}/>Revisão sempre humana</span><button type="submit" disabled={!message.trim()||chatBusy||configured===false} aria-label="Enviar mensagem"><ArrowUp size={16}/></button></div></form><p className="chat-disclaimer">A IA pode errar. Confira as fontes e revise as sugestões.</p>
            </div>
          </section>
        </div>
      </>}
      <footer className="app-footer"><span><span className={`save-dot ${saveState.includes("Falha")?"error":""}`}/>{saveState}</span><span><ShieldCheck size={13}/>Evidências atuais e revisões salvas neste navegador</span><span>ChaveCheck · Hackathon 2026</span></footer>
    </main>
    <input ref={imageInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage}/>
    {editing&&<ItemEditor key={editing.id} item={editing} onClose={()=>setEditing(null)} onSave={item=>{review(item,item.status,item.note,"Item editado pelo usuário");setEditing(null);}}/>}
    {photoDraft&&<dialog ref={photoDialog} className="dialog photo-dialog" aria-labelledby="photo-title" onCancel={()=>setPhotoDraft(null)}><div className="dialog-heading"><div><span className="muted">Evidência da vistoria</span><h2 id="photo-title">{photoDraft.existingId?"Revisar evidência":"Revise antes de salvar"}</h2></div><button className="icon-button" onClick={()=>setPhotoDraft(null)} aria-label="Fechar foto"><X size={20}/></button></div><img className="photo-preview" src={photoDraft.dataUrl} alt="Foto capturada para revisão"/><label className="field">Descrição<input maxLength={180} value={photoDraft.name} onChange={e=>setPhotoDraft({...photoDraft,name:e.target.value})}/></label><label className="field">Vincular ao item<select value={photoDraft.itemId} onChange={e=>setPhotoDraft({...photoDraft,itemId:e.target.value})}>{inspection.items.map(i=><option key={i.id} value={i.id}>{i.room} · {i.title}</option>)}</select></label><p className="muted small">A imagem original será salva neste navegador. Salvar a foto não aprova a conclusão do item.</p><div className="dialog-actions">{photoDraft.existingId&&<button className="text-button" onClick={()=>{if(window.confirm("Excluir esta foto da vistoria?")){setInspection(old=>old?{...old,evidence:old.evidence.filter(e=>e.id!==photoDraft.existingId),history:[...old.history,{id:crypto.randomUUID(),itemId:photoDraft.itemId,at:new Date().toISOString(),action:"Evidência excluída",note:photoDraft.name}]}:old);setPhotoDraft(null);}}}>Excluir foto</button>}<button className="secondary" onClick={()=>setPhotoDraft(null)}>{photoDraft.existingId?"Cancelar":"Descartar"}</button><button className="primary" disabled={!photoDraft.name.trim()} onClick={savePhoto}><Check size={16}/>{photoDraft.existingId?"Salvar alterações":"Confirmar e salvar foto"}</button></div></dialog>}
  </div>;
}
