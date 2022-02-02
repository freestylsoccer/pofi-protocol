// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

import {ILendingPoolAddressesProvider} from './ILendingPoolAddressesProvider.sol';
import {DataTypes} from '../protocol/libraries/types/DataTypes.sol';

interface IProject {

  function setFinished(bool val) external;
  function setStarDate(uint40 _startDate) external;
  function setEndDate(uint40 _endDate) external;
  function updateLiquidityRate(uint256 _lquidityRate) external;
  function updateBorrowRate(uint256 _borrowRate) external;
  function getProjectData()
    external
    view
    returns(string memory, uint40, uint40, bool, uint256, uint256);
}
