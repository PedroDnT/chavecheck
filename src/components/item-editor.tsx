"use client";
import {useEffect,useRef,useState} from "react";
import {X,Save} from "lucide-react";
import {type CheckItem,statusLabel} from "@/lib/inspection";
export function ItemEditor({item,onSave,onClose}:{item:CheckItem;onSave:(item:CheckItem)=>void;onClose:()=>void}) {
  const [draft,setDraft]=useState<CheckItem>(structuredClone(item));
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  const numeric=(v:string)=>v===""?null:Number(v);
  return <dialog ref={ref} className="dialog item-dialog" onCancel={onClose} aria-labelledby="item-title">
    <form onSubmit={e=>{e.preventDefault();onSave(draft);}}>
      <div className="dialog-heading"><div><span className="muted">Revisão humana</span><h2 id="item-title">Conferir item</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar edição"><X size={20}/></button></div>
      <div className="form-grid"><label className="field">Ambiente<input required maxLength={100} value={draft.room} onChange={e=>setDraft({...draft,room:e.target.value})}/></label><label className="field">Item<input required maxLength={180} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label></div>
      <label className="field">Condição prevista<textarea value={draft.expected.condition} onChange={e=>setDraft({...draft,expected:{...draft.expected,condition:e.target.value}})}/></label>
      <div className="form-grid"><fieldset><legend>Previsto</legend><label className="field">Quantidade<input type="number" min="0" step="any" placeholder="Não informado" value={draft.expected.quantity??""} onChange={e=>setDraft({...draft,expected:{...draft.expected,quantity:numeric(e.target.value)}})}/></label><label className="field">Valor (R$)<input type="number" min="0" step="0.01" placeholder="Não informado" value={draft.expected.value??""} onChange={e=>setDraft({...draft,expected:{...draft.expected,value:numeric(e.target.value)}})}/></label><label className="field">Prazo<input type="date" value={draft.expected.dueDate??""} onChange={e=>setDraft({...draft,expected:{...draft.expected,dueDate:e.target.value||null}})}/></label></fieldset>
      <fieldset><legend>Registro de entrega</legend><label className="field">Quantidade entregue<input type="number" min="0" step="any" placeholder="Não informado" value={draft.delivered.quantity??""} onChange={e=>setDraft({...draft,delivered:{...draft.delivered,quantity:numeric(e.target.value)}})}/></label><label className="field">Valor registrado (R$)<input type="number" min="0" step="0.01" placeholder="Não informado" value={draft.delivered.value??""} onChange={e=>setDraft({...draft,delivered:{...draft.delivered,value:numeric(e.target.value)}})}/></label><label className="field">Data de conclusão<input type="date" value={draft.delivered.completedDate??""} onChange={e=>setDraft({...draft,delivered:{...draft.delivered,completedDate:e.target.value||null}})}/></label></fieldset></div>
      <label className="field">Situação da entrega<select value={draft.delivered.status} onChange={e=>setDraft({...draft,delivered:{...draft.delivered,status:e.target.value as CheckItem["delivered"]["status"]}})}><option value="nao_informado">Não informada</option><option value="entregue">Entregue</option><option value="pendente">Pendente</option></select></label>
      <label className="field">Fonte / trecho de origem<textarea value={draft.source} onChange={e=>setDraft({...draft,source:e.target.value})}/></label>
      <label className="field">Sua observação<textarea placeholder="O que você efetivamente conferiu?" value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
      <label className="field">Conclusão da sua revisão<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as CheckItem["status"]})}>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit"><Save size={16}/>Salvar revisão</button></div>
    </form>
  </dialog>;
}
