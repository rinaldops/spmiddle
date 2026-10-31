# ADR 0003 — Schemas are declarative and local

**Status:** accepted (reflects code already implemented in
`packages/sharepoint-schema/src/schema.js`)

## Context

SPMIDDLE needs a way to describe the structure of a SharePoint list without
coupling that description to a specific environment or making it depend on
network access.

## Decision

- **Schemas never perform a network request.** `defineListSchema`/
  `validateListSchema` are pure functions: given a plain object, they
  validate and return a normalized schema. This is asserted directly in
  code comments (`schema.js:1-7`: *"defining a schema never provisions
  anything and never performs a network request"*) and verified by a test
  that makes `globalThis.fetch` throw and confirms it is never called.
- **Deep immutability after validation.** The returned schema — including
  every field, its `choices`, and every index — is deep-frozen via
  `copyAndFreeze`. Attempting to mutate any part of a validated schema
  throws a `TypeError`.
- **No environment-specific data allowed in a `lookup`.** A `lookup`
  field only accepts `{ listKey, fieldInternalName }` — a logical list key
  and a field identifier. It explicitly rejects any other property, so a
  URL, a real list GUID, or a provisioning option cannot be embedded in a
  schema (`schema.js:70-72`: *"Do not accept URLs, IDs, or arbitrary
  provisioning options here. Those make a schema environment-specific and
  belong to a provisioning layer."*).

## Why

A schema that could silently drift (through mutation) or that embedded
environment-specific identifiers would stop being portable between
environments and would be unsafe to share between a test fixture and a real
target. Keeping schemas pure, frozen, and environment-independent lets the
same schema object be reused for inspection, provisioning, and repository
construction without defensive copying at every call site.

## Consequences

- Resolving a schema's logical identity (`key`) to a real SharePoint site or
  list is always done through a separate allowlisted registry
  (`createDataSourceRegistry`), never embedded in the schema itself.
- A schema version bump (`schemaVersion`) is the only sanctioned way to
  signal a structural change; there is no in-place schema mutation path.
