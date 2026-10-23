# ChaveCheck

Prova de conceito do projeto **Vistoria Viva**, feita com Next.js, React e TypeScript. Recebe até dez verificações e conduz uma vistoria por conversa, voz e fotos manuais, com revisão humana e relatório.

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

1. Para começar sem documento, clique em **Testar parede e canaleta**. O atalho abre o cenário simples com duas verificações: acabamento de cimento queimado da parede e tampa, continuidade e fios aparentes na canaleta inferior. As referências anteriores são `foto-001.jpeg` e `foto-002.jpeg`.
2. **Enviar PDF da vistoria** continua disponível para PDFs válidos de até 25 MiB. O original é preservado no navegador com sua assinatura SHA-256 e pode ser baixado em **Ver documento**; a animação de scanner dura cinco segundos. O mapeamento ainda é simulado e usa o mesmo cenário de dois itens. Todos começam como **Não verificado**, sem evidências atuais ou revisões. Cada cômodo tem **Começar**, **Continuar** ou **Revisar**; continuar abre o primeiro item pendente. A sessão salva é recuperada ao reabrir o app. O cenário de demonstração antigo conhecido é arquivado antes da substituição pelo cenário simples, preservando seus registros; outras vistorias não são migradas automaticamente. Um novo envio também preserva uma cópia da sessão anterior.
3. Ao abrir um cômodo, toque em **Habilitar câmera e começar**. Depois da permissão de câmera, a voz inicia automaticamente e solicita acesso ao microfone. O mesmo gesto prepara a reprodução do áudio no celular. Se o navegador bloquear o som, use **Habilitar som da assistente**.
4. A assistente orienta o enquadramento pelo roteiro e pelas referências. A prévia da câmera é local: não há análise contínua nem envio automático de quadros. Câmera e conversa ficam na mesma tela. Se o microfone estiver indisponível, continue por texto ou tente **Ativar voz da assistente**.
5. **Fotografar e analisar** salva a captura e a envia imediatamente para comparação. A assistente avisa que recebeu a foto, e áudio, microfone e conversa continuam disponíveis enquanto a análise é feita. Ela recebe o resultado resumido assim que fica pronto. Para usar uma imagem do aparelho, toque em **Escolher foto do celular**, confira o item e toque em **Enviar e analisar**.
6. Quando faltar detalhe, a orientação pede outra foto do mesmo item. Quando a análise estiver pronta para revisão, **Confirmar e continuar** registra sua decisão e abre o próximo item pendente, priorizando o mesmo cômodo. Não há aprovação automática. **Revisar manualmente** também permite registrar uma conclusão inconclusiva e seguir, preservando essa situação.
7. **Ver comparação e justificativas** reúne fonte, requisito, regiões e evidências; **Condição esperada e referências** e **Fotos deste item** ficam recolhidos para concentrar a tela na captura. Falhas preservam a imagem e mostram **Reanalisar esta foto**.
8. Depois da confirmação do último item, o app mostra os totais de conformes, divergências e inconclusivos. **Concluir e ver relatório** encerra câmera e voz e abre o relatório. O roteiro permite voltar a qualquer item; uma nova captura de um item revisado reabre a revisão, mantendo o histórico anterior.
9. Em **Relatório**, veja o comparativo entre esperado e observado e finalize a vistoria. Se houver pendências, a confirmação preserva os itens não verificados, divergentes e inconclusivos. **Baixar relatório PDF** abre a impressão do navegador: escolha “Salvar como PDF”. O bloco **Comparativo completo, fontes e evidências** reúne as referências, análises, fotos atuais e histórico, além da exportação JSON; ele é expandido para impressão.

Clique numa evidência salva para renomear. Fotos usadas em análise preservam a imagem e o vínculo original com o item; fotos antigas sem análise também podem ser reassociadas ou excluídas, com registro no histórico. Clicar numa referência ou imagem da comparação abre sua ampliação.

### Como a comparação fica rastreável

Ao abrir o cômodo, a aplicação prepara em segundo plano um inventário independente das fotos anteriores: objetos, acabamento, marcas preexistentes, regiões aproximadas, iluminação aparente, nitidez e cores aparentes. As duas referências são processadas em paralelo, e pedidos simultâneos compartilham o mesmo trabalho. Também é possível solicitar essa leitura por **Ver detalhes das fotos iniciais**. O inventário é reaproveitado enquanto o original, o modelo e a versão da extração forem os mesmos; fica no servidor local em `.data/visual-baselines/`, fora do Git, e nas análises que o utilizaram. Na Vercel (`VERCEL=1`), o cache usa `chavecheck/visual-baselines/` dentro do diretório temporário do sistema, pois o diretório da aplicação é somente leitura. Esse cache é temporário e não é compartilhado entre instâncias: uma nova instância pode precisar analisar as referências novamente. Os inventários usados continuam preservados nos registros das análises do navegador. Com as referências prontas, cada foto atual precisa apenas da chamada de comparação.

