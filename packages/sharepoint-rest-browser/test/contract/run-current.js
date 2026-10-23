import { createSharePointRestClient } from "../../src/index.js";
import { runSharePointRestContract } from "./sharepoint-rest.contract.js";

const count = await runSharePointRestContract(createSharePointRestClient, {
  report: (name) => console.log(`ok - ${name}`)
});
console.log(`contract: ${count} tests passed`);
