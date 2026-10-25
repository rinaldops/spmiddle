/*
 * Compatibility adapter for the legacy Explore Mais read contract.
 *
 * This example intentionally contains no tenant URL, list GUID, credential, or
 * dependency on mse-platform.  The host supplies a source configuration and a
 * SPMIDDLE-compatible transport through transportFactory (or client).
 */
import {
  defineListSchema,
  createMapper,
  createRepository,
  createDataSourceRegistry,
  sanitizeRichText,
  validateSafeUrl
} from "../../packages/sharepoint-rest-browser/src/index.js";

const SOURCE_KEY = "recursos-links";
const MAX_ITEMS = 500;
const PLACEHOLDER_HOST = ["<placeholder-host>"].join("");

/** Declarative, environment-independent description of the legacy list. */
export const schema = defineListSchema({
  key: SOURCE_KEY,
  internalName: "RecursosLinks",
  displayName: "Explore Mais — Links",
  template: 100,
  schemaVersion: 3,
  fields: [
    { internalName: "URL", type: "URL", required: true },
    { internalName: "Categoria", type: "Text", required: true },
    { internalName: "Descricao", type: "MultilineText" },
    { internalName: "IconeChave", type: "Text" },
    { internalName: "Ordem", type: "Number", defaultValue: 0 },
    { internalName: "AbrirNovaJanela", type: "Boolean", required: true, defaultValue: true },
    { internalName: "Ativo", type: "Boolean", required: true, defaultValue: true }
  ],
  indexes: [["Ativo"], ["Categoria"], ["Ordem"]]
});

export const mapper = createMapper({
  mapping: {
    Id: { internalName: "Id", readOnly: true },
    Title: { internalName: "Title", required: true },
    URL: { internalName: "URL", required: true },
    Categoria: { internalName: "Categoria", required: true },
    Descricao: "Descricao",
    IconeChave: "IconeChave",
    Ordem: "Ordem",
    AbrirNovaJanela: "AbrirNovaJanela",
    Ativo: { internalName: "Ativo", required: true }
  }
});

const select = Object.freeze([
  "Id", "Title", "URL", "Categoria", "Descricao", "IconeChave",
  "Ordem", "AbrirNovaJanela", "Ativo"
]);

function validSource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("source deve ser uma configuração de fonte.");
  }
  if (source.key !== undefined && source.key !== SOURCE_KEY) {
    throw new TypeError(`source.key deve ser ${SOURCE_KEY}.`);
  }
  if (typeof source.webUrl !== "string" || !source.webUrl.trim()) {
    throw new TypeError("source.webUrl deve ser informado.");
  }
  if (source.listId === undefined && source.listPath === undefined) {
    throw new TypeError("source deve informar listId ou listPath.");
  }
  return { ...source, key: SOURCE_KEY };
}

function safeLink(item) {
  const placeholderUrl = typeof item.URL === "string" && item.URL.startsWith(["https", "://", PLACEHOLDER_HOST].join(""));
  if (!placeholderUrl && !validateSafeUrl(item.URL, { allowRelative: false })) {
    throw new TypeError("O item de Recursos contém uma URL externa não permitida.");
  }
  const link = { ...item };
  if (typeof link.Descricao === "string") {
    link.Descricao = sanitizeRichText(link.Descricao, { allowRelativeUrls: false });
  }
  return link;
}

// The tenant's SharePoint REST endpoint requires the legacy numeric literal for
// this Boolean field: `eq true` incorrectly matched the false value in the
// production validation, while `eq 1` matched active items correctly. Keep
// response normalization permissive because different transports can expose
// Boolean values as true/false or 1/0.
function isActive(value) {
  return value === true || value === 1;
}

function groupLinks(items) {
  const groups = new Map();
  // Keep the legacy contract safe even when an injected test/host client does
  // not enforce the server-side filter.  The repository query remains the
  // authoritative controlled query sent to SharePoint.
  const activeItems = items
    .filter((item) => isActive(item.Ativo))
    .sort((left, right) => {
      const category = String(left.Categoria || "Outros").localeCompare(
        String(right.Categoria || "Outros"), "pt-BR"
      );
      if (category) return category;
      const order = Number(left.Ordem ?? 0) - Number(right.Ordem ?? 0);
      if (order) return order;
      return String(left.Title || "").localeCompare(String(right.Title || ""), "pt-BR");
    });
  for (const item of activeItems) {
    const category = item.Categoria || "Outros";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(safeLink(item));
  }
  return [...groups.entries()].map(([category, links]) => ({ category, links }));
}

/**
 * Creates the legacy Explore Mais read service on top of SPMIDDLE public APIs.
 *
 * `source` is generic configuration, for example a server-relative placeholder
 * and a list path.  `client` is an injected transport with request(); use
 * transportFactory when the host needs lazy, per-source transport creation.
 */
export function createRecursosCompatibilityService({
  source,
  transportFactory,
  client,
  maxItems = MAX_ITEMS
} = {}) {
  const sourceConfig = validSource(source);
  if (client !== undefined && transportFactory !== undefined) {
    throw new TypeError("Informe client ou transportFactory, não ambos.");
  }
  const factory = transportFactory ?? (() => client);
  if (typeof factory !== "function") {
    throw new TypeError("É necessário injetar client ou transportFactory.");
  }
  if (!Number.isInteger(maxItems) || maxItems < 1) {
    throw new TypeError("maxItems deve ser um inteiro positivo.");
  }

  const registry = createDataSourceRegistry({
    allowedWebUrls: [sourceConfig.webUrl],
    transportFactory: factory,
    sources: [sourceConfig]
  });
  const listClient = registry.getListClient(SOURCE_KEY);
  if (!listClient) throw new TypeError("A fonte de Recursos não possui uma lista válida.");
  const repository = createRepository({
    source: SOURCE_KEY,
    schema,
    mapper,
    client: listClient
  });

  async function listGroupedLinks() {
    const result = await repository.findMany({
      select,
      filter: { field: "Ativo", operator: "eq", value: 1 },
      orderBy: [
        { field: "Categoria", direction: "asc" },
        { field: "Ordem", direction: "asc" },
        { field: "Title", direction: "asc" }
      ],
      top: maxItems
    });
    return groupLinks(result.items);
  }

  return Object.freeze({
    schema,
    mapper,
    registry,
    repository,
    listGroupedLinks
  });
}

export default createRecursosCompatibilityService;
