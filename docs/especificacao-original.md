# Vistoria Viva — Especificação de produto para validação

**Versão:** 1.0  
**Data:** 23/10/2026  
**Status:** hipótese de produto / não implementado  
**Público:** equipe do hackathon e mentores

## 1. Visão do produto

**Vistoria Viva** é uma aplicação web mobile-first para vistorias de imóveis assistidas por IA. Antes da visita, interpreta um contrato fictício de locação, um laudo/termo de entrega, fotografias anteriores e uma tabela de itens contratados versus entregues. Durante a visita, o usuário conversa com a IA enquanto aponta a câmera para ambientes e detalhes. O assistente recupera o que deveria existir, pergunta o que ainda falta conferir, recebe quadros da câmera, sugere possíveis divergências e pode solicitar a captura de uma fotografia. Ao final, entrega um relatório por cômodo com fatos conferidos, possíveis problemas, evidências e origem documental.

**Promessa:** «Converse com a IA durante a vistoria; ela ajuda a lembrar o que conferir e organiza as evidências no mesmo momento.»

**Não promete:** detectar todos os defeitos, provar responsabilidade por danos, substituir um vistoriador ou emitir conclusões jurídicas.

## 2. Problema e usuários

A vistoria convencional exige alternar entre contrato, laudo anterior, fotos, checklist e anotações. Isso causa esquecimentos, documentação incompleta, fotos sem contexto e retrabalho.

**Usuários iniciais:** vistoriadores de imobiliárias, locadores, locatários e administradores de imóveis. **Usuário primário do MVP:** vistoriador que realiza uma única inspeção com o celular.

**Resultado esperado:** em uma única sessão, conseguir verificar itens previstos, registrar três divergências rastreáveis e emitir um relatório compreensível.

## 3. Aderência ao desafio do hackathon

**Desafio 8 — Conferidor de contrato e entregas.** O enunciado pede receber contrato curto e tabela de entregas, destacar divergências de quantidade, prazo ou valor, permitir revisão e demonstrar três divergências com evidências; limita a até dez itens fictícios e veda interpretação jurídica.

**Enquadramento proposto:** contrato de locação fictício acompanhado de um anexo de entrega/reparos, tabela de itens pactuados versus efetivamente entregues e vistoria fotográfica. A comparação objetiva de quantidade, prazo e valor é o núcleo obrigatório; a conversa por voz/câmera é o diferencial.

**Risco de aderência:** dano visível em parede não é, por si só, uma diferença de quantidade, prazo ou valor. É uma ocorrência visual complementar. Validar com um mentor se o cenário imobiliário é aceito e assegurar a demonstração das três categorias explícitas.

## 4. Entradas do sistema

1. **Contrato/termo de entrega fictício em PDF:** itens, cômodos, condições esperadas, valores e prazos; documentos escaneados devem ser tratados por análise multimodal ou revisão manual.
2. **Laudo inicial e fotos anteriores:** fotos com identificação do ambiente; se não houver cômodo identificado, usuário faz o vínculo na revisão.
3. **Tabela de entregas:** CSV ou formulário preenchido com até dez itens: descrição, cômodo, quantidade entregue, prazo/data, valor, observações e anexos. A IA pode pré-preencher sugestões, mas usuário confirma os registros.
4. **Vistoria atual:** voz, fotos capturadas, observações em texto e atualizações manuais dos itens.

**Não inventar conteúdo ausente.** Se o contrato não trouxer um prazo, valor ou quantidade, marcar como «não informado», não inferir.

## 5. Jornada principal

### 5.1 Criar vistoria
- Criar imóvel fictício e escolher «Vistoria de entrega».
- Fazer upload de contrato, laudo anterior, fotos e tabela de entregas.
- O sistema mostra resumo estruturado, cômodos e itens identificados, com a página/trecho de origem.
- Usuário corrige equívocos antes da sessão.

### 5.2 Iniciar sessão
- Abrir URL da vistoria no celular, conceder microfone e câmera.
- Escolher modo «foto mediante confirmação» como padrão; captura automática autorizada por sessão fica fora do MVP.
- IA cumprimenta: «Vamos começar pela sala? Tenho quatro itens para conferir.»
- Usuário confirma cômodo por voz ou toque; identificação automática é assistiva e não obrigatória.

