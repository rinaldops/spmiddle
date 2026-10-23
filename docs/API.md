# `@spmiddle/sharepoint-rest-browser`

Browser-side transport for the SharePoint REST API. The package keeps the
low-level concerns of a SharePoint request in one place: server-relative site
validation, request headers, request digests, ETags, response parsing, and
limited retry handling.

This package provides the transport and a small list client. It is not an ORM
or a domain repository layer.

## Installation

The package is an ES module and has no runtime dependencies. Install it from
the package registry used by your application when a published release is
available:

```sh
npm install @spmiddle/sharepoint-rest-browser
```

Then import the public factory:

```js
import { createSharePointRestClient } from "@spmiddle/sharepoint-rest-browser";
```

The package requires a browser environment with `fetch`. Tests and controlled
hosts may provide a compatible `fetchImpl` instead.

## List client

The list client builds a limited SharePoint REST item API on top of a transport:

```js
import {
  createSharePointListClient,
  createSharePointRestClient
} from "@spmiddle/sharepoint-rest-browser";

const transport = createSharePointRestClient({ webUrl: "/sites/example" });
const tasks = createSharePointListClient({
  transport,
  listPath: "lists/getbytitle('Tasks')"
});

const page = await tasks.getListItems({
  select: ["Id", "Title", "Status"],
  filter: "Status eq 'Open'",
  orderBy: [{ field: "Title", direction: "asc" }],
  top: 25
});

const created = await tasks.createListItem({ Title: "Review" });
await tasks.updateListItem(created.data.Id, { Status: "Closed" }, {
  etag: created.etag
});
```

The client supports `listId` (a GUID) or a validated REST `listPath`, but not
both. `getListItems` returns the transport response and keeps SharePoint's
`odata.nextLink` in `data`; pass that link back as `nextLink` to load the next
page. Links are restricted to the configured site's REST path. `getAllPages`
is available for bounded aggregation with `maxPages` and `maxItems` limits.

The `filter` value is intentionally an explicitly supplied string in this
increment. The package does not parse or authorize arbitrary OData expressions;
applications must build filters from trusted, allowlisted fields and values.

## Schemas and data sources

The package also exposes local contracts for describing SharePoint structures and
registering the sites and lists an application is allowed to use:

```js
import {
  createDataSourceRegistry,
  defineListSchema
} from "@spmiddle/sharepoint-rest-browser";

const taskSchema = defineListSchema({
  key: "tasks",
  internalName: "AppTasks",
  displayName: "Tasks",
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", type: "Text", required: true },
    { internalName: "Status", type: "Choice", choices: ["Open", "Closed"] }
  ],
  indexes: [["Status"]]
});

const sources = createDataSourceRegistry({
  allowedWebUrls: ["/sites/example"],
  sources: [{
    key: "tasks",
    webUrl: "/sites/example",
    listPath: "lists/getbytitle('Tasks')"
  }]
});

const tasksFromRegistry = sources.getListClient("tasks");
```

Schemas are immutable, environment-independent declarations. Defining one never
creates or modifies SharePoint structures. Provisioning is intentionally a
future administrative layer. The source registry accepts only allowlisted,
server-relative sites and resolves runtime clients by logical key, not by an
arbitrary URL. A source may describe only a site; in that case
`getListClient(key)` returns `undefined` until list metadata is registered.

## Creating a client

```js
const client = createSharePointRestClient({
  webUrl: "/sites/example"
});
```

`webUrl` is required and must be the server-relative URL of the SharePoint
site, such as `/sites/example` or `/`. It must not be an absolute URL, a
protocol-relative URL, contain a query or fragment, or identify another host.
Trailing slashes are removed.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `webUrl` | — | Required server-relative site URL. |
| `fetchImpl` | `globalThis.fetch` | Function used for HTTP requests. Useful for tests or a host adapter. |
| `sleepImpl` | timer-based sleep | Function used between retry attempts. |
| `nowImpl` | `Date.now` | Clock used for digest expiry and HTTP-date `Retry-After` values. |
| `maxRetries` | `2` | Maximum retries for eligible GET throttling responses; integer from `0` through `5`. |

The returned client is frozen and exposes:

```js
{
  webUrl,       // normalized server-relative URL
  request,      // async request(path, options)
  getDigest     // async function returning the cached request digest
}
```

## Request contract

```js
const result = await client.request("/_api/web", {
  method: "GET",
  headers: { Prefer: "example" },
  responseType: "json"
});
```

The path must refer to the current site's `/_api/` endpoint. A path may be
written as `/_api/...` or as the full same-origin URL for that site. Arbitrary
cross-origin URLs are rejected. The default `Accept` header is:

```text
application/json;odata=nometadata
```

Supported options are:

| Option | Default | Description |
| --- | --- | --- |
| `method` | `GET` | `GET`, `POST`, `MERGE`, or `DELETE`. Case is normalized. |
| `headers` | `{}` | Additional request headers. They are merged over the default `Accept`. |
| `body` | — | String, JSON-compatible value, `ArrayBuffer`, typed-array view, or `Blob`. Objects are JSON-serialized. |
| `etag` | — | Required exact ETag for `MERGE` and `DELETE`. |
| `allowWildcardEtag` | `false` | Must be `true` to allow `etag: "*"`. Use only where unconditional writes are explicitly appropriate. |
| `responseType` | `"json"` | `"json"` or `"binary"`. Binary responses are returned as an `ArrayBuffer` when supported, otherwise as a `Blob`. |