Cada conclusão vincula o requisito e a fonte fornecidos, a captura atual, os inventários usados e os achados localizados. A aplicação valida essas ligações e torna inconclusiva uma decisão sem suporte suficiente, com enquadramento incompatível ou com partes essenciais não verificadas. A imagem original é preservada; fotos grandes recebem uma cópia de transporte reduzida para acelerar o envio. A cópia enviada para análise e os hashes de ambas permitem identificar exatamente os arquivos usados. O registro inclui data, modelo e versão das instruções.

As estatísticas locais dos pixels e as descrições da IA ajudam a explicar uma imagem escura, clara ou pouco nítida. Não são medições de iluminação física, cor calibrada nem porcentagens de certeza. Mudança de luz isolada não comprova avaria. Quando faltar informação, a orientação deve apontar o detalhe a fotografar, em vez de repetir ressalvas genéricas.

### Referência deste cômodo

O bom estado é a **condição esperada declarada pelo usuário** para este cenário fictício. As imagens anteriores mostram somente os ângulos fotografados e não aprovam o estado da vistoria atual. A foto 001 mostra o ar-condicionado, armários/expositores e parte da canaleta; a foto 002 mostra a parede da janela, mesa branca e cadeiras pretas.

O teste verifica somente o acabamento visível da parede e a condição externa da canaleta. Variações intencionais do cimento queimado não são avarias por si. A canaleta aparece parcialmente, com uma faixa escura que não permite concluir se há abertura ou avaria: a conversa deve pedir uma aproximação da tampa e dos trechos de fio aparentes, sem orientar abertura ou contato. Móveis, janela e mapa podem ajudar a localizar o mesmo trecho, mas não são itens desta verificação. O teste não inclui funcionamento elétrico nem partes ocultas.

As duas imagens originais ficam em `assets/reference-room/` e são servidas por rotas locais. Elas aparecem como **Referência anterior • cenário fictício**, podem ser ampliadas e não entram na contagem de evidências atuais. Não há upload genérico de referências anteriores nesta versão.

## O que esta versão entrega

- Entrada textual estruturada por IA, com edição e fonte.
- GPT-Live via WebRTC com áudio bidirecional, voz Bossa e transcrição em português.
- Chat por texto e análise visual estruturada via Responses, também disponíveis sem áudio.
- Câmera traseira preferencial, troca de câmera e tratamento de permissões.
- Captura imediata que salva o original antes de analisar, com cópia de transporte identificada e reenvio em caso de falha.
- Atalho para um cenário de um cômodo com duas fotos anteriores e duas verificações visuais: parede e canaleta, separado das evidências atuais.
- Checklist por ambiente, sugestões revisáveis e comparação determinística.
- Inventário das referências, comparação por regiões e fundamento ligado à fonte e à imagem atual.
- Comparação acumulada com até duas capturas anteriores úteis do mesmo item, preservando qual foto sustenta cada achado.
- Persistência local em IndexedDB, incluindo fotos, texto original e conversa.
- Relatório imprimível e exportação JSON com evidências incorporadas.
- Layout para desktop e celular.

## Limites intencionais da POC

Esta versão prioriza **Testar parede e canaleta → conversa e câmera → revisão dos dois itens → relatório**. O caminho por PDF, scanner de cinco segundos e cômodos continua disponível. O upload preserva o PDF original, mas sua extração ainda é simulada com o cenário da Sala. A comparação visual usa as duas fotos anteriores do exemplo; ainda não inclui cadastro genérico de referências antigas, extração real de PDF, armazenamento em nuvem, autenticação ou gestão de múltiplas vistorias. Os componentes legados de preparação textual continuam no código, sem acesso no novo fluxo.

Dados locais não se sincronizam entre navegadores, portas ou dispositivos. Limpar os dados do navegador apaga a sessão; exporte os registros para guardá-los. Falha de persistência é mostrada na tela. Texto, áudio, capturas enviadas para análise e referências usadas na comparação são enviados à OpenAI. As evidências atuais e suas análises ficam no navegador; os inventários das referências também ficam no servidor local. A aplicação não grava áudio nem vídeo contínuo.

O modelo pode errar. A aparência não comprova funcionamento, causa, prazo ou valor. As diferenças numéricas vêm dos dados registrados e não substituem a conferência. A aplicação não produz laudo pericial nem conclusão jurídica.

## Celular e HTTPS

Câmera e microfone funcionam em `localhost` ou em uma origem HTTPS confiável. Para validar num celular físico, sirva a aplicação em HTTPS acessível ao aparelho e configure `APP_ORIGIN` com a origem exata. Existe `npm run dev:network` para desenvolvimento com HTTPS local, mas o certificado precisa ser confiável no celular. A publicação e o teste em dispositivo físico são etapas separadas.

