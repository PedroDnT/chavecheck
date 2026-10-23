import {localDate,type CheckItem,type Inspection,type ReferencePhoto} from "./inspection";

export const LEGACY_ROOM_SCENARIO_ID="sala-fotos-v1";
export const ROOM_SCENARIO_ID="sala-parede-canaleta-v2";
export const ROOM_REFERENCES:ReferencePhoto[]=[
  {id:"foto-001",url:"/api/reference-photos/foto-001",label:"Parede texturizada e canaleta inferior",description:"foto-001.jpeg: parede cinza texturizada atrás do mapa. A canaleta inferior aparece parcialmente à esquerda, com uma faixa escura; esta vista não permite afirmar se a tampa está íntegra ou aberta. Compare somente acabamento da parede e aspecto visível da canaleta. Os demais objetos servem apenas para localização.",itemIds:["sala-paredes","sala-canaleta"]},
  {id:"foto-002",url:"/api/reference-photos/foto-002",label:"Parede da janela e canaleta clara",description:"foto-002.jpeg: parede cinza texturizada ao redor da janela e rodapé/canaleta clara na parte inferior. As variações da textura são intencionais. Compare somente acabamento da parede e aspecto visível da canaleta, nos ângulos disponíveis.",itemIds:["sala-paredes","sala-canaleta"]},
];
export const ROOM_INPUT=`Teste simples da sala: apenas duas verificações, nesta ordem. As duas fotografias anteriores fornecidas pelo usuário (foto-001.jpeg e foto-002.jpeg) são a referência inicial, não a vistoria atual.
1. Parede — cimento queimado: conferir se o acabamento cinza texturizado é visualmente compatível com a referência e se há avaria aparente no trecho fotografado. As variações da textura são intencionais. Oriente a enquadrar a parede de frente e fotografar. Peça uma aproximação somente se o acabamento não estiver visível; iluminação diferente, por si só, não é divergência.
2. Canaleta inferior — proteção dos fios: conferir se a tampa está fechada, alinhada e sem quebra aparente no trecho fotografado. Oriente a baixar a câmera, aproximar da canaleta e incluir tampa e emendas em uma foto. A faixa escura e a vista parcial da foto-001 não comprovam abertura. Não orientar abertura nem contato com fios.
Avalie apenas o trecho mostrado, sem exigir fotos da sala inteira nem testes de funcionamento. Não inspecione ar-condicionado ou mobiliário. Conduza uma etapa por vez, aceite a foto assim que enviada e peça nova foto apenas quando faltar um detalhe necessário. Após a revisão humana das duas etapas, encerre a verificação.
Não há contrato, preço, prazo ou quantidade contratada para este teste. Nenhum item da vistoria atual está verificado. Qualquer divergência será apenas sugestão, com foto atual e revisão humana.`;

export function createRoomScenario():Inspection {
  const check=(id:string,title:string,condition:string,source:string):CheckItem=>({id,room:"Sala",title,expected:{quantity:null,value:null,dueDate:null,condition},delivered:{quantity:null,value:null,completedDate:null,status:"nao_informado"},source,status:"pendente",note:""});
  return {version:1,id:crypto.randomUUID(),scenarioId:ROOM_SCENARIO_ID,property:"Sala · parede e canaleta",date:localDate(),demo:true,originalInput:ROOM_INPUT,referencePhotos:structuredClone(ROOM_REFERENCES),
    items:[
      check("sala-paredes","Parede: cimento queimado","Condição esperada declarada: acabamento cinza com textura de cimento queimado, sem avaria aparente no trecho fotografado. Compare o acabamento com a referência; variações intencionais de textura ou diferenças de iluminação não são avarias por si só. Uma foto de frente deve bastar; peça aproximação somente se faltar detalhe.","Descrição do usuário + foto-001.jpeg (parede atrás do mapa) + foto-002.jpeg (parede da janela). As fotos são referências anteriores; não comprovam o estado atual."),
      check("sala-canaleta","Canaleta: tampa e fios","Condição esperada declarada: canaleta inferior com tampa fechada, alinhada e sem quebra aparente no trecho fotografado. Enquadre de perto tampa e emendas. Verifique abertura, peça solta ou fio exposto somente quando visível. A faixa escura da foto-001, isoladamente, não comprova abertura. Não tocar nem abrir a instalação; não testar funcionamento.","Descrição do usuário + parte inferior de foto-001.jpeg e foto-002.jpeg. Compare o trecho visível; as referências parciais não permitem certificar toda a instalação."),
    ],evidence:[],history:[],messages:[]};
}
