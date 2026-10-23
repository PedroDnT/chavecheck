# Cenários de avaliação e evolução

Este catálogo conecta a demonstração atual à proposta completa do ChaveCheck: receber documentos, montar um checklist revisável, conduzir a inspeção por conversa e registrar um relatório com fontes e imagens comparáveis.

**Data de referência: 23/10/2026.** Os exemplos de imóveis, obrigações, valores e datas são fictícios. As duas fotos fornecidas compõem um cenário de referência declarado fictício; não certificam o estado de um ambiente atual. Os critérios abaixo orientam avaliação e desenvolvimento: não são resultados de testes já executados. Os controles realizados estão em [VALIDACAO.md](VALIDACAO.md).

A [especificação original](especificacao-original.md) registra a concepção e o enquadramento proposto pela equipe. Suas referências a desafio, prioridades e critérios não constituem confirmação de uma rubrica oficial vigente do hackathon.

## Como ler o catálogo

| Situação | Significado |
| --- | --- |
| **Ativo na demonstração** | Pode ser percorrido pela navegação principal atual. |
| **Capacidade implementada, fora do fluxo principal** | Há lógica ou componente no código, mas não um percurso acessível completo pela tela inicial atual. |
| **Evolução planejada** | Descreve o comportamento desejado; depende das implementações indicadas. |

Na demonstração, **tempo real** descreve a conversa por voz durante a vistoria. A câmera oferece uma prévia local e a análise visual acontece a cada foto enviada manualmente. A pessoa pode continuar falando enquanto a comparação é processada. A aplicação não analisa vídeo continuamente, não aprova itens sozinha e não garante um tempo fixo de resposta.

## 1. Parede e canaleta — percurso ativo

**Situação:** ativo na demonstração, pelo botão **Testar parede e canaleta**. Um cômodo, dois itens e duas referências anteriores fixas.

| Etapa | Fonte e entrada | Condução | Saída e evidência | Limite | Critério de aceite |
| --- | --- | --- | --- | --- | --- |
| Parede: cimento queimado | Condição declarada pelo usuário, `foto-001.jpeg`, `foto-002.jpeg` e uma nova foto da parede. | Solicitar vista de frente do trecho. Pedir aproximação somente se o acabamento ou uma possível marca não puder ser visto. | Sugestão de condição do trecho, requisito, referência utilizada, regiões, antes/depois, justificativa e captura atual. | Textura intencional e mudança de luz isolada não comprovam avaria. A conclusão não abrange partes fora das fotos. | Distinguir textura de possível alteração, manter inconclusivo quando faltar suporte e permitir revisar a sugestão antes de avançar. |
| Canaleta: tampa e fios | Condição declarada e partes inferiores das mesmas referências, mais uma nova foto próxima da canaleta. | Orientar a baixar a câmera e incluir tampa e emendas; solicitar outro detalhe apenas quando necessário. | Registro de tampa fechada/alinhada ou possível abertura, quebra, peça solta ou fio exposto, quando visíveis. | A faixa escura da referência e trechos ocultos não provam dano. Não abrir a canaleta, tocar fios nem inferir funcionamento elétrico. | Relacionar cada achado ao trecho fotografado e à referência; não converter ausência de detalhe em conformidade. Após revisão dos dois itens, oferecer o relatório. |

**Percurso esperado:** habilitar câmera → iniciar voz → receber orientação → fotografar → continuar conversando durante a análise → revisar → avançar → concluir e abrir relatório. Divergências e inconclusivos confirmados continuam identificados no encerramento.

**Base implementada:** [`room-scenario.ts`](../src/lib/room-scenario.ts), [`guided-verification.ts`](../src/lib/guided-verification.ts), [`inspection-app.tsx`](../src/components/inspection-app.tsx) e [`report.tsx`](../src/components/report.tsx).

### Variações úteis para avaliar o percurso ativo

- **Outro ângulo, pouca luz ou imagem desfocada:** a assistente deve indicar qual detalhe falta e como reenquadrar, preservando o resultado inconclusivo quando necessário.
- **A própria referência enviada como foto atual:** o mesmo arquivo é reconhecido pelo SHA-256; a aplicação pede uma captura nova. Esse controle não detecta todas as cópias redimensionadas ou reencodificadas.
- **Falha de rede ou cancelamento:** a foto já salva permanece vinculada ao item e pode ser reanalisada, sem transformar uma conclusão antiga no resultado da nova captura.
- **Nova foto após revisão:** a revisão do item é reaberta, preservando análises, evidências e decisões anteriores.
- **Conversa durante a espera:** o canal permanece disponível; a assistente reconhece que ainda está analisando e não inventa um resultado para preencher o silêncio.

