"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {createConversationItemId, isRecord, parseToolCall, updateTranscript, type RealtimeMessage} from "@/lib/realtime-events";
import {createReferenceConversationItems, serializeRealtimeEvent} from "./use-realtime";
import {LiveResponseTracker} from "@/lib/live-response-tracker";
import {liveGreeting as greeting} from "@/lib/live-policy";
import {LiveTranscriptBuffer, LiveAcknowledgements, createLiveAnalysisAppendChunks} from "@/lib/live-events";

type Status = "idle" | "connecting" | "connected" | "closing" | "error";
type Options = {context:string; referenceImages?:{id:string;dataUrl:string;label:string}[];onToolCall:(name:string,args:Record<string,unknown>)=>unknown|Promise<unknown>};
type Backend = {revision:number;calls:Record<string,unknown>[]};
const stopped="Interrompa a orientação anterior. Uma captura está sendo analisada ou o roteiro mudou. Aguarde a atualização do aplicativo antes de relatar qualquer conclusão. Não use um resultado antigo para o novo item.";

function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  return new Promise((resolve,reject)=>{const cancel=()=>reject(signal.reason??new DOMException("Cancelado","AbortError"));if(signal.aborted)return cancel();signal.addEventListener("abort",cancel,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener("abort",cancel));});
}
function message(error:unknown){
  if(error instanceof DOMException&&error.name==="NotAllowedError")return "Permita o microfone para iniciar a conversa.";
  if(error instanceof DOMException&&error.name==="NotFoundError")return "Nenhum microfone foi encontrado.";
  return error instanceof Error?error.message:"Não foi possível concluir a conexão de voz.";
}
function currentSelection(context:string){
  try{const data=JSON.parse(context);const item=data.items?.find((entry:{id:string})=>entry.id===data.activeItemId);return JSON.stringify({id:data.activeItemId,title:item?.title,room:item?.room,condition:item?.expected?.condition,source:item?.source});}catch{return "";}
}
function progressMatches(context:string,target:{itemId:string;condition:string}|null){
  if(!target)return false;
  try{const data=JSON.parse(context);const item=data.items?.find((entry:{id:string})=>entry.id===data.activeItemId);return data.activeItemId===target.itemId&&item?.expected?.condition===target.condition;}catch{return false;}
}

