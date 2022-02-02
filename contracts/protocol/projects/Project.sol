// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {IProject} from '../../interfaces/IProject.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {LendingPoolStorage} from '../lendingpool/LendingPoolStorage.sol';

/**
 * @title LendingPool contract
 * @dev Used when need to create more than one reserve by asset
 * - Admin can:
 *   # Update Project Name
 *   # Update Project start date
 *   # Update Project end date
 *   # Update Project Status
 * @author Basilio Calixto
 **/
contract Project is Ownable, IProject, LendingPoolStorage {

  string public name;
  uint40 public startDate;
  uint40 public endDate;
  bool public status;
  // used to display the liquidityRate and the borrowRate in UI when the project is initialized
  uint256 public liquidityRate; // in ray
  uint256 public borrowRate; // in ray

  constructor(
      string memory _name,
      uint40 _startDate,
      uint40 _endDate,
      uint256 _liquidityRate,
      uint256 _borrowRate
  ) public {
      name = _name;
      startDate = _startDate;
      endDate = _endDate;
      status = true;
      liquidityRate = _liquidityRate;
      borrowRate = _borrowRate;
  }

  modifier whenNotFinished() {
    _whenNotFinished();
    _;
  }

  function _whenNotFinished() internal view {
    require(status, "The project has been finished.");
  }

  /**
  * @dev update project Status
  **/
  function setFinished(bool val) external override onlyOwner {
      status = val;
  }

  /**
  * @dev update project start date
  **/
  function setStarDate(uint40 _startDate) external override onlyOwner whenNotFinished {
      startDate = _startDate;
  }

  /**
  * @dev update project end date
  **/
  function setEndDate(uint40 _endDate) external override onlyOwner whenNotFinished {
      endDate = _endDate;
  }

  /**
  * @dev update project liquidity rate
  **/
  function updateLiquidityRate(uint256 _liquidityRate) external override onlyOwner whenNotFinished {
      liquidityRate = _liquidityRate;
  }

  /**
  * @dev update project borrow rate
  **/
  function updateBorrowRate(uint256 _borrowRate) external override onlyOwner whenNotFinished {
      borrowRate = _borrowRate;
  }

  /**
  * @dev return project data
  **/
  function getProjectData() external view override returns(string memory, uint40, uint40, bool, uint256, uint256) {
    return (name, startDate, endDate, status, liquidityRate, borrowRate);
  }

}
