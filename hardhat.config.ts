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

const {
  MAINNET_RPC_URL,
  GOERLI_RPC_URL,
  POLYGON_RPC_URL,
  POLYGON_MUMBAI_RPC_URL,
  OPT_RPC_URL,
  OPT_GOERLI_RPC_URL,
  ARB_RPC_URL,
  ARB_GOERLI_RPC_URL,
  HOLESKY_RPC_URL,

  MAINNET_ETHERSCAN_API_KEY,
  POLYGON_ETHERSCAN_API_KEY,
  OPT_ETHERSCAN_API_KEY,
  ARB_ETHERSCAN_API_KEY,

  DEPLOYER_PRIVATE_KEY,
  REPORT_GAS,
} = process.env

const accounts = DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : 'remote'

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
      url: MAINNET_RPC_URL,
      accounts,
    },
    goerli: {
      url: GOERLI_RPC_URL,
      accounts,
    },
    // polygon
    polygon: {
      url: POLYGON_RPC_URL,
      accounts,
    },
    mumbai: {
      url: POLYGON_MUMBAI_RPC_URL,
      accounts,
    },
    // optimism
    optimism: {
      url: OPT_RPC_URL,
      accounts,
    },
    optimisticGoerli: {
      url: OPT_GOERLI_RPC_URL,
      accounts,
    },
    // arbitrum
    arbitrum: {
      url: ARB_RPC_URL,
      accounts,
    },
    arbitrumGoerli: {
      url: ARB_GOERLI_RPC_URL,
      accounts,
    },
    // localhost
    hardhat: {
      forking: {
        url: MAINNET_RPC_URL,
        blockNumber: 13852105,
      },
      chainId: 1337,
    },
    holesky: {
      url: HOLESKY_RPC_URL,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [`0x${process.env.DEPLOYER_PRIVATE_KEY}`]
        : 'remote',
    },
  },
  etherscan: {
    apiKey: {
      // ethereum
      mainnet: MAINNET_ETHERSCAN_API_KEY,
      ropsten: MAINNET_ETHERSCAN_API_KEY,
      rinkeby: MAINNET_ETHERSCAN_API_KEY,
      goerli: MAINNET_ETHERSCAN_API_KEY,
      kovan: MAINNET_ETHERSCAN_API_KEY,
      holesky: MAINNET_ETHERSCAN_API_KEY,
      // polygon
      polygon: POLYGON_ETHERSCAN_API_KEY,
      polygonMumbai: POLYGON_ETHERSCAN_API_KEY,
      // optimism
      optimisticEthereum: OPT_ETHERSCAN_API_KEY,
      optimisticGoerli: OPT_ETHERSCAN_API_KEY,
      // arbitrum
      arbitrumOne: ARB_ETHERSCAN_API_KEY,
      arbitrumGoerli: ARB_ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: 'optimisticGoerli',
        chainId: 420,
        urls: {
          apiURL: 'https://api-goerli-optimistic.etherscan.io/api',
          browserURL: 'https://goerli-optimism.etherscan.io/',
        },
      },
      {
        network: 'arbitrumGoerli',
        chainId: 421613,
        urls: {
          apiURL: 'https://goerli-rollup.arbitrum.io/rpc',
          browserURL: 'https://goerli-rollup-explorer.arbitrum.io/',
        },
      },
      {
        network: 'holesky',
        chainId: 17000,
        urls: {
          apiURL: 'https://api-holesky.etherscan.io/api',
          browserURL: 'https://holesky.etherscan.io/',
        },
      },
    ],
  },
  gasReporter: {
    enabled: REPORT_GAS ? true : false,
  },
  mocha: {
    timeout: 50000,
  },
  dodoc: {
    exclude: ['Clones', 'ReverseRecords', 'SafeTransferLib', 'ERC20'],
  },
  sourcify: {
    enabled: true,
  },
}

export default config
