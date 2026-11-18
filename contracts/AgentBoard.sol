// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal view of the Agent ID registry (SPACE ID, BNB Chain).
///         An address holds an Agent ID when balanceOf(address) > 0.
interface IAgentId {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title AgentBoard — the on-chain board for Agent ID holders
/// @notice A public directory, daily check-in board and endorsement ring
///         exclusively for holders of an Agent ID (name.ai).
///
///         Agent ID is not a login bonus here; it is the membership key for
///         every action in the product:
///         - only Agent ID holders can register an agent profile,
///         - only Agent ID holders can check in and build a daily streak,
///         - only Agent ID holders can endorse other agents.
///
/// @dev The contract holds no funds, has no owner and no admin functions,
///      and can never move user assets. The Agent ID registry address is
///      set once at deployment (mainnet BNB Chain registry:
///      0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F).
contract AgentBoard {
    IAgentId public immutable agentId;

    struct Agent {
        string role; // short tag, e.g. "trader", "builder", "gamer"
        string uri; // link to the agent's home page / profile
        uint64 registeredAt;
        uint32 checkIns; // lifetime check-in count
        uint32 streak; // current consecutive-day streak
        uint64 lastCheckIn; // timestamp of the last check-in
        string lastMessage; // latest check-in message (the "board post")
        uint32 endorsements; // endorsements received from other agents
    }

    mapping(address => Agent) public agents;
    mapping(address => mapping(address => bool)) public hasEndorsed;
    address[] public agentList;

    uint256 public totalCheckIns;

    event Registered(address indexed agent, string role, string uri);
    event ProfileUpdated(address indexed agent, string role, string uri);
    event CheckedIn(address indexed agent, uint32 streak, string message);
    event Endorsed(address indexed from, address indexed to);

    constructor(address agentIdRegistry) {
        require(agentIdRegistry != address(0), "registry required");
        agentId = IAgentId(agentIdRegistry);
    }

    modifier onlyAgent() {
        require(agentId.balanceOf(msg.sender) > 0, "AgentBoard: no Agent ID");
        _;
    }

    /// @notice True when the address holds an Agent ID.
    function isAgent(address account) external view returns (bool) {
        return agentId.balanceOf(account) > 0;
    }

    /// @notice True when the address has registered a profile.
    function isRegistered(address account) public view returns (bool) {
        return agents[account].registeredAt != 0;
    }

    /// @notice Register a new agent profile, or update an existing one.
    /// @param role Short role tag (1-32 chars), e.g. "trader".
    /// @param uri Link to the agent's page (max 128 chars, may be empty).
    function register(string calldata role, string calldata uri) external onlyAgent {
        require(bytes(role).length > 0 && bytes(role).length <= 32, "role must be 1-32 chars");
        require(bytes(uri).length <= 128, "uri too long");
        Agent storage ag = agents[msg.sender];
        if (ag.registeredAt == 0) {
            ag.registeredAt = uint64(block.timestamp);
            agentList.push(msg.sender);
            emit Registered(msg.sender, role, uri);
        } else {
            emit ProfileUpdated(msg.sender, role, uri);
        }
        ag.role = role;
        ag.uri = uri;
    }

    /// @notice Post today's check-in message and grow the daily streak.
    ///         One check-in per UTC day. Checking in on consecutive days
    ///         increases the streak; missing a day resets it to 1.
    /// @param message Board message (max 140 chars, may be empty).
    function checkIn(string calldata message) external onlyAgent {
        require(isRegistered(msg.sender), "register first");
        require(bytes(message).length <= 140, "message too long");
        Agent storage ag = agents[msg.sender];
        uint256 today = block.timestamp / 1 days;
        uint256 lastDay = ag.lastCheckIn / 1 days;
        require(ag.lastCheckIn == 0 || today > lastDay, "already checked in today");
        if (ag.lastCheckIn != 0 && today == lastDay + 1) {
            ag.streak += 1;
        } else {
            ag.streak = 1;
        }
        ag.lastCheckIn = uint64(block.timestamp);
        ag.checkIns += 1;
        ag.lastMessage = message;
        totalCheckIns += 1;
        emit CheckedIn(msg.sender, ag.streak, message);
    }

    /// @notice Endorse another registered agent. One endorsement per pair.
    function endorse(address target) external onlyAgent {
        require(isRegistered(target), "target not registered");
        require(target != msg.sender, "cannot endorse yourself");
        require(!hasEndorsed[msg.sender][target], "already endorsed");
        hasEndorsed[msg.sender][target] = true;
        agents[target].endorsements += 1;
        emit Endorsed(msg.sender, target);
    }

    /// @notice Number of registered agents.
    function agentCount() external view returns (uint256) {
        return agentList.length;
    }

    /// @notice A page of registered agent addresses (limit capped at 50).
    function getAgents(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = agentList.length;
        if (offset >= total) return new address[](0);
        uint256 size = total - offset;
        if (size > limit) size = limit;
        if (size > 50) size = 50;
        page = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = agentList[offset + i];
        }
    }
}
