export type EvmConfig = {
  storageAddress: string
  chainName: string
}

export type Config = {
  schedule: string
  apiUrl: string
  agentUrl: string
  evms: EvmConfig[]
}

export type MyResult = {
  result: bigint | string
}

export type UserPreferences = {
  userId: string
  walletAddress: string
  safeAddress: string
  targetPercentageYield: number
  targetSupplyApyDeviation: number
  vaults: string[]
  vaultAddresses: string[]
  portfolioPercentages: Record<string, number>
  riskToleranceRating: number
}

export type Position = {
  vaultName: string
  vaultAddress: string
  apy: string       // APY as bigint WAD string (10^18 scale)
  balance: number   // USDC balance (raw 10^6 scale)
}

export type RebalanceMove = {
  fromVault: string
  fromAddress: string
  toVault: string
  toAddress: string
  amount: number   // USDC amount (raw 10^6 scale)
}

export type RebalanceRequest = {
  userId: string
  totalBalance: number
  weightedAverageAPY: string
  targetAPY: string
  riskToleranceRating: number
  positions: Position[]
}

export type TxRecord = {
  vaultName: string
  operation: 'withdraw' | 'supply'
  amount: number
  txHash: string
}
