const DEFAULT_ACCEPT = "application/json;odata=nometadata";
const METHODS = new Set(["GET", "POST", "MERGE", "DELETE"]);

export class SharePointRestError extends Error {
  constructor(code, message, { status, path, retryAfterMs, cause } = {}) {
    super(message, { cause });
    this.name = "SharePointRestError";
    this.code = code;
    if (status !== undefined) this.status = status;
    if (path !== undefined) this.path = path;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

function webPath(webUrl) {
  if (typeof webUrl !== "string" || !webUrl.trim()) {
    throw new SharePointRestError("context-unavailable", "webUrl deve ser uma URL server-relative.");
  }
  const value = webUrl.trim().replace(/\/+$/, "");
  if (value === "" || value === "/") return "";
  if (!value.startsWith("/") || value.startsWith("//") || /[?#]/.test(value) || /^\/[^/]*:/i.test(value)) {
    throw new TypeError("webUrl deve ser uma URL server-relative.");
  }
  return value;
}

function apiPath(webUrl, path) {
  if (typeof path !== "string" || !path.trim()) throw new TypeError("path deve ser um texto não vazio.");
  let value = path.trim();
  if (/^https?:\/\//i.test(value)) {
    const absolute = new URL(value);
    if (absolute.origin !== "null" && absolute.origin !== globalThis.location?.origin) {
      throw new TypeError("path deve apontar para o site SharePoint atual.");
    }
    value = `${absolute.pathname}${absolute.search}`;
  }
  if (value.startsWith("/_api/")) value = `${webUrl}${value}`;
  const prefix = `${webUrl}/_api/`;
  if (!value.startsWith(prefix)) throw new TypeError("path deve apontar para a API REST do site atual.");
  return value;
}

function retryAfter(response, now) {
  const value = response.headers?.get?.("Retry-After");
  if (value === null || value === undefined || value === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now());
}

function header(response, name) {
  return response.headers?.get?.(name) ?? response.headers?.get?.(name.toLowerCase()) ?? null;
}

async function responseBody(response, responseType) {
  if (response.status === 204) return null;
  if (responseType === "binary") {
    try { return typeof response.arrayBuffer === "function" ? await response.arrayBuffer() : await response.blob(); }
    catch (cause) { throw new SharePointRestError("invalid-response", "Não foi possível ler a resposta binária.", { cause }); }
  }
  let text;
  try {
    text = typeof response.text === "function" ? await response.text() : JSON.stringify(await response.json());
  } catch (cause) {
    throw new SharePointRestError("invalid-response", "O SharePoint retornou uma resposta JSON inválida.", { cause });
  }
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); }
  catch (cause) { throw new SharePointRestError("invalid-response", "O SharePoint retornou uma resposta JSON inválida.", { cause }); }
}

function responseError(response, path, retryAfterMs) {
  let code = "request-failed";
  if (response.status === 401 || response.status === 403) code = "access-denied";
  else if (response.status === 404) code = "not-found";
  else if (response.status === 412) code = "concurrency-conflict";
  else if (response.status === 429 || response.status === 503) code = "throttled";
  return new SharePointRestError(code, `A operação REST falhou (HTTP ${response.status}).`, {
    status: response.status, path, retryAfterMs: retryAfterMs ?? undefined
  });
}

function isBinary(value) {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value)
    || (typeof Blob !== "undefined" && value instanceof Blob);
}

