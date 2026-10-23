# ChaveCheck

Prova de conceito do projeto **Vistoria Viva**, feita com Next.js, React e TypeScript. Recebe até dez verificações e conduz uma vistoria por conversa, voz e quadros de câmera, com revisão humana e relatório.

## Executar

Requer Node.js 22 ou superior.

```sh
npm ci
cp .env.example .env.local
# Preencha OPENAI_API_KEY em .env.local antes de iniciar.
npm run dev
```

Abra **http://127.0.0.1:3100**. Configure sua própria chave em `OPENAI_API_KEY` no arquivo `.env.local`, ignorado pelo Git. O repositório inclui somente `.env.example`, com o campo da chave vazio. Em hospedagem, configure as variáveis no servidor. A chave permanente nunca é enviada ao navegador. Não versione arquivos de ambiente, certificados ou credenciais.

```sh
npm test
npm run typecheck
npm run build
npm start
```

## Experimentar

1. Em um navegador novo, clique em **Enviar PDF da vistoria**. O arquivo deve ser um PDF válido de até 25 MiB. O original é preservado no navegador com sua assinatura SHA-256 e pode ser baixado em **Ver documento**. A animação de scanner dura cinco segundos e abre os cômodos automaticamente.
2. O mapeamento do PDF ainda é simulado: todo envio usa **Sala de referência**, montada a partir de `foto-001.jpeg` e `foto-002.jpeg`, com quatro verificações (paredes, canaleta inferior, ar-condicionado e mobiliário). Todos os itens começam como **Não verificado**, sem evidências atuais ou revisões. Cada cômodo tem **Começar**, **Continuar** ou **Revisar**; continuar abre o primeiro item pendente. A sessão salva é recuperada ao reabrir o app. Um novo envio preserva uma cópia da sessão anterior antes de substituí-la.
3. Em **Vistoria ao vivo**, ative a câmera. A prévia permanece privada até clicar em **Fotografar e analisar** ou autorizar **Orientação ao vivo** durante a conversa por voz.
4. Inicie a conversa por voz e permita o microfone. Também é possível conversar por texto sem microfone. A assistente usa o roteiro e o item ativo para orientar posição, proximidade e detalhe. Neste exemplo, recebe as duas fotos identificadas como referências anteriores; abrir o exemplo não verifica o cômodo.
5. **Fotografar e analisar**, inclusive o botão circular da câmera, salva a captura e envia imediatamente para comparação. Não é preciso esperar dez segundos. A fala anterior é interrompida enquanto a foto é analisada. Para uma imagem do aparelho, use **Anexar foto**, confira o item e toque em **Enviar e analisar**.
6. O resultado mostra a conclusão sugerida e a próxima ação. Abra **Ver imagens e fundamento da comparação** para ver a condição esperada, a fonte, as regiões da referência e da foto atual, o que foi observado antes e agora, a justificativa e os pontos ainda não verificados. Se houver falha, a captura fica disponível em **Reanalisar esta foto**.
7. **Orientação ao vivo** envia no máximo um quadro reduzido a cada dez segundos, com pausas durante a fala, a análise e quando a aba está oculta. Esses quadros orientam o enquadramento; somente a captura salva produz uma análise registrada. A assistente relata esse registro depois da confirmação de recebimento, sem criar uma segunda conclusão visual.
8. **Confirmar e continuar** registra a revisão humana e seleciona o próximo item pendente. **Registrar minha revisão** permite corrigir valores, fonte, observação e status. Sugestões da IA nunca alteram o status automaticamente.
9. Em **Relatório**, veja o comparativo entre esperado e observado e finalize a vistoria. Se houver pendências, a confirmação preserva os itens não verificados, divergentes e inconclusivos. **Baixar relatório PDF** abre a impressão do navegador: escolha “Salvar como PDF”. O bloco **Comparativo completo, fontes e evidências** reúne as referências, análises, fotos atuais e histórico, além da exportação JSON; ele é expandido para impressão.

