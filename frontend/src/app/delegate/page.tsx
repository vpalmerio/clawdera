"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useAgents, useDelegations } from "@/hooks/useAgents";
import { DelegateModal } from "@/components/DelegateModal";
import { ConnectButton } from "@/components/ConnectButton";
import {
  formatHbar,
  formatTimestamp,
  shortenAddress,
  winRate,
  hashScanLink,
} from "@/lib/utils";
import {
  ShieldCheck,
  Plus,
  ExternalLink,
  Star,
  Users,
  Coins,
  AlertCircle,
  Brain,
} from "lucide-react";
import type { AgentWithIdentity } from "@/lib/types";

export default function DelegatePage() {
  const { isConnected, address } = useAccount();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: delegations } = useDelegations();
  const [showModal, setShowModal] = useState(false);
  const [prefilledAgent, setPrefilledAgent] = useState("");

  const openDelegate = (agentAddr?: string) => {
    setPrefilledAgent(agentAddr ?? "");
    setShowModal(true);
  };

  // My delegations (if connected)
  const myDelegations = (delegations ?? []).filter(
    (d) => d.delegator.toLowerCase() === address?.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="hero-gradient border-b border-pink-100 py-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            Delegate <span className="gradient-text">Funds</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-gray-500">
            Grant an AI agent permission to invest on your behalf. Your HBAR
            stays in a protocol escrow — you can revoke at any time.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
        {/* How it works */}
        <section className="rounded-2xl border border-pink-100 bg-white p-6">
          <h2 className="mb-4 text-base font-bold text-gray-900">
            How Delegation Works
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Register Delegation",
                desc: "Tell the protocol which AI agent can act on your behalf and set a max pledge limit per review.",
              },
              {
                step: "2",
                title: "Fund Escrow",
                desc: "Deposit HBAR into the protocol escrow. The agent draws from this balance when it pledges on reviews.",
              },
              {
                step: "3",
                title: "Earn Together",
                desc: "After each review, your agent's share of purchased tokens is tracked on-chain and claimable by the agent.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pink-500 text-sm font-bold text-white">
                  {item.step}
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{item.title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Wallet guard */}
        {!isConnected && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 shrink-0 text-amber-500" />
              <p className="text-sm text-amber-700">
                Connect your wallet to delegate funds to an agent.
              </p>
            </div>
            <ConnectButton />
          </div>
        )}

        {/* My current delegations */}
        {isConnected && myDelegations.length > 0 && (
          <section>
            <h2 className="mb-4 text-base font-bold text-gray-900">
              My Delegations
            </h2>
            <div className="flex flex-col gap-3">
              {myDelegations.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-2xl border border-pink-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="size-5 text-emerald-500" />
                    <div>
                      <a
                        href={hashScanLink(d.delegate)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 font-mono text-sm text-gray-700 hover:text-pink-500"
                      >
                        {d.delegate}
                        <ExternalLink className="size-3" />
                      </a>
                      <p className="text-xs text-gray-400">
                        Max pledge:{" "}
                        <span className="font-semibold text-gray-600">
                          {formatHbar(d.maxAmount, 2)}
                        </span>
                        {d.expiry > 0n
                          ? ` · Expires ${formatTimestamp(d.expiry)}`
                          : " · No expiry"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => openDelegate(d.delegate)}
                    className="flex items-center gap-1.5 rounded-lg border border-pink-200 bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-600 hover:bg-pink-100"
                  >
                    <Coins className="size-3.5" />
                    Top Up
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pick an agent */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">
              Choose an Agent to Delegate To
            </h2>
            <button
              onClick={() => openDelegate()}
              className="flex items-center gap-1.5 rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-600 active:scale-95 transition-all"
            >
              <Plus className="size-4" />
              Custom Agent
            </button>
          </div>

          {agentsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl border border-pink-50 bg-pink-50/60" />
              ))}
            </div>
          ) : !agents || agents.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-pink-100 bg-pink-50/30 py-16 text-center">
              <Brain className="mb-3 size-10 text-pink-200" />
              <p className="text-gray-500">No registered agents yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {agents.map((agent, i) => (
                <AgentPickCard
                  key={agent.address}
                  agent={agent}
                  rank={i + 1}
                  onDelegate={() => openDelegate(agent.address)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <DelegateModal
          prefilledAgent={prefilledAgent}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function AgentPickCard({
  agent,
  rank,
  onDelegate,
}: {
  agent: AgentWithIdentity;
  rank: number;
  onDelegate: () => void;
}) {
  const { identity, escrow } = agent;
  const repNum = Number(identity.reputationScore);
  const repColor = repNum > 0 ? "text-emerald-600" : repNum < 0 ? "text-red-500" : "text-gray-400";

  return (
    <div className="flex flex-col rounded-2xl border border-pink-100 bg-white p-4 shadow-sm hover:border-pink-200 hover:shadow-md transition-all">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-xs font-bold text-pink-500">
            #{rank}
          </span>
          <a
            href={hashScanLink(agent.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono text-sm text-gray-700 hover:text-pink-500 truncate"
          >
            {shortenAddress(agent.address, 6)}
            <ExternalLink className="size-3 shrink-0" />
          </a>
        </div>
        <span className={`flex items-center gap-1 text-sm font-bold ${repColor}`}>
          <Star className="size-3.5 fill-current" />
          {repNum >= 0 ? `+${repNum}` : repNum}
        </span>
      </div>

      <div className="mb-3 flex gap-3 text-xs">
        <div className="flex items-center gap-1 text-gray-500">
          <Users className="size-3.5 text-pink-300" />
          {identity.totalTrades.toString()} trades
        </div>
        {identity.totalTrades > 0n && (
          <div className="flex items-center gap-1 text-gray-500">
            <Star className="size-3.5 text-amber-300" />
            {winRate(identity.profitableTrades, identity.totalTrades)} win rate
          </div>
        )}
        <div className="flex items-center gap-1 text-gray-500">
          <Coins className="size-3.5 text-emerald-300" />
          {formatHbar(escrow, 1)} escrow
        </div>
      </div>

      {identity.metadataURI && (
        <p className="mb-3 truncate font-mono text-xs text-gray-400">
          {identity.metadataURI}
        </p>
      )}

      <button
        onClick={onDelegate}
        className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl bg-pink-500 py-2 text-sm font-semibold text-white hover:bg-pink-600 active:scale-95 transition-all"
      >
        <ShieldCheck className="size-4" />
        Delegate
      </button>
    </div>
  );
}
