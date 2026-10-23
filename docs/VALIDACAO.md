# Validação da prova de conceito

Data: 23/10/2026. Ambiente local, Next.js 16.4.0, Chrome automatizado e dados fictícios. Os resultados estão separados entre a atualização do cenário com fotos e a validação inicial da POC. Os testes de mídia usaram câmera sintética e microfone silencioso; não representam uma vistoria de imóvel real.

## Cenário do cômodo com referências anteriores

O exemplo **Sala de referência** usa `foto-001.jpeg` e `foto-002.jpeg`, mantidas em `assets/reference-room/`, e apresenta quatro verificações inicialmente pendentes: paredes/cimento queimado, canaleta inferior, ar-condicionado e mobiliário. A condição de bom estado foi declarada pelo usuário. Nenhum preço, prazo ou quantidade contratada é presumido.

As imagens são referências de um cenário fictício; não são capturas da vistoria atual nem aprovam itens automaticamente. A interface e o relatório as apresentam separadas das evidências atuais. O contexto da conversa identifica referência e imagem atual e orienta a pedir novos enquadramentos ou aproximações antes de sugerir uma conclusão.

Limites específicos: a textura do cimento queimado não é dano por si só; o furo circular da mesa é passagem para cabos; partes da canaleta e dos móveis estão ocultas; marcas já presentes devem ser comparadas; funcionamento e refrigeração do ar-condicionado exigem confirmação humana. A faixa escura junto à canaleta da foto 001, isoladamente, não determina integridade ou avaria.

Para validar presencialmente, carregar o exemplo, mostrar cada item no cenário atual, solicitar aproximações da canaleta e de possíveis diferenças, revisar as sugestões e confirmar o salvamento das fotos. A aprovação final continua humana. A existência desta funcionalidade não comprova precisão de detecção de defeitos; o teste com o cômodo atual permanece pendente.

## Verificações da atualização com as duas fotos

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
- Publicação HTTPS, certificado no aparelho, armazenamento em nuvem e uso multiusuário.
- Vistoria real ou desempenho de detecção de defeitos.
- Comparação presencial do cenário atual com as duas referências do cômodo, incluindo diferenças reais e condições de iluminação distintas.

Os arquivos em `output/playwright/` são capturas e relatório de teste, com evidência sintética identificada. Não são um laudo de imóvel.

## Preparação para o repositório público

Em 23/10/2026, a cópia desta versão foi verificada em diretório isolado, sem `.env.local`:

- 40 testes automatizados passaram, sem chamadas pagas à OpenAI.
- Compilação de produção e verificação TypeScript aprovadas.
- Configuração de exemplo com `OPENAI_API_KEY` vazio; arquivos de ambiente reais, certificados, dependências e resultados locais excluídos.
- Domínio do túnel de desenvolvimento substituído por exemplo fictício no README e nos testes.
- A credencial local foi comparada com todos os arquivos selecionados e com os arquivos estáticos gerados para o navegador, sem correspondências.
- Varredura Gitleaks sobre a cópia de publicação sem segredos detectados.

Esta publicação corresponde ao fluxo descrito neste documento. As melhorias de envio imediato de foto e análise visual rastreável estavam em desenvolvimento separado e não fazem parte desta versão.
