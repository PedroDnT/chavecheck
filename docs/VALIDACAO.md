# Validação da prova de conceito

Este documento é um histórico de ensaios, organizado da atualização mais recente para as anteriores. Menções a outros modelos, quatro itens ou quadros periódicos nas seções antigas descrevem versões anteriores. Consulte a [visão do projeto](VISAO-DO-PROJETO.md) para a matriz de capacidades atuais e planejadas.

## Cache de referências na Vercel — 23/10/2026

Com `VERCEL=1`, o inventário é gravado em `chavecheck/visual-baselines/` no diretório temporário do sistema, sem tentar escrever no diretório da aplicação. A execução local mantém `.data/visual-baselines/`; `cacheDir` explícito e a opção de desabilitar o disco com `null` continuam prevalecendo. O cache em memória permanece ativo.

Validação desta correção: 165 testes automatizados e TypeScript aprovados; Next.js sem erros de compilação, configuração ou execução no navegador local. O novo controle usa provedor simulado e escrita real em diretórios isolados: confirma o destino temporário na Vercel, o destino local, o override, o modo somente em memória e a reutilização do inventário por outra instância do serviço. Nenhuma chamada à IA foi realizada nesta verificação.

O cache temporário pode desaparecer e não é compartilhado entre instâncias da Vercel; nesse caso, as referências serão analisadas novamente. Os inventários já vinculados às análises permanecem nos respectivos registros do navegador. Esta verificação local não comprova uma análise real na Vercel.

## Cenário rápido: parede e canaleta — 23/10/2026

O atalho **Testar parede e canaleta** abre diretamente duas verificações: acabamento de cimento queimado e tampa/fios aparentes da canaleta. O exemplo anterior de quatro itens é arquivado antes da substituição. Fotos, análises e revisões do exemplo anterior continuam preservadas.

A comparação atual usa `gpt-6-luna` com esforço `none` e saída mais curta. Os inventários anteriores mantêm `medium`, são preparados em segundo plano e reutilizados do cache. A foto original continua salva; somente a cópia enviada pode ser reduzida. A sessão `gpt-live-1` permanece disponível durante a análise, sem silenciar áudio ou microfone. O resultado resumido segue em fragmentos com confirmações em paralelo.

Controles desta alteração:

- 160 testes automatizados passaram; TypeScript e compilação de produção aprovados. Incluem referências em paralelo, reutilização do cache, uma única chamada ao modelo na comparação com referências prontas, entrega de todos os fragmentos e ocultação de resultado antigo enquanto uma nova foto está em análise ou falhou.
- Comparação real com GPT-6 Luna: HTTP 200 em **6,702 segundos**, usando câmera sintética e referências já preparadas. A imagem sintética corretamente não aprovou o acabamento; retornou inconclusivo. Esse tempo é uma medição isolada da requisição, não um prazo garantido nem uma medição em celular/rede móvel.
- Durante uma segunda análise com resposta simulada e atraso controlado de 25 segundos, uma pergunta digitada recebeu resposta da voz real antes do fim da espera: a assistente informou que a canaleta viria depois da parede e que a foto ainda estava em análise. O canal permaneceu aberto, sem erro da API.
- O percurso com resultados simulados confirmou parede → canaleta → verificação concluída → relatório com dois itens. Ao abrir o relatório, o serviço confirmou `session.closed` e o canal fechou. O diagnóstico do Next.js não encontrou erros de configuração ou execução.
- Migração verificada em armazenamento isolado: o cenário conhecido de quatro itens e três fotos foi preservado em `previous`; o cenário atual abriu com dois itens pendentes e nenhuma foto atual reaproveitada indevidamente.

Os testes com imagem sintética e resultado simulado verificam integração e continuidade; não medem precisão na detecção de defeitos. O teste presencial pelo ngrok continua necessário para conferir o aparelho, a rede e a qualidade das fotos.

## Verificação guiada por fotos manuais — 23/10/2026

A tela passou a oferecer um único início: habilitar câmera e começar a voz. A câmera mostra somente uma prévia local; não existe mais envio periódico de quadros. A conversa orienta cada captura e o avanço depende da revisão humana. Requisitos, referências, comparação detalhada e evidências permanecem acessíveis em seções recolhidas.

Validação desta alteração:

