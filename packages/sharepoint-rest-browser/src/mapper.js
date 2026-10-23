/* Controlled translation between repository names and SharePoint field names. */

function object(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} deve ser um objeto.`);
  }
  return value;
}

function name(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} deve ser um texto não vazio.`);
  return value.trim();
}

function sourceMappings({ mapping, mappings, schema } = {}) {
  const supplied = mapping ?? mappings;
  const result = {};
  if (supplied !== undefined) {
    object(supplied, "mapping");
    for (const [domain, definition] of Object.entries(supplied)) {
      const key = name(domain, "mapping field");
      const entry = typeof definition === "string" ? { internalName: definition } : object(definition, `mapping.${key}`);
      const internalName = name(entry.internalName ?? entry.internal ?? entry.name, `mapping.${key}.internalName`);
      if (entry.required !== undefined && typeof entry.required !== "boolean") throw new TypeError(`mapping.${key}.required deve ser booleano.`);
      result[key] = { internalName, required: entry.required === true };
      if (entry.readOnly !== undefined && typeof entry.readOnly !== "boolean") throw new TypeError(`mapping.${key}.readOnly deve ser booleano.`);
      result[key].readOnly = entry.readOnly === true;
    }
  } else if (schema?.fields) {
    if (!Array.isArray(schema.fields)) throw new TypeError("schema.fields deve ser uma lista.");
    for (const field of schema.fields) {
      object(field, "schema field");
      const internalName = name(field.internalName, "schema field.internalName");
      result[internalName] = { internalName, required: field.required === true };
    }
  }
  return result;
}

function clone(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clone);
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = clone(item);
  return result;
}

export function createMapper(options = {}) {
  object(options, "options");
  const definitions = sourceMappings(options);
  const domainToInternal = new Map(Object.entries(definitions).map(([domain, definition]) => [domain, definition.internalName]));
  const internalToDomain = new Map(Object.entries(definitions).map(([domain, definition]) => [definition.internalName, domain]));
  if (internalToDomain.size !== domainToInternal.size) throw new TypeError("mapping não pode repetir nomes internos.");
  const known = (field) => domainToInternal.has(field);

  function validateInput(input, { partial = false, allowNull = true } = {}) {
    object(input, "input");
    const result = {};
    for (const [domain, value] of Object.entries(input)) {
      if (!known(domain)) throw new TypeError(`Campo desconhecido: ${domain}.`);
      const definition = definitions[domain];
      if (definition.readOnly) throw new TypeError(`Campo somente leitura: ${domain}.`);
      if (value === undefined) continue;
      if (value === null && !allowNull) throw new TypeError(`Valor obrigatório ausente: ${domain}.`);
      result[definition.internalName] = clone(value);
    }
    if (!partial) {
      for (const [domain, definition] of Object.entries(definitions)) {
        if (definition.required && (input[domain] === undefined || input[domain] === null || input[domain] === "")) {
          throw new TypeError(`Valor obrigatório ausente: ${domain}.`);
        }
      }
    }
    return result;
  }

  function mapItem(raw) {
    const item = raw?.d?.results ?? raw?.d ?? raw;
    object(item, "item");
    const result = {};
    for (const [internal, domain] of internalToDomain.entries()) {
      if (Object.prototype.hasOwnProperty.call(item, internal)) result[domain] = clone(item[internal]);
    }
    return result;
  }

  const mapper = {
    mapItem,
    mapInput: (input, options = {}) => validateInput(input, options),
    mapCreate: (input) => validateInput(input, { partial: false }),
    mapUpdate: (input) => validateInput(input, { partial: true }),
    toInternal(field) {
      if (!known(field)) throw new TypeError(`Campo desconhecido: ${field}.`);
      return domainToInternal.get(field);
    },
    toDomain(field) {
      return internalToDomain.get(field) ?? field;
    },
    fields: Object.freeze(Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, Object.freeze({ ...value })])))
  };
  return Object.freeze(mapper);
}

export function mapItem(raw, mapperOrOptions = {}) {
  return (mapperOrOptions?.mapItem ? mapperOrOptions : createMapper(mapperOrOptions)).mapItem(raw);
}

export function mapInput(input, mapperOrOptions = {}, options = {}) {
  return (mapperOrOptions?.mapInput ? mapperOrOptions : createMapper(mapperOrOptions)).mapInput(input, options);
}

export function mapCreate(input, mapperOrOptions = {}) {
  return (mapperOrOptions?.mapCreate ? mapperOrOptions : createMapper(mapperOrOptions)).mapCreate(input);
}

export function mapUpdate(input, mapperOrOptions = {}) {
  return (mapperOrOptions?.mapUpdate ? mapperOrOptions : createMapper(mapperOrOptions)).mapUpdate(input);
}
