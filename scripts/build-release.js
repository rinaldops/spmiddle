import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const destination = path.join(root, "dist", metadata.version);
const packages = ["data-core", "sharepoint-files", "sharepoint-provisioning",
  "sharepoint-rest-browser", "sharepoint-rich-text", "sharepoint-schema"];
const files = ["README.md", "LICENSE", "SECURITY.md", "package.json",
  "host-adapters/modern-script-editor/layout.js",
  "host-adapters/modern-script-editor/layout.css",
  "host-adapters/modern-script-editor/spmiddle-mse-host.js"];
for (const name of packages) {
  files.push(`packages/${name}/package.json`);
  const entries = await readdir(path.join(root, "packages", name, "src"));
  files.push(...entries.filter((name) => name.endsWith(".js"))
    .map((file) => `packages/${name}/src/${file}`));
}

async function documentation(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await documentation(file);
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(file);
  }
}
await documentation("docs");
// PLANO-SPMIDDLE is an existing root document referenced by README/manual.
files.push("PLANO-SPMIDDLE.md");
const entries = [];
for (const file of files.sort()) {
  const bytes = await readFile(path.join(root, file));
  const target = path.join(destination, file);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(root, file), target);
  entries.push({ path: file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(path.join(destination, "release-manifest.json"), JSON.stringify({
  name: "spmiddle", version: metadata.version,
  layoutDefault: "Contained", layouts: ["Contained", "FullBleed"],
  hostEntrypoint: "host-adapters/modern-script-editor/spmiddle-mse-host.js",
  files: entries
}, null, 2) + "\n");
console.log(`Built dist/${metadata.version}: ${entries.length} files + release-manifest.json`);
