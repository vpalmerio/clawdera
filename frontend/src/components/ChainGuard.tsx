"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { HEDERA_TESTNET_CHAIN_ID } from "@/lib/constants";

/**
 * Renders children only when the wallet is connected to Hedera Testnet.
 * Otherwise shows a "Switch Network" prompt.
 *
 * Uses useAccount().chainId (the raw wallet chain ID) instead of useChainId(),
 * because useChainId() can return wagmi's configured default when the wallet is
 * on an unsupported chain, masking the mismatch.
 */
export function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId: walletChainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  // Not connected — parent handles this case
  if (!isConnected) return <>{children}</>;

  if (walletChainId === HEDERA_TESTNET_CHAIN_ID) return <>{children}</>;

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-amber-100">
        <AlertTriangle className="size-6 text-amber-500" />
      </div>
      <div>
        <p className="font-semibold text-amber-800">Wrong Network</p>
        <p className="mt-1 text-sm text-amber-600">
          You are connected to chain ID{" "}
          <span className="font-mono font-bold">{walletChainId ?? "unknown"}</span>.
          Please switch to{" "}
          <span className="font-semibold">Hedera Testnet</span> (chain ID 296)
          to continue.
        </p>
      </div>
      {error && (
        <p className="text-xs text-red-500">{error.message.slice(0, 120)}</p>
      )}
      <button
        onClick={() => switchChain({ chainId: HEDERA_TESTNET_CHAIN_ID })}
        disabled={isPending}
        className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 disabled:opacity-60 transition-all"
      >
        <RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Switching…" : "Switch to Hedera Testnet"}
      </button>
    </div>
  );
}
