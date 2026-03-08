import {
  CronCapability,
  HTTPClient,
  handler,
  Runner,
  type NodeRuntime,
  type Runtime,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk"
import { toBase64, calculateWeightedAverageAPY, formatAPY, formatUSDC } from "./utils"
import { getSupplyAPY, getUserBalance, getATokenAddress } from "./contractCalls"
import type { Config, MyResult, UserPreferences, Position, RebalanceMove, RebalanceRequest, TxRecord } from "./types"

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

const getUserPreferences = (nodeRuntime: NodeRuntime<Config>): string => {
  const httpClient = new HTTPClient()

  const req = {
    url: nodeRuntime.config.apiUrl,
    method: "GET" as const
  }

  const resp = httpClient.sendRequest(nodeRuntime, req).result();
  const preferences = JSON.parse(new TextDecoder().decode(resp.body)) as UserPreferences[];

  return JSON.stringify(preferences)
}

const makeNotifyUser = (userId: string, message: string) => (nodeRuntime: NodeRuntime<Config>): string => {
  const httpClient = new HTTPClient();

  const req = {
    url: `${nodeRuntime.config.agentUrl}/api/notify/${userId}`,
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json"
    },
    body: toBase64(JSON.stringify({ message }))
  };

  const resp = httpClient.sendRequest(nodeRuntime, req).result();
  return new TextDecoder().decode(resp.body)
}

const makeBatchExecute = (operations: Array<{ vaultName: string, amount: number, operation: string }>) =>
  (nodeRuntime: NodeRuntime<Config>): string => {
    const httpClient = new HTTPClient();

    const req = {
      url: `${nodeRuntime.config.agentUrl}/api/execute`,
      method: "POST" as const,
      headers: {
        "Content-Type": "application/json"
      },
      body: toBase64(JSON.stringify(operations))
    };

    const resp = httpClient.sendRequest(nodeRuntime, req).result();
    return new TextDecoder().decode(resp.body)
  }

const makeResearchQuery = (userId: string, query: string) =>
  (nodeRuntime: NodeRuntime<Config>): string => {
    const httpClient = new HTTPClient();

    const req = {
      url: `${nodeRuntime.config.agentUrl}/api/research/${userId}`,
      method: "POST" as const,
      headers: {
        "Content-Type": "application/json"
      },
      body: toBase64(JSON.stringify({ query }))
    };

    const resp = httpClient.sendRequest(nodeRuntime, req).result();
    return new TextDecoder().decode(resp.body)
  }

const makeRebalanceRequest = (request: RebalanceRequest) =>
  (nodeRuntime: NodeRuntime<Config>): string => {
    const httpClient = new HTTPClient();

    const req = {
      url: `${nodeRuntime.config.agentUrl}/api/rebalance`,
      method: "POST" as const,
      headers: {
        "Content-Type": "application/json"
      },
      body: toBase64(JSON.stringify(request))
    };

    const resp = httpClient.sendRequest(nodeRuntime, req).result();
    return new TextDecoder().decode(resp.body)
  }

const callResearch = (
  runtime: Runtime<Config>,
  userId: string,
  query: string
): void => {
  runtime.log(`[callResearch] Triggering research for ${userId}`)
  runtime.runInNodeMode(
    makeResearchQuery(userId, query),
    consensusIdenticalAggregation()
  )().result()
  runtime.log(`[callResearch] Research complete`)
}

// --- Validation guardrails ---

function validateSchema(moves: unknown): moves is RebalanceMove[] {
  if (!Array.isArray(moves)) return false
  for (const m of moves) {
    if (typeof m !== 'object' || m === null) return false
    if (typeof m.fromVault !== 'string' || typeof m.fromAddress !== 'string') return false
    if (typeof m.toVault !== 'string' || typeof m.toAddress !== 'string') return false
    if (typeof m.amount !== 'number' || !Number.isInteger(m.amount) || m.amount <= 0) return false
  }
  return true
}

