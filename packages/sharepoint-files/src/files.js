/*
 * Small, dependency-free file layer.  It intentionally does not know about
 * File, Blob, fetch, or the SharePoint transport implementation.  Callers
 * provide a server-relative REST path and a transport with request(path, opts).
 */

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_MAX_ITEMS = 10000;

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} deve ser um nome/caminho de texto não vazio.`);
  return value.trim();
}

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} deve ser um objeto.`);
  return value;
}

function serverPath(value, name) {
  const path = text(value, name);
  if (!path.startsWith("/") || path.startsWith("//") || /[?#]|[\u0000-\u001f\u007f]/.test(path) || /^(?:[a-z][a-z\d+.-]*:)/i.test(path)) {
    throw new TypeError(`${name} deve ser um caminho server-relative seguro.`);
  }
  if (path.split("/").some((part) => part === ".." || part === ".")) {
    throw new TypeError(`${name} não pode conter traversal.`);
  }
  return path.replace(/\/+$/, "") || "/";
}

function relativeName(value, name = "name", allowNested = false) {
  const result = text(value, name);
  if (result.startsWith("/") || result.startsWith("\\") || result.includes("\\") || /[?#]|[\u0000-\u001f\u007f]/.test(result)) {
    throw new TypeError(`${name} deve ser um nome/caminho relativo sem caracteres de controle.`);
  }
  const parts = result.split("/");
  if (!allowNested && parts.length > 1) throw new TypeError(`${name} deve ser um nome de arquivo sem caminho.`);
  if (parts.some((part) => !part || part === "." || part === "..")) throw new TypeError(`${name} caminho não pode conter traversal.`);
  return result;
}

function extension(name) {
  const leaf = name.slice(name.lastIndexOf("/") + 1);
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(dot).toLowerCase() : "";
}

function byteLength(value) {
  if (typeof value === "string") {
    // UTF-8 length without relying on browser encoders.
    return encodeURIComponent(value).replace(/%[\da-f]{2}|./gi, "x").length;
  }
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return undefined;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("A operação foi cancelada.");
  error.name = "AbortError";
  throw error;
}

function payloadOf(input) {
  return input.content ?? input.body ?? input.data;
}

function rejectEncodedPayload(value) {
  if (typeof value !== "string") return;
  if (/^data:/i.test(value) || /^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    throw new TypeError("conteúdo base64, data URL ou URL não é aceito por padrão.");
  }
  // This is deliberately conservative: a long base64-looking string is not
  // silently treated as binary input.
  if (/^[A-Za-z0-9+/\s]+={1,2}$/.test(value) && value.replace(/\s/g, "").length % 4 === 0) {
    throw new TypeError("conteúdo com aparência de base64 não é aceito por padrão.");
  }
}

function allowedSet(value, name) {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : [value];
  if (!list.length || list.some((entry) => typeof entry !== "string" || !entry.trim())) throw new TypeError(`${name} deve conter textos não vazios.`);
  return new Set(list.map((entry) => entry.trim().toLowerCase()));
}

/** Validate and normalize a transport-neutral file input. */
export function validateFileInput(input, options = {}) {
  object(input, "input");
  object(options, "options");
  const name = relativeName(input.name ?? input.path, "input.name");
  const content = payloadOf(input);
  if (content === undefined || content === null) throw new TypeError("input.content deve ser informado.");
  if (options.allowEncoded !== true) rejectEncodedPayload(content);

  const actualSize = byteLength(content);
  const declaredSize = input.size === undefined ? actualSize : input.size;
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) throw new TypeError("input.size deve ser um inteiro não negativo.");
  if (actualSize !== undefined && declaredSize !== actualSize) throw new TypeError("input.size não corresponde ao conteúdo.");
  const maxSize = options.maxSize === undefined ? DEFAULT_MAX_SIZE : options.maxSize;
  if (!Number.isSafeInteger(maxSize) || maxSize < 0) throw new TypeError("maxSize deve ser um inteiro não negativo.");
  if (declaredSize > maxSize) throw new RangeError("arquivo excede o limite de tamanho.");

  const type = input.type === undefined ? "" : text(input.type, "input.type").toLowerCase();
  if (type && (/[\u0000-\u001f\u007f]/.test(type) || !/^[\w.+-]+\/[\w.+-]+$/.test(type))) throw new TypeError("input.type deve ser um MIME válido.");
  const mimes = allowedSet(options.allowedMimeTypes, "allowedMimeTypes");
  const extensions = allowedSet(options.allowedExtensions, "allowedExtensions");
  if (mimes && !mimes.has(type)) throw new TypeError("tipo MIME não permitido.");
  if (extensions && !extensions.has(extension(name))) throw new TypeError("extensão não permitida.");
  return Object.freeze({ name, content, size: declaredSize, type });
}

function quote(value) {
  // SharePoint's REST function argument is a quoted literal; encode the name
  // while retaining the slash semantics already validated by relativeName.
  return encodeURIComponent(value).replace(/'/g, "%27");
}

function requestOptions(options, defaults = {}) {
  const result = { ...defaults, ...options };
  delete result.path;
  return result;
}

/**
 * Create file operations over an injected transport. `filesPath` is the exact
 * server-relative REST collection path (for example a list's RootFolder/Files).
 * No operation retries writes; retry policy, auth, and response parsing belong
 * to the injected transport.
 */
export function createFileClient({ transport, filesPath, maxSize = DEFAULT_MAX_SIZE, allowedMimeTypes, allowedExtensions } = {}) {
  if (!transport || typeof transport.request !== "function") throw new TypeError("transport.request deve ser uma função.");
  const root = serverPath(filesPath, "filesPath");
  const validationOptions = { maxSize, allowedMimeTypes, allowedExtensions };

  async function list(options = {}) {
    object(options, "options");
    return transport.request(`${root}${options.query ?? ""}`, requestOptions(options, { method: "GET" }));
  }

  async function upload(input, options = {}) {
    object(options, "options");
    const file = validateFileInput(input, { ...validationOptions, ...options });
    const overwrite = options.overwrite === true;
    const path = `${root}/add(url='${quote(file.name)}',overwrite=${overwrite ? "true" : "false"})`;
    return transport.request(path, requestOptions(options, {
      method: "POST", body: file.content, headers: file.type ? { "Content-Type": file.type } : undefined
    }));
  }

  async function download(name, options = {}) {
    object(options, "options");
    const safeName = relativeName(name, "name");
    const path = `${root}/GetFileByServerRelativePath(decodedurl='${quote(`${root}/${safeName}`)}')/$value`;
    return transport.request(path, requestOptions(options, { method: "GET", responseType: "binary" }));
  }

  return Object.freeze({ list, upload, download });
}

/** Compatibility-oriented document-library client with explicit folder paths. */
export function createSharePointFileClient({ transport, libraryPath, maxSize = DEFAULT_MAX_SIZE, allowedMimeTypes, allowedExtensions } = {}) {
  if (!transport || typeof transport.request !== "function") throw new TypeError("transport.request deve ser uma função.");
  const library = serverPath(libraryPath, "libraryPath").replace(/\/+$/, "");
  const site = serverPath(transport.webUrl, "transport.webUrl").replace(/\/+$/, "");
  const siteUrl = new URL(`${site}/`, globalThis.location?.origin ?? "http://spmiddle.invalid");
  const folder = (value = "") => {
    if (value === "") return library;
    return `${library}/${relativeName(value, "folderPath", true)}`;
  };
  const request = async (path, options) => {
    throwIfAborted(options?.signal);
    const response = await transport.request(path, options);
    throwIfAborted(options?.signal);
    if (response?.status >= 400) throw new Error(`A operação de arquivo falhou (HTTP ${response.status}).`);
    return response;
  };
  const config = { maxSize, allowedMimeTypes, allowedExtensions };
  async function uploadFile(input) {
    object(input, "input");
    const file = validateFileInput({
      name: input.fileName,
      content: input.content,
      type: input.contentType,
      size: input.size
    }, config);
    const root = `${site}/_api/web/GetFolderByServerRelativeUrl('${folder(input.folderPath)}')/Files`;
    return request(`${root}/add(url='${quote(file.name)}',overwrite=${input.overwrite === true ? "true" : "false"})`, {
      method: "POST", body: file.content, headers: file.type ? { "Content-Type": file.type } : undefined
    });
  }
  async function listFiles(options = {}) {
    object(options, "options");
    const root = `${site}/_api/web/GetFolderByServerRelativeUrl('${folder(options.folderPath)}')/Files`;
    return request(`${root}${options.query ?? ""}`, { method: "GET", signal: options.signal });
  }
  async function downloadFile(input = {}) {
    object(input, "input");
    const fileName = relativeName(input.fileName, "fileName");
    const path = `${site}/_api/web/GetFileByServerRelativeUrl('${folder(input.folderPath)}/${fileName}')/$value`;
    const maxBytes = input.maxBytes;
    if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) throw new TypeError("maxBytes deve ser um inteiro não negativo.");
    const responseOptions = { method: "GET", responseType: "binary", signal: input.signal };
    if (maxBytes !== undefined) responseOptions.maxResponseBytes = maxBytes;
    const response = await request(path, responseOptions);
    if (maxBytes !== undefined) {
      const headers = response?.headers;
      const announced = response?.contentLength ?? (typeof headers?.get === "function" ? headers.get("content-length") : headers?.["content-length"] ?? headers?.["Content-Length"]);
      if (announced !== undefined && announced !== null && /^\d+$/.test(String(announced)) && Number(announced) > maxBytes) {
        throw new RangeError("download excede maxBytes anunciado.");
      }
      const bytes = byteLength(response?.data);
      if (bytes !== undefined && bytes > maxBytes) throw new RangeError("download excede maxBytes recebido.");
      if (response?.data && typeof response.data.size === "number" && response.data.size > maxBytes) throw new RangeError("download excede maxBytes recebido.");
    }
    return response;
  }

  function collectionPath(kind, options = {}) {
    return `${site}/_api/web/GetFolderByServerRelativeUrl('${folder(options.folderPath)}')/${kind}`;
  }

  async function listFolders(options = {}) {
    object(options, "options");
    return request(`${collectionPath("Folders", options)}${options.query ?? ""}`, { method: "GET", signal: options.signal });
  }

  function valuesFrom(response) {
    const value = response?.data?.value ?? response?.data?.d?.results;
    if (!Array.isArray(value)) throw new TypeError("resposta de arquivos/pastas deve conter data.value como array.");
    return value;
  }

  function nextLinkFrom(response) {
    return response?.data?.["@odata.nextLink"] ?? response?.data?.["odata.nextLink"] ?? response?.data?.d?.__next ?? null;
  }

  function safeContinuation(link, collection) {
    if (typeof link !== "string" || !link.trim() || link.trim().startsWith("//") || link.includes("#")) throw new TypeError("nextLink inválido ou fora do site configurado.");
    let url;
    try { url = new URL(link.trim(), siteUrl); }
    catch { throw new TypeError("nextLink deve ser uma URL HTTP(S) segura."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new TypeError("nextLink deve ser HTTP(S), sem credenciais ou fragmento.");
    if (url.origin !== siteUrl.origin || !url.pathname.startsWith(`${siteUrl.pathname.replace(/\/$/, "")}/`)) {
      throw new TypeError("nextLink deve permanecer na mesma origem e no site configurado.");
    }
    const expected = new URL(collection, siteUrl);
    if (url.pathname !== expected.pathname) throw new TypeError("nextLink não pode mudar a coleção/pasta solicitada.");
    return `${url.pathname}${url.search}`;
  }

  async function listAll(kind, options = {}) {
    object(options, "options");
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
    if (!Number.isSafeInteger(maxPages) || maxPages < 1 || !Number.isSafeInteger(maxItems) || maxItems < 0) throw new TypeError("maxPages deve ser positivo e maxItems não negativo.");
    const collection = collectionPath(kind, options);
    const items = [];
    const seen = new Set();
    let path = `${collection}${options.query ?? ""}`;
    for (let page = 0; ; page += 1) {
      if (page >= maxPages) throw new RangeError("limite maxPages atingido com paginação pendente.");
      throwIfAborted(options.signal);
      const response = await request(path, { method: "GET", signal: options.signal });
      throwIfAborted(options.signal);
      const pageItems = valuesFrom(response);
      if (items.length + pageItems.length > maxItems) throw new RangeError("limite maxItems excedido.");
      items.push(...pageItems);
      const next = nextLinkFrom(response);
      if (!next) return { ...response, data: { ...(response.data ?? {}), value: items } };
      path = safeContinuation(next, collection);
      if (seen.has(path)) throw new TypeError("ciclo de nextLink detectado.");
      seen.add(path);
    }
  }

  async function listFilesAll(options = {}) { return listAll("Files", options); }
  async function listFoldersAll(options = {}) { return listAll("Folders", options); }
  return Object.freeze({ uploadFile, listFiles, listFolders, listFilesAll, listFoldersAll, downloadFile });
}
