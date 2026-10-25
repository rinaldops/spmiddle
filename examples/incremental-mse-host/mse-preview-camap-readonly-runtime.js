/* SPMIDDLE CAMAP read-only runtime: Id/Title/Category/Status, bounded to 50 items. */
(function () {
  "use strict";

  var root = document.querySelector(
    '[data-spmiddle-mse-root][data-spmiddle-instance="preview"]'
  );

  if (!root || root.dataset.mounted === "true") {
    return;
  }

  root.dataset.mounted = "true";

  var state = { query: "", category: "all", status: "all", layout: "list" };
  var metrics = {
    rootMounts: 1,
    fullReloads: 0,
    internalNavigations: 0,
    affectedRegions: [],
    fallbacks: 0
  };
  var items = [];
  var itemsRegion = root.querySelector("[data-spmiddle-items]");
  var statusRegion = root.querySelector("[data-spmiddle-status]");
  var metricsRegion = root.querySelector("[data-spmiddle-metrics]");
  var queryInput = root.querySelector("#spmiddle-query");
  var filterSelect = root.querySelector("#spmiddle-filter");
  var statusSelect;

  function ensureStatusSelect() {
    statusSelect = root.querySelector("#spmiddle-status-filter");
    if (statusSelect) {
      return;
    }
    statusSelect = document.createElement("select");
    statusSelect.id = "spmiddle-status-filter";
    statusSelect.setAttribute("aria-label", "Filtro por estado editorial");
    statusSelect.innerHTML = '<option value="all">Todos os estados</option>';
    filterSelect.parentNode.insertBefore(statusSelect, filterSelect.nextSibling);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  function renderMetrics() {
    metricsRegion.textContent =
      "rootMounts=" + metrics.rootMounts +
      " fullReloads=" + metrics.fullReloads +
      " internalNavigations=" + metrics.internalNavigations +
      " affectedRegion=" + metrics.affectedRegions.join(",") +
      " fallbacks=" + metrics.fallbacks;
  }

  function visibleItems() {
    var query = state.query.toLowerCase();
    return items.filter(function (item) {
      var matchesQuery =
        !query || item.title.toLowerCase().indexOf(query) >= 0;
      var matchesCategory =
        state.category === "all" || item.category === state.category;
      var matchesStatus =
        state.status === "all" || item.status === state.status;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }

  function renderItems() {
    var visible = visibleItems();
    itemsRegion.innerHTML = visible.map(function (item) {
      return (
        '<article class="spmiddle-item">' +
          "<strong>" + escapeHtml(item.title) + "</strong>" +
          "<br><span>Categoria: " + escapeHtml(item.category || "(sem categoria)") +
          "</span><br><span>Estado: " + escapeHtml(item.status || "(sem estado)") +
          "</span><br><span>Registro " + escapeHtml(item.id) + "</span>" +
        "</article>"
      );
    }).join("") || "<p>Nenhum registro encontrado.</p>";
    itemsRegion.dataset.layout = state.layout;
    itemsRegion.setAttribute("aria-busy", "false");
  }

  function renderFilterOptions() {
    var categories = items
      .map(function (item) { return item.category; })
      .filter(function (category, index, values) {
        return category && values.indexOf(category) === index;
      })
      .sort(function (left, right) {
        return left.localeCompare(right, "pt-BR");
      });
    var selected = state.category;
    filterSelect.innerHTML = '<option value="all">Todos</option>' +
      categories.map(function (category) {
        return '<option value="' + escapeHtml(category) + '">' +
          escapeHtml(category) + '</option>';
      }).join("");
    filterSelect.value = categories.indexOf(selected) >= 0 ? selected : "all";
    state.category = filterSelect.value;

    var statuses = items
      .map(function (item) { return item.status; })
      .filter(function (status, index, values) {
        return status && values.indexOf(status) === index;
      })
      .sort(function (left, right) {
        return left.localeCompare(right, "pt-BR");
      });
    var selectedStatus = state.status;
    statusSelect.innerHTML = '<option value="all">Todos os estados</option>' +
      statuses.map(function (status) {
        return '<option value="' + escapeHtml(status) + '">' +
          escapeHtml(status) + '</option>';
      }).join("");
    statusSelect.value = statuses.indexOf(selectedStatus) >= 0 ? selectedStatus : "all";
    state.status = statusSelect.value;
  }

  function updateItems(message) {
    metrics.affectedRegions.push("items");
    statusRegion.textContent = message;
    renderItems();
    renderMetrics();
  }

  function loadItems() {
    statusRegion.textContent = "Carregando publicações...";
    itemsRegion.setAttribute("aria-busy", "true");

    var path =
      "/teams/camap-agp/_api/web/lists/getbytitle('MSE Publicacoes')/items" +
      "?$select=Id,Title,CategoriaTexto,EstadoEditorial&$top=50";

    fetch(path, {
      method: "GET",
      headers: { Accept: "application/json;odata=nometadata" },
      cache: "no-store"
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.json();
      })
      .then(function (payload) {
        items = (payload.value || []).map(function (item) {
          return {
            id: item.Id,
            title: item.Title || "(sem título)",
            category: item.CategoriaTexto || "",
            status: item.EstadoEditorial || ""
          };
        });
        renderFilterOptions();
        statusRegion.textContent =
          "Leitura concluída: " + items.length + " publicações";
        renderItems();
        renderMetrics();
      })
      .catch(function () {
        items = [];
        itemsRegion.innerHTML = "<p>Não foi possível carregar as publicações.</p>";
        itemsRegion.setAttribute("aria-busy", "false");
        statusRegion.textContent = "Erro na leitura das publicações";
        renderMetrics();
      });
  }

  root.querySelector('[data-spmiddle-action="query"]').addEventListener(
    "click",
    function () {
      state.query = queryInput.value;
      updateItems("Consulta interna concluída");
    }
  );

  root.querySelector('[data-spmiddle-action="filter"]').addEventListener(
    "click",
    function () {
      state.category = root.querySelector("#spmiddle-filter").value;
      state.status = statusSelect.value;
      updateItems("Filtros por categoria e estado concluídos");
    }
  );

  root.querySelector('[data-spmiddle-action="update"]').addEventListener(
    "click",
    function () {
      statusRegion.textContent =
        "Modo somente leitura: atualização não disponível";
      renderMetrics();
    }
  );

  root.querySelector('[data-spmiddle-action="layout"]').addEventListener(
    "click",
    function () {
      state.layout = state.layout === "list" ? "compact" : "list";
      metrics.affectedRegions.push("layout");
      statusRegion.textContent = "Layout interno atualizado";
      renderItems();
      renderMetrics();
    }
  );

  root.querySelector('[data-spmiddle-action="external"]').addEventListener(
    "click",
    function () {
      metrics.fallbacks += 1;
      statusRegion.textContent =
        "Fallback externo registrado; nenhuma navegação automática executada";
      renderMetrics();
    }
  );

  ensureStatusSelect();
  renderMetrics();
  loadItems();
})();
