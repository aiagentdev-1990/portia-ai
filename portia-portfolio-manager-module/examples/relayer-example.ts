/**
 * TypeScript Example: Multi-Safe Portfolio Module
 *
 * This example demonstrates how to:
 * 1. Enable multiple Safes to use the same module
 * 2. Configure per-Safe rate limits and allowed targets
 * 3. Execute transactions via trusted relayer
 */

import { ethers } from 'ethers';

// Contract ABI (minimal for this example)
const SAFE_PORTFOLIO_MODULE_ABI = [
  // Relayer functions
  'function execute(address safe, address to, uint256 value, bytes calldata data) external',

  // Getter functions
  'function getTrustedRelayer() external view returns (address)',
  'function areAllTargetsAllowed(address safe) external view returns (bool)',
  'function isActionAllowed(address safe, address target, bytes4 functionSelector) external view returns (bool)',
  'function getRateLimit(address safe, address token) external view returns (tuple(uint256 maxAmount, uint256 windowDuration, uint256 lastResetTime, uint256 spentInWindow))',
  'function getRemainingInWindow(address safe, address token) external view returns (uint256)',
  'function getRateLimitInfo(address safe, address token) external view returns (uint256 maxAmount, uint256 windowDuration, uint256 lastResetTime, uint256 spentInWindow, uint256 timeUntilReset)',

  // Safe owner functions
  'function setRateLimit(address safe, address token, uint256 maxAmount, uint256 windowDuration) external',
  'function allowAction(address safe, address target, bytes4 functionSelector) external',
  'function disallowAction(address safe, address target, bytes4 functionSelector) external',
  'function setAllFunctionsAllowedForTarget(address safe, address target, bool allowed) external',
  'function setAllTargetsAllowed(address safe, bool allowed) external',
  'function resetRateLimitWindow(address safe, address token) external',

  // Module owner functions
  'function setTrustedRelayer(address newRelayer) external',
];

/**
 * Example: Safe owner configures their Safe
 * Note: The Safe must first enable this module via Safe.enableModule(MODULE_ADDRESS)
 */
async function setupSafeConfiguration() {
  const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY || '';
  const MODULE_ADDRESS = '0x...'; // SafePortfolioModule address
  const SAFE_ADDRESS = '0x...'; // Your Safe address
  const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY';

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ownerWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);

  const moduleContract = new ethers.Contract(
    MODULE_ADDRESS,
    SAFE_PORTFOLIO_MODULE_ABI,
    ownerWallet
  );

  // 1. Configure allowed actions (target + function selector)
  const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
  const UNISWAP_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

  // Allow specific Aave functions
  const aaveDepositSelector = ethers.id('deposit(address,uint256,address,uint16)').slice(0, 10);
  const aaveWithdrawSelector = ethers.id('withdraw(address,uint256,address)').slice(0, 10);

  console.log('Allowing Aave deposit and withdraw functions...');
  let tx = await moduleContract.allowAction(SAFE_ADDRESS, AAVE_POOL, aaveDepositSelector);
  await tx.wait();

  tx = await moduleContract.allowAction(SAFE_ADDRESS, AAVE_POOL, aaveWithdrawSelector);
  await tx.wait();
  console.log('Aave actions configured!');

  // Allow all functions for Uniswap Router
  console.log('Allowing all Uniswap Router functions...');
  tx = await moduleContract.setAllFunctionsAllowedForTarget(SAFE_ADDRESS, UNISWAP_ROUTER, true);
  await tx.wait();
  console.log('Uniswap Router configured!');

  // 2. Set rate limits
  const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const maxAmount = ethers.parseUnits('10000', 6); // 10,000 USDC
  const windowDuration = 24 * 60 * 60; // 24 hours

  console.log('Setting USDC rate limit: 10,000 USDC per 24 hours...');
  const rateLimitTx = await moduleContract.setRateLimit(
    SAFE_ADDRESS,
    USDC_ADDRESS,
    maxAmount,
    windowDuration
  );
  await rateLimitTx.wait();
  console.log('Rate limit configured!');
}

/**
 * Example: Deposit USDC into Aave via trusted relayer
 */
