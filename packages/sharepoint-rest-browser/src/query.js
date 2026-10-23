/* A deliberately small, allow-listed query language for repository clients. */

const OPERATORS = new Set(["eq", "ne", "gt", "ge", "lt", "le", "contains", "beginsWith"]);

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} deve ser um texto não vazio.`);
  return value.trim();
}

function contractOf(contract) {
  if (contract?.toInternal) return { toInternal: (field) => contract.toInternal(field), hasSchema: true };
  const mapping = contract?.mapping ?? contract?.mappings;
  const fields = {};
  if (mapping) {
    if (typeof mapping !== "object" || Array.isArray(mapping)) throw new TypeError("mapping deve ser um objeto.");
    for (const [domain, definition] of Object.entries(mapping)) fields[domain] = typeof definition === "string" ? definition : definition?.internalName ?? definition?.internal;
  } else if (contract?.schema?.fields) {
    for (const field of contract.schema.fields) fields[field.internalName] = field.internalName;
  }
  const hasSchema = mapping !== undefined || contract?.schema !== undefined;
  return { hasSchema, toInternal(field) {
    if (!Object.prototype.hasOwnProperty.call(fields, field) || typeof fields[field] !== "string" || !fields[field].trim()) throw new TypeError(`Campo desconhecido: ${field}.`);
    return fields[field].trim();
  }};
}

function field(value, contract) {
  const domain = text(value, "field");
  return contract.hasSchema ? contract.toInternal(domain) : domain;
}

function literal(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return `'${value.toISOString()}'`;
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  throw new TypeError("filter.value deve ser texto, número, booleano, data ou null.");
}

function condition(value, contract) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("filter deve usar objetos controlados.");
  if (Array.isArray(value.and) || Array.isArray(value.or)) {
    const key = Array.isArray(value.and) ? "and" : "or";
    if (!value[key].length) throw new TypeError(`filter.${key} não pode ser vazio.`);
    return value[key].map((entry) => `(${condition(entry, contract)})`).join(` ${key} `);
  }
  const op = text(value.operator ?? value.op, "filter.operator");
  if (!OPERATORS.has(op)) throw new TypeError(`Operador não suportado: ${op}.`);
  const name = field(value.field, contract);
  if (value.value === undefined) throw new TypeError("filter.value deve ser informado.");
  if (op === "contains" || op === "beginsWith") {
    if (typeof value.value !== "string") throw new TypeError(`${op} exige um valor texto.`);
    return `${op}(${name},${literal(value.value)})`;
  }
  if (value.value === null && !["eq", "ne"].includes(op)) throw new TypeError(`${op} não aceita null.`);
  return `${name} ${op} ${literal(value.value)}`;
}

function list(value, label) {
  if (value === undefined) return undefined;
  const result = Array.isArray(value) ? value : [value];
  if (!result.length || result.some((entry) => typeof entry !== "string" || !entry.trim())) throw new TypeError(`${label} deve conter textos não vazios.`);
  return result.map((entry) => entry.trim());
}

export function normalizeQuery(query = {}, contract = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query)) throw new TypeError("query deve ser um objeto.");
  const supported = new Set(["select", "filter", "orderBy", "pageSize", "top"]);
  const unknown = Object.keys(query).find((key) => !supported.has(key));
  if (unknown) throw new TypeError(`Opção de consulta não suportada: ${unknown}.`);
  const resolver = contractOf(contract);
  const output = {};
  const selected = list(query.select, "select");
  if (selected) output.select = selected.map((entry) => field(entry, resolver));
  if (query.filter !== undefined) output.filter = condition(query.filter, resolver);
  if (query.orderBy !== undefined) {
    const entries = Array.isArray(query.orderBy) ? query.orderBy : [query.orderBy];
    if (!entries.length) throw new TypeError("orderBy não pode ser vazio.");
    output.orderBy = entries.map((entry) => {
      const item = typeof entry === "string" ? { field: entry } : entry;
      if (!item || typeof item !== "object") throw new TypeError("orderBy deve usar campos controlados.");
      const direction = item.direction === undefined ? "asc" : text(item.direction, "orderBy.direction").toLowerCase();
      if (direction !== "asc" && direction !== "desc") throw new TypeError("orderBy.direction deve ser asc ou desc.");
      return { field: field(item.field, resolver), direction };
    });
  }
  const size = query.pageSize ?? query.top;
  if (size !== undefined) {
    if (!Number.isInteger(size) || size < 1) throw new TypeError("pageSize/top deve ser um inteiro positivo.");
    output.top = size;
  }
  if (query.pageSize !== undefined && query.top !== undefined && query.pageSize !== query.top) throw new TypeError("pageSize e top não podem divergir.");
  return Object.freeze(output);
}

export const buildQuery = normalizeQuery;
