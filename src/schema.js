const string = { type: 'string' };
const nullableString = { type: ['string', 'null'] };
const array = (items) => ({ type: 'array', items });
const object = (properties) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});

const characteristic = object({
  nome: string,
  valor: { type: ['string', 'number', 'boolean', 'null'], description: 'Característica declarada no contrato; null se ausente.' },
  unidade: nullableString,
  aproximado: { type: 'boolean' },
  localizacao: nullableString,
  referencia_contrato: nullableString,
});
const requirement = object({
  descricao: string,
  meios_verificacao: array({ type: 'string', enum: ['foto', 'medicao', 'teste_funcional', 'documento'] }),
  referencia_contrato: nullableString,
});
const item = object({
  id: string,
  nome: string,
  caracteristicas: array(characteristic),
  requisitos_a_verificar: array(requirement),
  informacoes_faltantes: array(string),
});

export const extractionSchema = object({
  etapa: { type: 'string', enum: ['extracao_contrato'] },
  documento: object({ referencia: nullableString, ficticio: { type: ['boolean', 'null'] } }),
  ambientes: array(object({
    id: string,
    nome: string,
    tipo: nullableString,
    itens: array(item),
  })),
  limitacoes: array(string),
});
export const structuredFormat = {
  type: 'json_schema', name: 'requisitos_vistoria', strict: true, schema: extractionSchema,
};

// Covers the JSON Schema subset used above; deliberately not a general validator.
export function validateShape(value, schema = extractionSchema, path = '$') {
  if (schema.anyOf) {
    if (schema.anyOf.some((s) => { try { validateShape(value, s, path); return true; } catch { return false; } })) return;
    throw new Error(`Schema inválido em ${path}.`);
  }
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matchesType = types.includes(type) || (type === 'number' && Number.isInteger(value) && types.includes('integer'));
  if (!matchesType || (type === 'number' && !Number.isFinite(value))) throw new Error(`Tipo inválido em ${path}.`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`Valor inválido em ${path}.`);
  if (type === 'object') {
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) throw new Error(`Campo ausente em ${path}.${key}.`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new Error(`Campo inesperado em ${path}.`);
      validateShape(child, schema.properties[key], `${path}.${key}`);
    }
  } else if (type === 'array') value.forEach((child, i) => validateShape(child, schema.items, `${path}[${i}]`));
}


// Structural checks only. No document-grounding or inspection verdict here.
export function validateExtraction(value) {
  validateShape(value);
  function checkIds(list, context) {
    const ids = new Set();
    for (const entry of list) {
      if (!entry.id.trim() || !entry.nome.trim() || ids.has(entry.id)) {
        throw new Error(`Identificação/nome vazio ou ID duplicado em ${context}.`);
      }
      ids.add(entry.id);
    }
  }
  checkIds(value.ambientes, 'ambientes');
  for (const room of value.ambientes) checkIds(room.itens, `itens do ambiente ${room.id}`);
  return value;
}
