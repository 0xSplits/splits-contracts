import { utils } from 'ethers'
import { AddressZero } from '@ethersproject/constants'
import { filter } from 'lodash'

import { MIN_TOKEN_BALANCE } from 'constants/splits'
import { IAccount, ISplit, IRecipient, IBalance } from 'types'

export const isMutable: (arg0: ISplit) => boolean = (split) =>
  split.controller !== AddressZero

export const ownershipOf: (arg0: IAccount, arg1: ISplit) => number = (
  address,
  split,
) =>
  (
    filter(split?.recipients, {
      address,
    }) as IRecipient[]
  ).reduce((acc, recipient) => acc + recipient.ownership, 0)

export const checkForBalance: (arg0: IBalance) => boolean = (balance) =>
  Object.values(balance).some((amount) => amount.gt(MIN_TOKEN_BALANCE))

export const hashSplit: (
  arg0: string[],
  arg1: number[],
  arg2: number,
) => string = (accounts, percentAllocations, distributionFee) => {
  return utils.solidityKeccak256(
    ['address[]', 'uint32[]', 'uint32'],
    [accounts, percentAllocations, distributionFee],
  )
}
