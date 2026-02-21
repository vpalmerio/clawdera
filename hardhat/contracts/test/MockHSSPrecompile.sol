// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/**
 * @dev Mock Hedera Schedule Service (HSS) precompile for local Hardhat testing.
 *
 *      The real HSS lives at address 0x16b on Hedera networks.  Because that
 *      address has no code on a local Hardhat EVM, any `address(0x16b).call(...)`
 *      returns `success = false`, causing AgentCoordProtocol.submitToken to
 *      revert with "scheduleCall failed".
 *
 *      In the test suite we inject this contract's bytecode at 0x16b using
 *      `hardhat_setCode` so that all calls to the HSS precompile succeed.
 *
 *      The fallback returns `abi.encode(int64(22), address(0x1))`, which
 *      HederaScheduleService decodes as (SUCCESS=22, dummyScheduleAddress).
 */
contract MockHSSPrecompile {
    // Catch every call regardless of selector and return SUCCESS + dummy addr
    fallback(bytes calldata) external returns (bytes memory) {
        return abi.encode(int64(22), address(0x1));
    }
}