Clique numa evidência salva para renomear. Fotos usadas em análise preservam a imagem e o vínculo original com o item; fotos antigas sem análise também podem ser reassociadas ou excluídas, com registro no histórico. Clicar numa referência ou imagem da comparação abre sua ampliação.

### Como a comparação fica rastreável

A primeira comparação extrai e registra um inventário independente das fotos anteriores: objetos, acabamento, marcas preexistentes, regiões aproximadas, iluminação aparente, nitidez e cores aparentes. Também é possível solicitar essa leitura por **Ver o que foi identificado nas fotos iniciais**. O inventário é reaproveitado enquanto o original, o modelo e a versão da extração forem os mesmos; fica no servidor em `.data/visual-baselines/`, fora do Git, e nas análises que o utilizaram.

Cada conclusão vincula o requisito e a fonte fornecidos, a captura atual, os inventários usados e os achados localizados. A aplicação valida essas ligações e torna inconclusiva uma decisão sem suporte suficiente, com enquadramento incompatível ou com partes essenciais não verificadas. A imagem original é preservada; a cópia enviada para análise e os hashes de ambas permitem identificar exatamente os arquivos usados. O registro inclui data, modelo e versão das instruções.

As estatísticas locais dos pixels e as descrições da IA ajudam a explicar uma imagem escura, clara ou pouco nítida. Não são medições de iluminação física, cor calibrada nem porcentagens de certeza. Mudança de luz isolada não comprova avaria. Quando faltar informação, a orientação deve apontar o detalhe a fotografar, em vez de repetir ressalvas genéricas.

### Referência deste cômodo

O bom estado é a **condição esperada declarada pelo usuário** para este cenário fictício. As imagens anteriores mostram somente os ângulos fotografados e não aprovam o estado da vistoria atual. A foto 001 mostra o ar-condicionado, armários/expositores e parte da canaleta; a foto 002 mostra a parede da janela, mesa branca e cadeiras pretas.

Variações do cimento queimado e o furo circular para cabos na mesa fazem parte da referência. A canaleta aparece parcialmente, com uma faixa escura que não permite concluir se há abertura ou avaria: a conversa deve pedir uma aproximação. Marcas já visíveis nos móveis devem ser distinguidas de alterações novas. O aspecto externo do ar-condicionado não comprova refrigeração ou funcionamento, que dependem de confirmação humana.

As duas imagens originais ficam em `assets/reference-room/` e são servidas por rotas locais. Elas aparecem como **Referência anterior • cenário fictício**, podem ser ampliadas e não entram na contagem de evidências atuais. Não há upload genérico de referências anteriores nesta versão.

## O que esta versão entrega

- Entrada textual estruturada por IA, com edição e fonte.
- GPT-Live via WebRTC com áudio bidirecional, voz Bossa e transcrição em português.
- Chat por texto e análise visual estruturada via Responses, também disponíveis sem áudio.
- Câmera traseira preferencial, troca de câmera e tratamento de permissões.
- Captura imediata que salva o original antes de analisar, com cópia de transporte identificada e reenvio em caso de falha.
- Cenário de um cômodo com duas fotos anteriores e quatro verificações visuais, separado das evidências atuais.
- Checklist por ambiente, sugestões revisáveis e comparação determinística.
- Inventário das referências, comparação por regiões e fundamento ligado à fonte e à imagem atual.
- Comparação acumulada com até duas capturas anteriores úteis do mesmo item, preservando qual foto sustenta cada achado.
- Persistência local em IndexedDB, incluindo fotos, texto original e conversa.
- Relatório imprimível e exportação JSON com evidências incorporadas.
- Layout para desktop e celular.

## Limites intencionais da POC

Esta versão prioriza **PDF → scanner de cinco segundos → cômodos → conversa e câmera → revisão → relatório**. O upload preserva o PDF original, mas sua extração ainda é simulada com o cenário da Sala. A comparação visual usa as duas fotos anteriores do exemplo; ainda não inclui cadastro genérico de referências antigas, extração real de PDF, armazenamento em nuvem, autenticação ou gestão de múltiplas vistorias. Os componentes legados de preparação textual continuam no código, sem acesso no novo fluxo.

