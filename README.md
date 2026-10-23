# ChaveCheck

Projeto para o Hackathon OpenAI São Paulo: um conferidor entre contrato e entregas de uma locação residencial fictícia, com comparação baseada em evidências.

## Escopo da demonstração

- Receber um contrato curto, com até dez itens, e uma tabela de entregas.
- Destacar divergências de quantidade, prazo ou valor, mostrando as evidências utilizadas.
- Permitir registrar a revisão de cada ocorrência.
- Oferecer verificação opcional por fotos de áreas solicitadas pela interface como evidência complementar.

A demonstração deve encontrar três divergências inseridas nos dados fictícios. Sem interpretação jurídica.

## Trabalho em paralelo

- `feat/contract-core`: leitura do contrato e das entregas, comparação e registro das revisões.
- `feat/photo-verification`: solicitação de fotos e verificação visual como evidência complementar.

Stack prevista: Next.js e TypeScript. Este repositório contém apenas a documentação inicial; a aplicação ainda será implementada.
