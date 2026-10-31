# Query contract

This document describes the controlled query language exactly as
implemented in `packages/data-core/src/query.js`
(`normalizeQuery`/`buildQuery`) and its REST serialization in
`packages/sharepoint-rest-browser/src/list-client.js`.

## Allowed operators

`query.js` only accepts these operators (`OPERATORS` set):

```
eq, ne, gt, ge, lt, le, contains, beginsWith
```

- `contains` and `beginsWith` require a string `value` and are serialized as
  `contains(field,'value')` / `beginsWith(field,'value')`.
- `null` is only accepted with `eq`/`ne`.
- Any other operator throws `TypeError`.

## Composition

A `filter` condition is either a leaf `{ field, operator, value }` or a
composite `{ and: [...] }` / `{ or: [...] }` (non-empty arrays of
conditions, each recursively validated and parenthesized). Composites can
nest arbitrarily.

## Field resolution

`normalizeQuery(query, contract)` resolves domain field names through
`contract`:

- If `contract.toInternal` exists (a `createMapper()` instance or anything
  shaped like one), field names are translated through it — unknown fields
  throw.
- Otherwise, if `contract.mapping`/`contract.mappings` or
  `contract.schema.fields` is present, a lookup table is built from it.
- If neither is present, the field name is used literally (no translation).

This means a repository, a raw mapper, or even a schema object can all serve
as the field-resolution contract — the query layer never requires a specific
class.

## Supported options

`normalizeQuery` only accepts these top-level keys: `select`, `filter`,
`orderBy`, `pageSize`, `top`. Any other key throws `TypeError`.

- `select`: array (or single string) of field names, resolved through the
  same contract as filter fields.
- `orderBy`: array (or single entry) of `{ field, direction }` or a bare
  field name string (direction defaults to `asc`); `direction` must be
  `asc`/`ne` — actually `asc`/`desc` only.
- `pageSize`/`top`: positive integer; if both are supplied they must be
  equal (`"pageSize e top não podem divergir."`).

`buildQuery` is an exported alias of `normalizeQuery` — same function, kept
for callers that prefer that name.

## REST serialization

`list-client.js` turns a normalized query into SharePoint REST query-string
parameters:

- `select`/`expand` arrays are joined with commas into `$select`/`$expand`.
- `filter` (already an OData string by the time it reaches the list client)
  becomes `$filter`.
- `orderBy` entries of `{ field, direction }` serialize to
  `"field asc|desc"`, joined by commas into `$orderby`.
- `top` must be a non-negative integer; becomes `$top`.
- Every value is `encodeURIComponent`-escaped before being joined into the
  query string.

## Cursor-based pagination

- The next-page cursor is read from `@odata.nextLink`, `odata.nextLink`, or
  `d.__next` on the response body (`nextLinkFrom`/`nextLink` helpers).
- `safeNextLink` (`list-client.js`) rejects any `nextLink` that would leave
  the configured site's REST root — it strips a same-origin absolute URL
  down to its path, rejects protocol-relative (`//`) links outright, and
  requires the resulting path to start with the client's own `restRoot`.
  This is the mitigation against a server response steering the client to
  mix sites or exit the configured REST boundary.
- `getAllPages` (list client) and `findMany`/`count` (repository, in
  `data-core`) both bound iteration with `maxPages`/`maxItems` — there is no
  unbounded pagination path.

## Pagination-loop protection

`createRepository`'s `findMany` and `count` track every `nextLink` seen in
`seenLinks`. If the same cursor is returned twice, they throw an `Error`
with `{ code: "pagination-loop" }` instead of looping — this guards against
a SharePoint response that repeats a cursor and would otherwise cause an
infinite fetch loop.
