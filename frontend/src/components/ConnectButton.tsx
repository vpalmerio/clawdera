"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { Wallet, LogOut, ChevronDown, AlertTriangle } from "lucide-react";
import { shortenAddress } from "@/lib/utils";
import { HEDERA_TESTNET_CHAIN_ID } from "@/lib/constants";
import { useState, useEffect } from "react";

export function ConnectButton() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [open, setOpen] = useState(false);

  // Delay rendering wallet-state UI until after client hydration.
  // Server always renders the disconnected button; once mounted the real
  // state takes over — prevents the server/client HTML mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <button
        disabled
        className="flex items-center gap-2 rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white opacity-80"
      >
        <Wallet className="size-4" />
        Connect Wallet
      </button>
    );
  }

  const isWrongChain = isConnected && walletChainId !== HEDERA_TESTNET_CHAIN_ID;

  if (isConnected && address) {
    return (
      <div className="relative flex items-center gap-2">
        {/* Wrong-chain warning pill */}
        {isWrongChain && (
          <button
            onClick={() => switchChain({ chainId: HEDERA_TESTNET_CHAIN_ID })}
            disabled={isSwitching}
            className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-600 hover:bg-amber-100 transition-all disabled:opacity-60"
            title="Click to switch to Hedera Testnet"
          >
            <AlertTriangle className="size-3.5" />
            {isSwitching ? "Switching…" : "Wrong Network"}
          </button>
        )}

        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
            isWrongChain
              ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
          }`}
        >
          <span
            className={`size-2 rounded-full ${isWrongChain ? "bg-amber-400" : "bg-emerald-400"}`}
          />
          {shortenAddress(address)}
          <ChevronDown className="size-3.5" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-pink-100 bg-white py-1 shadow-lg shadow-pink-100/50">
              <div className="border-b border-pink-50 px-4 py-2">
                <p className="text-xs text-gray-400">Connected as</p>
                <p className="truncate font-mono text-xs text-gray-700">{address}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Chain:{" "}
                  <span
                    className={
                      isWrongChain
                        ? "font-semibold text-amber-500"
                        : "font-semibold text-emerald-600"
                    }
                  >
                    {isWrongChain
                      ? `ID ${walletChainId} (wrong)`
                      : "Hedera Testnet ✓"}
                  </span>
                </p>
              </div>
              {isWrongChain && (
                <button
                  onClick={() => {
                    switchChain({ chainId: HEDERA_TESTNET_CHAIN_ID });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-amber-600 hover:bg-amber-50"
                >
                  <AlertTriangle className="size-4" />
                  Switch to Hedera Testnet
                </button>
              )}
              <button
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50"
              >
                <LogOut className="size-4" />
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: metaMask() })}
      disabled={isPending}
      className="flex items-center gap-2 rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-pink-600 active:scale-95 disabled:opacity-60"
    >
      <Wallet className="size-4" />
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