Dados locais não se sincronizam entre navegadores, portas ou dispositivos. Limpar os dados do navegador apaga a sessão; exporte os registros para guardá-los. Falha de persistência é mostrada na tela. Texto, áudio, quadros compartilhados, capturas enviadas para análise e referências usadas na comparação são enviados à OpenAI. As evidências atuais e suas análises ficam no navegador; os inventários das referências também ficam no servidor local. A aplicação não grava áudio nem vídeo contínuo.

O modelo pode errar. A aparência não comprova funcionamento, causa, prazo ou valor. As diferenças numéricas vêm dos dados registrados e não substituem a conferência. A aplicação não produz laudo pericial nem conclusão jurídica.

## Celular e HTTPS

Câmera e microfone funcionam em `localhost` ou em uma origem HTTPS confiável. Para validar num celular físico, sirva a aplicação em HTTPS acessível ao aparelho e configure `APP_ORIGIN` com a origem exata. Existe `npm run dev:network` para desenvolvimento com HTTPS local, mas o certificado precisa ser confiável no celular. A publicação e o teste em dispositivo físico são etapas separadas.

Por padrão o servidor limita APIs a origens locais. `APP_ORIGIN` habilita uma origem específica. Antes de expor esta POC fora de uma rede controlada, adicione autenticação: a verificação de origem e o limite de requisições não substituem login nem impedem uso por clientes não navegadores.

### Teste com ngrok

Use a URL HTTPS fornecida pelo seu túnel; `https://chavecheck-demo.ngrok-free.app` é apenas um exemplo fictício. O túnel deve apontar para `http://127.0.0.1:3100`. `APP_ORIGIN` em `.env.local` define a origem pública exata; `next.config.ts` usa o hostname dessa variável em `allowedDevOrigins`. O acesso local com a mesma origem continua funcionando. Outros domínios de túnel não são liberados por curinga.

Se o ngrok mudar de endereço, atualize `APP_ORIGIN` e reinicie `npm run dev`. Abra o link HTTPS diretamente no navegador do celular e permita câmera e microfone. A sessão salva no endereço local é independente da sessão no domínio ngrok; um navegador novo abre o envio de PDF.

## Integração

| Rota | Função |
| --- | --- |
| `GET /api/health` | Presença de configuração e modelo; nunca retorna chave. |
| `POST /api/live` | Cria a sessão GPT-Live com transporte WebRTC e backend Responses para ferramentas e imagens. |
| `POST /api/realtime` | Integração anterior, preservada para compatibilidade; não é usada pela interface atual. |
| `POST /api/chat` | Resposta por texto com imagem opcional. |
| `POST /api/parse` | Extração de até dez itens com JSON Schema e validação. |
| `POST /api/reference-analysis` | Extrai ou recupera o inventário das duas referências permitidas. |
| `POST /api/analyze` | Compara a captura e até duas fotos complementares do mesmo item com o requisito e referências; retorna um registro estruturado ligado a cada evidência. |
| `GET /api/reference-photos/foto-001` e `GET /api/reference-photos/foto-002` | Fotos anteriores do cenário de referência; não são evidências atuais. |

As ferramentas `request_photo_capture`, `propose_observation` e `get_inspection_context` são validadas no cliente. O pedido de foto orienta o toque em **Fotografar e analisar**; não captura automaticamente. A ferramenta de observação somente recupera uma análise já registrada, sem substituir a conclusão com uma avaliação livre da voz. Não existe ferramenta para aprovar ou finalizar a revisão autonomamente.

