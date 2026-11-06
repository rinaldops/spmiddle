/* Browser-only host adapter. Importing it does not access DOM or data clients. */
const layouts = new WeakMap();
const properties = ["--spmiddle-host-margin-left", "--spmiddle-host-margin-right"];
const fullBleedClass = "spmiddle-mse-host--full-bleed";

/** Apply publisher-controlled layout to a wrapper, never to the application root. */
export function applyMseLayout(host) {
  if (!host?.matches?.("[data-spmiddle-host]")) {
    throw new TypeError("O wrapper deve declarar data-spmiddle-host.");
  }
  if (host.parentElement?.closest("[data-spmiddle-host]")) {
    throw new TypeError("Wrappers data-spmiddle-host não podem ser aninhados.");
  }
  if (layouts.has(host)) {
    const controller = layouts.get(host);
    controller.refresh();
    return controller;
  }

  const document = host.ownerDocument;
  const view = document.defaultView;
  // Read only semantic host boundaries; never rewrite SharePoint ancestors.
  const boundary = host.parentElement?.closest(
    '[data-automation-id="contentScrollRegion"], #spPageChromeAppDiv'
  );
  const originalClass = host.classList.contains(fullBleedClass);
  const originalProperties = properties.map((name) => ({
    name,
    value: host.style.getPropertyValue(name),
    priority: host.style.getPropertyPriority(name)
  }));
  let disposed = false;

  function refresh() {
    if (disposed) return;
    const mode = readLayout(host.getAttribute("data-spmiddle-layout"));
    host.classList.toggle(fullBleedClass, mode === "FullBleed");
    // Measure the unexpanded wrapper each time so resize never accumulates offsets.
    properties.forEach((name) => host.style.setProperty(name, "0px"));
    if (mode === "Contained" || !host.isConnected) return mode;

    const rect = host.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    if (rect.width <= 0 || viewportWidth <= 0) return mode;
    const bounds = boundary?.getBoundingClientRect();
    // clientLeft includes a left scrollbar in RTL; clientWidth excludes borders
    // and scrollbars. Coordinates assume untransformed SharePoint ancestors.
    const boundaryLeft = bounds ? bounds.left + boundary.clientLeft : 0;
    const left = bounds?.width > 0 ? Math.max(0, Math.min(viewportWidth, boundaryLeft)) : 0;
    const right = bounds?.width > 0
      ? Math.max(left, Math.min(viewportWidth, boundaryLeft + boundary.clientWidth))
      : viewportWidth;
    if (right <= left) return mode;
    // Physical margins work in both LTR and RTL, including asymmetric columns.
    host.style.setProperty(properties[0], `${left - rect.left}px`);
    host.style.setProperty(properties[1], `${rect.right - right}px`);
    return mode;
  }

  refresh();
  view?.addEventListener("resize", refresh);
  const observedWidths = new WeakMap();
  const observer = view?.ResizeObserver ? new view.ResizeObserver((entries) => {
    const changed = entries.map((entry) => {
      const previous = observedWidths.get(entry.target);
      observedWidths.set(entry.target, entry.contentRect.width);
      return previous !== entry.contentRect.width;
    }).some(Boolean);
    // Ignore height-only changes caused by the application's responsive reflow.
    if (changed) refresh();
  }) : null;
  [...new Set([host.parentElement, boundary].filter(Boolean))]
    .forEach((element) => observer?.observe(element));

  const controller = Object.freeze({
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      view?.removeEventListener("resize", refresh);
      observer?.disconnect();
      host.classList.toggle(fullBleedClass, originalClass);
      originalProperties.forEach(({ name, value, priority }) => {
        if (value) host.style.setProperty(name, value, priority);
        else host.style.removeProperty(name);
      });
      layouts.delete(host);
    }
  });
  layouts.set(host, controller);
  return controller;
}

function readLayout(value) {
  if (value === null) return "Contained";
  const normalized = value.trim().toLowerCase();
  if (normalized === "contained") return "Contained";
  if (normalized === "fullbleed") return "FullBleed";
  throw new TypeError("data-spmiddle-layout deve ser Contained ou FullBleed.");
}
