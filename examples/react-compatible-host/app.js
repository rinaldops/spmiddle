/*
 * Dependency-free React-compatible host model.
 *
 * This is intentionally only a component contract: it creates serializable
 * props/view models, but does not import React, touch the DOM, or perform I/O.
 * The compatibility adapter remains responsible for querying and grouping the
 * legacy RecursosLinks list.
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
  }
]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/** A SharePoint-shaped transport which never leaves memory. */
function createMemoryTransport(records) {
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

function linkProps(link) {
  return {
    id: link.Id,
    label: link.Title,
    href: link.URL,
    description: link.Descricao ?? "",
    icon: link.IconeChave ?? null,
    target: link.AbrirNovaJanela ? "_blank" : "_self"
  };
}

/**
 * Stable props for a React-like Explore Mais component.  The returned object
 * is plain data and is safe to snapshot, serialize, or pass to a renderer.
 */
export function createExploreMaisProps({ groups = [], loading = false, error = null } = {}) {
  if (!Array.isArray(groups)) throw new TypeError("groups deve ser um array.");
  return Object.freeze({
    loading: Boolean(loading),
    error: error ? { message: error.message || String(error), code: error.code ?? null } : null,
    groups: groups.map(({ category, links = [] }) => Object.freeze({
      category,
      heading: category,
      links: links.map((link) => Object.freeze(linkProps(link)))
    }))
  });
}

export function createReactCompatibleHost({ records = placeholderRecords } = {}) {
  const transport = createMemoryTransport(records);
  const service = createRecursosCompatibilityService({ source, client: transport });
  let state = { groups: [], loading: true, error: null };
  let cachedState = state;
  let cachedProps = createExploreMaisProps(state);

  const props = () => {
    if (cachedState !== state) {
      cachedState = state;
      cachedProps = createExploreMaisProps(state);
    }
    return cachedProps;
  };
  const load = async () => {
    state = { groups: [], loading: true, error: null };
    try {
      state = { groups: await service.listGroupedLinks(), loading: false, error: null };
    } catch (error) {
      state = { groups: [], loading: false, error };
    }
    return props();
  };

  return Object.freeze({
    source,
    transport,
    service,
    getProps: props,
    load,
    getViewModel: props
  });
}

export async function runExample() {
  const host = createReactCompatibleHost();
  const loading = host.getProps();
  const rendered = await host.load();
  const linkCount = rendered.groups.reduce((total, group) => total + group.links.length, 0);
  return {
    loading,
    viewModel: rendered,
    summary: `${rendered.groups.length} group(s), ${linkCount} link(s)`
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { summary } = await runExample();
  console.log(`React-compatible host: ${summary}`);
}
