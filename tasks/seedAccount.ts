import { task } from 'hardhat/config'
import { ierc20Interface } from 'utils/ierc20'

const DAI_ADDRESS = '0x6b175474e89094c44da98b954eedeac495271d0f'
const DAI_WHALE = '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7'

export default task('seedAccount', 'Seeds the account with ETH and DAI')
  .addPositionalParam('account', 'Address to seed')
  .setAction(async ({ account }: { account: string }, hre) => {
    if (hre.network.name === 'hardhat') {
      // eslint-disable-next-line no-console
      console.warn(
        'You are running the faucet task with Hardhat network, which' +
          ' gets automatically created and destroyed every time. Use the Hardhat' +
          " option '--network localhost'",
      )
    }

    const newBalance = hre.ethers.utils.parseEther('100')
    // this is necessary because hex quantities with leading zeros are not valid at the JSON-RPC layer
    const newBalanceHex = hre.ethers.utils.hexStripZeros(
      newBalance.toHexString(),
    )

    await hre.network.provider.send('hardhat_setBalance', [
      account,
      newBalanceHex,
    ])

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [DAI_WHALE],
    })

    const signer = await hre.ethers.getSigner(DAI_WHALE)

    await hre.network.provider.send('hardhat_setBalance', [
      DAI_WHALE,
      hre.ethers.utils.hexStripZeros(
        hre.ethers.utils.parseEther('1').toHexString(),
      ),
    ])

    const erc20Contract = new hre.ethers.Contract(
      DAI_ADDRESS,
      ierc20Interface,
      signer,
    )
    const tx = await erc20Contract.transfer(
      account,
      hre.ethers.utils.parseUnits('10000', 18),
    )
    await tx.wait()

    await hre.network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [DAI_WHALE],
    })

    // eslint-disable-next-line no-console
    console.log(`Account ${account} seeded`)
  })
