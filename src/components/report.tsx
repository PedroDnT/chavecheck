"use client";

import {useEffect, useState} from "react";
import {ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Download, ImageIcon, Printer, X} from "lucide-react";
import {compareItem, dateLabel, money, statusLabel, type Evidence, type Inspection} from "@/lib/inspection";
import {downloadJSON} from "@/lib/storage";
import {ReferencePhotos} from "./reference-photos";
import "./panels.css";

interface ReportProps {inspection: Inspection; onBack: () => void; onSelectItem: (id: string) => void}
const timestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não disponível" : new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(date);
};

export function Report({inspection, onBack, onSelectItem}: ReportProps) {
  const [preview, setPreview] = useState<Evidence | null>(null);
  useEffect(() => {
    if (!preview) return;
    const listener = (event: KeyboardEvent) => {if(event.key === "Escape") setPreview(null);};
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [preview]);
  const reviewed = inspection.items.filter(item => item.status !== "pendente").length;
  const groups = [...new Set(inspection.items.map(item => item.room))];
  const counts = {conforme:0, divergencia:0, inconclusivo:0, pendente:0};
  for (const item of inspection.items) counts[item.status]++;

  return <div className="cc-report">
    <div className="cc-report-toolbar cc-no-print"><button className="secondary" onClick={onBack}><ArrowLeft size={16}/>Voltar à vistoria</button><div><button className="secondary" onClick={() => downloadJSON(inspection)}><Download size={16}/>Exportar JSON</button><button className="primary" onClick={() => window.print()}><Printer size={16}/>Imprimir / PDF</button></div></div>
    <header className="cc-report-header"><div><span className="cc-eyebrow">CHAVECHECK · REGISTRO DE VISTORIA</span><h1>{inspection.property || "Imóvel não identificado"}</h1><p className="muted">Vistoria em {dateLabel(inspection.date)} <span aria-hidden="true">·</span> {inspection.items.length} itens em {groups.length} {groups.length === 1 ? "cômodo" : "cômodos"}</p></div><div className="cc-report-progress"><CheckCircle2 size={21}/><strong>{reviewed}<span>/{inspection.items.length}</span></strong><span>itens revisados</span></div></header>
    {inspection.demo && <div className="cc-report-demo">{inspection.referencePhotos?.length ? "O cenário de referência é fictício. As observações e evidências da vistoria atual são registradas separadamente para validar a prova de conceito." : "Demonstração com dados fictícios. Este registro serve para validar a prova de conceito."}</div>}
    <div className="cc-report-metrics">{(["conforme","divergencia","inconclusivo","pendente"] as const).map(status => <div key={status} className={`cc-metric cc-metric-${status}`}><span className={`cc-status-dot cc-dot-${status}`}/><strong>{counts[status]}</strong><span>{statusLabel[status]}</span></div>)}</div>
    <p className="cc-report-explanation">As classificações abaixo são confirmadas pela pessoa responsável pela revisão. Diferenças de quantidade, prazo e valor são calculadas a partir dos registros informados; fotografias e sugestões da IA não comprovam funcionamento nem responsabilidade.</p>
    {inspection.referencePhotos?.length ? <ReferencePhotos photos={inspection.referencePhotos} title="Referência usada na comparação"/> : null}
    {groups.map(room => <section className="cc-room-report" key={room} aria-label={`Registros de ${room}`}><div className="cc-room-heading"><h2>{room}</h2><span className="muted">{inspection.items.filter(item => item.room === room).length} itens</span></div>
      {inspection.items.filter(item => item.room === room).map(item => {
        const evidence = inspection.evidence.filter(photo => photo.itemId === item.id);
        const history = inspection.history.filter(event => event.itemId === item.id);
        const differences = compareItem(item, inspection.date);
        return <article className="cc-report-item" key={item.id}>
          <div className="cc-report-item-heading"><h3>{item.title}</h3><span className={`cc-status cc-status-${item.status}`}><span className={`cc-status-dot cc-dot-${item.status}`}/>{statusLabel[item.status]}</span><button className="cc-text-button cc-no-print" onClick={() => onSelectItem(item.id)} aria-label={`Revisar ${item.title}`}>Revisar <ArrowUpRight size={15}/></button></div>
          <div className="cc-comparison-grid"><section><h4>Esperado · registro de origem</h4><p>{item.expected.condition || "Condição não informada."}</p><dl><div><dt>Quantidade</dt><dd>{item.expected.quantity ?? "Não informada"}</dd></div><div><dt>Valor</dt><dd>{money(item.expected.value)}</dd></div><div><dt>Prazo</dt><dd>{dateLabel(item.expected.dueDate)}</dd></div></dl></section><section><h4>Entregue · dados informados</h4><p>{item.delivered.status === "entregue" ? "Registrado como entregue" : item.delivered.status === "pendente" ? "Registrado como pendente" : "Situação de entrega não informada"}</p><dl><div><dt>Quantidade</dt><dd>{item.delivered.quantity ?? "Não informada"}</dd></div><div><dt>Valor</dt><dd>{money(item.delivered.value)}</dd></div><div><dt>Data de entrega</dt><dd>{dateLabel(item.delivered.completedDate)}</dd></div></dl></section><section><h4>Observação revisada</h4><p>{item.note || "Nenhuma observação registrada."}</p><p className="cc-review-time muted">{item.reviewedAt ? `Revisado em ${timestamp(item.reviewedAt)}` : "Aguardando revisão humana"}</p>{item.suggestion && <div className="cc-unreviewed"><strong>Sugestão da IA · não confirmada</strong><p>{item.suggestion.note}</p></div>}</section></div>
          {differences.length > 0 && <div className="cc-record-differences"><strong>Diferenças entre registros</strong>{differences.map(diff => <div key={diff.kind}><span className="cc-difference-label">{diff.kind}</span><span>Previsto: {diff.expected}</span><span className="muted" aria-hidden="true">→</span><span>Informado: {diff.delivered}</span></div>)}</div>}
          <div className="cc-report-source"><strong>Origem informada</strong><p>{item.source || "Fonte não informada."}</p></div>
          <div className="cc-evidence-section"><div className="cc-evidence-label"><ImageIcon size={15}/><strong>Evidências da vistoria atual</strong><span className="muted">{evidence.length}</span></div>{evidence.length ? <div className="cc-evidence-grid">{evidence.map(photo => <figure key={photo.id}><button onClick={() => setPreview(photo)} aria-label={`Ampliar evidência: ${photo.name}`} className="cc-evidence-button"><img src={photo.dataUrl} alt={photo.name} loading="lazy"/></button><figcaption><strong>{photo.name}</strong><span>{timestamp(photo.createdAt)} · {photo.origin === "camera" ? "Câmera" : "Importada"}</span></figcaption></figure>)}</div> : <p className="cc-no-evidence muted">Nenhuma foto salva para este item.</p>}</div>
          {history.length > 0 && <details className="cc-review-history"><summary><Clock3 size={14}/>Histórico de revisão ({history.length})</summary><ol>{history.map(event => <li key={event.id}><div><strong>{event.action}</strong><time dateTime={event.at}>{timestamp(event.at)}</time></div>{event.note && <p>{event.note}</p>}</li>)}</ol></details>}
        </article>;
      })}
    </section>)}
    <footer className="cc-report-footnote"><strong>Registro de apoio à conferência</strong><p>Este relatório organiza dados fornecidos, observações e revisões. Não é laudo técnico, parecer jurídico ou certificação de conformidade. Campos sem informação permanecem em aberto. Fotos e registros são armazenados neste navegador; a exportação JSON guarda os dados e as evidências salvas.{inspection.referencePhotos?.length ? " As fotos de referência são identificadas por links locais e não contam como evidência da vistoria atual." : ""}</p><span className="muted">Identificação da vistoria: {inspection.id}</span></footer>
    {preview && <div className="cc-image-overlay cc-no-print" role="presentation" onClick={() => setPreview(null)}><div className="cc-image-dialog" role="dialog" aria-modal="true" aria-label={preview.name} onClick={event => event.stopPropagation()}><button className="icon-button cc-image-close" onClick={() => setPreview(null)} aria-label="Fechar evidência" autoFocus><X size={22}/></button><img src={preview.dataUrl} alt={preview.name}/><p>{preview.name} <span>· {timestamp(preview.createdAt)}</span></p></div></div>}
  </div>;
}
