/* Read-only Joomla-like articles extension for local CAMAP MSE preview. */
(function () {
  "use strict";

  var WEB_URL = "/teams/camap-agp/db";
  var LIST_NAME = "mseContent";
  var ROOT_SELECTOR = '[data-spmiddle-mse-root][data-spmiddle-instance="preview"]';
  var REGION_SELECTOR = "[data-spmiddle-articles-region]";
  var FIELDS = ["Id", "Created", "Title", "Alias", "EditorialState", "Featured", "Publish_start", "Publish_end", "Category"];
  var root = document.querySelector(ROOT_SELECTOR);
  if (!root || root.dataset.joomlaArticlesMounted === "true") return;
  root.dataset.joomlaArticlesMounted = "true";

  var region = root.querySelector(REGION_SELECTOR);
  if (!region) {
    region = document.createElement("section");
    region.setAttribute("data-spmiddle-articles-region", "");
    region.setAttribute("aria-labelledby", "spmiddle-articles-title");
    root.appendChild(region);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function config() {
    var value = window.SPMIDDLE_JOOMLA_ARTICLES_CONFIG || {};
    return {
      category: value.category == null ? "" : String(value.category),
      count: Number.isInteger(Number(value.count)) && Number(value.count) > 0 ? Number(value.count) : 5
    };
  }

  function listPath() {
    return WEB_URL + "/_api/web/lists/getbytitle('" + LIST_NAME + "')/items";
  }

  function createPreviewRepository() {
    return {
      findMany: function () {
        var current = new Date().toISOString();
        var settings = config();
        var filter = "EditorialState eq 'Published'" +
          " and (Publish_start eq null or Publish_start le datetime'" + current + "')" +
          " and (Publish_end eq null or Publish_end ge datetime'" + current + "')";
        if (settings.category) filter += " and Category eq '" + settings.category.replace(/'/g, "''") + "'";
        var query = "?$select=" + FIELDS.join(",") + "&$filter=" + encodeURIComponent(filter) +
          "&$orderby=Created desc&$top=" + settings.count;
        return fetch(listPath() + query, {
          method: "GET",
          headers: { Accept: "application/json;odata=nometadata" },
          credentials: "same-origin",
          cache: "no-store"
        }).then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        }).then(function (payload) {
          return { items: payload.value || [] };
        });
      }
    };
  }

  function render(items) {
    region.innerHTML =
      '<h2 id="spmiddle-articles-title">Artigos mais recentes</h2>' +
      '<p data-spmiddle-articles-status role="status">Leitura concluída: ' + items.length + " artigos</p>" +
      '<ul data-spmiddle-articles-items>' + items.map(function (item) {
        return "<li><strong>" + escapeHtml(item.Title || "(sem título)") +
          "</strong> — " + escapeHtml(item.Alias || "(sem alias)") +
          "</li>";
      }).join("") + "</ul>";
  }

  function renderError() {
    region.innerHTML =
      '<h2 id="spmiddle-articles-title">Artigos mais recentes</h2>' +
      '<p data-spmiddle-articles-status role="status">Não foi possível ler os artigos.</p>';
  }

  var repository = window.SPMIDDLE_JOOMLA_ARTICLES_REPOSITORY || createPreviewRepository();
  repository.findMany().then(function (result) {
    render(result.items || []);
  }).catch(renderError);
})();
