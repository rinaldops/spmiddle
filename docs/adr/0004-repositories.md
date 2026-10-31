# ADR 0004 — Repositories depend on shape, not on a specific client

**Status:** accepted (reflects code already implemented in
`packages/data-core/src/repository.js`)

## Context

`data-core`'s repository layer sits on top of a list client but should not
be hard-wired to the one implementation that `sharepoint-rest-browser`
provides.

## Decision

- **Structural dependency only.** `createRepository` validates its `client`
  argument by checking that it exposes
  `{ getListItems, getListItem, createListItem, updateListItem,
  deleteListItem }` as functions (`validateClient` in `repository.js`) — it
  never imports or references `createSharePointListClient` directly. Any
  object implementing that shape (a real list client, or a test fake) works.
- **Pagination is always bounded and loop-protected.** `findMany` and
  `count` enforce `maxPages`/`maxItems` on every call (defaulting to `100`
  pages / `10000` items) and track every `nextLink` seen in a `seenLinks`
  set, raising `{ code: "pagination-loop" }` if a cursor repeats — there is
  no code path that iterates without a bound.
- **ETag required, not optional, for `update`/`delete`.** Both methods call
  `text(options.etag, "options.etag")`, which throws if `etag` is missing or
  empty. A caller must explicitly request wildcard writes
  (`allowWildcardEtag: true`) to bypass this — it is never the default.

## Why

Depending on a shape instead of a class keeps `data-core` testable in
isolation (its own test suite never imports
`sharepoint-rest-browser`) and keeps the repository reusable if a different
host someday supplies a non-REST-based list client with the same shape.
Mandatory ETags make optimistic concurrency the default behavior rather than
something a caller must remember to opt into — losing data silently on a
stale write is the failure mode this specifically prevents.

## Consequences

- Any new list-client-like adapter (for example, a future server-side
  adapter mentioned in `PLANO-SPMIDDLE.md`, section 5) can be used by
  `data-core` without any change to `repository.js`, as long as it
  implements the five required methods.
- A caller that truly needs an unconditional write must say so explicitly
  (`allowWildcardEtag: true`); there is no implicit fallback to `If-Match: *`.
