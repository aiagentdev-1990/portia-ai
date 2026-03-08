export const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

export function toBase64(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  const bytes = new TextEncoder().encode(str)
  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    result += chars[b0 >> 2]
    result += chars[((b0 & 3) << 4) | (b1 >> 4)]
    result += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '='
    result += i + 2 < bytes.length ? chars[b2 & 63] : '='
  }
  return result
}

/**
 * Calculate weighted average APY using BigInt arithmetic.
 * APY is a WAD string (10^18 scale), balance is raw USDC (10^6 scale).
 * Returns a WAD string.
 */
export function calculateWeightedAverageAPY(positions: Array<{ apy: string, balance: number }>): string {
  const totalBalance = positions.reduce((sum, p) => sum + BigInt(p.balance), 0n)
  if (totalBalance === 0n) return '0'
  const weightedSum = positions.reduce(
    (sum, p) => sum + BigInt(p.apy) * BigInt(p.balance),
    0n
  )
  return (weightedSum / totalBalance).toString()
}

/**
 * Format a WAD-scale APY string (10^18) to a human-readable percentage like "6.00%"
 */
export function formatAPY(rawAPY: string): string {
  const n = BigInt(rawAPY)
  // Multiply by 100 first, then divide by 10^18 to get percentage with 2 decimal places
  // We multiply by 10000 (100 * 100) to keep 2 decimal digits, then divide by 10^18
  const scaled = n * 10000n / (10n ** 18n)
  const intPart = scaled / 100n
  const fracPart = scaled % 100n
  const fracStr = fracPart.toString().padStart(2, '0')
  return `${intPart}.${fracStr}%`
}

/**
 * Format a raw USDC balance (10^6 scale) to human-readable like "5,000.00 USDC"
 */
export function formatUSDC(rawBalance: number): string {
  const value = rawBalance / 1_000_000
  const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${formatted} USDC`
}
