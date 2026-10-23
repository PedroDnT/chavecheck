"use client";

import {useEffect,useState} from "react";
import type {ReferencePhoto} from "@/lib/inspection";

type LoadedReference={id:string;label:string;dataUrl:string};

// Originals remain untouched. These small copies fit WebRTC data-channel messages.
async function transportImage(blob:Blob):Promise<string> {
  const bitmap=await createImageBitmap(blob);
  try {
    const canvas=document.createElement("canvas");
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("Não foi possível preparar as fotos de referência.");
    for(const width of [960,800,640,480]){
      const ratio=Math.min(1,width/bitmap.width);
      canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.72,.55,.4]){
        const dataUrl=canvas.toDataURL("image/jpeg",quality);
        if(dataUrl.length<=60_000)return dataUrl;
      }
    }
    throw new Error("As referências ficaram grandes demais para a conversa por voz.");
  } finally {bitmap.close();}
}

export function useReferenceImages(photos?:ReferencePhoto[]) {
  const ids=JSON.stringify((photos??[]).map(p=>({id:p.id,label:p.label})));
  const [state,setState]=useState<{key:string;images:LoadedReference[];error:string|null}>({key:"",images:[],error:null});
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const list=JSON.parse(ids) as Array<{id:string;label:string}>;
    if(!list.length){setState({key:ids,images:[],error:null});return;}
    void Promise.all(list.map(async photo=>{
      if(!["foto-001","foto-002"].includes(photo.id))throw new Error("Foto de referência desconhecida.");
      const response=await fetch(`/api/reference-photos/${photo.id}`,{signal:controller.signal});
      if(!response.ok)throw new Error("Não foi possível carregar as fotos de referência. Tente novamente.");
      return {...photo,dataUrl:await transportImage(await response.blob())};
    })).then(images=>{if(!controller.signal.aborted)setState({key:ids,images,error:null});}).catch(error=>{
      if(!controller.signal.aborted)setState({key:ids,images:[],error:error instanceof Error?error.message:"Falha ao carregar as referências."});
    });
    return ()=>controller.abort();
  },[ids,attempt]);
  const ready=state.key===ids;
  return {images:ready?state.images:[],loading:!ready,error:ready?state.error:null,retry:()=>{setState({key:"",images:[],error:null});setAttempt(n=>n+1);}};
}
