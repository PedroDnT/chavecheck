# Validação visual do fluxo de vistoria

Data: 23/10/2026. Implementação: http://127.0.0.1:3100/.

## Referências e evidências

Referências aprovadas em `../chavecheck-prototipo-2026-10-23/`:

- `01-upload-e-scanner-v3.png`: entrada centralizada e scanner.
- `02-comodos-e-captura.png`: cômodos e captura guiada.
- `03-comparativo-e-relatorio.png`: comparação e relatório.

As três pranchas têm 1254 × 1254 pixels, com duas telas de aproximadamente 519 × 1102 pixels cada. A comparação considerou somente o conteúdo de cada tela, excluindo títulos e margens da prancha, com escala proporcional à largura da implementação. São referências conceituais rasterizadas, não especificações de pixels CSS.

Capturas reais do navegador em `output/flow-qa/`:

| Arquivo | Dimensões em pixels / viewport CSS observado | Estado |
| --- | --- | --- |
| upload-mobile.png | 390 × 844 | Primeira abertura, somente envio |
| scanner-mobile.png | 390 × 844 | Scanner em andamento, início dos cinco segundos |
| rooms-mobile.png | 375 × 812 | Sala, quatro itens não verificados |
| capture-mobile.png | 375 × 812 | Primeiro item, câmera desligada |
| report-mobile.png | 375 × 812 | Finalizada: uma revisão manual simulada e três pendências |
| upload-desktop.png | 1366 × 900 | Envio centralizado, sessão anterior disponível |

As capturas móveis correspondem a 1 pixel por pixel CSS observado. Os arquivos foram salvos diretamente da API de captura, sem edição. A prancha e as capturas correspondentes foram abertas juntas na mesma entrada de comparação. O enquadramento completo foi suficiente para ler títulos, botões, estado e conteúdo; não foi necessário recortar regiões. O relatório utiliza rolagem para acomodar o texto efetivamente registrado. O ícone de desenvolvimento do Next é infraestrutura de desenvolvimento.

## Achados corrigidos e histórico de comparação

1. **P2 — Margens dos cômodos.** A primeira captura tinha conteúdo encostado na borda. Adicionado espaçamento horizontal ao conteúdo principal; recaptura `rooms-mobile.png` confirma margens e cartão íntegros.
2. **P2 — Densidade do relatório.** O resumo repetia condições extensas e “Ainda não verificado” em cada pendência. Agora pendências mostram nome e status; itens revisados apresentam esperado e observado, e o relatório detalhado conserva o texto integral. A captura final `report-mobile.png` confirma a redução de densidade e os estados lado a lado.
3. **P2 — Escala da imagem do scanner.** O documento inicial ocupava uma parte pequena dos marcadores. A escala foi ajustada; `scanner-mobile.png` confirma papel, feixe e marcadores alinhados à composição aprovada.
4. **P1 — Preparação legada substituía o roteiro.** Ocultados os acessos no modo incorporado para impedir perda do vínculo com o PDF. Conferido na captura e na navegação.
5. **P2 — Navegação durante gravação.** Ações de início, relatório e nova vistoria respeitam o estado ocupado; saída da captura fica bloqueada durante análise.

Não restam achados P0/P1/P2 acionáveis no escopo das telas.

## Cinco superfícies de fidelidade

- **Tipografia:** família Arial/Helvetica existente mantida. Títulos fortes, corpo regular e textos auxiliares menores reproduzem a hierarquia da referência. Quebras de título respeitam a largura móvel. O resumo limita o texto esperado; a versão completa permanece acessível.
- **Espaçamento e composição:** entrada e scanner centralizados na área de conteúdo, progresso do scanner no final, margens móveis consistentes, cartões e ações sem transbordamento horizontal. Desktop usa coluna central limitada. Relatório mantém estado, contadores, itens e ação final em sequência.
- **Cores e tokens:** branco, vinho, rosa suave, verde de conformidade e âmbar de atenção usam os tokens já existentes do app. O vinho é mais sóbrio que o vermelho da imagem conceitual; preserva a identidade da aplicação em andamento.
- **Imagens e ícones:** documento do scanner gerado como imagem transparente e inspecionado. Fotos de referência existentes preservadas. Ícones usam a biblioteca já instalada. O scanner apresenta movimento do feixe e respeita preferência por movimento reduzido.
- **Conteúdo:** removido “Demonstração” do topo. Entrada sem área de arrastar, sem rodapé de prévia. Scanner sem “Preparando roteiro”. Lista usa os quatro itens reais do cenário da Sala. O relatório apresenta apenas observações registradas e deixa pendências explícitas.

## Diferenças deliberadas

- Durante o scanner, a etapa Documento permanece ativa até a lista estar pronta.
- “Continuar vistoria salva” aparece somente quando há uma sessão anterior.
- A captura conserva os controles existentes de câmera, anexos e voz; as duas fotos continuam identificadas como referências anteriores.
- O comparativo detalhado existente foi integrado, evitando substituir análise e revisão por resultados inventados. O mapeamento do PDF é simulado; a comparação visual existente continua disponível.
- A informação de roteiro de teste fica junto ao documento e ao relatório, sem selo no cabeçalho.

## Validação funcional

- PDF inválido: mensagem de erro visível, sem avançar.
- PDF válido: original salvo, scanner animado e abertura automática dos cômodos. Duração configurada de 5000 ms, com limpeza dos temporizadores revisada.
- Download do original: SHA-256 idêntico ao arquivo enviado.
- Começar abre o primeiro item da Sala; registro manual de teste altera progresso para 1/4.
- Após recarga, Continuar abre o segundo item pendente e preserva a revisão.
- Finalização com três pendências exige confirmação e mantém os três estados não verificados. Após recarga, o relatório permanece finalizado com pendências.
- A ação de PDF foi acionada e expandiu o comparativo para impressão. A janela nativa de impressão do navegador integrado não pôde ser inspecionada; não foi validada uma saída PDF salva. Não se afirma validação da paginação final.
- Console: nenhum erro ou aviso coletado na aba de teste. Next MCP: `configErrors` e `sessionErrors` vazios; compilação sem problemas.
- `npm run typecheck`: passou. `npm test`: 125 aprovados, zero falhas.
- Não foram acionados câmera física, microfone ou chamadas de IA durante esta validação de interface.

## Checklist final

- [x] Entrada, scanner, cômodos, captura e relatório conectados.
- [x] Conteúdo centralizado e selo do topo removido.
- [x] Persistência e pendências verificadas pelo navegador.
- [x] Capturas revisadas após as correções visuais.
- [x] Código validado e prévia local disponível.

## Refinamentos posteriores

- P3: revisar a paginação do PDF exportado em navegador externo.
- P3: validar a captura e conversa em dispositivo móvel físico com permissões do usuário.

final result: passed
