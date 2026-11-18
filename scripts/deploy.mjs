// Deploy AgentBoard.
//
// Modes:
//   node scripts/deploy.mjs --network testnet          (key mode: PRIVATE_KEY env, RPC_URL optional)
//   node scripts/deploy.mjs --network mainnet --payload-only
//        Prints the contract-creation payload { to: null, data } instead of
//        broadcasting. This is the payload to send from the Agentic Wallet
//        (baw) so the wallet itself is the deployer — no private key here.
//
// Networks:
//   mainnet  chain 56, Agent ID registry = SPACE ID (BNB Chain)
//   testnet  chain 97, deploys a MockAgentId as the registry (test only)
//   local    chain 31337 / ganache, MockAgentId registry (test only)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ethers } from "ethers";

const REGISTRY_MAINNET = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const NETWORKS = {
  mainnet: { chainId: 56, rpc: "https://bsc-dataseed.binance.org", registry: REGISTRY_MAINNET },
  testnet: { chainId: 97, rpc: "https://data-seed-prebsc-1-s1.binance.org:8545", registry: null },
  local: { chainId: 8545, rpc: "http://127.0.0.1:8545", registry: null },
};

const args = process.argv.slice(2);
const netName = args.includes("--network") ? args[args.indexOf("--network") + 1] : "local";
const payloadOnly = args.includes("--payload-only");
const net = NETWORKS[netName];
if (!net) throw new Error("unknown network: " + netName);
const rpc = process.env.RPC_URL || net.rpc;

const boardArt = JSON.parse(readFileSync("build/AgentBoard.json", "utf8"));
const mockArt = JSON.parse(readFileSync("build/MockAgentId.json", "utf8"));

function creationPayload(artifact, constructorArgs) {
  const iface = new ethers.Interface(artifact.abi);
  const types = iface.deploy.inputs.map((i) => i.type);
  const argsEncoded = types.length
    ? ethers.AbiCoder.defaultAbiCoder().encode(types, constructorArgs).slice(2)
    : "";
  return artifact.bytecode + argsEncoded;
}

if (payloadOnly) {
  if (!net.registry) throw new Error("--payload-only needs a network with a fixed registry (mainnet)");
  const data = creationPayload(boardArt, [net.registry]);
  console.log(JSON.stringify({ network: netName, chainId: net.chainId, to: null, data }, null, 2));
  process.exit(0);
}

const key = process.env.PRIVATE_KEY;
if (!key) throw new Error("PRIVATE_KEY env required for key mode (or use --payload-only)");
const provider = new ethers.JsonRpcProvider(rpc);
const wallet = new ethers.Wallet(key, provider);
console.log(`deployer: ${wallet.address} on ${netName} (${rpc})`);
const bal = await provider.getBalance(wallet.address);
console.log(`balance: ${ethers.formatEther(bal)} BNB`);
if (bal === 0n) throw new Error("deployer has no funds for gas");

async function deploy(artifact, constructorArgs = []) {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  return contract;
}

let registry = net.registry;
if (!registry) {
  const mock = await deploy(mockArt);
  registry = await mock.getAddress();
  console.log(`MockAgentId (test registry) deployed: ${registry}`);
}

const board = await deploy(boardArt, [registry]);
const address = await board.getAddress();
console.log(`AgentBoard deployed: ${address}`);

mkdirSync("deployments", { recursive: true });
const record = {
  network: netName,
  chainId: net.chainId,
  address,
  registry,
  deployer: wallet.address,
  deployedAt: new Date().toISOString(),
};
writeFileSync(`deployments/${netName}.json`, JSON.stringify(record, null, 2));
console.log(`record written: deployments/${netName}.json`);
console.log(`frontend config: CONTRACT_ADDRESS = "${address}"`);
