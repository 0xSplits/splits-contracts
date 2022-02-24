// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.4;

import {ISplitMain} from 'contracts/interfaces/ISplitMain.sol';

contract TestInternalTxn {
  ISplitMain constant splitMain =
    ISplitMain(0x2ed6c4B5dA6378c7897AC67Ba9e43102Feb694EE);

  constructor() {}

  function create(
    address[] calldata accounts,
    uint32[] calldata percentAllocations,
    uint32 distributorFee,
    address controller
  ) external returns (address) {
    return
      splitMain.createSplit(
        accounts,
        percentAllocations,
        distributorFee,
        controller
      );
  }

  function update(
    address split,
    address[] calldata accounts,
    uint32[] calldata percentAllocations,
    uint32 distributorFee
  ) external {
    splitMain.updateSplit(split, accounts, percentAllocations, distributorFee);
  }
}
