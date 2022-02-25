import { HardhatUserConfig } from 'hardhat/types'
import '@typechain/hardhat'
import '@typechain/ethers-v5'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-solhint'
import 'hardhat-deploy'
// import 'hardhat-deploy-ethers'
import 'hardhat-gas-reporter'
import 'solidity-coverage'
import '@primitivefi/hardhat-dodoc'
import '@nomiclabs/hardhat-etherscan'

import 'tsconfig-paths/register'

// import tasks
import 'tasks/reset'
import 'tasks/createSplit'
import 'tasks/seedAccount'
import 'tasks/estimateGas'

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const config: HardhatUserConfig = {
  // solidity: '0.8.4',
  solidity: {
    compilers: [
      {
        version: '0.8.4',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
            // runs: 999999,
          },
        },
      },
      {
        version: '0.5.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  // typechain: {
  //   outDir: 'src/types',
  //   target: 'ethers-v5',
  // },
  namedAccounts: {
    deployer: 0,
  },
  networks: {
    // ethereum
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        : 'remote',
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        : 'remote',
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        : 'remote',
    },
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        : 'remote',
    },
    kovan: {
      url: `https://eth-kovan.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        : 'remote',
    },
    // polygon
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        : 'remote',
    },
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        : 'remote',
    },
    // localhost
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 13852105,
      },
      chainId: 1337,
    },
  },
  etherscan: {
    apiKey: process.env.POLYGON_ETHERSCAN_API_KEY,
    // object structure needs us to upgrade hardhat to ^3.0.0 I think
    // until then, swap out env as needed
    // apiKey: {
    //   // ethereum
    //   mainnet: process.env.MAINNET_ETHERSCAN_API_KEY,
    //   ropsten: process.env.MAINNET_ETHERSCAN_API_KEY,
    //   rinkeby: process.env.MAINNET_ETHERSCAN_API_KEY,
    //   goerli: process.env.MAINNET_ETHERSCAN_API_KEY,
    //   kovan: process.env.MAINNET_ETHERSCAN_API_KEY,
    //   // polygon
    //   polygon: process.env.POLYGON_ETHERSCAN_API_KEY,
    //   polygonMumbai: process.env.POLYGON_ETHERSCAN_API_KEY,
    // },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
  },
  mocha: {
    timeout: 50000,
  },
  dodoc: {
    exclude: [
      'Clones',
      'Multicall2',
      'ReverseRecords',
      'SafeTransferLib',
      'ERC20',
      'TestInternalTxn',
    ],
  },
}

export default config
