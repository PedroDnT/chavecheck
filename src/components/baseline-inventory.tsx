"use client";

import {ScanSearch} from "lucide-react";
import type {ReferencePhoto} from "@/lib/inspection";
import type {ReferenceAnalysis} from "@/lib/visual-analysis";
import "./analysis-card.css";

interface BaselineInventoryProps {
  baselines: ReferenceAnalysis[];
  photos: ReferencePhoto[];
}
const kindLabel = {finish: "Acabamento", mark: "Marca visível", object: "Elemento", uncertain: "A confirmar"};

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não disponível" : new Intl.DateTimeFormat("pt-BR", {timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short"}).format(date);
}

export function BaselineInventory({baselines, photos}: BaselineInventoryProps) {
  if (!baselines.length) return null;

  return <details className="cc-baseline-inventory">
    <summary><ScanSearch size={15}/>O que foi registrado nas fotos iniciais</summary>
    <div className="cc-baseline-content">
      <p className="cc-baseline-intro">Leitura inicial extraída por IA, ainda não confirmada na vistoria. A aparência e as limitações de cada referência ficam registradas para as próximas comparações.</p>
      {baselines.map(baseline => {
        const photo = photos.find(entry => entry.id === baseline.referenceId);
        return <article className="cc-baseline-photo" key={baseline.id}>
          <h4>{photo?.label || "Foto de referência"}</h4>
          <time dateTime={baseline.createdAt}>Extraído em {timestamp(baseline.createdAt)} · versão {baseline.promptVersion}</time>
          <ol className="cc-baseline-observations">{baseline.observations.map(observation => <li key={observation.id}>
            <strong>{kindLabel[observation.kind]} · {observation.label}</strong>{observation.description}
          </li>)}</ol>
          <dl className="cc-baseline-appearance">
            <div><dt>Luz registrada</dt><dd>{baseline.lighting}</dd></div>
            <div><dt>Nitidez registrada</dt><dd>{baseline.sharpness}</dd></div>
            <div><dt>Cores aparentes na foto</dt><dd>{baseline.apparentColors.join("; ") || "Não identificadas."}</dd></div>
          </dl>
          {baseline.limitations.length ? <p className="cc-baseline-limitations"><strong>O que a imagem não resolve: </strong>{baseline.limitations.join(" ")}</p> : null}
          <details className="cc-analysis-provenance"><summary>Origem e versão da extração</summary><p>Arquivo: {photo?.label || baseline.referenceId}<br/>SHA-256: {baseline.sha256}<br/>Modelo: {baseline.model}<br/>Registro: {baseline.id}</p></details>
        </article>;
      })}
    </div>
  </details>;
}
