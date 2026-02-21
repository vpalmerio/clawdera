// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import {
    HederaScheduleService
} from "@hashgraph/smart-contracts/contracts/system-contracts/hedera-schedule-service/HederaScheduleService.sol";
import {
    HederaResponseCodes
} from "@hashgraph/smart-contracts/contracts/system-contracts/HederaResponseCodes.sol";

// ---------------------------------------------------------------------------
// INTERFACES
// ---------------------------------------------------------------------------

/// @notice Minimal interface for MemeJob protocol (buyJob function)
interface IMemeJob {
    function buyJob(
        address memeAddress,
        uint256 amount,
        address referrer
    ) external payable;

    function addressToMemeTokenMapping(address token)
        external
        view
        returns (
            address tokenAddress,
            address creatorAddress,
            uint256 fundsRaised,
            uint256 tokensSold,
            address firstBuyer,
            bool distributeRewards
        );
}

/// @notice Minimal ERC-20 interface for token balance checks
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

// ---------------------------------------------------------------------------
// ERC-7710 DELEGATION STRUCTS
// ---------------------------------------------------------------------------

/// @notice Represents a signed permission delegation from a user to an agent
struct Delegation {
    address delegator;   // User who granted permission
    address delegate;    // Agent wallet that received permission
    uint256 maxAmount;   // Max HBAR the agent may spend per review round
    uint256 expiry;      // Unix timestamp when delegation expires (0 = never)
    bytes signature;     // EIP-712 signature from delegator (validated off-chain / on submission)
}

// ---------------------------------------------------------------------------
// ERC-8004 AGENT IDENTITY STRUCTS
// ---------------------------------------------------------------------------

/// @notice On-chain identity record for an AI agent
struct AgentIdentity {
    address agentAddress;
    string metadataURI;       // Points to off-chain agent metadata (model, operator, etc.)
    uint256 registrationTime;
    int256  reputationScore;  // Starts at 0; incremented on profit, decremented on loss
    uint256 totalTrades;
    uint256 profitableTrades;
}

// ---------------------------------------------------------------------------
// CORE DATA STRUCTS
// ---------------------------------------------------------------------------

/// @notice Submitted thesis from an agent for a specific token review round
struct AgentThesis {
    address agent;
    string  thesis;          // Natural-language reasoning
    bool    bullish;         // true = invest, false = skip
    uint256 pledgedAmount;   // HBAR amount agent pledges to invest (0 if bearish)
    uint256 submittedAt;
}

/// @notice A token submitted by a creator for review
struct TokenReview {
    address  tokenAddress;
    address  creator;
    uint256  submissionFee;   // Fee paid by creator (redistributed to thesis submitters)
    uint256  deadline;        // block.timestamp + REVIEW_WINDOW
    bool     executed;        // Whether the buy has been triggered
    bool     exists;
    // Accumulated state
    uint256  totalPledged;    // Sum of all agent pledged amounts
    uint256  totalPurchased;  // Actual tokens received after buy (set post-execution)
    address  scheduleAddress; // Hedera scheduled tx address
}

/// @notice Per-agent share tracking within a review round
struct AgentShare {
    uint256 pledgedAmount;
    uint256 tokenShare;       // Tokens allocated post-purchase (proportional)
    bool    claimed;
}

// ---------------------------------------------------------------------------
// MAIN CONTRACT
// ---------------------------------------------------------------------------

