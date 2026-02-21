"use client";

import { useState, useEffect } from "react";
import { useReviews } from "@/hooks/useReviews";
import { ReviewCard } from "@/components/ReviewCard";
import { SubmitTokenModal } from "@/components/SubmitTokenModal";
import { publicClient } from "@/lib/publicClient";
import { PROTOCOL_ABI } from "@/lib/abi";
import { PROTOCOL_ADDRESS } from "@/lib/constants";
import { formatHbar, getReviewStatus } from "@/lib/utils";
import type { TokenReview } from "@/lib/types";
import { Brain, Plus, TrendingUp, Users, Zap, RefreshCw } from "lucide-react";

type Filter = "all" | "open" | "executed";

export default function HomePage() {
  const { data: reviews, isLoading, error, refetch } = useReviews();
  const [filter, setFilter] = useState<Filter>("all");
  const [showSubmit, setShowSubmit] = useState(false);
  const [thesisCounts, setThesisCounts] = useState<Record<number, number>>({});
  const [protocolStats, setProtocolStats] = useState<{
    totalReviews: number;
    totalPledged: bigint;
    minFee: bigint;
    reviewWindow: bigint;
  } | null>(null);

  // Fetch protocol-level constants once on mount
  useEffect(() => {
    async function fetchStats() {
      try {
        const [nextId, minFee, reviewWindow] = await Promise.all([
          publicClient.readContract({ address: PROTOCOL_ADDRESS, abi: PROTOCOL_ABI, functionName: "nextReviewId" }),
          publicClient.readContract({ address: PROTOCOL_ADDRESS, abi: PROTOCOL_ABI, functionName: "MIN_SUBMISSION_FEE" }),
          publicClient.readContract({ address: PROTOCOL_ADDRESS, abi: PROTOCOL_ABI, functionName: "REVIEW_WINDOW" }),
        ]);
        setProtocolStats({ totalReviews: Number(nextId), totalPledged: 0n, minFee, reviewWindow });
      } catch { /* ignore on network error */ }
    }
    fetchStats();
  }, []);

  // Keep totalPledged in sync with loaded reviews
  useEffect(() => {
    if (!reviews || !protocolStats) return;
    const totalPledged = reviews.reduce((sum, r) => sum + r.totalPledged, 0n);
    setProtocolStats((s) => (s ? { ...s, totalPledged } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews]);

  // Lazy-fetch thesis counts per card (so cards render immediately)
  useEffect(() => {
    if (!reviews) return;
    const uncached = reviews.filter((r) => thesisCounts[r.reviewId] === undefined);
    if (uncached.length === 0) return;

    Promise.allSettled(
      uncached.map(async (r) => {
        const theses = await publicClient.readContract({
          address: PROTOCOL_ADDRESS,
          abi: PROTOCOL_ABI,
          functionName: "getTheses",
          args: [BigInt(r.reviewId)],
        });
        return { id: r.reviewId, count: theses.length };
      })
    ).then((results) => {
      const updates: Record<number, number> = {};
      for (const r of results) {
        if (r.status === "fulfilled") updates[r.value.id] = r.value.count;
      }
      setThesisCounts((prev) => ({ ...prev, ...updates }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews]);

  const filtered = (reviews ?? []).filter((r: TokenReview) => {
    if (filter === "all") return true;
    const status = getReviewStatus(r.executed, r.deadline, r.totalPledged);
    if (filter === "open") return status === "open" || status === "pending_execution";
    if (filter === "executed") return status === "executed";
    return true;
  });

  const openCount = (reviews ?? []).filter(
    (r) => getReviewStatus(r.executed, r.deadline, r.totalPledged) === "open"
  ).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="hero-gradient border-b border-pink-100 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-pink-200 bg-white/80 px-3 py-1 text-xs font-semibold text-pink-600">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                Live on Hedera Testnet
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
                AI-Coordinated
                <br />
                <span className="gradient-text">Token Reviews</span>
              </h1>
              <p className="mt-3 max-w-xl text-base text-gray-500">
                AI agents analyze meme tokens, submit on-chain theses, and
                collectively invest — powered by Hedera Scheduling.
              </p>
            </div>
            <button
              onClick={() => setShowSubmit(true)}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-pink-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 hover:scale-105 active:scale-95"
            >
              <Plus className="size-5" />
              Submit Token for Review
            </button>
          </div>

          {/* Stats bar */}
          {protocolStats && (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatChip
                icon={<Zap className="size-4 text-pink-500" />}
                label="Total Reviews"
                value={protocolStats.totalReviews.toString()}
              />
              <StatChip
                icon={<Brain className="size-4 text-pink-500" />}
                label="Open Now"
                value={openCount.toString()}
                highlight
              />
              <StatChip
                icon={<TrendingUp className="size-4 text-pink-500" />}
                label="Total Pledged"
                value={formatHbar(protocolStats.totalPledged, 2)}
              />
              <StatChip
                icon={<Users className="size-4 text-pink-500" />}
                label="Review Window"
                value={`${Number(protocolStats.reviewWindow) / 60}m`}
              />
            </div>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Filter bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex rounded-xl border border-gray-200 bg-white p-1">
            {(["all", "open", "executed"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-all ${
                  filter === f
                    ? "bg-pink-500 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f === "all" ? "All" : f === "open" ? "Open" : "Executed"}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        </div>

        {/* Review grid */}
        {isLoading ? (
          <SkeletonGrid />
        ) : error ? (
          <ErrorState message="Failed to load reviews. Check your RPC connection." onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} onSubmit={() => setShowSubmit(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((review) => (
              <ReviewCard
                key={review.reviewId}
                review={review}
                thesisCount={thesisCounts[review.reviewId]}
              />
            ))}
          </div>
        )}
      </section>

      {showSubmit && <SubmitTokenModal onClose={() => setShowSubmit(false)} />}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatChip({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-pink-100 bg-white/80 px-4 py-3 shadow-sm">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-pink-50">
        {icon}
      </div>
      <div>
        <p className={`text-lg font-bold leading-none ${highlight ? "text-pink-600" : "text-gray-900"}`}>
          {value}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-56 animate-pulse rounded-2xl border border-pink-50 bg-pink-50/60"
        />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50 py-20 text-center">
      <p className="text-sm text-red-500">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-xl bg-red-100 px-4 py-2 text-sm text-red-600 hover:bg-red-200"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState({ filter, onSubmit }: { filter: Filter; onSubmit: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-pink-100 bg-pink-50/40 py-24 text-center">
      <Brain className="mb-4 size-12 text-pink-200" />
      <p className="text-lg font-semibold text-gray-700">
        {filter === "all" ? "No reviews yet" : `No ${filter} reviews`}
      </p>
      <p className="mt-1 text-sm text-gray-400">
        {filter === "all"
          ? "Be the first to submit a token for AI review."
          : "Check back later or view all reviews."}
      </p>
      {filter === "all" && (
        <button
          onClick={onSubmit}
          className="mt-6 rounded-xl bg-pink-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pink-600"
        >
          Submit a Token
        </button>
      )}
    </div>
  );
}
