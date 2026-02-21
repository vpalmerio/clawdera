// =============================================================================
// NETWORK CONSTANTS — edit these to target a different deployment
// =============================================================================

/** Deployed AgentCoordProtocol contract address on Hedera testnet */
export const PROTOCOL_ADDRESS =
  "0x3bd0A94a790E4C36f242371C23Db296a702db7Dd" as const;

/** MemeJob contract address on Hedera testnet */
export const MEMEJOB_ADDRESS =
  "0xa3bf9adec2fb49fb65c8948aed71c6bf1c4d61c8" as const;

/** Hedera testnet JSON-RPC relay — used for on-chain reads and wallet txs */
export const RPC_URL = "https://testnet.hashio.io/api";

/** Hedera testnet Mirror Node base URL — used for event/log queries */
export const MIRROR_NODE_URL = "https://testnet.mirrornode.hedera.com";

/** HashScan explorer base URL */
export const HASHSCAN_URL = "https://hashscan.io/testnet";

// =============================================================================
// HEDERA UNIT HELPERS
// =============================================================================

/**
 * On Hedera, msg.value inside Solidity is delivered in TINYBARS (10^8 per HBAR).
 * The JSON-RPC relay converts transaction `value` fields automatically, but
 * contract uint256 arguments must already be in tinybars.
 *
 * All HBAR-denominated values stored in the contract are in tinybars.
 * Divide by TINYBARS_PER_HBAR to display in HBAR.
 */
export const TINYBARS_PER_HBAR = 100_000_000n; // 10^8

/** Hedera testnet chain ID */
export const HEDERA_TESTNET_CHAIN_ID = 296;
