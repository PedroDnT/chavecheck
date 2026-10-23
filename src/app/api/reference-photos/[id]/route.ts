import {readFile} from "node:fs/promises";
import path from "node:path";

export const runtime="nodejs";
const files:Record<string,string>={"foto-001":"foto-001.jpeg","foto-002":"foto-002.jpeg"};
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const file=Object.hasOwn(files,id)?files[id]:undefined;
  if(!file)return new Response("Referência não encontrada.",{status:404});
  try {
    const bytes=await readFile(path.join(process.cwd(),"assets","reference-room",file));
    return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, max-age=3600","X-Content-Type-Options":"nosniff"}});
  } catch {return new Response("Foto de referência indisponível.",{status:503});}
}
