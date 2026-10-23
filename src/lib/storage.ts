import type {Inspection} from "./inspection";
const DB_NAME = "chavecheck-poc";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>r.result.createObjectStore("inspections");
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(new Error("Não foi possível abrir o armazenamento neste navegador."));
  });
}
export async function loadInspection():Promise<Inspection|null> {
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("inspections","readonly"); const req=tx.objectStore("inspections").get("current");
    req.onsuccess=()=>resolve(req.result?.version===1?req.result:null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();
  });
}
export async function saveInspection(value:Inspection):Promise<void> {
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("inspections","readwrite");tx.objectStore("inspections").put(value,"current");
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(new Error("Armazenamento cheio ou indisponível. Exporte uma cópia da vistoria."));};
  });
}
export function downloadJSON(inspection:Inspection) {
  const blob=new Blob([JSON.stringify(inspection,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`chavecheck-${inspection.date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function archiveInspection(value:Inspection):Promise<void> {
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("inspections","readwrite");
    tx.objectStore("inspections").put(value,`archive:${value.id}:${Date.now()}`);
    tx.objectStore("inspections").put(value,"previous");
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(new Error("Não foi possível guardar a vistoria anterior. Seus dados atuais foram mantidos."));};
  });
}

export async function downloadPreviousInspection():Promise<boolean> {
  const db=await openDb();
  const value=await new Promise<Inspection|undefined>((resolve,reject)=>{
    const tx=db.transaction("inspections","readonly");const req=tx.objectStore("inspections").get("previous");
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();
  });
  if(!value)return false;
  downloadJSON(value);return true;
}
