// Compile the contracts with solc-js into build/<Name>.json {abi, bytecode}.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import solc from "solc";

const sources = {};
for (const name of ["AgentBoard", "MockAgentId"]) {
  sources[`${name}.sol`] = { content: readFileSync(`contracts/${name}.sol`, "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    evmVersion: "paris",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const e of output.errors ?? []) {
  if (e.severity === "warning") console.warn("warning:", e.message);
}

mkdirSync("build", { recursive: true });
writeFileSync("build/standard-input.json", JSON.stringify(input, null, 2));
for (const [file, contracts] of Object.entries(output.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    writeFileSync(
      `build/${name}.json`,
      JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2),
    );
    console.log(`${name}: bytecode ${(c.evm.bytecode.object.length / 2).toLocaleString()} bytes`);
  }
}
console.log("compiled OK");
