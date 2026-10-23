"use client";

import type {RefObject} from "react";
import {ArrowUp, LoaderCircle, Mic, MicOff, Sparkles, Square, Volume2} from "lucide-react";
import type {useLive} from "@/hooks/use-live";
import type {Inspection} from "@/lib/inspection";

interface GuidedConversationProps {
  voice: ReturnType<typeof useLive>;
  cameraActive: boolean;
  starting: boolean;
  complete: boolean;
  messages: Inspection["messages"];
  message: string;
  busy: boolean;
  chatBusy: boolean;
  canStart: boolean;
  canSend: boolean;
  endRef: RefObject<HTMLDivElement | null>;
  onMessage: (value: string) => void;
  onSend: () => void;
  onStart: () => void;
  onStop: () => void;
}

export function GuidedConversation({voice, cameraActive, starting, complete, messages, message, busy, chatBusy, canStart, canSend, endRef, onMessage, onSend, onStart, onStop}: GuidedConversationProps) {
  const connected = voice.status === "connected";
  const waiting = starting || voice.status === "connecting" || voice.status === "closing";
  const status = connected ? voice.isSpeaking ? "Assistente falando" : busy ? "Pode falar enquanto analiso a foto" : "Pronta para ouvir você" : waiting ? "Preparando a conversa…" : complete ? "Verificação concluída" : cameraActive ? "Continue por texto ou ative a voz" : "A voz começa ao habilitar a câmera";
  return <section className="guided-conversation" aria-label="Conversa com a assistente">
    <header className="guided-conversation-heading"><span className="assistant-symbol"><Sparkles size={20}/></span><div><h2>Assistente de vistoria</h2><p role="status">{status}</p></div>
      {connected && <div className="guided-voice-actions"><button className="icon-button" onClick={voice.toggleMic} aria-label={voice.micEnabled ? "Silenciar microfone" : "Ativar microfone"}>{voice.micEnabled ? <Mic size={19}/> : <MicOff size={19}/>}</button><button className="icon-button" onClick={onStop} aria-label="Pausar conversa por voz"><Square size={16}/></button></div>}
    </header>
    {connected && voice.audioBlocked && <button className="secondary guided-resume-voice" onClick={voice.resumeAudio}><Volume2 size={17}/>Habilitar som da assistente</button>}
    {cameraActive && !connected && !complete && <button className="secondary guided-resume-voice" disabled={waiting || !canStart} onClick={onStart}>{waiting ? <LoaderCircle className="spin" size={17}/> : <Volume2 size={17}/>} {waiting ? "Conectando voz…" : "Ativar voz da assistente"}</button>}
    <div className="guided-messages" tabIndex={0} role="log" aria-label="Mensagens da vistoria" aria-live="polite">
      {!messages.length && <div className="guided-welcome"><p>Vou indicar o que enquadrar. Quando estiver pronto, toque em <strong>Fotografar e analisar</strong>.</p><p>Se faltar algum detalhe, peço outra foto. Depois, você confirma o resultado e seguimos para o próximo item.</p></div>}
      {messages.filter(entry => entry.text.trim()).map(entry => <div className={`chat-message ${entry.role}`} key={entry.id}><span className="message-author">{entry.role === "assistant" ? "Assistente" : "Você"}</span><p>{entry.text}</p></div>)}
      {chatBusy && <p className="guided-chat-wait" role="status"><LoaderCircle className="spin" size={16}/>Preparando orientação…</p>}
      <div ref={endRef}/>
    </div>
    <form className="guided-composer" onSubmit={event => {event.preventDefault(); onSend();}}>
      <textarea aria-label="Mensagem para a assistente" placeholder="Escreva uma dúvida ou observação…" value={message} maxLength={4000} rows={2} onChange={event => onMessage(event.target.value)} onKeyDown={event => {if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); onSend();}}}/>
      <button className="icon-button" type="submit" aria-label="Enviar mensagem" disabled={!message.trim() || chatBusy || !canSend}><ArrowUp size={20}/></button>
    </form>
  </section>;
}
