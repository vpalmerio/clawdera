"use client";

import { useQuery } from "@tanstack/react-query";
import { publicClient } from "@/lib/publicClient";
import { PROTOCOL_ABI } from "@/lib/abi";
import { PROTOCOL_ADDRESS } from "@/lib/constants";
import type { TokenReview } from "@/lib/types";

async function fetchAllReviews(): Promise<TokenReview[]> {
  // 1. Read total count
  const nextId = await publicClient.readContract({
    address: PROTOCOL_ADDRESS,
    abi: PROTOCOL_ABI,
    functionName: "nextReviewId",
  });

  const total = Number(nextId);
  if (total === 0) return [];

  // 2. Fetch all reviews in parallel
  const ids = Array.from({ length: total }, (_, i) => BigInt(i));
  const results = await Promise.allSettled(
    ids.map((id) =>
      publicClient.readContract({
        address: PROTOCOL_ADDRESS,
        abi: PROTOCOL_ABI,
        functionName: "getReview",
        args: [id],
      })
    )
  );

  const reviews: TokenReview[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value.exists) {
      const v = r.value;
      reviews.push({
        reviewId: i,
        tokenAddress: v.tokenAddress,
        creator: v.creator,
        submissionFee: v.submissionFee,
        deadline: v.deadline,
        executed: v.executed,
        exists: v.exists,
        totalPledged: v.totalPledged,
        totalPurchased: v.totalPurchased,
        scheduleAddress: v.scheduleAddress,
      });
    }
  }

  // Newest first
  return reviews.reverse();
}

export function useReviews() {
  return useQuery({
    queryKey: ["reviews"],
    queryFn: fetchAllReviews,
    refetchInterval: 15_000, // poll every 15s for live updates
  });
}

/** Fetch thesis count for multiple reviews — used for the cards */
export async function fetchThesisCount(reviewId: bigint): Promise<number> {
  const theses = await publicClient.readContract({
    address: PROTOCOL_ADDRESS,
    abi: PROTOCOL_ABI,
    functionName: "getTheses",
    args: [reviewId],
  });
  return theses.length;
}