function validateVaultWhitelist(moves: RebalanceMove[], vaults: string[], vaultAddresses: string[]): boolean {
  for (const m of moves) {
    const fromIdx = vaults.indexOf(m.fromVault)
    if (fromIdx === -1 || vaultAddresses[fromIdx].toLowerCase() !== m.fromAddress.toLowerCase()) return false
    const toIdx = vaults.indexOf(m.toVault)
    if (toIdx === -1 || vaultAddresses[toIdx].toLowerCase() !== m.toAddress.toLowerCase()) return false
  }
  return true
}

function validateBalanceSum(moves: RebalanceMove[], positions: Position[]): boolean {
  const withdrawals: Record<string, number> = {}
  for (const m of moves) {
    withdrawals[m.fromVault] = (withdrawals[m.fromVault] || 0) + m.amount
  }
  for (const [vaultName, totalWithdrawn] of Object.entries(withdrawals)) {
    const pos = positions.find(p => p.vaultName === vaultName)
    if (!pos || totalWithdrawn > pos.balance) return false
  }
  return true
}

function validateTargetAPY(moves: RebalanceMove[], positions: Position[], targetAPY: string, log?: (msg: string) => void): boolean {
  // Simulate new balances after moves
  const balances: Record<string, number> = {}
  const apys: Record<string, string> = {}
  for (const p of positions) {
    balances[p.vaultName] = p.balance
    apys[p.vaultName] = p.apy
  }
  for (const m of moves) {
    balances[m.fromVault] -= m.amount
    balances[m.toVault] = (balances[m.toVault] || 0) + m.amount
  }
  const simulated = Object.entries(balances).map(([name, bal]) => ({
    apy: apys[name],
    balance: bal,
  }))
  const newWeightedAvg = calculateWeightedAverageAPY(simulated)
  if (log) {
    const balSummary = Object.entries(balances).map(([n, b]) => `${n}=${b}`).join(', ')
    log(`Simulated balances: ${balSummary}`)
    log(`Simulated weighted avg: ${newWeightedAvg} (${formatAPY(newWeightedAvg)}), target: ${targetAPY} (${formatAPY(targetAPY)})`)
  }
  return BigInt(newWeightedAvg) >= BigInt(targetAPY)
}

// --- Execution ---

const executeRebalance = (
  runtime: Runtime<Config>,
  moves: RebalanceMove[],
): TxRecord[] => {
  runtime.log(`[executeRebalance] Starting rebalance with ${moves.length} moves`)

  // Build batch: withdraw first, then supply for each move
  const operations: Array<{ vaultName: string, amount: number, operation: string }> = []
  for (const move of moves) {
    const humanAmount = move.amount / 1_000_000
    operations.push({ vaultName: move.fromVault, amount: humanAmount, operation: 'withdraw' })
    operations.push({ vaultName: move.toVault, amount: humanAmount, operation: 'supply' })
  }

  runtime.log(`[executeRebalance] Sending ${operations.length} operations in single batch`)
  const batchResponse = runtime.runInNodeMode(
    makeBatchExecute(operations),
    consensusIdenticalAggregation()
  )().result()
  runtime.log(`[executeRebalance] Batch result: ${batchResponse}`)

  // Parse results and extract TX hashes
  const results = JSON.parse(batchResponse) as Array<{ success: boolean, text?: string }>
  const txRecords: TxRecord[] = []

  let resultIdx = 0
  for (const move of moves) {
    const withdrawResult = results[resultIdx++]
    txRecords.push({
      vaultName: move.fromVault,
      operation: 'withdraw',
      amount: move.amount,
      txHash: extractTxHash(withdrawResult?.text ?? ''),
    })

    const supplyResult = results[resultIdx++]
    txRecords.push({
      vaultName: move.toVault,
      operation: 'supply',
      amount: move.amount,
      txHash: extractTxHash(supplyResult?.text ?? ''),
    })
  }

  runtime.log(`[executeRebalance] All ${moves.length} moves completed`)
  return txRecords
}

