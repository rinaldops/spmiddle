import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = "git-managed-joomla-categories-readonly";
const assets = [
  "examples/incremental-mse-host/mse-preview-joomla-categories-readonly-runtime.js",
  "examples/incremental-mse-host/mse-preview-joomla-categories-snippet.html"
];

const manifest = {
  package: "spmiddle-joomla-categories-readonly",
  version,
  mode: "local-package-only",
  destination: "/teams/camap-agp/Preview.aspx",
  source: "/teams/camap-agp/db",
  list: "mseCategories",
  operation: "read-only",
  writes: 0,
  publication: "stable-siteassets-folder-connected-and-verified",
  siteAssetsFolder: "/teams/camap-agp/SiteAssets/spmiddle/preview/joomla-categories-readonly",
  pageIntegration: {
    status: "connected-manually-stable-path-verified",
    existingHost: "confirmed",
    categoriesRegion: "present-and-rendered",
    legacyRuntime: "present",
    pageWrite: "manual-mse-edit-stable-path",
    visibleStatus: "Leitura concluída: 0 categorias",
    stablePathSwitch: "verified"
  },
  acceptance: {
    status: "passed-read-only-remote",
    publishedVisible: true,
    unpublishedHidden: true,
    trashedHidden: true,
    temporaryItemRemoved: true,
    finalVisibleCategoryCount: 0
  },
  inspect: {
    status: "list-exists",
    list: "mseCategories",
    web: "/teams/camap-agp/db",
    operation: "GET-only",
    confirmedBy: "SharePoint Site Contents and list page",
    apply: "not-run-by-current-session",
    provisioning: "list-created-fields-not-reverified",
    view: "empty-default-view-title-only",
    schemaValidation: "passed-newform-read-only",
    schemaFields: [
      "Title", "Alias", "Extension", "Description", "ParentId",
      "Level", "Ordering", "Published", "ParamsJson"
    ],
    requiredFields: ["Title", "Alias", "Extension", "Published"],
    fieldControls: {
      text: ["Title", "Alias", "Extension"],
      note: ["Description", "ParamsJson"],
      number: ["ParentId", "Level", "Ordering"],
      choice: ["Published"]
    },
    classicSettingsPage: "blocked-sharepoint-error-page",
    permissions: "not-changed"
  },
  rollback: {
    status: "ready-after-manual-connection",
    action: "restore the previous MSE script URL or remove only the Joomla categories script; use SharePoint file history and Git commits",
    legacyAsset: "/teams/camap-agp/SiteAssets/spmiddle/preview/2026-10-25-camap-readonly-v9/mse-preview-camap-readonly-runtime.js"
  },
  assets: []
};

for (const relative of assets) {
  const content = await readFile(resolve(root, relative));
  manifest.assets.push({
    path: relative,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex")
  });
}

const output = resolve(root, "tmp", "joomla-categories-package", "manifest.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(output);
console.log(JSON.stringify(manifest, null, 2));
