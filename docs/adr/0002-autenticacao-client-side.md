# ADR 0002 — Client-side authentication

**Status:** accepted (reflects code already implemented in
`sharepoint-rest-browser` and the project's `SECURITY.md`)

## Context

SPMIDDLE runs entirely in the browser and must not introduce its own
authentication layer in this first phase (`PLANO-SPMIDDLE.md`, sections 1
and 5).

## Decision

- **No authentication of its own.** SPMIDDLE never stores, transmits, or
  manages a credential, token, or cookie. It relies entirely on the
  browser's existing authenticated session with SharePoint — the same
  session the signed-in user already has from loading the page.
- **Allowlisting as the only client-side barrier.** `createDataSourceRegistry`
  (`sharepoint-rest-browser/src/data-sources.js`) is the single place that
  decides which `webUrl`s and list sources an application may use. It
  resolves runtime clients by a logical `key`, never by an arbitrary URL
  supplied by UI input — `getListClient`/`getTransport` only accept keys
  already present in the registry's configured `sources`.
- **No elevation, no simulated permissions.** Every request executes with
  the current user's effective SharePoint permissions. The client does not
  attempt to detect, simulate, or bypass those permissions; hiding a button
  in the UI is explicitly not treated as an authorization boundary
  (`PLANO-SPMIDDLE.md`, section 14.1).

## Why

Any code shipped to a browser is inspectable by the user running it and by
tooling with equivalent access (`docs/API.md`, "Browser-only security
boundaries"). An allowlist cannot be a substitute for real authorization —
it only prevents the *client itself* from being turned into an arbitrary
request factory against SharePoint sites it was not configured for.

## Consequences

- Authorization-critical business rules must live in SharePoint (or a
  future trusted backend), never only in SPMIDDLE or its host application.
- Any future requirement for privileged, app-only, or delegated
  authentication is explicitly out of scope for this phase and requires a
  separate architectural decision (see `PLANO-SPMIDDLE.md`, section 23).