For writes, the client obtains a request digest and sends it in
`X-RequestDigest`. JSON bodies receive `Content-Type:
application/json;odata=nometadata` unless the caller supplies another content
type. Binary bodies receive `application/octet-stream` by default.

`MERGE` and `DELETE` are sent using SharePoint's POST override convention:

```text
POST
X-HTTP-Method: MERGE|DELETE
If-Match: <exact ETag>
```

The method remains `GET` for retry purposes only when the requested method is
GET. A successful request resolves to a frozen object:

```js
{
  data: /* parsed JSON, ArrayBuffer/Blob, or null */,
  etag: /* response ETag, OData ETag, or null */,
  status: 200
}
```

The `etag` value is read first from the HTTP `ETag` header, then from
`@odata.etag` or `__metadata.etag` in the response body. A `204` response, or
any successful response with an empty body, has `data: null`.

## Request digest

`getDigest()` calls `POST /_api/contextinfo`, reads `FormDigestValue`, and
caches the result for the server-provided lifetime with a small safety margin.
Concurrent callers share the same in-flight digest request. A failed digest
request is not retained as a valid cache entry.

Applications normally do not need to call `getDigest()` directly; every
non-GET request obtains the digest automatically. The cache belongs to one
client and therefore one `webUrl`.

## ETags and concurrency

`MERGE` and `DELETE` require a non-empty ETag:

```js
await client.request("/_api/web/lists/getbytitle('Articles')/items(7)", {
  method: "MERGE",
  etag: '"4"',
  body: { Title: "Updated title" }
});
```

An exact ETag is sent as `If-Match`. Omitting it, or using `*` without
`allowWildcardEtag: true`, fails before the network request with the
`etag-required` error code. A server response of HTTP `412` is reported as a
`concurrency-conflict` error. Read the item again and decide how to merge or
retry at the application layer; the transport does not overwrite conflicting
changes automatically.

## Retry behavior

Only idempotent `GET` requests are retried automatically. HTTP `429` and `503`
responses are eligible, up to `maxRetries`. The delay uses `Retry-After` when
present, accepting seconds or an HTTP date. If it is absent, the fallback is
exponential backoff capped at 30 seconds.

Writes, including digest acquisition and POST-based method overrides, are not
automatically retried. This avoids duplicating a create or repeating a write
whose outcome is unknown. The caller must resolve ambiguous writes explicitly.

Other statuses, including `502`, are not retried by this package. A retry
budget of zero disables retries.

## Errors

Failures are represented by `SharePointRestError` when the failure has a
SharePoint transport interpretation. It extends `Error` and may include:

```js
{
  name: "SharePointRestError",
  code,          // stable machine-readable code
  status,        // HTTP status, when available
  path,          // normalized request path, when available
  retryAfterMs,  // parsed delay, for throttling responses when available
  cause          // original error, for wrapped failures
}
```

Current codes include:

| Code | Meaning |
| --- | --- |
| `fetch-unavailable` | No usable fetch implementation was supplied. |
| `network-error` | The HTTP implementation failed before receiving a response. |
| `access-denied` | HTTP `401` or `403`. |
| `not-found` | HTTP `404`. |
| `concurrency-conflict` | HTTP `412`; the ETag is stale or does not match. |
| `throttled` | HTTP `429` or `503` after retry handling is exhausted or not applicable. |
| `request-failed` | Other non-success HTTP response. |
| `etag-required` | A required exact ETag was not supplied. |
| `invalid-response` | The response body or digest payload could not be read or parsed. |
| `context-unavailable` | The client site URL is missing or invalid. |

Invalid method, response type, URL, or retry configuration may instead throw a
native `TypeError`. Treat unknown error codes as failures and do not depend on
the human-readable message for program logic.

## Browser-only security boundaries

This package uses the current browser session and the current user's
SharePoint permissions. It does not authenticate a user, elevate privileges,
hide credentials, or create an authorization boundary. Any code shipped to a
browser is inspectable by that user and by browser extensions or tooling with
equivalent access.

Applications must:

- use HTTPS and the host's normal authentication and CSP policies;
- keep secrets, access tokens, cookies, and certificates out of source,
  configuration, logs, and request bodies unless the host explicitly requires
  a browser-managed credential mechanism;
- allowlist sites and API resources rather than accepting arbitrary paths from
  untrusted UI input;
- validate and sanitize application data before rendering or persisting it;
- avoid logging complete payloads or sensitive response data; and
- enforce critical authorization and business rules on SharePoint or a trusted
  server, not only in frontend code.

The client validates that requests stay within the configured site's REST
boundary, but it cannot replace SharePoint permissions or protect a resource
from a user who already has access.

## Explicit non-goals

This package does **not** provide:

- a backend, proxy, or server-side credential store;
- app-only authentication, token acquisition, or privileged access;
- Microsoft Graph access;
- an ORM, domain repositories, schemas, or domain mappers;
- a general OData query builder or automatic data validation;
- automatic conflict resolution or unconditional write safety;
- automatic retries for writes or ambiguous operations;
- batch orchestration, file-specific abstractions, provisioning, migrations,
  or rich-text sanitization;
- offline synchronization, persistent caching, background jobs, or work when
  the page is closed; or
- an authorization, audit, or policy enforcement layer.

Those concerns belong to higher-level packages, the host application, or a
trusted backend where appropriate.
