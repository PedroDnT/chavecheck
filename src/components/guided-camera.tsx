"use client";

import {Camera, CameraOff, ImagePlus, LoaderCircle, RefreshCw} from "lucide-react";
import type {useCamera} from "@/hooks/use-camera";

interface GuidedCameraProps {
  camera: ReturnType<typeof useCamera>;
  guidance: string;
  busy: boolean;
  starting: boolean;
  canAnalyze: boolean;
  onStart: () => void;
  onStop: () => void;
  onCapture: () => void;
  onUpload: () => void;
}

export function GuidedCamera({camera, guidance, busy, starting, canAnalyze, onStart, onStop, onCapture, onUpload}: GuidedCameraProps) {
  return <section className={`guided-camera ${camera.active ? "is-active" : ""}`} aria-label="Captura guiada">
    <div className="guided-preview">
      <video ref={camera.attach} autoPlay muted playsInline className={`guided-video ${camera.facing === "user" ? "mirrored" : ""}`} aria-label="Prévia da câmera para enquadrar a foto" hidden={!camera.active}/>
      {!camera.active ? <div className="guided-camera-start">
        <Camera size={32} strokeWidth={1.5} aria-hidden="true"/>
        <h2>Vamos começar pela câmera</h2>
        <p>Habilite a câmera para ouvir a assistente. Ela vai orientar cada foto, um item por vez.</p>
        <button className="primary" disabled={starting || camera.loading} onClick={onStart}>
          {starting || camera.loading ? <LoaderCircle className="spin" size={19}/> : <Camera size={19}/>}
          {starting || camera.loading ? "Abrindo câmera…" : "Habilitar câmera e começar"}
        </button>
        <small>Permita câmera e microfone quando o navegador pedir.</small>
      </div> : <>
        <span className="guided-preview-label">Enquadre a próxima foto</span>
        <div className="guided-preview-tools">
          <button className="icon-button" disabled={camera.loading || busy} onClick={() => void camera.switchCamera()} aria-label="Trocar câmera"><RefreshCw size={19}/></button>
          <button className="icon-button" onClick={onStop} aria-label="Pausar câmera e voz"><CameraOff size={19}/></button>
        </div>
      </>}
    </div>
    {camera.error && <p className="inline-error" role="alert">{camera.error}</p>}
    {camera.active && <>
      <div className="guided-direction" role="status"><span>{busy ? "Foto recebida" : "Próximo enquadramento"}</span><p>{busy ? "Foto recebida. Pode continuar falando comigo enquanto comparo este detalhe." : guidance}</p></div>
      <button className="primary guided-shutter" disabled={busy || !canAnalyze || camera.loading} onClick={onCapture}>
        {busy ? <LoaderCircle className="spin" size={20}/> : <Camera size={20}/>}{busy ? "Analisando foto…" : "Fotografar e analisar"}
      </button>
      <p className="guided-photo-note">A foto só é enviada quando você toca no botão.</p>
    </>}
    <button className="text-button guided-upload" disabled={busy} onClick={onUpload}><ImagePlus size={16}/>Escolher foto do celular</button>
  </section>;
}
