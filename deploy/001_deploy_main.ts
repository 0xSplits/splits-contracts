import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { waffle } from 'hardhat'
import fs from 'fs'

import { Dictionary } from 'lodash'

const HARDHAT = 31337;

const NETWORK_MAP: Dictionary<string> = {
  '1': 'mainnet',
  '3': 'ropsten',
  '1337': 'hardhat',
  '31337': 'hardhat',
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, read } = deployments
  const { deployer } = await getNamedAccounts()

  const chainId = (await waffle.provider.getNetwork()).chainId

  console.log({ chainId, deployer }) // eslint-disable-line no-console
  const networkName = NETWORK_MAP[chainId]
  console.log(`Deploying to ${networkName}`) // eslint-disable-line no-console

  const splitMain = await deploy('SplitMain', {
    from: deployer,
    log: true,
  })

  const info = {
    Contracts: {
      SplitMain: splitMain.address,
      SplitWallet: await read('SplitMain', 'walletImplementation'),
    },
  }

  console.log(info) // eslint-disable-line no-console

  fs.writeFileSync(
    `${__dirname}/../networks/${networkName}.json`,
    JSON.stringify(info, null, 2),
  )

  if (chainId === HARDHAT) {
    const multicall = await deploy('Multicall2', {
      from: deployer,
      log: true,
    })
    console.log('Multicall: ', multicall.address) // eslint-disable-line no-console
  }
}

export default func
func.tags = ['SplitMain']
