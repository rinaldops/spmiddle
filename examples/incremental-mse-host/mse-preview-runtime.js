/*
 * Runtime externo do snippet MSE de preview.
 *
 * Carregar este arquivo como asset externo evita depender da execução de um
 * <script> inline inserido pelo Modern Script Editor. O runtime não acessa
 * SharePoint, não usa rede e trabalha somente com os placeholders do snippet.
 */
(function () {
  "use strict";

  function initialize() {
    var root = document.querySelector(
      '[data-spmiddle-mse-root][data-spmiddle-instance="preview"]'
    );

    if (!root || root.dataset.mounted === "true") {
      return;
    }

    root.dataset.mounted = "true";

    var items = [
      {
        id: "<item-a>",
        title: "<title-a>",
        category: "<category-a>",
        value: "<value-a>"
      },
      {
        id: "<item-b>",
        title: "<title-b>",
        category: "<category-b>",
        value: "<value-b>"
      }
    ];

    var state = {
      query: "",
      filter: "all",
      layout: "list"
    };

    var metrics = {
      rootMounts: 1,
      fullReloads: 0,
      internalNavigations: 0,
      affectedRegions: [],
      fallbacks: 0
    };

    var itemsRegion = root.querySelector("[data-spmiddle-items]");
    var statusRegion = root.querySelector("[data-spmiddle-status]");
    var metricsRegion = root.querySelector("[data-spmiddle-metrics]");

    function escapeHtml(value) {
      return String(value).replace(/[&<>]/g, function (character) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;"
        }[character] || character;
      });
    }

    function getVisibleItems() {
      var query = state.query.toLowerCase();

      return items.filter(function (item) {
        var matchesFilter =
          state.filter === "all" || item.category === state.filter;
        var matchesQuery =
          !query ||
          item.title.toLowerCase().indexOf(query) >= 0 ||
          item.value.toLowerCase().indexOf(query) >= 0;

        return matchesFilter && matchesQuery;
      });
    }

    function renderItems() {
      var visibleItems = getVisibleItems();

      itemsRegion.innerHTML = visibleItems
        .map(function (item) {
          return (
            '<article class="spmiddle-item">' +
              "<strong>" + escapeHtml(item.title) + "</strong>" +
              "<br>" +
              "<span>" +
                escapeHtml(item.category) +
                " — " +
                escapeHtml(item.value) +
              "</span>" +
            "</article>"
          );
        })
        .join("") || "<p>&lt;empty&gt;</p>";

      itemsRegion.dataset.layout = state.layout;
      itemsRegion.setAttribute("aria-busy", "false");
    }

    function renderMetrics() {
      metricsRegion.textContent =
        "rootMounts=" + metrics.rootMounts +
        " fullReloads=" + metrics.fullReloads +
        " internalNavigations=" + metrics.internalNavigations +
        " affectedRegion=" + metrics.affectedRegions.join(",") +
        " fallbacks=" + metrics.fallbacks;
    }

    function applyInternalUpdate(region, message) {
      metrics.affectedRegions.push(region);
      statusRegion.textContent = message;
      renderItems();
      renderMetrics();
    }

    root
      .querySelector('[data-spmiddle-action="query"]')
      .addEventListener("click", function () {
        state.query = root.querySelector("#spmiddle-query").value;
        applyInternalUpdate("items", "Consulta interna concluída");
      });

    root
      .querySelector('[data-spmiddle-action="filter"]')
      .addEventListener("click", function () {
        state.filter = root.querySelector("#spmiddle-filter").value;
        applyInternalUpdate("items", "Filtro interno concluído");
      });

    root
      .querySelector('[data-spmiddle-action="update"]')
      .addEventListener("click", function () {
        items[0].value = "<updated-value>";
        applyInternalUpdate("items", "Atualização interna concluída");
      });

    root
      .querySelector('[data-spmiddle-action="layout"]')
      .addEventListener("click", function () {
        state.layout = state.layout === "list" ? "compact" : "list";
        applyInternalUpdate("layout", "Layout interno atualizado");
      });

    root
      .querySelector('[data-spmiddle-action="external"]')
      .addEventListener("click", function () {
        metrics.fallbacks += 1;
        statusRegion.textContent =
          "Fallback externo registrado; nenhuma navegação automática executada";
        renderMetrics();
      });

    renderItems();
    renderMetrics();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
