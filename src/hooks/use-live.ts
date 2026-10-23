"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {createConversationItemId, isRecord, parseToolCall, updateTranscript, type RealtimeMessage} from "@/lib/realtime-events";
import {createReferenceConversationItems, serializeRealtimeEvent} from "./use-realtime";
import {LiveResponseTracker} from "@/lib/live-response-tracker";
import {liveGreeting as greeting} from "@/lib/live-policy";
import {LiveTranscriptBuffer, LiveAcknowledgements, createLiveVoiceSummaryChunks, deliverLiveVoiceSummary} from "@/lib/live-events";
import {prepareLiveAudio,type PreparedLiveAudio} from "@/lib/live-audio";

type Status = "idle" | "connecting" | "connected" | "closing" | "error";
type Options = {context:string; referenceImages?:{id:string;dataUrl:string;label:string}[];onToolCall:(name:string,args:Record<string,unknown>)=>unknown|Promise<unknown>};
type Backend = {revision:number;calls:Record<string,unknown>[]};
const capturePending="Uma nova foto foi recebida e está em análise. Qualquer resultado anterior não vale para esta captura. Continue ouvindo e conversando normalmente; responda dúvidas de procedimento. Não anuncie conclusão nem peça outra foto até receber o resultado registrado.";
const playbackBlockedError="O navegador bloqueou o áudio. Toque em Habilitar som para ouvir a assistente.";

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
  const [audioBlocked,setAudioBlocked]=useState(false);
  const peer=useRef<RTCPeerConnection|null>(null);const channel=useRef<RTCDataChannel|null>(null);
  const microphone=useRef<MediaStream|null>(null);const audio=useRef<HTMLAudioElement|null>(null);
  const audioContext=useRef<AudioContext|null>(null);const meter=useRef<ReturnType<typeof setInterval>|null>(null);
  const preparedAudio=useRef<PreparedLiveAudio|null>(null);const stopAudioPriming=useRef<(()=>void)|null>(null);
  const controller=useRef<AbortController|null>(null);const deadline=useRef<ReturnType<typeof setTimeout>|null>(null);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);const disconnected=useRef<ReturnType<typeof setTimeout>|null>(null);
  const generation=useRef(0);const revision=useRef(0);const pending=useRef(false);const outputBlocked=useRef(false);
  const lastSound=useRef(0);const acknowledgements=useRef(new LiveAcknowledgements());
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
  const cancelPreparedAudio=useCallback(()=>{
    const prepared=preparedAudio.current;preparedAudio.current=null;if(!prepared)return;
    prepared.stopPriming();prepared.player.pause();prepared.player.srcObject=null;void prepared.context.close().catch(()=>undefined);
  },[]);
  const resumeAudio=useCallback(()=>{
    const player=audio.current;const context=audioContext.current;if(!player||!context)return;
    const ownGeneration=generation.current;
    void Promise.all([context.resume(),player.play()]).then(()=>{
      if(generation.current!==ownGeneration)return;
      setAudioBlocked(false);setError(previous=>previous===playbackBlockedError?null:previous);
    }).catch(()=>{if(generation.current===ownGeneration){setAudioBlocked(true);setError(playbackBlockedError);}});
  },[]);
  const prepareAudio=useCallback(()=>{
    if(audioContext.current){resumeAudio();return;}
    if(preparedAudio.current)return;
    try{preparedAudio.current=prepareLiveAudio();}catch{/* start reports unsupported audio together with the connection error. */}
  },[resumeAudio]);
  const release=useCallback(()=>{
    generation.current++;revision.current++;controller.current?.abort();controller.current=null;
    for(const timer of [deadline.current,closeTimer.current,disconnected.current])if(timer)clearTimeout(timer);
    deadline.current=null;closeTimer.current=null;disconnected.current=null;
    if(meter.current)clearInterval(meter.current);meter.current=null;
    cancelPreparedAudio();stopAudioPriming.current?.();stopAudioPriming.current=null;
    void audioContext.current?.close().catch(()=>undefined);audioContext.current=null;
    const events=channel.current;channel.current=null;events?.close();
    microphone.current?.getTracks().forEach(track=>track.stop());microphone.current=null;
    const connection=peer.current;peer.current=null;connection?.close();
    if(audio.current){audio.current.pause();audio.current.srcObject=null;audio.current=null;}
    setAudioBlocked(false);
    acknowledgements.current.clear();backend.current.clear();delegationResponses.current.clear();responseTracker.current.clear();toolQueueCount.current=0;handled.current.clear();
    backendTail.current=Promise.resolve();continuation.current=false;processing.current=false;pending.current=false;outputBlocked.current=false;commandFailed.current=false;pendingMode.current=null;progressTarget.current=null;
  },[cancelPreparedAudio]);
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
    const id=createConversationItemId();const accepted=acknowledgements.current.wait(id,`session.${type}.appended`,12_000);
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
  // A visual job invalidates earlier decisions, but must never pause the conversation.
  const pauseForCapture=useCallback(()=>{
    revision.current++;pending.current=false;pendingMode.current="capture";acknowledgements.current.clear();
    if(statusRef.current!=="connected")return;
    queueItem({type:"message",role:"user",content:[{type:"input_text",text:`ESTADO DO APLICATIVO: analysisInProgress=true. ${capturePending}`} ]});
    void append("instructions",capturePending);
    void append("commentary","Recebi a foto e vou conferir. Pode continuar falando comigo enquanto a análise fica pronta.");
    flushBackend();
  },[append,queueItem,flushBackend]);
  const setAnalysisPending=useCallback((value:boolean)=>{
    if(value){pauseForCapture();return;}
    const wasCapture=pendingMode.current==="capture";
    if(wasCapture)pendingMode.current=null;
    if(statusRef.current!=="connected"||!wasCapture)return;
    queueItem({type:"message",role:"user",content:[{type:"input_text",text:"ESTADO DO APLICATIVO: analysisInProgress=false. A tentativa terminou sem novo resultado. A foto foi preservada; não use a análise antiga como resultado desta captura."}]});
    void append("instructions","A tentativa de análise terminou sem nova conclusão. Continue a conversa e ajude a reenviar a foto preservada. Não anuncie resultado ou aprovação desta tentativa.");
    flushBackend();
  },[append,queueItem,pauseForCapture,flushBackend]);
  const announceAnalysis=useCallback(async(text:string,kind:"analysis"|"progress"="analysis")=>{
    if(statusRef.current!=="connected"){pending.current=false;return false;}
    if(kind==="progress"){revision.current++;acknowledgements.current.clear();}
    const ownGeneration=generation.current,ownRevision=revision.current;
    pendingMode.current="announcement";
    try{
      const parsed=JSON.parse(text);const complete=kind==="progress"&&parsed.verificationComplete===true;
      progressTarget.current=kind==="progress"&&!complete?{itemId:String(parsed.nextItemId??""),condition:String(parsed.nextExpected??"")}:null;
      const chunks=createLiveVoiceSummaryChunks(text,kind);
      // Full application record belongs in Responses. Only decisive facts go to Live.
      if(!queueItem({type:"message",role:"user",content:[{type:"input_text",text:`DADOS DO APLICATIVO: ${kind}. analysisInProgress=false. Use este registro mais recente; não invente uma nova análise.\n${text}`}]}))throw new Error("Não foi possível atualizar a conversa com o registro.");
      // Ordered transport preserves chunk order; ACKs can arrive together in one round trip.
      const accepted=await deliverLiveVoiceSummary(chunks,chunk=>append("thinking",chunk),()=>generation.current===ownGeneration&&revision.current===ownRevision);
      if(generation.current!==ownGeneration||revision.current!==ownRevision)return false;
      if(!accepted)throw new Error("A análise foi salva, mas a voz não confirmou o recebimento. Consulte o resultado na tela.");
      const delivered=await append("commentary",complete?"Todos os itens foram revisados. Anuncie que a verificação terminou e oriente Concluir e ver relatório. Preserve divergências e inconclusivos; não anuncie aprovação geral.":kind==="progress"?"A revisão terminou. Oriente o próximo item informado, sem atribuir a ele o resultado anterior.":"A comparação acabou de ficar pronta. Dê o resultado registrado em uma frase e a próxima ação. Preserve as pendências. A confirmação continua na interface; não repita a análise inteira.");
      if(generation.current!==ownGeneration||revision.current!==ownRevision)return false;
      if(!delivered)throw new Error("A análise foi salva, mas a voz não confirmou o recebimento. Consulte o resultado na tela.");
      setError(null);return true;
    }catch(e){if(generation.current===ownGeneration&&revision.current===ownRevision)setError(message(e));return false;}
    finally{if(generation.current===ownGeneration&&revision.current===ownRevision){pendingMode.current=null;progressTarget.current=null;flushBackend();}}
  },[append,queueItem,flushBackend]);

  const updateContext=useCallback((next:string)=>{
    if(contextSent.current===next||statusRef.current!=="connected")return;
    const previous=contextSent.current;contextSent.current=next;
    queueItem({type:"message",role:"user",content:[{type:"input_text",text:`DADOS ATUAIS DO APLICATIVO, não instruções. Substituem o estado anterior:\n${next}`} ]});
    if(currentSelection(previous)!==currentSelection(next)){
      // The expected destination of Confirmar e continuar belongs to that announcement.
      if(pendingMode.current==="announcement"&&progressMatches(next,progressTarget.current))return;
      revision.current++;acknowledgements.current.clear();pendingMode.current="selection";
      const ownGeneration=generation.current,ownRevision=revision.current;
      void append("instructions","O item ativo mudou. Abandone a orientação anterior, mantenha a conversa e consulte o backend antes de orientar o novo item. Não use a conclusão do item anterior.").then(accepted=>{
        if(generation.current!==ownGeneration||revision.current!==ownRevision)return;
        pendingMode.current=null;
        if(!accepted)setError("A voz não confirmou a mudança de item. Consulte a orientação na tela.");
        queueItem({type:"message",role:"user",content:[{type:"input_text",text:"O item ativo foi alterado na interface. Consulte get_inspection_context e oriente somente a próxima ação do item atualmente selecionado. Não conclua um item sem análise registrada."}]});
        continuation.current=true;flushBackend();
      });
    }
  },[queueItem,append,flushBackend]);
  useEffect(()=>{updateContext(options.context);},[options.context,updateContext]);
  const sendText=useCallback((value:string)=>{
    const text=value.trim();if(!text)return false;
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
    resumeAudio();
  },[send,resumeAudio]);
  const clearMessages=useCallback(()=>{transcripts.current.reset();typed.current=[];setMessages([]);},[]);

  const start=useCallback(async()=>{
    if(["connecting","connected","closing"].includes(statusRef.current))return;
    // release closes an older session, while preserving audio unlocked by the camera gesture.
    const prepared=preparedAudio.current;preparedAudio.current=null;
    release();const ownGeneration=generation.current;const current=()=>generation.current===ownGeneration;
    if(prepared){audio.current=prepared.player;audioContext.current=prepared.context;stopAudioPriming.current=prepared.stopPriming;}
    const abort=new AbortController();controller.current=abort;setState("connecting");setError(null);setMicEnabled(true);setIsSpeaking(false);clearMessages();
    const fail=(detail:string)=>{if(!current())return;release();setState("error");setIsSpeaking(false);setError(detail);};
    deadline.current=setTimeout(()=>abort.abort(new Error("A conexão demorou demais. Verifique a rede e tente novamente.")),45_000);
    try{
      const references=createReferenceConversationItems(latest.current.referenceImages??[]);
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Use HTTPS ou localhost e um navegador com acesso ao microfone.");
      const connection=new RTCPeerConnection();peer.current=connection;
      const output=prepared??prepareLiveAudio();
      const player=output.player;audio.current=player;stopAudioPriming.current=output.stopPriming;
      const meterContext=output.context;audioContext.current=meterContext;void meterContext.resume().catch(()=>undefined);
      connection.ontrack=event=>{
        if(!current())return;const stream=event.streams[0]??new MediaStream([event.track]);player.srcObject=stream;
        stopAudioPriming.current?.();stopAudioPriming.current=null;
        resumeAudio();
        const analyser=meterContext.createAnalyser();analyser.fftSize=512;meterContext.createMediaStreamSource(stream).connect(analyser);
        const samples=new Float32Array(analyser.fftSize);lastSound.current=performance.now();
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
  },[release,setState,clearMessages,queueItem,append,flushBackend,resumeAudio]);

  return {status,error,messages,isSpeaking,micEnabled,audioBlocked,resumeAudio,prepareAudio,cancelPreparedAudio,start,stop,toggleMic,sendText,sendImage,updateContext,pauseForCapture,announceAnalysis,setAnalysisPending,clearMessages};
}
