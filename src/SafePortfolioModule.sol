// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISafe {
    function isOwner(address owner) external view returns (bool);
    function isModuleEnabled(address module) external view returns (bool);
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        uint8 operation
    ) external returns (bool success);
}

/**
 * @title SafePortfolioModule
 * @notice A Safe module that allows a trusted relayer to execute transactions
 *         on behalf of multiple Safes with per-Safe configuration and enforced rate limits.
 */
contract SafePortfolioModule is ReentrancyGuard {
    // Structs
    struct RateLimit {
        uint256 maxAmount;      // Maximum amount per time window
        uint256 windowDuration; // Time window in seconds
        uint256 lastResetTime;  // Timestamp of last window reset
        uint256 spentInWindow;  // Amount spent in current window
    }

    struct SafeConfig {
        mapping(address => RateLimit) rateLimits;                         // Rate limits per token (address(0) = ETH)
        mapping(address => mapping(bytes4 => bool)) allowedActions;       // Whitelist: target -> functionSelector -> allowed
        mapping(address => bool) whitelistedActions;                      // If true, all functions allowed for target
        bool allTargetsAllowed;                                           // If true, all targets and functions are allowed
        address[] tokensWithRateLimits;                                   // Array of tokens that have rate limits configured
        mapping(address => bool) hasRateLimit;                            // Quick lookup for tokens with rate limits
    }

    // ============ Storage State ============
    /// @dev Address of the trusted relayer authorized to execute transactions
    address private s_trustedRelayer;

    /// @dev Configuration per Safe address
    mapping(address => SafeConfig) private s_safeConfigs;

    // Events
    event ExecutionSuccess(
        address indexed safe,
        address indexed to,
        uint256 value,
        bytes data
    );

    event RateLimitSet(
        address indexed safe,
        address indexed token,
        uint256 maxAmount,
        uint256 windowDuration,
        address indexed setter
    );

    event RateLimitConsumed(
        address indexed safe,
        address indexed token,
        uint256 amount,
        uint256 spentInWindow,
        uint256 remainingInWindow
    );

    event ActionAllowed(
        address indexed safe,
        address indexed target,
        bytes4 indexed functionSelector,
        address allowedBy
    );

    event ActionDisallowed(
        address indexed safe,
        address indexed target,
        bytes4 indexed functionSelector,
        address disallowedBy
    );

    event AllFunctionsToggledForTarget(
        address indexed safe,
        address indexed target,
        bool allowed,
        address indexed toggledBy
    );

    event AllTargetsToggled(
        address indexed safe,
        bool allowed,
        address indexed toggledBy
    );

    event RelayerUpdated(
        address indexed oldRelayer,
        address indexed newRelayer
    );

    // Errors
    error InvalidSafe();
    error InvalidRelayer();
    error InvalidRateLimit();
    error NotSafeOwner();
    error NotTrustedRelayer();
    error ModuleNotEnabled();
    error ActionNotAllowed();
    error RateLimitExceeded();
    error ModuleExecutionFailed();

    /**
     * @notice Modifier to ensure only Safe owners can call certain functions
     * @param safe Address of the Safe to check ownership for
     */
    modifier onlySafeOwner(address safe) {
        if (safe.code.length == 0) {
            revert InvalidSafe();
        }
        if (!ISafe(safe).isOwner(msg.sender)) {
            revert NotSafeOwner();
        }
        _;
    }

    /**
     * @notice Modifier to ensure only trusted relayer can execute
     */
    modifier onlyTrustedRelayer() {
        if (msg.sender != s_trustedRelayer) {
            revert NotTrustedRelayer();
        }
        _;
    }

    /**
     * @notice Constructor
     * @param _trustedRelayer Address of the trusted relayer
     */
    constructor(address _trustedRelayer) {
        if (_trustedRelayer == address(0)) {
            revert InvalidRelayer();
        }
        s_trustedRelayer = _trustedRelayer;
    }

    // ============ Getter Functions ============

    /**
     * @notice Get the trusted relayer address
     * @return Address of the trusted relayer
     */
    function getTrustedRelayer() external view returns (address) {
        return s_trustedRelayer;
    }

    /**
     * @notice Check if all targets are allowed for a Safe
     * @param safe Address of the Safe
     * @return Whether all targets are allowed
     */
    function areAllTargetsAllowed(address safe) external view returns (bool) {
        return s_safeConfigs[safe].allTargetsAllowed;
    }

    /**
     * @notice Check if an action (target + function) is allowed for a Safe
     * @param safe Address of the Safe
     * @param target Address of the target contract
     * @param functionSelector Function selector to check
     * @return Whether the action is allowed
     */
    function isActionAllowed(
        address safe,
        address target,
        bytes4 functionSelector
    ) external view returns (bool) {
        SafeConfig storage config = s_safeConfigs[safe];
        return config.allTargetsAllowed ||
               config.whitelistedActions[target] ||
               config.allowedActions[target][functionSelector];
    }

    /**
     * @notice Get the rate limit for a specific token on a Safe
     * @param safe Address of the Safe
     * @param token Token address (address(0) for ETH)
     * @return rateLimit The RateLimit struct for the token
     */
    function getRateLimit(address safe, address token) external view returns (RateLimit memory) {
        return s_safeConfigs[safe].rateLimits[token];
    }

    // ============ Safe Owner Functions ============

    /**
     * @notice Set rate limit for a specific token on a Safe
     * @param safe Address of the Safe
     * @param token Token address (address(0) for ETH)
     * @param maxAmount Maximum amount that can be spent in the time window
     * @param windowDuration Duration of the time window in seconds
     */
    function setRateLimit(
        address safe,
        address token,
        uint256 maxAmount,
        uint256 windowDuration
    ) external onlySafeOwner(safe) {
        if (windowDuration == 0) {
            revert InvalidRateLimit();
        }

        SafeConfig storage config = s_safeConfigs[safe];

        // Add token to tracking array if not already present
        if (!config.hasRateLimit[token]) {
            config.tokensWithRateLimits.push(token);
            config.hasRateLimit[token] = true;
        }

        config.rateLimits[token] = RateLimit({
            maxAmount: maxAmount,
            windowDuration: windowDuration,
            lastResetTime: block.timestamp,
            spentInWindow: 0
        });

        emit RateLimitSet(safe, token, maxAmount, windowDuration, msg.sender);
    }

    /**
     * @notice Allow a specific action (target + function) for a Safe
     * @param safe Address of the Safe
     * @param target Target contract address
     * @param functionSelector Function selector (e.g., bytes4(keccak256("transfer(address,uint256)")))
     */
    function allowAction(
        address safe,
        address target,
        bytes4 functionSelector
    ) external onlySafeOwner(safe) {
        s_safeConfigs[safe].allowedActions[target][functionSelector] = true;
        emit ActionAllowed(safe, target, functionSelector, msg.sender);
    }

    /**
     * @notice Disallow a specific action (target + function) for a Safe
     * @param safe Address of the Safe
     * @param target Target contract address
     * @param functionSelector Function selector
     */
    function disallowAction(
        address safe,
        address target,
        bytes4 functionSelector
    ) external onlySafeOwner(safe) {
        s_safeConfigs[safe].allowedActions[target][functionSelector] = false;
        emit ActionDisallowed(safe, target, functionSelector, msg.sender);
    }

    /**
     * @notice Allow all functions for a specific target contract
     * @param safe Address of the Safe
     * @param target Target contract address
     * @param allowed Whether to allow all functions
     */
    function setAllFunctionsAllowedForTarget(
        address safe,
        address target,
        bool allowed
    ) external onlySafeOwner(safe) {
        s_safeConfigs[safe].whitelistedActions[target] = allowed;
        emit AllFunctionsToggledForTarget(safe, target, allowed, msg.sender);
    }

    /**
     * @notice Toggle whether all targets are allowed for a Safe
     * @param safe Address of the Safe
     * @param allowed Whether to allow all targets
     */
    function setAllTargetsAllowed(address safe, bool allowed) external onlySafeOwner(safe) {
        s_safeConfigs[safe].allTargetsAllowed = allowed;
        emit AllTargetsToggled(safe, allowed, msg.sender);
    }

    /**
     * @notice Reset rate limit window for a token on a Safe (owner only)
     * @param safe Address of the Safe
     * @param token Token address (address(0) for ETH)
     */
    function resetRateLimitWindow(address safe, address token) external onlySafeOwner(safe) {
        RateLimit storage limit = s_safeConfigs[safe].rateLimits[token];
        limit.lastResetTime = block.timestamp;
        delete limit.spentInWindow;

        emit RateLimitConsumed(safe, token, 0, 0, limit.maxAmount);
    }

    // ============ Module Owner Functions ============

    /**
     * @notice Update the trusted relayer address (only callable by current relayer)
     * @param newRelayer New trusted relayer address
     */
    function setTrustedRelayer(address newRelayer) external onlyTrustedRelayer {
        if (newRelayer == address(0)) {
            revert InvalidRelayer();
        }
        address oldRelayer = s_trustedRelayer;
        s_trustedRelayer = newRelayer;
        emit RelayerUpdated(oldRelayer, newRelayer);
    }

    // ============ Relayer Functions ============

    /**
     * @notice Execute a transaction from a Safe (only callable by trusted relayer)
     * @param safe Address of the Safe to execute from
     * @param to Destination address
     * @param value ETH value to send
     * @param data Transaction data
     */
    function execute(
        address safe,
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyTrustedRelayer nonReentrant {
        // Verify safe is a contract
        if (safe.code.length == 0) {
            revert InvalidSafe();
        }

        // Verify this module is enabled on the Safe
        if (!ISafe(safe).isModuleEnabled(address(this))) {
            revert ModuleNotEnabled();
        }

        SafeConfig storage config = s_safeConfigs[safe];

        // Extract function selector from data (if data exists)
        bytes4 functionSelector;
        if (data.length >= 4) {
            functionSelector = bytes4(data[:4]);
        }

        // Check if action (target + function) is allowed
        bool actionAllowed = config.allTargetsAllowed ||
                             config.whitelistedActions[to] ||
                             (data.length >= 4 && config.allowedActions[to][functionSelector]);

        if (!actionAllowed) {
            revert ActionNotAllowed();
        }

        // Snapshot balances before execution
        uint256[] memory balancesBefore = _snapshotBalances(safe, config);

        // Execute transaction from module
        bool success = ISafe(safe).execTransactionFromModule(
            to,
            value,
            data,
            0 // 0 = Call operation
        );

        if (!success) {
            revert ModuleExecutionFailed();
        }

        // Check and update rate limits based on balance changes
        _checkAndUpdateRateLimits(safe, config, balancesBefore);

        emit ExecutionSuccess(safe, to, value, data);
    }

    // ============ View Functions ============

    /**
     * @notice Get remaining allowance in current window for a token on a Safe
     * @param safe Address of the Safe
     * @param token Token address (address(0) for ETH)
     * @return remaining Amount remaining in current window
     */
    function getRemainingInWindow(address safe, address token) external view returns (uint256 remaining) {
        RateLimit storage limit = s_safeConfigs[safe].rateLimits[token];

        if (limit.maxAmount == 0) {
            return type(uint256).max; // No limit set
        }

        // Check if window has expired
        if (block.timestamp >= limit.lastResetTime + limit.windowDuration) {
            return limit.maxAmount; // Full amount available in new window
        }

        if (limit.spentInWindow >= limit.maxAmount) {
            return 0;
        }

        return limit.maxAmount - limit.spentInWindow;
    }

    /**
     * @notice Get rate limit info for a token on a Safe
     * @param safe Address of the Safe
     * @param token Token address (address(0) for ETH)
     * @return maxAmount Maximum amount per window
     * @return windowDuration Duration of time window in seconds
     * @return lastResetTime Timestamp of last window reset
     * @return spentInWindow Amount spent in current window
     * @return timeUntilReset Seconds until window resets
     */
    function getRateLimitInfo(address safe, address token) external view returns (
        uint256 maxAmount,
        uint256 windowDuration,
        uint256 lastResetTime,
        uint256 spentInWindow,
        uint256 timeUntilReset
    ) {
        RateLimit storage limit = s_safeConfigs[safe].rateLimits[token];

        maxAmount = limit.maxAmount;
        windowDuration = limit.windowDuration;
        lastResetTime = limit.lastResetTime;
        spentInWindow = limit.spentInWindow;

        uint256 windowEnd = limit.lastResetTime + limit.windowDuration;
        if (block.timestamp >= windowEnd) {
            delete timeUntilReset; // Window already expired
        } else {
            timeUntilReset = windowEnd - block.timestamp;
        }
    }

    // ============ Internal Functions ============

    /**
     * @notice Snapshot balances of all tokens with rate limits for a Safe
     * @param safe Address of the Safe
     * @param config SafeConfig storage reference
     * @return balances Array of balances before transaction
     */
    function _snapshotBalances(
        address safe,
        SafeConfig storage config
    ) internal view returns (uint256[] memory balances) {
        uint256 tokenCount = config.tokensWithRateLimits.length;
        balances = new uint256[](tokenCount);

        for (uint256 i = 0; i < tokenCount; i++) {
            address token = config.tokensWithRateLimits[i];
            if (token == address(0)) {
                // ETH balance
                balances[i] = safe.balance;
            } else {
                // ERC20 balance
                balances[i] = IERC20(token).balanceOf(safe);
            }
        }
    }

    /**
     * @notice Check if balance changes respect rate limits and update spent amounts
     * @param safe Address of the Safe
     * @param config SafeConfig storage reference
     * @param balancesBefore Array of balances before transaction
     */
    function _checkAndUpdateRateLimits(
        address safe,
        SafeConfig storage config,
        uint256[] memory balancesBefore
    ) internal {
        uint256 tokenCount = config.tokensWithRateLimits.length;

        for (uint256 i = 0; i < tokenCount; i++) {
            address token = config.tokensWithRateLimits[i];
            uint256 balanceBefore = balancesBefore[i];
            uint256 balanceAfter;

            if (token == address(0)) {
                // ETH balance
                balanceAfter = safe.balance;
            } else {
                // ERC20 balance
                balanceAfter = IERC20(token).balanceOf(safe);
            }

            // Check if balance decreased (tokens were spent)
            if (balanceAfter < balanceBefore) {
                uint256 spent = balanceBefore - balanceAfter;
                _consumeRateLimit(safe, token, spent);
            }
        }
    }

    /**
     * @notice Consume from the rate limit for a token on a Safe
     * @param safe Address of the Safe
     * @param token Token address (address(0) for ETH)
     * @param amount Amount to consume
     */
    function _consumeRateLimit(address safe, address token, uint256 amount) internal {
        RateLimit storage limit = s_safeConfigs[safe].rateLimits[token];

        // Skip if no rate limit is set
        if (limit.maxAmount == 0) {
            return;
        }

        // Check if we need to reset the window
        if (block.timestamp >= limit.lastResetTime + limit.windowDuration) {
            limit.lastResetTime = block.timestamp;
            delete limit.spentInWindow;
        }

        // Check if adding this amount would exceed the limit
        if (limit.spentInWindow + amount > limit.maxAmount) {
            revert RateLimitExceeded();
        }

        // Update spent amount
        limit.spentInWindow += amount;

        emit RateLimitConsumed(
            safe,
            token,
            amount,
            limit.spentInWindow,
            limit.maxAmount - limit.spentInWindow
        );
    }
}
