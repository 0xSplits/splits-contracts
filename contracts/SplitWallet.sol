// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.4;

import {IBlast} from 'contracts/interfaces/IBlast.sol';
import {ISplitMain} from './interfaces/ISplitMain.sol';
import {ERC20} from '@rari-capital/solmate/src/tokens/ERC20.sol';
import {SafeTransferLib} from '@rari-capital/solmate/src/utils/SafeTransferLib.sol';

/**
 * ERRORS
 */

/// @notice Unauthorized sender
error Unauthorized();

/**
 * @title SplitWallet
 * @author 0xSplits <will@0xSplits.xyz>
 * @notice The implementation logic for `SplitProxy`.
 * @dev `SplitProxy` handles `receive()` itself to avoid the gas cost with `DELEGATECALL`.
 */
contract SplitWallet {
  using SafeTransferLib for address;
  using SafeTransferLib for ERC20;

  /**
   * EVENTS
   */

  /** @notice emitted after each successful ETH transfer to proxy
   *  @param split Address of the split that received ETH
   *  @param amount Amount of ETH received
   */
  event ReceiveETH(address indexed split, uint256 amount);

  /**
   * STORAGE
   */

  /**
   * STORAGE - CONSTANTS & IMMUTABLES
   */

  /// @notice address of SplitMain for split distributions & EOA/SC withdrawals
  ISplitMain public immutable splitMain;

  /// @notice blast yield contract.
  IBlast public constant BLAST_YIELD = IBlast(0x4300000000000000000000000000000000000002);

  /// @notice blast gas fees recipient.
  address public immutable SPLITS_DEPLOYER;

  /**
   * MODIFIERS
   */

  /// @notice Reverts if the sender isn't SplitMain
  modifier onlySplitMain() {
    if (msg.sender != address(splitMain)) revert Unauthorized();
    _;
  }

  /**
   * CONSTRUCTOR
   */

  constructor() {
    splitMain = ISplitMain(msg.sender);
    SPLITS_DEPLOYER = tx.origin;
  }

  /**
   * FUNCTIONS - PUBLIC & EXTERNAL
   */

  function initialize() external onlySplitMain {
    BLAST_YIELD.configureAutomaticYield();
    BLAST_YIELD.configureClaimableGas();
  }

  /** @notice Sends amount `amount` of ETH in proxy to SplitMain
   *  @dev payable reduces gas cost; no vulnerability to accidentally lock
   *  ETH introduced since fn call is restricted to SplitMain
   *  @param amount Amount to send
   */
  function sendETHToMain(uint256 amount) external payable onlySplitMain {
    address(splitMain).safeTransferETH(amount);
  }

  /** @notice Sends amount `amount` of ERC20 `token` in proxy to SplitMain
   *  @dev payable reduces gas cost; no vulnerability to accidentally lock
   *  ETH introduced since fn call is restricted to SplitMain
   *  @param token Token to send
   *  @param amount Amount to send
   */
  function sendERC20ToMain(ERC20 token, uint256 amount)
    external
    payable
    onlySplitMain
  {
    token.safeTransfer(address(splitMain), amount);
  }

  /// @notice claim gas fees earned by this wallet and send it to split deployer.
  function claimGasFees() external {
    BLAST_YIELD.claimMaxGas(address(this), SPLITS_DEPLOYER);
  }
}