Essas variações verificam comportamento e conservação dos registros. Avaliar precisão visual exige capturas novas com resultados esperados revisados pela equipe; não basta repetir as referências ou utilizar respostas simuladas.

## 2. Quantidade, prazo e valor — capacidades de domínio existentes

**Situação:** capacidade implementada, fora do fluxo principal. O exemplo legado `createDemo()` contém cinco itens em quatro cômodos; `compareItem()` calcula diferenças a partir dos dados registrados. A extração textual em `/api/parse` organiza até dez itens com campos validados e trecho de origem. O componente de preparação textual foi preservado, mas não integra a navegação principal atual.

| Cenário fictício | Fonte e entrada | Condução pretendida ao reintegrar o fluxo | Saída e evidência | Limite | Critério de aceite |
| --- | --- | --- | --- | --- | --- |
| Quantidade de tomadas | Contrato prevê quatro; registro de entrega informa três. | Apresentar a diferença documental, pedir confirmação da contagem e orientar foto que cubra o trecho conferido. | Diferença determinística 4 × 3, fonte e registro de entrega; foto e declaração humana como evidências adicionais. | Uma foto parcial não comprova a quantidade total nem funcionamento. | A diferença aparece pelos valores registrados, sem completar dados ausentes nem contar automaticamente áreas não vistas. |
| Prazo do reparo da torneira | Prazo 20/10/2026; entrega registrada como pendente em uma vistoria de 23/10/2026. | Recuperar prazo e situação registrada; solicitar confirmação de execução e observação atual. | Diferença de prazo, data da vistoria, fonte e estado de entrega. | Aparência da torneira não comprova data de execução nem causa de vazamento. | Sinalizar atraso quando a entrega for posterior ao prazo ou estiver explicitamente pendente após ele; não inventar data quando ausente. |
| Valor de acessório | Contrato fictício de R$ 180 e registro de entrega/comprovante fictício de R$ 260. | Mostrar os dois registros e pedir conferência da associação ao mesmo item. | Diferença determinística entre R$ 180 e R$ 260, preservando fontes e valores informados. | A câmera não determina preço, cobrança devida nem responsabilidade contratual. | Apresentar a diferença documental sem inferir preço por aparência ou transformar a ocorrência em parecer jurídico. |

Os outros itens legados são pintura da sala e abertura da janela. Eles ajudam a representar condição visual e declaração humana sobre funcionamento, mas não ampliam o cenário rápido ativo.

**Base implementada:** [`inspection.ts`](../src/lib/inspection.ts), [`extraction.ts`](../src/lib/server/extraction.ts), [`api/parse/route.ts`](../src/app/api/parse/route.ts) e [`preparation.tsx`](../src/components/preparation.tsx). A evolução é reunir essas capacidades em uma preparação documental acessível, sem afirmar que o PDF atual já fornece esses dados.

## 3. PDF digital → checklist revisável

**Situação:** evolução planejada. O upload e a preservação do PDF original já existem; a extração real de seu conteúdo ainda não. Atualmente qualquer PDF válido segue um mapeamento simulado para parede e canaleta.

**Documento de exemplo disponível:** [contrato fictício de locação comercial](../assets/sample-documents/contrato_aluguel_comercial_mock.pdf), fornecido para o projeto, com dez itens físicos e duas fotos de referência. O original está preservado; [as instruções de uso](../assets/sample-documents/README.md) distinguem o teste de upload atual da extração futura.

- **Fonte e entrada:** contrato, termo ou laudo fictício em PDF com texto digital; páginas contendo cômodos, itens, condições, quantidades, valores ou prazos.
- **Condução:** preservar o original, extrair conteúdo e fontes, sugerir checklist e mostrar a revisão antes da inspeção. Separar obrigação prevista de registro de entrega.
- **Saída e evidência:** itens editáveis associados a documento, página e trecho; campos ausentes como “Não informado”; versão da extração e original recuperável.
- **Limite:** receber um PDF não significa que ele tenha sido interpretado. O scanner atual de cinco segundos é uma simulação de interface, não medida de extração.
- **Critério de aceite:** dois PDFs de controle com conteúdos diferentes geram checklists diferentes e coerentes; cada campo preenchido é verificável na origem; correções humanas ficam registradas; não há reaproveitamento silencioso do cenário fixo.
- **Dependências:** leitura de PDF, esquema de proveniência por página, revisão documental no fluxo principal e tratamento de erros/limites. Começar com até dez itens mantém o recorte original da POC.

