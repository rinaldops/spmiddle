/* Read-only Joomla-like categories extension for the existing CAMAP MSE host. */
(function () {
  "use strict";

  var WEB_URL = "/teams/camap-agp/db";
  var LIST_NAME = "mseCategories";
  var ROOT_SELECTOR = '[data-spmiddle-mse-root][data-spmiddle-instance="preview"]';
  var REGION_SELECTOR = "[data-spmiddle-categories-region]";
  var FIELDS = ["Id", "Title", "Alias", "Extension", "Description", "Parent_category", "Level", "Ordering", "Published"];

  var root = document.querySelector(ROOT_SELECTOR);
  if (!root || root.dataset.joomlaCategoriesMounted === "true") return;
  root.dataset.joomlaCategoriesMounted = "true";

  var region = root.querySelector(REGION_SELECTOR);
  if (!region) {
    region = document.createElement("section");
    region.setAttribute("data-spmiddle-categories-region", "");
    region.setAttribute("aria-labelledby", "spmiddle-categories-title");
    root.appendChild(region);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function listPath() {
    return WEB_URL + "/_api/web/lists/getbytitle('" + LIST_NAME + "')/items";
  }

  // The published build must inject the SPMIDDLE repository. This fallback is
  // intentionally a narrow browser transport for the local preview asset only;
  // it is not a second domain adapter and remains read-only/allowlisted.
  function createPreviewRepository() {
    return {
      findMany: function () {
        return fetch(listPath() + "?$select=" + FIELDS.join(",") + "&$filter=Published%20eq%20%27Published%27&$orderby=Ordering%20asc&$top=100", {
          method: "GET",
          headers: { Accept: "application/json;odata=nometadata" },
          credentials: "same-origin",
          cache: "no-store"
        }).then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        }).then(function (payload) {
          return { items: (payload.value || []).map(mapCategory) };
        });
      }
    };
  }

  function render(categories) {
    region.innerHTML =
      '<h2 id="spmiddle-categories-title">Categorias</h2>' +
      '<p data-spmiddle-categories-status role="status">Leitura concluída: ' + categories.length + " categorias</p>" +
      '<ul data-spmiddle-categories-items>' +
      categories.map(function (category) {
        return "<li><strong>" + escapeHtml(category.title || "(sem título)") +
          "</strong> — " + escapeHtml(category.alias || "(sem alias)") +
          "</li>";
      }).join("") +
      "</ul>";
  }

  function renderError() {
    region.innerHTML =
      '<h2 id="spmiddle-categories-title">Categorias</h2>' +
      '<p data-spmiddle-categories-status role="status">Não foi possível ler as categorias.</p>';
  }

  function mapCategory(item) {
    return {
      id: item.Id,
      title: item.Title || "",
      alias: item.Alias || "",
      extension: item.Extension || "",
      description: item.Description || "",
      parentId: item.Parent_category == null ? null : item.Parent_category,
      level: item.Level == null ? 0 : item.Level,
      ordering: item.Ordering == null ? 0 : item.Ordering,
      published: item.Published || ""
    };
  }

  var repository = window.SPMIDDLE_CATEGORIES_REPOSITORY || createPreviewRepository();
  repository.findMany()
    .then(function (result) {
      var categories = result.items || [];
      render(categories);
    })
    .catch(function () {
      renderError();
    });
})();
