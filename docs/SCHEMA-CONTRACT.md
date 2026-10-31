# Schema contract

This document describes the schema contract exactly as implemented in
`packages/sharepoint-schema/src/schema.js` (`defineListSchema`,
`validateListSchema`). It is a reference, not a design proposal — every rule
below is enforced by the current code.

## Identity rules

| Field | Pattern | Notes |
| --- | --- | --- |
| `key` | `^[A-Za-z][A-Za-z0-9._-]*$` | Stable logical name used by application code. |
| `internalName` (list) | `^[A-Za-z_][A-Za-z0-9_]*$` | Technical SharePoint identifier. |
| `displayName` | non-empty string | Human-readable title. |
| `template` | string or positive integer | SharePoint list/library template. |
| `schemaVersion` | positive integer | Must be `Number.isInteger` and `>= 1`. |

Both `key` and `internalName` are trimmed before validation; leading/trailing
whitespace does not fail validation, but empty or pattern-mismatched values
throw `TypeError`.

## Field types

`fields[].type` is matched case-insensitively against this table
(`BASIC_TYPES` in `schema.js`):

| Accepted input | Normalized SharePoint type |
| --- | --- |
| `text` | `Text` |
| `multilinetext`, `note` | `MultilineText` |
| `number`, `integer` | `Number` / `Integer` respectively |
| `currency` | `Currency` |
| `boolean` | `Boolean` |
| `datetime`, `date` | `DateTime` |
| `choice` | `Choice` |
| `lookup` | `Lookup` |
| `user` | `User` |
| `url` | `URL` |

Each field also accepts `displayName` (optional), `required` (boolean,
optional), `defaultValue` (any JSON-serializable value, deep-frozen), and the
two type-specific blocks below. Any property not in
`{internalName, type, displayName, required, choices, defaultValue, lookup}`
causes a `TypeError`.

### Choice fields

- `choices` is **required** for `type: Choice` and **forbidden** for any
  other type.
- Must be a non-empty array of non-empty, trimmed strings.
- Duplicates (after trimming) are rejected.

### Lookup fields

- `lookup` is **required** for `type: Lookup` and **forbidden** for any
  other type.
- Shape: `{ listKey, fieldInternalName }`. `listKey` must match the `key`
  pattern (`KEY` regex); `fieldInternalName` defaults to `"Title"` and must
  match the identifier pattern (`IDENTIFIER` regex).
- No other property is accepted — deliberately no URL, GUID, or
  environment-specific provisioning option can be embedded in a lookup,
  because that would make the schema environment-specific
  (`schema.js:70-72`).

## Indexes

`indexes` is an array; each entry is either a plain array of field names
(shorthand) or `{ fields: string[], unique?: boolean }`. Rules:

- Every referenced field name must exist among the list's own `fields`.
- No duplicate field names within one index entry.
- `unique` must be boolean when present.
- Any property other than `fields`/`unique` is rejected.

## Immutability and safety

`validateListSchema` returns a result from `copyAndFreeze`, which:

- Deep-clones and `Object.freeze`s every nested object/array in the result
  (the schema itself, `fields`, each field, `choices`, `indexes`, and each
  index's `fields`).
- Rejects circular references (`"O schema não pode conter referências
  circulares."`).
- Rejects any object whose prototype is not the plain `Object.prototype`
  (defends against class instances or exotic objects being embedded in a
  schema).

Defining a schema **never performs a network request** — this is asserted
directly by a test (`schema.test.js`: *"defining a schema performs no
network request"*, which monkey-patches `globalThis.fetch` to throw if
called).

## Allowlisted properties (fail-closed)

At every level — schema, field, lookup, index — any property not explicitly
recognized throws a `TypeError` rather than being silently ignored. This is
intentional fail-closed behavior: a typo or an attempt to smuggle an
environment-specific value into a schema is a hard error, not a warning.
