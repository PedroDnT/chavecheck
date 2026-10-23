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

1. Use **Carregar cenário das fotos** para ativar o exemplo **Sala de referência**, montado a partir de `foto-001.jpeg` e `foto-002.jpeg`. Há quatro verificações: paredes com cimento queimado, canaleta inferior de fiação, ar-condicionado e mobiliário. Todos os itens começam como **Não verificado**, sem fotos atuais, revisões ou diferenças de quantidade, prazo e valor. A troca guarda uma cópia da sessão anterior, disponível em **Preparação → Exportar vistoria anterior**. Um navegador novo já abre esse exemplo.
2. Em **Preparação**, cole suas verificações ou importe TXT, Markdown, CSV ou JSON. Clique em **Organizar com IA** e revise os campos extraídos. Informações ausentes ficam nulas. O texto bruto é preservado na sessão e na exportação.
3. Em **Vistoria ao vivo**, ative a câmera. A prévia permanece privada até clicar em **Analisar agora** ou autorizar **Compartilhar ao vivo** durante a conversa por voz.
4. Inicie a conversa por voz e permita o microfone. Também é possível conversar por texto sem microfone. A IA recebe o roteiro, o item ativo e, neste exemplo, as duas fotos identificadas como referências anteriores. Mostre o cenário atual na câmera para comparar cada item; apenas abrir o exemplo não verifica o cômodo.
5. O compartilhamento envia no máximo um quadro reduzido a cada 10 segundos, pausa enquanto a assistente fala ou a aba está oculta e pode ser desligado. Trata-se de entrada por imagens, não vídeo contínuo.
6. Ao pedir uma foto, a IA abre uma solicitação. Clique em **Capturar e revisar**, confira a imagem e confirme o salvamento. Você pode também anexar uma imagem. O quadro usado para análise não substitui a foto original.
7. **Registrar minha revisão** permite corrigir valores, fonte, observação e status. Sugestões da IA exigem aprovação explícita; não alteram o status automaticamente.
8. Em **Relatório**, veja as referências anteriores separadas das evidências da vistoria atual, além de cada ambiente, pendências, fontes e histórico. Exporte JSON ou use **Imprimir / PDF** e escolha “Salvar como PDF” no navegador. A exportação incorpora as evidências salvas; as referências do exemplo são identificadas por links locais.

Clique numa evidência salva para renomear, reassociar ou excluir. A exclusão e as revisões ficam registradas no histórico da vistoria. Clicar em uma foto de referência abre sua ampliação.

### Referência deste cômodo

O bom estado é a **condição esperada declarada pelo usuário** para este cenário fictício. As imagens anteriores mostram somente os ângulos fotografados e não aprovam o estado da vistoria atual. A foto 001 mostra o ar-condicionado, armários/expositores e parte da canaleta; a foto 002 mostra a parede da janela, mesa branca e cadeiras pretas.

Variações do cimento queimado e o furo circular para cabos na mesa fazem parte da referência. A canaleta aparece parcialmente, com uma faixa escura que não permite concluir se há abertura ou avaria: a conversa deve pedir uma aproximação. Marcas já visíveis nos móveis devem ser distinguidas de alterações novas. O aspecto externo do ar-condicionado não comprova refrigeração ou funcionamento, que dependem de confirmação humana.

As duas imagens originais ficam em `assets/reference-room/` e são servidas por rotas locais. Elas aparecem como **Referência anterior • cenário fictício**, podem ser ampliadas e não entram na contagem de evidências atuais. Não há upload genérico de referências anteriores nesta versão.

## O que esta versão entrega

- Entrada textual estruturada por IA, com edição e fonte.
- WebRTC Realtime com áudio bidirecional e transcrição em português.
- Chat por texto e análise de imagem via Responses como alternativa sem áudio.
- Câmera traseira preferencial, troca de câmera e tratamento de permissões.
- Captura e arquivo original com confirmação, separado do quadro de análise.
- Cenário de um cômodo com duas fotos anteriores e quatro verificações visuais, separado das evidências atuais.
- Checklist por ambiente, sugestões revisáveis e comparação determinística.
- Persistência local em IndexedDB, incluindo fotos, texto original e conversa.
- Relatório imprimível e exportação JSON com evidências incorporadas.
- Layout para desktop e celular.

## Limites intencionais da POC

