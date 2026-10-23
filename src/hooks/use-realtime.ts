"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createConversationItemId, isRecord, parseToolCall, updateTranscript, type RealtimeMessage } from "@/lib/realtime-events";

type Status = "idle" | "connecting" | "connected" | "error";
type ReferenceImage = { id: string; dataUrl: string; label: string };
type RealtimeOptions = {
  context: string;
  referenceImages?: ReferenceImage[];
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown> | unknown;
};

export function createReferenceConversationItems(images: ReferenceImage[]) {
  if (images.length > 2) throw new Error("Use no máximo duas fotos de referência.");
  return images.map((reference) => {
    if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(reference.dataUrl) || reference.dataUrl.length > 2_000_000) {
      throw new Error("Não foi possível carregar a foto de referência. Use JPEG ou PNG com até 1,5 MB.");
    }
    return {
      id: createConversationItemId(), type: "message", role: "user",
      content: [
        { type: "input_text", text: `REFERÊNCIA FICTÍCIA ANTERIOR — ${reference.id}: ${reference.label}. Esta foto é apenas a base de comparação; não mostra a câmera atual, não comprova ausência de avarias e não aprova itens. Aguarde um quadro marcado ATUAL antes de avaliar o cenário atual.` },
        { type: "input_image", image_url: reference.dataUrl },
      ],
    };
  });
}

class RealtimeMessageSizeError extends Error {}

export function serializeRealtimeEvent(event: Record<string, unknown>, maxMessageSize = 65_536): string {
  const serialized = JSON.stringify(event);
  if (Number.isFinite(maxMessageSize) && new TextEncoder().encode(serialized).byteLength > maxMessageSize) {
    throw new RealtimeMessageSizeError("Esta mensagem ou imagem excede o limite da conexão de voz. Use o modo de texto ou envie uma imagem menor.");
  }
  return serialized;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Cancelado", "AbortError"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Permita o microfone no navegador para iniciar a conversa por voz.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "Nenhum microfone foi encontrado. Conecte um microfone e tente novamente.";
  }
  return error instanceof Error ? error.message : "Não foi possível iniciar a conversa.";
}

