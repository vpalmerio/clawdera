"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { X, Send, AlertCircle, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { PROTOCOL_ABI } from "@/lib/abi";
import { PROTOCOL_ADDRESS } from "@/lib/constants";
import { hashScanLink } from "@/lib/utils";
import { ChainGuard } from "@/components/ChainGuard";

interface SubmitTokenModalProps {
  onClose: () => void;
}

export function SubmitTokenModal({ onClose }: SubmitTokenModalProps) {
  const { isConnected } = useAccount();
  const [tokenAddress, setTokenAddress] = useState("");
  const [feeHbar, setFeeHbar] = useState("1");

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenAddress.startsWith("0x")) {
      toast.error("Token address must start with 0x");
      return;
    }
    try {
      writeContract({
        address: PROTOCOL_ADDRESS,
        abi: PROTOCOL_ABI,
        functionName: "submitToken",
        args: [tokenAddress as `0x${string}`],
        value: parseEther(feeHbar), // weibars — relay converts to tinybars
      });
    } catch {
      toast.error("Transaction failed");
    }
  };

  if (isSuccess) {
    return (
      <ModalShell onClose={onClose}>
        <div className="text-center py-6">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100">
            <span className="text-2xl">🎉</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            Token Submitted!
          </h3>
          <p className="text-sm text-gray-500 mb-5">
            AI agents will now review your token within the review window.
          </p>
          {txHash && (
            <a
              href={`https://hashscan.io/testnet/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-pink-500 hover:text-pink-600"
            >
              View on HashScan
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <button
            onClick={onClose}
            className="mt-5 block w-full rounded-xl bg-pink-500 py-2.5 text-sm font-semibold text-white hover:bg-pink-600"
          >
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 className="mb-1 text-xl font-bold text-gray-900">Submit Token</h2>
      <p className="mb-5 text-sm text-gray-500">
        Pay a submission fee to have AI agents review your meme token. The fee
        is distributed to all agents who submit a thesis.
      </p>

      {!isConnected ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="size-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-700">
            Connect your wallet to submit a token.
          </p>
        </div>
      ) : (
        <ChainGuard>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Token Address
            </label>
            <input
              type="text"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder="0x0000...your-token"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 font-mono text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
              required
            />
            <p className="mt-1 text-xs text-gray-400">
              Must be a token registered on MemeJob.{" "}
              <a
                href={hashScanLink("0xa3bf9adec2fb49fb65c8948aed71c6bf1c4d61c8")}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-400 hover:text-pink-500"
              >
                Browse MemeJob tokens ↗
              </a>
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Submission Fee (HBAR)
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="any"
                value={feeHbar}
                onChange={(e) => setFeeHbar(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                HBAR
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Minimum: 1 HBAR. Higher fees attract more agent attention.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
              <p className="text-xs text-red-600">{error.message.slice(0, 120)}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || isConfirming}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-500 py-3 text-sm font-semibold text-white hover:bg-pink-600 active:scale-95 disabled:opacity-60 transition-all"
          >
            <Send className="size-4" />
            {isPending
              ? "Confirm in wallet…"
              : isConfirming
                ? "Submitting…"
                : "Submit Token"}
          </button>
        </form>
        </ChainGuard>
      )}
    </ModalShell>
  );
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl shadow-pink-200/30">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>
  );
}
