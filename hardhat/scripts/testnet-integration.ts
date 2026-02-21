/**
 * AgentCoordProtocol — Testnet Integration Script
 *
 * Runs the full end-to-end protocol flow on Hedera testnet:
 *   Step 1  User1 registers a delegation to the AI agent wallet
 *   Step 2  User1 deposits HBAR escrow on behalf of the AI agent
 *   Step 3  User2 creates a meme token on MemeJob
 *   Step 4  User2 submits the token to the protocol for agent review
 *   Step 5  AI Agent registers its on-chain identity (skipped if already done)
 *   Step 6  AI Agent submits a bullish thesis + pledges HBAR
 *   Step 7  Script waits for the 10-minute review window to close
 *   Step 8  Protocol executes the collective buy (auto via Hedera scheduler,
 *           or manually called here as fallback)
 *   Step 9  Results are printed (tokens purchased, agent share)
 *
 * Usage:
 *   npx hardhat run scripts/testnet-integration.ts --network hederaTestnet
 *
 * Required .env variables:
 *   USER1_PRIVATE_KEY      — human user wallet (delegator)
 *   USER2_PRIVATE_KEY      — token creator wallet
 *   AI_AGENT_PRIVATE_KEY   — AI agent wallet
 */

import { ethers } from "ethers";
import { createMemeJobToken } from "./create-memejob-token.js";

// .env may not be loaded yet when running standalone via `npx hardhat run`
try { process.loadEnvFile(); } catch { /* already loaded or not present */ }

// =============================================================================
// CONFIGURATION — edit these values before running
// =============================================================================

/** Deployed AgentCoordProtocol address (from deploy.ts output) */
// Old contract with 10-minute review window: 0xfA738659adb033c2dFcBE3cd387108C572d76476;
const PROTOCOL_ADDRESS = "0x3bd0A94a790E4C36f242371C23Db296a702db7Dd";


/** Hedera testnet JSON-RPC endpoint */
const RPC_URL = "https://testnet.hashio.io/api";

// --- Hedera EVM unit note -------------------------------------------------------
// On Hedera, msg.value inside Solidity contracts is in TINYBARS (10^8 per HBAR),
// NOT weibars (10^18 per HBAR). The JSON-RPC relay converts transaction `value`
// fields automatically, but uint256 function arguments are passed as-is and must
// already be in tinybars. Keep the two groups clearly separate:
//   • Transaction `value` options  → weibars  (ethers.parseEther / parseUnits 18)
//   • Solidity function arguments  → tinybars (ethers.parseUnits(x, 8))
const HBAR = ethers.parseUnits("1", 8); // 1 HBAR expressed in tinybars (10^8)

// --- Transaction value fields (weibars — relay converts to tinybars) ----------

/** HBAR user1 deposits into the agent's escrow (tx value field) */
const ESCROW_DEPOSIT = ethers.parseEther("5");   // 5 HBAR in weibars

/**
 * Fee user2 pays when submitting the token to the protocol (tx value field).
 * Must be >= MIN_SUBMISSION_FEE set at deployment (1 HBAR = 10^8 tinybars).
 */
const SUBMISSION_FEE = ethers.parseEther("1");    // 1 HBAR in weibars

// --- Solidity function arguments (tinybars) -----------------------------------

/** Maximum HBAR the agent is permitted to pledge — stored in Delegation.maxAmount */
const MAX_DELEGATION_AMOUNT = 5n * HBAR;  // 5 HBAR in tinybars

/** Amount the AI agent actually pledges on this token — checked against agentEscrow */
const AGENT_PLEDGE = 2n * HBAR;           // 2 HBAR in tinybars

// --- Agent thesis label -------------------------------------------------------

const TOKEN_SYMBOL = `CLW${Date.now().toString().slice(-5)}`; // unique per run

// --- Agent identity / thesis -------------------------------------------------

/** Off-chain metadata URI for the AI agent's ERC-8004 identity record */
const AGENT_METADATA_URI = "ipfs://QmClawderaAgentV1";

/** Bullish thesis text the AI agent will post on-chain */
const AGENT_THESIS =
  `[${new Date().toISOString()}] On-chain analysis for ${TOKEN_SYMBOL}: ` +
  "Strong community signal detected. Early liquidity, viral potential, " +
  "low sell pressure. Social-media momentum score: 87/100. " +
  "Conviction: HIGH — pledging maximum allocation.";

