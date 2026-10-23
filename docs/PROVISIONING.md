# Declarative provisioning

SPMIDDLE provisioning is an administrative workflow for bringing SharePoint
lists, libraries, fields, and indexes into agreement with a declarative schema.
It is separate from normal application loading and data access. A schema is an
immutable, environment-independent description; defining or importing one does
not make a network request and does not create or modify SharePoint structures.

## Operating model

Provisioning follows this sequence:

```text
inspect -> generate plan -> explicit confirmation -> apply -> verify
```

Each step has a distinct purpose:

1. **Inspect** reads the authorized target and compares its current metadata
   with the requested schema. Inspection is read-only.
2. **Generate plan** describes the exact proposed operations, their order,
   compatibility findings, and any risks. A dry run should produce this plan
   without writing.
3. **Confirm** requires an explicit administrative decision based on the plan.
   Confirmation is tied to the inspected target, schema version, and plan
   fingerprint; a changed plan must be confirmed again.
4. **Apply** performs only the confirmed operations, using the current user's
   effective SharePoint permissions and the applicable concurrency checks.
5. **Verify** re-inspects the target and reports whether the requested state was
   reached. Verification is required even when every write reports success.

The normal runtime path must not provision. Loading an application, creating a
repository, reading data, or rendering a page must never create or alter lists,
libraries, fields, indexes, views, or permissions. Provisioning belongs in a
separate, deliberately invoked administrative command or process. The browser
client does not provide privileged or app-only access; the operation can do no
more than the signed-in user is authorized to do.

## Schema inputs

The input is a validated declarative schema plus an allowlisted data source.
Use logical identity for application code and stable technical identity for
SharePoint:

| Input | Purpose |
| --- | --- |
| `key` | Stable logical name used by the application |
| `internalName` | Technical list/library or field name |
| `displayName` | Human-readable title |
| `template` | SharePoint list or library template |
| `schemaVersion` | Positive, sequential schema version |
| `fields` | Field names, types, requiredness, choices, defaults, and supported lookup metadata |
| `indexes` | Indexed field combinations and uniqueness requirements |
| source key | Allowlisted logical source resolved to a server-relative site and resource |

Example (placeholders only):

```js
const taskSchema = defineListSchema({
  key: "tasks",
  internalName: "AppTasks",
  displayName: "Tasks",
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", type: "Text", required: true },
    {
      internalName: "Status",
      type: "Choice",
      choices: ["Open", "Closed"]
    }
  ],
  indexes: [["Status"]]
});
```

Schemas must contain only portable declarations. Do not put absolute URLs,
tenant names, GUIDs from a real environment, credentials, tokens, cookies,
personal data, or production payloads in a schema or example. Resolve a source
through an allowlist at execution time and use server-relative paths. A
SharePoint-assigned `listId` may be recorded in an administrative result, but
it is discovered target metadata, not a portable schema identity.

## Inspection and plan statuses

Inspection reports one status per requested resource:

| Status | Meaning | Normal action |
| --- | --- | --- |
| `missing` | The requested resource or component was not found | Propose creation if allowed |
| `compatible` | The current structure satisfies the schema | No write |
| `outdated` | The structure is valid but behind the requested version | Propose a migration |
| `incompatible` | Existing metadata conflicts with the schema or cannot be safely migrated | Stop and require an explicit resolution |
| `access-denied` | The current identity cannot inspect or change the target | Stop; do not retry with elevated assumptions |
| `unknown` | The result is incomplete or ambiguous | Re-inspect or investigate; do not apply blindly |

The plan should include the source, schema version, observed version, intended
operation, affected names, destructive-risk flag, and expected postcondition for
each action. `compatible` and already-satisfied actions should be retained in
the report but must not cause redundant writes.

## Apply result statuses

The result for each planned action uses stable statuses:

| Status | Meaning |
| --- | --- |
| `created` | A missing resource or component was created |
| `updated` | An approved compatible migration changed metadata |
| `unchanged` | The desired state was already present |
| `conflict` | The target changed or its identity/version no longer matches the plan |
| `failed` | The operation was attempted but did not complete |

An overall successful run requires that verification confirms the desired state;
individual `failed`, unresolved `conflict`, or `unknown` results must not be
hidden by a successful HTTP response elsewhere in the run.

## Idempotency and ambiguous outcomes

Provisioning must be idempotent and resumable. Reapplying the same confirmed
schema to an unchanged target should produce `unchanged` rather than another
write. Match resources by stable technical identity and verified metadata, not
by a display title alone. Use schema versions and migration steps to make the
intended transition explicit.

Never blindly repeat a write when the response is lost, times out, or otherwise
leaves the outcome ambiguous. First inspect again and compare the target with
the expected postcondition. If it already matches, record the action as
completed or `unchanged`; if it differs, produce a new plan or `conflict`.
Writes must not rely on automatic retry behavior intended for idempotent reads.

## Safety requirements

- Restrict execution to an explicitly allowlisted, authorized source.
- Validate the target immediately before apply and reject a changed host, site,
  list identity, schema version, or plan fingerprint.
- Require the least privilege needed and respect SharePoint permissions; hiding
  an administrative control is not authorization.
- Show all creates, updates, migrations, and risks before confirmation.
- Preserve data by default. Treat field removal, type changes, renames without
  a proven mapping, unique-index changes, and other destructive operations as
  high risk and require a separately explicit decision.
- Use exact ETags or equivalent concurrency checks where supported. Do not use
  unconditional wildcard writes unless that operation is explicitly defined
  and approved for administration.
- Bound requests, pages, retries, and plan size. Do not log payloads, tokens,
  cookies, personal data, or unnecessary business content.
- Keep transport security, certificate validation, CSP, proxy, and DLP controls
  enabled. Use the host's normal interactive authentication.

## Verification

Verification performs a fresh read rather than trusting the apply response. It
checks resource identity, schema version, field types and requiredness, choices,
lookup metadata, indexes, and any migration postconditions relevant to the plan.
It should produce a concise report containing the source key, operation results,
verification status, stable error codes, and counts, without sensitive payloads.

Example administrative flow (placeholders only):

```js
const inspection = await provisioning.inspect({
  source: "<logical-source-key>",
  schema: taskSchema
});

const plan = provisioning.plan(inspection, { schema: taskSchema });
// Display plan and obtain explicit administrator confirmation.
const applied = await provisioning.apply(plan, {
  confirmation: "<approved-plan-fingerprint>"
});
const verified = await provisioning.verify({
  source: "<logical-source-key>",
  schema: taskSchema,
  expected: applied
});
```

The example intentionally uses placeholders. A real integration must obtain the
source from its configured allowlist and must not accept an arbitrary URL or
confirmation value from untrusted page input.

## Migrations and rollback limitations

Schema migrations are sequential (`v1 -> v2 -> v3`) and should be inspectable,
repeatable where possible, data-preserving, and separately report structural
changes versus content changes. A migration that can remove or reinterpret data
must say so before confirmation.

SharePoint metadata changes are not a distributed transaction. A multi-step
apply can partially succeed, and a browser interruption, throttling, permission
change, or ambiguous response can leave a partially applied state. SPMIDDLE
cannot promise atomic provisioning or a universal automatic rollback.

Rollback therefore means a documented, schema-aware compensating migration (for
example, restoring a prior compatible field configuration), followed by fresh
inspection and verification. It may not restore deleted data, previous field
values, permissions, versions, or every platform side effect. Prefer additive
and reversible changes, retain the prior schema and plan, and take any required
SharePoint backup/export through an approved operational process before a
destructive migration. If rollback is not provably safe, stop and escalate
rather than guessing.
