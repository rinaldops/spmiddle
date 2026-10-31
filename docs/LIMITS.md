# Limits

This document collects the bounds and defaults already enforced in code,
package by package. None of these are proposals — each one is read directly
from the current implementation.

## Pagination (`data-core` and `sharepoint-rest-browser`)

- `DEFAULT_MAX_PAGES = 100` and `DEFAULT_MAX_ITEMS = 10000` are defined
  **twice**, as separate constants with the same values, in
  `sharepoint-rest-browser/src/list-client.js` (used by `getAllPages`) and
  `data-core/src/repository.js` (used by `findMany`/`count`). This is a
  known value duplication, not a behavioral inconsistency — both packages
  happen to agree on the same numbers today. It is registered here as a
  candidate for a future shared constant (for example in `data-core`, since
  `sharepoint-rest-browser` does not depend on it), not something this
  round of changes corrects.
- `getAllPages`/`findMany`/`count` all require `maxPages` to be a positive
  integer and `maxItems` a non-negative integer; there is no unbounded
  pagination call path in either package.

## Transport retry (`sharepoint-rest-browser`)

- `maxRetries` defaults to `2` and must be an integer between `0` and `5`
  inclusive (`createSharePointRestClient` validates this at construction).
- Only idempotent `GET` requests retry, and only on HTTP `429`/`503`.
  Writes (`POST`/`MERGE`/`DELETE`) are never retried automatically.

## Request digest lifetime (`sharepoint-rest-browser`)

- The digest is cached for `FormDigestTimeoutSeconds` (server-provided),
  minus a fixed **30-second safety margin**
  (`Math.max(0, lifetime - 30) * 1000`).
- If the server does not report a lifetime, the fallback default is
  `1800` seconds (30 minutes).
- Concurrent digest requests are deduplicated — only one `contextinfo` call
  is in flight at a time per client.

## File limits (`sharepoint-files`)

- `DEFAULT_MAX_SIZE = 10 * 1024 * 1024` (10 MiB), overridable per client or
  per call via `maxSize`.
- `allowedMimeTypes`/`allowedExtensions` are optional allowlists; when
  supplied, both are matched case-insensitively.
- Base64-looking strings and `data:`/scheme-prefixed URLs are rejected as
  upload content by default (`rejectEncodedPayload`), unless
  `allowEncoded: true` is explicitly passed.

## Query limits (`data-core`)

- `pageSize`/`top` must be a positive integer when supplied — there is
  **no upper bound enforced on `top` itself** by `normalizeQuery`. The
  actual ceiling on total items fetched comes from `maxItems`/`maxPages` in
  `getAllPages`/`findMany`, not from the per-request `top` value. Any
  consumer that calls the list client directly (bypassing
  `findMany`/`getAllPages`) is responsible for imposing its own ceiling on
  `top`.