### 5.3 Conferir cômodo
- A tela mostra câmera ao vivo, nome do cômodo, checklist, botão de foto e status do microfone.
- IA apresenta os itens documentados: «No laudo constam quatro tomadas. Quantas você consegue verificar?»
- Usuário responde e aponta a câmera; o sistema envia um quadro relevante para análise.
- O assistente classifica cada item como `conforme`, `possível divergência`, `não verificado` ou `inconclusivo`, sempre com base no dado de origem e no que foi efetivamente observado/confirmado.
- Ao identificar possível divergência, solicita foto, grava descrição e pede confirmação antes de marcar como revisada.

### 5.4 Capturar e organizar evidências
- A IA chama uma ação `request_photo_capture` informando cômodo, item e motivo.
- Interface exibe pedido e usuário confirma. O navegador captura um quadro na melhor resolução disponível da câmera ativa e salva a imagem original.
- O sistema armazena data, cômodo, item, observação e associação ao documento de origem; miniaturas reduzidas para análise não substituem a foto arquivada.
- Usuário pode refazer, descartar, renomear ou reassociar fotografias.

### 5.5 Revisar divergências
- Tela separa `confirmadas pelo usuário`, `sugeridas pela IA`, `conformes`, `inconclusivas` e `pendentes`.
- Cada ocorrência apresenta **esperado → registrado como entregue → observado → evidências → origem contratual**.
- Usuário pode aprovar, editar ou rejeitar a sugestão, com histórico de revisão.

### 5.6 Encerrar
- Exibir resumo por cômodo e checklist de pendências não verificadas.
- Gerar relatório HTML imprimível e PDF com evidências e fontes.
- Nunca declarar que ausência de indício visual prova inexistência de problema.

## 6. Comportamento esperado da IA

A IA atua como **assistente de vistoria**, não perito nem advogado. Tem acesso ao JSON validado da inspeção, ao cômodo ativo, aos trechos documentais com referência e aos quadros capturados. Deve:

- Conduzir checklist por cômodo, sem pular itens pendentes.
- Distinguir fato documental, observação visual e declaração verbal do usuário.
- Fazer perguntas curtas, especialmente quando imagem não basta para verificar funcionamento, medida, quantidade ou dano.
- Apontar possíveis divergências, sempre como hipótese revisável.
- Pedir aproximação ou melhor iluminação se a imagem for insuficiente.
- Recuperar a fotografia inicial quando existir para comparação contextual, sem prometer alinhamento fotográfico preciso.
- Não registrar foto sem autorização explícita da sessão e confirmação da captura no MVP.
- Não diagnosticar infiltração, defeito elétrico ou responsabilidade contratual exclusivamente por aparência.
- Quando houver conflito, explicar exatamente qual fonte fundamenta a observação.

**Exemplo de diálogo:**

> **IA:** «Na sala estão previstas quatro tomadas e o registro de entrega informa três. Você consegue confirmar a quantidade no ambiente?»
>
> **Usuário:** «Estou vendo três. Olha aqui.»
>
> **IA:** «Posso registrar uma possível divergência de quantidade: quatro previstas e três verificadas?»
>
> **Usuário:** «Pode. Tira uma foto.»
>
> **IA:** «Vou pedir a captura; confirme na tela para salvar a fotografia da sala.»

## 7. Requisitos por prioridade

| Prioridade | Funcionalidade | Critério de aceite |
|---|---|---|
| P0 | Upload de PDF, fotos e CSV | Arquivos persistidos e vinculados à vistoria |
| P0 | Extração estruturada com revisão | Cômodos/itens/valores/prazos visíveis com fonte |
| P0 | Checklist de até dez itens | Usuário pode confirmar e corrigir observações |
| P0 | Áudio bidirecional em tempo real | Usuário fala e IA responde em português |
| P0 | Câmera do celular | Preview ao vivo; envio de quadros para análise |
| P0 | Captura de foto solicitada por IA | Pedido visível, confirmação e arquivo persistido |
| P0 | Comparador de quantidade/prazo/valor | Detecta as três diferenças do caso de demonstração |
| P0 | Revisão de ocorrências | Aprovar/editar/rejeitar sem perder a fonte |
| P0 | Relatório com evidências | HTML/PDF exportável por cômodo |
| P0 | Deploy HTTPS | Funciona no celular com câmera e microfone |
| P1 | Comparação lado a lado de fotos antigas/novas | Usuário vê foto anterior e atual relacionadas |
| P1 | Detecção sugerida de cômodo | Solicita confirmação quando incerto |
| P1 | Modo sem áudio | Texto e captura manual sem perder dados |
| P2 | Captura automática previamente autorizada | Consentimento claro, indicador e controle de pausa |
| P2 | Histórico de múltiplas vistorias, multiusuário ou MCP/Dots | Fora da demonstração inicial |