## 4. PDF escaneado, ilegível ou ambíguo

**Situação:** evolução planejada.

- **Fonte e entrada:** cópia digitalizada fictícia, página inclinada, tabela com baixa nitidez, data incompleta ou informação conflitante entre anexos.
- **Condução:** identificar páginas problemáticas, aplicar leitura multimodal/OCR quando apropriado e solicitar correção ou confirmação objetiva do campo em dúvida.
- **Saída e evidência:** trecho/página usados, proposta de extração e pendências de revisão; distinção entre texto recuperado e correção informada pela pessoa.
- **Limite:** não completar ano, valor, quantidade ou cláusula por plausibilidade. Um campo ilegível não vira zero nem conforme.
- **Critério de aceite:** o documento de controle contém pelo menos um dado ilegível e uma data incompleta; ambos permanecem pendentes até revisão. Correções preservam a origem e não alteram o PDF original.
- **Dependências:** extração real de PDF, tratamento de imagem de página, modelo de conflitos e tela de revisão.

## 5. Vistoria com múltiplos cômodos

**Situação:** evolução planejada para o percurso documental completo. O agrupamento, progresso e seleção de itens por cômodo já existem; o cenário rápido oferece somente a Sala.

- **Fonte e entrada:** documento fictício com Sala, Cozinha, Quarto e Banheiro, inicialmente limitado a dez itens para a validação.
- **Condução:** confirmar o cômodo ativo, seguir seus itens pendentes e orientar a mudança de ambiente quando apropriado; permitir retomar uma etapa interrompida.
- **Saída e evidência:** checklist e relatório por cômodo, fotos ligadas ao item correto e totais de revisados, pendentes, divergentes e inconclusivos.
- **Limite:** reconhecimento automático de cômodo não é necessário para o primeiro incremento; a seleção humana é a referência de contexto.
- **Critério de aceite:** alternar cômodos durante a análise não associa uma resposta atrasada ao item errado; retomar abre um item pendente; finalizar preserva tudo o que não foi verificado.
- **Dependências:** checklist documental revisado, identificação estável dos itens e validação do percurso com mais de um ambiente.

## 6. Devolução de imóvel: antes e depois

**Situação:** evolução planejada para documentos e referências arbitrárias. A comparação visual com as duas referências fixas já está implementada.

- **Fonte e entrada:** laudo inicial fictício, fotos anteriores identificadas por cômodo/item e novas capturas da devolução.
- **Condução:** recuperar a vista anterior, orientar enquadramento correspondente e distinguir marcas preexistentes de alterações aparentes.
- **Saída e evidência:** imagens anterior/atual, regiões comparadas, achados, limitações, fonte da condição esperada e revisão humana.
- **Limite:** diferença de luz, textura ou ponto de vista não basta para declarar dano. Alteração visual não estabelece causa, autoria ou responsabilidade.
- **Critério de aceite:** uma marca registrada na referência é preservada como preexistente; uma alteração visível de controle é localizada; uma vista incompatível pede reenquadramento; todas as conclusões citam as imagens efetivamente usadas.
- **Dependências:** cadastro genérico de referências, revisão de vínculos, proveniência dos originais e testes com ângulos/iluminação diferentes.

## 7. Conferência de manutenção e reparos

**Situação:** evolução planejada como jornada completa; diferenças documentais de prazo e registro visual já têm componentes de base.

- **Fonte e entrada:** ordem de serviço fictícia com reparo previsto, prazo, registro de execução e fotos anteriores/atuais.
- **Condução:** verificar o que foi contratado, perguntar sobre execução quando necessário, orientar fotos do acabamento e registrar declarações sobre funcionamento separadamente.
- **Saída e evidência:** previsto → registrado como entregue → observado; eventuais diferenças de prazo/quantidade/valor e fotos do reparo.
- **Limite:** acabamento visível não comprova reparo interno, eliminação da causa nem desempenho futuro.
- **Critério de aceite:** o relatório distingue “aparência conferida”, “execução declarada” e “funcionamento não verificado”, sem transformar uma foto em confirmação de todos os aspectos do serviço.
- **Dependências:** associação da ordem de serviço e do registro de entrega ao mesmo item, campos para declaração humana e validação do roteiro de manutenção.

## 8. Mobiliário e ar-condicionado

**Situação:** evolução planejada para reincorporar esses itens de maneira explícita. As referências fixas mostram móveis e ar-condicionado, mas eles não integram os dois itens ativos.

