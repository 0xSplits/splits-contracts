import { BigNumber } from 'ethers'
import { Two } from '@ethersproject/constants'

export const PERCENTAGE_SCALE = BigNumber.from(1e6)

// Use two for the min balance because of the erc20 tokens. The min
// is actually One for eth, but this will handle both.
export const MIN_TOKEN_BALANCE = Two

// Min & max distribution fee (0-10%)
export const MIN_DISTRIBUTION_FEE = 0
export const MAX_DISTRIBUTION_FEE = 10
