/**
 * create-memejob-token.ts
 *
 * Exports `createMemeJobToken(wallet)` for use by other scripts.
 * Also runnable standalone:
 *   npx hardhat run scripts/create-memejob-token.ts --network hederaTestnet
 *
 * Key parameters for memeJob():
 *   - amount           = 0n  (no initial token buy, just creation)
 *   - distributeRewards= true
 *   - tx.value         = creationFee_tinybars * 10^10  (tinybars → weibars)
 *   - creationFee      ≈ $1 USD in HBAR, from exchange rate precompile at 0x168
 */

import { ethers } from "ethers";
import { fileURLToPath } from "url";

const MEMEJOB_ADDR = "0xa3bf9adec2fb49fb65c8948aed71c6bf1c4d61c8";
const MIRROR_NODE  = "https://testnet.mirrornode.hedera.com";

const EXCHANGE_RATE_PRECOMPILE = "0x0000000000000000000000000000000000000168";
const EXCHANGE_RATE_ABI = [
  "function tinycentsToTinybars(uint256 tinycents) external view returns (uint256)",
];
const MEMEJOB_ABI = [
  "function memeJob(string name, string symbol, string memo, address referrer, uint256 amount, bool distributeRewards) external payable returns (address)",
];

// =============================================================================
// EXPORTED FUNCTION
// =============================================================================

/**
 * Creates a new meme token on MemeJob and returns its checksummed EVM address.
 * The wallet must already be connected to a provider.
 */
export async function createMemeJobToken(
  wallet: ethers.Wallet,
  name?: string,
  symbol?: string,
): Promise<string> {
  const provider = wallet.provider!;

  // ── Fetch creation fee from exchange rate precompile (~$1 USD in HBAR) ─────
  const exchRate = new ethers.Contract(EXCHANGE_RATE_PRECOMPILE, EXCHANGE_RATE_ABI, provider);
  let creationFeeTinybars: bigint;
  try {
    const ONE_DOLLAR_TINYCENTS = 100n * 10n ** 8n;
    creationFeeTinybars = await exchRate.tinycentsToTinybars(ONE_DOLLAR_TINYCENTS);
  } catch {
    creationFeeTinybars = 10n * 10n ** 8n; // fallback: 10 HBAR
  }

  const valueWeibars = creationFeeTinybars * 10n ** 10n; // tinybars → weibars
  const tokenName    = name   ?? `ClawderaTest ${Date.now().toString().slice(-6)}`;
  const tokenSymbol  = symbol ?? `CLW${Date.now().toString().slice(-5)}`;

  console.log(`  Name   : ${tokenName}`);
  console.log(`  Symbol : ${tokenSymbol}`);
  console.log(`  Fee    : ${ethers.formatUnits(creationFeeTinybars, 8)} HBAR`);

  // ── Call memeJob() ──────────────────────────────────────────────────────────
  const memejob = new ethers.Contract(MEMEJOB_ADDR, MEMEJOB_ABI, wallet);
  const tx = await (memejob.memeJob(
    tokenName,
    tokenSymbol,
    "ipfs://placeholder",  // memo
    ethers.ZeroAddress,    // referrer
    0n,                    // amount = no initial buy
    true,                  // distributeRewards
    { value: valueWeibars, gasLimit: 400_000n },
  ) as Promise<ethers.TransactionResponse>);

  console.log(`  ↳ tx: ${tx.hash}`);
  console.log(`  Waiting for confirmation...`);

  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) {
    throw new Error("Token creation transaction reverted!");
  }
  console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);

  // ── Decode token address from Mirror Node ───────────────────────────────────
  // ethers does not expose return values for write transactions; use Mirror Node.
  const res  = await fetch(`${MIRROR_NODE}/api/v1/contracts/results/${tx.hash}`);
  const json = await res.json() as { call_result?: string };

  if (!json.call_result || json.call_result === "0x") {
    throw new Error("Could not decode token address from Mirror Node call_result");
  }

  const [decoded] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], json.call_result);
  return ethers.getAddress(decoded as string);
}

// =============================================================================
// STANDALONE ENTRY POINT
// Only executed when run directly:
//   npx hardhat run scripts/create-memejob-token.ts --network hederaTestnet
// =============================================================================

const RPC_URL = "https://testnet.hashio.io/api";

async function main() {
  try { process.loadEnvFile(); } catch { /* already loaded or not present */ }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(process.env.USER2_PRIVATE_KEY!, provider);

  console.log("Wallet :", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "HBAR");
  console.log("\nCreating token on MemeJob...");

  const tokenAddress = await createMemeJobToken(wallet);

  console.log("\n  New token address :", tokenAddress);
  console.log("  HashScan token    :", `https://hashscan.io/testnet/contract/${tokenAddress}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
