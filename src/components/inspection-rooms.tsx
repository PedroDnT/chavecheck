"use client";

import {ArrowRight, Bath, BedDouble, Check, CheckCircle2, CircleHelp, CookingPot, DoorOpen, Download, FileText, ImageIcon, Sofa, TriangleAlert} from "lucide-react";
import {dateLabel, statusLabel, type CheckItem, type CheckStatus, type Inspection} from "@/lib/inspection";
import {getRoomProgress, getWorkflow} from "@/lib/inspection-workflow";
import "./inspection-rooms.css";

interface InspectionRoomsProps {
  inspection: Inspection;
  onStartRoom: (room: string, itemId: string) => void;
  onDocument?: () => void;
  onReport: () => void;
  onNew: () => void;
  busy?: boolean;
}

const roomStatusLabel = {not_started: "Não iniciado", in_progress: "Em andamento", reviewed: "Revisado"};
const statuses: CheckStatus[] = ["conforme", "divergencia", "inconclusivo", "pendente"];

function RoomIcon({room}: {room: string}) {
  const name = room.toLocaleLowerCase("pt-BR");
  if (name.includes("banheiro") || name.includes("lavabo")) return <Bath size={25} aria-hidden="true"/>;
  if (name.includes("quarto") || name.includes("suíte")) return <BedDouble size={25} aria-hidden="true"/>;
  if (name.includes("cozinha")) return <CookingPot size={25} aria-hidden="true"/>;
  if (name.includes("sala")) return <Sofa size={25} aria-hidden="true"/>;
  return <DoorOpen size={25} aria-hidden="true"/>;
}

function StatusIcon({status}: {status: CheckStatus}) {
  if (status === "conforme") return <Check size={15} aria-hidden="true"/>;
  if (status === "divergencia") return <TriangleAlert size={15} aria-hidden="true"/>;
  if (status === "inconclusivo") return <CircleHelp size={16} aria-hidden="true"/>;
  return null;
}

export function InspectionRooms({inspection, onStartRoom, onDocument, onReport, onNew, busy = false}: InspectionRoomsProps) {
  const rooms = getRoomProgress(inspection);
  const workflow = getWorkflow(inspection);
  const reviewed = rooms.reduce((sum, room) => sum + room.reviewed, 0);
  const total = inspection.items.length;
  const referenceCount = inspection.referencePhotos?.length ?? 0;

  return <section className="wf-rooms" aria-labelledby="wf-rooms-heading">
    <header className="wf-rooms-intro">
      <h1 id="wf-rooms-heading">Vamos conferir os cômodos.</h1>
      <p>Escolha por onde começar. Seu progresso fica salvo.</p>
    </header>

    {workflow.document ? <div className="wf-document-line">
      <FileText size={25} aria-hidden="true"/>
      <p><span>{workflow.document.name}</span>{workflow.document.mode === "mock" ? <small> · roteiro de teste</small> : null}</p>
      {onDocument ? <button type="button" className="wf-inline-link" onClick={onDocument}>Ver documento</button> : null}
    </div> : null}

    <div className="wf-rooms-progress">
      <div><span><strong>{reviewed}</strong> de {total} {total === 1 ? "item revisado" : "itens revisados"}</span><span>{total > 0 ? Math.round(reviewed / total * 100) : 0}%</span></div>
      <progress value={reviewed} max={Math.max(total, 1)} aria-label={`${reviewed} de ${total} itens revisados`}/>
    </div>

    <div className={`wf-room-grid${rooms.length > 1 ? " wf-room-grid-multiple" : ""}`}>
      {rooms.map(room => <article className="wf-room-card" key={room.name} aria-label={`Cômodo: ${room.name}`}>
        <header className="wf-room-card-heading">
          <span className="wf-room-symbol"><RoomIcon room={room.name}/></span>
          <div><h2>{room.name}</h2><p>{room.total} {room.total === 1 ? "item" : "itens"} para conferir</p></div>
          <span className={`wf-room-state wf-room-state-${room.status}`}>{roomStatusLabel[room.status]}</span>
        </header>
        <ul className="wf-room-items">
          {room.items.map(item => <li key={item.id}>
            <span className={`wf-item-indicator wf-item-indicator-${item.status}`}><StatusIcon status={item.status}/></span>
            <span>{item.title}</span>
            <span className="sr-only"> — {statusLabel[item.status]}</span>
          </li>)}
        </ul>
        <button type="button" className="primary wf-room-start" disabled={busy} onClick={() => onStartRoom(room.name, room.firstItemId)}>
          <span>{room.action}</span><ArrowRight size={19} aria-hidden="true"/>
          <span className="sr-only"> {room.name}</span>
        </button>
      </article>)}
    </div>

    {rooms.length === 0 ? <p className="wf-empty-rooms">Nenhum cômodo foi encontrado nesta vistoria.</p> : null}
    {referenceCount > 0 ? <div className="wf-reference-line"><ImageIcon size={23} aria-hidden="true"/><div><strong>{referenceCount} {referenceCount === 1 ? "foto de referência" : "fotos de referência"}</strong><p>Disponíveis durante a comparação de cada item.</p></div></div> : null}

    <footer className="wf-rooms-actions">
      <button type="button" className="secondary" disabled={busy} onClick={onReport}><FileText size={17} aria-hidden="true"/>{reviewed === total && total > 0 && !workflow.finalizedAt ? "Revisar e finalizar" : "Ver relatório"}</button>
      <button type="button" className="wf-inline-link" disabled={busy} onClick={onNew}>Nova vistoria</button>
    </footer>
  </section>;
}