// =============================================================================
// PROVIDER & WALLETS
// =============================================================================

const provider = new ethers.JsonRpcProvider(RPC_URL);

const user1Wallet  = new ethers.Wallet(process.env.USER1_PRIVATE_KEY!,     provider);
const user2Wallet  = new ethers.Wallet(process.env.USER2_PRIVATE_KEY!,     provider);
const agentWallet  = new ethers.Wallet(process.env.AI_AGENT_PRIVATE_KEY!,  provider);

// =============================================================================
// CONTRACT ABIs  (human-readable fragments — only functions/events we call)
// =============================================================================

const PROTOCOL_ABI = [
  // Delegation (ERC-7710)
  "function registerDelegation(address agentAddress, uint256 maxAmount, uint256 expiry, bytes calldata signature) external",
  "function depositForAgent(address agentAddress) external payable",
  "function getDelegation(address delegator, address agent) external view returns (tuple(address delegator, address delegate, uint256 maxAmount, uint256 expiry, bytes signature))",
  "function agentEscrow(address) external view returns (uint256)",

  // Agent identity (ERC-8004)
  "function registerAgent(string calldata metadataURI) external",
  "function agentIdentities(address) external view returns (address agentAddress, string metadataURI, uint256 registrationTime, int256 reputationScore, uint256 totalTrades, uint256 profitableTrades)",

  // Core protocol
  "function submitToken(address tokenAddress) external payable returns (uint256 reviewId)",
  "function submitThesis(uint256 reviewId, string calldata thesis, bool bullish, uint256 pledgedAmount, address delegator) external",
  "function executeReview(uint256 reviewId) external",

  // Views
  "function getReview(uint256 reviewId) external view returns (tuple(address tokenAddress, address creator, uint256 submissionFee, uint256 deadline, bool executed, bool exists, uint256 totalPledged, uint256 totalPurchased, address scheduleAddress))",
  "function getAgentShare(uint256 reviewId, address agent) external view returns (tuple(uint256 pledgedAmount, uint256 tokenShare, bool claimed))",
  "function REVIEW_WINDOW() external view returns (uint256)",
  "function nextReviewId() external view returns (uint256)",

  // Events
  "event TokenSubmitted(uint256 indexed reviewId, address indexed tokenAddress, address indexed creator, uint256 fee, uint256 deadline)",
  "event ReviewExecuted(uint256 indexed reviewId, uint256 totalSpent, uint256 tokensReceived)",
  "event FeeDistributed(uint256 indexed reviewId, address indexed agent, uint256 amount)",
];


// =============================================================================
// CONTRACT INSTANCES
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protocol  = new ethers.Contract(PROTOCOL_ADDRESS, PROTOCOL_ABI, provider) as any;

// =============================================================================
// HELPERS
// =============================================================================

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function banner(title: string) {
  console.log("\n" + "─".repeat(60));
  console.log(` ${title}`);
  console.log("─".repeat(60));
}

function parseEvent(receipt: ethers.TransactionReceipt, iface: ethers.Interface, eventName: string) {
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === eventName) return parsed;
    } catch { /* not this event */ }
  }
  return null;
}

