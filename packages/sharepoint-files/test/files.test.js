import assert from "node:assert/strict";
import { createSharePointFileClient } from "../src/files.js";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const webUrl = "/sites/app";
const libraryPath = "/sites/app/Shared Documents";

function makeTransport(handler = async () => ({ data: null, status: 200 })) {
  const calls = [];
  return {
    calls,
    transport: {
      webUrl,
      request: async (path, options = {}) => {
        calls.push({ path, options });
        return handler(path, options);
      }
    }
  };
}

function makeClient(transportOptions = {}) {
  const fake = makeTransport(transportOptions.handler);
  return { fake, client: createSharePointFileClient({
    transport: fake.transport,
    libraryPath,
    ...transportOptions
  }) };
}

test("rejects traversal and unsafe file names or paths", async () => {
  const { client } = makeClient();
  for (const value of ["../secret.txt", "folder/secret.txt", "folder\\secret.txt", ".", "..", ""])
    await assert.rejects(() => client.uploadFile({ fileName: value, content: new Uint8Array([1]) }), /nome|caminho|seguro|inválid/i);
  await assert.rejects(() => client.listFiles({ folderPath: "../private" }), /caminho|seguro|inválid/i);
  await assert.rejects(() => client.downloadFile({ fileName: "../private.txt" }), /nome|caminho|seguro|inválid/i);
});

test("enforces size and MIME/extension allowlists before transport", async () => {
  const { fake, client } = makeClient({
    maxSize: 4,
    allowedMimeTypes: ["text/plain"],
    allowedExtensions: [".txt"]
  });
  await assert.rejects(() => client.uploadFile({ fileName: "large.txt", content: new Uint8Array(5), contentType: "text/plain" }), /size|tamanho|máxim/i);
  await assert.rejects(() => client.uploadFile({ fileName: "image.png", content: new Uint8Array([1]), contentType: "text/plain" }), /extension|extens|permit/i);
  await assert.rejects(() => client.uploadFile({ fileName: "note.txt", content: new Uint8Array([1]), contentType: "image/png" }), /MIME|tipo|permit/i);
  assert.equal(fake.calls.length, 0);
});

test("rejects base64 strings and data URLs as upload content", async () => {
  const { client } = makeClient();
  await assert.rejects(() => client.uploadFile({ fileName: "note.txt", content: "SGVsbG8=", contentType: "text/plain" }), /base64|binár|data URL|conteúdo/i);
  await assert.rejects(() => client.uploadFile({ fileName: "note.txt", content: "data:text/plain;base64,SGVsbG8=", contentType: "text/plain" }), /base64|data URL|conteúdo/i);
});

test("uses explicit REST paths for upload, list, and download", async () => {
  const { fake, client } = makeClient({
    handler: async (path, options) => options.responseType === "binary"
      ? { data: new Uint8Array([7, 8]).buffer, status: 200 }
      : { data: { value: [] }, status: 200 }
  });
  await client.uploadFile({ folderPath: "reports/2026", fileName: "q1.txt", content: new Uint8Array([1, 2]), contentType: "text/plain", overwrite: true });
  await client.listFiles({ folderPath: "reports/2026" });
  await client.downloadFile({ folderPath: "reports/2026", fileName: "q1.txt" });
  assert.deepEqual(fake.calls.map(({ path, options }) => ({ path, method: options.method, responseType: options.responseType })), [
    { path: "/sites/app/_api/web/GetFolderByServerRelativeUrl('/sites/app/Shared Documents/reports/2026')/Files/add(url='q1.txt',overwrite=true)", method: "POST", responseType: undefined },
    { path: "/sites/app/_api/web/GetFolderByServerRelativeUrl('/sites/app/Shared Documents/reports/2026')/Files", method: "GET", responseType: undefined },
    { path: "/sites/app/_api/web/GetFileByServerRelativeUrl('/sites/app/Shared Documents/reports/2026/q1.txt')/$value", method: "GET", responseType: "binary" }
  ]);
  assert.deepEqual(fake.calls[0].options.body, new Uint8Array([1, 2]));
});

test("does not automatically retry a failed file request", async () => {
  let attempts = 0;
  const { client } = makeClient({
    handler: async () => {
      attempts += 1;
      return { data: { value: [] }, status: 503 };
    }
  });
  await assert.rejects(() => client.listFiles(), /503|falh|throttl|request/i);
  assert.equal(attempts, 1);
});

test("lists folders for the requested folder and propagates AbortSignal", async () => {
  const controller = new AbortController();
  const { fake, client } = makeClient({ handler: async () => ({ data: { value: [] }, status: 200 }) });
  await client.listFolders({ folderPath: "modules", signal: controller.signal });
  assert.match(fake.calls[0].path, /GetFolderByServerRelativeUrl\('\/sites\/app\/Shared Documents\/modules'\)\/Folders$/);
  assert.equal(fake.calls[0].options.signal, controller.signal);
});