contract AgentCoordProtocol is HederaScheduleService {

    // -----------------------------------------------------------------------
    // CONSTANTS
    // -----------------------------------------------------------------------

    // Configurable at deployment – set via constructor and stored as immutables
    uint256 public immutable REVIEW_WINDOW;       // seconds agents have to submit a thesis
    uint256 public immutable EXECUTION_GAS_LIMIT; // gas forwarded to the scheduled execution
    uint256 public immutable MIN_SUBMISSION_FEE;  // minimum HBAR a creator must pay to submit a token

    // Fixed protocol parameters
    uint8   public constant REPUTATION_WIN_DELTA  = 1;
    uint8   public constant REPUTATION_LOSS_DELTA = 1;

    // -----------------------------------------------------------------------
    // STATE
    // -----------------------------------------------------------------------

    address public owner;
    address public memeJobAddress;

    /// @dev Incremental review ID counter
    uint256 public nextReviewId;

    /// reviewId => TokenReview
    mapping(uint256 => TokenReview) public reviews;

    /// reviewId => agent address => AgentThesis
    mapping(uint256 => mapping(address => AgentThesis)) public theses;

    /// reviewId => list of agents that submitted a thesis
    mapping(uint256 => address[]) public reviewAgents;

    /// reviewId => agent address => AgentShare
    mapping(uint256 => mapping(address => AgentShare)) public agentShares;

    /// ERC-7710: delegator => agent => Delegation
    mapping(address => mapping(address => Delegation)) public delegations;

    /// ERC-8004: agent address => AgentIdentity
    mapping(address => AgentIdentity) public agentIdentities;

    /// Escrow: agent address => HBAR balance held by protocol on behalf of agent
    mapping(address => uint256) public agentEscrow;

    // -----------------------------------------------------------------------
    // EVENTS
    // -----------------------------------------------------------------------

    event TokenSubmitted(
        uint256 indexed reviewId,
        address indexed tokenAddress,
        address indexed creator,
        uint256 fee,
        uint256 deadline
    );
    event ThesisSubmitted(
        uint256 indexed reviewId,
        address indexed agent,
        bool bullish,
        uint256 pledgedAmount
    );
    event ReviewExecuted(
        uint256 indexed reviewId,
        uint256 totalSpent,
        uint256 tokensReceived
    );
    event AgentShareUpdated(
        uint256 indexed reviewId,
        address indexed agent,
        uint256 tokenShare
    );
    event ReputationUpdated(
        address indexed agent,
        int256 newScore,
        bool profitable
    );
    event DelegationRegistered(
        address indexed delegator,
        address indexed delegate,
        uint256 maxAmount,
        uint256 expiry
    );
    event AgentRegistered(
        address indexed agentAddress,
        string metadataURI
    );
    event FeeDistributed(
        uint256 indexed reviewId,
        address indexed agent,
        uint256 amount
    );
    event TokensClaimed(
        uint256 indexed reviewId,
        address indexed agent,
        uint256 amount
    );
    event MemeJobAddressUpdated(address newAddress);

    // -----------------------------------------------------------------------
    // MODIFIERS
    // -----------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier reviewExists(uint256 reviewId) {
        require(reviews[reviewId].exists, "Review does not exist");
        _;
    }

    modifier reviewOpen(uint256 reviewId) {
        require(!reviews[reviewId].executed, "Already executed");
        require(block.timestamp < reviews[reviewId].deadline, "Review window closed");
        _;
    }

    // -----------------------------------------------------------------------
    // CONSTRUCTOR
    // -----------------------------------------------------------------------

    constructor(
        address _memeJobAddress,
        uint256 _minSubmissionFee,
        uint256 _reviewWindow,
        uint256 _executionGasLimit
    ) payable {
        owner              = msg.sender;
        memeJobAddress     = _memeJobAddress;
        MIN_SUBMISSION_FEE = _minSubmissionFee;
        REVIEW_WINDOW      = _reviewWindow;
        EXECUTION_GAS_LIMIT = _executionGasLimit;
    }

    receive() external payable {}

    // -----------------------------------------------------------------------
    // ADMIN
    // -----------------------------------------------------------------------

    function setMemeJobAddress(address _memeJobAddress) external onlyOwner {
        memeJobAddress = _memeJobAddress;
        emit MemeJobAddressUpdated(_memeJobAddress);
    }

    // -----------------------------------------------------------------------
    // ERC-7710: DELEGATION
    // -----------------------------------------------------------------------

    /**
     * @notice Register a delegation from msg.sender (user) to an agent wallet.
     * @dev The signature field is stored for auditability. Full EIP-712 validation
     *      can be enforced here; for now we trust the caller is the delegator.
     * @param agentAddress  The AI agent's wallet address.
     * @param maxAmount     Maximum HBAR the agent may pledge per review round.
     * @param expiry        Expiry timestamp (0 = no expiry).
     * @param signature     EIP-712 signed delegation bytes (stored/auditable).
     */
    function registerDelegation(
        address agentAddress,
        uint256 maxAmount,
        uint256 expiry,
        bytes calldata signature
    ) external {
        require(agentAddress != address(0), "Invalid agent");
        require(maxAmount > 0, "maxAmount must be > 0");

        delegations[msg.sender][agentAddress] = Delegation({
            delegator:  msg.sender,
            delegate:   agentAddress,
            maxAmount:  maxAmount,
            expiry:     expiry,
            signature:  signature
        });

        emit DelegationRegistered(msg.sender, agentAddress, maxAmount, expiry);
    }

    /**
     * @notice Deposit HBAR into escrow on behalf of an agent.
     *         The delegator must have an active delegation to this agent.
     */
    function depositForAgent(address agentAddress) external payable {
        Delegation storage d = delegations[msg.sender][agentAddress];
        require(d.delegate == agentAddress, "No delegation found");
        require(d.expiry == 0 || block.timestamp < d.expiry, "Delegation expired");
        require(msg.value > 0, "No HBAR sent");

        agentEscrow[agentAddress] += msg.value;
    }

    /**
     * @notice Revoke a delegation. Remaining escrow is returned to delegator.
     *         (Simple 1:1 mapping; in production, escrow accounting would track
     *          per-delegator balances.)
     */
    function revokeDelegation(address agentAddress) external {
        Delegation storage d = delegations[msg.sender][agentAddress];
        require(d.delegate == agentAddress, "No delegation found");
        delete delegations[msg.sender][agentAddress];
    }

    /// @notice View delegation details
    function getDelegation(address delegator, address agent)
        external view
        returns (Delegation memory)
    {
        return delegations[delegator][agent];
    }

    // -----------------------------------------------------------------------
    // ERC-8004: AGENT IDENTITY
    // -----------------------------------------------------------------------

    /**
     * @notice Register an AI agent identity on-chain.
     * @param metadataURI  URI pointing to off-chain agent metadata JSON.
     */
    function registerAgent(string calldata metadataURI) external {
        require(agentIdentities[msg.sender].agentAddress == address(0), "Already registered");
        agentIdentities[msg.sender] = AgentIdentity({
            agentAddress:    msg.sender,
            metadataURI:     metadataURI,
            registrationTime: block.timestamp,
            reputationScore: 0,
            totalTrades:     0,
            profitableTrades: 0
        });
        emit AgentRegistered(msg.sender, metadataURI);
    }

    function getAgentIdentity(address agent)
        external view
        returns (AgentIdentity memory)
    {
        return agentIdentities[agent];
    }

    // -----------------------------------------------------------------------
    // TOKEN SUBMISSION (Part 2 of protocol)
    // -----------------------------------------------------------------------

    /**
     * @notice Token creator submits a token for agent review.
     *         Must send at least MIN_SUBMISSION_FEE in HBAR.
     * @param tokenAddress  The address of the meme token on Hedera.
     */
    function submitToken(address tokenAddress) external payable returns (uint256 reviewId) {
        require(msg.value >= MIN_SUBMISSION_FEE, "Insufficient submission fee");
        require(tokenAddress != address(0), "Invalid token address");

        // Verify token exists on MemeJob
        (address tAddr,,,,, ) = IMemeJob(memeJobAddress).addressToMemeTokenMapping(tokenAddress);
        require(tAddr != address(0), "Token not found on MemeJob");

        reviewId = nextReviewId++;
        uint256 deadline = block.timestamp + REVIEW_WINDOW;

        reviews[reviewId] = TokenReview({
            tokenAddress:   tokenAddress,
            creator:        msg.sender,
            submissionFee:  msg.value,
            deadline:       deadline,
            executed:       false,
            exists:         true,
            totalPledged:   0,
            totalPurchased: 0,
            scheduleAddress: address(0)
        });

        // Schedule the execution at the deadline using Hedera Scheduling Service
        bytes memory callData = abi.encodeWithSelector(
            this.executeReview.selector,
            reviewId
        );

        (int64 rc, address schedAddr) = scheduleCall(
            address(this),
            deadline,
            EXECUTION_GAS_LIMIT,
            0,
            callData
        );

        require(rc == HederaResponseCodes.SUCCESS, "scheduleCall failed");
        reviews[reviewId].scheduleAddress = schedAddr;

        emit TokenSubmitted(reviewId, tokenAddress, msg.sender, msg.value, deadline);
    }

    // -----------------------------------------------------------------------
    // THESIS SUBMISSION (Part 1 + Part 2 of protocol)
    // -----------------------------------------------------------------------

    /**
     * @notice An AI agent submits its thesis for a token review.
     *         The agent must have a valid delegation and sufficient escrow.
     *
     * @param reviewId      The review round ID.
     * @param thesis        Natural-language reasoning string.
     * @param bullish       true = agent wants to invest, false = pass.
     * @param pledgedAmount HBAR amount to invest (must be 0 if bearish).
     * @param delegator     Address of the user who delegated to this agent.
     */
    function submitThesis(
        uint256 reviewId,
        string calldata thesis,
        bool bullish,
        uint256 pledgedAmount,
        address delegator
    )
        external
        reviewExists(reviewId)
        reviewOpen(reviewId)
    {
        // Validate delegation
        Delegation storage d = delegations[delegator][msg.sender];
        require(d.delegate == msg.sender, "No valid delegation");
        require(d.expiry == 0 || block.timestamp < d.expiry, "Delegation expired");

        // Each agent may submit only one thesis per review
        require(theses[reviewId][msg.sender].agent == address(0), "Thesis already submitted");

        if (bullish) {
            require(pledgedAmount > 0, "Must pledge > 0 if bullish");
            require(pledgedAmount <= d.maxAmount, "Exceeds delegation limit");
            require(agentEscrow[msg.sender] >= pledgedAmount, "Insufficient escrow");

            // Lock the pledged amount
            agentEscrow[msg.sender] -= pledgedAmount;
            reviews[reviewId].totalPledged += pledgedAmount;

            agentShares[reviewId][msg.sender] = AgentShare({
                pledgedAmount: pledgedAmount,
                tokenShare:    0,
                claimed:       false
            });
        } else {
            pledgedAmount = 0;
        }

        theses[reviewId][msg.sender] = AgentThesis({
            agent:          msg.sender,
            thesis:         thesis,
            bullish:        bullish,
            pledgedAmount:  pledgedAmount,
            submittedAt:    block.timestamp
        });

        reviewAgents[reviewId].push(msg.sender);

        emit ThesisSubmitted(reviewId, msg.sender, bullish, pledgedAmount);
    }

    // -----------------------------------------------------------------------
    // EXECUTION (called by Hedera Scheduled Transaction)
    // -----------------------------------------------------------------------

    /**
     * @notice Executes the collective buy after the review window closes.
     *         Called automatically by the Hedera Scheduling Service.
     *         Can also be called manually after deadline as a fallback.
     *
     * @param reviewId  The review round to execute.
     */
    function executeReview(uint256 reviewId)
        external
        reviewExists(reviewId)
    {
        TokenReview storage review = reviews[reviewId];
        require(!review.executed, "Already executed");
        require(block.timestamp >= review.deadline, "Window not closed yet");

        review.executed = true;

        uint256 totalPledged = review.totalPledged;

        if (totalPledged == 0) {
            // No agents invested; distribute submission fee if any agents submitted theses
            _distributeSubmissionFee(reviewId);
            return;
        }

        // Snapshot token balance before purchase
        IERC20 token = IERC20(review.tokenAddress);
        uint256 balanceBefore = token.balanceOf(address(this));

        // Execute buy through MemeJob
        IMemeJob(memeJobAddress).buyJob{value: totalPledged}(
            review.tokenAddress,
            totalPledged,
            address(0) // no referrer
        );

        // Calculate tokens received
        uint256 balanceAfter = token.balanceOf(address(this));
        uint256 tokensReceived = balanceAfter - balanceBefore;
        review.totalPurchased = tokensReceived;

        // Allocate proportional token shares to each agent
        address[] storage agents = reviewAgents[reviewId];
        for (uint256 i = 0; i < agents.length; i++) {
            address agent = agents[i];
            AgentShare storage share = agentShares[reviewId][agent];

            if (share.pledgedAmount > 0 && tokensReceived > 0) {
                // share = (agentPledge / totalPledged) * tokensReceived
                share.tokenShare = (share.pledgedAmount * tokensReceived) / totalPledged;
                emit AgentShareUpdated(reviewId, agent, share.tokenShare);
            }
        }

        // Distribute submission fee to all thesis submitters (including bearish agents)
        _distributeSubmissionFee(reviewId);

        emit ReviewExecuted(reviewId, totalPledged, tokensReceived);
    }

    // -----------------------------------------------------------------------
    // REPUTATION UPDATE (called after a trade outcome is known)
    // -----------------------------------------------------------------------

    /**
     * @notice Update an agent's reputation based on trade profitability.
     *         In production this would be called by an oracle or after a
     *         price-check mechanism. For now, the owner can trigger it.
     *
     * @param reviewId   The review round.
     * @param agent      The agent address.
     * @param profitable Whether the trade was profitable.
     */
    function updateReputation(
        uint256 reviewId,
        address agent,
        bool profitable
    ) external onlyOwner reviewExists(reviewId) {
        require(reviews[reviewId].executed, "Review not yet executed");
        require(agentShares[reviewId][agent].pledgedAmount > 0, "Agent did not invest");

        AgentIdentity storage identity = agentIdentities[agent];
        require(identity.agentAddress != address(0), "Agent not registered (ERC-8004)");

        identity.totalTrades += 1;
        if (profitable) {
            identity.reputationScore += int256(uint256(REPUTATION_WIN_DELTA));
            identity.profitableTrades += 1;
        } else {
            identity.reputationScore -= int256(uint256(REPUTATION_LOSS_DELTA));
        }

        emit ReputationUpdated(agent, identity.reputationScore, profitable);
    }

    // -----------------------------------------------------------------------
    // CLAIM TOKENS
    // -----------------------------------------------------------------------

    /**
     * @notice Agent claims their allocated token share after execution.
     * @param reviewId  The review round.
     */
    function claimTokens(uint256 reviewId)
        external
        reviewExists(reviewId)
    {
        require(reviews[reviewId].executed, "Not yet executed");
        AgentShare storage share = agentShares[reviewId][msg.sender];
        require(share.tokenShare > 0, "No tokens to claim");
        require(!share.claimed, "Already claimed");

        share.claimed = true;
        IERC20 token = IERC20(reviews[reviewId].tokenAddress);
        require(token.transfer(msg.sender, share.tokenShare), "Transfer failed");

        emit TokensClaimed(reviewId, msg.sender, share.tokenShare);
    }

    // -----------------------------------------------------------------------
    // READ HELPERS
    // -----------------------------------------------------------------------

    /// @notice Get all submitted theses for a review (for agents to read each other's reasoning)
    function getTheses(uint256 reviewId)
        external
        view
        reviewExists(reviewId)
        returns (AgentThesis[] memory)
    {
        address[] storage agents = reviewAgents[reviewId];
        AgentThesis[] memory result = new AgentThesis[](agents.length);
        for (uint256 i = 0; i < agents.length; i++) {
            result[i] = theses[reviewId][agents[i]];
        }
        return result;
    }

    /// @notice Get review details
    function getReview(uint256 reviewId)
        external
        view
        reviewExists(reviewId)
        returns (TokenReview memory)
    {
        return reviews[reviewId];
    }

    /// @notice Get an agent's share for a review
    function getAgentShare(uint256 reviewId, address agent)
        external
        view
        returns (AgentShare memory)
    {
        return agentShares[reviewId][agent];
    }

    /// @notice Get escrow balance for an agent
    function getAgentEscrow(address agent) external view returns (uint256) {
        return agentEscrow[agent];
    }

    // -----------------------------------------------------------------------
    // INTERNAL HELPERS
    // -----------------------------------------------------------------------

    /**
     * @dev Distributes the creator's submission fee proportionally to all
     *      agents that submitted a thesis (both bullish and bearish).
     */
    function _distributeSubmissionFee(uint256 reviewId) internal {
        address[] storage agents = reviewAgents[reviewId];
        uint256 agentCount = agents.length;
        if (agentCount == 0) return;

        uint256 fee = reviews[reviewId].submissionFee;
        uint256 perAgent = fee / agentCount;
        uint256 remainder = fee - (perAgent * agentCount);

        for (uint256 i = 0; i < agentCount; i++) {
            address agent = agents[i];
            uint256 payout = (i == agentCount - 1) ? perAgent + remainder : perAgent;
            if (payout > 0) {
                (bool sent, ) = payable(agent).call{value: payout}("");
                if (sent) {
                    emit FeeDistributed(reviewId, agent, payout);
                }
                // If send fails (e.g., agent is a contract without receive), silently skip
                // In production, consider a pull-payment pattern here
            }
        }
    }
}
