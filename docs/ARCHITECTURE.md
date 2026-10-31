# Architecture

This document describes the architecture that the code already implements,
not a design proposal. It reflects the package split completed in October
2026 (see `PLANO-SPMIDDLE.md`, section 15, for the originally planned
structure).

## Packages

| Package | Responsibility | Depends on (source code) |
| --- | --- | --- |
| `sharepoint-rest-browser` | Browser-side REST transport (`createSharePointRestClient`), the list-item client (`createSharePointListClient`), and the allowlisted data source registry (`createDataSourceRegistry`) | none (own transport only) |
| `sharepoint-schema` | Declarative, environment-independent list schema (`defineListSchema`, `validateListSchema`) | none |
| `sharepoint-provisioning` | Administrative `inspect → apply → verify` workflow (`createProvisioningManager`) | none in source; depends on `sharepoint-schema` only in its test fixtures |
| `data-core` | Domain mapping, controlled query language, and the repository abstraction (`createMapper`, `normalizeQuery`/`buildQuery`, `createRepository`) | none between packages; `repository.js` imports `mapper.js` and `query.js` inside the same package |
| `sharepoint-files` | File input validation and upload/list/download clients (`validateFileInput`, `createFileClient`, `createSharePointFileClient`) | none |
| `sharepoint-rich-text` | Sanitization and security guardrails (`sanitizeRichText`, `validateSafeUrl`, `validateContentLimits`, `createSafeLogger`) | none |
| `sharepoint-testing` | Shared Fetch-compatible test doubles (`FakeHeaders`, `fakeResponse`, `createQueueTransport`, `createListProvisioningFake`) | none; consumed only from `test/` directories |

Before the split, all of the above (except `sharepoint-testing`, which did
not exist) lived inside `sharepoint-rest-browser/src/` as ten files. Mapping
real `import` dependencies between those files showed that, besides the pair
`data-sources.js → index.js + list-client.js` and the pair
`repository.js → mapper.js + query.js`, every other module only relied on
**duck-typed contracts** (the shape of an object, not a module import). That
is what made the split possible without `npm workspaces`: each new package
is self-contained, and the two coupled pairs above migrated together into
the same package (`sharepoint-rest-browser` and `data-core`, respectively).

## Duck-typed contracts between layers

Comments already present in the source state this design intent explicitly:

- `list-client.js` (`sharepoint-rest-browser`): *"it deliberately does not
  know how requests are authenticated"* — it only requires an object with
  `{ request(path, options), webUrl }`.
- `repository.js` (`data-core`) only requires a client implementing
  `{ getListItems, getListItem, createListItem, updateListItem,
  deleteListItem }` — never the transport directly. Any fake implementing
  that shape can stand in for `createSharePointListClient`.
- `query.js` (`data-core`) resolves field names through any object
  exposing `toInternal(field)`, or a `mapping`/`schema.fields` shape — it
  does not require a `createMapper()` instance specifically.
- `provisioning.js` (`sharepoint-provisioning`) only requires
  `{ request(path, options) }` from its transport and a validated schema
  shape (`fields`, `indexes`, `displayName`/`internalName`/`key`) — it has
  no `import` from any other package.

This is why dividing the code into packages did not require rewriting any
production logic: each file already depended on *shapes*, not on concrete
sibling modules, except the two pairs noted above.

## Host composition

Hosts (everything under `examples/`) compose the packages above; the
middleware itself never imports DOM, DOM events, or the SharePoint Modern
Script Editor runtime. For example:

- `examples/standalone-host/app.js` and `examples/incremental-mse-host/app.js`
  only import from `sharepoint-schema`, `data-core`,
  `sharepoint-rest-browser`, and `sharepoint-rich-text` — plain ES modules,
  no browser globals assumed at import time.
- `examples/first-consumer-recursos/adapter.js` is the first concrete
  composition: it wires `defineListSchema` (`sharepoint-schema`),
  `createMapper`/`createRepository` (`data-core`), `createDataSourceRegistry`
  (`sharepoint-rest-browser`), and `sanitizeRichText`/`validateSafeUrl`
  (`sharepoint-rich-text`) into a read-only compatibility service for the
  legacy "Explore Mais" contract.

A host owns DOM/MSE/React-specific code; the packages above never do.

## Why there is no `npm workspaces`

There is no `node_modules` directory and no package installs anywhere in
this repository today — every package is `"private": true` with zero
runtime dependencies. Introducing `npm workspaces` would be a structural
change with no corresponding need: the only cross-package import found
during the split is in a single test file
(`packages/sharepoint-provisioning/test/provisioning.test.js`, which imports
`defineListSchema` from `../../sharepoint-schema/src/schema.js`). That case
is resolved with a plain relative import, the same pattern `examples/*`
already used between sibling example directories before this split (e.g.
`examples/standalone-host/app.js` importing from
`../first-consumer-recursos/adapter.js`). Revisit this decision only if a
real need for independent versioning or `npm install` across packages
appears — not in anticipation of one (see `PLANO-SPMIDDLE.md`, section 15:
"Durante a primeira implementação, essa estrutura poderá começar menor. Não
criar pacotes vazios ou abstrações sem consumidor real.").

## Running the suite

The root `package.json` chains `npm --prefix packages/<package> test` for
every package, in dependency order (packages with no sibling dependency
first), followed by every `examples/*/*.test.js` script. Each package's own
`npm test` is runnable in isolation.
