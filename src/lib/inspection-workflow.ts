import type {CheckItem, Inspection} from "./inspection";
import {createRoomScenario, ROOM_SCENARIO_ID} from "./room-scenario";

export const MAX_INSPECTION_PDF_BYTES = 25 * 1024 * 1024;
const DOCUMENT_DATABASE = "chavecheck-documents";
const DOCUMENT_STORE = "originals";

export interface InspectionDocumentMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  sha256: string;
  importedAt: string;
  mode: "mock";
  fixtureId: string;
}

export interface InspectionWorkflow {
  document?: InspectionDocumentMetadata;
  startedRooms: string[];
  activeItemId?: string;
  finalizedAt?: string;
}

export type InspectionWithWorkflow = Inspection & {workflow?: InspectionWorkflow};

export interface RoomProgress {
  name: string;
  items: CheckItem[];
  reviewed: number;
  total: number;
  status: "not_started" | "in_progress" | "reviewed";
  action: "Começar" | "Continuar" | "Revisar";
  firstItemId: string;
}

export function getWorkflow(inspection: Inspection): InspectionWorkflow {
  const workflow = (inspection as InspectionWithWorkflow).workflow;
  return {
    ...workflow,
    ...(workflow?.document ? {document: {...workflow.document}} : {}),
    startedRooms: [...(workflow?.startedRooms ?? [])],
  };
}

export function updateWorkflow(inspection: Inspection, patch: Partial<InspectionWorkflow>): InspectionWithWorkflow {
  const workflow = {...getWorkflow(inspection), ...patch};
  return {
    ...inspection,
    workflow: {
      ...workflow,
      ...(workflow.document ? {document: {...workflow.document}} : {}),
      startedRooms: [...(workflow.startedRooms ?? [])],
    },
  };
}

export function getRoomProgress(inspection: Inspection): RoomProgress[] {
  const rooms = new Map<string, CheckItem[]>();
  for (const item of inspection.items) {
    const items = rooms.get(item.room) ?? [];
    items.push(item);
    rooms.set(item.room, items);
  }
  const workflow = getWorkflow(inspection);
  const workedItemIds = new Set([
    ...inspection.evidence.map(evidence => evidence.itemId),
    ...inspection.history.map(event => event.itemId),
  ]);
  return [...rooms].map(([name, items]) => {
    const reviewed = items.filter(item => item.status !== "pendente").length;
    const started = reviewed > 0 || workflow.startedRooms.includes(name) || items.some(item => workedItemIds.has(item.id));
    const status = reviewed === items.length ? "reviewed" : started ? "in_progress" : "not_started";
    return {
      name, items, reviewed, total: items.length, status,
      action: status === "reviewed" ? "Revisar" : status === "in_progress" ? "Continuar" : "Começar",
      firstItemId: (items.find(item => item.status === "pendente") ?? items[0]).id,
    };
  });
}

/** Mapping is a fixture until PDF extraction is implemented; the original remains separate. */
export function createMappedInspection(document: InspectionDocumentMetadata): InspectionWithWorkflow {
  return updateWorkflow(createRoomScenario(), {
    document: {...document, mode: "mock", fixtureId: ROOM_SCENARIO_ID},
    startedRooms: [],
  });
}

export async function validateInspectionPdf(file: File): Promise<void> {
  if (!/\.pdf$/i.test(file.name) || (file.type !== "" && file.type.toLowerCase() !== "application/pdf")) {
    throw new Error("Selecione um arquivo PDF da vistoria.");
  }
  if (file.size === 0) throw new Error("Este PDF está vazio. Selecione outro arquivo.");
  if (file.size > MAX_INSPECTION_PDF_BYTES) throw new Error("O PDF deve ter no máximo 25 MB.");
  const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  const hasSignature = header.some((_, start) => signature.every((byte, offset) => header[start + offset] === byte));
  if (!hasSignature) throw new Error("Não foi possível reconhecer este arquivo como PDF. Selecione um PDF válido.");
}

function openDocumentDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("O armazenamento de documentos não está disponível neste navegador."));
      return;
    }
    let settled = false;
    const fail = () => {
      settled = true;
      reject(new Error("Não foi possível abrir o armazenamento do PDF neste navegador."));
    };
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DOCUMENT_DATABASE, 1);
    } catch {
      fail();
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DOCUMENT_STORE)) {
        request.result.createObjectStore(DOCUMENT_STORE, {keyPath: "id"});
      }
    };
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {db.close(); return;}
      settled = true;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

interface OriginalDocument {
  id: string;
  metadata: InspectionDocumentMetadata;
  blob: Blob;
}

/** Resolves only after commit, and closes the connection for every transaction outcome. */
async function withDocumentTransaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDocumentDatabase();
  return new Promise((resolve, reject) => {
    let result: T;
    let transaction: IDBTransaction | undefined;
    const fail = () => {
      db.close();
      reject(new Error(mode === "readwrite"
        ? "Não foi possível guardar o PDF. O armazenamento pode estar cheio ou indisponível."
        : "Não foi possível recuperar o PDF original neste navegador."));
    };
    try {
      transaction = db.transaction(DOCUMENT_STORE, mode);
      transaction.oncomplete = () => {db.close(); resolve(result);};
      transaction.onerror = fail;
      transaction.onabort = fail;
      const request = run(transaction.objectStore(DOCUMENT_STORE));
      request.onsuccess = () => {result = request.result;};
      request.onerror = fail;
    } catch {
      try {transaction?.abort();} catch { /* The transaction may already be inactive. */ }
      fail();
    }
  });
}

export async function storeInspectionPdf(file: File): Promise<InspectionDocumentMetadata> {
  await validateInspectionPdf(file);
  const originalBytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", originalBytes);
  const metadata: InspectionDocumentMetadata = {
    id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type,
    sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join(""),
    importedAt: new Date().toISOString(), mode: "mock", fixtureId: ROOM_SCENARIO_ID,
  };
  const original: OriginalDocument = {id: metadata.id, metadata, blob: file};
  // add rejects an existing id instead of silently replacing an immutable original.
  await withDocumentTransaction("readwrite", store => store.add(original));
  return metadata;
}

export async function downloadInspectionPdf(id: string): Promise<void> {
  const original = await withDocumentTransaction<OriginalDocument | undefined>("readonly", store => store.get(id));
  if (!original?.blob) throw new Error("O PDF original não foi encontrado neste navegador.");
  const url = URL.createObjectURL(original.blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = original.metadata.name;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
