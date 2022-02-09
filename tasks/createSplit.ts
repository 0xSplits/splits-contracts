import { task, types } from 'hardhat/config'
import { AddressZero } from '@ethersproject/constants'

import { round } from 'lodash'

export default task('createSplit', 'Creates a split with even ownership')
  .addParam(
    'address',
    'The address of SplitMain',
    '0x720472c8ce72c2A2D711333e064ABD3E6BbEAdd3',
  )
  .addParam('size', 'The number of recipients', 2, types.int)
  .addParam('controller', 'The controller of the split', AddressZero)
  .setAction(
    async (
      {
        address,
        size,
        controller,
      }: { address: string; size: number; controller: string },
      hre,
    ) => {
      if (hre.network.name === 'hardhat') {
        // eslint-disable-next-line no-console
        console.warn(
          'You are running the createSplit task with Hardhat network, which' +
            ' gets automatically created and destroyed every time. Use the Hardhat' +
            " option '--network localhost'",
        )
      }

      const SplitMain = await hre.ethers.getContractFactory('SplitMain')
      const splitMain = SplitMain.attach(address)
      const PERCENTAGE_SCALE = hre.ethers.BigNumber.from(1e6)

      const accounts = Array(size)
        .fill(0)
        .map(() => hre.ethers.Wallet.createRandom().address.toLowerCase())
        .sort()
      const percentAllocations = Array(accounts.length).fill(
        hre.ethers.BigNumber.from(
          round((PERCENTAGE_SCALE.toNumber() * 100) / accounts.length) / 100,
        ),
      )
      const distributionFee = hre.ethers.BigNumber.from(
        PERCENTAGE_SCALE.toNumber() / 100,
      )

      const tx = await splitMain.createSplit(
        accounts,
        percentAllocations,
        distributionFee,
        controller,
      )
      await tx.wait()

      // eslint-disable-next-line no-console
      console.log(`Split created with ${size} recipients`)
    },
  )
