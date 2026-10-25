import { createMapper } from "./mapper.js";
import { normalizeQuery } from "./query.js";

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} deve ser um objeto.`);
  }
  return value;
}

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} deve ser um texto não vazio.`);
  return value.trim();
}

function responseItems(response) {
  const data = response?.data ?? response;
  const value = data?.value ?? data?.d?.results ?? data?.d;
  return Array.isArray(value) ? value : [];
}

function nextLink(response) {
  const data = response?.data ?? response;
  return data?.["@odata.nextLink"] ?? data?.["odata.nextLink"] ?? data?.d?.__next ?? null;
}

function result(item, response) {
  if (item === null || item === undefined) return item;
  Object.defineProperties(item, {
    etag: { value: response?.etag ?? null, enumerable: false }
  });
  return Object.freeze(item);
}

function page(items, response, query) {
  const link = nextLink(response);
  return Object.freeze({
    items,
    page: Object.freeze({ hasMore: Boolean(link), nextCursor: link }),
    nextLink: link,
    hasNextPage: Boolean(link),
    pageSize: query?.top
  });
}

function validateSource(source) {
  if (typeof source === "string") return text(source, "source");
  object(source, "source");
  if (Object.keys(source).length === 0) throw new TypeError("source não pode ser vazio.");
  return source;
}

function validateSchema(schema) {
  object(schema, "schema");
  if (schema.fields !== undefined && !Array.isArray(schema.fields)) throw new TypeError("schema.fields deve ser uma lista.");
  return schema;
}

function validateMapper(value) {
  if (!value || typeof value !== "object") throw new TypeError("mapper deve ser um mapper.");
  for (const method of ["mapItem", "mapCreate", "mapUpdate"]) {
    if (typeof value[method] !== "function") throw new TypeError(`mapper.${method} deve ser uma função.`);
  }
  return value;
}

function validateClient(client) {
  object(client, "client");
  for (const method of ["getListItems", "getListItem", "createListItem", "updateListItem", "deleteListItem"]) {
    if (typeof client[method] !== "function") throw new TypeError(`client.${method} deve ser uma função.`);
  }
  return client;
}

function itemId(id) {
  if ((typeof id !== "string" && typeof id !== "number") || String(id).trim() === "") {
    throw new TypeError("id deve ser informado.");
  }
  return id;
}

function paginationOptions(options) {
  object(options, "options");
  const { maxPages = Infinity, maxItems = Infinity } = options;
  if ((!Number.isInteger(maxPages) && maxPages !== Infinity) || maxPages < 1
    || (!Number.isInteger(maxItems) && maxItems !== Infinity) || maxItems < 0) {
    throw new TypeError("maxPages deve ser positivo e maxItems não negativo.");
  }
  return { maxPages, maxItems };
}

/**
 * Creates a domain-oriented repository over a SharePoint list client.
 * `source` is retained as repository metadata and is deliberately not used to
 * build URLs; the injected client remains the only request authority.
 */
export function createRepository({ source, schema, mapper, client } = {}) {
  const sourceValue = validateSource(source);
  const schemaValue = schema === undefined ? {} : validateSchema(schema);
  const clientValue = validateClient(client);
  const mapperValue = mapper === undefined
    ? createMapper({ schema: schemaValue })
    : validateMapper(mapper);

  function queryOptions(query = {}) {
    return normalizeQuery(query, mapperValue);
  }

  async function findById(id, options = {}) {
    itemId(id);
    object(options, "options");
    const query = queryOptions(options.query ?? options);
    const response = await clientValue.getListItem(id, query);
    return result(mapperValue.mapItem(response?.data ?? response), response);
  }

  async function findMany(query = {}, options = {}) {
    const normalized = queryOptions(query);
    const { maxPages, maxItems } = paginationOptions(options);
    let response;
    let link;
    const items = [];
    const seenLinks = new Set();
    for (let pageNumber = 0; pageNumber < maxPages && items.length < maxItems; pageNumber += 1) {
      response = await clientValue.getListItems(link ? { nextLink: link } : normalized);
      const pageItems = responseItems(response).map((item) => mapperValue.mapItem(item));
      items.push(...pageItems.slice(0, Math.max(0, maxItems - items.length)));
      link = nextLink(response);
      if (!link) break;
      if (seenLinks.has(link)) {
        const error = new Error("O SharePoint retornou um cursor de paginação repetido.");
        error.code = "pagination-loop";
        throw error;
      }
      seenLinks.add(link);
    }
    return page(items, response, normalized);
  }

  async function count(query = {}) {
    const countField = Object.keys(mapperValue.fields ?? {})[0];
    const normalized = queryOptions({ ...query, select: query.select ?? (countField ? [countField] : undefined) });
    const response = typeof clientValue.getAllPages === "function"
      ? await clientValue.getAllPages(normalized)
      : await collectPages(normalized);
    const data = response?.data ?? response;
    return Number.isInteger(data?.["@odata.count"]) ? data["@odata.count"] : responseItems(response).length;
  }

  async function collectPages(normalized) {
    const items = [];
    let response;
    let link;
    do {
      response = await clientValue.getListItems(link ? { nextLink: link } : normalized);
      items.push(...responseItems(response));
      link = nextLink(response);
    } while (link);
    return { ...response, data: { ...(response?.data ?? {}), value: items } };
  }

  async function create(input) {
    const response = await clientValue.createListItem(mapperValue.mapCreate(input));
    return result(mapperValue.mapItem(response?.data ?? response), response);
  }

  async function update(id, input, options = {}) {
    itemId(id);
    object(options, "options");
    const etag = text(options.etag, "options.etag");
    const clientOptions = { etag };
    if (options.allowWildcardEtag === true) clientOptions.allowWildcardEtag = true;
    const response = await clientValue.updateListItem(id, mapperValue.mapUpdate(input), clientOptions);
    const item = response?.data == null ? null : mapperValue.mapItem(response.data);
    return result(item, response);
  }

  async function remove(id, options = {}) {
    itemId(id);
    object(options, "options");
    const clientOptions = { etag: text(options.etag, "options.etag") };
    if (options.allowWildcardEtag === true) clientOptions.allowWildcardEtag = true;
    const response = await clientValue.deleteListItem(id, clientOptions);
    return undefined;
  }

  return Object.freeze({ source: sourceValue, schema: schemaValue, findById, findMany, count, create, update, delete: remove });
}
