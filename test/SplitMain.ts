import { ethers, network, waffle } from 'hardhat'
import { expect } from 'chai'
import { Contract, ContractTransaction, Signer, BigNumber } from 'ethers'
import { Zero, One, Two, AddressZero } from '@ethersproject/constants'
import { TransactionResponse } from '@ethersproject/abstract-provider'
import { hashSplit } from 'utils/splits'
import { ierc20Interface } from 'utils/ierc20'
import { PERCENTAGE_SCALE } from 'constants/splits'
import { getRandomAllocations, getRandomItem } from './helpers'
import { sortBy, round, shuffle, sum, random, uniq } from 'lodash'

import type { SplitMain, SplitWallet } from 'typechain'

/* eslint-disable no-loops/no-loops */

const { loadFixture, deployMockContract } = waffle

const DAI_ADDRESS = ethers.utils.getAddress(
  '0x6b175474e89094c44da98b954eedeac495271d0f',
)
const DAI_WHALE = ethers.utils.getAddress(
  '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
)

const ETH_BALANCES_SLOT = 0
const ERC20_BALANCES_SLOT = 1

type CustomTestConfig = Partial<{
  accounts: string[]
  percentAllocations: number[]
  distributorFee: number
  controller: string
  ethProxyBalance: BigNumber
  ethMainBalance: BigNumber
  erc20ProxyBalance: BigNumber
  erc20MainBalance: BigNumber
}>

