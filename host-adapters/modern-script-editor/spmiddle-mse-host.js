(function () {
  "use strict";
  // Classic external entrypoint: some MSE versions skip type="module" tags.
  // Capture currentScript now; it is unavailable after the asynchronous import.
  const source = document.currentScript.src;
  if (!globalThis.SPMiddleMseHost) {
    globalThis.SPMiddleMseHost = Object.freeze({
      ready: import(new URL("./layout.js", source).href)
    });
  }

  function initialize() {
    globalThis.SPMiddleMseHost.ready.then(({ applyMseLayout }) => {
      document.querySelectorAll("[data-spmiddle-host]").forEach((host) => {
        try {
          applyMseLayout(host);
        } catch (error) {
          // A malformed snippet must not prevent other instances from initializing.
          console.error("SPMIDDLE MSE host:", error.message);
        }
      });
    }).catch((error) => console.error("SPMIDDLE MSE host:", error.message));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
