/*
 * A small list-oriented layer.  It deliberately does not know how requests
 * are authenticated: that remains the responsibility of the REST transport.
 */

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} deve ser um texto não vazio.`);
  return value.trim();
}

function values(value, name) {
  if (value === undefined) return undefined;
  const result = Array.isArray(value) ? value : [value];
  if (!result.length || result.some((item) => typeof item !== "string" || !item.trim())) {
    throw new TypeError(`${name} deve conter textos não vazios.`);
  }
  return result.map((item) => item.trim()).join(",");
}

function orderByValue(value) {
  if (value === undefined) return undefined;
  const entries = Array.isArray(value) ? value : [value];
  if (!entries.length) throw new TypeError("orderBy deve conter valores.");
  return entries.map((entry) => {
    if (typeof entry === "string") return text(entry, "orderBy");
    if (!entry || typeof entry !== "object") throw new TypeError("orderBy deve conter textos ou objetos.");
    const field = text(entry.field, "orderBy.field");
    const direction = entry.direction === undefined ? "asc" : text(entry.direction, "orderBy.direction").toLowerCase();
    if (direction !== "asc" && direction !== "desc") throw new TypeError("orderBy.direction deve ser asc ou desc.");
    return `${field} ${direction}`;
  }).join(",");
}

function queryString({ select, expand, filter, orderBy, top } = {}) {
  const parts = [];
  const add = (name, value) => {
    if (value !== undefined) parts.push(`${name}=${encodeURIComponent(value)}`);
  };
  add("$select", values(select, "select"));
  add("$expand", values(expand, "expand"));
  if (filter !== undefined) add("$filter", text(filter, "filter"));
  add("$orderby", orderByValue(orderBy));
  if (top !== undefined) {
    if (!Number.isInteger(top) || top < 0) throw new TypeError("top deve ser um inteiro não negativo.");
    add("$top", String(top));
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function listSegment({ listId, listPath }) {
  if ((listId === undefined) === (listPath === undefined)) {
    throw new TypeError("Informe exatamente um de listId ou listPath.");
  }
  if (listId !== undefined) {
    const id = text(listId, "listId");
    // A GUID is kept as a GUID literal, as required by SharePoint's REST API.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new TypeError("listId deve ser um GUID válido.");
    }
    return `lists(guid'${id}')`;
  }
  const path = text(listPath, "listPath").replace(/^\/+|\/+$/g, "");
  // listPath is an API segment (for example lists/getbytitle('Tasks')), not a URL.
  if (!/^lists\//i.test(path) || /[?#]|\.\.|\\/.test(path)) {
    throw new TypeError("listPath deve ser um caminho REST de lista seguro.");
  }
  return path;
}

function safeNextLink(nextLink, restRoot) {
  const value = text(nextLink, "nextLink");
  if (/^\/\//.test(value)) throw new TypeError("nextLink deve permanecer no site SharePoint configurado.");
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const configuredOrigin = globalThis.location?.origin;
    if (!configuredOrigin || url.origin !== configuredOrigin) {
      throw new TypeError("nextLink deve permanecer no site SharePoint configurado.");
    }
    path = `${url.pathname}${url.search}`;
  }
  if (path.startsWith("/_api/")) path = `${restRoot.replace(/\/_api$/, "")}${path}`;
  if (!path.startsWith(`${restRoot}/`) && path !== restRoot) {
    throw new TypeError("nextLink deve permanecer no caminho REST do site configurado.");
  }
  return path;
}

function nextLinkFrom(data) {
  return data?.["@odata.nextLink"] ?? data?.["odata.nextLink"] ?? data?.d?.__next ?? null;
}

export function createSharePointListClient({ transport, listId, listPath } = {}) {
  if (!transport || typeof transport.request !== "function") throw new TypeError("transport.request deve ser uma função.");
  if (typeof transport.webUrl !== "string" || /[?#]/.test(transport.webUrl)) throw new TypeError("transport.webUrl deve ser uma URL server-relative.");
  const site = transport.webUrl.trim().replace(/\/+$/, "");
  const segment = listSegment({ listId, listPath });
  const restRoot = `${site}/_api`;
  const itemsPath = `${restRoot}/web/${segment}/items`;
  const itemPath = (id) => {
    if ((typeof id !== "string" && typeof id !== "number") || String(id).trim() === "") throw new TypeError("id deve ser informado.");
    return `${itemsPath}(${encodeURIComponent(String(id).trim())})`;
  };

  async function getListItems(options = {}) {
    const { nextLink, ...query } = options;
    const path = nextLink === undefined ? `${itemsPath}${queryString(query)}` : safeNextLink(nextLink, restRoot);
    return transport.request(path, { method: "GET" });
  }

  async function getListItem(id, options = {}) {
    return transport.request(`${itemPath(id)}${queryString(options)}`, { method: "GET" });
  }

  async function createListItem(valuesToCreate) {
    if (!valuesToCreate || typeof valuesToCreate !== "object" || Array.isArray(valuesToCreate)) throw new TypeError("values deve ser um objeto.");
    return transport.request(itemsPath, { method: "POST", body: valuesToCreate });
  }

  async function updateListItem(id, valuesToUpdate, options = {}) {
    if (!valuesToUpdate || typeof valuesToUpdate !== "object" || Array.isArray(valuesToUpdate)) throw new TypeError("values deve ser um objeto.");
    return transport.request(itemPath(id), { method: "MERGE", body: valuesToUpdate, etag: options.etag, allowWildcardEtag: options.allowWildcardEtag });
  }

  async function deleteListItem(id, options = {}) {
    return transport.request(itemPath(id), { method: "DELETE", etag: options.etag, allowWildcardEtag: options.allowWildcardEtag });
  }

  async function getAllPages(query = {}, { maxPages = Infinity, maxItems = Infinity } = {}) {
    if (!Number.isInteger(maxPages) || maxPages < 1 || (!Number.isFinite(maxItems) && maxItems !== Infinity) || maxItems < 0) {
      throw new TypeError("maxPages deve ser positivo e maxItems não negativo.");
    }
    const items = [];
    let response;
    let nextLink;
    for (let page = 0; page < maxPages && items.length < maxItems; page += 1) {
      response = await getListItems(nextLink ? { nextLink } : query);
      const pageItems = response?.data?.value ?? response?.data?.d?.results ?? [];
      if (Array.isArray(pageItems)) items.push(...pageItems.slice(0, Math.max(0, maxItems - items.length)));
      nextLink = nextLinkFrom(response?.data);
      if (!nextLink) break;
    }
    return response ? { ...response, data: { ...(response.data ?? {}), value: items } } : response;
  }

  return Object.freeze({ getListItems, getListItem, createListItem, updateListItem, deleteListItem, getAllPages });
}
