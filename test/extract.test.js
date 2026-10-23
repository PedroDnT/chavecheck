import test from 'node:test';
import assert from 'node:assert/strict';
import { structuredFormat, validateShape, validateExtraction } from '../src/schema.js';
import { extractDocument } from '../src/extract.js';

const document = 'Sala: seis cadeiras cinzas. Banheiro: um vaso sanitário. A cadeira C03 tem folga no encosto.';
function item(id = 'I01', nome = 'cadeiras') {
  return {
    id, nome,
    caracteristicas: [{ nome: 'quantidade', valor: 6, unidade: 'unidades', aproximado: false, localizacao: null, referencia_contrato: null }],
    requisitos_a_verificar: [{ descricao: 'Conferir quantidade e estofado.', meios_verificacao: ['foto'], referencia_contrato: null }],
    informacoes_faltantes: [],
  };
}
function fixture() {
  return {
    etapa: 'extracao_contrato',
    documento: { referencia: null, ficticio: true },
    ambientes: [{ id: 'A01', nome: 'Sala', tipo: null, itens: [item()] }],
    limitacoes: ['Dados sintéticos de teste; nenhuma foto analisada.'],
  };
}
const outputMessage = (data) => [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }];
function mockFetch(output, status = 'completed', httpStatus = 200, check = () => {}) {
  return async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.method, 'POST');
    const request = JSON.parse(init.body);
    assert.equal(request.text.format.type, 'json_schema');
    assert.equal(request.text.format.strict, true);
    assert.equal(request.store, false);
    assert.equal(request.input[1].content, document);
    check(request);
    return new Response(JSON.stringify({ id: 'resp_test', model: 'test-model', status, output, usage: null }),
      { status: httpStatus, headers: { 'content-type': 'application/json' } });
  };
}

test('extrai requisitos com Responses strict, escopo e documento original', async () => {
  const fetchImpl = mockFetch(outputMessage(fixture()), 'completed', 200, (request) => {
    assert.ok(request.input[0].content.includes('ESCOPO SOLICITADO: {"ambiente":"Sala","itens":["cadeiras"]}'));
    assert.ok(request.input[0].content.includes('Não avalie fotos'));
  });
  const result = await extractDocument({ apiKey: 'test', document, ambiente: 'Sala', itens: ['cadeiras'], fetchImpl });
  assert.equal(result.dados.ambientes[0].itens[0].caracteristicas[0].valor, 6);
  assert.equal(result.dados.etapa, 'extracao_contrato');
  assert.equal(result.api.response_id, 'resp_test');
});

test('ambientes, itens e requisitos são variáveis', () => {
  const data = fixture();
  data.ambientes.push({ id: 'A02', nome: 'Banheiro', tipo: 'banheiro', itens: [item('B01', 'vaso sanitário'), item('B02', 'torneira')] });
  assert.equal(validateExtraction(data).ambientes.length, 2);
  data.ambientes[1].itens = Array.from({ length: 12 }, (_, i) => item(`B${i}`, 'elemento documentado'));
  assert.equal(validateExtraction(data).ambientes[1].itens.length, 12);
  data.ambientes = [];
  assert.deepEqual(validateExtraction(data).ambientes, []);
});

test('referência opcional não bloqueia extração e não exige citação ou linha', () => {
  const data = fixture();
  data.ambientes[0].itens[0].caracteristicas[0].referencia_contrato = 'Anexo I, seção C';
  assert.doesNotThrow(() => validateExtraction(data));
  data.ambientes[0].itens[0].caracteristicas[0].referencia_contrato = null;
  assert.doesNotThrow(() => validateExtraction(data));
});

test('zero, null e aproximação permanecem distintos', () => {
  const data = fixture();
  const c = data.ambientes[0].itens[0].caracteristicas[0];
  c.valor = 0;
  assert.equal(validateExtraction(data).ambientes[0].itens[0].caracteristicas[0].valor, 0);
  c.valor = null;
  assert.equal(validateExtraction(data).ambientes[0].itens[0].caracteristicas[0].valor, null);
  c.valor = 8; c.aproximado = true;
  assert.equal(validateExtraction(data).ambientes[0].itens[0].caracteristicas[0].aproximado, true);
});

test('funcionamento pode exigir teste futuro, sem aprovar ou reprovar o item', () => {
  const data = fixture();
  data.ambientes[0].itens[0].requisitos_a_verificar.push({ descricao: 'Conferir folga do encosto C03.', meios_verificacao: ['teste_funcional'], referencia_contrato: null });
  assert.doesNotThrow(() => validateExtraction(data));
  data.ambientes[0].itens[0].resultado_vistoria = 'aprovado';
  assert.throws(() => validateExtraction(data), /inesperado/);
});

test('estrutura rejeita campos ausentes, tipo inválido e IDs duplicados', () => {
  const data = fixture(); delete data.ambientes[0].itens[0].caracteristicas;
  assert.throws(() => validateShape(data), /ausente/);
  const other = fixture(); other.ambientes.push(structuredClone(other.ambientes[0]));
  assert.throws(() => validateExtraction(other), /duplicado/);
  const duplicate = fixture(); duplicate.ambientes[0].itens.push(item());
  assert.throws(() => validateExtraction(duplicate), /duplicado/);
  const invalid = fixture(); invalid.ambientes[0].itens[0].caracteristicas[0].aproximado = 'sim';
  assert.throws(() => validateShape(invalid), /Tipo/);
  assert.equal(structuredFormat.schema.additionalProperties, false);
});

test('recusa, resposta incompleta, HTTP e JSON inválido continuam sendo erros', async () => {
  const refusal = [{ type: 'message', content: [{ type: 'refusal', refusal: 'Recusado.' }] }];
  await assert.rejects(() => extractDocument({ apiKey: 'test', document, fetchImpl: mockFetch(refusal) }), /recusou/);
  await assert.rejects(() => extractDocument({ apiKey: 'test', document, fetchImpl: mockFetch([], 'incomplete') }), /não concluída/);
  await assert.rejects(() => extractDocument({ apiKey: 'test', document, fetchImpl: mockFetch([], 'completed', 401) }), /HTTP 401/);
  const malformed = [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }];
  await assert.rejects(() => extractDocument({ apiKey: 'test', document, fetchImpl: mockFetch(malformed) }), /JSON inválida/);
});

test('falha estrutural preserva diagnóstico sem credenciais', async () => {
  const data = fixture(); data.etapa = 'vistoria_aprovada';
  await assert.rejects(() => extractDocument({ apiKey: 'test-secret', document, fetchImpl: mockFetch(outputMessage(data)) }), (error) => {
    assert.equal(error.diagnostic.status, 'rejeitado_na_estrutura');
    assert.ok(!JSON.stringify(error.diagnostic).includes('test-secret'));
    return true;
  });
});

test('seleções vazias são rejeitadas antes de chamar a API', async () => {
  const fetchImpl = () => { throw new Error('Não deveria chamar a API.'); };
  await assert.rejects(() => extractDocument({ apiKey: 'test', document, ambiente: ' ', fetchImpl }), /ambiente vazia/);
  await assert.rejects(() => extractDocument({ apiKey: 'test', document, itens: [''], fetchImpl }), /itens inválida/);
});