test("aggregates file and folder pages while preserving the response envelope", async () => {
  const next = libraryPath;
  const { fake, client } = makeClient({ handler: async (path) => {
    const page = fake.calls.length;
    return page === 1
      ? { data: { value: [{ Name: "one" }], "@odata.nextLink": `${siteForTest()}/_api/web/GetFolderByServerRelativeUrl('${next.replace(/'/g, "''")}')/Files?$skiptoken=2` }, status: 200 }
      : { data: { value: [{ Name: "two" }] }, status: 200 };
  } });
  const result = await client.listFilesAll();
  assert.deepEqual(result.data.value, [{ Name: "one" }, { Name: "two" }]);
  assert.equal(fake.calls.length, 2);
  assert.match(fake.calls[1].path, /\$skiptoken=2$/);

  const folderClient = makeClient({ handler: async () => ({ data: { value: [{ Name: "sub" }] }, status: 200 }) }).client;
  assert.deepEqual((await folderClient.listFoldersAll({ folderPath: "modules" })).data.value, [{ Name: "sub" }]);
});

function siteForTest() { return "http://spmiddle.invalid/sites/app"; }

test("rejects continuation resource changes, cycles, and page/item limit overflow", async () => {
  const hostile = makeClient({ handler: async () => ({ data: { value: [], "@odata.nextLink": "/sites/app/_api/web/GetFolderByServerRelativeUrl('/sites/app/Shared%20Documents')/Folders" }, status: 200 }) }).client;
  await assert.rejects(() => hostile.listFilesAll(), /coleção|pasta/i);

  let calls = 0;
  const repeated = makeClient({ handler: async () => {
    calls += 1;
    return { data: { value: [{ Id: calls }], "@odata.nextLink": "/sites/app/_api/web/GetFolderByServerRelativeUrl('/sites/app/Shared%20Documents')/Files?page=2" }, status: 200 };
  } }).client;
  await assert.rejects(() => repeated.listFilesAll(), /ciclo/i);
  await assert.rejects(() => repeated.listFilesAll({ maxPages: 1 }), /maxPages/i);
  await assert.rejects(() => repeated.listFilesAll({ maxItems: 0 }), /maxItems/i);
});

test("accepts legacy d.results pages and normalizes aggregate data.value", async () => {
  let page = 0;
  const fake = makeTransport(async (_path, _options) => {
    page += 1;
    return page === 1
      ? { data: { d: { results: [{ Name: "legacy-one" }], __next: "/sites/app/_api/web/GetFolderByServerRelativeUrl('/sites/app/Shared%20Documents')/Files?page=2" } }, status: 200 }
      : { data: { d: { results: [{ Name: "legacy-two" }] } }, status: 200 };
  });
  const client = createSharePointFileClient({ transport: fake.transport, libraryPath });
  assert.deepEqual((await client.listFilesAll()).data.value, [{ Name: "legacy-one" }, { Name: "legacy-two" }]);
});

test("rejects unsafe continuation credentials, fragments, and protocols", async () => {
  for (const nextLink of [
    "http://user:pass@spmiddle.invalid/sites/app/_api/web/GetFolderByServerRelativeUrl('/sites/app/Shared%20Documents')/Files",
    "http://spmiddle.invalid/sites/app/_api/web/GetFolderByServerRelativeUrl('/sites/app/Shared%20Documents')/Files#fragment",
    "javascript:alert(1)"
  ]) {
    const client = makeClient({ handler: async () => ({ data: { value: [], "@odata.nextLink": nextLink }, status: 200 }) }).client;
    await assert.rejects(() => client.listFilesAll(), /nextLink|credenciais|HTTP\(S\)|fragmento/i);
  }
});

test("checks AbortSignal before and after requests even when transport ignores it", async () => {
  const before = new AbortController();
  before.abort();
  let calls = 0;
  const client = makeClient({ handler: async () => { calls += 1; return { data: { value: [] }, status: 200 }; } }).client;
  await assert.rejects(() => client.listFoldersAll({ signal: before.signal }), { name: "AbortError" });
  assert.equal(calls, 0);

  const after = new AbortController();
  const resolvingClient = makeClient({ handler: async () => {
    after.abort();
    return { data: { value: [] }, status: 200 };
  } }).client;
  await assert.rejects(() => resolvingClient.listFiles({ signal: after.signal }), { name: "AbortError" });
});

test("downloadFile maxBytes checks announced and received size", async () => {
  const { client } = makeClient({ handler: async () => ({ data: new Uint8Array([1, 2, 3]).buffer, headers: { "content-length": "3" }, status: 200 }) });
  await assert.rejects(() => client.downloadFile({ fileName: "large.bin", maxBytes: 2 }), /maxBytes/i);
  const exact = makeClient({ handler: async () => ({ data: new Uint8Array([1, 2]).buffer, status: 200 }) }).client;
  assert.equal((await exact.downloadFile({ fileName: "small.bin", maxBytes: 2 })).data.byteLength, 2);
});

test("downloadFile forwards maxBytes as transport maxResponseBytes", async () => {
  const { fake, client } = makeClient({ handler: async () => ({ data: new Uint8Array([1]).buffer, status: 200 }) });
  await client.downloadFile({ fileName: "bounded.bin", maxBytes: 4 });
  assert.equal(fake.calls[0].options.maxResponseBytes, 4);
  await client.downloadFile({ fileName: "legacy.bin" });
  assert.equal(Object.hasOwn(fake.calls[1].options, "maxResponseBytes"), false);
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