- 152 testes automatizados aprovados; TypeScript e compilação de produção aprovados.
- No navegador Chromium, um clique ativou a câmera sintética e conectou a sessão real `gpt-live-1`, que apresentou a assistente e pediu o enquadramento do item ativo. Nenhuma chamada de análise de foto ocorreu antes do toque de captura.
- Negar a câmera não iniciou o microfone e manteve o botão disponível para tentar novamente.
- O percurso com resultados visuais simulados cobriu: foto insuficiente sem confirmação, nova captura, falha de rede com foto preservada, reenvio do mesmo identificador, confirmação e troca de item, divergência confirmada, revisão manual inconclusiva e conclusão do último item.
- Uma nova foto de item revisado reabriu a revisão, mantendo o histórico. A conclusão exibiu dois conformes, uma divergência e um inconclusivo, sem converter esses resultados em aprovação geral.
- A voz real anunciou o encerramento e orientou a abertura do relatório. O serviço confirmou `session.closed` e o canal WebRTC fechou sem erro de API.
- A conversa atualiza apenas sua área de rolagem, preservando o enquadramento no celular. A câmera e a conversa permanecem na mesma página. Telas de 320, 390, 820 e 1280 px foram verificadas sem transbordamento; o botão inicial permaneceu dentro da prévia. Auditoria axe-core WCAG 2 A/AA da tela inicial: zero violações e zero verificações incompletas.

As respostas de comparação usadas no percurso acima foram simuladas exclusivamente para testar a interface; não medem precisão visual. Câmera e microfone de entrada também foram sintéticos. Permissões, reprodução de som e câmera em aparelho físico, especialmente Safari/iOS pelo ngrok, ainda precisam de conferência presencial. O app oferece reativação explícita do som se o navegador bloquear a reprodução automática.

## GPT-6 Luna nas análises e no texto — 23/10/2026

A configuração ativa passou a usar `gpt-6-luna` no inventário das fotos de referência, na comparação visual, no chat, na extração textual do roteiro e no backend de ferramentas da voz. `gpt-live-1` continua responsável pelo áudio. Defaults, `.env.example` e os overrides locais foram atualizados. Não havia GPT-5.5 ativo.

