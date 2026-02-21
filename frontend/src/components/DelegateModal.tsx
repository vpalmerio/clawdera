"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, parseUnits } from "viem";
import { X, ShieldCheck, AlertCircle, ExternalLink, Coins } from "lucide-react";
import toast from "react-hot-toast";
import { PROTOCOL_ABI } from "@/lib/abi";
import { PROTOCOL_ADDRESS } from "@/lib/constants";
import { ChainGuard } from "@/components/ChainGuard";

interface DelegateModalProps {
  prefilledAgent?: string;
  onClose: () => void;
}

type Step = "delegate" | "deposit" | "done";

export function DelegateModal({ prefilledAgent = "", onClose }: DelegateModalProps) {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>("delegate");
  const [agentAddress, setAgentAddress] = useState(prefilledAgent);
  const [maxAmount, setMaxAmount] = useState("5");   // HBAR — stored as tinybars
  const [depositAmount, setDepositAmount] = useState("5"); // HBAR — tx value weibars

  // ── Step 1: registerDelegation ────────────────────────────────────────────
  const {
    writeContract: writeDelegation,
    data: delegationHash,
    isPending: delegationPending,
    error: delegationError,
  } = useWriteContract();

  const { isLoading: delegationConfirming, isSuccess: delegationSuccess } =
    useWaitForTransactionReceipt({ hash: delegationHash });

  // ── Step 2: depositForAgent ───────────────────────────────────────────────
  const {
    writeContract: writeDeposit,
    data: depositHash,
    isPending: depositPending,
    error: depositError,
  } = useWriteContract();

  const { isLoading: depositConfirming, isSuccess: depositSuccess } =
    useWaitForTransactionReceipt({ hash: depositHash });

  // When delegation confirmed → move to deposit step
  if (delegationSuccess && step === "delegate") {
    toast.success("Delegation registered!");
    setStep("deposit");
  }
  if (depositSuccess && step === "deposit") {
    toast.success("Escrow funded!");
    setStep("done");
  }

  const handleDelegate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentAddress.startsWith("0x")) {
      toast.error("Agent address must start with 0x");
      return;
    }
    const dummySig = new Uint8Array(65); // contract stores but doesn't validate sig
    writeDelegation({
      address: PROTOCOL_ADDRESS,
      abi: PROTOCOL_ABI,
      functionName: "registerDelegation",
      args: [
        agentAddress as `0x${string}`,
        parseUnits(maxAmount, 8), // tinybars (Solidity arg)
        0n,                       // expiry = 0 (no expiry)
        `0x${"00".repeat(65)}` as `0x${string}`, // dummy sig
      ],
    });
    void dummySig;
  };

  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    writeDeposit({
      address: PROTOCOL_ADDRESS,
      abi: PROTOCOL_ABI,
      functionName: "depositForAgent",
      args: [agentAddress as `0x${string}`],
      value: parseEther(depositAmount), // weibars — relay converts to tinybars
    });
  };

  const content = () => {
    if (!isConnected) {
      return (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="size-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-700">
            Connect your wallet to delegate funds.
          </p>
        </div>
      );
    }

    // All remaining steps require Hedera Testnet
    return <ChainGuard>{innerContent()}</ChainGuard>;
  };

  const innerContent = () => {
    if (step === "done") {
      return (
        <div className="text-center py-6">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100">
            <span className="text-2xl">✅</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">All Done!</h3>
          <p className="text-sm text-gray-500 mb-5">
            Your delegation is registered and the agent is funded. They can
            now participate in token reviews on your behalf.
          </p>
          <div className="flex flex-col gap-2 text-xs text-gray-400">
            {delegationHash && (
              <a
                href={`https://hashscan.io/testnet/tx/${delegationHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 text-pink-400 hover:text-pink-500"
              >
                Delegation tx <ExternalLink className="size-3" />
              </a>
            )}
            {depositHash && (
              <a
                href={`https://hashscan.io/testnet/tx/${depositHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 text-pink-400 hover:text-pink-500"
              >
                Deposit tx <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="mt-5 w-full rounded-xl bg-pink-500 py-2.5 text-sm font-semibold text-white hover:bg-pink-600"
          >
            Close
          </button>
        </div>
      );
    }

    if (step === "delegate") {
      return (
        <form onSubmit={handleDelegate} className="space-y-4">
          {/* Step indicator */}
          <StepIndicator current={1} />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Agent Wallet Address
            </label>
            <input
              type="text"
              value={agentAddress}
              onChange={(e) => setAgentAddress(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 font-mono text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Max Pledge Per Review (HBAR)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0.00000001"
                step="any"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                HBAR
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Maximum HBAR the agent may pledge per token review on your behalf.
            </p>
          </div>

          <div className="rounded-xl border border-pink-100 bg-pink-50 p-3 text-xs text-pink-700">
            <strong>Your address:</strong>{" "}
            <span className="font-mono">{address}</span>
          </div>

          {delegationError && (
            <ErrorBox message={delegationError.message} />
          )}

          <button
            type="submit"
            disabled={delegationPending || delegationConfirming}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-500 py-3 text-sm font-semibold text-white hover:bg-pink-600 active:scale-95 disabled:opacity-60 transition-all"
          >
            <ShieldCheck className="size-4" />
            {delegationPending
              ? "Confirm in wallet…"
              : delegationConfirming
                ? "Registering…"
                : "Register Delegation"}
          </button>
        </form>
      );
    }

    // step === "deposit"
    return (
      <form onSubmit={handleDeposit} className="space-y-4">
        <StepIndicator current={2} />

        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
          ✓ Delegation registered for{" "}
          <span className="font-mono text-xs">
            {agentAddress.slice(0, 10)}…
          </span>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Escrow Deposit (HBAR)
          </label>
          <div className="relative">
            <input
              type="number"
              min="0.00000001"
              step="any"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
              required
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
              HBAR
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            HBAR sent here will be held in escrow and drawn from when the agent
            pledges on reviews.
          </p>
        </div>

        {depositError && <ErrorBox message={depositError.message} />}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep("done")}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50"
          >
            Skip
          </button>
          <button
            type="submit"
            disabled={depositPending || depositConfirming}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-pink-500 py-2.5 text-sm font-semibold text-white hover:bg-pink-600 active:scale-95 disabled:opacity-60 transition-all"
          >
            <Coins className="size-4" />
            {depositPending
              ? "Confirm in wallet…"
              : depositConfirming
                ? "Depositing…"
                : "Fund Escrow"}
          </button>
        </div>
      </form>
    );
  }; // end innerContent

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

        <h2 className="mb-1 text-xl font-bold text-gray-900">
          Delegate to Agent
        </h2>
        <p className="mb-5 text-sm text-gray-500">
          Allow an AI agent to invest on your behalf and fund their escrow
          wallet.
        </p>

        {content()}
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {[1, 2].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
              n === current
                ? "bg-pink-500 text-white"
                : n < current
                  ? "bg-emerald-400 text-white"
                  : "bg-gray-100 text-gray-400"
            }`}
          >
            {n < current ? "✓" : n}
          </div>
          <span
            className={`text-xs ${n === current ? "font-medium text-gray-700" : "text-gray-400"}`}
          >
            {n === 1 ? "Register Delegation" : "Fund Escrow"}
          </span>
          {n < 2 && <div className="h-px w-4 bg-gray-200" />}
        </div>
      ))}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
      <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
      <p className="text-xs text-red-600">{message.slice(0, 150)}</p>
    </div>
  );
}
