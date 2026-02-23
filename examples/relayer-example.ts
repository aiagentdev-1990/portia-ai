/**
 * TypeScript Example: Trusted Relayer Execution
 *
 * This example demonstrates how to:
 * 1. Use a trusted relayer wallet to execute transactions
 * 2. Submit transactions to the SafePortfolioModule
 */

import { ethers } from 'ethers';

// Contract ABI (minimal for this example)
const SAFE_PORTFOLIO_MODULE_ABI = [
  'function execute(address to, uint256 value, bytes calldata data) external',
  'function getSafe() external view returns (address)',
  'function getTrustedRelayer() external view returns (address)',
  'function getRateLimit(address token) external view returns (tuple(uint256 maxAmount, uint256 windowDuration, uint256 lastResetTime, uint256 spentInWindow))',
  'function getRemainingInWindow(address token) external view returns (uint256)',
  'function getRateLimitInfo(address token) external view returns (uint256 maxAmount, uint256 windowDuration, uint256 lastResetTime, uint256 spentInWindow, uint256 timeUntilReset)',
  'function setTrustedRelayer(address newRelayer) external',
  'function setRateLimit(address token, uint256 maxAmount, uint256 windowDuration) external',
  'function resetRateLimitWindow(address token) external',
];

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

  // Check rate limit info for USDC
  const rateLimitInfo = await moduleContract.getRateLimitInfo(USDC_ADDRESS);
  const remainingInWindow = await moduleContract.getRemainingInWindow(USDC_ADDRESS);

  console.log('USDC Rate Limit Info:');
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
  console.log('  To:', AAVE_POOL);
  console.log('  Value:', 0n);
  console.log('  Data:', depositData);

  // Execute via module (only trusted relayer can call this)
  try {
    const tx = await moduleContract.execute(
      AAVE_POOL,
      0, // no ETH value
      depositData
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
  console.log('  To:', recipient);
  console.log('  Value:', ethers.formatEther(value), 'ETH');

  try {
    const tx = await moduleContract.execute(recipient, value, data);

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
 * Example: Safe owner configures rate limits
 */
async function configureRateLimits() {
  const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY || '';
  const MODULE_ADDRESS = '0x...';
  const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY';

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ownerWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);

  const moduleContract = new ethers.Contract(
    MODULE_ADDRESS,
    SAFE_PORTFOLIO_MODULE_ABI,
    ownerWallet
  );

  const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  // Set rate limit: 10,000 USDC per 24 hours
  const maxAmount = ethers.parseUnits('10000', 6);
  const windowDuration = 24 * 60 * 60; // 24 hours in seconds

  console.log('Setting USDC rate limit to 10,000 USDC per 24 hours...');

  try {
    const tx = await moduleContract.setRateLimit(USDC_ADDRESS, maxAmount, windowDuration);
    console.log(`Transaction submitted! Hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log('Rate limit set successfully!');

    return receipt;
  } catch (error) {
    console.error('Error setting rate limit:', error);
    throw error;
  }
}

/**
 * Example: Check rate limit status for a token
 */
async function checkRateLimitStatus() {
  const MODULE_ADDRESS = '0x...';
  const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY';

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const moduleContract = new ethers.Contract(
    MODULE_ADDRESS,
    SAFE_PORTFOLIO_MODULE_ABI,
    provider
  );

  const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  const rateLimitInfo = await moduleContract.getRateLimitInfo(USDC_ADDRESS);
  const remainingInWindow = await moduleContract.getRemainingInWindow(USDC_ADDRESS);

  console.log('USDC Rate Limit Status:');
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
 * Example: Safe owner updates trusted relayer
 */
async function updateTrustedRelayer() {
  const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY || '';
  const MODULE_ADDRESS = '0x...';
  const NEW_RELAYER_ADDRESS = '0x...';
  const RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY';

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ownerWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);

  const moduleContract = new ethers.Contract(
    MODULE_ADDRESS,
    SAFE_PORTFOLIO_MODULE_ABI,
    ownerWallet
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
  depositToAaveViaRelayer,
  sendEthViaRelayer,
  configureRateLimits,
  checkRateLimitStatus,
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
