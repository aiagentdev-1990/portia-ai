export const aavePoolABI = [
  {
    "type": "function",
    "name": "getReserveData",
    "inputs": [
      {
        "name": "asset",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "res",
        "type": "tuple",
        "components": [
          { "name": "configuration", "type": "tuple", "components": [{ "name": "data", "type": "uint256" }] },
          { "name": "liquidityIndex", "type": "uint128" },
          { "name": "currentLiquidityRate", "type": "uint128" },
          { "name": "variableBorrowIndex", "type": "uint128" },
          { "name": "currentVariableBorrowRate", "type": "uint128" },
          { "name": "currentStableBorrowRate", "type": "uint128" },
          { "name": "lastUpdateTimestamp", "type": "uint40" },
          { "name": "id", "type": "uint16" },
          { "name": "aTokenAddress", "type": "address" },
          { "name": "stableDebtTokenAddress", "type": "address" },
          { "name": "variableDebtTokenAddress", "type": "address" },
          { "name": "interestRateStrategyAddress", "type": "address" },
          { "name": "accruedToTreasury", "type": "uint128" },
          { "name": "unbacked", "type": "uint128" },
          { "name": "isolationModeTotalDebt", "type": "uint128" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "supply",
    "inputs": [
      { "name": "asset", "type": "address" },
      { "name": "amount", "type": "uint256" },
      { "name": "onBehalfOf", "type": "address" },
      { "name": "referralCode", "type": "uint16" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
      { "name": "asset", "type": "address" },
      { "name": "amount", "type": "uint256" },
      { "name": "to", "type": "address" }
    ],
    "outputs": [
      { "name": "", "type": "uint256" }
    ],
    "stateMutability": "nonpayable"
  }
] as const
