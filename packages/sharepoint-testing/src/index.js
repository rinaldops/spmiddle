/*
 * Shared, dependency-free SharePoint test doubles.
 *
 * This package exists only to remove duplicated fake transports that were
 * maintained separately inside sharepoint-rest-browser's test files. It has
 * no knowledge of DOM, network, or any specific package's internals: every
 * export is a plain Fetch-compatible double or a small transport double that
 * callers configure explicitly.
 */

/** Minimal Fetch-compatible Headers double, case-insensitive like the real one. */
export class FakeHeaders {
  constructor(values = {}) {
    this.values = new Map(
      Object.entries(values).map(([name, value]) => [name.toLowerCase(), String(value)])
    );
  }

  get(name) {
    return this.values.get(String(name).toLowerCase()) ?? null;
  }
}

/** Builds a Fetch-compatible Response double for a fixed status/body/headers. */
export function fakeResponse(status, body = "", headers = {}, binaryBody) {
  const bytes = binaryBody ?? new TextEncoder().encode(body).buffer;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new FakeHeaders(headers),
    text: async () => body,
    arrayBuffer: async () => bytes
  };
}

/**
 * Transport double that replays a fixed queue of responses in request order.
 * Each queued entry may be a response object or a `(path, options) => response`
 * function for call-dependent behavior. Replaces the duplicated
 * `fakeTransport(responses)` previously defined inside list-client.test.js.
 */
export function createQueueTransport(responses = [], { webUrl = "/sites/demo" } = {}) {
  const queue = [...responses];
  const calls = [];
  return {
    calls,
    webUrl,
    async request(path, options = {}) {
      calls.push({ path, options });
      const response = queue.shift();
      if (typeof response === "function") return response(path, options);
      return response ?? { data: null, status: 204, etag: null };
    }
  };
}

const DEFAULT_FIELD_TYPES = Object.freeze({
  2: "Text", 3: "MultilineText", 4: "DateTime", 6: "Choice",
  7: "Lookup", 8: "Boolean", 9: "Number", 10: "Currency", 11: "URL", 20: "User"
});

/**
 * Stateful transport double that simulates a single SharePoint list's
 * metadata (list existence, fields, and a missing indexes endpoint) well
 * enough to exercise a provisioning manager's inspect/apply/verify cycle.
 * Replaces the duplicated `fakeTransport({ list, fields })` previously
 * defined inside provisioning.test.js.
 */
export function createListProvisioningFake({ webUrl = "/sites/demo", listTitle, list = null, fields = [] } = {}) {
  if (typeof listTitle !== "string" || !listTitle.trim()) {
    throw new TypeError("listTitle deve ser informado.");
  }
  const title = listTitle.trim();
  const listPath = () => `${webUrl}/_api/web/lists/getbytitle('${title}')`;
  const fieldPath = () => `${listPath()}/fields`;

  const state = { list, fields: fields.map((field) => ({ ...field })) };
  const calls = [];
  const transport = {
    webUrl,
    calls,
    state,
    async request(path, options = {}) {
      calls.push({ path, options });
      const method = (options.method ?? "GET").toUpperCase();

      if (method === "GET" && path.startsWith(fieldPath())) {
        return { data: { value: state.fields }, status: 200 };
      }
      if (method === "GET" && (path === listPath() || path.startsWith(`${listPath()}?$select=`))) {
        if (!state.list) {
          const error = new Error("not found");
          error.code = "not-found";
          error.status = 404;
          throw error;
        }
        return { data: state.list, status: 200 };
      }
      if (method === "GET" && path.endsWith("/indexes")) {
        const error = new Error("not found");
        error.code = "not-found";
        error.status = 404;
        throw error;
      }
      if (method === "POST" && path === `${webUrl}/_api/web/lists`) {
        const body = options.body ?? {};
        state.list = {
          Id: "00000000-0000-4000-8000-000000000001",
          Title: body.Title ?? title,
          BaseTemplate: body.BaseTemplate ?? body.TemplateType
        };
        return { data: state.list, status: 201 };
      }
      if (method === "POST" && path === fieldPath()) {
        const body = options.body ?? {};
        const field = {
          InternalName: body.InternalName ?? body.Name,
          Title: body.Title ?? body.DisplayName ?? body.InternalName ?? body.Name,
          TypeAsString: body.TypeAsString ?? body.Type ?? (DEFAULT_FIELD_TYPES[body.FieldTypeKind] ?? "Text"),
          Required: body.Required === true
        };
        if (body.Choices) field.Choices = body.Choices.results ?? body.Choices;
        state.fields.push(field);
        return { data: field, status: 201 };
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    }
  };
  return transport;
}
