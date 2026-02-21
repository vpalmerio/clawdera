"use client";

import { createConfig, http, WagmiProvider } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hederaTestnet } from "@/lib/publicClient";
import { RPC_URL } from "@/lib/constants";

const wagmiConfig = createConfig({
  chains: [hederaTestnet],
  transports: {
    [hederaTestnet.id]: http(RPC_URL),
  },
  connectors: [metaMask()],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,   // 30s — blockchain data changes slowly
      gcTime: 5 * 60_000,  // 5 min cache
      retry: 2,
    },
  },
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
