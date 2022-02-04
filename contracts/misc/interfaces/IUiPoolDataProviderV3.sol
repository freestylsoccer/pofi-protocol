// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';

interface IUiPoolDataProviderV3 {
  struct AggregatedReserveData {
    address underlyingAsset;
    string name;
    string symbol;
    uint256 decimals;
    bool borrowingEnabled;
    bool stableBorrowRateEnabled;
    bool depositsEnabled;
    bool withdrawalsEnabled;
    bool interestWithdrawalsEnabled;
    bool isActive;
    bool isFrozen;
    // base data
    uint128 liquidityIndex;
    uint128 liquidityRate;
    uint128 stableBorrowRate;
    uint40 lastUpdateTimestamp;
    address aTokenAddress;
    address pTokenAddress;
    address stableDebtTokenAddress;
    address project;
    uint40 projectStartDate;
    uint40 projectEndDate;
    bool projectStatus;
    uint256 projectLiquidityRate;
    uint256 projectBorrowRate;
    //
    uint256 availableLiquidity;
    uint256 averageStableRate;
    uint256 stableDebtLastUpdateTimestamp;
  }

  struct UserReserveData {
    address project;
    address underlyingAsset;
    uint256 scaledATokenBalance;
    uint256 scaledPTokenBalance;
    uint256 aTokenBalance;
    uint256 pTokenBalance;
    bool usageAsCollateralEnabledOnUser;
    uint256 stableBorrowRate;
    uint256 scaledVariableDebt;
    uint256 principalStableDebt;
    uint256 stableBorrowLastUpdateTimestamp;
  }

  struct BaseCurrencyInfo {
    uint256 marketReferenceCurrencyUnit;
    int256 marketReferenceCurrencyPriceInUsd;
    int256 networkBaseTokenPriceInUsd;
    uint8 networkBaseTokenPriceDecimals;
  }

  function getReservesList(ILendingPoolAddressesProvider provider)
    external
    view
    returns (address[] memory);

  function getReservesData(ILendingPoolAddressesProvider provider)
    external
    view
    returns (
      AggregatedReserveData[] memory
    );

  function getUserReservesData(ILendingPoolAddressesProvider provider, address user)
    external
    view
    returns (
      UserReserveData[] memory, uint8
    );
}