describe('SplitMain', function () {
  let provider: typeof ethers.provider
  let allSigners: Signer[]
  let signer: Signer
  let account: string
  let allAccounts: string[]
  let splitMain: SplitMain
  let splitWallet: SplitWallet
  let accounts: string[]
  let percentAllocations: number[]
  let distributorFee: number
  let controller: string
  let newPotentialController: string
  let splitAddress: string
  let ethProxyBalance: BigNumber
  let ethMainBalance: BigNumber
  let ethBalance: BigNumber
  let erc20Whale: Signer
  let erc20Contract: Contract
  let erc20ProxyBalance: BigNumber
  let erc20MainBalance: BigNumber
  let erc20Balance: BigNumber

  let createSplitTx: Promise<ContractTransaction>
  let predictedSplitAddress: string

  before(async () => {
    provider = ethers.provider
    allSigners = await ethers.getSigners()
    signer = getRandomItem(allSigners)
    account = await signer.getAddress()
    allAccounts = await Promise.all(allSigners.map((s) => s.getAddress()))
    allAccounts = sortBy(allAccounts, (acc) => acc.toLowerCase())
  })

  afterEach(async function () {
    if (this.currentTest?.state === 'failed')
      // eslint-disable-next-line no-console
      console.log({
        title: this.currentTest?.title,
        signer: await signer.getAddress(),
        account,
        accounts,
        percentAllocations,
        distributorFee,
        controller,
        splitAddress,
        ethProxyBalance,
        erc20ProxyBalance,
        erc20MainBalance,
        erc20Balance,
      })
  })

  const addressProvider = (addr: string) => ({
    provider,
    getAddress: () => addr,
  })

  const generateRandomSplit = (customConfig: CustomTestConfig = {}) => {
    accounts =
      customConfig.accounts ??
      sortBy(
        shuffle([...allAccounts]).slice(
          0,
          customConfig?.percentAllocations?.length ??
            Math.max(2, random(allAccounts.length - 1)),
        ),
        (acc) => acc.toLowerCase(),
      )
    percentAllocations =
      customConfig?.percentAllocations ?? getRandomAllocations(accounts.length)
    distributorFee =
      customConfig.distributorFee ??
      Math.max(round((PERCENTAGE_SCALE.toNumber() / 10) * Math.random()), 1)
    controller =
      customConfig.controller ?? getRandomItem(allAccounts.concat(AddressZero))
  }

  const testSetup__deploy =
    (customConfig: CustomTestConfig = {}) =>
    async () => {
      const SplitMain = await ethers.getContractFactory('SplitMain')
      splitMain = (await SplitMain.deploy()) as SplitMain
      await splitMain.deployed()
      generateRandomSplit(customConfig)
    }

  const testSetup__createSplit =
    (customConfig: CustomTestConfig = {}) =>
    async () => {
      await loadFixture(testSetup__deploy(customConfig))
      createSplitTx = splitMain
        .connect(signer)
        .createSplit(accounts, percentAllocations, distributorFee, controller)
      const receipt = await (await createSplitTx).wait()
      splitAddress =
        receipt.events?.[0]?.args?.split &&
        ethers.utils.getAddress(receipt.events[0]?.args?.split)
    }

  const testSetup__transferControl =
    (customConfig: CustomTestConfig = {}) =>
    async () => {
      await loadFixture(testSetup__createSplit(customConfig))
      do {
        newPotentialController = getRandomItem(allAccounts)
      } while (newPotentialController === account)
      await splitMain
        .connect(await ethers.getSigner(controller))
        .transferControl(splitAddress, newPotentialController)
    }

  const testSetup__depositETHToSplit =
    (customConfig: CustomTestConfig = {}) =>
    async () => {
      await loadFixture(testSetup__createSplit(customConfig))
      ethProxyBalance =
        customConfig.ethProxyBalance ??
        ethers.utils.parseEther((10 * Math.random()).toFixed(18)).add(One)
      ethMainBalance =
        customConfig.ethMainBalance ??
        ethers.utils.parseEther((10 * Math.random()).toFixed(18)).add(One)
      ethBalance = ethMainBalance.add(ethProxyBalance)
      await signer.sendTransaction({
        to: splitAddress,
        value: ethProxyBalance,
      })
      const index = ethers.utils.solidityKeccak256(
        ['uint256', 'uint256'],
        [splitAddress, ETH_BALANCES_SLOT], // key, slot
      )
      await network.provider.request({
        method: 'hardhat_setStorageAt',
        params: [
          splitMain.address,
          ethers.utils.hexStripZeros(index),
          ethers.utils.hexZeroPad(ethMainBalance.toHexString(), 32),
        ],
      })
    }

  const testSetup__depositAndSplitETH =
    (customConfig: CustomTestConfig = {}) =>
    async () => {
      await loadFixture(
        testSetup__depositETHToSplit({ ...customConfig, ethMainBalance: Zero }),
      )
      await splitMain
        .connect(signer)
        .distributeETH(
          splitAddress,
          accounts,
          percentAllocations,
          distributorFee,
          account,
        )
    }

  const testSetup__attachToSplitWallet = () => async () => {
    const SplitWallet = await ethers.getContractFactory('SplitWallet')
    const splitWalletAddress = await splitMain.walletImplementation()
    splitWallet = SplitWallet.attach(splitWalletAddress) as SplitWallet
  }

  const testSetup__mockERC20 = () => async () => {
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [DAI_WHALE],
    })
    erc20Whale = await ethers.getSigner(DAI_WHALE)
    await network.provider.send('hardhat_setBalance', [
      DAI_WHALE,
      ethers.utils.hexStripZeros(ethers.utils.parseEther('1').toHexString()),
    ])
    erc20Contract = new Contract(DAI_ADDRESS, ierc20Interface, erc20Whale)
  }

  const testSetup__depositERC20ToSplit =
    (customConfig: CustomTestConfig = {}) =>
    async () => {
      await loadFixture(testSetup__createSplit(customConfig))
      await loadFixture(testSetup__mockERC20())
      erc20ProxyBalance =
        customConfig.erc20ProxyBalance ??
        ethers.utils.parseEther((10 * Math.random()).toFixed(18)).add(One)
      erc20MainBalance =
        customConfig.erc20MainBalance ??
        ethers.utils.parseEther((10 * Math.random()).toFixed(18)).add(One)
      erc20Balance = erc20ProxyBalance.add(erc20MainBalance)
      await erc20Contract
        .connect(erc20Whale)
        .transfer(splitAddress, erc20ProxyBalance)
      const index = ethers.utils.solidityKeccak256(
        ['uint256', 'bytes32'],
        [
          splitAddress,
          ethers.utils.solidityKeccak256(
            ['uint256', 'uint256'],
            [DAI_ADDRESS, ERC20_BALANCES_SLOT], // key, slot
          ),
        ], // key, slot
      )
      await network.provider.request({
        method: 'hardhat_setStorageAt',
        params: [
          splitMain.address,
          ethers.utils.hexStripZeros(index),
          ethers.utils.hexZeroPad(erc20MainBalance.toHexString(), 32),
        ],
      })
    }

  const testSetup__depositAndSplitERC20 =
    (customConfig: CustomTestConfig = {}) =>
    async () => {
      await loadFixture(
        testSetup__depositERC20ToSplit({
          ...customConfig,
          erc20MainBalance: Zero,
        }),
      )
      await splitMain
        .connect(signer)
        .distributeERC20(
          splitAddress,
          erc20Contract.address,
          accounts,
          percentAllocations,
          distributorFee,
          account,
        )
    }

  async function testSetup__impersonateAccount(
    address: string,
    callback: (signer: Signer) => Promise<void>,
  ) {
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [address],
    })
    const signer = await ethers.getSigner(address)
    await network.provider.send('hardhat_setBalance', [
      address,
      ethers.utils.hexStripZeros(ethers.utils.parseEther('100').toHexString()),
    ])
    await callback(signer)
    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [splitMain.address],
    })
  }

  const testModifier__validSplit = ({
    beforeEachCB,
    expectCB,
  }: {
    beforeEachCB?: () => Promise<void>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectCB: () => Promise<any>
  }) => {
    describe('validSplit', function () {
      beforeEachCB && beforeEach(beforeEachCB)

      it('Should revert if less than two accounts provided', async function () {
        accounts = []
        percentAllocations = []
        await expect(expectCB()).to.be.revertedWith(
          `InvalidSplit__TooFewAccounts(${accounts.length})`,
        )
        accounts = [account]
        percentAllocations = [PERCENTAGE_SCALE.toNumber()]
        await expect(expectCB()).to.be.revertedWith(
          `InvalidSplit__TooFewAccounts(${accounts.length})`,
        )
      })

      it('Should check array lengths match', async function () {
        percentAllocations = getRandomAllocations(accounts.length + 1)
        await expect(expectCB()).to.be.revertedWith(
          `InvalidSplit__AccountsAndAllocationsMismatch(${accounts.length}, ${percentAllocations.length})`,
        )
        percentAllocations = getRandomAllocations(accounts.length - 1)
        await expect(expectCB()).to.be.revertedWith(
          `InvalidSplit__AccountsAndAllocationsMismatch(${accounts.length}, ${percentAllocations.length})`,
        )
      })

      it('Should check all allocations sum to 100%', async function () {
        percentAllocations[random(percentAllocations.length - 1)] += 1
        await expect(expectCB()).to.be.revertedWith(
          `InvalidSplit__InvalidAllocationsSum(${sum(percentAllocations)})`,
        )
        percentAllocations[random(percentAllocations.length - 1)] -= 2
        await expect(expectCB()).to.be.revertedWith(
          `InvalidSplit__InvalidAllocationsSum(${sum(percentAllocations)})`,
        )
      })

      it('Should check accounts are ordered properly', async function () {
        const randIndexBig = random(1, accounts.length - 1)
        const randIndexSmall = random(randIndexBig - 1)
        const temp = accounts[randIndexBig]
        accounts[randIndexBig] = accounts[randIndexSmall]
        accounts[randIndexSmall] = temp
        await expect(expectCB()).to.be.revertedWith(
          `InvalidSplit__AccountsOutOfOrder(${randIndexSmall})`,
        )
      })

      it('Should check all allocations are non-zero', async function () {
        const zeroIndex = random(percentAllocations.length - 1)
        percentAllocations[(zeroIndex || percentAllocations.length) - 1] +=
          percentAllocations[zeroIndex]
        percentAllocations[zeroIndex] = 0
        await expect(expectCB()).to.be.revertedWith(
          `InvalidSplit__AllocationMustBePositive(${zeroIndex})`,
        )
      })

      it('Should overflow if an allocation is negative', async function () {
        const negativeIndex = random(percentAllocations.length - 1)
        percentAllocations[(negativeIndex || percentAllocations.length) - 1] +=
          2 * percentAllocations[negativeIndex]
        percentAllocations[negativeIndex] = -percentAllocations[negativeIndex]
        await expect(expectCB()).to.be.reverted
      })

      it('Should revert if distributorFee is above 10%', async function () {
        distributorFee = PERCENTAGE_SCALE.div(10).toNumber() + 1
        await expect(expectCB()).to.be.revertedWith(
          `InvalidSplit__InvalidDistributorFee(${distributorFee})`,
        )
      })
    })
  }

  const testBase__updateSplit = ({
    beforeEachCB,
    expectCB,
  }: {
    beforeEachCB?: () => Promise<void>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectCB: (signer_?: Signer) => Promise<any>
  }) => {
    describe('UpdateSplit', function () {
      beforeEachCB && beforeEach(beforeEachCB)

      it('Should emit UpdateSplit event with expected split address', async function () {
        await expect(expectCB())
          .to.emit(splitMain, 'UpdateSplit')
          .withArgs(splitAddress, accounts, percentAllocations, distributorFee)
      })

      it('Correctly updates the hash', async function () {
        generateRandomSplit({ controller })
        await expectCB()
        const hash = await splitMain.getHash(splitAddress)
        const expectedHash = hashSplit(
          accounts,
          percentAllocations,
          distributorFee,
        )
        expect(hash).to.equal(expectedHash)
      })

      it('Should revert if a non-controller sends tx', async function () {
        let newAccount: string
        do {
          newAccount = getRandomItem(allAccounts)
        } while (newAccount === account)
        const newSigner = await ethers.getSigner(newAccount)
        await expect(expectCB(newSigner)).to.be.revertedWith(
          `Unauthorized("${newAccount}")`,
        )
      })
    })
  }

  describe('base', function () {
    beforeEach(async () => {
      await loadFixture(testSetup__deploy())
    })

    it('Should create a SplitWallet on deployment', async function () {
      expect(await splitMain.walletImplementation()).to.be.properAddress
    })

    it('Should be able to receive ETH', async function () {
      ethProxyBalance = ethers.utils.parseEther(Math.random().toFixed(18))
      await expect(() =>
        signer.sendTransaction({
          to: splitMain.address,
          value: ethProxyBalance,
        }),
      ).to.changeEtherBalances(
        [signer, addressProvider(splitMain.address)],
        [ethProxyBalance.mul(-1), ethProxyBalance],
      )
    })
  })

  describe('createSplit', function () {
    const testFn__createSplit = (acc: string) => () => {
      beforeEach(async () => {
        await loadFixture(testSetup__createSplit({ controller: acc }))
      })

      it('Should emit CreateSplit event with expected args', async function () {
        await expect(createSplitTx)
          .to.emit(splitMain, 'CreateSplit')
          .withArgs(
            splitAddress,
            accounts,
            percentAllocations,
            distributorFee,
            controller,
          )
      })

      if (acc === AddressZero)
        it('Should revert if recreating split', async function () {
          await expect(
            splitMain.createSplit(
              accounts,
              percentAllocations,
              distributorFee,
              controller,
            ),
          ).to.be.revertedWith('Create2Error()')
        })
      else
        it('Should not revert if recreating mutable split', async function () {
          await expect(
            splitMain.createSplit(
              accounts,
              percentAllocations,
              distributorFee,
              controller,
            ),
          ).to.not.be.reverted
        })

      it(`Should set the hash`, async function () {
        const hash = await splitMain.getHash(splitAddress)
        const expectedHash = hashSplit(
          accounts,
          percentAllocations,
          distributorFee,
        )
        expect(hash).to.equal(expectedHash)
      })

      it(`Should set the controller`, async function () {
        const splitController = await splitMain.getController(splitAddress)
        expect(splitController).to.equal(controller)
      })

      it('Should leave newPotentialController blank', async function () {
        newPotentialController = await splitMain.getNewPotentialController(
          splitAddress,
        )
        expect(newPotentialController).to.equal(AddressZero)
      })
    }

    describe('immutable', testFn__createSplit(AddressZero))
    describe('mutable', testFn__createSplit(account))

    testModifier__validSplit({
      beforeEachCB: async () => {
        await loadFixture(
          testSetup__deploy({
            controller: AddressZero,
          }),
        )
      },
      expectCB: () =>
        splitMain.createSplit(
          accounts,
          percentAllocations,
          distributorFee,
          controller,
        ),
    })
  })

  describe('predictImmutableSplitAddress', function () {
    describe('base', function () {
      beforeEach(async () => {
        await loadFixture(testSetup__createSplit({ controller: AddressZero }))
      })

      it('Correctly predicts the address', async function () {
        predictedSplitAddress = await splitMain.predictImmutableSplitAddress(
          accounts,
          percentAllocations,
          distributorFee,
        )
        expect(predictedSplitAddress).to.equal(splitAddress)
      })
    })

    testModifier__validSplit({
      beforeEachCB: async () => {
        await loadFixture(
          testSetup__deploy({
            controller: AddressZero,
          }),
        )
      },
      expectCB: () =>
        splitMain.predictImmutableSplitAddress(
          accounts,
          percentAllocations,
          distributorFee,
        ),
    })
  })

  describe('updateSplit', function () {
    let tx: (signer_?: Signer) => Promise<ContractTransaction>

    before(() => {
      tx = (signer_: Signer = signer) =>
        splitMain
          .connect(signer_)
          .updateSplit(
            splitAddress,
            accounts,
            percentAllocations,
            distributorFee,
          )
    })

    testBase__updateSplit({
      beforeEachCB: async () => {
        await loadFixture(
          testSetup__createSplit({
            controller: account,
          }),
        )
      },
      expectCB: (signer_) => tx(signer_),
    })

    testModifier__validSplit({
      beforeEachCB: async () => {
        await loadFixture(
          testSetup__createSplit({
            controller: account,
          }),
        )
      },
      expectCB: () => tx(),
    })
  })

  describe('transferControl', function () {
    beforeEach(async () => {
      await loadFixture(testSetup__createSplit({ controller: account }))
    })

    it('Should set newPotentialController', async function () {
      newPotentialController = getRandomItem(allAccounts)
      await splitMain
        .connect(signer)
        .transferControl(splitAddress, newPotentialController)
      const expectedNewPotentialController =
        await splitMain.getNewPotentialController(splitAddress)
      expect(expectedNewPotentialController).to.equal(newPotentialController)
    })

    it('Should emit InitiateControlTransfer with the expected args', async function () {
      newPotentialController = getRandomItem(allAccounts)
      await expect(
        splitMain
          .connect(signer)
          .transferControl(splitAddress, newPotentialController),
      )
        .to.emit(splitMain, 'InitiateControlTransfer')
        .withArgs(splitAddress, newPotentialController)
    })

    it('Should revert if transfer is attempted to Address(0)', async function () {
      newPotentialController = AddressZero
      await expect(
        splitMain
          .connect(signer)
          .transferControl(splitAddress, newPotentialController),
      ).to.be.revertedWith(`InvalidNewController("${newPotentialController}")`)
    })

    it('Should revert if a non-controller sends tx', async function () {
      let newAccount: string
      do {
        newAccount = getRandomItem(allAccounts)
      } while (newAccount === account)
      const newSigner = await ethers.getSigner(newAccount)
      await expect(
        splitMain.connect(newSigner).transferControl(splitAddress, newAccount),
      ).to.be.revertedWith(`Unauthorized("${newAccount}")`)
    })
  })

  describe('cancelControlTransfer', function () {
    beforeEach(async () => {
      await loadFixture(testSetup__transferControl({ controller: account }))
    })

    it('Should delete newPotentialController', async function () {
      await splitMain.connect(signer).cancelControlTransfer(splitAddress)
      expect(await splitMain.getNewPotentialController(splitAddress)).to.equal(
        AddressZero,
      )
    })

    it('Should emit CancelControlTransfer with the expected args', async function () {
      await expect(
        splitMain.connect(signer).cancelControlTransfer(splitAddress),
      )
        .to.emit(splitMain, 'CancelControlTransfer')
        .withArgs(splitAddress)
    })

    it('Should revert if a non-controller sends tx', async function () {
      let newAccount: string
      do {
        newAccount = getRandomItem(allAccounts)
      } while (newAccount === account)
      const newSigner = await ethers.getSigner(newAccount)
      await expect(
        splitMain.connect(newSigner).cancelControlTransfer(splitAddress),
      ).to.be.revertedWith(`Unauthorized("${newAccount}")`)
    })
  })

  describe('acceptControl', function () {
    let tx: () => Promise<ContractTransaction>
    let newPotentialControllerSigner: Signer

    before(() => {
      tx = () =>
        splitMain
          .connect(newPotentialControllerSigner)
          .acceptControl(splitAddress)
    })

    beforeEach(async () => {
      await loadFixture(testSetup__transferControl({ controller: account }))
      newPotentialControllerSigner = await ethers.getSigner(
        newPotentialController,
      )
    })

    it('Should emit ControlTransfer event with the expected splitAddress, previousController, and newController', async function () {
      await expect(tx())
        .to.emit(splitMain, 'ControlTransfer')
        .withArgs(splitAddress, controller, newPotentialController)
    })

    it('Should transfer control', async function () {
      await tx()
      const expectedController = await splitMain.getController(splitAddress)
      expect(expectedController).to.equal(newPotentialController)
    })

    it('Should delete newPotentialController', async function () {
      await tx()
      const expectedNewPotentialController =
        await splitMain.getNewPotentialController(splitAddress)
      expect(expectedNewPotentialController).to.equal(AddressZero)
    })

    it('Should revert if a non-newPotentialController sends tx', async function () {
      let newAccount: string
      do {
        newAccount = getRandomItem(allAccounts)
      } while (newAccount === newPotentialController)
      await expect(
        splitMain
          .connect(await ethers.getSigner(newAccount))
          .acceptControl(splitAddress),
      ).to.be.revertedWith(`Unauthorized("${newAccount}")`)
    })
  })

  describe('makeSplitImmutable', function () {
    let tx: () => Promise<ContractTransaction>

    before(() => {
      tx = () => splitMain.connect(signer).makeSplitImmutable(splitAddress)
    })

    beforeEach(async () => {
      await loadFixture(testSetup__createSplit({ controller: account }))
    })

    it('Should emit ControlTransfer event with the expected splitAddress, previousController, and newController', async function () {
      await expect(tx())
        .to.emit(splitMain, 'ControlTransfer')
        .withArgs(splitAddress, controller, AddressZero)
    })

    it('Should transfer control to AddressZero', async function () {
      await tx()
      const expectedController = await splitMain.getController(splitAddress)
      expect(expectedController).to.equal(AddressZero)
    })

    it('Should delete newPotentialController', async function () {
      do {
        newPotentialController = getRandomItem(allAccounts)
      } while (newPotentialController === account)
      await splitMain
        .connect(signer)
        .transferControl(splitAddress, newPotentialController)
      await tx()
      const expectedNewPotentialController =
        await splitMain.getNewPotentialController(splitAddress)
      expect(expectedNewPotentialController).to.equal(AddressZero)
    })

    it('Should revert if a non-controller sends tx', async function () {
      let newAccount: string
      do {
        newAccount = getRandomItem(allAccounts)
      } while (newAccount === account)
      await expect(
        splitMain
          .connect(await ethers.getSigner(newAccount))
          .makeSplitImmutable(splitAddress),
      ).to.be.revertedWith(`Unauthorized("${newAccount}")`)
    })
  })

  describe('distributeETH', function () {
    let tx: (distributorAddress_?: string) => Promise<ContractTransaction>

    before(() => {
      tx = (distributorAddress = account) =>
        splitMain
          .connect(signer)
          .distributeETH(
            splitAddress,
            accounts,
            percentAllocations,
            distributorFee,
            distributorAddress,
          )
    })

    describe('Proxy balance = 0 & SplitMain balance = 0', function () {
      beforeEach(async () => {
        await loadFixture(testSetup__createSplit({ controller: account }))
      })

      describe('Should emit DistributeETH event with the expected args', function () {
        it('with a distributoAddress', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeETH')
            .withArgs(splitAddress, Zero, account)
        })

        it('with a blank distributoAddress', async function () {
          await expect(tx(AddressZero))
            .to.emit(splitMain, 'DistributeETH')
            .withArgs(splitAddress, Zero, account)
        })
      })
    })

    describe('Proxy balance = 0 & SplitMain balance = 1', function () {
      beforeEach(async () => {
        await loadFixture(
          testSetup__depositETHToSplit({
            controller: account,
            ethProxyBalance: Zero,
            ethMainBalance: One,
          }),
        )
      })

      describe('Should emit DistributeETH event with the expected args', function () {
        it('with a distributoAddress', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeETH')
            .withArgs(splitAddress, Zero, account)
        })

        it('with a blank distributoAddress', async function () {
          await expect(tx(AddressZero))
            .to.emit(splitMain, 'DistributeETH')
            .withArgs(splitAddress, Zero, account)
        })
      })
    })

    describe('Proxy balance > 1 & SplitMain balance > 1', function () {
      describe('DistributorFee > 0', function () {
        beforeEach(async () => {
          await loadFixture(
            testSetup__depositETHToSplit({ controller: account }),
          )
        })

        it('Should send ETH to SplitMain', async function () {
          await expect(tx).to.changeEtherBalances(
            [addressProvider(splitAddress), addressProvider(splitMain.address)],
            [ethProxyBalance.mul(-1), ethProxyBalance],
          )
        })

        describe('Should emit DistributeETH event with the expected args', function () {
          it('with a distributoAddress', async function () {
            await expect(tx())
              .to.emit(splitMain, 'DistributeETH')
              .withArgs(splitAddress, ethBalance.sub(One), account)
          })

          it('with a blank distributoAddress', async function () {
            await expect(tx(AddressZero))
              .to.emit(splitMain, 'DistributeETH')
              .withArgs(splitAddress, ethBalance.sub(One), account)
          })
        })

        it("Shouldn't leak funds", async function () {
          await tx()
          const postDistributeETHs = await Promise.all(
            uniq(accounts.concat(account)).map((acc) =>
              splitMain.getETHBalance(acc),
            ),
          )
          const postSplitTotal = postDistributeETHs.reduce(
            (acc, bn) => acc.add(bn),
            Zero,
          )
          // number may be off by a few wei due to rounding
          // closeTo not currently working
          // expect(postSplitTotal).to.be.closeTo(deposit, accounts.length)
          expect(postSplitTotal).to.be.lte(ethBalance.sub(One))
          expect(postSplitTotal).to.be.gte(
            ethBalance.sub(One).sub(accounts.length),
          )
        })

        it('Should check for a valid split hash', async function () {
          generateRandomSplit({ controller })
          const hash = hashSplit(accounts, percentAllocations, distributorFee)
          await expect(tx()).to.be.revertedWith(
            `InvalidSplit__InvalidHash("${hash}")`,
          )
        })

        testModifier__validSplit({
          // beforeEach already set in block
          expectCB: () => tx(),
        })
      })

      describe('DistributorFee = 0', function () {
        beforeEach(async () => {
          await loadFixture(
            testSetup__depositETHToSplit({
              distributorFee: 0,
              controller: account,
            }),
          )
        })

        it("Shouldn't leak funds", async function () {
          await tx()
          const postDistributeETHs = await Promise.all(
            accounts.map((acc) => splitMain.getETHBalance(acc)),
          )
          const postSplitTotal = postDistributeETHs.reduce(
            (acc, bn) => acc.add(bn),
            Zero,
          )
          // number may be off by a few wei due to rounding
          // closeTo not currently working
          // expect(postSplitTotal).to.be.closeTo(deposit, accounts.length)
          expect(postSplitTotal).to.be.lte(ethBalance.sub(One))
          expect(postSplitTotal).to.be.gte(
            ethBalance.sub(One).sub(accounts.length),
          )
        })
      })
    })
  })

  describe('updateAndDistributeETH', function () {
    let tx: (signer_?: Signer) => Promise<ContractTransaction>

    before(() => {
      tx = (signer_: Signer = signer) =>
        splitMain
          .connect(signer_)
          .updateAndDistributeETH(
            splitAddress,
            accounts,
            percentAllocations,
            distributorFee,
            account,
          )
    })

    beforeEach(async () => {
      await loadFixture(testSetup__depositETHToSplit({ controller: account }))
      generateRandomSplit({ controller })
    })

    testBase__updateSplit({
      // beforeEach already set in block
      expectCB: (signer_) => tx(signer_),
    })

    describe('distributeETH', function () {
      describe('Proxy balance = 0 & SplitMain balance = 0', function () {
        beforeEach(async () => {
          await loadFixture(testSetup__createSplit({ controller: account }))
        })

        it('Should emit DistributeETH event with the expected args', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeETH')
            .withArgs(splitAddress, Zero, account)
        })
      })

      describe('Proxy balance = 0 & SplitMain balance = 1', function () {
        beforeEach(async () => {
          await loadFixture(
            testSetup__depositETHToSplit({
              controller: account,
              ethProxyBalance: Zero,
              ethMainBalance: One,
            }),
          )
        })

        it('Should emit DistributeETH event with the expected args', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeETH')
            .withArgs(splitAddress, Zero, account)
        })
      })

      describe('Proxy balance > 1 & SplitMain balance > 1', function () {
        describe('DistributorFee > 0', function () {
          beforeEach(async () => {
            await loadFixture(
              testSetup__depositETHToSplit({ controller: account }),
            )
          })

          it('Should send ETH to SplitMain', async function () {
            await expect(tx).to.changeEtherBalances(
              [
                addressProvider(splitAddress),
                addressProvider(splitMain.address),
              ],
              [ethProxyBalance.mul(-1), ethProxyBalance],
            )
          })

          it('Should emit DistributeETH event with the expected args', async function () {
            await expect(tx())
              .to.emit(splitMain, 'DistributeETH')
              .withArgs(splitAddress, ethBalance.sub(One), account)
          })

          it("Shouldn't leak funds", async function () {
            await tx()
            const postDistributeETHs = await Promise.all(
              uniq(accounts.concat(account)).map((acc) =>
                splitMain.getETHBalance(acc),
              ),
            )
            const postSplitTotal = postDistributeETHs.reduce(
              (acc, bn) => acc.add(bn),
              Zero,
            )
            // number may be off by a few wei due to rounding
            // closeTo not currently working
            // expect(postSplitTotal).to.be.closeTo(deposit, accounts.length)
            expect(postSplitTotal).to.be.lte(ethBalance.sub(One))
            expect(postSplitTotal).to.be.gte(
              ethBalance.sub(One).sub(accounts.length),
            )
          })
        })

        describe('DistributorFee = 0', function () {
          beforeEach(async () => {
            await loadFixture(
              testSetup__depositETHToSplit({
                distributorFee: 0,
                controller: account,
              }),
            )
          })

          it("Shouldn't leak funds", async function () {
            await tx()
            const postDistributeETHs = await Promise.all(
              accounts.map((acc) => splitMain.getETHBalance(acc)),
            )
            const postSplitTotal = postDistributeETHs.reduce(
              (acc, bn) => acc.add(bn),
              Zero,
            )
            // number may be off by a few wei due to rounding
            // closeTo not currently working
            // expect(postSplitTotal).to.be.closeTo(deposit, accounts.length)
            expect(postSplitTotal).to.be.lte(ethBalance.sub(One))
            expect(postSplitTotal).to.be.gte(
              ethBalance.sub(One).sub(accounts.length),
            )
          })
        })
      })
    })

    testModifier__validSplit({
      // beforeEach already set in block
      expectCB: () => tx(),
    })
  })

  describe('distributeERC20', function () {
    let tx: (distributorAddress_?: string) => Promise<ContractTransaction>

    before(() => {
      tx = () =>
        splitMain
          .connect(signer)
          .distributeERC20(
            splitAddress,
            erc20Contract.address,
            accounts,
            percentAllocations,
            distributorFee,
            account,
          )
    })

    describe('Proxy & SplitMain balances = 0', function () {
      beforeEach(async () => {
        await loadFixture(
          testSetup__depositERC20ToSplit({
            controller: account,
            erc20ProxyBalance: Zero,
            erc20MainBalance: Zero,
          }),
        )
      })

      describe('Should emit DistributeERC20 event with the expected args', function () {
        it('with a distributoAddress', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeERC20')
            .withArgs(splitAddress, erc20Contract.address, Zero, account)
        })

        it('with a blank distributoAddress', async function () {
          await expect(tx(AddressZero))
            .to.emit(splitMain, 'DistributeERC20')
            .withArgs(splitAddress, erc20Contract.address, Zero, account)
        })
      })
    })

    describe('Proxy balance = 1 & SplitMain balance = 0', function () {
      beforeEach(async () => {
        await loadFixture(
          testSetup__depositERC20ToSplit({
            controller: account,
            erc20ProxyBalance: One,
            erc20MainBalance: Zero,
          }),
        )
      })

      describe('Should emit DistributeERC20 event with the expected args', function () {
        it('with a distributoAddress', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeERC20')
            .withArgs(splitAddress, erc20Contract.address, Zero, account)
        })

        it('with a blank distributoAddress', async function () {
          await expect(tx(AddressZero))
            .to.emit(splitMain, 'DistributeERC20')
            .withArgs(splitAddress, erc20Contract.address, Zero, account)
        })
      })
    })

    describe('Proxy balance = 0 & SplitMain balance = 1', function () {
      beforeEach(async () => {
        await loadFixture(
          testSetup__depositERC20ToSplit({
            controller: account,
            erc20ProxyBalance: Zero,
            erc20MainBalance: One,
          }),
        )
      })

      describe('Should emit DistributeERC20 event with the expected args', function () {
        it('with a distributoAddress', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeERC20')
            .withArgs(splitAddress, erc20Contract.address, Zero, account)
        })

        it('with a blank distributoAddress', async function () {
          await expect(tx(AddressZero))
            .to.emit(splitMain, 'DistributeERC20')
            .withArgs(splitAddress, erc20Contract.address, Zero, account)
        })
      })
    })

    describe('Proxy balance > 1 & SplitMain balance > 1', function () {
      describe('DistributorFee > 0', function () {
        beforeEach(async () => {
          await loadFixture(
            testSetup__depositERC20ToSplit({ controller: account }),
          )
        })

        it('Should send ERC20 to SplitMain when balance > 1', async function () {
          await expect(tx).to.changeTokenBalances(
            erc20Contract,
            [addressProvider(splitAddress), addressProvider(splitMain.address)],
            [erc20ProxyBalance.sub(One).mul(-1), erc20ProxyBalance.sub(One)],
          )
        })

        describe('Should emit DistributeERC20 event with the expected args', function () {
          it('with a distributoAddress', async function () {
            await expect(tx())
              .to.emit(splitMain, 'DistributeERC20')
              .withArgs(
                splitAddress,
                erc20Contract.address,
                erc20Balance.sub(Two),
                account,
              )
          })

          it('with a blank distributoAddress', async function () {
            await expect(tx(AddressZero))
              .to.emit(splitMain, 'DistributeERC20')
              .withArgs(
                splitAddress,
                erc20Contract.address,
                erc20Balance.sub(Two),
                account,
              )
          })
        })

        it("Shouldn't leak funds", async function () {
          await tx()
          const postDistributeETHs = await Promise.all(
            uniq(accounts.concat(account)).map((acc) =>
              splitMain.getERC20Balance(acc, erc20Contract.address),
            ),
          )
          const postSplitTotal = postDistributeETHs.reduce(
            (acc, bn) => acc.add(bn),
            Zero,
          )
          // number may be off by a few wei due to rounding
          // closeTo not currently working
          // expect(postSplitTotal).to.be.closeTo(deposit, accounts.length)
          expect(postSplitTotal).to.be.lte(erc20Balance.sub(Two))
          expect(postSplitTotal).to.be.gte(
            erc20Balance.sub(Two).sub(accounts.length),
          )
        })

        it('Should check for a valid split hash', async function () {
          generateRandomSplit({ controller })
          const hash = hashSplit(accounts, percentAllocations, distributorFee)
          await expect(tx()).to.be.revertedWith(
            `InvalidSplit__InvalidHash("${hash}")`,
          )
        })

        testModifier__validSplit({
          // beforeEach already set in block
          expectCB: () => tx(),
        })
      })

      describe('DistributorFee = 0', function () {
        beforeEach(async () => {
          await loadFixture(
            testSetup__depositERC20ToSplit({
              distributorFee: 0,
              controller: account,
            }),
          )
        })

        it("Shouldn't leak funds", async function () {
          await tx()
          const postDistributeETHs = await Promise.all(
            accounts.map((acc) =>
              splitMain.getERC20Balance(acc, erc20Contract.address),
            ),
          )
          const postSplitTotal = postDistributeETHs.reduce(
            (acc, bn) => acc.add(bn),
            Zero,
          )
          // number may be off by a few wei due to rounding
          // closeTo not currently working
          // expect(postSplitTotal).to.be.closeTo(deposit, accounts.length)
          expect(postSplitTotal).to.be.lte(erc20Balance.sub(Two))
          expect(postSplitTotal).to.be.gte(
            erc20Balance.sub(Two).sub(accounts.length),
          )
        })
      })
    })
  })

  describe('updateAndDistributeERC20', function () {
    let tx: (signer_?: Signer) => Promise<ContractTransaction>

    before(() => {
      tx = (signer_: Signer = signer) =>
        splitMain
          .connect(signer_)
          .updateAndDistributeERC20(
            splitAddress,
            erc20Contract.address,
            accounts,
            percentAllocations,
            distributorFee,
            account,
          )
    })

    beforeEach(async () => {
      await loadFixture(
        testSetup__depositERC20ToSplit({
          controller: account,
        }),
      )
      generateRandomSplit({ controller })
    })

    testBase__updateSplit({
      // beforeEach already set in block
      expectCB: (signer_) => tx(signer_),
    })

    describe('distributeERC20', function () {
      describe('Proxy & SplitMain balances = 0', function () {
        beforeEach(async () => {
          await loadFixture(
            testSetup__depositERC20ToSplit({
              controller: account,
              erc20ProxyBalance: Zero,
              erc20MainBalance: Zero,
            }),
          )
        })

        it('Should emit DistributeERC20 event with the expected args', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeERC20')
            .withArgs(splitAddress, erc20Contract.address, Zero, account)
        })
      })

      describe('Proxy balance = 1 & SplitMain balance = 0', function () {
        beforeEach(async () => {
          await loadFixture(
            testSetup__depositERC20ToSplit({
              controller: account,
              erc20ProxyBalance: One,
              erc20MainBalance: Zero,
            }),
          )
        })

        it('Should emit DistributeERC20 event with the expected args', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeERC20')
            .withArgs(splitAddress, erc20Contract.address, Zero, account)
        })
      })

      describe('Proxy balance = 0 & SplitMain balance = 1', function () {
        beforeEach(async () => {
          await loadFixture(
            testSetup__depositERC20ToSplit({
              controller: account,
              erc20ProxyBalance: Zero,
              erc20MainBalance: One,
            }),
          )
        })

        it('Should emit DistributeERC20 event with the expected args', async function () {
          await expect(tx())
            .to.emit(splitMain, 'DistributeERC20')
            .withArgs(splitAddress, erc20Contract.address, Zero, account)
        })
      })

      describe('Proxy balance > 1 & SplitMain balance > 1', function () {
        describe('DistributorFee > 0', function () {
          beforeEach(async () => {
            await loadFixture(
              testSetup__depositERC20ToSplit({ controller: account }),
            )
          })

          it('Should send ERC20 to SplitMain when balance > 1', async function () {
            await expect(tx).to.changeTokenBalances(
              erc20Contract,
              [
                addressProvider(splitAddress),
                addressProvider(splitMain.address),
              ],
              [erc20ProxyBalance.sub(One).mul(-1), erc20ProxyBalance.sub(One)],
            )
          })

          it('Should emit DistributeERC20 event with the expected args', async function () {
            await expect(tx())
              .to.emit(splitMain, 'DistributeERC20')
              .withArgs(
                splitAddress,
                erc20Contract.address,
                erc20Balance.sub(Two),
                account,
              )
          })

          it("Shouldn't leak funds", async function () {
            await tx()
            const postDistributeETHs = await Promise.all(
              uniq(accounts.concat(account)).map((acc) =>
                splitMain.getERC20Balance(acc, erc20Contract.address),
              ),
            )
            const postSplitTotal = postDistributeETHs.reduce(
              (acc, bn) => acc.add(bn),
              Zero,
            )
            // number may be off by a few wei due to rounding
            // closeTo not currently working
            // expect(postSplitTotal).to.be.closeTo(deposit, accounts.length)
            expect(postSplitTotal).to.be.lte(erc20Balance.sub(Two))
            expect(postSplitTotal).to.be.gte(
              erc20Balance.sub(Two).sub(accounts.length),
            )
          })
        })

        describe('DistributorFee = 0', function () {
          beforeEach(async () => {
            await loadFixture(
              testSetup__depositERC20ToSplit({
                distributorFee: 0,
                controller: account,
              }),
            )
          })

          it("Shouldn't leak funds", async function () {
            await tx()
            const postDistributeETHs = await Promise.all(
              accounts.map((acc) =>
                splitMain.getERC20Balance(acc, erc20Contract.address),
              ),
            )
            const postSplitTotal = postDistributeETHs.reduce(
              (acc, bn) => acc.add(bn),
              Zero,
            )
            // number may be off by a few wei due to rounding
            // closeTo not currently working
            // expect(postSplitTotal).to.be.closeTo(deposit, accounts.length)
            expect(postSplitTotal).to.be.lte(erc20Balance.sub(Two))
            expect(postSplitTotal).to.be.gte(
              erc20Balance.sub(Two).sub(accounts.length),
            )
          })
        })
      })
    })

    testModifier__validSplit({
      // beforeEach already set in block
      expectCB: () => tx(),
    })
  })

  describe('withdraw', function () {
    let tx: ({
      account_,
      signer_,
      eth,
      erc20,
    }?: Partial<{
      account_: string
      signer_: Signer
      eth: boolean
      erc20: boolean
    }>) => Promise<ContractTransaction>

    before(() => {
      tx = ({
        account_ = account,
        signer_ = signer,
        eth = true,
        erc20 = true,
      } = {}) =>
        splitMain
          .connect(signer_)
          .withdraw(account_, +eth, erc20 ? [erc20Contract.address] : [])
    })

    it('Should send ETH to account', async function () {
      await loadFixture(testSetup__depositAndSplitETH())
      let myBalance = await splitMain.getETHBalance(account)
      myBalance = myBalance.sub(One)
      await expect(() => tx({ erc20: false })).to.changeEtherBalances(
        [addressProvider(splitMain.address), signer],
        [myBalance.mul(-1), myBalance],
      )
    })

    it('Should revert if account fails to receive ETH', async function () {
      const mockContract = await deployMockContract(signer, [
        'function receive() external payable',
      ])
      const mockAddress = mockContract.address
      accounts = sortBy([account, mockAddress], (acc) => acc.toLowerCase())
      await loadFixture(testSetup__depositAndSplitETH({ accounts }))
      await mockContract.mock.receive.reverts()
      await expect(
        tx({ account_: mockAddress, erc20: false }),
      ).to.be.revertedWith('ETH_TRANSFER_FAILED')
    })

    it('Should send ERC20 to account', async function () {
      await loadFixture(testSetup__depositAndSplitERC20())
      let myBalance = await splitMain.getERC20Balance(
        account,
        erc20Contract.address,
      )
      myBalance = myBalance.sub(One)
      await expect(() => tx({ eth: false })).to.changeTokenBalances(
        erc20Contract,
        [addressProvider(splitMain.address), signer],
        [myBalance.mul(-1), myBalance],
      )
    })

    it('Should revert if token transfer returns false', async function () {
      const mockContract = await deployMockContract(signer, [
        'function transfer(address recipient, uint256 amount) public returns (bool)',
      ])
      const mockAddress = mockContract.address
      accounts = sortBy([account, mockAddress], (acc) => acc.toLowerCase())
      await loadFixture(testSetup__depositAndSplitETH({ accounts }))
      await mockContract.mock.transfer.returns(false)
      await expect(
        tx({ account_: mockAddress, erc20: false }),
      ).to.be.revertedWith('TRANSFER_FAILED')
    })

    it('Should revert if token transfer reverts', async function () {
      const mockContract = await deployMockContract(signer, [
        'function transfer(address recipient, uint256 amount) public returns (bool)',
      ])
      const mockAddress = mockContract.address
      accounts = sortBy([account, mockAddress], (acc) => acc.toLowerCase())
      await loadFixture(testSetup__depositAndSplitETH({ accounts }))
      await mockContract.mock.transfer.reverts()
      await expect(
        tx({ account_: mockAddress, erc20: false }),
      ).to.be.revertedWith('TRANSFER_FAILED')
    })

    describe('Should send ETH & ERC20 to account', function () {
      beforeEach(async () => {
        await loadFixture(testSetup__depositAndSplitERC20())
        ethProxyBalance = ethers.utils.parseEther(
          (10 * Math.random()).toFixed(18),
        )
        await signer.sendTransaction({
          to: splitAddress,
          value: ethProxyBalance,
        })
        await splitMain
          .connect(signer)
          .distributeETH(
            splitAddress,
            accounts,
            percentAllocations,
            distributorFee,
            account,
          )
      })

      it('ETH', async function () {
        let ethBalance = await splitMain.getETHBalance(account)
        ethBalance = ethBalance.sub(One)
        await expect(() => tx()).to.changeEtherBalances(
          [addressProvider(splitMain.address), signer],
          [ethBalance.mul(-1), ethBalance],
        )
      })

      it('ERC20', async function () {
        let myERC20Balance = await splitMain.getERC20Balance(
          account,
          erc20Contract.address,
        )
        myERC20Balance = myERC20Balance.sub(One)
        await expect(() => tx()).to.changeTokenBalances(
          erc20Contract,
          [addressProvider(splitMain.address), signer],
          [myERC20Balance.mul(-1), myERC20Balance],
        )
      })

      it('Should emit Withdrawal event with expected args', async function () {
        const ethBalance = await splitMain.getETHBalance(account)
        const erc20Balance = await splitMain.getERC20Balance(
          account,
          erc20Contract.address,
        )
        await expect(tx())
          .to.emit(splitMain, 'Withdrawal')
          .withArgs(
            account,
            ethBalance.sub(One),
            [erc20Contract.address],
            [erc20Balance.sub(One)],
          )
      })
    })

    describe('Should revert if balance = 0', function () {
      beforeEach(async () => {
        await loadFixture(testSetup__deploy())
      })

      it('ETH', async function () {
        await expect(tx({ erc20: false })).to.be.reverted
      })

      it('ERC20', async function () {
        await loadFixture(testSetup__mockERC20())
        await expect(tx({ eth: false })).to.be.reverted
      })
    })
  })

  describe('SplitProxy', function () {
    let tx: () => Promise<TransactionResponse>

    before(() => {
      tx = () =>
        signer.sendTransaction({
          to: splitAddress,
          value: ethProxyBalance,
        })
    })

    beforeEach(async () => {
      await loadFixture(testSetup__createSplit())
      ethProxyBalance = ethers.utils.parseEther(Math.random().toFixed(18))
    })

    it('Should be able to receive ETH', async function () {
      await expect(tx).to.changeEtherBalances(
        [signer, addressProvider(splitAddress)],
        [ethProxyBalance.mul(-1), ethProxyBalance],
      )
    })

    it('Should emit ReceiveETH event with the expected args', async function () {
      await loadFixture(testSetup__attachToSplitWallet())
      await expect(tx())
        .to.emit(splitWallet.attach(splitAddress), 'ReceiveETH')
        .withArgs(splitAddress, ethProxyBalance)
    })
  })

  describe('SplitWallet', function () {
    it("Should store SplitMain's address", async function () {
      await loadFixture(testSetup__deploy())
      await loadFixture(testSetup__attachToSplitWallet())
      const expectedSplitMainAddress = await splitWallet.splitMain()
      expect(expectedSplitMainAddress).to.equal(splitMain.address)
    })

    describe('sendETHToMain', function () {
      beforeEach(async () => {
        await loadFixture(testSetup__depositETHToSplit())
        await loadFixture(testSetup__attachToSplitWallet())
      })

      it('Should send ETH to SplitMain', async function () {
        await testSetup__impersonateAccount(
          splitMain.address,
          async (signer) => {
            await expect(
              await splitWallet
                .attach(splitAddress)
                .connect(signer)
                .sendETHToMain(ethProxyBalance),
            ).to.changeEtherBalances(
              [
                addressProvider(splitAddress),
                addressProvider(splitMain.address),
              ],
              [ethProxyBalance.mul(-1), ethProxyBalance],
            )
          },
        )
      })

      it('Should revert if not-SplitMain sends tx', async function () {
        await expect(
          splitWallet.connect(signer).sendETHToMain(0),
        ).to.be.revertedWith(`Unauthorized()`)
      })
    })

    describe('sendERC20ToMain', function () {
      beforeEach(async () => {
        await loadFixture(
          testSetup__depositERC20ToSplit({ controller: account }),
        )
        await loadFixture(testSetup__attachToSplitWallet())
        erc20ProxyBalance = erc20ProxyBalance.sub(One)
      })

      it("Should emit 'Transfer' from ERC20 with the expected args", async function () {
        await testSetup__impersonateAccount(
          splitMain.address,
          async (signer) => {
            await expect(
              splitWallet
                .attach(splitAddress)
                .connect(signer)
                .sendERC20ToMain(erc20Contract.address, erc20ProxyBalance),
            )
              .to.emit(erc20Contract, 'Transfer')
              .withArgs(splitAddress, splitMain.address, erc20ProxyBalance)
          },
        )
      })

      it('Should change the token balances', async function () {
        await testSetup__impersonateAccount(
          splitMain.address,
          async (signer) => {
            await expect(() =>
              splitWallet
                .attach(splitAddress)
                .connect(signer)
                .sendERC20ToMain(erc20Contract.address, erc20ProxyBalance),
            ).to.changeTokenBalances(
              erc20Contract,
              [
                addressProvider(splitAddress),
                addressProvider(splitMain.address),
              ],
              [erc20ProxyBalance.mul(-1), erc20ProxyBalance],
            )
          },
        )
      })

      it('Should revert if not-SplitMain sends tx', async function () {
        await expect(
          splitWallet
            .connect(signer)
            .sendERC20ToMain(erc20Contract.address, erc20ProxyBalance),
        ).to.be.revertedWith(`Unauthorized()`)
      })
    })
  })
})
