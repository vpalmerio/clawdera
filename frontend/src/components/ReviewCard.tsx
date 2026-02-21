"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock, Users, TrendingUp, ExternalLink, Zap } from "lucide-react";
import type { TokenReview } from "@/lib/types";
import {
  formatHbar,
  formatCountdown,
  secondsUntil,
  shortenAddress,
  getReviewStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/utils";

interface ReviewCardProps {
  review: TokenReview;
  thesisCount?: number;
}

export function ReviewCard({ review, thesisCount = 0 }: ReviewCardProps) {
  const [countdown, setCountdown] = useState(secondsUntil(review.deadline));
  const status = getReviewStatus(review.executed, review.deadline, review.totalPledged);

  useEffect(() => {
    if (status !== "open") return;
    const interval = setInterval(() => {
      setCountdown(secondsUntil(review.deadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [review.deadline, status]);

  return (
    <Link
      href={`/reviews/${review.reviewId}`}
      className="group block rounded-2xl border border-pink-100 bg-white p-5 shadow-sm transition-all duration-200 hover:border-pink-300 hover:shadow-md hover:shadow-pink-100/60 hover:-translate-y-0.5"
    >
      {/* Header row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Review #{review.reviewId}
          </p>
          <p className="mt-1 font-mono text-sm text-gray-700">
            {shortenAddress(review.tokenAddress, 6)}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-pink-50 p-3 text-center">
          <Users className="mx-auto mb-1 size-4 text-pink-400" />
          <p className="text-lg font-bold text-gray-800">{thesisCount}</p>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">
            Theses
          </p>
        </div>

        <div className="rounded-xl bg-pink-50 p-3 text-center">
          <TrendingUp className="mx-auto mb-1 size-4 text-pink-400" />
          <p className="text-base font-bold text-gray-800">
            {formatHbar(review.totalPledged, 2)}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">
            Pledged
          </p>
        </div>

        <div className="rounded-xl bg-pink-50 p-3 text-center">
          {status === "open" ? (
            <Clock className="mx-auto mb-1 size-4 text-emerald-400" />
          ) : (
            <Zap className="mx-auto mb-1 size-4 text-pink-400" />
          )}
          <p className="text-base font-bold text-gray-800 tabular-nums">
            {status === "open" ? formatCountdown(countdown) : "—"}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">
            {status === "open" ? "Remaining" : "Executed"}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-pink-50 pt-3">
        <p className="text-xs text-gray-400">
          By{" "}
          <span className="font-mono text-gray-500">
            {shortenAddress(review.creator)}
          </span>
        </p>
        {review.executed && review.totalPurchased > 0n && (
          <p className="text-xs text-emerald-600 font-medium">
            {Number(review.totalPurchased).toLocaleString()} tokens bought
          </p>
        )}
        <span className="flex items-center gap-1 text-xs font-medium text-pink-500 group-hover:text-pink-600">
          View theses
          <ExternalLink className="size-3" />
        </span>
      </div>
    </Link>
  );
}