## 8. Telas propostas

**Tela A — Preparação (desktop):** uploads, identificação do imóvel, resumo dos cômodos, tabela de itens, documentos de origem e botão «Iniciar vistoria».

**Tela B — Inspeção (mobile):** câmera ocupando a maior área; faixa inferior com estado do microfone e transcrição; cabeçalho com cômodo/itens concluídos; botão «Fotografar» e menu «Próximo item»; cartão discreto com o item atual e trecho esperado.

**Tela C — Ocorrência:** comparação textual lado a lado, fotos, origem da informação, texto de observação, status `sugerida / confirmada / rejeitada` e ações de revisão.

**Tela D — Relatório:** índice por cômodo, três divergências, fotografias, informações não verificadas e exportação.

## 9. Caso de demonstração — dados fictícios

**Imóvel:** Apartamento Aurora 302. **Cômodos:** sala, cozinha, quarto e banheiro. **Data da inspeção simulada:** 23/10/2026.

| Tipo exigido | Contratado | Entrega/observação | Evidência esperada |
|---|---|---|---|
| Quantidade | Sala: 4 tomadas funcionais | Registro de entrega: 3; usuário confirma que viu 3 | Cláusula/linha de contrato + tabela + foto da parede |
| Prazo | Cozinha: reparo de torneira até 20/10/2026 | Tabela marca pendente em 23/10; usuário relata vazamento | Anexo com data + status + foto da torneira |
| Valor | Banheiro: instalação de acessório orçada em R$ 180 | Comprovante fictício/tabela registra R$ 260 | Contrato + registro do valor entregue |

**Diferencial visual adicional:** usuário mostra uma mancha na parede da sala que não aparece na descrição inicial. O agente marca «possível alteração visual — requer revisão», captura evidência quando autorizado e não confunde essa ocorrência com as três divergências quantitativas do desafio.

**Nota de qualidade:** nenhuma foto isolada comprova funcionamento de tomada, causa de vazamento ou valor cobrado. Essas informações dependem de documentos e/ou confirmação humana.

## 10. Arquitetura técnica proposta

- **Interface:** Next.js, React, TypeScript, Tailwind e componentes de UI acessíveis.
- **Áudio:** OpenAI Realtime via WebRTC para interação natural; conexão estabelecida com apoio do backend, sem expor API key permanente no navegador.
- **Visão:** obter câmera via `getUserMedia`; enviar quadros JPEG/PNG seletivos como `input_image` à sessão Realtime. **Não enviar vídeo contínuo como modalidade nativa**, pois o modelo disponibiliza entrada por imagem, não por stream de vídeo.
- **Importação de documentos:** Responses API com entrada de PDFs multimodais, extraindo texto e imagens de páginas; gerar JSON validado e conservar fontes documentais.
- **Orquestração:** ferramentas do agente para consultar cômodo, consultar obrigações, pedir foto, sugerir ocorrência, atualizar checklist e criar relatório. Backend valida parâmetros, permissões e persistência.
- **Dados:** Postgres/Supabase ou solução persistente equivalente; armazenamento privado de PDFs e imagens com URLs temporárias; arquivos fora de `/public`.
- **Relatório:** HTML de impressão e PDF; sem editor documental avançado.
- **Custo:** processar documento uma vez, manter contexto estruturado por sessão, enviar imagens somente em eventos significativos ou frequência limitada, definir limites de uso.

### Ações do agente

- `get_current_room_context(roomId)`
- `list_pending_checks(roomId)`
- `request_photo_capture(roomId, itemId, reason)`
- `propose_discrepancy(itemId, expected, observed, evidenceIds, sourceIds)`
- `mark_check_reviewed(itemId, decision, note)` — apenas após autorização do usuário
- `complete_room(roomId)`
- `generate_inspection_report(inspectionId)` — ao solicitar encerramento

Ferramentas executam no aplicativo, não diretamente pelo modelo; validação humana nas mutações relevantes.

## 11. Modelo de informação mínimo

