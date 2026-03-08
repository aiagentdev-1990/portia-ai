# Portfolio Manager - Coding Standards

## Storage Variable Conventions

### Naming Conventions

1. **Storage variables** - prefix with `s_`

   ```solidity
   uint256 private s_totalCollateral;
   mapping(address => uint256) private s_userBalances;
   ```

2. **Immutable variables** - prefix with `i_`

   ```solidity
   address private immutable i_owner;
   IERC20 private immutable i_usdc;
   ```

3. **Constants** - all caps with underscores
   ```solidity
   uint256 private constant MAX_SUPPLY = 1_000_000;
   ```

### Visibility Rules

- **All storage and immutable variables MUST be private**
- **Expose values through public getter functions**

### Example

❌ **Bad:**

```solidity
contract Example {
    address public immutable owner;
    uint256 public totalSupply;
}
```

✅ **Good:**

```solidity
contract Example {
    address private immutable i_owner;
    uint256 private s_totalSupply;

    function getOwner() external view returns (address) {
        return i_owner;
    }

    function getTotalSupply() external view returns (uint256) {
        return s_totalSupply;
    }
}
```

## Proxy Contract Exception

**Important:** For contracts deployed via proxy pattern (EIP-1167, etc.):

- **Cannot use `immutable` variables** - proxies can't set immutables in `initialize()`
- Use `s_` prefix for all variables that would normally be immutable
- Add a comment explaining why: `// Note: Using storage instead of immutable because this is a proxy contract`

Example:

```solidity
contract ProxyContract {
    // ============ Storage State ============
    // Note: Using storage instead of immutable because this is a proxy contract

    IPool private s_aavePool;
    IERC20 private s_usdc;

    function initialize(IPool _aavePool, IERC20 _usdc) external {
        s_aavePool = _aavePool;
        s_usdc = _usdc;
    }
}
```

## Test Writing Guidelines

### File Naming Convention

Tests must follow this naming pattern: `CONTRACT_NAME_FUNCTION_NAME_UT.t.sol`

Examples:

- `DelphicAccount_initialize_UT.t.sol`
- `DelphicAccount_depositCollateral_UT.t.sol`
- `DelphicAccountFactory_createAccount_UT.t.sol`

### Test Structure

Use **setUp hooks** to configure test scenarios:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/DelphicAccount.sol";

contract DelphicAccount_depositCollateral_UT is Test {
    DelphicAccount public account;
    address public owner;
    IERC20 public mockCollateral;
    IPool public mockAavePool;

    function setUp() public {
        owner = makeAddr("owner");
        mockCollateral = IERC20(address(new MockERC20()));
        mockAavePool = IPool(address(new MockAavePool()));

        // Deploy and initialize account
        account = new DelphicAccount();
        account.initialize(
            owner,
            address(this),
            mockAavePool,
            mockCollateral,
            // ... other params
        );
    }

    function test_depositCollateral_Success() public {
        // Arrange
        uint256 depositAmount = 10 ether;

        // Act
        vm.prank(owner);
        account.depositCollateral(depositAmount);

        // Assert
        assertEq(account.getTotalCollateralDeposited(), depositAmount);
    }

    function test_depositCollateral_RevertsWhen_NotOwner() public {
        // Arrange
        address attacker = makeAddr("attacker");
        uint256 depositAmount = 10 ether;

        // Act & Assert
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        account.depositCollateral(depositAmount);
    }
}
```

### Test Naming Conventions

- **Success cases:** `test_functionName_Success()`
- **Revert cases:** `test_functionName_RevertsWhen_Condition()`
- **Edge cases:** `test_functionName_EdgeCase_Description()`
- **Fuzz tests:** `testFuzz_functionName_Description()`

### Test Organization

1. **Arrange** - Set up test data and conditions
2. **Act** - Execute the function being tested
3. **Assert** - Verify expected outcomes

### Best Practices

- One test file per function
- Use `setUp()` for common initialization
- Use descriptive test names that explain the scenario
- Test both success and failure paths
- Use mocks/fakes for external dependencies
- Group related assertions together

## General Guidelines

- Use explicit getter functions instead of auto-generated public getters
- Keep state variables organized by type (immutables first, then storage)
- Document all state variables with NatSpec comments
- Group related variables together
