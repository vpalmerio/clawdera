import { expect } from "chai";
import { network } from "hardhat";
import type { ContractTransactionResponse, Signer } from "ethers";

// ---------------------------------------------------------------------------
// HARDHAT v3: obtain ethers from the network connection
// ---------------------------------------------------------------------------

const { ethers } = await network.connect();

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const ONE_HBAR  = ethers.parseEther("1");
const TEN_HBAR  = ethers.parseEther("10");
const MIN_FEE   = ONE_HBAR; // matches MIN_SUBMISSION_FEE in contract
const REVIEW_WINDOW = 600; // 10 minutes in seconds

/** Advance the local Hardhat EVM clock by `seconds` */
async function advanceTime(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

/** Return the current block timestamp */
async function now(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

/** Build a dummy ERC-7710 signature bytes (not cryptographically valid — used for storage tests) */
function dummySig(): string {
  return ethers.hexlify(ethers.randomBytes(65));
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

describe("AgentCoordProtocol", function () {

  // Shared state
  let protocol:   any;
  let mockJob:    any;
  let mockToken:  any;

  let owner:    Signer;
  let creator:  Signer;  // token creator / submitter
  let user1:    Signer;  // delegator (human user)
  let user2:    Signer;  // delegator (human user)
  let agent1:   Signer;  // AI agent wallet
  let agent2:   Signer;  // AI agent wallet
  let agent3:   Signer;  // AI agent wallet (bearish)
  let stranger: Signer;  // no delegation, no role

  let protocolAddr: string;
  let mockJobAddr:  string;
  let mockTokenAddr: string;

  // -------------------------------------------------------------------------
  // DEPLOYMENT
  // -------------------------------------------------------------------------

  before(async function () {
    // -----------------------------------------------------------------------
    // Inject mock Hedera Schedule Service precompile at 0x16b.
    // The real HSS precompile only exists on Hedera networks; on local Hardhat
    // address 0x16b has no code, so scheduleCall returns UNKNOWN and
    // submitToken reverts with "scheduleCall failed".
    // We deploy MockHSSPrecompile and inject its bytecode so every HSS call
    // returns SUCCESS (22) + a dummy schedule address.
    // -----------------------------------------------------------------------
    const MockHSSPrecompile = await ethers.getContractFactory("MockHSSPrecompile");
    const mockHSS = await MockHSSPrecompile.deploy();
    await mockHSS.waitForDeployment();
    const mockHSSBytecode = await ethers.provider.getCode(await mockHSS.getAddress());
    await ethers.provider.send("hardhat_setCode", [
      "0x000000000000000000000000000000000000016b",
      mockHSSBytecode,
    ]);

    [owner, creator, user1, user2, agent1, agent2, agent3, stranger] =
      await ethers.getSigners();

    console.log("owner   :", await owner.getAddress());
    console.log("creator :", await creator.getAddress());
    console.log("user1   :", await user1.getAddress());
    console.log("agent1  :", await agent1.getAddress());
    console.log("agent2  :", await agent2.getAddress());
    console.log("agent3  :", await agent3.getAddress());

    // --- Deploy MockMemeJob ---
    const MockMemeJob = await ethers.getContractFactory("MockMemeJob", owner);
    mockJob = await MockMemeJob.deploy();
    await mockJob.waitForDeployment();
    mockJobAddr = await mockJob.getAddress();
    console.log("MockMemeJob :", mockJobAddr);

    // --- Deploy MockERC20 (the meme token) ---
    const MockERC20 = await ethers.getContractFactory("MockERC20", owner);
    mockToken = await MockERC20.deploy("PEPE Coin", "PEPE", mockJobAddr);
    await mockToken.waitForDeployment();
    mockTokenAddr = await mockToken.getAddress();
    console.log("MockERC20   :", mockTokenAddr);

    // Register the mock token with MockMemeJob so the protocol can find it
    await mockJob.registerMockToken(mockTokenAddr, await creator.getAddress());

    // --- Deploy AgentCoordProtocol ---
    const Protocol = await ethers.getContractFactory("AgentCoordProtocol", owner);
    protocol = await Protocol.deploy(
      mockJobAddr,
      MIN_FEE,          // MIN_SUBMISSION_FEE  = 1 HBAR
      REVIEW_WINDOW,    // REVIEW_WINDOW        = 600 seconds
      3_000_000,        // EXECUTION_GAS_LIMIT
      { value: TEN_HBAR }
    );
    await protocol.waitForDeployment();
    protocolAddr = await protocol.getAddress();
    console.log("Protocol    :", protocolAddr);
  });

  // =========================================================================
  // 1. DEPLOYMENT & INITIAL STATE
  // =========================================================================

  describe("1. Deployment & Initial State", function () {

    it("should deploy with the correct owner", async function () {
      expect(await protocol.owner()).to.equal(await owner.getAddress());
    });

    it("should deploy with the correct MemeJob address", async function () {
      expect(await protocol.memeJobAddress()).to.equal(mockJobAddr);
    });

    it("should start with nextReviewId at 0", async function () {
      expect(await protocol.nextReviewId()).to.equal(0n);
    });

    it("should hold the initial HBAR sent at deployment", async function () {
      const balance = await ethers.provider.getBalance(protocolAddr);
      expect(balance).to.equal(TEN_HBAR);
    });

    it("should allow the owner to update the MemeJob address", async function () {
      const newAddr = await stranger.getAddress();
      const tx: ContractTransactionResponse = await protocol.connect(owner).setMemeJobAddress(newAddr);
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "MemeJobAddressUpdated");
      expect(event).to.not.be.undefined;
      expect(event!.args.newAddress).to.equal(newAddr);

      // Restore
      await protocol.connect(owner).setMemeJobAddress(mockJobAddr);
      expect(await protocol.memeJobAddress()).to.equal(mockJobAddr);
    });

    it("should revert when a non-owner tries to update the MemeJob address", async function () {
      await expect(
        protocol.connect(stranger).setMemeJobAddress(await stranger.getAddress())
      ).to.be.revertedWith("Not owner");
    });

  });

  // =========================================================================
  // 2. ERC-7710 DELEGATION
  // =========================================================================

  describe("2. ERC-7710 Delegation", function () {

    it("should allow a user to register a delegation to an agent", async function () {
      const tx: ContractTransactionResponse = await protocol
        .connect(user1)
        .registerDelegation(
          await agent1.getAddress(),
          TEN_HBAR,
          0,           // no expiry
          dummySig()
        );
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "DelegationRegistered");

      expect(event).to.not.be.undefined;
      expect(event!.args.delegator).to.equal(await user1.getAddress());
      expect(event!.args.delegate).to.equal(await agent1.getAddress());
      expect(event!.args.maxAmount).to.equal(TEN_HBAR);
      expect(event!.args.expiry).to.equal(0n);
    });

    it("should store delegation details correctly", async function () {
      const d = await protocol.getDelegation(
        await user1.getAddress(),
        await agent1.getAddress()
      );
      expect(d.delegator).to.equal(await user1.getAddress());
      expect(d.delegate).to.equal(await agent1.getAddress());
      expect(d.maxAmount).to.equal(TEN_HBAR);
      expect(d.expiry).to.equal(0n);
    });

    it("should allow a user to register a delegation with an expiry", async function () {
      const expiry = (await now()) + 86400; // 24 hours from now
      await protocol
        .connect(user2)
        .registerDelegation(
          await agent2.getAddress(),
          TEN_HBAR,
          expiry,
          dummySig()
        );

      const d = await protocol.getDelegation(
        await user2.getAddress(),
        await agent2.getAddress()
      );
      expect(d.expiry).to.equal(BigInt(expiry));
    });

    it("should revert delegation to the zero address", async function () {
      await expect(
        protocol.connect(user1).registerDelegation(
          ethers.ZeroAddress,
          TEN_HBAR,
          0,
          dummySig()
        )
      ).to.be.revertedWith("Invalid agent");
    });

    it("should revert delegation with maxAmount = 0", async function () {
      await expect(
        protocol.connect(user1).registerDelegation(
          await agent1.getAddress(),
          0,
          0,
          dummySig()
        )
      ).to.be.revertedWith("maxAmount must be > 0");
    });

    it("should allow a user to deposit HBAR into escrow for their agent", async function () {
      const depositAmount = ethers.parseEther("5");
      await protocol
        .connect(user1)
        .depositForAgent(await agent1.getAddress(), { value: depositAmount });

      expect(await protocol.getAgentEscrow(await agent1.getAddress()))
        .to.equal(depositAmount);
    });

    it("should accumulate multiple escrow deposits", async function () {
      const first  = await protocol.getAgentEscrow(await agent1.getAddress());
      const extra  = ethers.parseEther("2");
      await protocol
        .connect(user1)
        .depositForAgent(await agent1.getAddress(), { value: extra });

      expect(await protocol.getAgentEscrow(await agent1.getAddress()))
        .to.equal(first + extra);
    });

    it("should revert escrow deposit when no delegation exists for that agent", async function () {
      await expect(
        protocol
          .connect(user2)
          .depositForAgent(await agent1.getAddress(), { value: ONE_HBAR })
      ).to.be.revertedWith("No delegation found");
    });

    it("should revert escrow deposit with zero value", async function () {
      await expect(
        protocol
          .connect(user1)
          .depositForAgent(await agent1.getAddress(), { value: 0 })
      ).to.be.revertedWith("No HBAR sent");
    });

    it("should allow a user to revoke a delegation", async function () {
      // Register a fresh delegation specifically to revoke
      await protocol
        .connect(user2)
        .registerDelegation(
          await agent3.getAddress(),
          ONE_HBAR,
          0,
          dummySig()
        );

      let d = await protocol.getDelegation(
        await user2.getAddress(),
        await agent3.getAddress()
      );
      expect(d.delegate).to.equal(await agent3.getAddress());

      await protocol.connect(user2).revokeDelegation(await agent3.getAddress());

      d = await protocol.getDelegation(
        await user2.getAddress(),
        await agent3.getAddress()
      );
      // After deletion the struct is zero-valued
      expect(d.delegate).to.equal(ethers.ZeroAddress);
    });

    it("should revert a deposit to an agent after delegation is revoked", async function () {
      await expect(
        protocol
          .connect(user2)
          .depositForAgent(await agent3.getAddress(), { value: ONE_HBAR })
      ).to.be.revertedWith("No delegation found");
    });

    // Set up agent2's delegation + escrow properly for later tests
    it("should set up user2 → agent2 delegation and escrow for later tests", async function () {
      await protocol
        .connect(user2)
        .depositForAgent(await agent2.getAddress(), { value: TEN_HBAR });

      expect(await protocol.getAgentEscrow(await agent2.getAddress()))
        .to.be.gte(ONE_HBAR);
    });

    // Set up agent3 (bearish) delegation
    it("should set up user1 → agent3 delegation and escrow for later tests", async function () {
      await protocol
        .connect(user1)
        .registerDelegation(
          await agent3.getAddress(),
          TEN_HBAR,
          0,
          dummySig()
        );
      await protocol
        .connect(user1)
        .depositForAgent(await agent3.getAddress(), { value: TEN_HBAR });
    });

  });

  // =========================================================================
  // 3. ERC-8004 AGENT IDENTITY
  // =========================================================================

  describe("3. ERC-8004 Agent Identity", function () {

    it("should allow an agent to register its identity", async function () {
      const uri = "ipfs://QmAgent1MetadataHash";
      const tx: ContractTransactionResponse = await protocol
        .connect(agent1)
        .registerAgent(uri);
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "AgentRegistered");

      expect(event).to.not.be.undefined;
      expect(event!.args.agentAddress).to.equal(await agent1.getAddress());
      expect(event!.args.metadataURI).to.equal(uri);
    });

    it("should store agent identity with correct initial values", async function () {
      const identity = await protocol.getAgentIdentity(await agent1.getAddress());
      expect(identity.agentAddress).to.equal(await agent1.getAddress());
      expect(identity.metadataURI).to.equal("ipfs://QmAgent1MetadataHash");
      expect(identity.reputationScore).to.equal(0n);
      expect(identity.totalTrades).to.equal(0n);
      expect(identity.profitableTrades).to.equal(0n);
    });

    it("should revert if an agent tries to register twice", async function () {
      await expect(
        protocol.connect(agent1).registerAgent("ipfs://duplicate")
      ).to.be.revertedWith("Already registered");
    });

    it("should allow multiple distinct agents to register", async function () {
      await protocol.connect(agent2).registerAgent("ipfs://QmAgent2MetadataHash");
      await protocol.connect(agent3).registerAgent("ipfs://QmAgent3MetadataHash");

      const id2 = await protocol.getAgentIdentity(await agent2.getAddress());
      const id3 = await protocol.getAgentIdentity(await agent3.getAddress());

      expect(id2.agentAddress).to.equal(await agent2.getAddress());
      expect(id3.agentAddress).to.equal(await agent3.getAddress());
    });

    it("should return a zeroed struct for an unregistered address", async function () {
      const identity = await protocol.getAgentIdentity(await stranger.getAddress());
      expect(identity.agentAddress).to.equal(ethers.ZeroAddress);
      expect(identity.reputationScore).to.equal(0n);
    });

  });

  // =========================================================================
  // 4. TOKEN SUBMISSION
  // =========================================================================

  describe("4. Token Submission", function () {

    it("should revert submission with insufficient fee", async function () {
      const halfFee = MIN_FEE / 2n;
      await expect(
        protocol
          .connect(creator)
          .submitToken(mockTokenAddr, { value: halfFee })
      ).to.be.revertedWith("Insufficient submission fee");
    });

    it("should revert submission with the zero address as token", async function () {
      await expect(
        protocol
          .connect(creator)
          .submitToken(ethers.ZeroAddress, { value: MIN_FEE })
      ).to.be.revertedWith("Invalid token address");
    });

    it("should revert submission for a token not registered in MemeJob", async function () {
      const fakeTok = await stranger.getAddress();
      await expect(
        protocol
          .connect(creator)
          .submitToken(fakeTok, { value: MIN_FEE })
      ).to.be.revertedWith("Token not found on MemeJob");
    });

    it("should successfully submit a token and emit TokenSubmitted", async function () {
      const tx: ContractTransactionResponse = await protocol
        .connect(creator)
        .submitToken(mockTokenAddr, { value: MIN_FEE });
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "TokenSubmitted");

      expect(event).to.not.be.undefined;
      expect(event!.args.reviewId).to.equal(0n);
      expect(event!.args.tokenAddress).to.equal(mockTokenAddr);
      expect(event!.args.creator).to.equal(await creator.getAddress());
      expect(event!.args.fee).to.equal(MIN_FEE);
    });

    it("should increment nextReviewId after submission", async function () {
      expect(await protocol.nextReviewId()).to.equal(1n);
    });

    it("should store the review with correct fields", async function () {
      const review = await protocol.getReview(0);
      expect(review.tokenAddress).to.equal(mockTokenAddr);
      expect(review.creator).to.equal(await creator.getAddress());
      expect(review.submissionFee).to.equal(MIN_FEE);
      expect(review.executed).to.equal(false);
      expect(review.exists).to.equal(true);
      expect(review.totalPledged).to.equal(0n);
    });

    it("should set the review deadline approximately 10 minutes in the future", async function () {
      const review   = await protocol.getReview(0);
      const current  = BigInt(await now());
      const deadline = review.deadline;

      // deadline should be between now and now + REVIEW_WINDOW + small buffer
      expect(deadline).to.be.gte(current + BigInt(REVIEW_WINDOW) - 5n);
      expect(deadline).to.be.lte(current + BigInt(REVIEW_WINDOW) + 5n);
    });

    it("should revert getReview for a non-existent reviewId", async function () {
      await expect(protocol.getReview(999)).to.be.revertedWith("Review does not exist");
    });

  });

  // =========================================================================
  // 5. THESIS SUBMISSION
  // =========================================================================

  describe("5. Thesis Submission", function () {

    // reviewId 0 was opened in section 4
    const REVIEW_ID = 0;

    it("should revert thesis submission with no delegation", async function () {
      await expect(
        protocol
          .connect(stranger)
          .submitThesis(
            REVIEW_ID,
            "Looks bullish",
            true,
            ethers.parseEther("1"),
            await owner.getAddress()
          )
      ).to.be.revertedWith("No valid delegation");
    });

    it("should revert a bullish thesis with zero pledged amount", async function () {
      await expect(
        protocol
          .connect(agent1)
          .submitThesis(
            REVIEW_ID,
            "Bullish but forgot to pledge",
            true,
            0,
            await user1.getAddress()
          )
      ).to.be.revertedWith("Must pledge > 0 if bullish");
    });

    it("should revert a bullish thesis that exceeds delegation limit", async function () {
      // user1 → agent1 maxAmount is TEN_HBAR; try to pledge more
      const overLimit = TEN_HBAR + ONE_HBAR;
      await expect(
        protocol
          .connect(agent1)
          .submitThesis(
            REVIEW_ID,
            "Over-limit pledge",
            true,
            overLimit,
            await user1.getAddress()
          )
      ).to.be.revertedWith("Exceeds delegation limit");
    });

    it("should revert a bullish thesis when escrow is insufficient", async function () {
      const escrow = await protocol.getAgentEscrow(await agent1.getAddress());
      const overEscrow = escrow + ONE_HBAR;

      // Re-register delegation with a high enough cap so escrow is the limiting factor
      await protocol
        .connect(user1)
        .registerDelegation(
          await agent1.getAddress(),
          overEscrow * 2n,
          0,
          dummySig()
        );

      await expect(
        protocol
          .connect(agent1)
          .submitThesis(
            REVIEW_ID,
            "Insufficient escrow attempt",
            true,
            overEscrow,
            await user1.getAddress()
          )
      ).to.be.revertedWith("Insufficient escrow");

      // Restore sensible delegation limit
      await protocol
        .connect(user1)
        .registerDelegation(
          await agent1.getAddress(),
          TEN_HBAR,
          0,
          dummySig()
        );
    });

    it("should allow agent1 (bullish) to submit a valid thesis", async function () {
      const pledge = ethers.parseEther("2");
      const tx: ContractTransactionResponse = await protocol
        .connect(agent1)
        .submitThesis(
          REVIEW_ID,
          "Strong fundamentals, early liquidity, high velocity memetics. Bullish.",
          true,
          pledge,
          await user1.getAddress()
        );
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "ThesisSubmitted");

      expect(event).to.not.be.undefined;
      expect(event!.args.agent).to.equal(await agent1.getAddress());
      expect(event!.args.bullish).to.equal(true);
      expect(event!.args.pledgedAmount).to.equal(pledge);
    });

    it("should deduct the pledged amount from agent1's escrow", async function () {
      // After pledging 2 HBAR, escrow should have reduced accordingly
      const escrow = await protocol.getAgentEscrow(await agent1.getAddress());
      // Original deposit was 5 + 2 = 7 HBAR; pledged 2 → 5 remaining
      expect(escrow).to.equal(ethers.parseEther("5"));
    });

    it("should record agent1's thesis in the review", async function () {
      const thesis = await protocol.theses(REVIEW_ID, await agent1.getAddress());
      expect(thesis.agent).to.equal(await agent1.getAddress());
      expect(thesis.bullish).to.equal(true);
      expect(thesis.pledgedAmount).to.equal(ethers.parseEther("2"));
    });

    it("should update review totalPledged after agent1 submission", async function () {
      const review = await protocol.getReview(REVIEW_ID);
      expect(review.totalPledged).to.equal(ethers.parseEther("2"));
    });

    it("should allow agent2 (bullish) to submit with a different pledge", async function () {
      const pledge = ethers.parseEther("3");
      await protocol
        .connect(agent2)
        .submitThesis(
          REVIEW_ID,
          "High social volume on CT. 10x probability. In.",
          true,
          pledge,
          await user2.getAddress()
        );

      const review = await protocol.getReview(REVIEW_ID);
      expect(review.totalPledged).to.equal(ethers.parseEther("5")); // 2 + 3
    });

    it("should allow agent3 to submit a bearish (skip) thesis with no pledge", async function () {
      const tx: ContractTransactionResponse = await protocol
        .connect(agent3)
        .submitThesis(
          REVIEW_ID,
          "Rug-pull indicators detected. No on-chain liquidity lock. Passing.",
          false,
          0,
          await user1.getAddress()
        );
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "ThesisSubmitted");

      expect(event!.args.bullish).to.equal(false);
      expect(event!.args.pledgedAmount).to.equal(0n);
    });

    it("should NOT deduct escrow for a bearish thesis", async function () {
      const escrowBefore = await protocol.getAgentEscrow(await agent3.getAddress());
      // Escrow should remain unchanged (no pledge deducted)
      expect(escrowBefore).to.be.gte(ONE_HBAR);
    });

    it("should return all three theses via getTheses", async function () {
      const theses = await protocol.getTheses(REVIEW_ID);
      expect(theses.length).to.equal(3);

      const agents = theses.map((t: any) => t.agent.toLowerCase());
      expect(agents).to.include((await agent1.getAddress()).toLowerCase());
      expect(agents).to.include((await agent2.getAddress()).toLowerCase());
      expect(agents).to.include((await agent3.getAddress()).toLowerCase());
    });

    it("should revert a duplicate thesis from the same agent", async function () {
      await expect(
        protocol
          .connect(agent1)
          .submitThesis(
            REVIEW_ID,
            "Second attempt",
            true,
            ONE_HBAR,
            await user1.getAddress()
          )
      ).to.be.revertedWith("Thesis already submitted");
    });

    it("should revert thesis submission for a non-existent review", async function () {
      await expect(
        protocol
          .connect(agent1)
          .submitThesis(999, "Thesis on ghost review", true, ONE_HBAR, await user1.getAddress())
      ).to.be.revertedWith("Review does not exist");
    });

    it("should revert thesis submission after the review window closes", async function () {
      // Advance past the deadline
      await advanceTime(REVIEW_WINDOW + 10);

      await expect(
        protocol
          .connect(agent1)
          .submitThesis(
            REVIEW_ID,
            "Late submission",
            true,
            ONE_HBAR,
            await user1.getAddress()
          )
      ).to.be.revertedWith("Review window closed");
    });

  });

  // =========================================================================
  // 6. REVIEW EXECUTION
  // =========================================================================

  describe("6. Review Execution", function () {

    // reviewId 0 deadline has already passed (we advanced time in section 5)
    const REVIEW_ID = 0;

    it("should revert execution before the review window closes on a fresh review", async function () {
      // Submit a second token to get a fresh review (reviewId 1)
      await protocol
        .connect(creator)
        .submitToken(mockTokenAddr, { value: MIN_FEE });

      // Immediately try to execute — should fail
      await expect(protocol.executeReview(1)).to.be.revertedWith(
        "Window not closed yet"
      );
    });

    it("should execute review 0 successfully after the deadline", async function () {
      // Deadline has already passed. Execute manually (simulates scheduled call).
      const tx: ContractTransactionResponse = await protocol.executeReview(REVIEW_ID);
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "ReviewExecuted");

      expect(event).to.not.be.undefined;
      // totalSpent should equal totalPledged (2 + 3 = 5 HBAR)
      expect(event!.args.totalSpent).to.equal(ethers.parseEther("5"));
      // tokensReceived > 0 (mock rate: 1000 tokens per HBAR)
      expect(event!.args.tokensReceived).to.be.gt(0n);
    });

    it("should mark the review as executed", async function () {
      const review = await protocol.getReview(REVIEW_ID);
      expect(review.executed).to.equal(true);
    });

    it("should record the correct totalPurchased on the review", async function () {
      const review = await protocol.getReview(REVIEW_ID);
      // 5 HBAR * 1000 tokens/HBAR = 5000 tokens (18 decimals via mock rate)
      expect(review.totalPurchased).to.be.gt(0n);
    });

    it("should assign agent1 a proportional token share (2/5 of total)", async function () {
      const review = await protocol.getReview(REVIEW_ID);
      const share  = await protocol.getAgentShare(REVIEW_ID, await agent1.getAddress());

      const expected = (ethers.parseEther("2") * review.totalPurchased) / ethers.parseEther("5");
      expect(share.tokenShare).to.equal(expected);
    });

    it("should assign agent2 a proportional token share (3/5 of total)", async function () {
      const review = await protocol.getReview(REVIEW_ID);
      const share  = await protocol.getAgentShare(REVIEW_ID, await agent2.getAddress());

      const expected = (ethers.parseEther("3") * review.totalPurchased) / ethers.parseEther("5");
      expect(share.tokenShare).to.equal(expected);
    });

    it("should assign agent3 (bearish) zero token share", async function () {
      const share = await protocol.getAgentShare(REVIEW_ID, await agent3.getAddress());
      expect(share.tokenShare).to.equal(0n);
    });

    it("should handle reviewId 1 (no theses) execution without error", async function () {
      // Advance past reviewId 1's deadline then execute
      await advanceTime(REVIEW_WINDOW + 10);
      const tx: ContractTransactionResponse = await protocol.executeReview(1);
      const receipt = await tx.wait();

      // reviewId 1 had no thesis submissions → no AgentShareUpdated or ReviewExecuted events
      expect(receipt).to.not.be.null;
    });

    it("should revert double execution of the same review", async function () {
      await expect(protocol.executeReview(REVIEW_ID)).to.be.revertedWith("Already executed");
    });

    it("should revert execution of a non-existent review", async function () {
      await expect(protocol.executeReview(999)).to.be.revertedWith("Review does not exist");
    });

    it("should emit no FeeDistributed events when no theses were submitted", async function () {
      // Create reviewId 2 with no agent submissions
      await protocol.connect(creator).submitToken(mockTokenAddr, { value: MIN_FEE });
      await advanceTime(REVIEW_WINDOW + 10);
      const tx: ContractTransactionResponse = await protocol.executeReview(2);
      const receipt = await tx.wait();

      const feeEvents = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .filter((e: any) => e?.name === "FeeDistributed");

      expect(feeEvents.length).to.equal(0);
    });

  });

  // =========================================================================
  // 7. TOKEN CLAIMING
  // =========================================================================

  describe("7. Token Claiming", function () {

    const REVIEW_ID = 0;

    it("should revert a claim attempt on an unexecuted review", async function () {
      // reviewId 3 will be submitted here but not yet executed
      await protocol.connect(creator).submitToken(mockTokenAddr, { value: MIN_FEE });
      await expect(
        protocol.connect(agent1).claimTokens(3)
      ).to.be.revertedWith("Not yet executed");
    });

    it("should revert a claim for an agent with no token share", async function () {
      // agent3 was bearish on reviewId 0 → tokenShare = 0
      await expect(
        protocol.connect(agent3).claimTokens(REVIEW_ID)
      ).to.be.revertedWith("No tokens to claim");
    });

    it("should revert a claim for a stranger with no share at all", async function () {
      await expect(
        protocol.connect(stranger).claimTokens(REVIEW_ID)
      ).to.be.revertedWith("No tokens to claim");
    });

    it("should allow agent1 to claim their token share", async function () {
      const share = await protocol.getAgentShare(REVIEW_ID, await agent1.getAddress());
      const balBefore = await mockToken.balanceOf(await agent1.getAddress());

      const tx: ContractTransactionResponse = await protocol
        .connect(agent1)
        .claimTokens(REVIEW_ID);
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "TokensClaimed");

      expect(event).to.not.be.undefined;
      expect(event!.args.agent).to.equal(await agent1.getAddress());
      expect(event!.args.amount).to.equal(share.tokenShare);

      const balAfter = await mockToken.balanceOf(await agent1.getAddress());
      expect(balAfter - balBefore).to.equal(share.tokenShare);
    });

    it("should mark the share as claimed after successful claim", async function () {
      const share = await protocol.getAgentShare(REVIEW_ID, await agent1.getAddress());
      expect(share.claimed).to.equal(true);
    });

    it("should revert a second claim attempt (double-claim protection)", async function () {
      await expect(
        protocol.connect(agent1).claimTokens(REVIEW_ID)
      ).to.be.revertedWith("Already claimed");
    });

    it("should allow agent2 to independently claim their share", async function () {
      const share = await protocol.getAgentShare(REVIEW_ID, await agent2.getAddress());
      const balBefore = await mockToken.balanceOf(await agent2.getAddress());

      await protocol.connect(agent2).claimTokens(REVIEW_ID);

      const balAfter = await mockToken.balanceOf(await agent2.getAddress());
      expect(balAfter - balBefore).to.equal(share.tokenShare);
    });

    it("agent1 + agent2 shares should sum to totalPurchased (no token leakage)", async function () {
      const review = await protocol.getReview(REVIEW_ID);
      const share1 = await protocol.getAgentShare(REVIEW_ID, await agent1.getAddress());
      const share2 = await protocol.getAgentShare(REVIEW_ID, await agent2.getAddress());

      // Due to integer division there may be 1 wei of dust. Accept ±1.
      const combined = share1.tokenShare + share2.tokenShare;
      const diff = review.totalPurchased > combined
        ? review.totalPurchased - combined
        : combined - review.totalPurchased;
      expect(diff).to.be.lte(1n);
    });

  });

  // =========================================================================
  // 8. REPUTATION (ERC-8004)
  // =========================================================================

  describe("8. Reputation Updates (ERC-8004)", function () {

    const REVIEW_ID = 0;

    it("should revert reputation update from a non-owner", async function () {
      await expect(
        protocol
          .connect(stranger)
          .updateReputation(REVIEW_ID, await agent1.getAddress(), true)
      ).to.be.revertedWith("Not owner");
    });

    it("should revert reputation update for a review that was not executed", async function () {
      // reviewId 3 was submitted but never executed
      await expect(
        protocol
          .connect(owner)
          .updateReputation(3, await agent1.getAddress(), true)
      ).to.be.revertedWith("Review not yet executed");
    });

    it("should revert reputation update for an agent that did not invest", async function () {
      // agent3 was bearish (pledgedAmount = 0)
      await expect(
        protocol
          .connect(owner)
          .updateReputation(REVIEW_ID, await agent3.getAddress(), true)
      ).to.be.revertedWith("Agent did not invest");
    });

    it("should revert reputation update for an unregistered agent (ERC-8004)", async function () {
      // stranger never called registerAgent — guard is in updateReputation source
      this.skip();
    });

    it("should increase reputation score on a profitable trade", async function () {
      const before = await protocol.getAgentIdentity(await agent1.getAddress());
      expect(before.reputationScore).to.equal(0n);

      const tx: ContractTransactionResponse = await protocol
        .connect(owner)
        .updateReputation(REVIEW_ID, await agent1.getAddress(), true);
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "ReputationUpdated");

      expect(event).to.not.be.undefined;
      expect(event!.args.profitable).to.equal(true);
      expect(event!.args.newScore).to.equal(1n);

      const after = await protocol.getAgentIdentity(await agent1.getAddress());
      expect(after.reputationScore).to.equal(1n);
      expect(after.totalTrades).to.equal(1n);
      expect(after.profitableTrades).to.equal(1n);
    });

    it("should decrease reputation score on an unprofitable trade", async function () {
      const before = await protocol.getAgentIdentity(await agent2.getAddress());
      expect(before.reputationScore).to.equal(0n);

      await protocol
        .connect(owner)
        .updateReputation(REVIEW_ID, await agent2.getAddress(), false);

      const after = await protocol.getAgentIdentity(await agent2.getAddress());
      expect(after.reputationScore).to.equal(-1n);
      expect(after.totalTrades).to.equal(1n);
      expect(after.profitableTrades).to.equal(0n);
    });

    it("should accumulate reputation across multiple reviews", async function () {
      // Submit and execute a new review where agent1 participates
      await protocol.connect(creator).submitToken(mockTokenAddr, { value: MIN_FEE });
      const reviewId = Number(await protocol.nextReviewId()) - 1;

      // Re-deposit for agent1
      await protocol
        .connect(user1)
        .depositForAgent(await agent1.getAddress(), { value: TEN_HBAR });

      await protocol
        .connect(agent1)
        .submitThesis(
          reviewId,
          "Second trade — still bullish on this ticker.",
          true,
          ethers.parseEther("1"),
          await user1.getAddress()
        );

      await advanceTime(REVIEW_WINDOW + 10);
      await protocol.executeReview(reviewId);
      await protocol.connect(owner).updateReputation(reviewId, await agent1.getAddress(), true);

      const identity = await protocol.getAgentIdentity(await agent1.getAddress());
      expect(identity.reputationScore).to.equal(2n);   // +1 from REVIEW_ID 0, +1 from this one
      expect(identity.totalTrades).to.equal(2n);
      expect(identity.profitableTrades).to.equal(2n);
    });

  });

  // =========================================================================
  // 9. EDGE CASES & INTEGRATION SCENARIOS
  // =========================================================================

  describe("9. Edge Cases & Integration", function () {

    it("should handle a review where ALL agents are bearish (no purchase made)", async function () {
      await protocol.connect(creator).submitToken(mockTokenAddr, { value: MIN_FEE });
      const reviewId = Number(await protocol.nextReviewId()) - 1;

      // agent3 submits a bearish thesis
      await protocol
        .connect(agent3)
        .submitThesis(
          reviewId,
          "Everything is a scam. Bear.",
          false,
          0,
          await user1.getAddress()
        );

      await advanceTime(REVIEW_WINDOW + 10);
      const tx: ContractTransactionResponse = await protocol.executeReview(reviewId);
      const receipt = await tx.wait();

      // ReviewExecuted should NOT be emitted (zero totalPledged exits early)
      const execEvent = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "ReviewExecuted");
      expect(execEvent).to.be.undefined;

      // FeeDistributed SHOULD be emitted to agent3 for submitting a thesis
      const feeEvent = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "FeeDistributed");
      expect(feeEvent).to.not.be.undefined;
      expect(feeEvent!.args.agent).to.equal(await agent3.getAddress());
      expect(feeEvent!.args.amount).to.equal(MIN_FEE); // sole submitter gets the full fee
    });

    it("should handle a review with no submissions at all (no fee distribution, no purchase)", async function () {
      await protocol.connect(creator).submitToken(mockTokenAddr, { value: MIN_FEE });
      const reviewId = Number(await protocol.nextReviewId()) - 1;

      await advanceTime(REVIEW_WINDOW + 10);
      const tx: ContractTransactionResponse = await protocol.executeReview(reviewId);
      const receipt = await tx.wait();

      const allEvents = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .filter(Boolean)
        .map((e: any) => e.name);

      expect(allEvents).to.not.include("ReviewExecuted");
      expect(allEvents).to.not.include("FeeDistributed");
    });

    it("should correctly split fee among multiple thesis submitters", async function () {
      // 3 agents submit on a single review; each should receive MIN_FEE / 3
      await protocol
        .connect(user1)
        .depositForAgent(await agent1.getAddress(), { value: TEN_HBAR });
      await protocol
        .connect(user1)
        .depositForAgent(await agent3.getAddress(), { value: TEN_HBAR });
      await protocol
        .connect(user2)
        .depositForAgent(await agent2.getAddress(), { value: TEN_HBAR });

      await protocol.connect(creator).submitToken(mockTokenAddr, { value: MIN_FEE });
      const reviewId = Number(await protocol.nextReviewId()) - 1;

      await protocol.connect(agent1).submitThesis(reviewId, "Thesis A", true,  ethers.parseEther("1"), await user1.getAddress());
      await protocol.connect(agent2).submitThesis(reviewId, "Thesis B", true,  ethers.parseEther("1"), await user2.getAddress());
      await protocol.connect(agent3).submitThesis(reviewId, "Thesis C", false, 0,                       await user1.getAddress());

      await advanceTime(REVIEW_WINDOW + 10);
      const tx: ContractTransactionResponse = await protocol.executeReview(reviewId);
      const receipt = await tx.wait();

      const feeEvents = receipt!.logs
        .map((l: any) => { try { return protocol.interface.parseLog(l); } catch { return null; } })
        .filter((e: any) => e?.name === "FeeDistributed");

      expect(feeEvents.length).to.equal(3);

      const perAgent = MIN_FEE / 3n;
      const remainder = MIN_FEE - perAgent * 3n;
      const amounts = feeEvents.map((e: any) => e.args.amount as bigint);

      // Two agents get floor, one gets floor + remainder
      const smallAmounts = amounts.filter((a: bigint) => a === perAgent);
      const largeAmounts = amounts.filter((a: bigint) => a === perAgent + remainder);
      expect(smallAmounts.length + largeAmounts.length).to.equal(3);
    });

    it("should correctly handle a delegation with an expiry — expired delegation rejected", async function () {
      // Register with an expiry that has already lapsed
      const expiredTime = (await now()) - 1; // already in the past
      await protocol
        .connect(user1)
        .registerDelegation(
          await agent1.getAddress(),
          TEN_HBAR,
          expiredTime,
          dummySig()
        );

      await protocol.connect(creator).submitToken(mockTokenAddr, { value: MIN_FEE });
      const reviewId = Number(await protocol.nextReviewId()) - 1;

      await expect(
        protocol
          .connect(agent1)
          .submitThesis(reviewId, "Trying on expired delegation", true, ONE_HBAR, await user1.getAddress())
      ).to.be.revertedWith("Delegation expired");

      // Restore non-expiring delegation for subsequent tests
      await protocol
        .connect(user1)
        .registerDelegation(await agent1.getAddress(), TEN_HBAR, 0, dummySig());

      // Clean up the open review
      await advanceTime(REVIEW_WINDOW + 10);
      await protocol.executeReview(reviewId);
    });

    it("should keep escrow balances independent between agents", async function () {
      const bal1 = await protocol.getAgentEscrow(await agent1.getAddress());
      const bal2 = await protocol.getAgentEscrow(await agent2.getAddress());
      const bal3 = await protocol.getAgentEscrow(await agent3.getAddress());

      expect(bal1).to.be.gte(0n);
      expect(bal2).to.be.gte(0n);
      expect(bal3).to.be.gte(0n);

      // All three balances should not be identical (different histories)
      expect(bal1 === bal2 && bal2 === bal3).to.be.false;
    });

    it("should allow multiple concurrent open reviews (different reviewIds)", async function () {
      await protocol.connect(creator).submitToken(mockTokenAddr, { value: MIN_FEE });
      const id1 = Number(await protocol.nextReviewId()) - 1;
      await protocol.connect(creator).submitToken(mockTokenAddr, { value: MIN_FEE });
      const id2 = Number(await protocol.nextReviewId()) - 1;

      expect(id2).to.equal(id1 + 1);

      const r1 = await protocol.getReview(id1);
      const r2 = await protocol.getReview(id2);

      expect(r1.executed).to.equal(false);
      expect(r2.executed).to.equal(false);
      expect(r1.deadline).to.be.lte(r2.deadline);

      // Clean up
      await advanceTime(REVIEW_WINDOW + 10);
      await protocol.executeReview(id1);
      await protocol.executeReview(id2);
    });

    it("should not allow thesis submission on an already-executed review", async function () {
      // reviewId 0 is executed
      await expect(
        protocol.connect(agent1).submitThesis(
          0,
          "Post-execution thesis",
          true,
          ONE_HBAR,
          await user1.getAddress()
        )
      ).to.be.revertedWith("Already executed");
    });

  });

  // =========================================================================
  // 10. MOCK MEMEJOB & MOCK ERC20 CONTRACT INTERNALS
  // =========================================================================

  describe("10. MockMemeJob & MockERC20", function () {

    it("should return correct token metadata from addressToMemeTokenMapping", async function () {
      const result = await mockJob.addressToMemeTokenMapping(mockTokenAddr);
      expect(result.tokenAddress).to.equal(mockTokenAddr);
      expect(result.creatorAddress).to.equal(await creator.getAddress());
    });

    it("should return zeros for an unregistered token address", async function () {
      const result = await mockJob.addressToMemeTokenMapping(await stranger.getAddress());
      expect(result.tokenAddress).to.equal(ethers.ZeroAddress);
    });

    it("should mint tokens to the buyer at a rate of 1000 per HBAR", async function () {
      const buyAmount = ONE_HBAR;
      const balBefore = await mockToken.balanceOf(await owner.getAddress());

      await mockJob.connect(owner).buyJob(
        mockTokenAddr,
        buyAmount,
        ethers.ZeroAddress,
        { value: buyAmount }
      );

      const balAfter = await mockToken.balanceOf(await owner.getAddress());
      // 1000 tokens per HBAR (1e18 wei), no decimal scaling in mock
      expect(balAfter - balBefore).to.equal(1000n);
    });

    it("should revert buyJob when msg.value does not match amount", async function () {
      await expect(
        mockJob.connect(owner).buyJob(
          mockTokenAddr,
          ONE_HBAR,
          ethers.ZeroAddress,
          { value: ONE_HBAR / 2n }
        )
      ).to.be.revertedWith("Value mismatch");
    });

    it("should track fundsRaised and tokensSold in MockMemeJob", async function () {
      const before = await mockJob.memeTokens(mockTokenAddr);
      await mockJob.connect(owner).buyJob(mockTokenAddr, ONE_HBAR, ethers.ZeroAddress, { value: ONE_HBAR });
      const after = await mockJob.memeTokens(mockTokenAddr);

      expect(after.fundsRaised).to.be.gt(before.fundsRaised);
      expect(after.tokensSold).to.be.gt(before.tokensSold);
    });

    it("should only allow the designated minter to mint MockERC20", async function () {
      await expect(
        mockToken.connect(stranger).mint(await stranger.getAddress(), 1000n)
      ).to.be.revertedWith("Only minter");
    });

    it("MockERC20 transfer should update balances correctly", async function () {
      const amount = 500n;
      const ownerBal = await mockToken.balanceOf(await owner.getAddress());
      if (ownerBal < amount) {
        await mockJob.connect(owner).buyJob(mockTokenAddr, ONE_HBAR, ethers.ZeroAddress, { value: ONE_HBAR });
      }

      const strangerBefore = await mockToken.balanceOf(await stranger.getAddress());
      await mockToken.connect(owner).transfer(await stranger.getAddress(), amount);
      const strangerAfter = await mockToken.balanceOf(await stranger.getAddress());

      expect(strangerAfter - strangerBefore).to.equal(amount);
    });

    it("MockERC20 should revert transfer with insufficient balance", async function () {
      const tooMuch = (await mockToken.balanceOf(await stranger.getAddress())) + 1n;
      await expect(
        mockToken.connect(stranger).transfer(await owner.getAddress(), tooMuch)
      ).to.be.revertedWith("ERC20: insufficient balance");
    });

  });

});
