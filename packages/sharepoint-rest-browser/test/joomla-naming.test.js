import assert from "node:assert/strict";
import { validateJoomlaListName } from "../src/index.js";

const catalog = [
  "mseExtensions",
  "mseMenu",
  "mseMenuTypes",
  "mseModules",
  "mseModulesMenu",
  "mseTemplateStyles",
  "mseCategories",
  "mseTags",
  "mseMedia",
  "mseContent",
  "mseContentitemTagMap",
  "mseSearchFilters"
];

for (const name of catalog) assert.equal(validateJoomlaListName(name), name);
assert.equal(new Set(catalog).size, catalog.length);
console.log("ok - Joomla migration catalog uses unique mse-prefixed list names");
