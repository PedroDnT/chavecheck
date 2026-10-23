"use client";

import {useEffect, useId, useRef, useState} from "react";
import {ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Download, FileSearch, ImageIcon, Printer, X} from "lucide-react";
import {compareItem, dateLabel, money, statusLabel, type Evidence, type Inspection} from "@/lib/inspection";
import {analysisMatchesCurrentItem} from "@/lib/analysis-state";
import {downloadJSON} from "@/lib/storage";
import {AnalysisCard, analysisTimestamp} from "./analysis-card";
import {BaselineInventory} from "./baseline-inventory";
import {ReferencePhotos} from "./reference-photos";
import "./panels.css";

interface ReportProps {
  inspection: Inspection;
  onBack: () => void;
  onSelectItem: (id: string) => void;
}

export function Report({inspection, onBack, onSelectItem}: ReportProps) {
  const [preview, setPreview] = useState<Evidence | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const report = useRef<HTMLDivElement>(null);
  const previewHeading = useId();
  const referencePhotos = inspection.referencePhotos ?? [];

  useEffect(() => {
    if (preview && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [preview]);

  useEffect(() => {
    let openedForPrint: HTMLDetailsElement[] = [];
    const beforePrint = () => {
      openedForPrint = Array.from(report.current?.querySelectorAll<HTMLDetailsElement>("details:not([open])") ?? []);
      for (const details of openedForPrint) details.open = true;
    };
    const afterPrint = () => {
      for (const details of openedForPrint) details.open = false;
      openedForPrint = [];
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  const reviewed = inspection.items.filter(item => item.status !== "pendente").length;
  const groups = [...new Set(inspection.items.map(item => item.room))];
  const counts = {conforme: 0, divergencia: 0, inconclusivo: 0, pendente: 0};
  for (const item of inspection.items) counts[item.status]++;

  return <div className="cc-report" ref={report}>
    <div className="cc-report-toolbar cc-no-print">
      <button className="secondary" onClick={onBack}><ArrowLeft size={16}/>Voltar à vistoria</button>
      <div><button className="secondary" onClick={() => downloadJSON(inspection)}><Download size={16}/>Exportar JSON</button><button className="primary" onClick={() => window.print()}><Printer size={16}/>Imprimir / PDF</button></div>
    </div>
    <header className="cc-report-header">
      <div><span className="cc-eyebrow">CHAVECHECK · REGISTRO DE VISTORIA</span><h1>{inspection.property || "Imóvel não identificado"}</h1><p className="muted">Vistoria em {dateLabel(inspection.date)} <span aria-hidden="true">·</span> {inspection.items.length} itens em {groups.length} {groups.length === 1 ? "cômodo" : "cômodos"}</p></div>
      <div className="cc-report-progress"><CheckCircle2 size={21}/><strong>{reviewed}<span>/{inspection.items.length}</span></strong><span>itens revisados</span></div>
    </header>
    {inspection.demo ? <div className="cc-report-demo">{referencePhotos.length ? "O cenário de referência é fictício. As observações e evidências da vistoria atual são registradas separadamente para validar a prova de conceito." : "Demonstração com dados fictícios. Este registro serve para validar a prova de conceito."}</div> : null}
    <div className="cc-report-metrics">{(["conforme", "divergencia", "inconclusivo", "pendente"] as const).map(status => <div key={status} className={`cc-metric cc-metric-${status}`}><span className={`cc-status-dot cc-dot-${status}`}/><strong>{counts[status]}</strong><span>{statusLabel[status]}</span></div>)}</div>
    <p className="cc-report-explanation">O estado de cada item reúne a revisão confirmada. As análises preservam a foto atual, a referência, a condição informada e o fundamento de cada sugestão, inclusive quando uma nova foto foi necessária.</p>
    {referencePhotos.length ? <ReferencePhotos photos={referencePhotos} title="Referência usada na comparação"/> : null}
    <BaselineInventory baselines={inspection.baselines ?? []} photos={referencePhotos}/>
    {groups.map(room => <section className="cc-room-report" key={room} aria-label={`Registros de ${room}`}>
      <div className="cc-room-heading"><h2>{room}</h2><span className="muted">{inspection.items.filter(item => item.room === room).length} itens</span></div>
      {inspection.items.filter(item => item.room === room).map(item => {
        const evidence = inspection.evidence.filter(photo => photo.itemId === item.id);
        const history = inspection.history.filter(event => event.itemId === item.id);
        const analyses = (inspection.analyses ?? []).filter(analysis => analysis.itemId === item.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const latestAnalysis = analyses[0];
        const priorAnalyses = analyses.slice(1);
        const differences = compareItem(item, inspection.date);
        return <article className="cc-report-item" key={item.id}>
          <div className="cc-report-item-heading">
            <h3>{item.title}</h3><span className={`cc-status cc-status-${item.status}`}><span className={`cc-status-dot cc-dot-${item.status}`}/>{statusLabel[item.status]}</span>
            <button className="cc-text-button cc-no-print" onClick={() => onSelectItem(item.id)} aria-label={`Revisar ${item.title}`}>Revisar <ArrowUpRight size={15}/></button>
          </div>
          <div className="cc-comparison-grid">
            <section>
              <h4>Esperado · registro de origem</h4><p>{item.expected.condition || "Condição não informada."}</p>
              <dl><div><dt>Quantidade</dt><dd>{item.expected.quantity ?? "Não informada"}</dd></div><div><dt>Valor</dt><dd>{money(item.expected.value)}</dd></div><div><dt>Prazo</dt><dd>{dateLabel(item.expected.dueDate)}</dd></div></dl>
            </section>
            <section>
              <h4>Entregue · dados informados</h4><p>{item.delivered.status === "entregue" ? "Registrado como entregue" : item.delivered.status === "pendente" ? "Registrado como pendente" : "Situação de entrega não informada"}</p>
              <dl><div><dt>Quantidade</dt><dd>{item.delivered.quantity ?? "Não informada"}</dd></div><div><dt>Valor</dt><dd>{money(item.delivered.value)}</dd></div><div><dt>Data de entrega</dt><dd>{dateLabel(item.delivered.completedDate)}</dd></div></dl>
            </section>
            <section>
              <h4>Observação revisada</h4><p>{item.note || "Nenhuma observação registrada."}</p>
              <p className="cc-review-time muted">{item.reviewedAt ? `Revisado em ${analysisTimestamp(item.reviewedAt)}` : "Aguardando revisão"}</p>
              {item.suggestion ? <div className="cc-unreviewed"><strong>Sugestão da IA · não confirmada</strong><p>{item.suggestion.note}</p></div> : null}
            </section>
          </div>
          {differences.length ? <div className="cc-record-differences"><strong>Diferenças entre registros</strong>{differences.map(diff => <div key={diff.kind}><span className="cc-difference-label">{diff.kind}</span><span>Previsto: {diff.expected}</span><span className="muted" aria-hidden="true">→</span><span>Informado: {diff.delivered}</span></div>)}</div> : null}
          <div className="cc-report-source"><strong>Origem informada</strong><p>{item.source || "Fonte não informada."}</p></div>
          {latestAnalysis ? <section className="cc-report-analysis" aria-label={`Comparações registradas de ${item.title}`}>
            <AnalysisCard analysis={latestAnalysis} evidence={evidence.find(photo => photo.id === latestAnalysis.evidenceId)} evidencePool={evidence} referencePhotos={referencePhotos} review={history.filter(event => event.analysisId === latestAnalysis.id && event.action !== "Análise visual registrada").at(-1)} requirementChanged={!analysisMatchesCurrentItem(inspection,latestAnalysis)}/>
            {priorAnalyses.length ? <details className="cc-analysis-history">
              <summary><FileSearch size={14}/>Comparações anteriores ({priorAnalyses.length})</summary>
              <div className="cc-analysis-history-content">{priorAnalyses.map(analysis => <AnalysisCard key={analysis.id} analysis={analysis} evidence={evidence.find(photo => photo.id === analysis.evidenceId)} evidencePool={evidence} referencePhotos={referencePhotos} review={history.filter(event => event.analysisId === analysis.id && event.action !== "Análise visual registrada").at(-1)} requirementChanged={!analysisMatchesCurrentItem(inspection,analysis)} compact/>)}</div>
            </details> : null}
          </section> : null}
          <div className="cc-evidence-section">
            <div className="cc-evidence-label"><ImageIcon size={15}/><strong>Evidências da vistoria atual</strong><span className="muted">{evidence.length}</span></div>
            {evidence.length ? <div className="cc-evidence-grid">{evidence.map(photo => <figure key={photo.id}>
              <button onClick={() => setPreview(photo)} aria-label={`Ampliar evidência original: ${photo.name}`} aria-haspopup="dialog" className="cc-evidence-button"><img src={photo.dataUrl} alt={photo.name} loading="lazy"/></button>
              <figcaption><strong>{photo.name}</strong><span>{analysisTimestamp(photo.createdAt)} · {photo.origin === "camera" ? "Câmera" : "Importada"}</span>{photo.analysisState === "error" ? <span>Análise não concluída: {photo.analysisError || "envie novamente para analisar."}</span> : null}</figcaption>
            </figure>)}</div> : <p className="cc-no-evidence muted">Nenhuma foto salva para este item.</p>}
          </div>
          {history.length ? <details className="cc-review-history">
            <summary><Clock3 size={14}/>Histórico de revisão ({history.length})</summary>
            <ol>{history.map(event => <li key={event.id}><div><strong>{event.action}</strong><time dateTime={event.at}>{analysisTimestamp(event.at)}</time></div>{event.note ? <p>{event.note}</p> : null}</li>)}</ol>
          </details> : null}
        </article>;
      })}
    </section>)}
    <footer className="cc-report-footnote">
      <strong>Registro de apoio à conferência</strong>
      <p>As análises descrevem as condições visíveis e registram o que ainda precisa ser verificado. Fotos atuais, resultados e decisões ficam neste navegador. A exportação JSON guarda as evidências e o histórico completo, incluindo as observações iniciais usadas em cada análise.{referencePhotos.length ? " As fotografias de referência permanecem identificadas pelos links de origem e pela assinatura do arquivo na extração." : ""}</p>
      <span className="muted">Identificação da vistoria: {inspection.id}</span>
    </footer>
    <dialog ref={dialog} className="cc-analysis-dialog cc-no-print" aria-labelledby={previewHeading} onClose={() => setPreview(null)} onClick={event => {if (event.target === event.currentTarget) dialog.current?.close();}}>
      {preview ? <>
        <div className="cc-analysis-dialog-heading"><h2 id={previewHeading}>{preview.name} · foto original</h2><button className="icon-button" onClick={() => dialog.current?.close()} aria-label="Fechar evidência" autoFocus><X size={22}/></button></div>
        <div className="cc-analysis-zoom-image"><img src={preview.dataUrl} alt={preview.name}/></div>
        <p className="cc-analysis-dialog-caption">{analysisTimestamp(preview.createdAt)} · {preview.origin === "camera" ? "Capturada pela câmera" : "Foto importada"}</p>
      </> : null}
    </dialog>
  </div>;
}