/** WebRTC media carries audio; the ordered data channel carries text, images and tools. */
export function useRealtime({ context, referenceImages = [], onToolCall }: RealtimeOptions) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const statusRef = useRef<Status>("idle");
  const contextRef = useRef(context);
  const referenceImagesRef = useRef(referenceImages);
  const toolsRef = useRef(onToolCall);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const activeResponses = useRef(new Set<string>());
  const responseRequested = useRef(false);
  const responseQueued = useRef(false);
  const processingTools = useRef(false);
  const userSpeaking = useRef(false);
  const handledCalls = useRef(new Set<string>());
  const inputsAwaitingAcceptance = useRef(new Set<string>());
  const startupPending = useRef(false);

  useEffect(() => { toolsRef.current = onToolCall; }, [onToolCall]);
  useEffect(() => { referenceImagesRef.current = referenceImages; }, [referenceImages]);

  const changeStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const release = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (deadlineRef.current) clearTimeout(deadlineRef.current);
    if (disconnectRef.current) clearTimeout(disconnectRef.current);
    deadlineRef.current = null;
    disconnectRef.current = null;
    const channel = channelRef.current;
    channelRef.current = null;
    channel?.close();
    microphoneRef.current?.getTracks().forEach((track) => track.stop());
    microphoneRef.current = null;
    const peer = peerRef.current;
    peerRef.current = null;
    peer?.getReceivers().forEach((receiver) => receiver.track?.stop());
    peer?.close();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
    activeResponses.current.clear();
    responseRequested.current = false;
    responseQueued.current = false;
    processingTools.current = false;
    userSpeaking.current = false;
    handledCalls.current.clear();
    inputsAwaitingAcceptance.current.clear();
    startupPending.current = false;
  }, []);

  const stop = useCallback(() => {
    release();
    changeStatus("idle");
    setIsSpeaking(false);
    setMicEnabled(true);
    setError(null);
  }, [release, changeStatus]);

  useEffect(() => () => release(), [release]);

  const send = useCallback((event: Record<string, unknown>): boolean => {
    const channel = channelRef.current;
    if (channel?.readyState !== "open") return false;
    try {
      channel.send(serializeRealtimeEvent(event, peerRef.current?.sctp?.maxMessageSize));
      return true;
    } catch (sendError) {
      setError(sendError instanceof RealtimeMessageSizeError ? sendError.message : "Não foi possível enviar esta mensagem. Verifique sua conexão e tente novamente.");
      return false;
    }
  }, []);

  const flushResponse = useCallback(() => {
    if (
      !responseQueued.current || responseRequested.current || activeResponses.current.size ||
      processingTools.current || userSpeaking.current || startupPending.current || channelRef.current?.readyState !== "open"
    ) return;
    responseQueued.current = false;
    responseRequested.current = true;
    if (!send({ type: "response.create" })) responseRequested.current = false;
  }, [send]);

  const requestResponse = useCallback(() => {
    responseQueued.current = true;
    flushResponse();
  }, [flushResponse]);

  const recordText = useCallback((id: string, role: RealtimeMessage["role"], text: string, append = false) => {
    // Match persisted history's bound so old session entries cannot be reinserted by a merge.
    setMessages((previous) => updateTranscript(previous, id, role, text, append).slice(-150));
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const updateContext = useCallback((nextContext: string) => {
    if (contextRef.current === nextContext) return;
    contextRef.current = nextContext;
    if (statusRef.current !== "connected") return;
    // Context is conversation data, never a replacement for the server's safety instructions.
    send({
      type: "conversation.item.create",
      item: {
        type: "message", role: "user",
        content: [{ type: "input_text", text: `Atualização dos dados da vistoria (não precisa responder agora):\n${nextContext}` }],
      },
    });
  }, [send]);

  useEffect(() => { updateContext(context); }, [context, updateContext]);

  const sendText = useCallback((text: string) => {
    const value = text.trim();
    if (!value) return;
    if (statusRef.current !== "connected") {
      setError("Inicie a conversa antes de enviar uma mensagem.");
      return;
    }
    setError(null);
    const id = createConversationItemId();
    inputsAwaitingAcceptance.current.add(id);
    if (send({
      event_id: id,
      type: "conversation.item.create",
      item: { id, type: "message", role: "user", content: [{ type: "input_text", text: value }] },
    })) {
      recordText(id, "user", value);
    } else inputsAwaitingAcceptance.current.delete(id);
  }, [send, recordText]);

  const sendImage = useCallback((dataUrl: string, prompt?: string) => {
    if (statusRef.current !== "connected") {
      setError("Inicie a conversa antes de compartilhar a câmera.");
      return;
    }
    if (!/^data:image\/(jpeg|png);base64,/.test(dataUrl) || dataUrl.length > 2_000_000) {
      setError("Envie uma imagem JPEG ou PNG com até 1,5 MB.");
      return;
    }
    setError(null);
    const text = `ATUAL — quadro da câmera compartilhado agora. Compare com as referências anteriores, se houver. Não trate este quadro como uma foto de evidência aprovada.\n${prompt || "Oriente a próxima verificação e indique se precisa de outro ângulo."}`;
    const id = createConversationItemId();
    inputsAwaitingAcceptance.current.add(id);
    if (!send({
      event_id: id,
      type: "conversation.item.create",
      item: {
        id, type: "message", role: "user",
        content: [{ type: "input_text", text }, { type: "input_image", image_url: dataUrl }],
      },
    })) inputsAwaitingAcceptance.current.delete(id);
  }, [send]);

  const toggleMic = useCallback(() => {
    const tracks = microphoneRef.current?.getAudioTracks();
    if (!tracks?.length) return;
    const enabled = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = enabled; });
    setMicEnabled(enabled);
    // This user gesture also lets browsers recover from blocked audio autoplay.
    void audioRef.current?.play().catch(() => setError("O navegador bloqueou o áudio. Permita a reprodução de som para este site."));
  }, []);

  const start = useCallback(async () => {
    if (statusRef.current === "connecting" || statusRef.current === "connected") return;
    release();
    const generation = generationRef.current;
    const current = () => generationRef.current === generation;
    const controller = new AbortController();
    abortRef.current = controller;
    startupPending.current = true;
    // Startup items are accepted silently. References must all be accepted before
    // the greeting is sent, and no voice/tool response can bypass this barrier.
    const startupInputs = new Map<string, () => void>();
    const accepted = (id: string) => new Promise<void>((resolve) => startupInputs.set(id, resolve));
    changeStatus("connecting");
    setError(null);
    setMessages([]);
    setIsSpeaking(false);
    setMicEnabled(true);
    const fail = (message: string) => {
      if (!current()) return;
      release();
      changeStatus("error");
      setIsSpeaking(false);
      setError(message);
    };
    deadlineRef.current = setTimeout(() => {
      controller.abort(new Error("A conexão demorou demais. Verifique o microfone e a rede, ou tente o modo de texto."));
    }, 30_000);

    try {
      const referenceItems = createReferenceConversationItems(referenceImagesRef.current);
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        throw new Error("Use um navegador compatível em HTTPS ou localhost para acessar o microfone.");
      }
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      const audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audioRef.current = audio;
      peer.ontrack = (event) => {
        if (!current()) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(() => {
          if (current()) setError("O áudio foi bloqueado pelo navegador. Toque no botão do microfone para habilitar a reprodução.");
        });
      };
      peer.onconnectionstatechange = () => {
        if (!current()) return;
        if (peer.connectionState === "failed") fail("A conexão de voz caiu. Inicie a conversa novamente.");
        if (peer.connectionState === "disconnected" && !disconnectRef.current) {
          disconnectRef.current = setTimeout(() => fail("A conexão de voz foi interrompida. Inicie novamente."), 8_000);
        }
        if (peer.connectionState === "connected" && disconnectRef.current) {
          clearTimeout(disconnectRef.current);
          disconnectRef.current = null;
        }
      };
      const mediaPromise = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // getUserMedia itself cannot be aborted: release any stream that arrives after cancellation.
      void mediaPromise.then((stream) => {
        if (!current() || controller.signal.aborted) stream.getTracks().forEach((track) => track.stop());
      }, () => undefined);
      const microphone = await abortable(mediaPromise, controller.signal);
      if (!current()) { microphone.getTracks().forEach((track) => track.stop()); return; }
      microphoneRef.current = microphone;
      microphone.getAudioTracks().forEach((track) => peer.addTrack(track, microphone));
      const channel = peer.createDataChannel("oai-events", { ordered: true });
      channelRef.current = channel;
      const ready = new Promise<void>((resolve, reject) => {
        channel.onopen = () => resolve();
        channel.onerror = () => {
          reject(new Error("Não foi possível abrir o canal de conversa."));
          // ready may already be resolved while startup is still awaiting image ACKs.
          if (current()) fail("O canal da conversa falhou. Inicie novamente ou use o modo de texto.");
        };
      });
      // Attach cancellation immediately; startup may fail before SDP negotiation ends.
      const readyOrAborted = abortable(ready, controller.signal);
      void readyOrAborted.catch(() => undefined);
      channel.onclose = () => { if (current()) fail("A conversa foi desconectada. Inicie novamente para continuar."); };
      channel.onmessage = (message) => {
        if (!current() || typeof message.data !== "string") return;
        let event: unknown;
        try { event = JSON.parse(message.data); } catch { return; }
        if (!isRecord(event) || typeof event.type !== "string") return;
        const itemId = typeof event.item_id === "string" ? event.item_id : null;
        switch (event.type) {
          case "conversation.item.added":
          case "conversation.item.done":
            if (isRecord(event.item) && typeof event.item.id === "string") {
              const acknowledge = startupInputs.get(event.item.id);
              if (acknowledge) {
                startupInputs.delete(event.item.id);
                acknowledge();
              } else if (inputsAwaitingAcceptance.current.delete(event.item.id)) {
                // Only answer accepted input; rejected items must not answer stale context.
                requestResponse();
              }
            }
            break;
          case "input_audio_buffer.speech_started":
            userSpeaking.current = true;
            break;
          case "input_audio_buffer.speech_stopped":
            userSpeaking.current = false;
            break;
          case "input_audio_buffer.committed":
            userSpeaking.current = false;
            if (itemId) recordText(itemId, "user", "");
            requestResponse();
            break;
          case "conversation.item.input_audio_transcription.delta":
            if (itemId && typeof event.delta === "string") recordText(itemId, "user", event.delta, true);
            break;
          case "conversation.item.input_audio_transcription.completed":
            if (itemId && typeof event.transcript === "string") recordText(itemId, "user", event.transcript);
            break;
          case "conversation.item.input_audio_transcription.failed":
            if (itemId) recordText(itemId, "user", "[Áudio enviado; transcrição indisponível]");
            break;
          case "response.output_audio_transcript.delta":
          case "response.output_text.delta":
            if (itemId && typeof event.delta === "string") recordText(itemId, "assistant", event.delta, true);
            break;
          case "response.output_audio_transcript.done":
          case "response.output_text.done": {
            const text = event.transcript ?? event.text;
            if (itemId && typeof text === "string") recordText(itemId, "assistant", text);
            break;
          }
          case "output_audio_buffer.started":
            setIsSpeaking(true);
            break;
          case "output_audio_buffer.stopped":
          case "output_audio_buffer.cleared":
            setIsSpeaking(false);
            break;
          case "response.created":
            responseRequested.current = false;
            if (isRecord(event.response) && typeof event.response.id === "string") activeResponses.current.add(event.response.id);
            break;
          case "response.done": {
            if (!isRecord(event.response)) break;
            const response = event.response;
            if (typeof response.id === "string") activeResponses.current.delete(response.id);
            responseRequested.current = false;
            if (response.status === "failed") setError("A assistente não conseguiu responder. Tente enviar sua mensagem novamente.");
            const outputs = Array.isArray(response.output) ? response.output.filter(isRecord) : [];
            const calls = response.status === "completed"
              ? outputs.filter((item) => item.type === "function_call" && typeof item.call_id === "string" && !handledCalls.current.has(item.call_id))
              : [];
            if (!calls.length) { flushResponse(); break; }
            processingTools.current = true;
            void (async () => {
              for (const call of calls) {
                if (!current()) return;
                const callId = call.call_id as string;
                handledCalls.current.add(callId);
                let output: unknown;
                try {
                  const parsed = parseToolCall(call.name, call.arguments);
                  output = await abortable(Promise.resolve(toolsRef.current(parsed.name, parsed.args)), controller.signal);
                } catch (toolError) {
                  output = { error: errorMessage(toolError) };
                }
                if (!current()) return;
                let serialized: string;
                try { serialized = JSON.stringify(output ?? { ok: true }); }
                catch { serialized = JSON.stringify({ error: "Não foi possível ler o resultado da ação." }); }
                send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: serialized } });
              }
              if (!current()) return;
              processingTools.current = false;
              requestResponse();
            })();
            break;
          }
          case "error": {
            const detail = isRecord(event.error) ? event.error : {};
            if (startupPending.current) {
              // Session errors can lack event_id. None may leave startup waiting for ACKs.
              controller.abort(new Error("A assistente não conseguiu aceitar os dados de início da vistoria. Tente iniciar novamente ou use o modo de texto."));
              break;
            }
            if (typeof detail.event_id === "string") inputsAwaitingAcceptance.current.delete(detail.event_id);
            if (detail.code === "conversation_already_has_active_response") {
              responseRequested.current = false;
              responseQueued.current = true;
            } else {
              responseRequested.current = false;
              setError(typeof detail.message === "string" ? detail.message : "A conversa encontrou um erro. Tente novamente.");
            }
            break;
          }
        }
      };
      const offer = await abortable(peer.createOffer(), controller.signal);
      await abortable(peer.setLocalDescription(offer), controller.signal);
      const response = await fetch("/api/realtime", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp, context: contextRef.current }), signal: controller.signal,
      });
      const answer = await response.text();
      if (!response.ok) {
        let detail: unknown;
        try { detail = JSON.parse(answer); } catch { detail = null; }
        throw new Error(isRecord(detail) && typeof detail.error === "string" ? detail.error : `Não foi possível conectar à assistente (HTTP ${response.status}).`);
      }
      await abortable(peer.setRemoteDescription({ type: "answer", sdp: answer }), controller.signal);
      await readyOrAborted;
      if (!current()) return;
      if (referenceItems.length) {
        const referenceAcceptance = abortable(Promise.all(referenceItems.map((item) => accepted(item.id))), controller.signal);
        // A failed send aborts startup; keep rejection handled even before await.
        void referenceAcceptance.catch(() => undefined);
        for (const item of referenceItems) {
          if (!send({ event_id: item.id, type: "conversation.item.create", item })) {
            throw new Error("Não foi possível enviar as fotos de referência pela conexão de voz. Use o modo de texto ou tente iniciar novamente.");
          }
        }
        await referenceAcceptance;
        if (!current()) return;
      }
      const greetingId = createConversationItemId();
      const greetingAcceptance = abortable(accepted(greetingId), controller.signal);
      void greetingAcceptance.catch(() => undefined);
      if (!send({
        event_id: greetingId,
        type: "conversation.item.create",
        item: {
          id: greetingId, type: "message", role: "user",
          content: [{ type: "input_text", text: "Podemos começar a vistoria. Apresente-se brevemente em português brasileiro e me oriente sobre o primeiro item pendente. As fotos de REFERÊNCIA, quando presentes, são uma base anterior. Ainda não recebi um quadro ATUAL: peça para apontar e compartilhar a câmera, sem concluir nada sobre o estado atual." }],
        },
      })) throw new Error("Não foi possível iniciar a vistoria. Tente novamente.");
      await greetingAcceptance;
      if (!current()) return;
      if (deadlineRef.current) clearTimeout(deadlineRef.current);
      deadlineRef.current = null;
      startupPending.current = false;
      changeStatus("connected");
      requestResponse();
    } catch (connectionError) {
      if (current()) fail(errorMessage(connectionError));
    }
  }, [release, changeStatus, recordText, requestResponse, flushResponse, send]);

  return { status, error, messages, isSpeaking, micEnabled, start, stop, toggleMic, sendText, sendImage, updateContext, clearMessages };
}
