# ChaveCheck

## Register
product

## Users
Usuário primário: pessoa realizando uma vistoria de imóvel pelo celular. Imobiliárias, administradores, locadores, locatários e responsáveis por conferir reparos são públicos de aplicação a validar. Na POC, a equipe do hackathon testa um cenário fictício também no desktop.

## Product Purpose
Transformar PDF de vistoria, contrato ou termo de entrega em checklist revisável e conduzir sua verificação por voz, texto e fotos, até um relatório com comparativos, evidências e fontes.

A versão atual oferece upload e preservação do PDF, mas seu mapeamento usa um exemplo fixo. O cenário ativo verifica parede com cimento queimado e canaleta. Voz e análise visual usam IA; a captura é manual, a revisão é humana e os dados ficam no navegador. A API de extração textual existente não equivale à extração do PDF. A visão completa e o plano de evolução estão em [docs/VISAO-DO-PROJETO.md](docs/VISAO-DO-PROJETO.md).

## Brand Personality
Clareza, objetividade e orientação prática. A assistente diz qual detalhe precisa aparecer na próxima foto, explica a conclusão com base nas evidências e evita repetir ressalvas genéricas. Quando faltar informação, informa a ação necessária para obtê-la.

## Anti-references
Evitar a aparência de laudo definitivo ou aprovação automática. Não apresentar extração simulada como leitura real do PDF, câmera sintética como ensaio físico, aparência externa como funcionamento ou porcentagem arbitrária como certeza calibrada.

## Design Principles
- Conduzir um item por vez, com progresso e acesso ao roteiro.
- Ao habilitar a câmera, iniciar a voz; manter a conversa disponível durante a análise.
- Salvar a captura quando a pessoa toca para fotografar; confirmar a conclusão em uma etapa de revisão separada.
- Separar condição esperada, dados de entrega, declaração da pessoa e observação visual.
- Preservar originais, fontes, análises e revisões; reduzir somente a cópia de transporte quando necessário.
- Pedir nova foto com orientação específica se a evidência não for suficiente.
- Manter pendências e incertezas visíveis no relatório.
- Preservar a foto após falha da análise e permitir reenvio; não tratar armazenamento local como sincronização ou backup.

## Accessibility & Inclusion
Texto e foto manual como alternativas ao áudio. Controles nomeados, foco visível, contraste legível, alvos de toque e suporte a movimento reduzido. Conferir permissões e reprodução de som em aparelhos físicos, especialmente Safari/iOS.

## Evaluation Context

- [Visão, concepção, estado atual e evolução](docs/VISAO-DO-PROJETO.md).
- [Cenários documentados e critérios de aceite](docs/CENARIOS.md).
- [O que foi efetivamente validado](docs/VALIDACAO.md).