/** GPT-Live handles speech; Responses handles tools and visual guidance. */
export function useLive(options:Options){
  const latest=useRef(options);latest.current=options;
  const [status,setStatus]=useState<Status>("idle");const statusRef=useRef<Status>("idle");
  const [error,setError]=useState<string|null>(null);const [messages,setMessages]=useState<RealtimeMessage[]>([]);
  const [isSpeaking,setIsSpeaking]=useState(false);const [micEnabled,setMicEnabled]=useState(true);
  const peer=useRef<RTCPeerConnection|null>(null);const channel=useRef<RTCDataChannel|null>(null);
  const microphone=useRef<MediaStream|null>(null);const audio=useRef<HTMLAudioElement|null>(null);
  const audioContext=useRef<AudioContext|null>(null);const meter=useRef<ReturnType<typeof setInterval>|null>(null);
  const controller=useRef<AbortController|null>(null);const deadline=useRef<ReturnType<typeof setTimeout>|null>(null);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);const disconnected=useRef<ReturnType<typeof setTimeout>|null>(null);
  const generation=useRef(0);const revision=useRef(0);const pending=useRef(false);const outputBlocked=useRef(false);
  const lastSound=useRef(0);const meterReady=useRef(false);const acknowledgements=useRef(new LiveAcknowledgements());
  const transcripts=useRef(new LiveTranscriptBuffer());const typed=useRef<(RealtimeMessage&{createdAt:string})[]>([]);
  const pendingMode=useRef<"capture"|"announcement"|"selection"|null>(null);const progressTarget=useRef<{itemId:string;condition:string}|null>(null);
  const delegationResponses=useRef(new Map<string,string>());const toolQueueCount=useRef(0);
  const responseTracker=useRef(new LiveResponseTracker());
  const backend=useRef(new Map<string,Backend>());const handled=useRef(new Set<string>());
  const continuation=useRef(false);const commandFailed=useRef(false);const processing=useRef(false);
  const contextSent=useRef("");const backendTail=useRef<Promise<void>>(Promise.resolve());
  const setState=useCallback((next:Status)=>{statusRef.current=next;setStatus(next);},[]);
  const send=useCallback((event:Record<string,unknown>)=>{
    if(channel.current?.readyState!=="open")return false;
    try{channel.current.send(serializeRealtimeEvent(event,peer.current?.sctp?.maxMessageSize));return true;}catch(e){setError(message(e));return false;}
  },[]);
  const blockOutput=useCallback((value:boolean)=>{outputBlocked.current=value;if(audio.current)audio.current.muted=value;if(value)setIsSpeaking(false);},[]);
  const release=useCallback(()=>{
    generation.current++;revision.current++;controller.current?.abort();controller.current=null;
    for(const timer of [deadline.current,closeTimer.current,disconnected.current])if(timer)clearTimeout(timer);
    deadline.current=null;closeTimer.current=null;disconnected.current=null;
    if(meter.current)clearInterval(meter.current);meter.current=null;meterReady.current=false;
    void audioContext.current?.close().catch(()=>undefined);audioContext.current=null;
    const events=channel.current;channel.current=null;events?.close();
    microphone.current?.getTracks().forEach(track=>track.stop());microphone.current=null;
    const connection=peer.current;peer.current=null;connection?.close();
    if(audio.current){audio.current.pause();audio.current.srcObject=null;audio.current=null;}
    acknowledgements.current.clear();backend.current.clear();delegationResponses.current.clear();responseTracker.current.clear();toolQueueCount.current=0;handled.current.clear();
    backendTail.current=Promise.resolve();continuation.current=false;processing.current=false;pending.current=false;outputBlocked.current=false;commandFailed.current=false;pendingMode.current=null;progressTarget.current=null;
  },[]);
  const stop=useCallback(()=>{
    if(statusRef.current==="closing")return;
    if(statusRef.current!=="connected"){release();setState("idle");setIsSpeaking(false);setMicEnabled(true);return;}
    revision.current++;pending.current=true;blockOutput(true);acknowledgements.current.clear();
    microphone.current?.getAudioTracks().forEach(track=>{track.enabled=false;});setMicEnabled(false);setState("closing");
    if(!send({type:"session.close",event_id:createConversationItemId()})){release();setState("idle");return;}
    closeTimer.current=setTimeout(()=>{release();setState("idle");setError("A conexão foi encerrada localmente; o fechamento final do serviço não foi confirmado.");},15_000);
  },[release,send,setState,blockOutput]);
  useEffect(()=>()=>{stop();},[stop]);

  const append=useCallback(async(type:"thinking"|"commentary"|"instructions",content:string)=>{
    if(new TextEncoder().encode(content).length>500){setError("A atualização de voz excedeu o limite. Consulte o resultado na tela.");return false;}
    const id=createConversationItemId();const accepted=acknowledgements.current.wait(id,`session.${type}.appended`,45_000);
    if(!send({type:`session.${type}.append`,event_id:id,delegation_id:null,content}))acknowledgements.current.settle(id,false);
    return accepted;
  },[send]);
  const queueItem=useCallback((item:Record<string,unknown>)=>send({type:"response.item.create",event_id:createConversationItemId(),item}),[send]);
  const flushBackend=useCallback(()=>{
    if(!continuation.current||processing.current||backend.current.size||responseTracker.current.pendingCount||pending.current||commandFailed.current||statusRef.current!=="connected")return;
    continuation.current=false;
    const id=createConversationItemId();if(!responseTracker.current.issued(id,revision.current))return;
    if(!send({type:"response.create",event_id:id})){responseTracker.current.failed(id);commandFailed.current=true;}
  },[send]);
  const pauseForCapture=useCallback(()=>{
    revision.current++;pending.current=true;pendingMode.current="capture";continuation.current=false;acknowledgements.current.clear();blockOutput(true);
    if(statusRef.current==="connected")void append("instructions",stopped);
  },[append,blockOutput]);
  const waitForSilence=useCallback(async(expectedGeneration:number,expectedRevision:number)=>{
    const until=Date.now()+12_000;
    while(Date.now()<until){
      if(generation.current!==expectedGeneration||revision.current!==expectedRevision||statusRef.current!=="connected")return false;
      if(meterReady.current&&audioContext.current?.state==="running"&&performance.now()-lastSound.current>650&&backend.current.size===0&&responseTracker.current.pendingCount===0&&!processing.current)return true;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    return false;
  },[]);
  const setAnalysisPending=useCallback((value:boolean)=>{
    pending.current=value;pendingMode.current=value?"capture":null;if(value){blockOutput(true);return;}
    if(statusRef.current!=="connected")return;
    const ownGeneration=generation.current,ownRevision=revision.current;
    void(async()=>{
      await append("instructions","A tentativa de análise terminou sem uma nova conclusão. Não anuncie resultado nem aprovação. Aguarde a pessoa ou conduza o reenvio da foto preservada.");
      if(await waitForSilence(ownGeneration,ownRevision)){blockOutput(false);flushBackend();}
    })();
  },[append,blockOutput,waitForSilence,flushBackend]);
  const announceAnalysis=useCallback(async(text:string,kind:"analysis"|"progress"="analysis")=>{
    if(statusRef.current!=="connected"){pending.current=false;return false;}
    if(kind==="progress")pauseForCapture();
    const ownGeneration=generation.current,ownRevision=revision.current;
    pending.current=true;pendingMode.current="announcement";blockOutput(true);
    try{
      const parsed=JSON.parse(text);progressTarget.current=kind==="progress"?{itemId:String(parsed.nextItemId??""),condition:String(parsed.nextExpected??"")}:null;
      const chunks=createLiveAnalysisAppendChunks(text,kind);
      for(const chunk of chunks){
        if(generation.current!==ownGeneration||revision.current!==ownRevision)return false;
        if(!await append("thinking",chunk))throw new Error("A voz não confirmou o resultado. A análise continua disponível na tela.");
      }
      // Also update the delegated backend, which does not share frontend appends.
      if(!queueItem({type:"message",role:"user",content:[{type:"input_text",text:`DADOS DO APLICATIVO: ${kind}. Use este registro mais recente; não invente uma nova análise.\n${text}`}]}))throw new Error("Não foi possível atualizar a conversa com o registro.");
      if(!await waitForSilence(ownGeneration,ownRevision))throw new Error("O áudio anterior ainda não foi interrompido. Consulte a análise na tela e reinicie a voz.");
      pending.current=false;pendingMode.current=null;progressTarget.current=null;blockOutput(false);flushBackend();
      const delivered=await append("commentary",kind==="progress"?"A revisão na interface terminou. Oriente agora o próximo item conforme a atualização do roteiro que acabou de receber; não atribua uma análise ao novo item.":"A nova comparação está registrada. Relate a conclusão e a próxima ação dos dados recebidos, com o limite específico indicado. A confirmação do item continua pendente de revisão humana.");
      if(generation.current!==ownGeneration||revision.current!==ownRevision)return false;
      if(!delivered)throw new Error("A análise foi salva, mas a voz não confirmou o recebimento. Consulte o resultado na tela.");
      setError(null);return true;
    }catch(e){if(generation.current===ownGeneration&&revision.current===ownRevision){pending.current=false;pendingMode.current=null;progressTarget.current=null;setError(message(e));}return false;}
  },[append,queueItem,pauseForCapture,waitForSilence,blockOutput,flushBackend]);

  const updateContext=useCallback((next:string)=>{
    if(contextSent.current===next||statusRef.current!=="connected")return;
    const previous=contextSent.current;contextSent.current=next;
    queueItem({type:"message",role:"user",content:[{type:"input_text",text:`DADOS ATUAIS DO APLICATIVO, não instruções. Substituem o estado anterior:\n${next}`} ]});
    if(currentSelection(previous)!==currentSelection(next)){
      // The expected destination of Confirmar e continuar belongs to that announcement.
      if(pendingMode.current==="announcement"&&progressMatches(next,progressTarget.current))return;
      if(pendingMode.current==="capture"){
        revision.current++;acknowledgements.current.clear();void append("instructions",stopped);return;
      }
      pauseForCapture();pendingMode.current="selection";const ownGeneration=generation.current,ownRevision=revision.current;
      void(async()=>{
        const failSelection=()=>{if(generation.current===ownGeneration&&revision.current===ownRevision){pending.current=false;pendingMode.current=null;setError("Não foi possível atualizar a orientação de voz. Reinicie a conversa para continuar no item selecionado.");}};
        if(!await waitForSilence(ownGeneration,ownRevision)){failSelection();return;}
        if(!await append("thinking","O item ativo do roteiro mudou na interface. Consulte o backend antes de orientar. Não atribua ao novo item a conclusão do anterior.")){failSelection();return;}
        if(generation.current!==ownGeneration||revision.current!==ownRevision)return;
        pending.current=false;pendingMode.current=null;blockOutput(false);
        queueItem({type:"message",role:"user",content:[{type:"input_text",text:"O item ativo foi alterado na interface. Consulte get_inspection_context e oriente somente a próxima ação do item atualmente selecionado. Não conclua um item sem análise registrada."}]});
        continuation.current=true;flushBackend();
      })();
    }
  },[queueItem,append,pauseForCapture,waitForSilence,blockOutput,flushBackend]);
  useEffect(()=>{updateContext(options.context);},[options.context,updateContext]);
  const sendText=useCallback((value:string)=>{
    const text=value.trim();if(!text)return false;
    if(pending.current){setError("Aguarde a atualização da orientação e envie novamente. Sua mensagem continua no campo.");return false;}
    if(statusRef.current!=="connected"){setError("Inicie a conversa antes de enviar uma mensagem.");return false;}
    if(text.length>8_000){setError("Envie uma mensagem mais curta.");return false;}
    if(queueItem({type:"message",role:"user",content:[{type:"input_text",text}]})){
      const id=createConversationItemId();typed.current=[...typed.current,{id,role:"user" as const,text,createdAt:new Date().toISOString()}].slice(-150);
      setMessages(previous=>updateTranscript(previous,id,"user",text).slice(-150));continuation.current=true;flushBackend();return true;
    }
    return false;
  },[queueItem,flushBackend]);
  const sendImage=useCallback((dataUrl:string,prompt?:string)=>{
    if(statusRef.current!=="connected"||pending.current||backend.current.size||responseTracker.current.pendingCount||processing.current)return false;
    if(!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)||dataUrl.length>2_000_000){setError("Envie uma imagem JPEG ou PNG menor para orientação.");return false;}
    if(queueItem({type:"message",role:"user",content:[{type:"input_text",text:`QUADRO ATUAL TEMPORÁRIO somente para orientar enquadramento. Não é evidência salva e não permite concluir conformidade, divergência ou ausência de avarias. A decisão vem de Fotografar e analisar. ${prompt??"Dê uma orientação curta de enquadramento."}`},{type:"input_image",image_url:dataUrl,detail:"auto"}]})){continuation.current=true;flushBackend();return true;}
    return false;
  },[queueItem,flushBackend]);
  const toggleMic=useCallback(()=>{
    const tracks=microphone.current?.getAudioTracks();if(!tracks?.length)return;
    const enabled=!tracks[0].enabled;tracks.forEach(track=>{track.enabled=enabled;});setMicEnabled(enabled);
    send({type:enabled?"session.input_audio.unmute":"session.input_audio.mute",event_id:createConversationItemId()});
    void audioContext.current?.resume();void audio.current?.play().catch(()=>setError("Permita a reprodução de som neste site."));
  },[send]);
  const clearMessages=useCallback(()=>{transcripts.current.reset();typed.current=[];setMessages([]);},[]);

  const start=useCallback(async()=>{
    if(["connecting","connected","closing"].includes(statusRef.current))return;
    release();const ownGeneration=generation.current;const current=()=>generation.current===ownGeneration;
    const abort=new AbortController();controller.current=abort;setState("connecting");setError(null);setMicEnabled(true);setIsSpeaking(false);clearMessages();
    const fail=(detail:string)=>{if(!current())return;release();setState("error");setIsSpeaking(false);setError(detail);};
    deadline.current=setTimeout(()=>abort.abort(new Error("A conexão demorou demais. Verifique a rede e tente novamente.")),45_000);
    try{
      const references=createReferenceConversationItems(latest.current.referenceImages??[]);
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Use HTTPS ou localhost e um navegador com acesso ao microfone.");
      const connection=new RTCPeerConnection();peer.current=connection;
      const player=new Audio();player.autoplay=true;player.setAttribute("playsinline","true");audio.current=player;
      const meterContext=new AudioContext();audioContext.current=meterContext;void meterContext.resume();
      connection.ontrack=event=>{
        if(!current())return;const stream=event.streams[0]??new MediaStream([event.track]);player.srcObject=stream;
        void player.play().catch(()=>setError("O áudio foi bloqueado. Toque no microfone para habilitar o som."));
        const analyser=meterContext.createAnalyser();analyser.fftSize=512;meterContext.createMediaStreamSource(stream).connect(analyser);
        const samples=new Float32Array(analyser.fftSize);lastSound.current=performance.now();meterReady.current=true;
        meter.current=setInterval(()=>{analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length);if(rms>0.008)lastSound.current=performance.now();setIsSpeaking(!outputBlocked.current&&meterContext.state==="running"&&performance.now()-lastSound.current<250);},100);
      };
      connection.onconnectionstatechange=()=>{
        if(!current()||statusRef.current==="closing")return;
        if(connection.connectionState==="failed")fail("A conexão de voz caiu. Inicie novamente.");
        if(connection.connectionState==="disconnected"&&!disconnected.current)disconnected.current=setTimeout(()=>fail("A conexão de voz foi interrompida."),8_000);
        if(connection.connectionState==="connected"&&disconnected.current){clearTimeout(disconnected.current);disconnected.current=null;}
      };
      const media=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      void media.then(stream=>{if(!current()||abort.signal.aborted)stream.getTracks().forEach(track=>track.stop());},()=>undefined);
      const stream=await abortable(media,abort.signal);if(!current())return;microphone.current=stream;
      stream.getAudioTracks().forEach(track=>connection.addTrack(track,stream));
      const events=connection.createDataChannel("oai-events",{ordered:true});channel.current=events;
      let started!:()=>void;const ready=abortable(new Promise<void>(resolve=>{started=resolve;}),abort.signal);void ready.catch(()=>undefined);
      events.onerror=()=>fail("O canal de voz falhou. Inicie novamente.");
      events.onclose=()=>{if(current())fail(statusRef.current==="closing"?"A voz desconectou antes de confirmar o encerramento.":"A conversa foi desconectada.");};
      const processCalls=(record:Backend)=>{
        toolQueueCount.current++;processing.current=true;
        backendTail.current=backendTail.current.then(async()=>{
          if(!current())return;processing.current=true;
          try{
            for(const call of record.calls){
              if(!current())return;const callId=String(call.call_id);if(handled.current.has(callId))continue;handled.current.add(callId);
              let result:unknown;
              try{if(record.revision===revision.current&&!pending.current&&statusRef.current==="connected"){const parsed=parseToolCall(call.name,call.arguments);result=await latest.current.onToolCall(parsed.name,parsed.args);}}
              catch(e){result={error:message(e)};}
              if(!current())return;
              if(record.revision!==revision.current||pending.current||statusRef.current!=="connected")result={superseded:true,message:"Esta solicitação foi substituída. A captura ou o item mudou; aguarde o registro atual do aplicativo."};
              if(!queueItem({type:"function_call_output",call_id:callId,output:JSON.stringify(result??{ok:true})}))commandFailed.current=true;
            }
            if(record.calls.length)continuation.current=true;
          }finally{toolQueueCount.current=Math.max(0,toolQueueCount.current-1);processing.current=toolQueueCount.current>0;flushBackend();}
        }).catch(()=>{if(current()){processing.current=false;setError("Não foi possível concluir a orientação da assistente.");}});
      };
      events.onmessage=eventMessage=>{
        if(!current()||typeof eventMessage.data!=="string")return;let event:unknown;
        try{event=JSON.parse(eventMessage.data);}catch{return;}if(!isRecord(event)||typeof event.type!=="string")return;
        acknowledgements.current.accept(event);
        if(event.type==="session.started"){started();return;}
        if(event.type==="session.closed"){release();setState("idle");setIsSpeaking(false);setMicEnabled(true);return;}
        if(statusRef.current==="closing")return;
        if(event.type==="session.delegation.created"&&isRecord(event.delegation)&&typeof event.delegation.id==="string"){
          const command=typeof event.client_event_id==="string"?event.client_event_id:undefined;
          responseTracker.current.delegated(event.delegation.id,command,revision.current);
          return;
        }
        if(event.type==="session.input_transcript.delta"||event.type==="session.output_transcript.delta"){
          if(event.type==="session.output_transcript.delta"&&outputBlocked.current)return;
          const currentTranscript=transcripts.current.ingest(event);setMessages([...typed.current,...currentTranscript].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-150));return;
        }
        if(event.type==="response.event"&&isRecord(event.event)){
          const nested=event.event;const response=isRecord(nested.response)?nested.response:null;
          const delegation=typeof event.delegation_id==="string"?event.delegation_id:"backend";
          const id=typeof nested.response_id==="string"?nested.response_id:typeof response?.id==="string"?response.id:delegationResponses.current.get(delegation)??delegation;
          if(nested.type==="response.created"){
            const responseRevision=responseTracker.current.created(delegation,revision.current);
            delegationResponses.current.set(delegation,id);backend.current.set(id,{revision:responseRevision,calls:[]});return;
          }
          if(nested.type==="response.output_item.done"&&isRecord(nested.item)&&nested.item.type==="function_call"&&typeof nested.item.call_id==="string"){
            const record=backend.current.get(id)??{revision:-1,calls:[]};record.calls.push(nested.item);backend.current.set(id,record);return;
          }
          if(["response.completed","response.failed","response.incomplete","response.cancelled"].includes(String(nested.type))){
            const record=backend.current.get(id);backend.current.delete(id);
            if(nested.type==="response.completed"&&record)processCalls(record);
            else if(nested.type!=="response.completed")setError("A assistente não conseguiu concluir essa orientação. Tente novamente.");
            flushBackend();return;
          }
          return;
        }
        if(event.type==="error"){
          const detail=isRecord(event.error)?event.error:{};
          commandFailed.current=true;
          if(statusRef.current==="connecting"){abort.abort(new Error("A OpenAI não aceitou a configuração do GPT Live. Verifique o acesso do projeto."));return;}
          setError(typeof detail.code==="string"?`A conversa encontrou um erro (${detail.code}). Reinicie a voz para continuar.`:"A conversa encontrou um erro. Reinicie a voz.");
        }
      };
      const offer=await abortable(connection.createOffer(),abort.signal);await abortable(connection.setLocalDescription(offer),abort.signal);
      if(connection.iceGatheringState!=="complete")await abortable(new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{connection.removeEventListener("icegatheringstatechange",changed);reject(new Error("Não foi possível preparar a conexão de áudio."));},10_000);const changed=()=>{if(connection.iceGatheringState==="complete"){clearTimeout(timeout);connection.removeEventListener("icegatheringstatechange",changed);resolve();}};connection.addEventListener("icegatheringstatechange",changed);changed();}),abort.signal);
      const requestContext=latest.current.context;
      const response=await fetch("/api/live",{method:"POST",headers:{"Content-Type":"application/json"},signal:abort.signal,body:JSON.stringify({sdp:connection.localDescription?.sdp,context:requestContext})});
      const answer=await response.json();if(!response.ok)throw new Error(typeof answer.error==="string"?answer.error:"Não foi possível iniciar o GPT Live.");
      if(!isRecord(answer.transport)||typeof answer.transport.sdp!=="string"||!answer.transport.sdp.startsWith("v=0"))throw new Error("Resposta de áudio inválida.");
      await abortable(connection.setRemoteDescription({type:"answer",sdp:answer.transport.sdp}),abort.signal);await ready;if(!current())return;
      contextSent.current=requestContext;setState("connected");
      if(requestContext!==latest.current.context){
        if(!queueItem({type:"message",role:"user",content:[{type:"input_text",text:`O contexto mudou durante a conexão. Dados atuais do aplicativo:\n${latest.current.context}`}]}))throw new Error("Não foi possível atualizar o roteiro ao conectar.");
        contextSent.current=latest.current.context;
        void append("thinking","O item ou a condição mudou durante a conexão. Use apenas o estado atual consultado no backend; os dados iniciais foram substituídos.");
      }
      for(const reference of references){const {id:_referenceId,...referenceInput}=reference;const item={...referenceInput,content:reference.content.map(content=>content.type==="input_image"?{...content,detail:"auto"}:content)};if(!queueItem(item))throw new Error("Não foi possível enviar a referência ao backend da conversa.");}
      if(deadline.current)clearTimeout(deadline.current);deadline.current=null;
      queueItem({type:"message",role:"user",content:[{type:"input_text",text:"Início da vistoria pelo aplicativo. Consulte get_inspection_context e devolva somente o próximo passo concreto do item ativo. Uma condição esperada não é análise registrada. Se não existe captura analisada, oriente Fotografar e analisar, sem afirmar o estado atual."}]});
      continuation.current=true;flushBackend();
      void append("commentary",greeting);
    }catch(e){if(current())fail(message(e));}
  },[release,setState,clearMessages,queueItem,append,flushBackend]);

  return {status,error,messages,isSpeaking,micEnabled,start,stop,toggleMic,sendText,sendImage,updateContext,pauseForCapture,announceAnalysis,setAnalysisPending,clearMessages};
}
