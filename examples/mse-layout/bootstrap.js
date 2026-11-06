(function () {
  "use strict";
  const source = document.currentScript.src;

  async function initialize() {
    const host = document.querySelector('[data-spmiddle-host][data-spmiddle-instance="layout-example"]');
    if (!host || host.dataset.layoutExampleMounted === "true") return;
    host.dataset.layoutExampleMounted = "true";
    try {
      const { applyMseLayout } = await globalThis.SPMiddleMseHost.ready;
      const { mount } = await import(new URL("./app.js", source).href);
      // The publication integration sizes the wrapper before mounting the ready app.
      const layout = applyMseLayout(host);
      try {
        const app = mount(host.querySelector("[data-spmiddle-app-root]"));
        // The page/SPA integration can invoke this cleanup before removing its host.
        host.addEventListener("spmiddle-example-dispose", () => {
          try {
            app.dispose();
          } finally {
            layout.dispose();
            delete host.dataset.layoutExampleMounted;
          }
        }, { once: true });
      } catch (error) {
        layout.dispose();
        throw error;
      }
    } catch (error) {
      delete host.dataset.layoutExampleMounted;
      console.error("SPMIDDLE layout example:", error.message);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
