/*
 * Local dry-run for the ASPX incremental validation runbook.
 *
 * This is not a browser test and does not access SharePoint. It translates the
 * fake host contract into the sanitized report shape used by the runbook.
 */
import { createIncrementalMseHost, createMemoryTransport } from "./app.js";
import { pathToFileURL } from "node:url";

const placeholderItems = [
  { id: "<item-a>", title: "<title-a>", category: "<category>", value: "<value-a>" },
  { id: "<item-b>", title: "<title-b>", category: "<category>", value: "<value-b>" }
];

export async function runIncrementalDryRun() {
  const transport = createMemoryTransport(placeholderItems);
  const host = createIncrementalMseHost({
    transport,
    initialState: {
      items: placeholderItems,
      query: "",
      filter: "<category>",
      layout: "<layout>"
    }
  });

  const firstRoot = host.mount();
  const secondRoot = host.mount();

  await host.dispatch({ type: "query", value: "<query>" });
  await host.dispatch({ type: "filter", value: "<filtered-category>" });
  await host.dispatch({
    type: "update",
    item: { id: "<item-a>", value: "<updated-value>" }
  });
  await host.dispatch({ type: "layout", value: "<compact-layout>" });

  const metrics = host.metrics();
  const rootRemounts = metrics.rootMounts - (firstRoot === secondRoot ? 1 : 0);
  const internalNavigations = metrics.fullNavigations;
  const pass = rootRemounts === 0
    && metrics.fullNavigations === 0
    && metrics.affectedRegions.length === 4;

  return {
    status: pass ? "pass" : "fail",
    mode: "local-dry-run",
    fullReloads: metrics.fullNavigations,
    rootRemounts,
    internalNavigations,
    affectedRegion: metrics.affectedRegions.join(","),
    rollback: "not-run",
    limitations: "fake host only; no ASPX, browser, SharePoint or tenant evidence",
    rootMounts: metrics.rootMounts,
    staleResponsesIgnored: metrics.staleResponsesIgnored,
    state: host.getState(),
    requests: transport.calls
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runIncrementalDryRun();
  console.log(JSON.stringify(report, null, 2));
}
