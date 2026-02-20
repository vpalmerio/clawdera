// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/**
 * @title MockMemeJob
 * @notice Local test double for the MemeJob protocol.
 *         Simulates buyJob by minting mock ERC-20 tokens to the caller
 *         at a fixed exchange rate of 1000 tokens per 1 HBAR (1e18 wei).
 *         When deployed to Hedera testnet, replace this address with the
 *         real MemeJob contract address.
 */
contract MockMemeJob {

    // Simple mock token registry
    mapping(address => MemeToken) public memeTokens;

    struct MemeToken {
        address tokenAddress;
        address creatorAddress;
        uint256 fundsRaised;
        uint256 tokensSold;
        address firstBuyer;
        bool    distributeRewards;
    }

    event BuyJobCalled(
        address indexed memeAddress,
        uint256 amount,
        address referrer,
        address buyer,
        uint256 tokensIssued
    );

    /// @notice Register a fake meme token so the protocol can find it
    function registerMockToken(address tokenAddress, address creator) external {
        memeTokens[tokenAddress] = MemeToken({
            tokenAddress:      tokenAddress,
            creatorAddress:    creator,
            fundsRaised:       0,
            tokensSold:        0,
            firstBuyer:        address(0),
            distributeRewards: false
        });
    }

    /// @notice Simulate addressToMemeTokenMapping view
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
        )
    {
        MemeToken storage m = memeTokens[token];
        return (
            m.tokenAddress,
            m.creatorAddress,
            m.fundsRaised,
            m.tokensSold,
            m.firstBuyer,
            m.distributeRewards
        );
    }

    /**
     * @notice Simulate buyJob: transfers mock tokens to msg.sender.
     *         Rate: 1000 mock tokens per 1 HBAR (1e18 wei).
     *         The mock token must be a MockERC20 that allows minting.
     */
    function buyJob(
        address memeAddress,
        uint256 amount,
        address referrer
    ) external payable {
        require(memeTokens[memeAddress].tokenAddress != address(0), "Token not registered");
        require(msg.value == amount, "Value mismatch");

        uint256 tokensToIssue = (msg.value * 1000) / 1 ether;
        if (tokensToIssue == 0) tokensToIssue = 1; // floor of 1

        memeTokens[memeAddress].fundsRaised += msg.value;
        memeTokens[memeAddress].tokensSold  += tokensToIssue;

        if (memeTokens[memeAddress].firstBuyer == address(0)) {
            memeTokens[memeAddress].firstBuyer = msg.sender;
        }

        // Mint tokens directly to caller (the protocol contract)
        MockERC20(memeAddress).mint(msg.sender, tokensToIssue);

        emit BuyJobCalled(memeAddress, amount, referrer, msg.sender, tokensToIssue);
    }

    receive() external payable {}
}

/**
 * @title MockERC20
 * @notice Minimal ERC-20 with open mint for testing purposes only.
 */
contract MockERC20 {
    string  public name;
    string  public symbol;
    uint8   public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public minter; // MockMemeJob address

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, address _minter) {
        name   = _name;
        symbol = _symbol;
        minter = _minter;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Only minter");
        totalSupply      += amount;
        balanceOf[to]    += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "ERC20: allowance exceeded");
        require(balanceOf[from] >= amount, "ERC20: insufficient balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
