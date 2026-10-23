"use client";

import {useEffect, useId, useRef, useState} from "react";
import {ArrowRight, Camera, CheckCircle2, CircleHelp, Expand, FileSearch, Info, X} from "lucide-react";
import {statusLabel, type Evidence, type ReferencePhoto, type ReviewEvent} from "@/lib/inspection";
import type {ReferenceAnalysis, Region, VisualAnalysis} from "@/lib/visual-analysis";
import {BaselineInventory} from "./baseline-inventory";
import "./analysis-card.css";

export interface AnalysisCardProps {
  analysis: VisualAnalysis;
  evidence: Evidence | undefined;
  evidencePool?: Evidence[];
  referencePhotos: ReferencePhoto[];
  compact?: boolean;
  review?: ReviewEvent;
  requirementChanged?: boolean;
}

export function analysisTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não disponível" : new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(date);
}

const viewMatchLabel = {
  same_area: "Mesma região visível",
  partial: "Regiões parcialmente correspondentes",
  different: "Enquadramento diferente da referência",
  unknown: "Correspondência não identificada",
};
const assessmentLabel = {unchanged: "Sem mudança identificada", changed: "Diferença identificada", uncertain: "Precisa de aproximação ou confirmação"};

type Annotation = {region: Region; label: string};
interface AnnotatedPhotoProps {
  src?: string;
  label: string;
  caption: string;
  annotations?: Annotation[];
}