- **Fonte e entrada:** inventário fictício, condição esperada, referências e fotos atuais de armários, mesa, cadeiras ou carcaça do ar-condicionado.
- **Condução:** orientar uma foto geral e detalhes necessários do exterior; separar aparência de uma declaração da pessoa sobre uso ou funcionamento.
- **Saída e evidência:** comparação de integridade externa visível, marcas preexistentes e possíveis alterações; declarações humanas identificadas como tais.
- **Limite:** não inferir refrigeração, instalação elétrica correta, segurança, peças internas, capacidade ou funcionamento apenas pela foto.
- **Critério de aceite:** uma carcaça aparentemente íntegra não gera “ar-condicionado funcionando”; o resultado visual e a declaração de funcionamento aparecem como registros distintos.
- **Dependências:** ampliação do checklist, instruções por categoria e registro estruturado da origem de observações verbais/manuais.

## 9. Inspeção sem fotografia anterior

**Situação:** evolução planejada como percurso acessível. O contrato de análise visual aceita ausência de referências, mas o cenário rápido atual sempre possui as duas fotos fixas.

- **Fonte e entrada:** condição esperada em documento ou declaração revisada e uma foto atual, sem imagem anterior disponível.
- **Condução:** informar a condição a conferir, orientar captura e descrever o estado visível em relação ao requisito disponível.
- **Saída e evidência:** foto atual, fonte textual, observação e limites; indicação expressa de ausência de comparação histórica.
- **Limite:** não afirmar que uma marca “é nova”, “aumentou” ou “não existia” sem uma fonte anterior que sustente isso.
- **Critério de aceite:** o relatório não inventa referência nem apresenta um comparativo antes/depois; a conclusão se restringe ao requisito e à evidência atuais.
- **Dependências:** preparação que permita referências opcionais e apresentação clara do tipo de comparação disponível.

## 10. Rechecagem e histórico entre visitas

**Situação:** evolução planejada para visitas distintas. Refazer a foto do mesmo item na sessão atual e preservar análises/revisões anteriores já é suportado.

- **Fonte e entrada:** ocorrência revisada em uma vistoria fictícia anterior, reparo declarado e novas fotos em outra visita.
- **Condução:** recuperar a ocorrência e a condição usada naquela decisão, solicitar o mesmo detalhe e registrar a nova conferência sem reescrever a visita anterior.
- **Saída e evidência:** sequência entre visitas com originais, datas, requisitos, análises e revisões; situação atual e histórico distinguíveis.
- **Limite:** os arquivos locais de sessões anteriores não formam hoje uma gestão navegável e sincronizada de múltiplas vistorias.
- **Critério de aceite:** a rechecagem mantém a decisão antiga intacta, cria um novo registro associado e permite reconstruir quais imagens sustentaram cada conclusão.
- **Dependências:** identidade do imóvel/item entre visitas, armazenamento persistente compartilhado, controle de acesso, histórico navegável e política de retenção.

## Evidência comum no relatório

Todos os cenários devem convergir para um relatório que permita responder: **o que era esperado, de onde veio, o que foi informado como entregue, o que foi observado, quais imagens sustentam a comparação e quem revisou a conclusão**.

Hoje o relatório local reúne fontes textuais, fotos atuais, referências fixas, inventários, comparações, histórico e estados do checklist. A impressão do navegador permite salvar PDF. A exportação JSON incorpora fotos atuais e análises; as imagens de referência permanecem identificadas por seus links e hashes, e o PDF de entrada é guardado separadamente no navegador.

Para a visão completa, o critério de aceite é um pacote que continue interpretável fora da sessão: relatório, originais documentais, referências, capturas e histórico, com vínculos verificáveis. A forma final de distribuição, armazenamento e acesso ainda precisa ser implementada.

## Ordem sugerida de evolução

1. **Concluir a entrada documental:** PDF digital real, fontes por página/trecho e revisão do checklist; reintegrar a comparação de quantidade, prazo e valor.
2. **Generalizar a vistoria:** múltiplos cômodos, referências cadastradas e cenário sem foto anterior, conservando o percurso manual guiado.
3. **Validar os casos difíceis:** PDF escaneado, informações conflitantes, mudanças de luz, ângulos diferentes e detalhes insuficientes, com resultados esperados revisados por pessoas.
4. **Completar o produto persistente:** relatório autossuficiente, armazenamento compartilhado, controle de acesso, rechecagens e histórico entre visitas.

Essa ordem amplia o alcance do projeto sem confundir as capacidades já demonstráveis com a visão ainda em construção.