export function createSharePointRestClient({
  webUrl,
  fetchImpl = globalThis.fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowImpl = Date.now,
  maxRetries = 2
} = {}) {
  const site = webPath(webUrl);
  if (typeof fetchImpl !== "function") throw new SharePointRestError("fetch-unavailable", "A API fetch não está disponível.");
  if (typeof sleepImpl !== "function" || typeof nowImpl !== "function") throw new TypeError("sleepImpl e nowImpl devem ser funções.");
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) throw new TypeError("maxRetries deve ser um inteiro entre 0 e 5.");
  let digestValue;
  let digestExpiresAt = 0;
  let digestRequest;

  async function fetchResponse(url, options, retryGet) {
    for (let attempt = 0; ; attempt += 1) {
      let response;
      try { response = await fetchImpl(url, options); }
      catch (cause) { throw new SharePointRestError("network-error", "Falha de rede ao acessar o SharePoint.", { cause, path: url }); }
      const delay = retryAfter(response, nowImpl);
      const canRetry = retryGet && (response.status === 429 || response.status === 503) && attempt < maxRetries;
      if (!canRetry) {
        if (!response.ok) throw responseError(response, url, delay);
        return response;
      }
      await sleepImpl(delay ?? Math.min(1000 * (2 ** attempt), 30000));
    }
  }

  async function getDigest() {
    if (digestValue && digestExpiresAt > nowImpl()) return digestValue;
    if (digestRequest) return digestRequest;
    digestRequest = (async () => {
      const path = `${site}/_api/contextinfo`;
      const response = await fetchResponse(path, { method: "POST", headers: { Accept: DEFAULT_ACCEPT } }, false);
      const data = await responseBody(response, "json");
      const context = data?.GetContextWebInformation ?? data?.d?.GetContextWebInformation ?? data?.d ?? data;
      if (!context?.FormDigestValue) throw new SharePointRestError("invalid-response", "O SharePoint não retornou um request digest.", { path });
      const lifetime = Number(context.FormDigestTimeoutSeconds) || 1800;
      digestValue = context.FormDigestValue;
      digestExpiresAt = nowImpl() + Math.max(0, lifetime - 30) * 1000;
      return digestValue;
    })();
    try { return await digestRequest; }
    catch (error) { digestValue = undefined; digestExpiresAt = 0; throw error; }
    finally { digestRequest = undefined; }
  }

  async function request(path, { method = "GET", headers = {}, body, etag, allowWildcardEtag = false, responseType = "json" } = {}) {
    const requestedMethod = String(method).toUpperCase();
    if (!METHODS.has(requestedMethod)) throw new TypeError("method deve ser GET, POST, MERGE ou DELETE.");
    if (!new Set(["json", "binary"]).has(responseType)) throw new TypeError("responseType deve ser json ou binary.");
    const url = apiPath(site, path);
    const write = requestedMethod !== "GET";
    if ((requestedMethod === "MERGE" || requestedMethod === "DELETE") &&
      (typeof etag !== "string" || !etag.trim() || (etag.trim() === "*" && !allowWildcardEtag))) {
      throw new SharePointRestError("etag-required", "A ETag exata é obrigatória para alterar ou excluir.", { path: url });
    }
    const requestHeaders = { Accept: DEFAULT_ACCEPT, ...headers };
    let transportMethod = requestedMethod;
    if (write) {
      requestHeaders["X-RequestDigest"] = await getDigest();
      if (body !== undefined && !isBinary(body)) {
        requestHeaders["Content-Type"] ||= DEFAULT_ACCEPT;
        body = typeof body === "string" ? body : JSON.stringify(body);
      } else if (body !== undefined) requestHeaders["Content-Type"] ||= "application/octet-stream";
      if (requestedMethod === "MERGE" || requestedMethod === "DELETE") {
        transportMethod = "POST";
        requestHeaders["X-HTTP-Method"] = requestedMethod;
        requestHeaders["If-Match"] = etag.trim();
      }
    }
    const options = { method: transportMethod, headers: requestHeaders };
    if (body !== undefined) options.body = body;
    const response = await fetchResponse(url, options, requestedMethod === "GET");
    let data;
    try { data = await responseBody(response, responseType); }
    catch (error) { error.path ??= url; throw error; }
    return Object.freeze({ data, etag: header(response, "ETag") || data?.["@odata.etag"] || data?.__metadata?.etag || null, status: response.status });
  }

  return Object.freeze({ webUrl: site, request, getDigest });
}

export { DEFAULT_ACCEPT };
export { createSharePointListClient } from "./list-client.js";
export { defineListSchema, validateListSchema } from "./schema.js";
export { createDataSourceRegistry } from "./data-sources.js";
export { createProvisioningManager } from "./provisioning.js";
export { createMapper, mapItem, mapInput, mapCreate, mapUpdate } from "./mapper.js";
export { normalizeQuery, buildQuery } from "./query.js";
export { createRepository } from "./repository.js";