function Regions({annotations}: {annotations: Annotation[]}) {
  return annotations.map(({region, label}, index) => <span
    className="cc-analysis-region"
    aria-hidden="true"
    key={`${label}-${index}`}
    style={{left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%`}}
  ><span>{label}</span></span>);
}

export function AnnotatedPhoto({src, label, caption, annotations = []}: AnnotatedPhotoProps) {
  const [enlarged, setEnlarged] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const captionId = useId();

  useEffect(() => {
    if (enlarged && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [enlarged]);

  return <figure>
    <span className="cc-analysis-image-label">{label}</span>
    {src ? <button
      className="cc-analysis-image"
      type="button"
      aria-label={`Ampliar ${label.toLocaleLowerCase("pt-BR")}`}
      aria-haspopup="dialog"
      onClick={() => setEnlarged(true)}
    >
      <span className="cc-analysis-image-surface">
        <img src={src} alt={caption} loading="lazy"/>
        <Regions annotations={annotations}/>
        <span className="cc-analysis-image-hint" aria-hidden="true"><Expand size={11}/>Ampliar</span>
      </span>
    </button> : <div className="cc-analysis-image-missing">Imagem indisponível neste registro. A observação registrada está preservada abaixo.</div>}
    <figcaption>{caption}</figcaption>
    <dialog
      ref={dialog}
      className="cc-analysis-dialog cc-no-print"
      aria-labelledby={headingId}
      aria-describedby={captionId}
      onClose={() => setEnlarged(false)}
      onClick={event => {if (event.target === event.currentTarget) dialog.current?.close();}}
    >
      {enlarged && src ? <>
        <div className="cc-analysis-dialog-heading"><h2 id={headingId}>{label}</h2><button className="icon-button" type="button" aria-label="Fechar imagem ampliada" onClick={() => dialog.current?.close()} autoFocus><X size={22}/></button></div>
        <div className="cc-analysis-zoom-image"><img src={src} alt={caption}/><Regions annotations={annotations}/></div>
        <p className="cc-analysis-dialog-caption" id={captionId}>{caption}</p>
      </> : null}
    </dialog>
  </figure>;
}

function CaptureMetrics({metrics}: {metrics: NonNullable<Evidence["captureMetrics"]>}) {
  const percentage = (fraction: number) => new Intl.NumberFormat("pt-BR", {style: "percent", maximumFractionDigits: 1}).format(fraction);
  return <details className="cc-capture-metrics">
    <summary>Dados da captura</summary>
    <dl>
      <div><dt>Resolução original</dt><dd>{metrics.width} × {metrics.height} pixels</dd></div>
      <div><dt>Luminância média relativa</dt><dd>{metrics.meanLuminance} de 255</dd></div>
      <div><dt>Pixels muito escuros</dt><dd>{percentage(metrics.darkFraction)} da amostra · abaixo de 16/255</dd></div>
      <div><dt>Pixels muito claros</dt><dd>{percentage(metrics.brightFraction)} da amostra · acima de 239/255</dd></div>
    </dl>
    <p>As proporções descrevem os pixels da imagem, não a confiança da conclusão. A luminância é relativa à captura, sem medição de luz ambiente em lux.</p>
    <details className="cc-analysis-provenance"><summary>Indicador de detalhe</summary><p>Variância do Laplaciano: {new Intl.NumberFormat("pt-BR", {maximumFractionDigits: 1}).format(metrics.detailVariance)}. É uma medida de variação dos pixels; textura e enquadramento também alteram esse valor.</p></details>
  </details>;
}

function ReferenceObservation({baseline, observationId}: {baseline?: ReferenceAnalysis; observationId: string | null}) {
  const observation = baseline?.observations.find(entry => entry.id === observationId);
  if (!observation) return null;
  return <div className="cc-analysis-explanation"><strong>Registro inicial usado · {observation.label}</strong>{observation.description}</div>;
}

function AnalysisReview({analysis, review}: {analysis: VisualAnalysis; review?: ReviewEvent}) {
  const linkedReview = review?.analysisId === analysis.id && review.itemId === analysis.itemId && review.action !== "Análise visual registrada" ? review : undefined;
  let label = "Sugestão pendente de revisão";
  let kind = "pending";
  if (linkedReview?.action === "Sugestão rejeitada") {
    label = "Sugestão rejeitada";
    kind = "rejected";
  } else if (linkedReview?.status === "pendente") {
    label = "Reaberta para revisão";
  } else if (linkedReview?.action === "Análise confirmada pelo usuário") {
    label = `Sugestão confirmada${linkedReview.status ? ` · ${statusLabel[linkedReview.status]}` : ""}`;
    kind = "confirmed";
  } else if (linkedReview?.action === "Item editado pelo usuário") {
    label = `Revisada com edição${linkedReview.status ? ` · ${statusLabel[linkedReview.status]}` : ""}`;
    kind = "edited";
  } else if (linkedReview) {
    label = `Revisão registrada${linkedReview.status ? ` · ${statusLabel[linkedReview.status]}` : ""}`;
    kind = "edited";
  }
  return <div className={`cc-analysis-review cc-analysis-review-${kind}`}>
    <strong>{label}</strong>
    {linkedReview ? <><time dateTime={linkedReview.at}>{analysisTimestamp(linkedReview.at)}</time>{linkedReview.note ? <p>{linkedReview.note}</p> : null}</> : null}
  </div>;
}

export function AnalysisCard({analysis, evidence, evidencePool = [], referencePhotos, compact = false, review, requirementChanged = false}: AnalysisCardProps) {
  const {result} = analysis;
  const identicalReference=analysis.model === "deterministic-reference-match";
  const fallbackReference=analysis.references.find(reference=>reference.sha256===analysis.imageSha256)??analysis.references[0];
  const titleId = useId();
  const captures = new Map(evidencePool.filter(photo => photo.itemId === analysis.itemId).map(photo => [photo.id, photo]));
  if (evidence?.itemId === analysis.itemId) captures.set(evidence.id, evidence);
  const currentEvidence = captures.get(analysis.evidenceId);
  const currentImage = currentEvidence?.analysisDataUrl || currentEvidence?.dataUrl;
  const captureCount = new Set([analysis.evidenceId, ...(analysis.supportingEvidence ?? []).map(photo => photo.evidenceId)]).size;
  const StatusIcon = result.status === "conforme" ? CheckCircle2 : result.status === "divergencia" ? Info : CircleHelp;

  return <section className={`cc-analysis-card${compact ? " cc-analysis-compact" : ""}`} aria-labelledby={titleId}>
    <header className="cc-analysis-top">
      <div><span className="cc-analysis-eyebrow">Foto analisada · {analysisTimestamp(analysis.createdAt)}</span><h3 id={titleId}>{analysis.references.length ? "Comparação com a condição inicial" : "Comparação da foto"}</h3></div>
      <span className={`cc-analysis-state cc-analysis-state-${result.status}`}><StatusIcon size={13}/>Sugestão · {statusLabel[result.status]}</span>
    </header>
    <p className="cc-analysis-summary">{result.summary}</p>
    {analysis.supportingEvidence ? <p className="cc-analysis-capture-count"><Camera size={12}/>{captureCount} {captureCount === 1 ? "captura desta vistoria usada" : "capturas desta vistoria usadas"} na comparação</p> : null}
    {requirementChanged ? <p className="cc-analysis-superseded"><Info size={13}/><span><strong>Análise de uma condição anterior.</strong> A condição esperada ou a fonte do item mudou depois desta comparação. O fundamento original está preservado abaixo.</span></p> : null}
    <AnalysisReview analysis={analysis} review={review}/>
    <div className="cc-analysis-next">
      {result.needsPhoto ? <Camera size={16}/> : <ArrowRight size={16}/>}
      <div><strong>{result.needsPhoto ? "Próxima foto" : "Próximo passo"}</strong><p>{result.nextAction}</p></div>
    </div>
    <details className="cc-analysis-basis">
      <summary><FileSearch size={15}/>Ver imagens e fundamento da comparação</summary>
      <div className="cc-analysis-basis-content">
        <section className="cc-analysis-source"><h4>Condição e origem usadas nesta análise</h4><p>{analysis.requirement.condition || "Condição não informada."}</p><p>{analysis.requirement.source || "Fonte não informada."}</p></section>
        <section className="cc-analysis-quality">
          <h4>{identicalReference ? "Arquivo de referência reconhecido" : result.quality.usable ? "Imagem utilizável para esta comparação" : "A foto precisa de ajuste"}</h4>
          <p>{result.quality.reason}</p>
          <dl>
            <div><dt>Luz e aparência</dt><dd>{result.quality.lighting}</dd></div>
            <div><dt>Nitidez</dt><dd>{result.quality.sharpness}</dd></div>
            <div><dt>Enquadramento</dt><dd>{viewMatchLabel[result.quality.viewMatch]}</dd></div>
          </dl>
          {currentEvidence?.captureMetrics ? <CaptureMetrics metrics={currentEvidence.captureMetrics}/> : null}
        </section>
        {result.findings.length ? <div className="cc-analysis-findings">{result.findings.map((finding, index) => {
          const reference = referencePhotos.find(photo => photo.id === finding.referenceId);
          const baseline = analysis.references.find(entry => entry.referenceId === finding.referenceId);
          const marker = String(index + 1);
          const captureId = finding.evidenceId ?? analysis.evidenceId;
          const findingEvidence = captures.get(captureId);
          const findingImage = findingEvidence?.analysisDataUrl || findingEvidence?.dataUrl;
          const captureLabel = captureId === analysis.evidenceId ? "Captura atual" : "Captura anterior desta vistoria";
          return <article className="cc-analysis-finding" key={`${index}-${finding.title}`}>
            <h4><span className="cc-analysis-finding-number">{marker}</span>{finding.title}</h4>
            <div className="cc-analysis-comparison">
              <AnnotatedPhoto src={reference?.url} label="Referência anterior" caption={reference?.label || "Sem referência fotográfica correspondente"} annotations={finding.referenceRegion ? [{region: finding.referenceRegion, label: marker}] : []}/>
              <AnnotatedPhoto src={findingImage} label={captureLabel} caption={findingEvidence ? `${findingEvidence.name} · ${analysisTimestamp(findingEvidence.createdAt)}` : "A captura citada neste achado não está disponível"} annotations={finding.currentRegion ? [{region: finding.currentRegion, label: marker}] : []}/>
            </div>
            <dl className="cc-analysis-observations"><div><dt>Antes</dt><dd>{finding.before}</dd></div><div><dt>Agora</dt><dd>{finding.after}</dd></div><div><dt>{assessmentLabel[finding.assessment]}</dt><dd>{finding.reason}</dd></div></dl>
            <ReferenceObservation baseline={baseline} observationId={finding.referenceObservationId}/>
          </article>;
        })}</div> : <div className="cc-analysis-comparison">
          {fallbackReference ? <AnnotatedPhoto src={referencePhotos.find(photo => photo.id === fallbackReference.referenceId)?.url} label="Referência anterior" caption="Referência usada nesta comparação"/> : null}
          <AnnotatedPhoto src={currentImage} label="Captura atual" caption={currentEvidence ? `${currentEvidence.name} · ${analysisTimestamp(currentEvidence.createdAt)}` : "A captura vinculada à análise não está disponível"}/>
        </div>}
        <div className="cc-analysis-explanation"><strong>Por que essa conclusão</strong>{result.justification}</div>
        {result.unverified.length ? <ul className="cc-analysis-unverified" aria-label="O que falta verificar">{result.unverified.map((item, index) => <li key={`${index}-${item}`}><CircleHelp size={12}/><span>{item}</span></li>)}</ul> : null}
        <BaselineInventory baselines={analysis.references} photos={referencePhotos}/>
        <details className="cc-analysis-provenance">
          <summary>Identificação e versão deste registro</summary>
          <p>Análise: {analysis.id}<br/>Captura atual: {analysis.evidenceId}<br/>Imagem analisada, SHA-256: {analysis.imageSha256}<br/>Modelo: {analysis.model} · Instruções: {analysis.promptVersion}</p>
          {analysis.supportingEvidence?.map(photo => <p key={photo.evidenceId}>Captura anterior desta vistoria: {photo.evidenceId}<br/>Registrada em {analysisTimestamp(photo.createdAt)}<br/>SHA-256: {photo.sha256}</p>)}
        </details>
      </div>
    </details>
  </section>;
}
