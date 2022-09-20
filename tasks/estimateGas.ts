import { task } from 'hardhat/config'
import { AddressZero } from '@ethersproject/constants'
import { BigNumber } from '@ethersproject/bignumber'

import { round } from 'lodash'
import { Align, getMarkdownTable } from 'markdown-table-ts'

const SPLIT_MAIN_ADDRESS = '0x720472c8ce72c2A2D711333e064ABD3E6BbEAdd3'

const NO_DISTRIBUTION_FEE = 0
const SIZES = [2, 5, 10, 25, 50, 100, 200, 500]
const GWEI_TO_ETH = 1e-9
const ETH_PRICE = 1000
const GAS_PRICE = 10

const formatBN = (bn: BigNumber) =>
  bn.toNumber().toLocaleString().replace(/,/g, '_')

const formatBNToCurrency = (
  bn: BigNumber,
  opts: Intl.NumberFormatOptions = {},
) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    ...opts,
  }).format(bn.toNumber() * ETH_PRICE * GAS_PRICE * GWEI_TO_ETH)

/* eslint-disable no-loops/no-loops */
/* eslint-disable no-console */

export default task(
  'estimateGas',
  'Estimate gas values for a variety of 0xSplits transactions',
  // eslint-disable-next-line  no-empty-pattern
).setAction(async ({}, hre) => {
  if (hre.network.name === 'hardhat') {
    console.warn(
      'You are running the createSplit task with Hardhat network, which' +
        ' gets automatically created and destroyed every time. Use the Hardhat' +
        " option '--network localhost'",
    )
  }

  const [signer] = await hre.ethers.getSigners()
  const controller = await signer.getAddress()

  const SplitMain = await hre.ethers.getContractFactory('SplitMain')
  const splitMain = SplitMain.attach(SPLIT_MAIN_ADDRESS).connect(signer)
  const PERCENTAGE_SCALE = hre.ethers.BigNumber.from(1e6)

  const totalGas: string[][] = []
  const perCapitaGas: string[][] = []
  const totalGasUSD: string[][] = []
  const perCapitaGasUSD: string[][] = []

  const accounts = []
  const percentAllocations = []

  console.log(`Generating gas estimates for splits of size ${SIZES}\n`)

  for (let i = 0; i < SIZES.length; i++) {
    const size = SIZES[i]
    process.stdout.write(`${size}${i !== SIZES.length - 1 ? ', ' : '\n'}`)

    accounts.push(
      Array(size)
        .fill(0)
        .map(() => hre.ethers.Wallet.createRandom().address.toLowerCase())
        .sort(),
    )
    percentAllocations.push(
      Array(accounts[i].length).fill(
        hre.ethers.BigNumber.from(
          round((PERCENTAGE_SCALE.toNumber() * 100) / accounts[i].length) / 100,
        ),
      ),
    )

    const createSplitImmutableTx = await splitMain.createSplit(
      accounts[i],
      percentAllocations[i],
      NO_DISTRIBUTION_FEE,
      AddressZero,
    )
    const createSplitImmutableReceipt = await createSplitImmutableTx.wait()
    const splitAddress = createSplitImmutableReceipt.events?.[0]?.args?.split

    const newBalance = hre.ethers.utils.parseEther('100')
    // this is necessary because hex quantities with leading zeros are not valid at the JSON-RPC layer
    const newBalanceHex = hre.ethers.utils.hexStripZeros(
      newBalance.toHexString(),
    )

    await hre.network.provider.send('hardhat_setBalance', [
      splitAddress,
      newBalanceHex,
    ])

    const distributeETHTx1 = await splitMain.distributeETH(
      splitAddress,
      accounts[i],
      percentAllocations[i],
      NO_DISTRIBUTION_FEE,
      controller,
    )
    await distributeETHTx1.wait()

    await hre.network.provider.send('hardhat_setBalance', [
      splitAddress,
      newBalanceHex,
    ])

    const distributeETHTxN = await splitMain.distributeETH(
      splitAddress,
      accounts[i],
      percentAllocations[i],
      NO_DISTRIBUTION_FEE,
      controller,
    )
    const distributeETHNReceipt = await distributeETHTxN.wait()

    // maybe make a fn that maps named inputs to their ordering in table?
    const sizeString = size.toString()
    const gasUsed = [createSplitImmutableReceipt, distributeETHNReceipt].map(
      (r) => r.gasUsed,
    )
    totalGas.push([sizeString, ...gasUsed.map(formatBN)])
    totalGasUSD.push([
      sizeString,
      ...gasUsed.map((bn) =>
        formatBNToCurrency(bn, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      ),
    ])
    perCapitaGas.push([
      sizeString,
      ...gasUsed.map((bn) => formatBN(bn.div(size))),
    ])
    perCapitaGasUSD.push([
      sizeString,
      ...gasUsed.map((bn) =>
        formatBNToCurrency(bn.div(size), {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      ),
    ])
  }

  const head = ['Size', 'Create Split', 'Distribute ETH']
  const alignment = Array(head.length).fill(Align.Right)

  const totalTable = getMarkdownTable({
    table: {
      head,
      body: totalGas,
    },
    alignment,
  })

  console.log()
  console.log('Total Gas')
  console.log(totalTable)

  const perCapitaTable = getMarkdownTable({
    table: {
      head,
      body: perCapitaGas,
    },
    alignment,
  })

  console.log()
  console.log('Gas per Recipient')
  console.log(perCapitaTable)

  const totalTableUSD = getMarkdownTable({
    table: {
      head,
      body: totalGasUSD,
    },
    alignment,
  })

  console.log()
  console.log(
    `Total Gas (in USD assuming ${GAS_PRICE} gwei gas & $${ETH_PRICE} ETH)`,
  )
  console.log(totalTableUSD)

  const perCapitaTableUSD = getMarkdownTable({
    table: {
      head,
      body: perCapitaGasUSD,
    },
    alignment,
  })

  console.log()
  console.log(
    `Gas per Recipient (in USD assuming ${GAS_PRICE} gwei gas & $${ETH_PRICE} ETH)`,
  )
  console.log(perCapitaTableUSD)
})
