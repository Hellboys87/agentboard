// Verify AgentBoard source on BscScan (via the Etherscan V2 API, chainid 56).
// Needs ETHERSCAN_API_KEY in the environment.
//   node scripts/verify.mjs --network mainnet
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const netName = args.includes("--network") ? args[args.indexOf("--network") + 1] : "mainnet";
const chainId = netName === "mainnet" ? 56 : 97;

const apiKey = process.env.ETHERSCAN_API_KEY;
if (!apiKey) throw new Error("ETHERSCAN_API_KEY env required");

const deployment = JSON.parse(readFileSync(`deployments/${netName}.json`, "utf8"));
const standardInput = JSON.parse(readFileSync("build/standard-input.json", "utf8"));
// The verifier wants the settings without outputSelection.
delete standardInput.settings.outputSelection;

const { ethers } = await import("ethers");
const constructorArgs = ethers.AbiCoder.defaultAbiCoder()
  .encode(["address"], [deployment.registry])
  .slice(2);

const body = new URLSearchParams({
  apikey: apiKey,
  module: "contract",
  action: "verifysourcecode",
  contractaddress: deployment.address,
  sourceCode: JSON.stringify(standardInput),
  codeformat: "solidity-standard-json-input",
  contractname: "AgentBoard.sol:AgentBoard",
  compilerversion: "v0.8.26+commit.8a97fa7a",
  constructorArguements: constructorArgs,
});

const res = await fetch(`https://api.etherscan.io/v2/api?chainid=${chainId}`, {
  method: "POST",
  body,
});
const json = await res.json();
console.log(JSON.stringify(json, null, 2));
if (json.status === "1") {
  console.log(`verification submitted, guid: ${json.result}`);
  console.log("poll: module=contract&action=checkverifystatus with this guid");
}