function extractTxHash(responseText: string): string {
  const match = responseText.match(/TX Hash:\s*(0x[0-9a-fA-F]+)/)
  return match ? match[1] : 'unknown'
}

const notifyUser = (
  runtime: Runtime<Config>,
  userId: string,
  message: string
): void => {
  runtime.log(`[notifyUser] Sending notification to ${userId}`)
  runtime.runInNodeMode(
    makeNotifyUser(userId, message),
    consensusIdenticalAggregation()
  )().result()
  runtime.log(`[notifyUser] Notification sent`)
}

const onCronTrigger = (runtime: Runtime<Config>): MyResult => {
  runtime.log("Workflow triggered.")

  const result = runtime.runInNodeMode(getUserPreferences, consensusIdenticalAggregation())().result()
  const preferences = JSON.parse(result) as UserPreferences[]
  runtime.log(`Loaded ${preferences.length} user(s)`)

  const apyByVault: Record<string, string> = {}
  let aaveATokenAddress: `0x${string}` | undefined

  for (const user of preferences) {
    runtime.log(`[${user.userId}] Processing user with ${user.vaultAddresses.length} vaults`)

    const positions: Position[] = []

    for (let i = 0; i < user.vaultAddresses.length; i++) {
      const vaultAddress = user.vaultAddresses[i]
      const vaultName = user.vaults[i]

      // Fetch and cache APY (raw bigint string, WAD scale)
      if (!(vaultAddress in apyByVault)) {
        const rawAPY = getSupplyAPY(runtime, vaultName, vaultAddress as `0x${string}`)
        apyByVault[vaultAddress] = rawAPY.toString()
      }

      // Get aToken address for Aave (cached)
      if (vaultName === 'aave' && !aaveATokenAddress) {
        aaveATokenAddress = getATokenAddress(runtime, vaultAddress as `0x${string}`)
      }

      // Fetch user balance (raw 10^6 scale)
      const rawBalance = getUserBalance(
        runtime,
        vaultName,
        vaultAddress as `0x${string}`,
        user.safeAddress as `0x${string}`,
        vaultName === 'aave' ? aaveATokenAddress : undefined
      )
      const balance = Number(rawBalance)

      positions.push({
        vaultName,
        vaultAddress,
        apy: apyByVault[vaultAddress],
        balance,
      })

      runtime.log(`[${user.userId}] ${vaultName}: APY=${apyByVault[vaultAddress]} (${formatAPY(apyByVault[vaultAddress])}), balance=${balance} (${formatUSDC(balance)})`)
    }

    // Calculate weighted average APY (BigInt WAD string)
    const weightedAvgAPY = calculateWeightedAverageAPY(positions)
    // Convert user target to WAD: targetPercentageYield is e.g. 5.0 meaning 5%
    // WAD for 5% = 0.05 * 10^18 = 5 * 10^16
    const targetAPY = BigInt(Math.round(user.targetPercentageYield * 1e16)).toString()
    const totalBalance = positions.reduce((sum, p) => sum + p.balance, 0)

    runtime.log(`[${user.userId}] Weighted avg APY: ${weightedAvgAPY} (${formatAPY(weightedAvgAPY)}), target: ${targetAPY} (${formatAPY(targetAPY)})`)

    if (BigInt(weightedAvgAPY) < BigInt(targetAPY)) {
      runtime.log(`[${user.userId}] Below target, triggering research then rebalance`)

      // Research step
      const positionsSummary = positions
        .map(p => `${p.vaultName}: ${formatAPY(p.apy)} APY, ${formatUSDC(p.balance)}`)
        .join('; ')

      const researchQuery = `My DeFi portfolio weighted average APY dropped to ${formatAPY(weightedAvgAPY)} which is below my target of ${formatAPY(targetAPY)}. ` +
        `Current positions: ${positionsSummary}. ` +
        `What are the latest USDC yield rates across Aave and Euler on Ethereum mainnet? Are there any recent changes or risks I should know about?`

      callResearch(runtime, user.userId, researchQuery)

      // LLM-based rebalance with retry logic
      const rebalanceReq: RebalanceRequest = {
        userId: user.userId,
        totalBalance,
        weightedAverageAPY: weightedAvgAPY,
        targetAPY,
        riskToleranceRating: user.riskToleranceRating,
        positions,
      }

      let validMoves: RebalanceMove[] | null = null

      for (let attempt = 1; attempt <= 3; attempt++) {
        runtime.log(`[${user.userId}] Rebalance attempt ${attempt}/3`)

        try {
          const rebalanceResponse = runtime.runInNodeMode(
            makeRebalanceRequest(rebalanceReq),
            consensusIdenticalAggregation()
          )().result()

          runtime.log(`[${user.userId}] Attempt ${attempt}: Raw response: ${rebalanceResponse.substring(0, 500)}`)

          const parsed = JSON.parse(rebalanceResponse)
          const moves = parsed.moves ?? parsed

          runtime.log(`[${user.userId}] Attempt ${attempt}: Parsed ${Array.isArray(moves) ? moves.length : 'non-array'} moves: ${JSON.stringify(moves).substring(0, 500)}`)

          // Guardrail 1: Schema validation
          if (!validateSchema(moves)) {
            runtime.log(`[${user.userId}] Attempt ${attempt}: Schema validation failed`)
            continue
          }

          // Empty moves = no rebalancing needed per LLM
          if (moves.length === 0) {
            runtime.log(`[${user.userId}] LLM returned empty moves array`)
            break
          }

          // Guardrail 2: Vault whitelist
          if (!validateVaultWhitelist(moves, user.vaults, user.vaultAddresses)) {
            runtime.log(`[${user.userId}] Attempt ${attempt}: Vault whitelist validation failed`)
            continue
          }

          // Guardrail 3: Balance sum
          if (!validateBalanceSum(moves, positions)) {
            runtime.log(`[${user.userId}] Attempt ${attempt}: Balance sum validation failed`)
            continue
          }

          // Guardrail 4: Target APY
          if (!validateTargetAPY(moves, positions, targetAPY, (msg) => runtime.log(`[${user.userId}] Attempt ${attempt}: ${msg}`))) {
            runtime.log(`[${user.userId}] Attempt ${attempt}: Target APY validation failed`)
            continue
          }

          validMoves = moves
          runtime.log(`[${user.userId}] All validations passed on attempt ${attempt}`)
          break
        } catch (e) {
          runtime.log(`[${user.userId}] Attempt ${attempt}: Error - ${String(e)}`)
          continue
        }
      }

      if (validMoves && validMoves.length > 0) {
        const txRecords = executeRebalance(runtime, validMoves)

        const txSummary = txRecords
          .map(tx => {
            const verb = tx.operation === 'withdraw' ? 'Withdrew' : 'Supplied'
            const prep = tx.operation === 'withdraw' ? 'from' : 'to'
            const hashShort = tx.txHash !== 'unknown' ? tx.txHash.slice(0, 8) + '...' : 'unknown'
            return `${verb} ${formatUSDC(tx.amount)} ${prep} ${tx.vaultName} (TX: ${hashShort})`
          })
          .join(', ')

        notifyUser(
          runtime,
          user.userId,
          `Rebalanced your portfolio. ${txSummary}`
        )
      } else if (validMoves === null) {
        // All 3 attempts failed
        runtime.log(`[${user.userId}] All rebalance attempts failed, skipping this cycle`)
      }
    } else {
      runtime.log(`[${user.userId}] Portfolio APY (${formatAPY(weightedAvgAPY)}) is on target (${formatAPY(targetAPY)})`)
    }
  }

  return {
    result,
  }
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
