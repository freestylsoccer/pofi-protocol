// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IERC20Detailed} from '../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {ILendingPoolAddressesProvider} from '../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPool} from '../interfaces/ILendingPool.sol';
import {IStableDebtToken} from '../interfaces/IStableDebtToken.sol';
import {IVariableDebtToken} from '../interfaces/IVariableDebtToken.sol';
import {ReserveConfiguration} from '../protocol/libraries/configuration/ReserveConfiguration.sol';
import {UserConfiguration} from '../protocol/libraries/configuration/UserConfiguration.sol';
import {DataTypes} from '../protocol/libraries/types/DataTypes.sol';

contract AaveProtocolDataProvider {
  using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
  using UserConfiguration for DataTypes.UserConfigurationMap;

  address constant MKR = 0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2;
  address constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  struct TokenData {
    string symbol;
    address tokenAddress;
  }

  ILendingPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

  constructor(ILendingPoolAddressesProvider addressesProvider) public {
    ADDRESSES_PROVIDER = addressesProvider;
  }

  function getAllReservesTokens() external view returns (TokenData[] memory) {
    ILendingPool pool = ILendingPool(ADDRESSES_PROVIDER.getLendingPool());
    address[] memory reserves = pool.getReservesList();
    TokenData[] memory reservesTokens = new TokenData[](reserves.length);
    for (uint256 i = 0; i < reserves.length; i++) {
      if (reserves[i] == MKR) {
        reservesTokens[i] = TokenData({symbol: 'MKR', tokenAddress: reserves[i]});
        continue;
      }
      if (reserves[i] == ETH) {
        reservesTokens[i] = TokenData({symbol: 'ETH', tokenAddress: reserves[i]});
        continue;
      }

      DataTypes.ReserveData memory reserveData = pool.getReserveData(reserves[i]);

      reservesTokens[i] = TokenData({
        symbol: IERC20Detailed(reserveData.underlyingAsset).symbol(),
        tokenAddress: reserveData.underlyingAsset
      });
    }
    return reservesTokens;
  }

  function getAllATokens() external view returns (TokenData[] memory) {
    ILendingPool pool = ILendingPool(ADDRESSES_PROVIDER.getLendingPool());
    address[] memory reserves = pool.getReservesList();
    TokenData[] memory aTokens = new TokenData[](reserves.length);
    for (uint256 i = 0; i < reserves.length; i++) {
      DataTypes.ReserveData memory reserveData = pool.getReserveData(reserves[i]);
      aTokens[i] = TokenData({
        symbol: IERC20Detailed(reserveData.aTokenAddress).symbol(),
        tokenAddress: reserveData.aTokenAddress
      });
    }
    return aTokens;
  }

  function getReserveConfigurationData(address project)
    external
    view
    returns (
      uint256 decimals,
      uint256 reserveFactor,
      bool borrowingEnabled,
      bool depositsEnabled,
      bool withdrawalsEnabled,
      bool interestWithdrawalsEnabled,
      bool isActive,
      bool isFrozen
    )
  {
    DataTypes.ReserveConfigurationMap memory configuration =
      ILendingPool(ADDRESSES_PROVIDER.getLendingPool()).getConfiguration(project);

    (, , , decimals, reserveFactor) = configuration
      .getParamsMemory();

    (isActive, isFrozen, borrowingEnabled, , depositsEnabled, withdrawalsEnabled, interestWithdrawalsEnabled) = configuration
      .getFlagsMemory();
  }

  function getReserveData(address project)
    external
    view
    returns (
      address underlyingAsset,
      address projectBorrower,
      uint256 availableLiquidity,
      uint256 totalStableDebt,
      uint256 liquidityRate,
      uint256 stableBorrowRate,
      uint256 liquidityIndex,
      uint40 lastUpdateTimestamp
    )
  {
    DataTypes.ReserveData memory reserve =
      ILendingPool(ADDRESSES_PROVIDER.getLendingPool()).getReserveData(project);

    return (
      reserve.underlyingAsset,
      reserve.projectBorrower,
      IERC20Detailed(reserve.underlyingAsset).balanceOf(reserve.aTokenAddress),
      IERC20Detailed(reserve.stableDebtTokenAddress).totalSupply(),
      reserve.currentLiquidityRate,
      reserve.currentStableBorrowRate,
      reserve.liquidityIndex,
      reserve.lastUpdateTimestamp
    );
  }

  function getUserReserveData(address project, address user)
    external
    view
    returns (
      uint256 currentATokenBalance,
      uint256 currentPTokenBalance,
      uint256 currentStableDebt,
      uint256 currentVariableDebt,
      uint256 principalStableDebt,
      uint256 stableBorrowRate,
      uint256 liquidityRate,
      uint40 stableRateLastUpdated
    )
  {
    DataTypes.ReserveData memory reserve =
      ILendingPool(ADDRESSES_PROVIDER.getLendingPool()).getReserveData(project);

    DataTypes.UserConfigurationMap memory userConfig =
      ILendingPool(ADDRESSES_PROVIDER.getLendingPool()).getUserConfiguration(user);

    currentATokenBalance = IERC20Detailed(reserve.aTokenAddress).balanceOf(user);
    currentPTokenBalance = IERC20Detailed(reserve.pTokenAddress).balanceOf(user);
    currentStableDebt = IERC20Detailed(reserve.stableDebtTokenAddress).balanceOf(user);
    principalStableDebt = IStableDebtToken(reserve.stableDebtTokenAddress).principalBalanceOf(user);
    liquidityRate = reserve.currentLiquidityRate;
    stableBorrowRate = IStableDebtToken(reserve.stableDebtTokenAddress).getUserStableRate(user);
    stableRateLastUpdated = IStableDebtToken(reserve.stableDebtTokenAddress).getUserLastUpdated(
      user
    );
  }

  function getReserveTokensAddresses(address project)
    external
    view
    returns (
      address aTokenAddress,
      address stableDebtTokenAddress,
      address pTokenAddress
    )
  {
    DataTypes.ReserveData memory reserve =
      ILendingPool(ADDRESSES_PROVIDER.getLendingPool()).getReserveData(project);

    return (
      reserve.aTokenAddress,
      reserve.stableDebtTokenAddress,
      reserve.pTokenAddress
    );
  }
}