Modelos configuráveis: `OPENAI_LIVE_MODEL` (padrão `gpt-live-1`, conversa por voz), `OPENAI_TEXT_MODEL` (`gpt-6-luna`, chat, extração e backend de ferramentas da voz, com esforço `none`) e `OPENAI_VISION_MODEL` (`gpt-6-luna`, inventário e comparação visual, com esforço `medium`). A disponibilidade depende do projeto OpenAI. `OPENAI_REALTIME_MODEL` e `OPENAI_TRANSCRIPTION_MODEL` continuam disponíveis somente para a rota anterior de compatibilidade.

O GPT-Live tem um protocolo próprio. A aplicação cria a sessão por `/v1/live/sessions`, aguarda `session.started` e transmite áudio pelo WebRTC. Referências e quadros da câmera seguem para o backend Responses; a comparação registrada continua em `/api/analyze`. A voz recebe um resumo fiel da análise em fragmentos identificados, e cada fragmento precisa ser confirmado antes de solicitar a narração. Essa confirmação indica recebimento, não prova que todo o texto foi falado. A aplicação bloqueia a reprodução anterior durante a atualização e aguarda silêncio antes de liberar a orientação atualizada. O fechamento normal aguarda `session.closed` antes de liberar o transporte.

As APIs validam tipo/tamanho de entrada, origem, datas e enums, limitam frequência e cancelam solicitações interrompidas. O limite de frequência é local ao processo e adequado à demonstração. `TRUST_PROXY=true` só deve ser usado atrás de proxy confiável.

## Referências

- [Especificação original fornecida](docs/especificacao-original.md).
- [Modelo GPT-Live-1](https://developers.openai.com/api/docs/models/gpt-live-1).
- [Live com WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live).
- [Migração para Live](https://developers.openai.com/api/docs/guides/live-migration).
- [Backend e ferramentas do Live](https://developers.openai.com/api/docs/guides/live-delegation).
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Consulte `docs/VALIDACAO.md` para o que foi efetivamente testado.

### Referência reenviada como captura atual

O mesmo arquivo de uma referência é reconhecido por SHA-256 e pede uma nova captura do ambiente, sem decisão visual. Isso evita aprovar o estado atual usando a própria foto anterior; não é um detector de cópias redimensionadas. A precisão da comparação em novas fotos e sob luz diferente ainda deve ser avaliada no teste presencial descrito em `docs/VALIDACAO.md`.

A análise visual usa GPT-6 Luna com raciocínio médio. Chat, extração e ferramentas da voz também usam GPT-6 Luna, com esforço `none` para preservar o perfil de resposta breve anterior. A voz permanece em GPT-Live-1. As capacidades e parâmetros foram conferidos na [documentação oficial do modelo](https://developers.openai.com/api/docs/models/gpt-6-luna). A comparação pode levar mais tempo que uma resposta de voz; o envio da foto continua imediato e mostra o progresso.

### Continuidade entre capturas

Cada nova foto aproveita até duas capturas anteriores úteis do mesmo item e da mesma condição/fonte. Imagens sem detalhe utilizável, cópias exatas de referências e análises de requisitos alterados não entram como apoio. A nova comparação recebe as imagens efetivas, e cada achado informa sua captura, região, referência e observação inicial. A foto principal e os apoios usados ficam identificados no relatório e na exportação. Reanalisar uma captura preserva o conjunto originalmente enviado; uma nova captura pode formar outro conjunto.

Os controles de 23/10/2026 reconheceram as duas vistas fornecidas em sequência, com sugestão de conformidade limitada às superfícies visíveis e sem repetir o pedido da vista já coberta. Foram imagens de câmera virtual, não uma inspeção física. A comparação conjunta levou aproximadamente 53 segundos com os inventários já disponíveis.

A troca de modelo não reescreve análises antigas. Novos inventários são separados pelo modelo no cache; novas capturas usam a configuração atual. Reinicie a conversa por voz para aplicar o novo backend a uma sessão já aberta.

## Organização da equipe

O repositório foi iniciado para o Hackathon OpenAI São Paulo com as frentes `feat/contract-core` (contrato, entregas, comparação e revisões) e `feat/photo-verification` (fotos e verificação visual). Esta versão acrescenta a POC funcional à branch `main`.
