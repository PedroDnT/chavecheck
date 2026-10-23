"use client";

import dynamic from "next/dynamic";
import {useCallback, useEffect, useRef, useState} from "react";
import {ArrowLeft, FileText, LoaderCircle, X} from "lucide-react";
import type {Inspection} from "@/lib/inspection";
import {restoreInterruptedAnalyses} from "@/lib/analysis-state";
import {archiveInspection, loadInspection, saveInspection} from "@/lib/storage";
import {createMappedInspection, downloadInspectionPdf, getWorkflow, storeInspectionPdf, updateWorkflow} from "@/lib/inspection-workflow";
import {DocumentScanner, DocumentUpload, WorkflowHeader} from "./document-onboarding";
import {InspectionRooms, ReportSummary} from "./inspection-rooms";
import {Report} from "./report";
import "./inspection-flow.css";

const InspectionApp = dynamic(() => import("./inspection-app").then(module => module.InspectionApp), {
  loading: () => <div className="wf-flow-loading" role="status"><LoaderCircle size={24} className="spin"/>Abrindo o cômodo…</div>,
});
type FlowView = "upload" | "scanner" | "rooms" | "inspect" | "report";
export const DOCUMENT_SCAN_DURATION_MS = 5000;

export function InspectionFlow() {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [view, setView] = useState<FlowView>("upload");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Inspection | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeItemId, setActiveItemId] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const importInProgress = useRef(false);
  const alive = useRef(true);
  const latest = useRef(inspection);
  latest.current = inspection;

  useEffect(() => {
    alive.current = true;
    let active = true;
    loadInspection().then(saved => {
      if (!active) return;
      if (saved) {
        const restored = restoreInterruptedAnalyses(saved);
        setInspection(restored);
        setView(getWorkflow(restored).finalizedAt ? "report" : "rooms");
      }
    }).catch(() => {
      if (active) setError("Não foi possível recuperar a sessão salva. Verifique se o armazenamento do navegador está disponível.");
    }).finally(() => {if (active) setReady(true);});
    return () => {active = false; alive.current = false;};
  }, []);

  // Only the simulated document mapping uses a fixed delay. Camera analysis keeps its own lifecycle.
  useEffect(() => {
    if (view !== "scanner" || !pending) return;
    let active = true;
    const start = performance.now();
    setElapsedMs(0);
    const tick = setInterval(() => setElapsedMs(Math.min(DOCUMENT_SCAN_DURATION_MS, performance.now() - start)), 80);
    const finish = setTimeout(() => {
      clearInterval(tick);
      setElapsedMs(DOCUMENT_SCAN_DURATION_MS);
      void saveInspection(pending).then(() => {
        if (!active) return;
        setInspection(pending);
        setPending(null);
        setView("rooms");
      }).catch(() => {
        if (!active) return;
        setPending(null);
        setView("upload");
        setError("Não foi possível salvar o roteiro. O PDF original foi preservado; tente novamente.");
      });
    }, DOCUMENT_SCAN_DURATION_MS);
    return () => {active = false; clearInterval(tick); clearTimeout(finish);};
  }, [view, pending]);

  useEffect(() => {
    if (finalizeOpen && !dialog.current?.open) dialog.current?.showModal();
  }, [finalizeOpen]);

  useEffect(() => {
    let wasOpen = false;
    const beforePrint = () => {if (details.current) {wasOpen = details.current.open; details.current.open = true;}};
    const afterPrint = () => {if (details.current) details.current.open = wasOpen;};
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {window.removeEventListener("beforeprint", beforePrint); window.removeEventListener("afterprint", afterPrint);};
  }, []);

  async function importPdf(file: File) {
    if (importInProgress.current) return;
    importInProgress.current = true;
    setBusy(true);
    setError(null);
    try {
      const document = await storeInspectionPdf(file);
      // Keep the user's prior inspection before replacing the current session.
      if (latest.current) await archiveInspection(latest.current);
      if (!alive.current) return;
      setPending(createMappedInspection(document));
      setElapsedMs(0);
      setView("scanner");
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : "Não foi possível abrir o PDF.");
    } finally {
      importInProgress.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const onInspectionChange = useCallback((next: Inspection) => {setInspection(next);}, []);

  const leaveInspection = useCallback((next: Inspection) => {
    setInspection(restoreInterruptedAnalyses(next));
    setView("rooms");
    void saveInspection(restoreInterruptedAnalyses(next)).catch(() => setError("Não foi possível salvar a sessão. Mantenha esta aba aberta e tente novamente."));
  }, []);

  async function startRoom(room: string, itemId: string) {
    if (!inspection || busy) return;
    setBusy(true);
    setError(null);
    const workflow = getWorkflow(inspection);
    const next = updateWorkflow(inspection, {startedRooms: [...new Set([...workflow.startedRooms, room])], activeItemId: itemId, finalizedAt: undefined});
    try {
      await saveInspection(next);
      setInspection(next);
      setActiveItemId(itemId);
      setView("inspect");
    } catch {
      setError("Não foi possível salvar o início do cômodo. Tente novamente.");
    } finally {setBusy(false);}
  }

  function resumePending() {
    if (!inspection) return;
    const item = inspection.items.find(item => item.status === "pendente") ?? inspection.items.find(item => item.status !== "conforme");
    if (item) void startRoom(item.room, item.id);
    else setView("rooms");
  }

  async function finalize() {
    if (!inspection || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = updateWorkflow(inspection, {finalizedAt: new Date().toISOString()});
      await saveInspection(next);
      setInspection(next);
      setFinalizeOpen(false);
    } catch {setError("Não foi possível finalizar o relatório. Seus registros continuam disponíveis.");}
    finally {setBusy(false);}
  }

  function requestFinalization() {
    if (!inspection) return;
    if (inspection.items.some(item => item.status !== "conforme")) setFinalizeOpen(true);
    else void finalize();
  }

  async function showDocument() {
    const document = inspection && getWorkflow(inspection).document;
    if (!document) return;
    try {await downloadInspectionPdf(document.id);}
    catch (reason) {setError(reason instanceof Error ? reason.message : "Não foi possível recuperar o PDF.");}
  }

  const workflow = inspection ? getWorkflow(inspection) : null;
  const headerStep = view === "upload" || view === "scanner" ? 1 : view === "report" ? 3 : 2;
  const pendingCount = inspection?.items.filter(item => item.status !== "conforme").length ?? 0;

  return <div className={`wf-flow wf-flow-${view}`}>
    <WorkflowHeader step={headerStep} showSteps={view !== "inspect" && view !== "report"}
      onHome={ready && !busy && view !== "scanner" && view !== "inspect" ? () => {setError(null); setView("upload");} : undefined}
      onRooms={inspection && view !== "scanner" && view !== "inspect" && !busy ? () => {setError(null); setView("rooms");} : undefined}
      onReport={inspection && view !== "scanner" && view !== "inspect" && !busy ? () => {setError(null); setView("report");} : undefined}/>
    {!ready ? <main className="wf-flow-loading" role="status"><LoaderCircle className="spin" size={24}/>Carregando sua vistoria…</main> : <>
      {view !== "upload" && error && <div className="wf-flow-error" role="alert"><p>{error}</p><button className="icon-button" onClick={() => setError(null)} aria-label="Fechar aviso"><X size={18}/></button></div>}
      {view === "upload" && <main><DocumentUpload onFile={file => void importPdf(file)} busy={busy} error={error} onResume={inspection ? () => {setError(null); setView("rooms");} : undefined}/></main>}
      {view === "scanner" && pending && <main><DocumentScanner fileName={getWorkflow(pending).document?.name ?? "vistoria.pdf"} elapsedMs={elapsedMs} durationMs={DOCUMENT_SCAN_DURATION_MS}/></main>}
      {view === "rooms" && inspection && <main aria-busy={busy}><InspectionRooms inspection={inspection} busy={busy} onStartRoom={(room, id) => void startRoom(room, id)} onDocument={workflow?.document ? () => void showDocument() : undefined} onReport={() => setView("report")} onNew={() => {setError(null); setView("upload");}}/></main>}
      {view === "inspect" && inspection && <InspectionApp key={inspection.id} initialInspection={inspection} initialItemId={activeItemId} onInspectionChange={onInspectionChange} onExit={leaveInspection}/>}
      {view === "report" && inspection && <main className="wf-report-page">
        <button className="wf-report-back cc-no-print" onClick={() => setView("rooms")}><ArrowLeft size={17}/>Cômodos / Relatório</button>
        <ReportSummary inspection={inspection} onFinalize={requestFinalization} onResume={resumePending} busy={busy}/>
        {workflow?.document && <p className="wf-document-provenance">Documento recebido: <button onClick={() => void showDocument()}>{workflow.document.name}</button>. O roteiro usa os dados de teste da Sala; a extração do PDF será integrada depois.</p>}
        <details ref={details} className="wf-report-details"><summary><FileText size={17}/>Comparativo completo, fontes e evidências</summary><Report inspection={inspection} onBack={() => setView("rooms")} onSelectItem={id => {const item = inspection.items.find(candidate => candidate.id === id); if (item) void startRoom(item.room, id);}}/></details>
      </main>}
    </>}
    {finalizeOpen && <dialog ref={dialog} className="dialog wf-finalize-dialog" aria-labelledby="wf-finalize-title" onCancel={() => setFinalizeOpen(false)}>
      <div className="dialog-heading"><h2 id="wf-finalize-title">Finalizar com pendências?</h2><button className="icon-button" disabled={busy} onClick={() => setFinalizeOpen(false)} aria-label="Fechar"><X size={20}/></button></div>
      <p>{pendingCount} {pendingCount === 1 ? "item precisa" : "itens precisam"} de atenção. O relatório vai preservar os itens não verificados, as divergências e os resultados inconclusivos.</p>
      <div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => {setFinalizeOpen(false); resumePending();}}>Voltar para conferir</button><button className="primary" disabled={busy} onClick={() => void finalize()}>{busy ? "Salvando…" : "Finalizar com pendências"}</button></div>
    </dialog>}
  </div>;
}
