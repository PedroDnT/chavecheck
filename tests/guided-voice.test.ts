import assert from "node:assert/strict";
import test from "node:test";
import {prepareLiveAudio} from "../src/lib/live-audio";
import {liveGreeting,liveBackendInstructions,liveVoiceInstructions} from "../src/lib/server/live-prompts";
import {inspectionInstructions} from "../src/lib/server/prompts";

test("camera gesture primes reusable silent audio synchronously and releases the primer once",t=>{
  const calls:string[]=[];
  const silence={offset:{value:1},connect(){calls.push("connect");},start(){calls.push("start");},stop(){calls.push("stop");},disconnect(){calls.push("disconnect");}};
  const stream={getTracks:()=>[{stop:()=>calls.push("track.stop")}]};
  class Context {
    createMediaStreamDestination(){return {stream};}
    createConstantSource(){return silence;}
    resume(){calls.push("resume");return Promise.resolve();}
    close(){calls.push("close");return Promise.resolve();}
  }
  class Player {
    autoplay=false;srcObject:unknown=null;
    setAttribute(name:string,value:string){calls.push(`${name}:${value}`);}
    play(){calls.push("play");return Promise.resolve();}
    pause(){calls.push("pause");}
  }
  const originalContext=Object.getOwnPropertyDescriptor(globalThis,"AudioContext");
  const originalAudio=Object.getOwnPropertyDescriptor(globalThis,"Audio");
  Object.defineProperty(globalThis,"AudioContext",{value:Context,configurable:true});
  Object.defineProperty(globalThis,"Audio",{value:Player,configurable:true});
  t.after(()=>{
    if(originalContext)Object.defineProperty(globalThis,"AudioContext",originalContext);else Reflect.deleteProperty(globalThis,"AudioContext");
    if(originalAudio)Object.defineProperty(globalThis,"Audio",originalAudio);else Reflect.deleteProperty(globalThis,"Audio");
  });
  const output=prepareLiveAudio();
  assert.ok(calls.includes("resume")&&calls.includes("play"),"Playback must be requested before the click handler yields to camera permission");
  assert.equal(silence.offset.value,0,"Preparing the assistant must remain silent");
  assert.equal(output.player.srcObject,stream);
  assert.equal(output.player.autoplay,true);
  output.stopPriming();output.stopPriming();
  assert.equal(calls.filter(value=>value==="stop").length,1);
  assert.equal(calls.filter(value=>value==="track.stop").length,1);
  assert.equal(calls.includes("close"),false,"The unlocked audio context must remain available for the Live stream");
  assert.equal(calls.includes("pause"),false,"The unlocked player must remain available for the Live stream");
});

test("voice and text guide manual photographs while preserving recorded evidence and human review",()=>{
  assert.ok(Buffer.byteLength(liveGreeting,"utf8")<=500,"Greeting must fit a Live commentary append");
  assert.match(liveGreeting,/Aguarde a foto enviada pela pessoa/);
  for(const prompt of [liveVoiceInstructions,inspectionInstructions,liveBackendInstructions("Sala")]){
    assert.match(prompt,/Não há vídeo nem quadros automáticos|não há vídeo nem quadros automáticos/);
    assert.match(prompt,/Fotografar e analisar/);
    assert.match(prompt,/análise registrada/);
  }
  assert.match(liveVoiceInstructions,/Continue no próximo item apenas depois da confirmação do aplicativo/);
  assert.match(inspectionInstructions,/Você nunca aprova itens/);
  assert.match(liveBackendInstructions("Sala"),/use request_photo_capture/);
});


test("live conversation stays available during analysis without retrying or reusing the old verdict", () => {
  assert.match(liveVoiceInstructions, /Continue ouvindo e respondendo normalmente/);
  assert.match(liveVoiceInstructions, /Não recicle o resultado anterior/);
  assert.match(liveVoiceInstructions, /não peça outra captura/);
  assert.match(liveBackendInstructions("Sala"), /analysisInProgress=true/);
  assert.match(liveBackendInstructions("Sala"), /Não faça uma segunda análise da mesma foto/);
});
