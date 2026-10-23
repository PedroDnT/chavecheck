import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { extractDocument } from './extract.js';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { output: { type: 'string', short: 'o' }, model: { type: 'string' }, ambiente: { type: 'string' }, itens: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) {
    process.stdout.write('Uso: npm run extract -- [contrato.md|contrato.txt] [-o resultado.json] [--ambiente "Sala comercial"] [--itens "pintura,TV"] [--model modelo]\nSem -o, escreve somente JSON em stdout. Requer OPENAI_API_KEY no ambiente.\n');
    return;
  }
  if (positionals.length > 1) throw new Error('Informe somente um arquivo de entrada.');
  const path = resolve(positionals[0] ?? 'output/contrato-ficticio-sala-comercial.md');
  if (!['.md', '.txt'].includes(extname(path).toLowerCase())) {
    throw new Error('Este protótipo aceita somente .md e .txt; não extrai PDF.');
  }
  const document = await readFile(path, 'utf8');
  if (!document.trim()) throw new Error('Documento vazio.');
  if (Buffer.byteLength(document) > 250_000) throw new Error('Documento excede o limite de 250 KB do protótipo.');
  if (values.output && resolve(values.output) === path) throw new Error('Saída não pode sobrescrever a entrada.');
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY não disponível neste processo. Use o arquivo de ambiente existente autorizado.');
  }
  const ambiente = values.ambiente ?? null;
  const itens = values.itens === undefined ? [] : values.itens.split(',').map((s) => s.trim());
  if (ambiente !== null && !ambiente.trim()) throw new Error('Seleção de ambiente vazia.');
  if (itens.some((s) => !s)) throw new Error('Seleção de itens contém entrada vazia.');
  if (values.output) {
    try {
      await access(resolve(values.output));
      throw Object.assign(new Error('Saída existente.'), { code: 'EEXIST' });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let result;
  try {
    result = await extractDocument({ apiKey: process.env.OPENAI_API_KEY, document, ambiente, itens, model: values.model ?? process.env.OPENAI_MODEL ?? 'gpt-4.1-mini' });
  } catch (error) {
    if (error.diagnostic && values.output) {
      const diagnosticPath = resolve(`${values.output}.rejeitada.json`);
      try {
        const diagnostic = { ...error.diagnostic, sha256_fonte: createHash('sha256').update(document).digest('hex') };
        await writeFile(diagnosticPath, JSON.stringify(diagnostic, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        process.stderr.write(`Diagnóstico rejeitado salvo em ${diagnosticPath}. A estrutura foi rejeitada.\n`);
      } catch { process.stderr.write('Não foi possível salvar o diagnóstico separado.\n'); }
    }
    throw error;
  }
  const payload = {
    versao_schema: '3.0',
    proveniencia: {
      ...result.api,
      escopo_solicitado: { ambiente, itens },
      arquivo_fonte: path,
      sha256_fonte: createHash('sha256').update(document).digest('hex'),
      extraido_em: new Date().toISOString(),
    },
    ...result.dados,
  };
  const json = JSON.stringify(payload, null, 2) + '\n';
  if (values.output) {
    // Refuse accidental replacement of an earlier extraction.
    await writeFile(resolve(values.output), json, { flag: 'wx' });
    process.stderr.write('Requisitos extraídos e JSON salvo. Estrutura conferida; vistoria não realizada.\n');
  } else process.stdout.write(json);
}

main().catch((error) => {
  // Do not dump API bodies, credentials or stacks.
  const message = error.code === 'EEXIST'
    ? 'O arquivo de saída já existe. Escolha outro nome.'
    : error.message;
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
