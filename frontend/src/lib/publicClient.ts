import { createPublicClient, http, defineChain } from "viem";
import { RPC_URL, HEDERA_TESTNET_CHAIN_ID, HASHSCAN_URL } from "./constants";

export const hederaTestnet = defineChain({
  id: HEDERA_TESTNET_CHAIN_ID,
  name: "Hedera Testnet",
  nativeCurrency: {
    name: "HBAR",
    symbol: "HBAR",
    decimals: 18, // weibars (the relay-facing unit); contract stores tinybars
  },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "HashScan",
      url: HASHSCAN_URL,
      apiUrl: HASHSCAN_URL,
    },
  },
});

/** Read-only client — no wallet required */
export const publicClient = createPublicClient({
  chain: hederaTestnet,
  transport: http(RPC_URL),
});