async function depositToAaveViaRelayer() {
  // Configuration
  const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
  const MODULE_ADDRESS = '0x...'; // SafePortfolioModule address
  const SAFE_ADDRESS = '0x...'; // Safe address
  const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY';

  // Aave V3 Pool address (example)
  const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
  const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const DEPOSIT_AMOUNT = ethers.parseUnits('1000', 6); // 1000 USDC

  // Create provider and relayer wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);

  // Connect to module contract
  const moduleContract = new ethers.Contract(
    MODULE_ADDRESS,
    SAFE_PORTFOLIO_MODULE_ABI,
    relayerWallet
  );

  // Check rate limit info for this Safe and token
  const rateLimitInfo = await moduleContract.getRateLimitInfo(SAFE_ADDRESS, USDC_ADDRESS);
  const remainingInWindow = await moduleContract.getRemainingInWindow(SAFE_ADDRESS, USDC_ADDRESS);

  console.log(`USDC Rate Limit Info for Safe ${SAFE_ADDRESS}:`);
  console.log(`  Max per window: ${ethers.formatUnits(rateLimitInfo.maxAmount, 6)} USDC`);
  console.log(`  Window duration: ${rateLimitInfo.windowDuration} seconds (${rateLimitInfo.windowDuration / 3600} hours)`);
  console.log(`  Spent in current window: ${ethers.formatUnits(rateLimitInfo.spentInWindow, 6)} USDC`);
  console.log(`  Remaining in window: ${ethers.formatUnits(remainingInWindow, 6)} USDC`);
  console.log(`  Time until reset: ${rateLimitInfo.timeUntilReset} seconds`);

  // Encode Aave deposit call
  // deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
  const aavePoolInterface = new ethers.Interface([
    'function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  ]);

  const depositData = aavePoolInterface.encodeFunctionData('deposit', [
    USDC_ADDRESS,
    DEPOSIT_AMOUNT,
    SAFE_ADDRESS, // deposit on behalf of Safe
    0, // no referral code
  ]);

  console.log('Transaction details:');
  console.log('  Safe:', SAFE_ADDRESS);
  console.log('  To:', AAVE_POOL);
  console.log('  Value:', 0n);
  console.log('  Data:', depositData);

  // Execute via module (only trusted relayer can call this)
  try {
    const tx = await moduleContract.execute(
      SAFE_ADDRESS, // Which Safe to execute from
      AAVE_POOL,    // Target address
      0,            // no ETH value
      depositData   // Transaction data
    );

    console.log(`Transaction submitted! Hash: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('Transaction confirmed!');
    console.log(`View on Etherscan: https://etherscan.io/tx/${tx.hash}`);

    return receipt;
  } catch (error) {
    console.error('Error executing transaction:', error);
    throw error;
  }
}

/**
 * Example: ETH transfer via trusted relayer
 */
async function sendEthViaRelayer() {
  const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
  const MODULE_ADDRESS = '0x...';
  const SAFE_ADDRESS = '0x...'; // Safe address
  const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY';

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);

  const moduleContract = new ethers.Contract(
    MODULE_ADDRESS,
    SAFE_PORTFOLIO_MODULE_ABI,
    relayerWallet
  );

  // Send 0.1 ETH to recipient
  const recipient = '0x...'; // Recipient address
  const value = ethers.parseEther('0.1');
  const data = '0x'; // Empty data for simple ETH transfer

  console.log('Sending ETH via Safe module...');
  console.log('  Safe:', SAFE_ADDRESS);
  console.log('  To:', recipient);
  console.log('  Value:', ethers.formatEther(value), 'ETH');

  try {
    const tx = await moduleContract.execute(
      SAFE_ADDRESS, // Which Safe to execute from
      recipient,    // Target address
      value,        // ETH value
      data          // Transaction data
    );

    console.log(`Transaction submitted! Hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log('Transaction confirmed!');

    return receipt;
  } catch (error) {
    console.error('Error sending ETH:', error);
    throw error;
  }
}

/**
 * Example: Check rate limit status for a Safe and token
 */
async function checkRateLimitStatus() {
  const MODULE_ADDRESS = '0x...';
  const SAFE_ADDRESS = '0x...'; // Safe address
  const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY';

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const moduleContract = new ethers.Contract(
    MODULE_ADDRESS,
    SAFE_PORTFOLIO_MODULE_ABI,
    provider
  );

  const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  const rateLimitInfo = await moduleContract.getRateLimitInfo(SAFE_ADDRESS, USDC_ADDRESS);
  const remainingInWindow = await moduleContract.getRemainingInWindow(SAFE_ADDRESS, USDC_ADDRESS);

  console.log(`USDC Rate Limit Status for Safe ${SAFE_ADDRESS}:`);
  console.log(`  Max per window: ${ethers.formatUnits(rateLimitInfo.maxAmount, 6)} USDC`);
  console.log(`  Window: ${rateLimitInfo.windowDuration / 3600} hours`);
  console.log(`  Spent: ${ethers.formatUnits(rateLimitInfo.spentInWindow, 6)} USDC`);
  console.log(`  Remaining: ${ethers.formatUnits(remainingInWindow, 6)} USDC`);
  console.log(`  Resets in: ${rateLimitInfo.timeUntilReset} seconds`);

  // Calculate percentage used
  const percentUsed = rateLimitInfo.maxAmount > 0n
    ? (Number(rateLimitInfo.spentInWindow) / Number(rateLimitInfo.maxAmount)) * 100
    : 0;

  console.log(`  Usage: ${percentUsed.toFixed(2)}%`);
}

/**
 * Example: Managing multiple Safes with different configurations
 */
async function manageMultipleSafes() {
  const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
  const MODULE_ADDRESS = '0x...';
  const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY';

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);

  const moduleContract = new ethers.Contract(
    MODULE_ADDRESS,
    SAFE_PORTFOLIO_MODULE_ABI,
    relayerWallet
  );

  // Two different Safes with different allowed actions
  const SAFE_A = '0x...'; // Conservative Safe - only Aave deposit allowed
  const SAFE_B = '0x...'; // Aggressive Safe - all Uniswap functions allowed

  const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
  const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  // Execute same action on both Safes (different rate limits apply)
  const depositAmount = ethers.parseUnits('5000', 6);

  const aavePoolInterface = new ethers.Interface([
    'function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  ]);

  const depositData = aavePoolInterface.encodeFunctionData('deposit', [
    USDC_ADDRESS,
    depositAmount,
    SAFE_A,
    0,
  ]);

  // Check if action is allowed for Safe A
  const depositSelector = ethers.id('deposit(address,uint256,address,uint16)').slice(0, 10);
  const isAllowedA = await moduleContract.isActionAllowed(SAFE_A, AAVE_POOL, depositSelector);
  console.log(`Aave deposit allowed for Safe A: ${isAllowedA}`);

  // Execute from Safe A
  console.log('Executing from Safe A (only deposit allowed)...');
  const txA = await moduleContract.execute(SAFE_A, AAVE_POOL, 0, depositData);
  await txA.wait();
  console.log('Safe A transaction confirmed!');

  // Execute from Safe B (would fail if action not allowed)
  console.log('Executing from Safe B (all Uniswap allowed)...');
  // Safe B configured for Uniswap, not Aave - this would revert
  // const txB = await moduleContract.execute(SAFE_B, AAVE_POOL, 0, depositData);
}

/**
 * Example: Update trusted relayer (only current relayer can do this)
 */
async function updateTrustedRelayer() {
  const CURRENT_RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
  const MODULE_ADDRESS = '0x...';
  const NEW_RELAYER_ADDRESS = '0x...';
  const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY';

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const currentRelayerWallet = new ethers.Wallet(CURRENT_RELAYER_PRIVATE_KEY, provider);

  const moduleContract = new ethers.Contract(
    MODULE_ADDRESS,
    SAFE_PORTFOLIO_MODULE_ABI,
    currentRelayerWallet
  );

  console.log('Updating trusted relayer to:', NEW_RELAYER_ADDRESS);

  try {
    const tx = await moduleContract.setTrustedRelayer(NEW_RELAYER_ADDRESS);
    console.log(`Transaction submitted! Hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log('Trusted relayer updated successfully!');

    return receipt;
  } catch (error) {
    console.error('Error updating trusted relayer:', error);
    throw error;
  }
}

// Export functions
export {
  setupSafeConfiguration,
  depositToAaveViaRelayer,
  sendEthViaRelayer,
  checkRateLimitStatus,
  manageMultipleSafes,
  updateTrustedRelayer,
};

// Example usage
if (require.main === module) {
  depositToAaveViaRelayer()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
