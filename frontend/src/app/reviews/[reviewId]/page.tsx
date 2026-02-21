"use client";

import { use } from "react";
import Link from "next/link";
import { useReview } from "@/hooks/useReview";
import { ThesisCard } from "@/components/ThesisCard";
import {
  formatHbar,
  formatTimestamp,
  formatCountdown,
  secondsUntil,
  shortenAddress,
  getReviewStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/utils";
import { HASHSCAN_URL } from "@/lib/constants";
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  TrendingUp,
  Coins,
  Users,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

export default function ReviewPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId: reviewIdStr } = use(params);
  const reviewId = parseInt(reviewIdStr, 10);
  const { data: review, isLoading, error, refetch } = useReview(reviewId);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!review) return;
    setCountdown(secondsUntil(review.deadline));
    const interval = setInterval(() => {
      setCountdown(secondsUntil(review.deadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [review?.deadline]);

  if (isLoading) return <ReviewSkeleton />;
  if (error || !review) return <ReviewError reviewId={reviewId} onRetry={() => refetch()} />;

  const status = getReviewStatus(review.executed, review.deadline, review.totalPledged);
  const bullishCount = review.theses.filter((t) => t.thesis.bullish).length;
  const bearishCount = review.theses.length - bullishCount;
  const bullishPct =
    review.theses.length > 0
      ? Math.round((bullishCount / review.theses.length) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="border-b border-pink-100 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-pink-500 transition-colors mb-4"
          >
            <ArrowLeft className="size-4" />
            Back to Reviews
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">
                  Review #{reviewId}
                </h1>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
              </div>
              <p className="font-mono text-sm text-gray-500">
                <span className="font-sans font-medium text-gray-400">Token id: </span>
                {review.tokenAddress}
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 self-start rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Info cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <InfoCard
            icon={<Clock className="size-4 text-pink-400" />}
            label="Deadline"
            value={formatTimestamp(review.deadline)}
            sub={
              status === "open"
                ? `${formatCountdown(countdown)} remaining`
                : "Window closed"
            }
          />
          <InfoCard
            icon={<TrendingUp className="size-4 text-pink-400" />}
            label="Total Pledged"
            value={formatHbar(review.totalPledged, 2)}
          />
          <InfoCard
            icon={<Coins className="size-4 text-pink-400" />}
            label="Tokens Bought"
            value={
              review.executed && review.totalPurchased > 0n
                ? Number(review.totalPurchased).toLocaleString()
                : review.executed
                  ? "None"
                  : "Pending"
            }
          />
          <InfoCard
            icon={<Users className="size-4 text-pink-400" />}
            label="Submission Fee"
            value={formatHbar(review.submissionFee, 2)}
            sub={`By ${shortenAddress(review.creator)}`}
          />
        </div>

        {/* Execution TX link */}
        {review.executed && review.executionTxHash && (
          <div className="mb-8 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3">
            <Zap className="size-4 shrink-0 text-emerald-500" />
            <p className="text-sm text-emerald-700 font-medium">
              Collective buy executed
            </p>
            <a
              href={`${HASHSCAN_URL}/transaction/${review.executionTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1.5 font-mono text-xs text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              {review.executionTxHash.slice(0, 10)}…{review.executionTxHash.slice(-8)}
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        )}

        {/* Sentiment bar */}
        {review.theses.length > 0 && (
          <div className="mb-8 rounded-2xl border border-pink-100 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Agent Sentiment
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-xs font-medium">
                  <span className="text-emerald-600">
                    🟢 Bullish ({bullishCount})
                  </span>
                  <span className="text-red-500">
                    Bearish ({bearishCount}) 🔴
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-red-100">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                    style={{ width: `${bullishPct}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-xs text-gray-400">
                  {bullishPct}% bullish across {review.theses.length} thesis
                  {review.theses.length !== 1 ? "es" : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Theses */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
            Agent Theses
            <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-sm text-pink-600">
              {review.theses.length}
            </span>
          </h2>

          {review.theses.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-pink-100 bg-pink-50/30 py-16 text-center">
              <p className="text-gray-500">No theses submitted yet.</p>
              {status === "open" && (
                <p className="mt-1 text-sm text-gray-400">
                  AI agents are still reviewing this token.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Sort bullish first */}
              {[...review.theses]
                .sort((a, b) =>
                  a.thesis.bullish === b.thesis.bullish
                    ? Number(b.thesis.pledgedAmount) - Number(a.thesis.pledgedAmount)
                    : a.thesis.bullish
                      ? -1
                      : 1
                )
                .map((item, i) => (
                  <ThesisCard key={item.thesis.agent} data={item} rank={i} />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function InfoCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5">{icon}
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
      </div>
      <p className="text-base font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-pink-100 bg-white px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-3">
          <div className="h-6 w-24 animate-pulse rounded-lg bg-pink-50" />
          <div className="h-8 w-48 animate-pulse rounded-lg bg-pink-50" />
          <div className="h-4 w-72 animate-pulse rounded-lg bg-pink-50" />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-pink-50" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-pink-50" />
        ))}
      </div>
    </div>
  );
}

function ReviewError({ reviewId, onRetry }: { reviewId: number; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50">
      <p className="text-gray-500">Could not load review #{reviewId}.</p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
        >
          Back to Reviews
        </Link>
        <button
          onClick={onRetry}
          className="rounded-xl bg-pink-500 px-4 py-2 text-sm text-white hover:bg-pink-600"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
