/**
 * AgentCoordProtocol — Hedera Testnet Deployment Script
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network hederaTestnet
 *
 * Required .env variables:
 *   PROTOCOL_DEPLOYER_PRIVATE_KEY   — deployer wallet private key
 */

import { network } from "hardhat";
import { ethers } from "ethers";

// =============================================================================
// DEPLOYMENT CONFIGURATION
// Edit these values before deploying.
// =============================================================================

/** Real MemeJob contract address on Hedera testnet */
const MEMEJOB_ADDRESS = "0xa3bf9adec2fb49fb65c8948aed71c6bf1c4d61c8";

/**
 * Minimum HBAR a token creator must send when calling submitToken().
 * This fee is redistributed to all agents that submitted a thesis.
 *
 * IMPORTANT — Hedera EVM unit: on Hedera, msg.value inside Solidity contracts
 * is delivered in tinybars (1 HBAR = 10^8 tinybars), NOT weibars.
 * Transaction `value` fields sent via the JSON-RPC relay use weibars and are
 * automatically converted, but uint256 constructor/function arguments are
 * passed as-is, so they must already be in tinybars.
 */
const MIN_SUBMISSION_FEE = ethers.parseUnits("1", 8); // 1 HBAR in tinybars (10^8)

/**
 * How long (in seconds) agents have to read the token and submit their thesis
 * after a creator calls submitToken().  After this window the protocol
 * automatically executes the collective buy via the Hedera Scheduling Service.
 *
 * For integration testing 60 seconds is enough time for agents to submit.
 * Increase to 10 * 60 (10 minutes) or more for a real deployment.
 */
const REVIEW_WINDOW_SECONDS = 60; // 60 seconds (fast integration-test default)

/**
 * Gas limit forwarded to the scheduled executeReview() call.
 * Increase if you add more agents per round; 3 M is sufficient for ~50 agents.
 */
const EXECUTION_GAS_LIMIT = 3_000_000;

/**
 * Optional: seed HBAR sent to the protocol contract at deployment.
 * The contract needs a native balance to pay Hedera scheduling fees.
 * Set to 0n if you prefer to fund the contract separately.
 */
const INITIAL_FUND_HBAR = ethers.parseEther("10"); // 10 HBAR

// =============================================================================
// DEPLOYMENT
// =============================================================================

const { ethers: hardhatEthers } = await network.connect({
  network: "hederaTestnet",
  chainType: "l1",
});

const [deployer] = await hardhatEthers.getSigners();

console.log("=".repeat(60));
console.log("AgentCoordProtocol — Hedera Testnet Deployment");
console.log("=".repeat(60));
console.log();
console.log("Deployer address :", await deployer.getAddress());
console.log(
  "Deployer balance :",
  ethers.formatEther(await hardhatEthers.provider.getBalance(await deployer.getAddress())),
  "HBAR"
);
console.log();
console.log("Configuration:");
console.log("  MemeJob address      :", MEMEJOB_ADDRESS);
console.log("  Min submission fee   :", ethers.formatUnits(MIN_SUBMISSION_FEE, 8), "HBAR");
console.log("  Review window        :", REVIEW_WINDOW_SECONDS, "seconds");
console.log("  Execution gas limit  :", EXECUTION_GAS_LIMIT.toLocaleString());
console.log("  Initial fund         :", ethers.formatEther(INITIAL_FUND_HBAR), "HBAR");
console.log();

// Sanity check
if (MEMEJOB_ADDRESS === ethers.ZeroAddress) {
  throw new Error("MEMEJOB_ADDRESS must be set to a non-zero address");
}
if (MIN_SUBMISSION_FEE === 0n) {
  throw new Error("MIN_SUBMISSION_FEE must be > 0");
}
if (REVIEW_WINDOW_SECONDS < 60) {
  throw new Error("REVIEW_WINDOW_SECONDS should be at least 60 seconds");
}

console.log("Deploying AgentCoordProtocol...");

const ProtocolFactory = await hardhatEthers.getContractFactory(
  "AgentCoordProtocol",
  deployer
);

const protocol = await ProtocolFactory.deploy(
  MEMEJOB_ADDRESS,
  MIN_SUBMISSION_FEE,
  REVIEW_WINDOW_SECONDS,
  EXECUTION_GAS_LIMIT,
  { value: INITIAL_FUND_HBAR }
);

console.log("  Transaction hash :", protocol.deploymentTransaction()?.hash);
console.log("  Waiting for confirmation...");

await protocol.waitForDeployment();

const protocolAddress = await protocol.getAddress();

console.log();
console.log("=".repeat(60));
console.log("Deployment successful!");
console.log("=".repeat(60));
console.log();
console.log("Contract address     :", protocolAddress);
console.log("Owner                :", await deployer.getAddress());
console.log();
console.log("Deployed immutables (read-back from chain):");
console.log("  MIN_SUBMISSION_FEE :", ethers.formatUnits(await protocol.MIN_SUBMISSION_FEE(), 8), "HBAR");
console.log("  REVIEW_WINDOW      :", (await protocol.REVIEW_WINDOW()).toString(), "seconds");
console.log("  EXECUTION_GAS_LIMIT:", (await protocol.EXECUTION_GAS_LIMIT()).toString());
console.log("  MemeJob address    :", await protocol.memeJobAddress());
console.log();
console.log("Next steps:");
console.log("  1. Save the contract address above — you will need it for the frontend / agents.");
console.log("  2. Verify the contract on HashScan: https://hashscan.io/testnet/contract/" + protocolAddress);
console.log("  3. Top up the contract balance if needed:");
console.log('     await protocol.receive({ value: ethers.parseEther("X") })');
console.log("  4. Register agent identities via registerAgent(metadataURI).");
console.log("  5. Users can now delegate to agent wallets via registerDelegation() + depositForAgent().");
