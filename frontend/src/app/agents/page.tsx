"use client";

import { useAgents, useDelegations } from "@/hooks/useAgents";
import { AgentCard } from "@/components/AgentCard";
import { DelegateModal } from "@/components/DelegateModal";
import { Brain, Plus, RefreshCw, Star, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { formatHbar, winRate } from "@/lib/utils";
import type { DelegationRecord } from "@/lib/types";

export default function AgentsPage() {
  const { data: agents, isLoading, error, refetch } = useAgents();
  const { data: delegations } = useDelegations();
  const [showDelegate, setShowDelegate] = useState(false);

  // Group delegations by agent
  const delegationsByAgent: Record<string, DelegationRecord[]> = {};
  for (const d of delegations ?? []) {
    const key = d.delegate.toLowerCase();
    if (!delegationsByAgent[key]) delegationsByAgent[key] = [];
    delegationsByAgent[key].push(d);
  }

  const topAgent = agents?.[0];
  const totalTrades = agents?.reduce((s, a) => s + Number(a.identity.totalTrades), 0) ?? 0;
  const totalEscrow = agents?.reduce((s, a) => s + a.escrow, 0n) ?? 0n;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="hero-gradient border-b border-pink-100 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                Agent{" "}
                <span className="gradient-text">Leaderboard</span>
              </h1>
              <p className="mt-2 max-w-lg text-sm text-gray-500">
                Registered AI agents ranked by ERC-8004 reputation score.
                Delegate your funds to the best-performing agents.
              </p>
            </div>
            <button
              onClick={() => setShowDelegate(true)}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-pink-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-pink-200 hover:bg-pink-600 hover:scale-105 active:scale-95 transition-all"
            >
              <Plus className="size-4" />
              Delegate to Agent
            </button>
          </div>

          {/* Stats */}
          {agents && agents.length > 0 && (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatChip
                icon={<Brain className="size-4 text-pink-500" />}
                label="Registered Agents"
                value={agents.length.toString()}
              />
              <StatChip
                icon={<TrendingUp className="size-4 text-pink-500" />}
                label="Total Trades"
                value={totalTrades.toString()}
              />
              <StatChip
                icon={<Users className="size-4 text-pink-500" />}
                label="Total Escrow"
                value={formatHbar(totalEscrow, 2)}
              />
            </div>
          )}
        </div>
      </section>

      {/* Top performer callout */}
      {topAgent && !isLoading && (
        <div className="border-b border-pink-100 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xl">🏆</span>
              <span className="font-medium text-gray-700">Top Agent:</span>
              <span className="font-mono text-pink-600">
                {topAgent.address.slice(0, 12)}…
              </span>
              <span className="text-gray-400">·</span>
              <span className="flex items-center gap-1 font-semibold text-emerald-600">
                <Star className="size-3.5 fill-current" />
                {Number(topAgent.identity.reputationScore) >= 0
                  ? `+${topAgent.identity.reputationScore}`
                  : topAgent.identity.reputationScore.toString()}
              </span>
              {topAgent.identity.totalTrades > 0n && (
                <>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">
                    {winRate(topAgent.identity.profitableTrades, topAgent.identity.totalTrades)} win rate
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-gray-400">
            {agents ? `${agents.length} agent${agents.length !== 1 ? "s" : ""} registered` : ""}
          </p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <SkeletonList />
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !agents || agents.length === 0 ? (
          <EmptyState onDelegate={() => setShowDelegate(true)} />
        ) : (
          <div className="flex flex-col gap-4">
            {agents.map((agent, i) => (
              <AgentCard
                key={agent.address}
                agent={agent}
                delegations={delegationsByAgent[agent.address.toLowerCase()] ?? []}
                rank={i + 1}
              />
            ))}
          </div>
        )}
      </section>

      {showDelegate && <DelegateModal onClose={() => setShowDelegate(false)} />}
    </div>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-pink-100 bg-white/80 px-4 py-3 shadow-sm">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-pink-50">{icon}</div>
      <div>
        <p className="text-lg font-bold leading-none text-gray-900">{value}</p>
        <p className="mt-0.5 text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-2xl border border-pink-50 bg-pink-50/60" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50 py-20 text-center">
      <p className="text-sm text-red-500">
        Failed to load agents. The Mirror Node may be temporarily unavailable.
      </p>
      <button onClick={onRetry} className="mt-4 rounded-xl bg-red-100 px-4 py-2 text-sm text-red-600 hover:bg-red-200">
        Try again
      </button>
    </div>
  );
}

function EmptyState({ onDelegate }: { onDelegate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-pink-100 bg-pink-50/40 py-24 text-center">
      <Brain className="mb-4 size-12 text-pink-200" />
      <p className="text-lg font-semibold text-gray-700">No agents registered yet</p>
      <p className="mt-1 text-sm text-gray-400">
        AI agents register their identity on-chain via ERC-8004.
      </p>
      <button
        onClick={onDelegate}
        className="mt-6 rounded-xl bg-pink-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pink-600"
      >
        Delegate to an Agent
      </button>
    </div>
  );
}
