/*
 * Dependency-free host composition example.
 *
 * The host owns the source configuration and transport.  The Recursos adapter
 * owns the list contract and returns a UI-independent grouped value.  Nothing
 * in this example needs a browser, a tenant, or a DOM.
 */
import { fileURLToPath } from "node:url";
import { createRecursosCompatibilityService } from "../first-consumer-recursos/adapter.js";

const source = Object.freeze({
  key: "recursos-links",
  webUrl: "/sites/example",
  listPath: "lists/getbytitle('RecursosLinks')"
});

const placeholderRecords = Object.freeze([
  {
    Id: 1,
    Title: "Placeholder resource",
    URL: "https://example.test/placeholder-resource",
    Categoria: "Placeholder category",
    Descricao: "Placeholder description.",
    IconeChave: "placeholder",
    Ordem: 1,
    AbrirNovaJanela: false,
    Ativo: true
  },
  {
    Id: 2,
    Title: "Another placeholder",
    URL: "https://example.test/another-placeholder",
    Categoria: "Placeholder category",
    Descricao: "Another placeholder description.",
    IconeChave: "placeholder-alt",
    Ordem: 2,
    AbrirNovaJanela: true,
    Ativo: true
  },
  {
    Id: 3,
    Title: "Inactive placeholder",
    URL: "https://example.test/inactive-placeholder",
    Categoria: "Placeholder category",
    Descricao: "This placeholder is not shown.",
    IconeChave: "placeholder-hidden",
    Ordem: 3,
    AbrirNovaJanela: false,
    Ativo: false
  }
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** A SharePoint-shaped in-memory transport for the host example. */
export function createMemoryTransport(records = placeholderRecords) {
  const calls = [];
  return Object.freeze({
    webUrl: source.webUrl,
    calls,
    async request(path, options = {}) {
      calls.push({ path, options: { ...options } });
      return { status: 200, etag: null, data: { value: clone(records) } };
    }
  });
}

/**
 * Convert the adapter's grouped service result into data a view can render.
 * This is deliberately pure: it neither creates elements nor mutates input.
 */
export function createRenderModel(groups) {
  if (!Array.isArray(groups)) throw new TypeError("groups deve ser um array.");
  return groups.map(({ category, links }) => ({
    heading: category,
    links: links.map(({ Title, URL, Descricao, IconeChave, AbrirNovaJanela }) => ({
      label: Title,
      href: URL,
      description: Descricao ?? "",
      icon: IconeChave ?? null,
      target: AbrirNovaJanela ? "_blank" : "_self"
    }))
  }));
}

/** Compose the host-owned transport, adapter service, and pure render model. */
export function createStandaloneHost({ records = placeholderRecords } = {}) {
  const transport = createMemoryTransport(records);
  const service = createRecursosCompatibilityService({ source, client: transport });
  return Object.freeze({
    source,
    transport,
    service,
    async render() {
      return createRenderModel(await service.listGroupedLinks());
    }
  });
}

export async function runExample() {
  const host = createStandaloneHost();
  const model = await host.render();
  const linkCount = model.reduce((total, group) => total + group.links.length, 0);
  return { model, summary: `${model.length} group(s), ${linkCount} link(s)` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { summary } = await runExample();
  console.log(`Standalone host: ${summary}`);
}
