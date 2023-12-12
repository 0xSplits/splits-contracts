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
  Optimism = 10,
  Kovan = 42,
  BSC = 56,
  xDai = 100,
  Polygon = 137,
  OptimismGoerli = 420,
  OptimismSepolia = 11155420,
  Moonriver = 1285,
  Arbitrum = 42161,
  ArbitrumGoerli = 421613,
  Mumbai = 80001,
  Harmony = 1666600000,
  Localhost = 1337,
  Hardhat = 31337,
}

const CHAIN_NAMES = {
  [ChainId.Mainnet]: 'Mainnet',
  [ChainId.Ropsten]: 'Ropsten',
  [ChainId.Optimism]: 'Optimism',
  [ChainId.Kovan]: 'Kovan',
  [ChainId.Rinkeby]: 'Rinkeby',
  [ChainId.Goerli]: 'Goerli',
  [ChainId.BSC]: 'BSC',
  [ChainId.xDai]: 'xDai',
  [ChainId.Polygon]: 'Polygon',
  [ChainId.OptimismGoerli]: 'Optimism-Goerli',
  [ChainId.OptimismSepolia]: 'Optimism-Sepolia',
  [ChainId.Moonriver]: 'Moonriver',
  [ChainId.Mumbai]: 'Mumbai',
  [ChainId.Arbitrum]: 'Arbitrum',
  [ChainId.ArbitrumGoerli]: 'Arbitrum-Goerli',
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
}

export default func
func.tags = ['SplitMain']
