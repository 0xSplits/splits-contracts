import { task } from 'hardhat/config'

export default task('reset', 'Reset the network').setAction(
  async (_args, hre) => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [],
    })
    // eslint-disable-next-line no-console
    console.log('Network reset')
  },
)
