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
  BSCTestnet = 97,
  Gnosis = 100,
  Polygon = 137,
  Ftm = 250,
  OptimismGoerli = 420,
  ZoraGoerli = 999,
  Moonriver = 1285,
  FtmTest = 4002,
  Base = 8453,
  GnosisChiado = 10200,
  Arbitrum = 42161,
  AvalancheFujiTestnet = 43113,
  Avalanche = 43114,
  Mumbai = 80001,
  BaseGoerli = 84531,
  BaseSepolia = 84532,
  ArbitrumGoerli = 421613,
  Zora = 7777777,
  Aurora = 1313161554,
  AuroraTestnet = 1313161555,
  Harmony = 1666600000,
  Localhost = 1337,
  Hardhat = 31337,
  BlastSepolia = 168587773,
  Blast = 81457,
}

const CHAIN_NAMES = {
  [ChainId.Mainnet]: 'Mainnet',
  [ChainId.Ropsten]: 'Ropsten',
  [ChainId.Optimism]: 'Optimism',
  [ChainId.Kovan]: 'Kovan',
  [ChainId.Rinkeby]: 'Rinkeby',
  [ChainId.Goerli]: 'Goerli',
  [ChainId.BSC]: 'BSC',
  [ChainId.BSCTestnet]: 'BSC-Testnet',
  [ChainId.Gnosis]: 'Gnosis',
  [ChainId.GnosisChiado]: 'Gnosis-Chiado',
  [ChainId.Polygon]: 'Polygon',
  [ChainId.OptimismGoerli]: 'Optimism-Goerli',
  [ChainId.Moonriver]: 'Moonriver',
  [ChainId.Mumbai]: 'Mumbai',
  [ChainId.Arbitrum]: 'Arbitrum',
  [ChainId.ArbitrumGoerli]: 'Arbitrum-Goerli',
  [ChainId.Ftm]: 'FTM',
  [ChainId.FtmTest]: 'FTM-Testnet',
  [ChainId.AvalancheFujiTestnet]: 'Avalanche-Fuji',
  [ChainId.Avalanche]: 'Avalanche',
  [ChainId.Zora]: 'Zora',
  [ChainId.ZoraGoerli]: 'Zora-Goerli',
  [ChainId.Base]: 'Base',
  [ChainId.BaseGoerli]: 'Base-Goerli',
  [ChainId.BaseSepolia]: 'Base-Sepolia',
  [ChainId.Aurora]: 'Aurora',
  [ChainId.AuroraTestnet]: 'Aurora-Testnet',
  [ChainId.Harmony]: 'Harmony',
  [ChainId.Localhost]: 'Localhost',
  [ChainId.Hardhat]: 'Hardhat',
  [ChainId.BlastSepolia]: 'Blast-Sepolia',
  [ChainId.Blast]: 'Blast',
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
