# SafePortfolioModule

A Gnosis Safe module that enables a trusted relayer to execute DeFi operations on behalf of multiple Safes with granular permission controls and rate limiting.

## Features

- **Multi-Safe Support**: Single module instance can manage multiple Safes
- **Granular Permissions**: Control allowed actions by target contract + function selector
- **Rate Limiting**: Per-token spending limits with configurable time windows
- **Balance-Based Tracking**: Monitors actual balance changes, works with any transaction type
- **Trusted Relayer**: Only authorized relayer can execute transactions
- **Aave V3 & Euler Integration**: Pre-configured for DeFi lending protocols

## Architecture

- **Trusted Relayer**: Single address authorized to execute transactions
- **Per-Safe Configuration**: Each Safe has independent allowed actions and rate limits
- **Three-Tier Permission System**:
  1. Specific action (target + function selector)
  2. All functions for a target
  3. All targets and functions

## Setup

### 1. Install Dependencies

```bash
forge install
```

### 2. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `AGENT_WALLET_ADDRESS`: Address of the trusted relayer/agent
- `SAFE_ADDRESS`: Address of the Safe to configure
- `DEPLOYER_PRIVATE_KEY`: Private key of Safe owner (for deployment)
- `RPC_URL`: Ethereum RPC endpoint

### 3. Deploy and Configure

Deploy the module and configure it for Aave V3 and Euler:

```bash
source .env
forge script script/DeployAndConfigure.s.sol:DeployAndConfigure \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify
```

This script will:
- Deploy SafePortfolioModule with your agent wallet as trusted relayer
- Whitelist Aave V3 actions: `supply()`, `withdraw()`, `borrow()`, `repay()`
- Whitelist Euler vault actions: `deposit()`, `withdraw()`, `mint()`, `redeem()`
- Set default rate limits (100k USDC/USDT/DAI, 50 ETH/WETH per 24 hours)

### 4. Enable Module on Safe

After deployment, enable the module on your Safe:

**Via Safe UI:**
1. Go to Settings → Modules
2. Add Module with the deployed module address

**Via Cast:**
```bash
cast send $SAFE_ADDRESS \
  "enableModule(address)" \
  $MODULE_ADDRESS \
  --private-key $SAFE_OWNER_PRIVATE_KEY
```

## Usage

### Executing Transactions (Relayer)

The trusted relayer calls `execute()` to perform actions on behalf of a Safe:

```solidity
module.execute(
    safeAddress,    // Which Safe to execute from
    targetAddress,  // Target contract (e.g., Aave Pool)
    value,          // ETH value (0 for token operations)
    data            // Encoded function call
);
```

### Configuring Permissions (Safe Owner)

**Allow specific action:**
```solidity
module.allowAction(
    safeAddress,
    targetAddress,
    functionSelector
);
```

**Allow all functions for a target:**
```solidity
module.setAllFunctionsAllowedForTarget(
    safeAddress,
    targetAddress,
    true
);
```

**Allow all targets (unrestricted):**
```solidity
module.setAllTargetsAllowed(safeAddress, true);
```

### Setting Rate Limits (Safe Owner)

```solidity
module.setRateLimit(
    safeAddress,
    tokenAddress,    // address(0) for ETH
    maxAmount,       // Maximum amount per window
    windowDuration   // Time window in seconds
);
```

Example: Limit USDC to 10,000 per day
```solidity
module.setRateLimit(
    safeAddress,
    0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, // USDC
    10_000 * 10**6,  // 10,000 USDC (6 decimals)
    24 hours         // 24 hour window
);
```

## Supported Protocols

### Aave V3

Pool address: `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`

Whitelisted functions:
- `supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)`
- `withdraw(address asset, uint256 amount, address to)`
- `borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)`
- `repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)`

### Euler V2 Vaults

Whitelisted functions (ERC-4626 standard):
- `deposit(uint256 assets, address receiver)`
- `withdraw(uint256 assets, address receiver, address owner)`
- `mint(uint256 shares, address receiver)`
- `redeem(uint256 shares, address receiver, address owner)`

**Note**: Update Euler vault addresses in `script/DeployAndConfigure.s.sol` before deployment.

## Security Features

✅ **Module Enablement Check**: Verifies Safe has enabled module before execution
✅ **Safe Address Validation**: Ensures Safe address is a contract
✅ **Reentrancy Protection**: Uses OpenZeppelin's ReentrancyGuard
✅ **Balance-Based Rate Limiting**: Tracks actual balance changes, not transaction data
✅ **Per-Safe Configuration**: Isolated permissions and limits for each Safe
✅ **Function Selector Validation**: Granular control over allowed operations

## Development

### Build

```bash
forge build
```

### Test

```bash
forge test
```

### Format

```bash
forge fmt
```

### Gas Snapshots

```bash
forge snapshot
```

## Examples

See `examples/relayer-example.ts` for TypeScript examples using ethers.js v6.

## License

MIT
