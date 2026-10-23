"use client";
import {useCallback,useEffect,useRef,useState} from "react";
export function useCamera() {
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const generation=useRef(0);
  const [active,setActive]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [facing,setFacing]=useState<"environment"|"user">("environment");
  const stop=useCallback(()=>{generation.current++;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setActive(false);setLoading(false);if(videoRef.current)videoRef.current.srcObject=null;},[]);
  const start=useCallback(async(direction:"environment"|"user"=facing):Promise<boolean>=>{
    stop();const current=++generation.current;setLoading(true);setError(null);
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw new Error("Abra em localhost ou HTTPS para usar a câmera.");
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:direction},width:{ideal:1920},height:{ideal:1080}},audio:false});
      if(generation.current!==current){stream.getTracks().forEach(t=>t.stop());return false;}
      streamRef.current=stream;setActive(true);setFacing(direction);
      stream.getVideoTracks()[0].addEventListener("ended",()=>{if(generation.current===current){setActive(false);setError("A câmera foi desconectada. Ative-a novamente.");}});
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      return generation.current===current;
    }catch(e){if(generation.current===current){
      const message=e instanceof DOMException&&e.name==="NotAllowedError"?"Permita o acesso à câmera no navegador. Você também pode anexar uma foto.":e instanceof DOMException&&e.name==="NotFoundError"?"Nenhuma câmera encontrada. Você pode anexar uma foto.":e instanceof Error?e.message:"Não foi possível abrir a câmera.";
      stop();setError(message);
    }return false;}
    finally{if(generation.current===current)setLoading(false);}
  },[facing,stop]);
  const attach=useCallback((node:HTMLVideoElement|null)=>{videoRef.current=node;if(node&&streamRef.current){node.srcObject=streamRef.current;void node.play().catch(()=>{});}},[]);
  const capture=useCallback((forAnalysis=false)=>{
    const video=videoRef.current;if(!video||!active||!video.videoWidth)throw new Error("A câmera ainda não está pronta. Aguarde a imagem aparecer.");
    const canvas=document.createElement("canvas");const scale=forAnalysis?Math.min(1,960/video.videoWidth):1;
    canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
    canvas.getContext("2d")!.drawImage(video,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",forAnalysis?0.72:0.95);
  },[active]);
  useEffect(()=>()=>{generation.current++;streamRef.current?.getTracks().forEach(t=>t.stop());},[]);
  return {active,loading,error,facing,attach,start,stop,capture,switchCamera:()=>start(facing==="environment"?"user":"environment")};
}
