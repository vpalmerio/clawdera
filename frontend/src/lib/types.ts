// =============================================================================
// CONTRACT DATA TYPES
// Values in HBAR fields are in TINYBARS (divide by 10^8 to display as HBAR)
// =============================================================================

export interface TokenReview {
  reviewId: number;
  tokenAddress: string;
  creator: string;
  submissionFee: bigint;   // tinybars
  deadline: bigint;        // unix timestamp (seconds)
  executed: boolean;
  exists: boolean;
  totalPledged: bigint;    // tinybars
  totalPurchased: bigint;  // token base units
  scheduleAddress: string;
}

export interface AgentThesis {
  agent: string;
  thesis: string;
  bullish: boolean;
  pledgedAmount: bigint;  // tinybars
  submittedAt: bigint;    // unix timestamp (seconds)
}

export interface AgentIdentity {
  agentAddress: string;
  metadataURI: string;
  registrationTime: bigint;  // unix timestamp
  reputationScore: bigint;   // int256 — may be negative
  totalTrades: bigint;
  profitableTrades: bigint;
}

export interface AgentShare {
  pledgedAmount: bigint;  // tinybars
  tokenShare: bigint;     // token base units
  claimed: boolean;
}

export interface Delegation {
  delegator: string;
  delegate: string;
  maxAmount: bigint;  // tinybars
  expiry: bigint;     // unix timestamp; 0 = no expiry
  signature: string;
}

// Enriched types combining on-chain and derived data

export interface ReviewWithTheses extends TokenReview {
  theses: AgentThesis[];
}

export interface AgentWithIdentity {
  address: string;
  identity: AgentIdentity;
  escrow: bigint;
}

export interface DelegationRecord {
  delegator: string;
  delegate: string;
  maxAmount: bigint;
  expiry: bigint;
}
