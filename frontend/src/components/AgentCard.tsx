"use client";

import { Star, TrendingUp, Users, ExternalLink, Link as LinkIcon } from "lucide-react";
import type { AgentWithIdentity, DelegationRecord } from "@/lib/types";
import {
  formatHbar,
  formatTimestamp,
  shortenAddress,
  winRate,
  hashScanLink,
} from "@/lib/utils";

interface AgentCardProps {
  agent: AgentWithIdentity;
  delegations?: DelegationRecord[];
  rank: number;
}

export function AgentCard({ agent, delegations = [], rank }: AgentCardProps) {
  const { identity, escrow } = agent;
  const repNum = Number(identity.reputationScore);

  const repColor =
    repNum > 5
      ? "text-emerald-600 bg-emerald-50"
      : repNum > 0
        ? "text-emerald-500 bg-emerald-50"
        : repNum < 0
          ? "text-red-500 bg-red-50"
          : "text-gray-500 bg-gray-50";

  const repLabel = repNum >= 0 ? `+${repNum}` : String(repNum);

  const totalDelegated = delegations.reduce(
    (sum, d) => sum + (d.maxAmount || 0n),
    0n
  );

  return (
    <div className="rounded-2xl border border-pink-100 bg-white p-5 shadow-sm hover:border-pink-200 hover:shadow-md hover:shadow-pink-100/40 transition-all">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Rank badge */}
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-400 to-pink-600 text-base font-bold text-white shadow-sm shadow-pink-200">
            {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
          </div>
          <div className="min-w-0">
            <a
              href={hashScanLink(agent.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-mono text-sm font-medium text-gray-700 hover:text-pink-500"
            >
              {shortenAddress(agent.address, 6)}
              <ExternalLink className="size-3" />
            </a>
            <p className="mt-0.5 text-xs text-gray-400">
              Registered {formatTimestamp(identity.registrationTime)}
            </p>
          </div>
        </div>

        {/* Reputation badge */}
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold ${repColor}`}
        >
          <Star className="size-4 fill-current opacity-80" />
          {repLabel}
        </span>
      </div>

      {/* Metadata URI */}
      {identity.metadataURI && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <LinkIcon className="size-3.5 shrink-0 text-gray-400" />
          <p className="truncate font-mono text-xs text-gray-500">
            {identity.metadataURI}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Trades"
          value={identity.totalTrades.toString()}
          icon={<TrendingUp className="size-4 text-pink-400" />}
        />
        <Stat
          label="Win Rate"
          value={winRate(identity.profitableTrades, identity.totalTrades)}
          icon={<Star className="size-4 text-amber-400" />}
          highlight={Number(identity.totalTrades) > 0}
        />
        <Stat
          label="Escrow"
          value={formatHbar(escrow, 2)}
          icon={<TrendingUp className="size-4 text-emerald-400" />}
        />
        <Stat
          label="Delegators"
          value={`${delegations.length}`}
          icon={<Users className="size-4 text-pink-400" />}
          sub={delegations.length > 0 ? formatHbar(totalDelegated, 2) : undefined}
        />
      </div>

      {/* Delegator list */}
      {delegations.length > 0 && (
        <div className="mt-4 border-t border-pink-50 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Delegators
          </p>
          <div className="flex flex-wrap gap-2">
            {delegations.map((d, i) => (
              <a
                key={i}
                href={hashScanLink(d.delegator)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg border border-pink-100 bg-pink-50 px-2.5 py-1 font-mono text-xs text-pink-600 hover:bg-pink-100"
                title={`Max: ${formatHbar(d.maxAmount, 2)}`}
              >
                {shortenAddress(d.delegator)}
                <span className="text-pink-400">·</span>
                {formatHbar(d.maxAmount, 1)}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-xl bg-pink-50 p-3">
      <div className="mb-1 flex items-center gap-1.5">{icon}</div>
      <p
        className={`text-base font-bold leading-none ${highlight ? "text-emerald-600" : "text-gray-800"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-gray-500">{sub}</p>}
      <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </p>
    </div>
  );
}