Esta versão prioriza **entrada de verificações → conversa e câmera → revisão → relatório**. Não implementa toda a especificação do hackathon. A comparação visual usa as duas fotos anteriores do exemplo; ainda não inclui cadastro genérico de referências antigas, upload/extração de PDF, armazenamento em nuvem, autenticação, múltiplas vistorias nem publicação HTTPS. A importação JSON é de texto para extração, não uma restauração de backup.

Dados locais não se sincronizam entre navegadores, portas ou dispositivos. Limpar os dados do navegador apaga a sessão; exporte os registros para guardá-los. Falha de persistência é mostrada na tela. Texto, áudio, quadros escolhidos para análise e as referências usadas na comparação são enviados à OpenAI. A aplicação não grava áudio nem vídeo contínuo.

O modelo pode errar. A aparência não comprova funcionamento, causa, prazo ou valor. As diferenças numéricas vêm dos dados registrados e não substituem a conferência. A aplicação não produz laudo pericial nem conclusão jurídica.

## Celular e HTTPS

Câmera e microfone funcionam em `localhost` ou em uma origem HTTPS confiável. Para validar num celular físico, sirva a aplicação em HTTPS acessível ao aparelho e configure `APP_ORIGIN` com a origem exata. Existe `npm run dev:network` para desenvolvimento com HTTPS local, mas o certificado precisa ser confiável no celular. A publicação e o teste em dispositivo físico são etapas separadas.

Por padrão o servidor limita APIs a origens locais. `APP_ORIGIN` habilita uma origem específica. Antes de expor esta POC fora de uma rede controlada, adicione autenticação: a verificação de origem e o limite de requisições não substituem login nem impedem uso por clientes não navegadores.

### Teste com ngrok

Use a URL HTTPS fornecida pelo seu túnel; `https://chavecheck-demo.ngrok-free.app` é apenas um exemplo fictício. O túnel deve apontar para `http://127.0.0.1:3100`. `APP_ORIGIN` em `.env.local` define a origem pública exata; `next.config.ts` usa o hostname dessa variável em `allowedDevOrigins`. O acesso local com a mesma origem continua funcionando. Outros domínios de túnel não são liberados por curinga.

Se o ngrok mudar de endereço, atualize `APP_ORIGIN` e reinicie `npm run dev`. Abra o link HTTPS diretamente no navegador do celular e permita câmera e microfone. A sessão salva no endereço local é independente da sessão no domínio ngrok; o exemplo das duas fotos aparece automaticamente em um navegador novo.

## Integração

| Rota | Função |
| --- | --- |
| `GET /api/health` | Presença de configuração e modelo; nunca retorna chave. |
| `POST /api/realtime` | Troca SDP pelo backend e inicia sessão WebRTC na OpenAI. |
| `POST /api/chat` | Resposta por texto com imagem opcional. |
| `POST /api/parse` | Extração de até dez itens com JSON Schema e validação. |
| `GET /api/reference-photos/foto-001` e `GET /api/reference-photos/foto-002` | Fotos anteriores do cenário de referência; não são evidências atuais. |

As ferramentas `request_photo_capture`, `propose_observation` e `get_inspection_context` são validadas no cliente. Pedidos de foto e sugestões são propostas; o modelo não salva fotos nem aprova conclusões. Não existe ferramenta para finalizar a revisão autonomamente.

Modelos configuráveis: `OPENAI_REALTIME_MODEL` (padrão `gpt-realtime-2.1`), `OPENAI_TEXT_MODEL` (`gpt-5.4-mini`) e `OPENAI_TRANSCRIPTION_MODEL` (`gpt-4o-mini-transcribe`). A disponibilidade depende do projeto OpenAI. A transcrição padrão tem descontinuação anunciada para 26/02/2027 e deve ser revista antes de uma evolução de produção.

As APIs validam tipo/tamanho de entrada, origem, datas e enums, limitam frequência e cancelam solicitações interrompidas. O limite de frequência é local ao processo e adequado à demonstração. `TRUST_PROXY=true` só deve ser usado atrás de proxy confiável.

## Referências

- [Especificação original fornecida](docs/especificacao-original.md).
- [OpenAI Realtime com WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc).
- [Imagens, eventos e ferramentas em conversas Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations).
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Consulte `docs/VALIDACAO.md` para o que foi efetivamente testado.

## Organização da equipe

O repositório foi iniciado para o Hackathon OpenAI São Paulo com as frentes `feat/contract-core` (contrato, entregas, comparação e revisões) e `feat/photo-verification` (fotos e verificação visual). Esta versão acrescenta a POC funcional à branch `main`.
