// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SafePortfolioModule} from "../src/SafePortfolioModule.sol";

/**
 * @title DeployAndConfigure
 * @notice Deployment script for SafePortfolioModule with Aave V3 and Euler vault configuration
 *
 * Usage:
 * forge script script/DeployAndConfigure.s.sol:DeployAndConfigure --rpc-url $RPC_URL --broadcast
 *
 * Required environment variables:
 * - AGENT_WALLET_ADDRESS: Address of the trusted relayer/agent
 * - SAFE_ADDRESS: Address of the Safe to configure
 * - DEPLOYER_PRIVATE_KEY: Private key for deployment (must be Safe owner)
 */
contract DeployAndConfigure is Script {
    // Aave V3 Mainnet addresses
    address constant AAVE_V3_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;

    // Euler V2 Mainnet addresses (placeholder - update with actual addresses)
    address constant EULER_VAULT_USDC = 0x0000000000000000000000000000000000000000; // TODO: Update
    address constant EULER_VAULT_USDT = 0x0000000000000000000000000000000000000000; // TODO: Update
    address constant EULER_VAULT_DAI = 0x0000000000000000000000000000000000000000;  // TODO: Update

    // Token addresses (Mainnet)
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // Function selectors for Aave V3
    bytes4 constant AAVE_DEPOSIT_SELECTOR = bytes4(keccak256("supply(address,uint256,address,uint16)"));
    bytes4 constant AAVE_WITHDRAW_SELECTOR = bytes4(keccak256("withdraw(address,uint256,address)"));
    bytes4 constant AAVE_BORROW_SELECTOR = bytes4(keccak256("borrow(address,uint256,uint256,uint16,address)"));
    bytes4 constant AAVE_REPAY_SELECTOR = bytes4(keccak256("repay(address,uint256,uint256,address)"));

    // Function selectors for Euler (ERC-4626 standard)
    bytes4 constant EULER_DEPOSIT_SELECTOR = bytes4(keccak256("deposit(uint256,address)"));
    bytes4 constant EULER_WITHDRAW_SELECTOR = bytes4(keccak256("withdraw(uint256,address,address)"));
    bytes4 constant EULER_MINT_SELECTOR = bytes4(keccak256("mint(uint256,address)"));
    bytes4 constant EULER_REDEEM_SELECTOR = bytes4(keccak256("redeem(uint256,address,address)"));

    SafePortfolioModule public module;

    function run() external {
        // Get environment variables
        address agentWallet = vm.envAddress("AGENT_WALLET_ADDRESS");
        address safe = vm.envAddress("SAFE_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        console.log("=== Deployment Configuration ===");
        console.log("Agent Wallet:", agentWallet);
        console.log("Safe Address:", safe);
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy SafePortfolioModule
        console.log("\n=== Deploying SafePortfolioModule ===");
        module = new SafePortfolioModule(agentWallet);
        console.log("SafePortfolioModule deployed at:", address(module));

        // 2. Configure Aave V3 actions
        console.log("\n=== Configuring Aave V3 Actions ===");
        _configureAaveV3(safe);

        // 3. Configure Euler vault actions (if addresses are set)
        if (EULER_VAULT_USDC != address(0)) {
            console.log("\n=== Configuring Euler Vault Actions ===");
            _configureEulerVaults(safe);
        } else {
            console.log("\n=== Skipping Euler Configuration (addresses not set) ===");
        }

        // 4. Set rate limits (optional - can be done separately)
        console.log("\n=== Setting Rate Limits ===");
        _setRateLimits(safe);

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("Next steps:");
        console.log("1. Enable this module on your Safe by calling:");
        console.log("   Safe.enableModule(", address(module), ")");
        console.log("2. Adjust rate limits as needed using setRateLimit()");
    }

    function _configureAaveV3(address safe) internal {
        console.log("Allowing Aave V3 supply (deposit)...");
        module.allowAction(safe, AAVE_V3_POOL, AAVE_DEPOSIT_SELECTOR);

        console.log("Allowing Aave V3 withdraw...");
        module.allowAction(safe, AAVE_V3_POOL, AAVE_WITHDRAW_SELECTOR);

        console.log("Allowing Aave V3 borrow...");
        module.allowAction(safe, AAVE_V3_POOL, AAVE_BORROW_SELECTOR);

        console.log("Allowing Aave V3 repay...");
        module.allowAction(safe, AAVE_V3_POOL, AAVE_REPAY_SELECTOR);

        console.log("Aave V3 configuration complete!");
    }

    function _configureEulerVaults(address safe) internal {
        // Configure USDC vault
        if (EULER_VAULT_USDC != address(0)) {
            console.log("Configuring Euler USDC Vault...");
            module.allowAction(safe, EULER_VAULT_USDC, EULER_DEPOSIT_SELECTOR);
            module.allowAction(safe, EULER_VAULT_USDC, EULER_WITHDRAW_SELECTOR);
            module.allowAction(safe, EULER_VAULT_USDC, EULER_MINT_SELECTOR);
            module.allowAction(safe, EULER_VAULT_USDC, EULER_REDEEM_SELECTOR);
        }

        // Configure USDT vault
        if (EULER_VAULT_USDT != address(0)) {
            console.log("Configuring Euler USDT Vault...");
            module.allowAction(safe, EULER_VAULT_USDT, EULER_DEPOSIT_SELECTOR);
            module.allowAction(safe, EULER_VAULT_USDT, EULER_WITHDRAW_SELECTOR);
            module.allowAction(safe, EULER_VAULT_USDT, EULER_MINT_SELECTOR);
            module.allowAction(safe, EULER_VAULT_USDT, EULER_REDEEM_SELECTOR);
        }

        // Configure DAI vault
        if (EULER_VAULT_DAI != address(0)) {
            console.log("Configuring Euler DAI Vault...");
            module.allowAction(safe, EULER_VAULT_DAI, EULER_DEPOSIT_SELECTOR);
            module.allowAction(safe, EULER_VAULT_DAI, EULER_WITHDRAW_SELECTOR);
            module.allowAction(safe, EULER_VAULT_DAI, EULER_MINT_SELECTOR);
            module.allowAction(safe, EULER_VAULT_DAI, EULER_REDEEM_SELECTOR);
        }

        console.log("Euler vault configuration complete!");
    }

    function _setRateLimits(address safe) internal {
        // Set rate limit for USDC: 100,000 USDC per 24 hours
        uint256 usdcLimit = 100_000 * 10**6; // 6 decimals
        uint256 window24h = 24 hours;

        console.log("Setting USDC rate limit: 100,000 USDC per 24 hours");
        module.setRateLimit(safe, USDC, usdcLimit, window24h);

        // Set rate limit for USDT: 100,000 USDT per 24 hours
        uint256 usdtLimit = 100_000 * 10**6; // 6 decimals
        console.log("Setting USDT rate limit: 100,000 USDT per 24 hours");
        module.setRateLimit(safe, USDT, usdtLimit, window24h);

        // Set rate limit for DAI: 100,000 DAI per 24 hours
        uint256 daiLimit = 100_000 * 10**18; // 18 decimals
        console.log("Setting DAI rate limit: 100,000 DAI per 24 hours");
        module.setRateLimit(safe, DAI, daiLimit, window24h);

        // Set rate limit for WETH: 50 WETH per 24 hours
        uint256 wethLimit = 50 * 10**18;
        console.log("Setting WETH rate limit: 50 WETH per 24 hours");
        module.setRateLimit(safe, WETH, wethLimit, window24h);

        // Set rate limit for ETH: 50 ETH per 24 hours
        uint256 ethLimit = 50 * 10**18;
        console.log("Setting ETH rate limit: 50 ETH per 24 hours");
        module.setRateLimit(safe, address(0), ethLimit, window24h);

        console.log("Rate limits configured!");
    }
}
