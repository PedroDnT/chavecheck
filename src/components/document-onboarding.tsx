"use client";

import {useId, useRef} from "react";
import {ArrowRight, Check, FileText, LoaderCircle, ScanLine, Upload} from "lucide-react";
import "./document-onboarding.css";

type WorkflowHeaderProps = {
  step: 1 | 2 | 3;
  onHome?: () => void;
  onRooms?: () => void;
  onReport?: () => void;
  showSteps?: boolean;
};

export function WorkflowHeader({step, onHome, onRooms, onReport, showSteps = true}: WorkflowHeaderProps) {
  const stages = [
    {label: "Documento", action: onHome},
    {label: "Cômodos", action: onRooms},
    {label: "Relatório", action: onReport},
  ];
  const brand = <><span className="wf-brand-mark"><ScanLine size={27} strokeWidth={1.8} aria-hidden="true" /></span><span>chave<span className="wf-brand-light">check</span><span className="wf-brand-dot">.</span></span></>;

  return <header className="wf-header">
    <div className="wf-brandbar">
      {onHome
        ? <button type="button" className="wf-brand" onClick={onHome} aria-label="ChaveCheck, início">{brand}</button>
        : <div className="wf-brand" role="img" aria-label="ChaveCheck">{brand}</div>}
    </div>
    {showSteps && <nav className="wf-navigation" aria-label="Etapas da vistoria">
      <ol className="wf-steps">
        {stages.map((stage, index) => {
          const number = index + 1;
          const complete = number < step;
          return <li key={stage.label} className={`wf-step${number === step ? " wf-step-current" : ""}${complete ? " wf-step-complete" : ""}`}>
            <button type="button" onClick={stage.action} disabled={!stage.action} aria-current={number === step ? "step" : undefined}>
              <span className="wf-step-number" aria-hidden="true">{complete ? <Check size={17} strokeWidth={2.5} /> : number}</span>
              <span className="wf-step-label">{stage.label}</span>
            </button>
          </li>;
        })}
      </ol>
    </nav>}
  </header>;
}

type DocumentUploadProps = {
  onFile: (file: File) => void;
  busy: boolean;
  error: string | null;
  onResume?: () => void;
};

export function DocumentUpload({onFile, busy, error, onResume}: DocumentUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();

  return <section className="wf-onboarding wf-upload" aria-labelledby="wf-upload-title" aria-busy={busy}>
    <div className="wf-upload-content">
      <h1 id="wf-upload-title">Sua vistoria começa aqui.</h1>
      <p className="wf-introduction">Envie o PDF da vistoria anterior para preparar os cômodos e começar a conferência.</p>
      <div className="wf-upload-art" aria-hidden="true"><FileText size={91} strokeWidth={1.15} /></div>
      <input
        ref={input}
        className="wf-file-input"
        type="file"
        accept="application/pdf,.pdf"
        aria-label="PDF da vistoria anterior"
        aria-describedby={error ? errorId : undefined}
        disabled={busy}
        tabIndex={-1}
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onFile(file);
        }}
      />
      <button className="wf-upload-button" type="button" onClick={() => input.current?.click()} disabled={busy} aria-describedby={error ? errorId : undefined}>
        {busy ? <LoaderCircle className="wf-loading-icon" size={21} aria-hidden="true" /> : <Upload size={21} aria-hidden="true" />}
        {busy ? "Abrindo documento…" : "Enviar PDF da vistoria"}
      </button>
      {error && <p className="wf-upload-error" id={errorId} role="alert">{error}</p>}
      {onResume && <button type="button" className="wf-resume-button" onClick={onResume} disabled={busy}>Continuar vistoria salva <ArrowRight size={16} aria-hidden="true" /></button>}
    </div>
  </section>;
}

type DocumentScannerProps = {
  fileName: string;
  elapsedMs: number;
  durationMs?: number;
};

export function DocumentScanner({fileName, elapsedMs, durationMs = 5000}: DocumentScannerProps) {
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 5000;
  const elapsed = Math.min(duration, Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  const percent = Math.round(elapsed / duration * 100);
  const current = percent < 60 ? 1 : 2;
  const statuses = ["Documento recebido", "Mapeando cômodos", "Preparando verificações"];

  return <section className="wf-onboarding wf-scanner" aria-labelledby="wf-scanner-title" aria-busy="true">
    <div className="wf-scanner-content">
      <h1 id="wf-scanner-title">Mapeando sua vistoria.</h1>
      <p className="wf-introduction">Organizando os ambientes e os itens de conferência.</p>
      <div className="wf-scan-art" aria-hidden="true">
        {/* The document is a raster illustration; only the scan indicator is animated. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/document-scan.png" alt="" width={280} height={280} />
        <span className="wf-scan-corner wf-scan-top-left" />
        <span className="wf-scan-corner wf-scan-top-right" />
        <span className="wf-scan-corner wf-scan-bottom-left" />
        <span className="wf-scan-corner wf-scan-bottom-right" />
        <span className="wf-scan-beam" />
      </div>
      <p className="wf-scan-filename" title={fileName}>{fileName}</p>
      <ol className="wf-scan-statuses" aria-label="Mapeamento do documento">
        {statuses.map((status, index) => {
          const complete = index < current || percent === 100;
          const active = index === current && percent < 100;
          return <li key={status} className={complete ? "wf-scan-done" : active ? "wf-scan-active" : ""} aria-current={active ? "step" : undefined}>
            <span className="wf-scan-status-icon" aria-hidden="true">{complete && <Check size={15} strokeWidth={2.5} />}</span>
            <span>{status}</span>
            <span className="wf-visually-hidden">{complete ? ", concluído" : active ? ", em andamento" : ", aguardando"}</span>
          </li>;
        })}
      </ol>
    </div>
    <div className="wf-scan-progress">
      <progress value={percent} max={100} aria-label="Progresso do mapeamento" aria-valuetext={`${percent} por cento`} />
      <p>{Math.floor(elapsed / 1000)} de {Math.ceil(duration / 1000)} s</p>
    </div>
  </section>;
}
