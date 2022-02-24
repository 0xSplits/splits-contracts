import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { waffle } from 'hardhat'
import fs from 'fs'

// copied from useDapp
enum ChainId {
  Mainnet = 1,
  Ropsten = 3,
  Rinkeby = 4,
  Goerli = 5,
  Kovan = 42,
  BSC = 56,
  xDai = 100,
  Polygon = 137,
  Moonriver = 1285,
  Mumbai = 80001,
  Harmony = 1666600000,
  Localhost = 1337,
  Hardhat = 31337,
}

const CHAIN_NAMES = {
  [ChainId.Mainnet]: 'Mainnet',
  [ChainId.Ropsten]: 'Ropsten',
  [ChainId.Kovan]: 'Kovan',
  [ChainId.Rinkeby]: 'Rinkeby',
  [ChainId.Goerli]: 'Goerli',
  [ChainId.BSC]: 'BSC',
  [ChainId.xDai]: 'xDai',
  [ChainId.Polygon]: 'Polygon',
  [ChainId.Moonriver]: 'Moonriver',
  [ChainId.Mumbai]: 'Mumbai',
  [ChainId.Harmony]: 'Harmony',
  [ChainId.Localhost]: 'Localhost',
  [ChainId.Hardhat]: 'Hardhat',
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, read } = deployments
  const { deployer } = await getNamedAccounts()

  const chainId = (await waffle.provider.getNetwork()).chainId

  console.log({ chainId, deployer }) // eslint-disable-line no-console
  const networkName = CHAIN_NAMES[chainId as ChainId]
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

  if (chainId === ChainId.Hardhat || chainId === ChainId.Localhost) {
    const multicall = await deploy('Multicall2', {
      from: deployer,
      log: true,
    })
    console.log('Multicall: ', multicall.address) // eslint-disable-line no-console
  }
}

export default func
func.tags = ['SplitMain']
