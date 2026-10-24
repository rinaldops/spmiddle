/*
 * Incremental MSE host (local, dependency-free).
 *
 * Contract notes:
 * - Stable root mounted once (host concern, not render concern).
 * - Internal actions never navigate/reload and only mark the affected region.
 * - Async sequencing ignores stale responses.
 * - State and metrics are plain JSON-serializable data.
 * - No DOM/network globals are referenced in this module.
 */

const placeholderItems = Object.freeze([
  { id: "<item-a>", title: "<title-a>", category: "<category>", value: "<value-a>" },
  { id: "<item-b>", title: "<title-b>", category: "<category>", value: "<value-b>" }
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Minimal transport factory used by the example runner.
 *
 * The test suite injects its own transport; this exists for local runs only.
 */
export function createMemoryTransport(items = placeholderItems) {
  let currentItems = clone(items);
  const calls = [];
  return Object.freeze({
    calls,
    setItems(nextItems) {
      if (!Array.isArray(nextItems)) throw new TypeError("items deve ser um array.");
      currentItems = clone(nextItems);
    },
    request(action, payload) {
      calls.push({ action: String(action), payload: clone(payload) });
      // Immediate, deterministic fake: host is responsible for sequencing.
      if (action === "query" || action === "filter") return Promise.resolve({ items: clone(currentItems) });
      if (action === "update") {
        const next = (currentItems || []).map((item) => item.id === payload?.item?.id ? { ...item, ...clone(payload.item) } : item);
        currentItems = next;
        const updated = next.find((item) => item.id === payload?.item?.id) ?? null;
        return Promise.resolve({ item: clone(updated) });
      }
      if (action === "layout") return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true });
    }
  });
}

function normalizeInitialState(initialState) {
  const base = {
    items: placeholderItems,
    query: "",
    filter: null,
    layout: "<layout>"
  };
  if (initialState === undefined) return clone(base);
  if (!initialState || typeof initialState !== "object" || Array.isArray(initialState)) {
    throw new TypeError("initialState deve ser um objeto.");
  }
  return clone({
    items: Array.isArray(initialState.items) ? initialState.items : base.items,
    query: initialState.query == null ? base.query : String(initialState.query),
    filter: initialState.filter == null ? null : String(initialState.filter),
    layout: initialState.layout == null ? base.layout : String(initialState.layout)
  });
}

/**
 * Creates a host with one stable root. Internal actions only replace the
 * affected region; a newer request always wins over an older response.
 */
export function createIncrementalMseHost({ transport, initialState, onFallback } = {}) {
  if (!transport || typeof transport.request !== "function") {
    throw new TypeError("transport.request(action, payload) deve ser informado.");
  }
  const fallback = typeof onFallback === "function" ? onFallback : () => undefined;

  // Stable root identity.
  const root = Object.freeze({ key: "root" });
  let mounted = false;
  let mountRef = null;

  // Serializable host state.
  let state = normalizeInitialState(initialState);

  // Metrics required by the test suite.
  const metricsState = {
    rootMounts: 0,
    fullNavigations: 0,
    fallbacks: 0,
    staleResponsesIgnored: 0,
    affectedRegions: []
  };

  // Per-action sequencing to ignore stale responses (query/filter are async).
  let querySeq = 0;
  let filterSeq = 0;

  function metrics() {
    return clone(metricsState);
  }

  function regions() {
    return ["root", "query", "items", "layout"];
  }

  function getState() {
    return clone(state);
  }

  function recordAffected(region) {
    metricsState.affectedRegions.push(String(region));
  }

  function mount() {
    if (!mounted) {
      mounted = true;
      metricsState.rootMounts += 1;
      // Stable mount object reference.
      mountRef = root;
    }
    return mountRef;
  }

  async function handleQuery(value) {
    const nextQuery = String(value ?? "");
    state = { ...state, query: nextQuery };
    recordAffected("items");
    const requestId = ++querySeq;
    const result = await transport.request("query", { value: nextQuery });
    if (requestId !== querySeq) {
      metricsState.staleResponsesIgnored += 1;
      return getState();
    }
    if (result && Array.isArray(result.items)) {
      state = { ...state, items: clone(result.items) };
    }
    return getState();
  }

  async function handleFilter(value) {
    const nextFilter = value == null ? null : String(value);
    state = { ...state, filter: nextFilter };
    recordAffected("items");
    const requestId = ++filterSeq;
    const result = await transport.request("filter", { value: nextFilter });
    if (requestId !== filterSeq) {
      metricsState.staleResponsesIgnored += 1;
      return getState();
    }
    if (result && Array.isArray(result.items)) {
      state = { ...state, items: clone(result.items) };
    }
    return getState();
  }

  async function handleUpdate(item) {
    const patch = item && typeof item === "object" ? clone(item) : null;
    recordAffected("items");
    const result = await transport.request("update", { item: patch });
    if (result && result.item && typeof result.item === "object") {
      const updated = clone(result.item);
      const items = Array.isArray(state.items) ? state.items : [];
      const next = items.map((existing) => existing?.id === updated.id ? { ...existing, ...updated } : existing);
      state = { ...state, items: next };
    }
    return getState();
  }

  async function handleLayout(value) {
    const nextLayout = String(value ?? "");
    state = { ...state, layout: nextLayout };
    recordAffected("layout");
    await transport.request("layout", { value: nextLayout });
    return getState();
  }

  async function dispatch(action = {}) {
    if (!action || typeof action !== "object") throw new TypeError("action deve ser um objeto.");
    switch (action.type) {
      case "query":
        return handleQuery(action.value);
      case "filter":
        return handleFilter(action.value);
      case "update":
        return handleUpdate(action.item);
      case "layout":
        return handleLayout(action.value);
      default:
        throw new TypeError(`Ação desconhecida: ${String(action.type)}`);
    }
  }

  async function navigate(url, options = {}) {
    // External/context navigation is explicit and recorded via callback.
    metricsState.fallbacks += 1;
    fallback({ url: String(url), ...(options && typeof options === "object" ? clone(options) : {}) });
    return undefined;
  }

  return Object.freeze({
    mount,
    metrics,
    regions,
    getState,
    dispatch,
    navigate
  });
}

export async function runExample() {
  const transport = createMemoryTransport();
  const host = createIncrementalMseHost({
    transport,
    initialState: { items: placeholderItems, query: "", filter: "<category>", layout: "<layout>" },
    onFallback: () => undefined
  });
  host.mount();
  const before = host.getState();
  await host.dispatch({ type: "query", value: "<query>" });
  await host.dispatch({ type: "layout", value: "<compact-layout>" });
  return { state: host.getState(), before, metrics: host.metrics(), calls: transport.calls };
}
