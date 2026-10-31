# Error catalog

`docs/API.md` already documents `SharePointRestError` and its transport
codes. This catalog adds the codes raised **outside** the transport layer —
by `sharepoint-provisioning` and `data-core` — which use a plain `Error`
with a `.code` property, not `SharePointRestError`. Treat all codes below,
transport or not, as stable and machine-readable; do not depend on the
human-readable `message`.

## Transport codes (`sharepoint-rest-browser`, class `SharePointRestError`)

See `docs/API.md` for the full table. Summary:

| Code | Meaning |
| --- | --- |
| `fetch-unavailable` | No usable `fetch` implementation was supplied. |
| `network-error` | The HTTP implementation failed before receiving a response. |
| `access-denied` | HTTP `401` or `403`. |
| `not-found` | HTTP `404`. |
| `concurrency-conflict` | HTTP `412`; the ETag is stale or does not match. |
| `throttled` | HTTP `429` or `503` after retry handling is exhausted or not applicable. |
| `request-failed` | Other non-success HTTP response. |
| `etag-required` | A required exact ETag was not supplied. |
| `invalid-response` | The response body or digest payload could not be read or parsed. |
| `context-unavailable` | The client site URL is missing or invalid. |

## Local policy codes (plain `Error`, not `SharePointRestError`)

These codes represent a **local policy decision**, not a SharePoint
transport outcome — they can fire with zero network requests made.

| Code | Origin | Meaning |
| --- | --- | --- |
| `confirmation-required` | `sharepoint-provisioning/src/provisioning.js` (`apply()`) | `apply()` was called without `confirm: true` or a confirm function. |
| `confirmation-denied` | `sharepoint-provisioning/src/provisioning.js` (`apply()`) | The supplied confirm function returned a falsy value. |
| `pagination-loop` | `data-core/src/repository.js` (`findMany`/`count`) | The SharePoint response returned the same pagination cursor twice. |

Distinguish these from transport codes when handling errors: a caller that
only checks `error instanceof SharePointRestError` will **not** catch these
three — check `error.code` directly, or handle both error shapes.

## Invalid-argument failures (native `TypeError`/`RangeError`)

Across every package, invalid configuration (wrong types, out-of-range
values, unsupported properties) throws a native `TypeError` — for example,
an invalid `webUrl`, an unsupported query operator, a malformed schema
field, or a file exceeding `maxSize` (`RangeError` specifically for the size
case in `sharepoint-files/src/files.js`). These are programming errors to
fix before shipping, not runtime conditions to branch on by code.
