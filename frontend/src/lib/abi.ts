export const PROTOCOL_ABI = [
  // -------------------------------------------------------------------------
  // IMMUTABLES / STATE GETTERS
  // -------------------------------------------------------------------------
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "memeJobAddress",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "nextReviewId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "REVIEW_WINDOW",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "MIN_SUBMISSION_FEE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "EXECUTION_GAS_LIMIT",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "agentEscrow",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "uint256" }],
  },

  // -------------------------------------------------------------------------
  // VIEW FUNCTIONS
  // -------------------------------------------------------------------------
  {
    name: "getReview",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "reviewId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenAddress", type: "address" },
          { name: "creator", type: "address" },
          { name: "submissionFee", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "executed", type: "bool" },
          { name: "exists", type: "bool" },
          { name: "totalPledged", type: "uint256" },
          { name: "totalPurchased", type: "uint256" },
          { name: "scheduleAddress", type: "address" },
        ],
      },
    ],
  },
  {
    name: "getTheses",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "reviewId", type: "uint256" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "agent", type: "address" },
          { name: "thesis", type: "string" },
          { name: "bullish", type: "bool" },
          { name: "pledgedAmount", type: "uint256" },
          { name: "submittedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getAgentIdentity",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "agentAddress", type: "address" },
          { name: "metadataURI", type: "string" },
          { name: "registrationTime", type: "uint256" },
          { name: "reputationScore", type: "int256" },
          { name: "totalTrades", type: "uint256" },
          { name: "profitableTrades", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getAgentShare",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "reviewId", type: "uint256" },
      { name: "agent", type: "address" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "pledgedAmount", type: "uint256" },
          { name: "tokenShare", type: "uint256" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getDelegation",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "delegator", type: "address" },
      { name: "agent", type: "address" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "delegator", type: "address" },
          { name: "delegate", type: "address" },
          { name: "maxAmount", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
  },
  {
    name: "getAgentEscrow",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "uint256" }],
  },

  // -------------------------------------------------------------------------
  // WRITE FUNCTIONS
  // -------------------------------------------------------------------------
  {
    name: "registerDelegation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentAddress", type: "address" },
      { name: "maxAmount", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "depositForAgent",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "agentAddress", type: "address" }],
    outputs: [],
  },
  {
    name: "revokeDelegation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentAddress", type: "address" }],
    outputs: [],
  },
  {
    name: "registerAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "metadataURI", type: "string" }],
    outputs: [],
  },
  {
    name: "submitToken",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "tokenAddress", type: "address" }],
    outputs: [{ name: "reviewId", type: "uint256" }],
  },
  {
    name: "submitThesis",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "reviewId", type: "uint256" },
      { name: "thesis", type: "string" },
      { name: "bullish", type: "bool" },
      { name: "pledgedAmount", type: "uint256" },
      { name: "delegator", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "executeReview",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "reviewId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "claimTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "reviewId", type: "uint256" }],
    outputs: [],
  },

  // -------------------------------------------------------------------------
  // EVENTS
  // -------------------------------------------------------------------------
  {
    name: "TokenSubmitted",
    type: "event",
    inputs: [
      { name: "reviewId", type: "uint256", indexed: true },
      { name: "tokenAddress", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "fee", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },
  {
    name: "ThesisSubmitted",
    type: "event",
    inputs: [
      { name: "reviewId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "bullish", type: "bool", indexed: false },
      { name: "pledgedAmount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "ReviewExecuted",
    type: "event",
    inputs: [
      { name: "reviewId", type: "uint256", indexed: true },
      { name: "totalSpent", type: "uint256", indexed: false },
      { name: "tokensReceived", type: "uint256", indexed: false },
    ],
  },
  {
    name: "AgentRegistered",
    type: "event",
    inputs: [
      { name: "agentAddress", type: "address", indexed: true },
      { name: "metadataURI", type: "string", indexed: false },
    ],
  },
  {
    name: "DelegationRegistered",
    type: "event",
    inputs: [
      { name: "delegator", type: "address", indexed: true },
      { name: "delegate", type: "address", indexed: true },
      { name: "maxAmount", type: "uint256", indexed: false },
      { name: "expiry", type: "uint256", indexed: false },
    ],
  },
  {
    name: "FeeDistributed",
    type: "event",
    inputs: [
      { name: "reviewId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "TokensClaimed",
    type: "event",
    inputs: [
      { name: "reviewId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "ReputationUpdated",
    type: "event",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "newScore", type: "int256", indexed: false },
      { name: "profitable", type: "bool", indexed: false },
    ],
  },
  {
    name: "MemeJobAddressUpdated",
    type: "event",
    inputs: [{ name: "newAddress", type: "address", indexed: false }],
  },
] as const;
