import { TINYBARS_PER_HBAR, MIRROR_NODE_URL, PROTOCOL_ADDRESS } from "./constants";
import { PROTOCOL_ABI } from "./abi";
import { decodeEventLog } from "viem";

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/** Format tinybars as HBAR string, e.g. "2.0000 HBAR" */
export function formatHbar(tinybars: bigint, decimals = 4): string {
  const hbar = Number(tinybars) / Number(TINYBARS_PER_HBAR);
  return `${hbar.toFixed(decimals)} HBAR`;
}

/** Format a raw token amount with optional symbol */
export function formatTokenAmount(amount: bigint, symbol = "tokens"): string {
  return `${Number(amount).toLocaleString()} ${symbol}`;
}

/** Shorten a 0x address to 0xABCD...1234 */
export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/** Convert a Unix timestamp (seconds) to a human-readable date string */
export function formatTimestamp(ts: bigint): string {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Return remaining seconds until a deadline, or 0 if passed */
export function secondsUntil(deadlineUnix: bigint): number {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Number(deadlineUnix) - now;
  return Math.max(0, remaining);
}

/** Format remaining seconds as "Xm Ys" */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Closed";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

/** Win rate as a percentage string */
export function winRate(profitable: bigint, total: bigint): string {
  if (total === 0n) return "N/A";
  return `${((Number(profitable) / Number(total)) * 100).toFixed(0)}%`;
}

/** HashScan link for a contract/token address */
export function hashScanLink(address: string): string {
  return `https://hashscan.io/testnet/contract/${address}`;
}

// =============================================================================
// REVIEW STATUS
// =============================================================================

export type ReviewStatus = "open" | "pending_execution" | "no_pledges" | "executed";

export function getReviewStatus(
  executed: boolean,
  deadline: bigint,
  totalPledged: bigint = 0n
): ReviewStatus {
  if (executed) return "executed";
  if (secondsUntil(deadline) > 0) return "open";
  if (totalPledged === 0n) return "no_pledges";
  return "pending_execution";
}

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  open: "Open",
  pending_execution: "Pending Execution",
  no_pledges: "No Pledge Allocations",
  executed: "Executed",
};

export const STATUS_COLORS: Record<ReviewStatus, string> = {
  open: "bg-emerald-100 text-emerald-700",
  pending_execution: "bg-amber-100 text-amber-700",
  no_pledges: "bg-gray-100 text-gray-500",
  executed: "bg-gray-100 text-gray-600",
};

// =============================================================================
// MIRROR NODE — EVENT / LOG QUERIES
// =============================================================================

interface MirrorLog {
  topics: string[];
  data: string;
  contract_id: string;
  timestamp: string;
  block_number: number;
  transaction_hash: string;
}

/** Fetch all contract logs from the Hedera Mirror Node */
async function fetchMirrorLogs(limit = 100): Promise<MirrorLog[]> {
  const url = `${MIRROR_NODE_URL}/api/v1/contracts/${PROTOCOL_ADDRESS}/results/logs?limit=${limit}&order=asc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mirror Node error: ${res.status}`);
  const data = await res.json();
  return data.logs ?? [];
}

/** Decode and filter mirror logs for a specific event name */
async function getEventLogs(eventName: string) {
  const logs = await fetchMirrorLogs(1000);
  const decoded = [];
  for (const log of logs) {
    try {
      const parsed = decodeEventLog({
        abi: PROTOCOL_ABI,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        data: log.data as `0x${string}`,
        strict: false,
      });
      if (parsed.eventName === eventName) {
        decoded.push({ ...parsed.args, _ts: log.timestamp });
      }
    } catch {
      // not this event, skip
    }
  }
  return decoded;
}

/** Return all unique agent addresses that have fired AgentRegistered */
export async function fetchRegisteredAgentAddresses(): Promise<string[]> {
  const events = await getEventLogs("AgentRegistered");
  const seen = new Set<string>();
  for (const e of events) {
    const addr = (e as { agentAddress?: string }).agentAddress;
    if (addr) seen.add(addr.toLowerCase());
  }
  // Return checksummed addresses
  return Array.from(seen);
}

/** Return all DelegationRegistered events */
export async function fetchDelegationEvents(): Promise<
  { delegator: string; delegate: string; maxAmount: bigint; expiry: bigint }[]
> {
  const events = await getEventLogs("DelegationRegistered");
  return events.map((e) => {
    const ev = e as {
      delegator: string;
      delegate: string;
      maxAmount: bigint;
      expiry: bigint;
    };
    return {
      delegator: ev.delegator,
      delegate: ev.delegate,
      maxAmount: ev.maxAmount,
      expiry: ev.expiry,
    };
  });
}

/**
 * Fetch the transaction hash of the ReviewExecuted event for a given reviewId.
 * Scans all contract logs client-side (Mirror Node topic-filtered queries require
 * a 7-day timestamp window, making them unsuitable for older events).
 * Returns null if the review has not been executed yet or the log can't be found.
 */
export async function fetchReviewExecutedTxHash(
  reviewId: number
): Promise<string | null> {
  try {
    const logs = await fetchMirrorLogs(100);
    for (const log of logs) {
      try {
        const parsed = decodeEventLog({
          abi: PROTOCOL_ABI,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          data: log.data as `0x${string}`,
          strict: false,
        });
        if (
          parsed.eventName === "ReviewExecuted" &&
          (parsed.args as { reviewId?: bigint }).reviewId === BigInt(reviewId)
        ) {
          return log.transaction_hash;
        }
      } catch {
        // not this event, skip
      }
    }
    return null;
  } catch {
    return null;
  }
}
