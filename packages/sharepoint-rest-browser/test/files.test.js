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

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