async function waitAndConfirm(label: string, tx: ethers.TransactionResponse) {
  console.log(`  ↳ tx: ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error(`${label} transaction reverted`);
  console.log(`  ✓ confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

// =============================================================================
// MAIN
// =============================================================================

banner("AgentCoordProtocol — Testnet Integration");
console.log("\nWallets:");
console.log("  User1 (delegator) :", user1Wallet.address);
console.log("  User2 (creator)   :", user2Wallet.address);
console.log("  AI Agent          :", agentWallet.address);

// Print balances
const [bal1, bal2, bal3] = await Promise.all([
  provider.getBalance(user1Wallet.address),
  provider.getBalance(user2Wallet.address),
  provider.getBalance(agentWallet.address),
]);
console.log("\nBalances:");
console.log("  User1  :", ethers.formatEther(bal1), "HBAR");
console.log("  User2  :", ethers.formatEther(bal2), "HBAR");
console.log("  Agent  :", ethers.formatEther(bal3), "HBAR");

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — User1 registers delegation to AI agent
// ─────────────────────────────────────────────────────────────────────────────
banner("Step 1 — Register delegation  (User1 → AI Agent)");

const existing = await protocol.getDelegation(user1Wallet.address, agentWallet.address);
if (existing.delegate !== ethers.ZeroAddress) {
  console.log("  Delegation already registered — skipping.");
} else {
  const dummySig = ethers.randomBytes(65); // contract stores but does not validate the sig
  const tx = await protocol.connect(user1Wallet).registerDelegation(
    agentWallet.address,
    MAX_DELEGATION_AMOUNT,
    0,          // expiry = 0 → no expiry
    dummySig,
  );
  await waitAndConfirm("registerDelegation", tx);
}
console.log("  Max pledge allowed :", ethers.formatUnits(MAX_DELEGATION_AMOUNT, 8), "HBAR");

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — User1 deposits HBAR escrow for the AI agent
// ─────────────────────────────────────────────────────────────────────────────
banner("Step 2 — Deposit escrow  (User1 funds AI Agent)");

const currentEscrow = await protocol.agentEscrow(agentWallet.address);
console.log("  Current escrow     :", ethers.formatUnits(currentEscrow, 8), "HBAR");
console.log("  Depositing         :", ethers.formatEther(ESCROW_DEPOSIT), "HBAR");

const txEscrow = await protocol.connect(user1Wallet).depositForAgent(
  agentWallet.address,
  { value: ESCROW_DEPOSIT },
);
await waitAndConfirm("depositForAgent", txEscrow);
console.log("  New escrow total   :", ethers.formatUnits(await protocol.agentEscrow(agentWallet.address), 8), "HBAR");

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Create a new MemeJob token (User2)
// ─────────────────────────────────────────────────────────────────────────────
banner("Step 3 — Create MemeJob token  (User2)");

const tokenAddress = await createMemeJobToken(user2Wallet);
console.log("  Token address :", tokenAddress);
console.log("  HashScan      :", `https://hashscan.io/testnet/contract/${tokenAddress}`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — User2 submits the token to the protocol for agent review
// ─────────────────────────────────────────────────────────────────────────────
banner("Step 4 — Submit token to protocol  (User2)");
console.log("  Token address  :", tokenAddress);
console.log("  Submission fee :", ethers.formatEther(SUBMISSION_FEE), "HBAR");

const txSubmit = await protocol.connect(user2Wallet).submitToken(
  tokenAddress,
  { value: SUBMISSION_FEE },
) as ethers.TransactionResponse;
const receiptSubmit = await waitAndConfirm("submitToken", txSubmit);

// Parse reviewId from the TokenSubmitted event
const submitEvent = parseEvent(receiptSubmit, protocol.interface, "TokenSubmitted");
if (!submitEvent) throw new Error("TokenSubmitted event not found in receipt");
const reviewId: bigint = submitEvent.args.reviewId;
const deadline: bigint = submitEvent.args.deadline;

console.log("  Review ID :", reviewId.toString());
console.log("  Deadline  :", new Date(Number(deadline) * 1000).toLocaleString());

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — AI Agent registers its on-chain identity (ERC-8004)
// ─────────────────────────────────────────────────────────────────────────────
banner("Step 5 — Register AI Agent identity  (ERC-8004)");

const agentId = await protocol.agentIdentities(agentWallet.address);
if (agentId.agentAddress !== ethers.ZeroAddress) {
  console.log("  Agent already registered — skipping.");
  console.log("  Reputation score :", agentId.reputationScore.toString());
} else {
  const txReg = await protocol.connect(agentWallet).registerAgent(AGENT_METADATA_URI);
  await waitAndConfirm("registerAgent", txReg);
  console.log("  Metadata URI :", AGENT_METADATA_URI);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — AI Agent submits a bullish thesis
// ─────────────────────────────────────────────────────────────────────────────
banner("Step 6 — Submit bullish thesis  (AI Agent)");
console.log("  Review ID      :", reviewId.toString());
console.log("  Pledge amount  :", ethers.formatUnits(AGENT_PLEDGE, 8), "HBAR");
console.log("  Thesis preview :", AGENT_THESIS.slice(0, 80) + "...");

const txThesis = await protocol.connect(agentWallet).submitThesis(
  reviewId,
  AGENT_THESIS,
  true,               // bullish = true → invest
  AGENT_PLEDGE,
  user1Wallet.address // delegator whose escrow is being used
) as ethers.TransactionResponse;
await waitAndConfirm("submitThesis", txThesis);

// Confirm escrow was deducted
const escrowAfter = await protocol.agentEscrow(agentWallet.address);
console.log("  Agent escrow after pledge :", ethers.formatUnits(escrowAfter, 8), "HBAR");

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Wait for the review window to close
// ─────────────────────────────────────────────────────────────────────────────
banner("Step 7 — Waiting for review window to close");

const nowTs    = BigInt(Math.floor(Date.now() / 1000));
const waitSecs = Number(deadline - nowTs) + 30; // 30 s buffer after deadline

if (waitSecs > 0) {
  console.log(`  Review window closes at : ${new Date(Number(deadline) * 1000).toLocaleString()}`);
  console.log(`  Waiting ~${Math.ceil(waitSecs / 60)} minute(s)...`);

  // Print a heartbeat every 30 seconds so the terminal doesn't look frozen
  const intervalId = setInterval(() => {
    const remaining = Number(deadline) - Math.floor(Date.now() / 1000);
    if (remaining > 0) {
      process.stdout.write(`\r  ${remaining}s remaining...   `);
    }
  }, 5000);

  await sleep(waitSecs * 1000);
  clearInterval(intervalId);
  process.stdout.write("\r  Window closed.                     \n");
} else {
  console.log("  Deadline already passed — proceeding immediately.");
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — Execute review (auto via Hedera scheduler, or manual fallback)
// ─────────────────────────────────────────────────────────────────────────────
banner("Step 8 — Execute review");

const reviewState = await protocol.getReview(reviewId);

if (reviewState.executed) {
  console.log("  ✓ Review was executed automatically by the Hedera Scheduled Transaction!");
} else {
  console.log("  Scheduled transaction has not fired yet — calling executeReview() manually...");
  try {
    const txExec = await protocol.connect(user1Wallet).executeReview(reviewId) as ethers.TransactionResponse;
    const execReceipt = await waitAndConfirm("executeReview", txExec);

    const execEvent = parseEvent(execReceipt, protocol.interface, "ReviewExecuted");
    if (execEvent) {
      console.log("  Total HBAR spent    :", ethers.formatUnits(execEvent.args.totalSpent, 8), "HBAR");
      console.log("  Tokens received     :", execEvent.args.tokensReceived.toString());
    }

    const feeEvents = execReceipt.logs
      .map(log => { try { return protocol.interface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; } })
      .filter(e => e?.name === "FeeDistributed");
    if (feeEvents.length > 0) {
      console.log(`  Submission fee distributed to ${feeEvents.length} thesis submitter(s).`);
    }
  } catch (err: any) {
    if (err?.message?.includes("Already executed")) {
      console.log("  ✓ Review was executed by the scheduled transaction just before manual call.");
    } else {
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9 — Print final results
// ─────────────────────────────────────────────────────────────────────────────
banner("Step 9 — Results");

const finalReview = await protocol.getReview(reviewId);
const agentShare  = await protocol.getAgentShare(reviewId, agentWallet.address);

console.log("\n  Review summary:");
console.log("    Token address   :", finalReview.tokenAddress);
console.log("    Total pledged   :", ethers.formatUnits(finalReview.totalPledged, 8), "HBAR");
console.log("    Tokens bought   :", finalReview.totalPurchased.toString());
console.log("    Executed        :", finalReview.executed);

console.log("\n  AI Agent share:");
console.log("    Pledged         :", ethers.formatUnits(agentShare.pledgedAmount, 8), "HBAR");
console.log("    Token share     :", agentShare.tokenShare.toString());
console.log("    Claimed         :", agentShare.claimed);

if (agentShare.tokenShare > 0n) {
  console.log("\n  ✓ Agent has tokens to claim via claimTokens(" + reviewId + ")");
}

console.log("\n  HashScan links:");
console.log("    Protocol :", `https://hashscan.io/testnet/contract/${PROTOCOL_ADDRESS}`);
console.log("    Token    :", `https://hashscan.io/testnet/contract/${tokenAddress}`);
console.log();
