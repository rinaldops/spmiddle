/*
 * A local, declarative contract for list schemas.
 *
 * This module intentionally has no SharePoint knowledge beyond the names of
 * field types.  In particular, defining a schema never provisions anything
 * and never performs a network request.
 */

const BASIC_TYPES = new Map([
  ["text", "Text"],
  ["multilinetext", "MultilineText"],
  ["note", "MultilineText"],
  ["number", "Number"],
  ["currency", "Currency"],
  ["integer", "Integer"],
  ["boolean", "Boolean"],
  ["datetime", "DateTime"],
  ["date", "DateTime"],
  ["choice", "Choice"],
  ["lookup", "Lookup"],
  ["user", "User"],
  ["url", "URL"]
]);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KEY = /^[A-Za-z][A-Za-z0-9._-]*$/;
const JOOMLA_LIST_NAME = /^mse[A-Z][A-Za-z0-9]*$/;

export function validateJoomlaListName(value) {
  if (typeof value !== "string" || !JOOMLA_LIST_NAME.test(value.trim())) {
    throw new TypeError("O nome da lista Joomla deve começar por mse e usar apenas PascalCase ASCII.");
  }
  return value.trim();
}

function plainObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${name} deve ser um objeto.`);
  }
  return value;
}

function requiredText(value, name, pattern = null) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} deve ser um texto não vazio.`);
  const result = value.trim();
  if (pattern && !pattern.test(result)) throw new TypeError(`${name} contém caracteres inválidos.`);
  return result;
}

function optionalText(value, name) {
  return value === undefined ? undefined : requiredText(value, name);
}

function copyAndFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new TypeError("O schema não pode conter referências circulares.");
  seen.add(value);
  if (Array.isArray(value)) {
    const copy = value.map((item) => copyAndFreeze(item, seen));
    seen.delete(value);
    return Object.freeze(copy);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("O schema só pode conter objetos simples.");
  const copy = {};
  for (const [key, item] of Object.entries(value)) copy[key] = copyAndFreeze(item, seen);
  seen.delete(value);
  return Object.freeze(copy);
}

function lookupMetadata(value, name) {
  if (value === undefined) return undefined;
  const lookup = plainObject(value, name);
  const result = {
    listKey: requiredText(lookup.listKey, `${name}.listKey`, KEY),
    fieldInternalName: requiredText(lookup.fieldInternalName ?? "Title", `${name}.fieldInternalName`, IDENTIFIER)
  };
  // Do not accept URLs, IDs, or arbitrary provisioning options here.  Those
  // make a schema environment-specific and belong to a provisioning layer.
  if (Object.keys(lookup).some((key) => !["listKey", "fieldInternalName"].includes(key))) {
    throw new TypeError(`${name} contém propriedades não suportadas.`);
  }
  return result;
}

function normalizeField(field, index) {
  const source = plainObject(field, `fields[${index}]`);
  const internalName = requiredText(source.internalName, `fields[${index}].internalName`, IDENTIFIER);
  const typeText = requiredText(source.type, `fields[${index}].type`);
  const type = BASIC_TYPES.get(typeText.toLowerCase());
  if (!type) throw new TypeError(`fields[${index}].type não é suportado.`);
  if (source.required !== undefined && typeof source.required !== "boolean") throw new TypeError(`fields[${index}].required deve ser booleano.`);
  const result = { internalName, type };
  const displayName = optionalText(source.displayName, `fields[${index}].displayName`);
  if (displayName !== undefined) result.displayName = displayName;
  if (source.required !== undefined) result.required = source.required;

  if (source.choices !== undefined) {
    if (type !== "Choice" || !Array.isArray(source.choices) || !source.choices.length
      || source.choices.some((choice) => typeof choice !== "string" || !choice.trim())) {
      throw new TypeError(`fields[${index}].choices só pode ser uma lista não vazia de textos para Choice.`);
    }
    const choices = source.choices.map((choice) => choice.trim());
    if (new Set(choices).size !== choices.length) throw new TypeError(`fields[${index}].choices não pode conter duplicatas.`);
    result.choices = choices;
  } else if (type === "Choice") {
    throw new TypeError(`fields[${index}].choices é obrigatório para Choice.`);
  }
  if (source.defaultValue !== undefined) result.defaultValue = copyAndFreeze(source.defaultValue);
  if (source.lookup !== undefined) {
    if (type !== "Lookup") throw new TypeError(`fields[${index}].lookup só pode ser usado em Lookup.`);
    result.lookup = lookupMetadata(source.lookup, `fields[${index}].lookup`);
  } else if (type === "Lookup") {
    throw new TypeError(`fields[${index}].lookup é obrigatório para Lookup.`);
  }
  const supported = new Set(["internalName", "type", "displayName", "required", "choices", "defaultValue", "lookup"]);
  if (Object.keys(source).some((key) => !supported.has(key))) throw new TypeError(`fields[${index}] contém propriedades não suportadas.`);
  return result;
}