- **Inspection:** id, imóvel fictício, tipo, data, status.
- **SourceDocument:** id, tipo, arquivo, versão, páginas.
- **Room:** id, inspectionId, nome, ordem, status.
- **ExpectedItem:** id, roomId, descrição, quantidade, prazo, valor, condição esperada, fonte documental.
- **DeliveryItem:** id, expectedItemId, quantidade, prazo/data de conclusão, valor, observação, anexo.
- **Observation:** id, itemId, descrição, tipo, situação, `source` (foto/voz/manual/documento), revisadoPor.
- **Evidence:** id, roomId, observationId, arquivo original, miniatura, data, descrição.
- **SessionEvent:** id, inspectionId, tipo, timestamp, conteúdo resumido.

As comparações numéricas e de datas devem ser determinísticas; o modelo apenas sugere vínculos e interpreta o contexto.

## 12. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Voz/câmera falha no celular | Testar dispositivo-alvo e HTTPS antes de construir todo o app; oferecer modo texto/foto manual |
| IA interpreta um dano incorretamente | Usar «possível divergência», confirmação e foto como evidência; não dar diagnóstico |
| Muitas imagens deixam conversa lenta/cara | Enviar quadros reduzidos e apenas quando necessários; fotos originais salvas separadamente |
| Modelo perde contexto do cômodo | Estado persistente no backend e chamada de ferramenta para recuperar checklist |
| Foto sem contexto | Exigir vínculo com cômodo/item e permitir revisão |
| Desafio não aceita cenário imobiliário | Validar enquadramento com mentor e demonstrar contrato + tabela + três diferenças objetivas |
| PDFs contêm informações sensíveis | Usar apenas dados fictícios na demo, controle de acesso e exclusão de arquivos |
| Captura inesperada | Consentimento explícito, indicador de câmera ativa e confirmação por foto |

## 13. Demonstração em até três minutos

1. **0:00–0:30 — Contexto:** mostrar contrato, tabela de entregas, fotos anteriores e extração em cômodos.
2. **0:30–1:15 — Conversa:** abrir câmera do celular e IA orientar a verificação da sala.
3. **1:15–2:05 — Momento memorável:** usuário aponta um problema, responde a uma pergunta, autoriza a foto e vê a ocorrência aparecer imediatamente.
4. **2:05–2:40 — Aderência:** abrir três divergências de quantidade, prazo e valor com suas evidências, aprovando uma delas.
5. **2:40–3:00 — Entrega:** abrir relatório final, mostrar fotografias e origem documental, exportar PDF.

Para a apresentação ao vivo, deixar uma sessão com dados já importados e revisados, mas manter a importação operacional e demonstrável.

## 14. Critérios de validação da equipe (go/no-go)

**Viabilidade:** a câmera abre no celular; há áudio bidirecional; um quadro realmente chega ao modelo; o comando de captura gera arquivo válido; a ferramenta registra a ocorrência.

**Aderência:** contrato e tabela são fontes distintas; três divergências (quantidade, prazo, valor) calculadas e demonstráveis; revisão manual e evidência em cada uma; sem análise jurídica.

**Confiabilidade:** a IA não inventa cláusulas; recupera a fonte de cada afirmação; usuário consegue corrigir extração; exportação espelha dados revisados; um erro de rede não apaga a inspeção.

**Apresentação:** demo cabe em três minutos; pelo menos uma evidência nova é capturada durante a demonstração; interface está legível em desktop e celular.

**Decisão de produto a validar com a equipe e mentores:**

1. O foco será vistoria de **entrada/entrega** com contrato e anexo de reparos (recomendado), não análise de responsabilidade por danos.
2. A primeira versão trabalha com **um imóvel fictício e até dez itens**, sem multiusuário.
3. Câmera/voz serão o diferencial; a **conferência estruturada** de quantidade, prazo e valor é obrigatória.
4. Fotografias devem exigir confirmação; captura totalmente automática fica para evolução futura.
5. Se o cenário imobiliário não for aceito, preservar a mesma arquitetura e reenquadrar como conferência de entregas de serviços/manutenção, usando a vistoria como coleta de evidências.

## 15. Fora do MVP

Não incluir reconhecimento contínuo e infalível de defeitos, filmagem integral armazenada, laudo pericial, aconselhamento jurídico, assinatura digital, leitura de sensores, mapa 3D, medição automática de dimensões, gestão de múltiplas imobiliárias ou faturamento.

---

**Síntese:** o produto deve ser lembrado pela frase «Eu mostro o imóvel, a IA sabe o que estava previsto, pergunta o que falta e registra as evidências», enquanto prova objetivamente os critérios do desafio 8.