Por padrão o servidor limita APIs a origens locais. `APP_ORIGIN` habilita uma origem específica. Antes de expor esta POC fora de uma rede controlada, adicione autenticação: a verificação de origem e o limite de requisições não substituem login nem impedem uso por clientes não navegadores.

### Teste com ngrok

Use a URL HTTPS fornecida pelo seu túnel; `https://chavecheck-demo.ngrok-free.app` é apenas um exemplo fictício. O túnel deve apontar para `http://127.0.0.1:3100`. `APP_ORIGIN` em `.env.local` define a origem pública exata; `next.config.ts` usa o hostname dessa variável em `allowedDevOrigins`. O acesso local com a mesma origem continua funcionando. Outros domínios de túnel não são liberados por curinga.

Se o ngrok mudar de endereço, atualize `APP_ORIGIN` e reinicie `npm run dev`. Abra o link HTTPS diretamente no navegador do celular e permita câmera e microfone. A sessão salva no endereço local é independente da sessão no domínio ngrok; um navegador novo mostra o atalho **Testar parede e canaleta** e a opção de enviar PDF.

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

Modelos configuráveis: `OPENAI_LIVE_MODEL` (padrão `gpt-live-1`, conversa por voz), `OPENAI_TEXT_MODEL` (`gpt-6-luna`, chat, extração e backend de ferramentas da voz, com esforço `none`) e `OPENAI_VISION_MODEL` (`gpt-6-luna`, inventário com esforço `medium` e comparação da foto atual com esforço `none`). A disponibilidade depende do projeto OpenAI. `OPENAI_REALTIME_MODEL` e `OPENAI_TRANSCRIPTION_MODEL` continuam disponíveis somente para a rota anterior de compatibilidade.

O GPT-Live tem um protocolo próprio. A aplicação cria a sessão por `/v1/live/sessions`, aguarda `session.started` e transmite áudio pelo WebRTC. As referências seguem para o backend Responses; somente as fotos enviadas manualmente passam pela comparação registrada em `/api/analyze`. O registro completo segue para o backend, e a voz recebe somente um resumo fiel com resultado, pendências e próxima ação. Seus fragmentos são enviados em sequência no transporte e aguardam confirmações de recebimento em paralelo, sem uma espera por fragmento. As confirmações indicam recebimento, não provam que todo o texto foi falado. A atualização não silencia o áudio nem espera um intervalo de silêncio; a conversa continua durante a comparação. O fechamento normal aguarda `session.closed` antes de liberar o transporte.

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

O inventário inicial usa GPT-6 Luna com esforço `medium` e é reaproveitado do cache. A comparação interativa usa GPT-6 Luna com esforço `none`, de um a três achados decisivos e saída limitada a 3.200 tokens, mantendo as imagens em detalhe alto e a validação das evidências. Chat, extração e ferramentas da voz também usam GPT-6 Luna com esforço `none`. A voz permanece em GPT-Live-1. As capacidades e parâmetros foram conferidos na [documentação oficial do modelo](https://developers.openai.com/api/docs/models/gpt-6-luna). A duração depende da conexão, das imagens e do serviço; a interface mostra o progresso e mantém a conversa disponível.

### Continuidade entre capturas

Cada nova foto aproveita até duas capturas anteriores úteis do mesmo item e da mesma condição/fonte. Imagens sem detalhe utilizável, cópias exatas de referências e análises de requisitos alterados não entram como apoio. A nova comparação recebe as imagens efetivas, e cada achado informa sua captura, região, referência e observação inicial. A foto principal e os apoios usados ficam identificados no relatório e na exportação. Reanalisar uma captura preserva o conjunto originalmente enviado; uma nova captura pode formar outro conjunto.

Nos controles anteriores de 23/10/2026, antes do perfil rápido, as duas vistas fornecidas em sequência tiveram sugestão de conformidade limitada às superfícies visíveis e sem repetir o pedido da vista já coberta. Foram imagens de câmera virtual, não uma inspeção física. Naquele controle histórico, a comparação conjunta levou aproximadamente 53 segundos com os inventários já disponíveis; esse valor não mede o perfil atual.

A troca de modelo não reescreve análises antigas. Novos inventários são separados pelo modelo no cache; novas capturas usam a configuração atual. Reinicie a conversa por voz para aplicar o novo backend a uma sessão já aberta.

## Organização da equipe

O repositório foi iniciado para o Hackathon OpenAI São Paulo com as frentes `feat/contract-core` (contrato, entregas, comparação e revisões) e `feat/photo-verification` (fotos e verificação visual). Esta versão acrescenta a POC funcional à branch `main`.
