import { createSharePointRestClient } from "./index.js";
import { createSharePointListClient } from "./list-client.js";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serverRelative(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} deve ser uma URL server-relative.`);
  }
  const result = value.trim().replace(/\/+$/, "");
  if (result === "" || result === "/") return "";
  if (!result.startsWith("/") || result.startsWith("//") || /[?#\\]/.test(result) || /^\/[^/]*:/i.test(result)) {
    throw new TypeError(`${name} deve ser uma URL server-relative.`);
  }
  return result;
}

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} deve ser um texto não vazio.`);
  return value.trim();
}

function listDetails(source) {
  const hasId = source.listId !== undefined;
  const hasPath = source.listPath !== undefined;
  if (hasId && hasPath) throw new TypeError("A fonte deve informar exatamente um de listId ou listPath.");

  if (hasId) {
    const listId = text(source.listId, "listId");
    if (!GUID.test(listId)) throw new TypeError("listId deve ser um GUID válido.");
    return { listId };
  }
  if (hasPath) {
    const listPath = text(source.listPath, "listPath").replace(/^\/+|\/+$/g, "");
    if (!/^lists\//i.test(listPath) || /[?#]|\.\.|\\/.test(listPath)) {
      throw new TypeError("listPath deve ser um caminho REST de lista seguro.");
    }
    return { listPath };
  }
  return {};
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function clone(value, seen = new WeakMap()) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  const result = Array.isArray(value) ? [] : {};
  seen.set(value, result);
  for (const [key, child] of Object.entries(value)) result[key] = clone(child, seen);
  return result;
}

function sourceEntries(sources) {
  if (sources === undefined) return [];
  if (Array.isArray(sources)) return sources.map((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("sources deve conter objetos de fonte.");
    }
    return source;
  });
  if (!sources || typeof sources !== "object") throw new TypeError("sources deve ser um array ou objeto.");
  return Object.entries(sources).map(([key, source]) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("sources deve conter objetos de fonte.");
    }
    return { ...source, key: source.key ?? key };
  });
}

/**
 * Builds a closed registry of the SharePoint sites and lists an application may use.
 * Runtime methods deliberately accept keys, rather than URLs, so callers cannot
 * turn this registry into an arbitrary SharePoint request factory.
 */
export function createDataSourceRegistry({
  transportFactory = createSharePointRestClient,
  allowedWebUrls,
  sources = []
} = {}) {
  if (typeof transportFactory !== "function") throw new TypeError("transportFactory deve ser uma função.");
  if (!Array.isArray(allowedWebUrls) && !(allowedWebUrls instanceof Set)) {
    throw new TypeError("allowedWebUrls deve ser um array ou Set de URLs server-relative.");
  }

  const allowed = new Set([...allowedWebUrls].map((url) => serverRelative(url, "allowedWebUrls")));
  const records = new Map();
  const transports = new Map();
  const listClients = new Map();

  for (const source of sourceEntries(sources)) {
    const key = text(source.key, "source.key");
    if (records.has(key)) throw new TypeError(`A chave de fonte já existe: ${key}.`);
    const webUrl = serverRelative(source.webUrl, "source.webUrl");
    if (!allowed.has(webUrl)) throw new TypeError(`source.webUrl não está em allowedWebUrls: ${webUrl}.`);
    const details = listDetails(source);

    // Keep application metadata, but never expose the caller's mutable object.
    const metadata = clone({ ...source, key, webUrl, ...details });
    if (!Object.prototype.hasOwnProperty.call(details, "listId")) delete metadata.listId;
    if (!Object.prototype.hasOwnProperty.call(details, "listPath")) delete metadata.listPath;
    records.set(key, freeze(metadata));
  }

  const keys = Object.freeze([...records.keys()]);
  const lookup = (key) => records.get(key);

  const registry = {
    get(key) {
      return lookup(key);
    },
    has(key) {
      return records.has(key);
    },
    keys() {
      return keys;
    },
    getTransport(key) {
      const metadata = lookup(key);
      if (!metadata) return undefined;
      if (!transports.has(key)) {
        const transport = transportFactory({ webUrl: metadata.webUrl });
        if (!transport || typeof transport.request !== "function") {
          throw new TypeError("transportFactory deve retornar um cliente com request().");
        }
        transports.set(key, transport);
      }
      return transports.get(key);
    },
    getListClient(key) {
      const metadata = lookup(key);
      if (!metadata) return undefined;
      if (!metadata.listId && !metadata.listPath) return undefined;
      if (!listClients.has(key)) {
        listClients.set(key, createSharePointListClient({
          transport: registry.getTransport(key),
          listId: metadata.listId,
          listPath: metadata.listPath
        }));
      }
      return listClients.get(key);
    }
  };

  return Object.freeze(registry);
}
