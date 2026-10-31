# ADR 0001 — Transport design

**Status:** accepted (reflects code already implemented in
`packages/sharepoint-rest-browser/src/index.js`)

## Context

SPMIDDLE needs a single way to talk to SharePoint's REST API from the
browser, using the signed-in user's own session, without a backend of its
own (see `PLANO-SPMIDDLE.md`, sections 1 and 5).

## Decision

- **One transport instance per `webUrl`.** `createSharePointRestClient`
  takes a single server-relative site URL; every request is validated
  (`apiPath`) to stay within that site's `/_api/` boundary. Cross-origin or
  cross-site paths throw before any request is made.
- **Digest acquired lazily and cached.** The request digest is fetched via
  `POST {site}/_api/contextinfo` only on the first write, cached for the
  server-reported lifetime minus a 30-second safety margin, and concurrent
  callers share the same in-flight digest request (`digestRequest`
  deduplication in `getDigest()`).
- **`MERGE`/`DELETE` emulated via `POST` + header override.** SharePoint's
  classic REST API does not accept native HTTP `PATCH`/`DELETE` reliably
  across all contexts, so the client always sends `POST` with
  `X-HTTP-Method: MERGE|DELETE` and `If-Match: <etag>` — the standard
  SharePoint/OData convention.
- **Retry only for idempotent `GET`.** `fetchResponse` retries exclusively
  on `GET` requests that receive HTTP `429`/`503`, honoring `Retry-After`
  when present and falling back to capped exponential backoff otherwise.
  Writes — including digest acquisition — are never retried automatically.

## Why

Retrying a write whose outcome is unknown risks duplicating a create or
re-applying an update; the plan (`PLANO-SPMIDDLE.md`, section 11.7)
explicitly calls this out: *"Criações não devem ser repetidas cegamente
quando o resultado da primeira tentativa for incerto."* Restricting retry to
reads keeps that guarantee without making the caller handle backoff
manually for the common read path.

## Consequences

- Callers that need to retry an ambiguous write must do so explicitly,
  after re-inspecting state — the transport will not do it for them.
- A single transport cannot span multiple sites; a consumer needing several
  sites creates one client per site (this is exactly what
  `createDataSourceRegistry` does, lazily, per allowlisted source).
