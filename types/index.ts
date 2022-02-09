import { BigNumber } from 'ethers'
import { Dictionary } from 'lodash'

export type IAccount = string | null | undefined

export type IBalance = Dictionary<BigNumber>

export type ISplit = {
  createdBy: string
  address: string
  balances: IBalance
  pending: IBalance
  earnings: IBalance
  recipients: IRecipient[]
  distributionFee: number
  controller: string
  newPotentialController: string
  hash: string
}

export type IRecipient = {
  address: string
  ownership: number
  ens?: string
}
