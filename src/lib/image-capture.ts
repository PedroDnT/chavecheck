import type {Evidence} from "./inspection";

export async function imageDigest(dataUrl:string):Promise<string> {
  const bytes=Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",")+1)),c=>c.charCodeAt(0));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}

export async function prepareAnalysisImage(dataUrl:string):Promise<{analysisDataUrl:string;sha256:string;captureMetrics:NonNullable<Evidence["captureMetrics"]>}> {
  const blob=await (await fetch(dataUrl)).blob();
  const bitmap=await createImageBitmap(blob);
  try {
    const canvas=document.createElement("canvas");
    const context=canvas.getContext("2d",{willReadFrequently:true});
    if(!context)throw new Error("Não foi possível ler a foto. Tente novamente.");
    const scale=Math.min(1,192/bitmap.width);
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    const luminances=new Float64Array(canvas.width*canvas.height);
    let sum=0,dark=0,bright=0;
    for(let i=0;i<luminances.length;i++){
      const l=.2126*pixels[i*4]+.7152*pixels[i*4+1]+.0722*pixels[i*4+2];
      luminances[i]=l;sum+=l;if(l<16)dark++;if(l>239)bright++;
    }
    let detail=0,detailSum=0,n=0;
    for(let y=1;y<canvas.height-1;y++)for(let x=1;x<canvas.width-1;x++){
      const p=y*canvas.width+x;
      const d=4*luminances[p]-luminances[p-1]-luminances[p+1]-luminances[p-canvas.width]-luminances[p+canvas.width];
      detail+=d*d;detailSum+=d;n++;
    }
    // Pixel statistics describe this capture, not physical lux or calibrated color.
    const captureMetrics={width:bitmap.width,height:bitmap.height,meanLuminance:Math.round(sum/luminances.length),darkFraction:dark/luminances.length,brightFraction:bright/luminances.length,detailVariance:n?Math.max(0,detail/n-(detailSum/n)**2):0};
    let analysisDataUrl=dataUrl;
    if(blob.size>1_000_000||Math.max(bitmap.width,bitmap.height)>1600){
      for(const edge of [1600,1280,960]){
        const ratio=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
        canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
        context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        analysisDataUrl=canvas.toDataURL("image/jpeg",.82);
        if(analysisDataUrl.length<=1_350_000)break;
      }
    }
    if(analysisDataUrl.length>4_000_000)throw new Error("A foto é grande demais para análise. Capture uma nova imagem.");
    return {analysisDataUrl,sha256:await imageDigest(dataUrl),captureMetrics};
  } finally {bitmap.close();}
}
