// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISafe {
    function isOwner(address owner) external view returns (bool);
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
 *         on behalf of a Safe with enforced rate limits.
 */
contract SafePortfolioModule is ReentrancyGuard {
    // Structs
    struct RateLimit {
        uint256 maxAmount;      // Maximum amount per time window
        uint256 windowDuration; // Time window in seconds
        uint256 lastResetTime;  // Timestamp of last window reset
        uint256 spentInWindow;  // Amount spent in current window
    }

    // ============ Immutable State ============
    /// @dev Address of the Safe contract this module is attached to
    address private immutable i_safe;

    // ============ Storage State ============
    /// @dev Address of the trusted relayer authorized to execute transactions
    address private s_trustedRelayer;

    /// @dev Rate limits per token (address(0) = ETH)
    mapping(address => RateLimit) private s_rateLimits;

    // Events
    event ExecutionSuccess(
        address indexed to,
        uint256 value,
        bytes data
    );

    event RateLimitSet(
        address indexed token,
        uint256 maxAmount,
        uint256 windowDuration,
        address indexed setter
    );

    event RateLimitConsumed(
        address indexed token,
        uint256 amount,
        uint256 spentInWindow,
        uint256 remainingInWindow
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
    error RateLimitExceeded();
    error ModuleExecutionFailed();

    /**
     * @notice Modifier to ensure only Safe owners can call certain functions
     */
    modifier onlySafeOwner() {
        if (!ISafe(i_safe).isOwner(msg.sender)) {
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
     * @param _safe Address of the Safe contract
     * @param _trustedRelayer Address of the trusted relayer
     */
    constructor(address _safe, address _trustedRelayer) {
        if (_safe == address(0)) {
            revert InvalidSafe();
        }
        if (_trustedRelayer == address(0)) {
            revert InvalidRelayer();
        }
        i_safe = _safe;
        s_trustedRelayer = _trustedRelayer;
    }

    // ============ Getter Functions ============

    /**
     * @notice Get the Safe contract address
     * @return Address of the Safe contract
     */
    function getSafe() external view returns (address) {
        return i_safe;
    }

    /**
     * @notice Get the trusted relayer address
     * @return Address of the trusted relayer
     */
    function getTrustedRelayer() external view returns (address) {
        return s_trustedRelayer;
    }

    /**
     * @notice Get the rate limit for a specific token
     * @param token Token address (address(0) for ETH)
     * @return rateLimit The RateLimit struct for the token
     */
    function getRateLimit(address token) external view returns (RateLimit memory) {
        return s_rateLimits[token];
    }

    // ============ Owner Functions ============

    /**
     * @notice Set rate limit for a specific token
     * @param token Token address (address(0) for ETH)
     * @param maxAmount Maximum amount that can be spent in the time window
     * @param windowDuration Duration of the time window in seconds
     */
    function setRateLimit(
        address token,
        uint256 maxAmount,
        uint256 windowDuration
    ) external onlySafeOwner {
        if (windowDuration == 0) {
            revert InvalidRateLimit();
        }

        s_rateLimits[token] = RateLimit({
            maxAmount: maxAmount,
            windowDuration: windowDuration,
            lastResetTime: block.timestamp,
            spentInWindow: 0
        });

        emit RateLimitSet(token, maxAmount, windowDuration, msg.sender);
    }

    /**
     * @notice Update the trusted relayer address
     * @param newRelayer New trusted relayer address
     */
    function setTrustedRelayer(address newRelayer) external onlySafeOwner {
        if (newRelayer == address(0)) {
            revert InvalidRelayer();
        }
        address oldRelayer = s_trustedRelayer;
        s_trustedRelayer = newRelayer;
        emit RelayerUpdated(oldRelayer, newRelayer);
    }

    /**
     * @notice Reset rate limit window for a token (owner only)
     * @param token Token address (address(0) for ETH)
     */
    function resetRateLimitWindow(address token) external onlySafeOwner {
        RateLimit storage limit = s_rateLimits[token];
        limit.lastResetTime = block.timestamp;
        limit.spentInWindow = 0;

        emit RateLimitConsumed(token, 0, 0, limit.maxAmount);
    }

    // ============ Relayer Functions ============

    /**
     * @notice Execute a transaction from the Safe (only callable by trusted relayer)
     * @param to Destination address
     * @param value ETH value to send
     * @param data Transaction data
     */
    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyTrustedRelayer nonReentrant {
        // Check and update rate limits
        _checkAndUpdateRateLimit(to, value, data);

        // Execute transaction from module
        bool success = ISafe(i_safe).execTransactionFromModule(
            to,
            value,
            data,
            0 // 0 = Call operation
        );

        if (!success) {
            revert ModuleExecutionFailed();
        }

        emit ExecutionSuccess(to, value, data);
    }

    // ============ View Functions ============

    /**
     * @notice Get remaining allowance in current window for a token
     * @param token Token address (address(0) for ETH)
     * @return remaining Amount remaining in current window
     */
    function getRemainingInWindow(address token) external view returns (uint256 remaining) {
        RateLimit storage limit = s_rateLimits[token];

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
     * @notice Get rate limit info for a token
     * @param token Token address (address(0) for ETH)
     * @return maxAmount Maximum amount per window
     * @return windowDuration Duration of time window in seconds
     * @return lastResetTime Timestamp of last window reset
     * @return spentInWindow Amount spent in current window
     * @return timeUntilReset Seconds until window resets
     */
    function getRateLimitInfo(address token) external view returns (
        uint256 maxAmount,
        uint256 windowDuration,
        uint256 lastResetTime,
        uint256 spentInWindow,
        uint256 timeUntilReset
    ) {
        RateLimit storage limit = s_rateLimits[token];

        maxAmount = limit.maxAmount;
        windowDuration = limit.windowDuration;
        lastResetTime = limit.lastResetTime;
        spentInWindow = limit.spentInWindow;

        uint256 windowEnd = limit.lastResetTime + limit.windowDuration;
        if (block.timestamp >= windowEnd) {
            timeUntilReset = 0; // Window already expired
        } else {
            timeUntilReset = windowEnd - block.timestamp;
        }
    }

    // ============ Internal Functions ============

    /**
     * @notice Check if the transaction respects rate limits and update spent amounts
     * @param to Destination address
     * @param value ETH value to send
     * @param data Transaction data
     */
    function _checkAndUpdateRateLimit(
        address to,
        uint256 value,
        bytes calldata data
    ) internal {
        // Handle ETH transfers
        if (value > 0) {
            _consumeRateLimit(address(0), value);
        }

        // Handle ERC20 transfers
        if (data.length >= 68) {
            bytes4 selector = bytes4(data[:4]);

            // Check for ERC20 transfer or transferFrom
            if (selector == IERC20.transfer.selector ||
                selector == IERC20.transferFrom.selector) {

                address token = to;
                uint256 amount;

                if (selector == IERC20.transfer.selector) {
                    // transfer(address to, uint256 amount)
                    (, amount) = abi.decode(data[4:], (address, uint256));
                } else {
                    // transferFrom(address from, address to, uint256 amount)
                    (,, amount) = abi.decode(data[4:], (address, address, uint256));
                }

                _consumeRateLimit(token, amount);
            }
        }
    }

    /**
     * @notice Consume from the rate limit for a token
     * @param token Token address (address(0) for ETH)
     * @param amount Amount to consume
     */
    function _consumeRateLimit(address token, uint256 amount) internal {
        RateLimit storage limit = s_rateLimits[token];

        // Skip if no rate limit is set
        if (limit.maxAmount == 0) {
            return;
        }

        // Check if we need to reset the window
        if (block.timestamp >= limit.lastResetTime + limit.windowDuration) {
            limit.lastResetTime = block.timestamp;
            limit.spentInWindow = 0;
        }

        // Check if adding this amount would exceed the limit
        if (limit.spentInWindow + amount > limit.maxAmount) {
            revert RateLimitExceeded();
        }

        // Update spent amount
        limit.spentInWindow += amount;

        emit RateLimitConsumed(
            token,
            amount,
            limit.spentInWindow,
            limit.maxAmount - limit.spentInWindow
        );
    }
}
