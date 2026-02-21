"use client";

import { TrendingUp, TrendingDown, Star, ExternalLink, Coins } from "lucide-react";
import type { ThesisWithMeta } from "@/hooks/useReview";
import {
  formatHbar,
  formatTimestamp,
  shortenAddress,
  winRate,
  hashScanLink,
} from "@/lib/utils";

interface ThesisCardProps {
  data: ThesisWithMeta;
  rank?: number;
}

export function ThesisCard({ data, rank }: ThesisCardProps) {
  const { thesis, identity, share } = data;

  const repScore = identity?.reputationScore ?? 0n;
  const repNum = Number(repScore);
  const repColor =
    repNum > 0
      ? "text-emerald-600"
      : repNum < 0
        ? "text-red-500"
        : "text-gray-400";

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-all ${
        thesis.bullish
          ? "border-emerald-100 hover:border-emerald-200"
          : "border-pink-100 hover:border-pink-200"
      }`}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {rank !== undefined && (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-xs font-bold text-pink-500">
              #{rank + 1}
            </span>
          )}
          <div className="min-w-0">
            <a
              href={hashScanLink(thesis.agent)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-mono text-sm text-gray-700 hover:text-pink-500"
            >
              {shortenAddress(thesis.agent, 6)}
              <ExternalLink className="size-3" />
            </a>
            {identity && (
              <p className="mt-0.5 text-xs text-gray-400 truncate max-w-52">
                {identity.metadataURI}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
              thesis.bullish
                ? "bg-emerald-50 text-emerald-700"
                : "bg-pink-50 text-pink-600"
            }`}
          >
            {thesis.bullish ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            {thesis.bullish ? "Bullish" : "Bearish"}
          </span>
        </div>
      </div>

      {/* Thesis text */}
      <blockquote className="mb-4 rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700 italic border-l-3 border-pink-300">
        {thesis.thesis}
      </blockquote>

      {/* Metrics row */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {/* Pledge */}
        {thesis.pledgedAmount > 0n && (
          <div className="flex items-center gap-1.5 rounded-lg bg-pink-50 px-3 py-1.5">
            <TrendingUp className="size-3.5 text-pink-400" />
            <span className="text-gray-600">Pledged:</span>
            <span className="font-semibold text-gray-800">
              {formatHbar(thesis.pledgedAmount, 2)}
            </span>
          </div>
        )}

        {/* Token share */}
        {share && share.tokenShare > 0n && (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5">
            <Coins className="size-3.5 text-emerald-500" />
            <span className="text-gray-600">Tokens earned:</span>
            <span className="font-semibold text-emerald-700">
              {Number(share.tokenShare).toLocaleString()}
            </span>
            {share.claimed && (
              <span className="rounded-full bg-emerald-100 px-1.5 text-emerald-600">
                claimed
              </span>
            )}
          </div>
        )}

        {/* Reputation */}
        {identity && (
          <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-1.5">
            <Star className="size-3.5 text-amber-400" />
            <span className="text-gray-600">Rep:</span>
            <span className={`font-bold ${repColor}`}>
              {repNum >= 0 ? `+${repNum}` : repNum}
            </span>
            {identity.totalTrades > 0n && (
              <span className="text-gray-400">
                · {winRate(identity.profitableTrades, identity.totalTrades)} win
                rate
              </span>
            )}
          </div>
        )}

        {/* Time */}
        <div className="ml-auto text-gray-400">
          {formatTimestamp(thesis.submittedAt)}
        </div>
      </div>
    </div>
  );
}
