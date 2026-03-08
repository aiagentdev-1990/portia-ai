import {
  type Runtime,
  getNetwork,
  EVMClient,
  encodeCallMsg,
  LAST_FINALIZED_BLOCK_NUMBER,
} from "@chainlink/cre-sdk"
import { encodeFunctionData, decodeFunctionResult, bytesToHex, zeroAddress, formatUnits } from "viem"
import { eulerUtilLensABI } from "./abi/euler/utilLensABI"
import { aavePoolABI } from "./abi/aave/poolABI"
import { eulerVaultABI } from "./abi/euler/vaultABI"
import { USDC_ADDRESS } from "./utils"
import type { Config } from "./types"

// Standard ERC-20 balanceOf ABI (used for aToken balance lookups)
const erc20BalanceOfABI = [
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  }
] as const

export const getSupplyAPY = (runtime: Runtime<Config>, vaultName: string, vaultAddress: `0x${string}`): bigint => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.evms[0].chainName,
    isTestnet: false
  });

  const evmClient = new EVMClient(network!.chainSelector.selector)

  if (vaultName === 'aave') {
    const callData = encodeFunctionData({
      abi: aavePoolABI,
      functionName: "getReserveData",
      args: [USDC_ADDRESS as `0x${string}`]
    })

    const contractCall = evmClient.callContract(
      runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: vaultAddress,
          data: callData
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER
      }).result();

    const reserveData = decodeFunctionResult({
      abi: aavePoolABI,
      functionName: "getReserveData",
      data: bytesToHex(contractCall.data)
    }) as any

    const rawRate = BigInt(reserveData.currentLiquidityRate) / 1000000000n
    const apyPercent = Number(formatUnits(rawRate, 18)) * 100
    runtime.log(`[getSupplyAPY] Aave: ${apyPercent.toFixed(4)}%`)
    return rawRate

  } else {
    const eulerUtilLens = runtime.config.evms[2]

    const callData = encodeFunctionData({
      abi: eulerUtilLensABI,
      functionName: "getAPYs",
      args: [vaultAddress]
    })

    const contractCall = evmClient.callContract(
      runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: eulerUtilLens.storageAddress as `0x${string}`,
          data: callData
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER
      }).result();

    const [, supplyAPY] = decodeFunctionResult({
      abi: eulerUtilLensABI,
      functionName: "getAPYs",
      data: bytesToHex(contractCall.data)
    }) as [bigint, bigint]

    const normalizedAPY = supplyAPY / 1000000000n
    const apyPercent = Number(formatUnits(normalizedAPY, 18)) * 100
    runtime.log(`[getSupplyAPY] ${vaultName}: ${apyPercent.toFixed(4)}%`)
    return normalizedAPY
  }
}

export const getUserBalance = (
  runtime: Runtime<Config>,
  vaultName: string,
  vaultAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  aTokenAddress?: `0x${string}`
): bigint => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.evms[0].chainName,
    isTestnet: false
  });

  const evmClient = new EVMClient(network!.chainSelector.selector)

  if (vaultName === 'aave') {
    if (!aTokenAddress) {
      return 0n
    }

    const callData = encodeFunctionData({
      abi: erc20BalanceOfABI,
      functionName: "balanceOf",
      args: [walletAddress]
    })

    const contractCall = evmClient.callContract(
      runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: aTokenAddress,
          data: callData
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER
      }).result();

    const balance = decodeFunctionResult({
      abi: erc20BalanceOfABI,
      functionName: "balanceOf",
      data: bytesToHex(contractCall.data)
    }) as bigint

    return balance

  } else {
    const sharesCallData = encodeFunctionData({
      abi: eulerVaultABI,
      functionName: "balanceOf",
      args: [walletAddress]
    })

    const sharesCall = evmClient.callContract(
      runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: vaultAddress,
          data: sharesCallData
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER
      }).result();

    const shares = decodeFunctionResult({
      abi: eulerVaultABI,
      functionName: "balanceOf",
      data: bytesToHex(sharesCall.data)
    }) as bigint

    if (shares === 0n) {
      return 0n
    }

    const convertCallData = encodeFunctionData({
      abi: eulerVaultABI,
      functionName: "convertToAssets",
      args: [shares]
    })

    const convertCall = evmClient.callContract(
      runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: vaultAddress,
          data: convertCallData
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER
      }).result();

    const assets = decodeFunctionResult({
      abi: eulerVaultABI,
      functionName: "convertToAssets",
      data: bytesToHex(convertCall.data)
    }) as bigint

    return assets
  }
}

export const getATokenAddress = (
  runtime: Runtime<Config>,
  vaultAddress: `0x${string}`
): `0x${string}` => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.evms[0].chainName,
    isTestnet: false
  });

  const evmClient = new EVMClient(network!.chainSelector.selector)

  const callData = encodeFunctionData({
    abi: aavePoolABI,
    functionName: "getReserveData",
    args: [USDC_ADDRESS as `0x${string}`]
  })

  const contractCall = evmClient.callContract(
    runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: vaultAddress,
        data: callData
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER
    }).result();

  const reserveData = decodeFunctionResult({
    abi: aavePoolABI,
    functionName: "getReserveData",
    data: bytesToHex(contractCall.data)
  }) as any

  return reserveData.aTokenAddress as `0x${string}`
}
