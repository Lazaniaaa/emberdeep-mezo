// Compiles the contracts with solc 0.8.28 (Solady from node_modules): the Hall of Descents and the Mezo key router.
// `npm run hall:compile` writes contracts/out/<Name>.json (ABI and bytecode, used by the deploy page) and
// contracts/out/<Name>.standard-input.json (paste into the explorer's "Standard JSON input" verification).
// The tests import compileHall() / compileContract() so they always test the source, not a stale artifact.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const solc = require("solc");
const root = new URL("../", import.meta.url);
/** The contracts that ship, by name. Mezo runs Cancun, so the same settings serve Arc and Mezo. */
export const CONTRACTS = { EmberdeepHall: "contracts/EmberdeepHall.sol", EmberKeyRouter: "contracts/EmberKeyRouter.sol" };

/** Settings the deployed bytecode is built with. Changing them changes the bytecode, so verification must match. */
export const SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "cancun",
  outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
};

function readImport(path) {
  const file = path.startsWith("solady/") ? `node_modules/solady/src/${path.slice("solady/".length)}` : path;
  return readFileSync(fileURLToPath(new URL(file, root)), "utf8");
}

/** Every source the contract pulls in, keyed as solc sees it. */
function collectSources(source) {
  const sources = {};
  const visit = path => {
    if (sources[path]) return;
    const content = readImport(path);
    sources[path] = { content };
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    for (const [, spec] of content.matchAll(/import\s+(?:\{[^}]*\}\s+from\s+)?"([^"]+)"/g)) {
      visit(spec.startsWith("./") || spec.startsWith("../") ? new URL(spec, `file:///${dir}`).pathname.slice(1) : spec);
    }
  };
  visit(source);
  return sources;
}

/** Compiles one contract from a source file (a shipped one, or a test helper such as contracts/test/RouterMocks.sol). */
export function compileContract(source, name) {
  const input = { language: "Solidity", sources: collectSources(source), settings: SETTINGS };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(e => e.severity === "error");
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join("\n"));
  const contract = output.contracts[source][name];
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
    compiler: solc.version(),
    input,
  };
}

export const compileHall = () => compileContract(CONTRACTS.EmberdeepHall, "EmberdeepHall");

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = fileURLToPath(new URL("contracts/out/", root));
  mkdirSync(dir, { recursive: true });
  for (const [name, source] of Object.entries(CONTRACTS)) {
    const { input, ...artifact } = compileContract(source, name);
    writeFileSync(`${dir}${name}.json`, `${JSON.stringify({ contractName: name, ...artifact }, null, 2)}\n`);
    // The explorer wants the full output selection it would use itself; the sources and settings are what matter.
    writeFileSync(`${dir}${name}.standard-input.json`, `${JSON.stringify(input, null, 2)}\n`);
    console.log(`${name}: solc ${artifact.compiler}, ${(artifact.deployedBytecode.length - 2) / 2} bytes deployed.`);
  }
  console.log("Wrote contracts/out/.");
}