interface ReportSummaryProps {
  inspection: Inspection;
  onFinalize: () => void;
  onResume: () => void;
  busy?: boolean;
}

function compactText(text: string, limit = 190) {
  const value = text.trim();
  if (value.length <= limit) return value;
  const excerpt = value.slice(0, limit);
  const boundary = excerpt.lastIndexOf(" ");
  return `${excerpt.slice(0, boundary > limit * .6 ? boundary : limit)}…`;
}

function observedSummary(item: CheckItem) {
  if (item.note.trim()) return compactText(item.note);
  if (item.status === "pendente") return item.suggestion ? "Há uma sugestão aguardando sua revisão." : "Ainda não verificado.";
  return "Revisão registrada sem observação adicional.";
}

export function ReportSummary({inspection, onFinalize, onResume, busy = false}: ReportSummaryProps) {
  const rooms = getRoomProgress(inspection);
  const workflow = getWorkflow(inspection);
  const counts = {conforme: 0, divergencia: 0, inconclusivo: 0, pendente: 0};
  for (const item of inspection.items) counts[item.status]++;
  const unfinished = counts.pendente + counts.inconclusivo;
  const attention = unfinished + counts.divergencia;
  const finalized = Boolean(workflow.finalizedAt);
  const complete = inspection.items.length > 0 && unfinished === 0;
  const stateText = finalized
    ? attention > 0 ? "Encerrada com pendências" : "Vistoria finalizada"
    : complete ? "Pronta para finalizar" : "Vistoria em andamento";

  return <section className="wf-report-summary" aria-labelledby="wf-report-heading">
    <header className="wf-report-intro">
      <h1 id="wf-report-heading">Relatório comparativo</h1>
      <p>{inspection.property || "Imóvel não identificado"}<span aria-hidden="true"> · </span>{dateLabel(inspection.date)}</p>
    </header>

    <div className={`wf-report-state ${attention > 0 ? "wf-report-state-attention" : "wf-report-state-complete"}`}>
      {attention > 0 ? <TriangleAlert size={23} aria-hidden="true"/> : <CheckCircle2 size={23} aria-hidden="true"/>}
      <strong>{stateText}</strong>
    </div>

    <dl className="wf-report-metrics">
      {statuses.map(status => <div key={status} className={`wf-report-metric wf-report-metric-${status}`}>
        <dt><span className="wf-status-dot" aria-hidden="true"/>{statusLabel[status]}</dt><dd>{counts[status]}</dd>
      </div>)}
    </dl>

    <div className="wf-report-rooms">
      {rooms.map(room => <section className="wf-report-room" key={room.name} aria-label={`Resumo de ${room.name}`}>
        <header><h2>{room.name}</h2><span>{room.reviewed} de {room.total} revisados</span></header>
        <ul>
          {room.items.map(item => <li key={item.id} className="wf-report-item">
            <span className={`wf-item-indicator wf-item-indicator-${item.status}`}><StatusIcon status={item.status}/></span>
            <div className="wf-report-item-copy">
              <div className="wf-report-item-heading"><h3>{item.title}</h3><span className={`wf-status-label wf-status-label-${item.status}`}>{statusLabel[item.status]}</span></div>
              {item.status !== "pendente" && <div className="wf-report-comparison">
                <p><span>Esperado</span>{compactText(item.expected.condition, 105) || "Condição não informada."}</p>
                <p><span>Observado</span>{observedSummary(item)}</p>
              </div>}
            </div>
          </li>)}
        </ul>
      </section>)}
    </div>

    {attention > 0 ? <div className="wf-report-pending">
      <CircleHelp size={23} aria-hidden="true"/>
      <div><strong>{unfinished > 0 ? `${unfinished} ${unfinished === 1 ? "item ainda precisa" : "itens ainda precisam"} de verificação.` : `${counts.divergencia} ${counts.divergencia === 1 ? "divergência registrada" : "divergências registradas"}.`}</strong><p>As pendências permanecem registradas no relatório.</p></div>
    </div> : null}

    <footer className="wf-report-actions cc-no-print">
      {finalized ? <button type="button" className="primary" onClick={() => window.print()}><Download size={19} aria-hidden="true"/>Baixar relatório PDF</button>
        : <button type="button" className="primary" onClick={onFinalize} disabled={busy || inspection.items.length === 0}><CheckCircle2 size={19} aria-hidden="true"/>{busy ? "Finalizando…" : "Finalizar vistoria"}</button>}
      <button type="button" className="wf-inline-link" onClick={onResume} disabled={busy}>{attention > 0 ? "Revisar pendências" : "Voltar aos cômodos"}</button>
    </footer>
    {workflow.document?.mode === "mock" ? <p className="wf-report-provenance">Roteiro de teste. O relatório reúne apenas as revisões e evidências registradas nesta vistoria.</p> : null}
  </section>;
}