function normalizeIndexes(value, fieldNames) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError("indexes deve ser uma lista.");
  return value.map((entry, index) => {
    const source = typeof entry === "string" || Array.isArray(entry) ? { fields: entry } : plainObject(entry, `indexes[${index}]`);
    const fields = Array.isArray(source.fields) ? source.fields : [source.fields];
    if (!fields.length || fields.some((field) => typeof field !== "string" || !IDENTIFIER.test(field.trim()))) {
      throw new TypeError(`indexes[${index}].fields deve referenciar campos válidos.`);
    }
    const normalizedFields = fields.map((field) => field.trim());
    if (normalizedFields.some((field) => !fieldNames.has(field))) throw new TypeError(`indexes[${index}] referencia um campo desconhecido.`);
    if (new Set(normalizedFields).size !== normalizedFields.length) throw new TypeError(`indexes[${index}] não pode repetir campos.`);
    if (source.unique !== undefined && typeof source.unique !== "boolean") throw new TypeError(`indexes[${index}].unique deve ser booleano.`);
    if (Object.keys(source).some((key) => !["fields", "unique"].includes(key))) throw new TypeError(`indexes[${index}] contém propriedades não suportadas.`);
    return { fields: normalizedFields, unique: source.unique === true };
  });
}

export function validateListSchema(schema) {
  const source = plainObject(schema, "schema");
  const key = requiredText(source.key, "key", KEY);
  const internalName = requiredText(source.internalName, "internalName", IDENTIFIER);
  const displayName = requiredText(source.displayName, "displayName");
  if (source.template === undefined || (typeof source.template !== "string" && !Number.isInteger(source.template))) throw new TypeError("template deve ser um texto ou inteiro.");
  const template = typeof source.template === "string" ? requiredText(source.template, "template") : source.template;
  if (typeof template === "number" && template < 1) throw new TypeError("template deve ser positivo.");
  if (!Number.isInteger(source.schemaVersion) || source.schemaVersion < 1) throw new TypeError("schemaVersion deve ser um inteiro positivo.");
  if (!Array.isArray(source.fields)) throw new TypeError("fields deve ser uma lista.");
  const fields = source.fields.map(normalizeField);
  const names = new Set();
  for (const field of fields) {
    if (names.has(field.internalName)) throw new TypeError(`Campo duplicado: ${field.internalName}.`);
    names.add(field.internalName);
  }
  const indexes = normalizeIndexes(source.indexes, names);
  const supported = new Set(["key", "internalName", "displayName", "template", "schemaVersion", "fields", "indexes"]);
  if (Object.keys(source).some((name) => !supported.has(name))) throw new TypeError("schema contém propriedades não suportadas.");
  return copyAndFreeze({ key, internalName, displayName, template, schemaVersion: source.schemaVersion, fields, indexes });
}

export function defineListSchema(schema) {
  return validateListSchema(schema);
}
