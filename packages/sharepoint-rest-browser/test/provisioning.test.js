import assert from "node:assert/strict";
import { defineListSchema } from "../src/schema.js";
import { createProvisioningManager } from "../src/provisioning.js";

const site = "/sites/demo";
const schema = defineListSchema({
  key: "articles",
  internalName: "AppArticles",
  displayName: "Articles",
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", displayName: "Title", type: "Text", required: true },
    { internalName: "Status", displayName: "Status", type: "Choice", choices: ["Draft", "Published"] }
  ]
});

function listPath(title = schema.displayName) {
  return `${site}/_api/web/lists/getbytitle('${title}')`;
}

function fieldPath(title = schema.displayName) {
  return `${listPath(title)}/fields`;
}

function fakeTransport({ list = null, fields = [] } = {}) {
  const state = { list, fields: fields.map((field) => ({ ...field })) };
  const calls = [];
  const transport = {
    webUrl: site,
    calls,
    state,
    async request(path, options = {}) {
      calls.push({ path, options });
      const method = (options.method ?? "GET").toUpperCase();

      if (method === "GET" && path.startsWith(fieldPath())) {
        return { data: { value: state.fields }, status: 200 };
      }
      if (method === "GET" && (path === listPath() || path.startsWith(`${listPath()}?$select=`))) {
        if (!state.list) {
          const error = new Error("not found");
          error.code = "not-found";
          error.status = 404;
          throw error;
        }
        return { data: state.list, status: 200 };
      }
      if (method === "GET" && path.endsWith("/indexes")) {
        const error = new Error("not found");
        error.code = "not-found";
        error.status = 404;
        throw error;
      }
      if (method === "POST" && path === `${site}/_api/web/lists`) {
        const body = options.body ?? {};
        state.list = {
          Id: "00000000-0000-4000-8000-000000000001",
          Title: body.Title ?? schema.displayName,
          BaseTemplate: body.BaseTemplate ?? body.TemplateType ?? schema.template
        };
        return { data: state.list, status: 201 };
      }
      if (method === "POST" && path === fieldPath()) {
        const body = options.body ?? {};
        const field = {
          InternalName: body.InternalName ?? body.Name,
          Title: body.Title ?? body.DisplayName ?? body.InternalName ?? body.Name,
          TypeAsString: body.TypeAsString ?? body.Type ?? ({ 2: "Text", 3: "MultilineText", 4: "DateTime", 6: "Choice", 7: "Lookup", 8: "Boolean", 9: "Number", 10: "Currency", 11: "URL", 20: "User" }[body.FieldTypeKind] ?? "Text"),
          Required: body.Required === true
        };
        if (body.Choices) field.Choices = body.Choices.results ?? body.Choices;
        state.fields.push(field);
        return { data: field, status: 201 };
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    }
  };
  return transport;
}

function planText(value) {
  return JSON.stringify(value).toLowerCase();
}

function hasWrite(calls) {
  return calls.some(({ options }) => (options.method ?? "GET").toUpperCase() !== "GET");
}

async function run(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

await run("inspect is read-only and returns a plan", async () => {
  const transport = fakeTransport();
  const manager = createProvisioningManager({ transport, schema });
  const plan = await manager.inspect();

  assert.equal(hasWrite(transport.calls), false);
  assert.match(planText(plan), /articles/);
  assert.match(planText(plan), /missing|create|provision/);
});

await run("reports a missing list in the plan", async () => {
  const transport = fakeTransport();
  const plan = await createProvisioningManager({ transport, schema }).inspect();

  assert.equal(plan.missing ?? plan.list?.missing ?? plan.status === "missing", true);
  assert.match(planText(plan), /list/);
});

await run("apply requires explicit confirmation", async () => {
  const transport = fakeTransport();
  const manager = createProvisioningManager({ transport, schema });

  await assert.rejects(() => manager.apply(), /confirm|confirma|explicit/i);
  assert.equal(hasWrite(transport.calls), false);
  await assert.rejects(() => manager.apply({ confirm: false }), /confirm|confirma|explicit/i);
  assert.equal(hasWrite(transport.calls), false);
});

await run("apply creates the list and fields through SharePoint REST requests", async () => {
  const transport = fakeTransport();
  const manager = createProvisioningManager({ transport, schema });
  await manager.apply({ confirm: true });

  const writes = transport.calls.filter(({ options }) => (options.method ?? "GET").toUpperCase() !== "GET");
  assert.ok(writes.some(({ path }) => path === `${site}/_api/web/lists`));
  assert.ok(writes.some(({ path }) => path === fieldPath()));
  assert.equal(transport.state.list.Title, schema.displayName);
  assert.deepEqual(
    transport.state.fields.map((field) => field.InternalName).sort(),
    schema.fields.map((field) => field.internalName).sort()
  );

  const listCreate = writes.find(({ path }) => path === `${site}/_api/web/lists`);
  assert.equal(listCreate.options.body.Title, schema.displayName);
  assert.equal(listCreate.options.body.BaseTemplate ?? listCreate.options.body.TemplateType, schema.template);
});

await run("verify confirms a compatible provision", async () => {
  const transport = fakeTransport({
    list: { Title: schema.displayName, BaseTemplate: schema.template },
    fields: schema.fields.map((field) => ({
      InternalName: field.internalName,
      Title: field.displayName ?? field.internalName,
      TypeAsString: field.type,
      Required: field.required === true,
      Choices: field.choices
    }))
  });
  const result = await createProvisioningManager({ transport, schema }).verify();

  assert.equal(result.compatible ?? result.ok ?? result.valid, true);
  assert.equal(hasWrite(transport.calls), false);
});

await run("a second inspect is unchanged after apply", async () => {
  const transport = fakeTransport();
  const manager = createProvisioningManager({ transport, schema });
  await manager.apply({ confirm: true });
  transport.calls.length = 0;
  const firstPlan = await manager.inspect();
  const firstInspectCalls = transport.calls.length;
  const secondPlan = await manager.inspect();

  assert.equal(hasWrite(transport.calls), false);
  assert.ok(firstInspectCalls > 0);
  assert.deepEqual(secondPlan, firstPlan);
});

await run("verify reports an incompatible field", async () => {
  const transport = fakeTransport({
    list: { Title: schema.displayName, BaseTemplate: schema.template },
    fields: [{ InternalName: "Title", Title: "Title", TypeAsString: "Number", Required: true }]
  });
  const result = await createProvisioningManager({ transport, schema }).verify();

  assert.equal(result.compatible ?? result.ok ?? result.valid, false);
  assert.match(planText(result), /status|number|mismatch|incompat|title/);
});
