export const safePortfolioModuleABI = [
  {
    type: "function",
    name: "execute",
    inputs: [
      { name: "safe", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getTrustedRelayer",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "areAllTargetsAllowed",
    inputs: [{ name: "safe", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isActionAllowed",
    inputs: [
      { name: "safe", type: "address" },
      { name: "target", type: "address" },
      { name: "functionSelector", type: "bytes4" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getRateLimit",
    inputs: [
      { name: "safe", type: "address" },
      { name: "token", type: "address" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "maxAmount", type: "uint256" },
          { name: "windowDuration", type: "uint256" },
          { name: "lastResetTime", type: "uint256" },
          { name: "spentInWindow", type: "uint256" }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getRemainingInWindow",
    inputs: [
      { name: "safe", type: "address" },
      { name: "token", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  { type: "error", name: "InvalidSafe", inputs: [] },
  { type: "error", name: "InvalidRelayer", inputs: [] },
  { type: "error", name: "InvalidRateLimit", inputs: [] },
  { type: "error", name: "NotSafeOwner", inputs: [] },
  { type: "error", name: "NotTrustedRelayer", inputs: [] },
  { type: "error", name: "ModuleNotEnabled", inputs: [] },
  { type: "error", name: "ActionNotAllowed", inputs: [] },
  { type: "error", name: "RateLimitExceeded", inputs: [] },
  { type: "error", name: "ModuleExecutionFailed", inputs: [] },
] as const