A comparação e o inventário preservam esforço `medium`. Chat, extração e backend Live usam `none`, preservando o esforço efetivo anterior do GPT-5.4 mini e o orçamento de respostas curtas. As capacidades foram conferidas na [documentação do GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) e na [configuração do backend Live](https://developers.openai.com/api/docs/guides/live-delegation#responses-delegation).

Validação concluída:

- 135 testes aprovados, incluindo modelo/raciocínio nas rotas de chat, extração, Live, inventário e comparação; TypeScript e compilação de produção aprovados.
- Chamada real de inventário da `foto-002`: retornou cinco observações, JSON validado e modelo registrado `gpt-6-luna`.
- Extração real de um roteiro de controle: separou parede e tomadas, preservando quatro tomadas previstas e três entregues; valores ausentes continuaram nulos.
- Chat real respondeu com uma orientação de captura, sem inventar uma análise atual.
- Sessão WebRTC real manteve GPT-Live na voz. Os eventos do backend confirmaram `gpt-6-luna`, quatro respostas concluídas e consulta ao contexto da vistoria, sem erro de API. Entrada de áudio silenciosa e sintética.
- Next.js sem erros de configuração, execução ou compilação.

Análises antigas mantêm o modelo original. O cache existente já separa inventários por modelo, hash e versão; novos inventários Luna não substituem os registros GPT-5.4. Sessões de voz já abertas precisam ser reiniciadas. Os testes confirmam integração e contratos de saída; não medem a acurácia do Luna em defeitos reais nem substituem a validação presencial. Os ensaios abaixo preservam os modelos usados na ocasião.


## Migração para GPT-Live-1 — 23/10/2026

A interface de voz passou a usar `/api/live` com `gpt-live-1` e voz `bossa`. A rota anterior permanece disponível para compatibilidade. O chat e o backend de ferramentas mantêm GPT-5.4 mini; a comparação visual registrada mantém GPT-5.4. A implementação segue o protocolo Live, incluindo criação JSON com transporte WebRTC, espera de `session.started`, transcrições contínuas, eventos Responses delegados e fechamento confirmado.

Verificado nesta atualização:

- 135 testes automatizados aprovados; TypeScript e compilação de produção aprovados.
- Next.js sem erros de compilação, configuração ou execução no encerramento do teste.
- `/api/health`, tanto local quanto pelo ngrok configurado, retornou `gpt-live-1` e configuração presente, sem expor credencial.
- Conexão real OpenAI confirmou `gpt-live-1` e voz Bossa. A entrada de microfone foi silenciosa e sintética; a saída real teve áudio remoto e transcrição em português.
- O backend consultou `get_inspection_context` antes de orientar a captura. A troca de paredes para canaleta foi acompanhada por nova consulta e orientação do item selecionado, sem aprovação automática.
- Uma referência original reenviada como foto atual acionou a proteção já existente: resultado inconclusivo, exigindo uma nova captura. A voz relatou esse mesmo resultado e a próxima ação após receber os cinco fragmentos do registro; todos foram confirmados individualmente antes da solicitação de narração. Os dez appends dessa sessão, incluindo controle de roteiro e saudação, receberam seus respectivos ACKs; o maior teve 500 bytes.
- Uma mensagem digitada chegou ao backend e produziu orientação de aproximação da canaleta. Essa rodada não comprovou a chamada de `request_photo_capture`; a chamada efetivamente observada foi `get_inspection_context`.
- Ao voltar para a lista de cômodos, a voz foi silenciada e `session.closed` foi recebido antes do fechamento local do canal. A árvore React confirmou a saída de `InspectionApp` para `InspectionRooms`.
- Registro sanitizado do controle: `output/playwright/gpt-live-protocol.json`. Não contém chave, SDP, áudio ou imagens.

O teste inicial identificou uma saudação que confundia condição esperada com análise concluída. O contexto agora informa explicitamente a ausência de análise, e a orientação inicial depende da consulta ao backend. A repetição do controle não reproduziu essa afirmação. Também foram corrigidos o envio concorrente de comandos, continuações que reutilizam a mesma delegação, a correlação de respostas atrasadas com a revisão original, mensagens digitadas durante uma atualização e o encerramento ao sair do cômodo. Os controles não demonstram ausência absoluta de erros do modelo.

As confirmações de protocolo comprovam recebimento de contexto, não reprodução integral da fala. O teste presencial com fala humana, interrupções, câmera e alto-falante do celular continua separado; não foi usado áudio privado do usuário nesta validação.


Data: 23/10/2026. Ambiente local, Next.js 16.4.0, Chrome automatizado e dados fictícios. Os resultados estão separados por atualização. Os testes de mídia anteriores usaram câmera sintética e microfone silencioso; não representam uma vistoria de imóvel real.

## Atualização: captura imediata e comparação rastreável

O botão **Fotografar e analisar** substitui o fluxo separado de analisar e salvar. A captura é preservada antes da chamada de análise, fica vinculada ao item e pode ser reenviada após falha. **Orientação ao vivo** usa quadros temporários para conduzir o enquadramento; eles não produzem conclusões registradas.

As fotos anteriores passam a ter inventário próprio com regiões, marcas visíveis, acabamento, objetos, aparência de luz/cor, nitidez e limitações. O registro da comparação inclui requisito e fonte, referência e observação utilizadas, região da captura atual, estado anterior, estado observado, justificativa e próxima ação. O registro completo, os hashes, o modelo e a versão são preservados. Essas ligações tornam a decisão auditável, mas não demonstram por si mesmas precisão de detecção.

Verificações concluídas nesta atualização:

- **87 testes automatizados passaram**, incluindo decisões vinculadas à captura, fonte alterada, preservação da revisão humana, referências inválidas, qualidade insuficiente, pendências funcionais, recuperação de interrupção, comparação cumulativa e limites do contexto de voz.
- Compilação de produção e TypeScript aprovados; diagnóstico final do Next.js sem erros de configuração, execução ou compilação.
- Inventários reais das duas referências gerados e guardados. A partir da versão 2, o inventário passou a registrar a pequena marca clara no móvel da foto 001 e evita importar objetos mencionados no texto do prompt que não estejam naquela imagem.
- Captura sintética de 1920 × 1080 pelo botão: foto preservada antes do envio, cancelamento com opção de reanálise e reenvio da mesma evidência, sem criar outra foto. Resultado inconclusivo porque a parede não estava visível; nenhum item aprovado automaticamente.
- WebRTC real com microfone sintético silencioso: a conversa recebeu o resultado registrado, confirmou o recebimento antes da solicitação de resposta e concluiu a orientação falada. A captura limpou o áudio anterior. Confirmar a revisão inconclusiva avançou para a canaleta e manteve os demais itens pendentes.
- Nome editado no upload preservado. Quatro fotos, quatro análises, dois inventários atuais e uma revisão humana vinculada à análise foram restaurados após recarregar a sessão isolada.
- Relatório exibe revisões vinculadas, análises anteriores, fonte e evidências. Versões antigas do inventário permanecem no retrato de cada análise; a lista atual mostra uma versão por referência.
- Tela e relatório a 390 px sem transbordamento horizontal. Axe no relatório expandido: zero violações e zero verificações incompletas. Na tela de câmera: zero violações, duas verificações manuais pendentes (contraste sobre vídeo e legenda de vídeo); prévia da câmera é sem áudio.
- Serviço de saúde acessível pelo endereço ngrok configurado. O navegador do usuário e suas evidências foram preservados; todos os controles ocorreram em sessão de QA separada.

**Limite observado no primeiro controle visual:** o comparador com GPT-5.4-mini não reconheceu de forma consistente o mesmo trecho ao receber o mesmo arquivo da referência como imagem atual. Isso não foi contabilizado como acerto de visão. Foi acrescentada uma verificação determinística de SHA-256: a cópia exata de uma referência recebe a mensagem de que não existe captura nova, sem chamar o comparador nem inventar uma diferença. A interface mostra a referência que corresponde ao hash. Essa proteção não identifica cópias redimensionadas ou reencodificadas e não prova precisão visual em novas imagens. O modelo visual passou a ser GPT-5.4 com raciocínio médio, separado do modelo de texto.

### Controle de correspondência e continuidade com GPT-5.4

As imagens fornecidas foram exibidas em câmera virtual, em 1448 × 1086, e capturadas pelo botão real da interface. O caminho normal de captura gerou novos arquivos JPEG; não houve mudança simulada no cômodo.

- A primeira captura, mostrando a vista da janela, produziu quatro achados sem mudança, vinculados à foto 002. A análise manteve a verificação inconclusiva e pediu a vista do ar-condicionado, ainda ausente. Essa rodada levou 74 segundos, incluindo a preparação de um inventário.
- A captura seguinte mostrou a vista do ar-condicionado. A comparação v4 recebeu também a captura útil da janela, com identificador e hash próprios. Retornou em 52,6 segundos, com seis achados: dois ligados à captura atual/foto 001 e quatro ligados à captura anterior da vistoria/foto 002. Todos tinham regiões nas duas imagens.
- A sugestão foi **Conforme nas áreas visíveis cobertas pelo conjunto**, sem pendências visuais e sem pedir novamente as duas vistas. O status confirmado do item permaneceu inconclusivo, como na revisão humana anterior; não houve aprovação automática.
- A interface exibiu a foto e o horário corretos em cada achado, distinguindo **Referência anterior**, **Captura atual** e **Captura anterior desta vistoria**. Capturas com identificador desconhecido não são substituídas silenciosamente pela imagem atual.
- Após recarregar, seis fotos, seis análises, dois inventários atuais e a revisão humana anterior foram restaurados; as duas fotos usadas na comparação conjunta continuaram disponíveis e vinculadas.
- O conjunto usa até duas capturas anteriores úteis do mesmo item e requisito; apoios de outra fonte/condição, cópias exatas de referências, imagens inutilizáveis e IDs indevidos são rejeitados ou excluídos. Reanálises preservam os apoios do envio original.
- A comparação expandida a 390 px permaneceu dentro da largura da tela. Capturas do controle: `output/playwright/comparacao-cumulativa-desktop.png` e `output/playwright/comparacao-cumulativa-mobile.png`.

Esses controles confirmam correspondência neste par de imagens e continuidade entre capturas. Não são uma medida estatística de acurácia nem teste de mudança de luz ou dano real. O tempo de processamento varia; o envio imediato da foto não significa resultado instantâneo.

Os controles foram de integração, conservação de evidência e comportamento diante de entrada insuficiente. Não foi medida a acurácia de identificação de danos, mudanças de luz ou correspondência entre novos ângulos do cômodo. Isso continua sendo objeto do teste presencial abaixo.

Critérios para a validação presencial:

1. Enquadrar um detalhe e tocar **Fotografar e analisar**: verificar envio imediato e foto preservada, sem esperar o intervalo da orientação ao vivo.
2. Comparar a mesma região sob iluminação diferente: verificar se a justificativa separa luz, textura e mudança material; nenhuma porcentagem de certeza deve ser inventada.
3. Fotografar com contraluz, desfoco ou região errada: receber orientação específica e resultado inconclusivo quando não houver suporte suficiente.
4. Abrir **Ver imagens e fundamento da comparação**: conferir fonte, regiões e descrições diretamente nas imagens, inclusive marcas preexistentes.
5. Cancelar ou interromper uma análise: manter a foto e conseguir reenviá-la sem perder o vínculo original.
6. Confirmar uma revisão: mudar para o próximo item pendente, sem aprovação automática e sem conclusões novas atribuídas à voz.

## Cenário do cômodo com referências anteriores

O exemplo **Sala de referência** usa `foto-001.jpeg` e `foto-002.jpeg`, mantidas em `assets/reference-room/`, e apresenta quatro verificações inicialmente pendentes: paredes/cimento queimado, canaleta inferior, ar-condicionado e mobiliário. A condição de bom estado foi declarada pelo usuário. Nenhum preço, prazo ou quantidade contratada é presumido.

As imagens são referências de um cenário fictício; não são capturas da vistoria atual nem aprovam itens automaticamente. A interface e o relatório as apresentam separadas das evidências atuais. O contexto da conversa identifica referência e imagem atual e orienta a pedir novos enquadramentos ou aproximações antes de sugerir uma conclusão.

Limites específicos: a textura do cimento queimado não é dano por si só; o furo circular da mesa é passagem para cabos; partes da canaleta e dos móveis estão ocultas; marcas já presentes devem ser comparadas; funcionamento e refrigeração do ar-condicionado exigem confirmação humana. A faixa escura junto à canaleta da foto 001, isoladamente, não determina integridade ou avaria.

Para validar presencialmente, carregar o exemplo, mostrar cada item no cenário atual, seguir as aproximações da canaleta e de possíveis diferenças, usar **Fotografar e analisar** e revisar as sugestões. A aprovação final continua humana. A existência desta funcionalidade não comprova precisão de detecção de defeitos; o teste com o cômodo atual permanece pendente.

## Histórico: atualização inicial com as duas fotos

- 37 testes automatizados passaram; TypeScript e compilação de produção aprovados.
- Next.js sem erros de compilação ou execução ao final.
- Sessão Realtime real recebeu as duas referências antes da saudação: mensagens de 50.811 e 47.429 bytes, ambas aceitas, em canal com limite negociado de 262.144 bytes. As cópias de transporte são reduzidas; os originais permanecem inalterados.
- Resposta Realtime concluída sem quadro atual: pediu a imagem atual, sem aprovar a condição da sala.
- Câmera sintética atual: reconheceu o padrão verde sem parede visível, declarou a comparação inconclusiva e pediu outro enquadramento. Não marcou nenhum item como aprovado.
- Chat por texto real com referências e histórico respondeu pela interface. Corrigida a serialização do histórico para enviar apenas papel e texto.
- Ao carregar novamente o exemplo, a sessão nova ficou com quatro itens pendentes, zero evidências e zero mensagens. A sessão anterior com quatro mensagens permaneceu arquivada para exportação.
- O cenário foi ativado no navegador do usuário e persistiu após recarregar a página.
- Fotos originais carregadas com 1448 px; ampliação em diálogo e fechamento por Escape conferidos; referências separadas no relatório.
- Celular emulado de 390 px sem transbordamento horizontal. Auditoria automática axe: zero violações e zero verificações incompletas no estado inspecionado.
- Captura da interface pronta: `output/playwright/sala-referencia-desktop.png`.

Os testes de mídia dessa atualização usaram microfone silencioso e câmera sintética. A inspeção presencial do cômodo diferente será feita pelo usuário; não foi simulada uma conclusão sobre esse ambiente.

## Verificações concluídas na validação inicial

| Verificação | Resultado |
| --- | --- |
| Testes automatizados | 26 passaram, 0 falharam. |
| Compilação de produção e TypeScript | Aprovados. |
| Diagnóstico do Next.js | Nenhum erro de configuração, execução ou compilação. |
| Extração real pela OpenAI | Sala, 4 tomadas previstas, 3 entregues; preço e datas ausentes nulos; fonte literal. |
| Organização pela interface | Entrada textual resultou em um item revisável e preservação do texto original. |
| Chat real por texto | Resposta em português fundamentada no roteiro fictício. |
| Realtime/WebRTC real | Conexão estabelecida; resposta com transcrição de áudio, `response.done: completed` e término do áudio. |
| Imagem enviada à sessão Realtime | Modelo identificou o padrão verde sintético e informou que não permitia contar tomadas. Sem erro de API. |
| Ferramentas Realtime reais | `propose_observation` criou uma sugestão revisável; `request_photo_capture` exibiu pedido, sem capturar automaticamente. |
| Captura confirmada | Imagem original de 1920 px salva e exibida no relatório. |
| Revisão manual e persistência | Status, observação e foto permaneceram após recarregar a página. |
| Relatório | Ambientes, dados esperados/entregues, observação, fonte e evidência presentes; PDF gerado pelo navegador. |
| Celular emulado | Largura de 390 px sem transbordamento horizontal; navegação em abas. |
| Acessibilidade automática | Zero violações nos estados finais inspecionados de conversa e preparação. Não equivale a auditoria completa WCAG. |
| Proteção da chave | Arquivo `.env.local` com permissão 600; chave ausente dos 10 arquivos JavaScript de produção enviados ao navegador. |

## Casos cobertos pelos testes automatizados

- Três diferenças objetivas do exemplo e ausência de aprovação automática.
- Valores desconhecidos, prazo inclusivo e datas de conclusão.
- Limite de 32 caracteres dos IDs de mensagens Realtime.
- Transcrição por fragmentos, substituição pelo texto final e ordem da conversa.
- Ferramentas permitidas, argumentos inválidos e rejeição de parâmetros de aprovação/captura.
- Origem, host local, tamanho real do corpo, JSON, frequência e datas impossíveis.
- Contratos das rotas, multipart SDP, fonte inexistente e ausência de vazamento de erro do provedor.

Os testes específicos de `tests/room-scenario.test.ts` verificam o estado inicial dos quatro itens, a ausência de diferenças numéricas inventadas, a separação de referências e evidências no contexto e a independência de uma nova vistoria. Esses testes de dados não substituem a validação por câmera no cômodo atual.

## Correções encontradas em teste real

- O Next normaliza a URL interna para localhost. A verificação de origem foi corrigida para usar o Host local validado e a porta exata.
- A API limita `item.id` a 32 caracteres. A geração foi corrigida e passou a aguardar a confirmação de recebimento antes de pedir uma resposta, evitando resposta ao contexto anterior quando uma entrada é recusada.
- Importação cancelada ao sair da preparação, para impedir que um retorno tardio substitua uma vistoria em andamento.
- Histórico limitado sem ressuscitar mensagens antigas; câmera encerrada quando a inicialização da prévia falha.
- Nomes acessíveis adicionados aos botões de navegação no celular e foco por teclado à área de conversa.

## Ainda não verificado

- Microfone físico, fala humana bidirecional, alto-falante físico e câmera de celular real.
- Safari/iOS, Android físico, interrupções de chamadas e redes móveis.
- Publicação de produção, certificado verificado no aparelho físico, armazenamento em nuvem e uso multiusuário.
- Vistoria real ou desempenho de detecção de defeitos.
- Comparação presencial do cenário atual com as duas referências do cômodo, incluindo diferenças reais e condições de iluminação distintas.

Os arquivos em `output/playwright/` são capturas e relatório de teste, com evidência sintética identificada. Não são um laudo de imóvel.

## Histórico: preparação da publicação anterior para o repositório público

Em 23/10/2026, a cópia desta versão foi verificada em diretório isolado, sem `.env.local`:

- 40 testes automatizados passaram, sem chamadas pagas à OpenAI.
- Compilação de produção e verificação TypeScript aprovadas.
- Configuração de exemplo com `OPENAI_API_KEY` vazio; arquivos de ambiente reais, certificados, dependências e resultados locais excluídos.
- Domínio do túnel de desenvolvimento substituído por exemplo fictício no README e nos testes.
- A credencial local foi comparada com todos os arquivos selecionados e com os arquivos estáticos gerados para o navegador, sem correspondências.
- Varredura Gitleaks sobre a cópia de publicação sem segredos detectados.

Naquela publicação, as melhorias de envio imediato de foto e análise visual rastreável ainda estavam em desenvolvimento separado. As verificações acima pertencem à versão anterior; as atualizações posteriores estão registradas nas demais seções deste documento.
