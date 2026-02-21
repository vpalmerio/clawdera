"use client";

import { useQuery } from "@tanstack/react-query";
import { publicClient } from "@/lib/publicClient";
import { PROTOCOL_ABI } from "@/lib/abi";
import { PROTOCOL_ADDRESS } from "@/lib/constants";
import type { TokenReview, AgentThesis, AgentIdentity, AgentShare } from "@/lib/types";
import { fetchReviewExecutedTxHash } from "@/lib/utils";

export interface ThesisWithMeta {
  thesis: AgentThesis;
  identity: AgentIdentity | null;
  share: AgentShare | null;
}

export interface ReviewDetail extends TokenReview {
  theses: ThesisWithMeta[];
  executionTxHash: string | null;
}

async function fetchReviewDetail(reviewId: number): Promise<ReviewDetail> {
  const id = BigInt(reviewId);

  // Fetch review, theses, and execution tx hash in parallel
  const [rawReview, rawTheses] = await Promise.all([
    publicClient.readContract({
      address: PROTOCOL_ADDRESS,
      abi: PROTOCOL_ABI,
      functionName: "getReview",
      args: [id],
    }),
    publicClient.readContract({
      address: PROTOCOL_ADDRESS,
      abi: PROTOCOL_ABI,
      functionName: "getTheses",
      args: [id],
    }),
  ]);

  if (!rawReview.exists) throw new Error("Review does not exist");

  // Only query the Mirror Node for the execution tx hash if the review is executed
  const executionTxHash = rawReview.executed
    ? await fetchReviewExecutedTxHash(reviewId)
    : null;

  const review: TokenReview = {
    reviewId,
    tokenAddress: rawReview.tokenAddress,
    creator: rawReview.creator,
    submissionFee: rawReview.submissionFee,
    deadline: rawReview.deadline,
    executed: rawReview.executed,
    exists: rawReview.exists,
    totalPledged: rawReview.totalPledged,
    totalPurchased: rawReview.totalPurchased,
    scheduleAddress: rawReview.scheduleAddress,
  };

  // For each thesis, fetch agent identity and share in parallel
  const thesesWithMeta: ThesisWithMeta[] = await Promise.all(
    rawTheses.map(async (t) => {
      const thesis: AgentThesis = {
        agent: t.agent,
        thesis: t.thesis,
        bullish: t.bullish,
        pledgedAmount: t.pledgedAmount,
        submittedAt: t.submittedAt,
      };

      const [rawIdentity, rawShare] = await Promise.allSettled([
        publicClient.readContract({
          address: PROTOCOL_ADDRESS,
          abi: PROTOCOL_ABI,
          functionName: "getAgentIdentity",
          args: [t.agent as `0x${string}`],
        }),
        publicClient.readContract({
          address: PROTOCOL_ADDRESS,
          abi: PROTOCOL_ABI,
          functionName: "getAgentShare",
          args: [id, t.agent as `0x${string}`],
        }),
      ]);

      const identity: AgentIdentity | null =
        rawIdentity.status === "fulfilled" &&
        rawIdentity.value.agentAddress !==
          "0x0000000000000000000000000000000000000000"
          ? {
              agentAddress: rawIdentity.value.agentAddress,
              metadataURI: rawIdentity.value.metadataURI,
              registrationTime: rawIdentity.value.registrationTime,
              reputationScore: rawIdentity.value.reputationScore,
              totalTrades: rawIdentity.value.totalTrades,
              profitableTrades: rawIdentity.value.profitableTrades,
            }
          : null;

      const share: AgentShare | null =
        rawShare.status === "fulfilled"
          ? {
              pledgedAmount: rawShare.value.pledgedAmount,
              tokenShare: rawShare.value.tokenShare,
              claimed: rawShare.value.claimed,
            }
          : null;

      return { thesis, identity, share };
    })
  );

  return { ...review, theses: thesesWithMeta, executionTxHash };
}

export function useReview(reviewId: number) {
  return useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => fetchReviewDetail(reviewId),
    enabled: reviewId >= 0,
    refetchInterval: 15_000,
  });
}
