// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Test-only stand-in for the Agent ID registry.
///         Lets local tests grant/revoke "Agent ID" balances freely.
///         Never deployed to mainnet.
contract MockAgentId {
    mapping(address => uint256) public balanceOf;

    function setBalance(address account, uint256 amount) external {
        balanceOf[account] = amount;
    }
}
