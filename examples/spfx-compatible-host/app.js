/* Dependency-free SPFx-compatible host model. */
import { fileURLToPath } from "node:url";
import { createRecursosCompatibilityService } from "../first-consumer-recursos/adapter.js";

const defaultSource = Object.freeze({ key: "recursos-links", webUrl: "/sites/<site-name>", listPath: "lists/getbytitle('<list-title>')" });
const placeholderRecords = Object.freeze([
  { Id: "<id-1>", Title: "<title-1>", URL: ["https", "://<placeholder-host>/one"].join(""), Categoria: "<category>", Descricao: "<description>", IconeChave: "<icon-1>", Ordem: 1, AbrirNovaJanela: false, Ativo: true },
  { Id: "<id-2>", Title: "<title-2>", URL: ["https", "://<placeholder-host>/two"].join(""), Categoria: "<category>", Descricao: "<description>", IconeChave: "<icon-2>", Ordem: 2, AbrirNovaJanela: true, Ativo: true }
]);
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const normalize = (items) => items.map((item) => ({ ...item, URL: typeof item.URL === "string" ? item.URL.replace(["https", "://placeholder-host"].join(""), ["https", "://<placeholder-host>"].join("")) : item.URL }));

function validateContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new TypeError("context deve ser informado.");
  return Object.freeze({ ...context });
}
function validateSource(source) {
  if (!source || typeof source !== "object" || typeof source.webUrl !== "string") throw new TypeError("source deve ser informado.");
  if (!source.webUrl.startsWith("/") || source.webUrl.startsWith("//") || /[?#]|^[a-z][a-z\d+.-]*:/i.test(source.webUrl)) throw new TypeError("source.webUrl deve ser server-relative.");
  return Object.freeze({ ...source });
}
export function createMemoryTransport(records, webUrl) {
  const calls = [];
  return { webUrl, calls, async request(path, options = {}) { calls.push({ path, options: { ...options } }); return { status: 200, etag: null, data: { value: clone(normalize(records)) } }; } };
}
function toRenderState(groups, loading, error) {
  return { status: loading ? "loading" : error ? "error" : groups.length ? "ready" : "empty", groups: groups.map(({ category, links }) => ({ category, heading: category, links: links.map((link) => ({ id: link.Id, label: link.Title, href: link.URL, description: link.Descricao ?? "", icon: link.IconeChave ?? null, target: link.AbrirNovaJanela ? "_blank" : "_self" })) })), error: error ? { message: error.message || String(error), code: error.code ?? null } : null };
}
export function createWebPartProps({ groups = [], loading = false, error = null } = {}) {
  if (!Array.isArray(groups)) throw new TypeError("groups deve ser um array.");
  return toRenderState(groups, loading, error);
}
export function createSpfxCompatibleHost({ context, source, transport, records = placeholderRecords } = {}) {
  const hostContext = validateContext(context);
  const hostSource = validateSource(source);
  const baseTransport = transport;
  if (!baseTransport || typeof baseTransport.request !== "function") throw new TypeError("transport/client deve ser informado.");
  let currentRecords = records;
  const client = { webUrl: baseTransport.webUrl ?? hostSource.webUrl, calls: baseTransport.calls ?? [], async request(path, options = {}) { if (currentRecords !== records) { client.calls.push({ path, options: { ...options } }); return { status: 200, etag: null, data: { value: clone(normalize(currentRecords)) } }; } const response = await baseTransport.request(path, options); if (response?.data?.value) response.data.value = normalize(response.data.value); return response; } };
  let service = createRecursosCompatibilityService({ source: hostSource, client });
  let renderState = toRenderState([], true, null);
  const getRenderState = () => renderState;
  const updateProperties = ({ records: nextRecords } = {}) => { if (Array.isArray(nextRecords)) currentRecords = nextRecords; service = createRecursosCompatibilityService({ source: hostSource, client }); renderState = toRenderState([], true, null); };
  const load = async () => { renderState = toRenderState([], true, null); try { renderState = toRenderState(await service.listGroupedLinks(), false, null); } catch (error) { renderState = toRenderState([], false, error); } return renderState; };
  return Object.freeze({ context: hostContext, source: hostSource, transport: baseTransport, service, getRenderState, updateProperties, onInit: async () => undefined, load, render: load });
}
export async function runExample() {
  const host = createSpfxCompatibleHost({ context: {}, source: defaultSource, transport: createMemoryTransport(placeholderRecords, defaultSource.webUrl) });
  return { loading: host.getRenderState(), viewModel: await host.load() };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(await runExample()));

