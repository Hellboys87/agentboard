// Functional test on a local Ganache chain:
// deploys MockAgentId + AgentBoard and exercises the full flow.
import { readFileSync } from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (n) => JSON.parse(readFileSync(`build/${n}.json`, "utf8"));

const server = ganache.server({ logging: { quiet: true } });
await server.listen(0);
const port = server.address().port;
const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`);
const [deployer, alice, bob, stranger] = await Promise.all(
  [0, 1, 2, 3].map((i) => provider.getSigner(i)),
);

async function deploy(name, signer, args = []) {
  const a = artifact(name);
  const factory = new ethers.ContractFactory(a.abi, a.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error("FAILED: " + label);
  passed++;
  console.log("ok -", label);
}
async function reverts(promise, label) {
  try {
    const tx = await promise;
    if (tx && typeof tx.wait === "function") await tx.wait();
  } catch {
    passed++;
    console.log("ok -", label);
    return;
  }
  throw new Error("FAILED (expected revert): " + label);
}

const mock = await deploy("MockAgentId", deployer);
const board = await deploy("AgentBoard", deployer, [await mock.getAddress()]);

// Alice and Bob hold an Agent ID; Stranger does not.
await (await mock.setBalance(await alice.getAddress(), 1)).wait();
await (await mock.setBalance(await bob.getAddress(), 1)).wait();

ok(await board.isAgent(await alice.getAddress()), "isAgent true for holder");
ok(!(await board.isAgent(await stranger.getAddress())), "isAgent false for non-holder");

await reverts(board.connect(stranger).register("trader", ""), "register reverts without Agent ID");
await (await board.connect(alice).register("trader", "https://example.com/alice")).wait();
await (await board.connect(bob).register("builder", "")).wait();
ok((await board.agentCount()) === 2n, "two agents registered");
ok(await board.isRegistered(await alice.getAddress()), "alice registered");

await reverts(board.connect(stranger).checkIn("hi"), "check-in reverts without Agent ID");
await (await board.connect(alice).checkIn("GM agents, day one")).wait();
let ag = await board.agents(await alice.getAddress());
ok(ag.checkIns === 1n && ag.streak === 1n, "first check-in: count 1, streak 1");
ok(ag.lastMessage === "GM agents, day one", "check-in message stored");
await reverts(board.connect(alice).checkIn("again"), "second check-in same day reverts");

// Next UTC day: streak grows.
await provider.send("evm_increaseTime", [86400]);
await provider.send("evm_mine", []);
await (await board.connect(alice).checkIn("day two")).wait();
ag = await board.agents(await alice.getAddress());
ok(ag.streak === 2n, "streak grows on consecutive day");

// Skip a day: streak resets to 1.
await provider.send("evm_increaseTime", [2 * 86400]);
await provider.send("evm_mine", []);
await (await board.connect(alice).checkIn("back after a gap")).wait();
ag = await board.agents(await alice.getAddress());
ok(ag.streak === 1n && ag.checkIns === 3n, "streak resets after a missed day");

await reverts(board.connect(alice).endorse(await alice.getAddress()), "self-endorsement reverts");
await (await board.connect(bob).endorse(await alice.getAddress())).wait();
ag = await board.agents(await alice.getAddress());
ok(ag.endorsements === 1n, "endorsement counted");
await reverts(board.connect(bob).endorse(await alice.getAddress()), "double endorsement reverts");
await reverts(board.connect(bob).endorse(await stranger.getAddress()), "endorsing unregistered reverts");

ok((await board.totalCheckIns()) === 3n, "totalCheckIns = 3");
const page = await board.getAgents(0, 50);
ok(page.length === 2, "getAgents returns both agents");

await server.close();
console.log(`\nALL ${passed} CHECKS PASSED`);
