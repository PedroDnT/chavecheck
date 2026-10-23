# ChaveCheck: requisitos para vistoria

Protótipo em Node.js que extrai de um contrato as características e os requisitos que deverão ser verificados depois. Usa OpenAI Responses API com Structured Outputs e JSON Schema strict, via `fetch` nativo, sem dependências externas.

## Etapa atual

A etapa `extracao_contrato` gera um JSON flexível:

- `ambientes`: cômodos documentados, sem lista fixa.
- `itens`: elementos de cada cômodo, sem quantidade obrigatória.
- `caracteristicas`: cor, material, quantidade, dimensões, localização, defeitos ou condições declaradas; valor, unidade e indicação de aproximação.
- `requisitos_a_verificar`: o que conferir futuramente e meios adequados, como foto, medição, teste funcional ou documento.
- `informacoes_faltantes` por item e `limitacoes` gerais.

Referências de seção/cláusula são opcionais. Esta etapa não exige citações literais nem números de linha e não valida o estado do imóvel. Não recebe nem compara fotografias. A comparação com evidências será uma etapa futura. Fotos podem apoiar aparência e presença, mas não comprovam por si só funcionamento, estabilidade ou medidas exatas.

O schema é estrito quanto ao formato, mas os nomes dos itens, atributos e requisitos são livres. Uma sala pode conter cadeiras e TV; um banheiro pode conter vaso sanitário e torneiras, quando documentados. Não são inseridos objetos apenas por serem típicos de um cômodo.

## Executar

Requer Node.js 22 ou superior. A chave existente do projeto está em `.env`, ignorado pelo Git.

```sh
npm run extract -- output/contrato-ficticio-sala-comercial.md \
  --ambiente 'Sala comercial SAL-01' \
  --itens 'pintura das paredes,vaso decorativo,cadeiras,mesa,estante' \
  -o output/extracao-requisitos-sala.json
```

Sem `--itens`, extrai os itens documentados do ambiente selecionado. Sem `--ambiente`, identifica os ambientes descritos. Se o ambiente pedido não estiver documentado, a resposta deve explicar a ausência em `limitacoes`. Sem `-o`, o comando Node escreve somente o JSON em stdout; com `-o`, recusa substituir arquivo existente.

O comando npm carrega `.env` e `.env.local`, sem substituir variáveis já exportadas. Também é possível executar `node --env-file=.env src/cli.js ...`. O modelo padrão é `gpt-4.1-mini`, alterável por `--model` ou `OPENAI_MODEL`. Cada execução envia o documento à OpenAI em chamada paga com `store: false`. Não copie chaves para código ou chat.

Aceita `.md` e `.txt`, até 250 KB. Ainda não aceita PDF diretamente.

## Conferência de estrutura

A API recebe JSON Schema com `strict: true`. O Node confere tipos, campos obrigatórios, propriedades extras, valores permitidos e IDs únicos por lista. Isso é conferência do formato, não verificação factual nem vistoria.

A versão de saída `3.0` contém `proveniencia` (response ID, modelo, uso, hash e escopo), `etapa`, `documento`, `ambientes` e `limitacoes`. É incompatível com os formatos anteriores. Ausência de informação é `null`; zero é um valor concreto. Aditivos devem orientar a condição final, sem tratar uma declaração como evidência atual.

O modelo pode cometer erros de interpretação, omissão ou aproximação. A extração deve ser revisada antes de orientar uma vistoria real. Erros da API, recusas e respostas incompletas não geram resultado. Falhas de estrutura podem gerar `<saída>.rejeitada.json`, separado e marcado como rejeitado, sem credenciais.

## Testes

```sh
npm test
node src/export-schema.js > output/schema-vistoria.json
```

Testes usam HTTP simulado e não cobram API. Cobrem flexibilidade, escopo, formato, referências opcionais, ausência de parecer de vistoria e falhas de API. Os JSONs manuais e arquivos `.rejeitada.json` das versões anteriores são históricos, não resultados desta etapa.

Referência: [Structured Outputs na documentação oficial da OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs).
