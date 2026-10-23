"use client";

import {useEffect, useRef, useState, type ChangeEvent} from "react";
import {ArrowRight, Check, FileText, LoaderCircle, Pencil, Sparkles, Upload} from "lucide-react";
import {DEMO_INPUT, dateLabel, money, type CheckItem, type Inspection} from "@/lib/inspection";
import "./panels.css";
import {ReferencePhotos} from "./reference-photos";

interface PreparationProps {
  inspection: Inspection;
  onReplace: (items: CheckItem[], property: string, date: string, originalInput?: string) => void;
  onEdit: (item: CheckItem) => void;
  onStart: () => void;
  onDemo: () => void;
  onPhotoDemo: () => Promise<void>;
  scenarioBusy: boolean;
  onExportPrevious: () => Promise<void>;
  onMeta?: (property: string, date: string) => void;
  onRestore?: (inspection: Inspection) => void;
}

export function Preparation({inspection, onReplace, onEdit, onStart, onDemo, onMeta, onPhotoDemo, scenarioBusy, onExportPrevious}: PreparationProps) {
  const [input, setInput] = useState(inspection.originalInput ?? (inspection.demo ? DEMO_INPUT : ""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const fileGeneration = useRef(0);
  const mounted = useRef(false);
  const currentInspection = useRef(inspection);
  currentInspection.current = inspection;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      fileGeneration.current++;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    generation.current++;
    fileGeneration.current++;
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setInput(currentInspection.current.originalInput ?? (currentInspection.current.demo ? DEMO_INPUT : ""));
    setFileName("");
    setError("");
  }, [inspection.id]);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setSuccess("");
    if (!/\.(txt|md|csv|json)$/i.test(file.name)) {
      setError("Escolha um arquivo TXT, Markdown, CSV ou JSON. A leitura de PDF ainda não faz parte desta prova de conceito."); return;
    }
    if (file.size > 100_000) {setError("Use um arquivo de até 100 KB com os trechos que deseja verificar."); return;}
    const readGeneration = ++fileGeneration.current;
    const inspectionId = inspection.id;
    const isCurrent = () => mounted.current && fileGeneration.current === readGeneration && currentInspection.current.id === inspectionId;
    try {
      const text = await file.text();
      if (!isCurrent()) return;
      if (text.length > 20_000) {setError("O arquivo ultrapassa 20.000 caracteres. Selecione os trechos relevantes antes de importar."); return;}
      setInput(text); setFileName(file.name);
    } catch {if (isCurrent()) setError("Não foi possível ler esse arquivo. Você pode copiar e colar o conteúdo abaixo.");}
  }

  async function parseInput() {
    if (busy || requestRef.current) return;
    if (!input.trim()) {setError("Escreva ao menos uma verificação para organizar o roteiro."); return;}
    if (input.length > 20_000) {setError("Reduza a entrada para até 20.000 caracteres."); return;}
    const hasRecords = inspection.evidence.length > 0 || inspection.history.length > 0 || inspection.messages.length > 0 || inspection.items.some(item => item.status !== "pendente" || item.note || item.suggestion);
    if (hasRecords && !window.confirm("Organizar uma nova entrada substitui o roteiro atual, suas revisões, fotos e conversa. Exporte o relatório antes se quiser guardar uma cópia. Continuar?")) return;
    fileGeneration.current++;
    const controller = new AbortController();
    requestRef.current = controller;
    const requestGeneration = ++generation.current;
    const inspectionId = inspection.id;
    const originalInput = input;
    const isCurrent = () => mounted.current && generation.current === requestGeneration && currentInspection.current.id === inspectionId && !controller.signal.aborted;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/parse", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({input: originalInput}), signal: controller.signal});
      const data = await response.json();
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível organizar as verificações.");
      if (!Array.isArray(data.items) || !data.items.length || data.items.length > 10) throw new Error("A resposta precisa conter entre 1 e 10 verificações. Tente uma entrada mais objetiva.");
      const items: CheckItem[] = data.items.map((item: CheckItem) => ({
        id: item.id || crypto.randomUUID(), room: item.room, title: item.title,
        expected: item.expected, delivered: item.delivered, source: item.source,
        status: "pendente", note: "",
      }));
      if (!isCurrent()) return;
      onReplace(items, currentInspection.current.property, currentInspection.current.date, originalInput);
      setSuccess(`${items.length} ${items.length === 1 ? "verificação organizada" : "verificações organizadas"}. Revise os dados antes de iniciar.`);
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : "Não foi possível organizar as verificações. Tente novamente.");
    } finally {
      if (isCurrent()) {requestRef.current = null; setBusy(false);}
    }
  }

  function loadDemo() {
    const hasRecords = inspection.evidence.length > 0 || inspection.history.length > 0 || inspection.messages.length > 0 || inspection.items.some(item => item.status !== "pendente" || item.note || item.suggestion);
    if (hasRecords && !window.confirm("Carregar o exemplo substitui a vistoria atual e seus registros. Exporte uma cópia antes, se necessário. Continuar?")) return;
    onDemo(); setInput(DEMO_INPUT); setFileName(""); setError(""); setSuccess("Exemplo fictício carregado. Você já pode experimentar a vistoria.");
  }

  return <div className="cc-preparation">
    <div className="cc-prep-intro"><div><span className="cc-eyebrow">ANTES DE ABRIR A CÂMERA</span><h1>O que vamos verificar?</h1><p className="muted">Transforme seus registros em um roteiro. Depois, confira cada item com a câmera e o assistente.</p></div><span className="badge">Até 10 verificações</span></div>
    <div className="cc-prep-grid">
      <section className="cc-panel cc-input-panel" aria-labelledby="input-heading">
        <div className="cc-section-heading"><span className="cc-step-number">1</span><div><h2 id="input-heading">Prepare sua entrada</h2><p className="muted">Informe o combinado e o que foi entregue.</p></div></div>
        <div className="cc-metadata-grid">
          <label className="field">Imóvel<input value={inspection.property} maxLength={160} onChange={event => onMeta?.(event.target.value, inspection.date)} placeholder="Nome ou identificação do imóvel" /></label>
          <label className="field">Data da vistoria<input type="date" value={inspection.date} onChange={event => {if(event.target.value) onMeta?.(inspection.property, event.target.value);}} /></label>
        </div>
        <label className="field cc-source-label" htmlFor="inspection-source">Verificações e trechos de origem<span className="muted">Inclua cômodo, condição esperada e a fonte. Quantidades, prazos e valores são opcionais.</span></label>
        <textarea id="inspection-source" className="cc-source-input" value={input} onChange={event => {fileGeneration.current++; setInput(event.target.value); setSuccess("");}} maxLength={20_000} spellCheck={false} placeholder={"Sala: conferir quatro tomadas previstas no contrato, cláusula 4.1. O registro de entrega informa três.\nCozinha: verificar a pintura branca descrita no laudo inicial."} disabled={busy} />
        <div className="cc-input-footer"><span className="muted">{input.length.toLocaleString("pt-BR")} / 20.000 caracteres</span>{fileName && <span className="cc-file-name" title={fileName}><FileText size={13}/>{fileName}</span>}</div>
        <div className="cc-input-actions"><button className="secondary" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={16}/>Importar texto</button><button className="primary" onClick={parseInput} disabled={busy || !input.trim()}>{busy ? <LoaderCircle className="cc-spin" size={17}/> : <Sparkles size={17}/>} {busy ? "Organizando…" : "Organizar com IA"}</button></div>
        <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" className="cc-hidden-input" onChange={readFile} tabIndex={-1} aria-label="Importar arquivo de texto"/>
        <p className="cc-help muted">TXT, Markdown, CSV ou JSON, até 100 KB. PDF ainda não disponível. Arquivos entram como texto; não restauram fotos nem revisões.</p>
        {error && <p className="cc-error" role="alert">{error}</p>}
        {success && <p className="cc-success" role="status"><Check size={17}/>{success}</p>}
        <div className="cc-demo-box"><div><strong>Cômodo das duas fotos</strong><p className="muted">Quatro verificações visuais. Guarda uma cópia da vistoria atual antes de começar.</p></div><button className="cc-text-button" disabled={busy||scenarioBusy} onClick={onPhotoDemo}>{scenarioBusy?"Carregando…":"Carregar cenário das fotos"}<ArrowRight size={15}/></button></div>
        {inspection.referencePhotos?.length?<ReferencePhotos photos={inspection.referencePhotos}/>:null}
        <button className="cc-text-button" onClick={onExportPrevious}>Exportar vistoria anterior</button>
        <div className="cc-demo-box"><div><strong>Exemplo do hackathon</strong><p className="muted">O exemplo traz cinco verificações e diferenças de quantidade, prazo e valor.</p></div><button className="cc-text-button" onClick={loadDemo} disabled={busy}>Usar exemplo <ArrowRight size={15}/></button></div>
      </section>
      <section className="cc-panel cc-preview-panel" aria-labelledby="preview-heading">
        <div className="cc-section-heading"><span className="cc-step-number">2</span><div><h2 id="preview-heading">Revise seu roteiro</h2><p className="muted">Corrija a extração antes de começar.</p></div><span className="cc-count">{inspection.items.length}</span></div>
        <div className="cc-check-preview">
          {inspection.items.length === 0 && <div className="cc-empty"><FileText size={30}/><strong>Seu roteiro aparece aqui</strong><p>Adicione suas verificações ou carregue o exemplo para começar.</p></div>}
          {inspection.items.map((item, index) => <article className="cc-preview-item" key={item.id}><div className="cc-preview-title"><span className="cc-item-index">{String(index + 1).padStart(2,"0")}</span><div><span className="cc-room-name">{item.room}</span><h3>{item.title}</h3></div><button className="icon-button" disabled={busy} onClick={() => onEdit(item)} title={`Editar ${item.title}`} aria-label={`Editar ${item.title}`}><Pencil size={15}/></button></div><p className="cc-preview-condition">{item.expected.condition || "Condição esperada não informada."}</p><div className="cc-expected-tags">{item.expected.quantity !== null && <span>Previsto: {item.expected.quantity}</span>}{item.expected.dueDate && <span>Prazo: {dateLabel(item.expected.dueDate)}</span>}{item.expected.value !== null && <span>Valor: {money(item.expected.value)}</span>}</div><details className="cc-source"><summary>Ver trecho de origem</summary><p>{item.source || "Fonte não informada. Complete este dado na revisão."}</p></details></article>)}
        </div>
        <div className="cc-start-footer"><p className="muted">A IA sugere observações. Você revisa e confirma cada item.</p><button className="primary cc-start" onClick={onStart} disabled={busy || !inspection.items.length}>Iniciar vistoria <ArrowRight size={17}/></button></div>
      </section>
    </div>
    <p className="cc-local-note muted">A vistoria fica salva neste navegador. Exporte uma cópia do relatório para guardar seus registros. O texto enviado para organização é processado pela OpenAI.</p>
  </div>;
}
