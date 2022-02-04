// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IERC20Detailed} from '../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {ILendingPoolAddressesProvider} from '../interfaces/ILendingPoolAddressesProvider.sol';
import {IUiPoolDataProviderV3} from './interfaces/IUiPoolDataProviderV3.sol';
import {ILendingPool} from '../interfaces/ILendingPool.sol';
// import {IAaveOracle} from './interfaces/IAaveOracle.sol';
import {IAToken} from '../interfaces/IAToken.sol';
import {IPToken} from '../interfaces/IPToken.sol';
import {IVariableDebtToken} from '../interfaces/IVariableDebtToken.sol';
import {IStableDebtToken} from '../interfaces/IStableDebtToken.sol';
import {WadRayMath} from '../protocol/libraries/math/WadRayMath.sol';
import {ReserveConfiguration} from '../protocol/libraries/configuration/ReserveConfiguration.sol';
import {UserConfiguration} from '../protocol/libraries/configuration/UserConfiguration.sol';
import {DataTypes} from '../protocol/libraries/types/DataTypes.sol';
// import {IChainlinkAggregator} from '../interfaces/IChainlinkAggregator.sol';
import {DefaultReserveInterestRateStrategy} from '../protocol/lendingpool/DefaultReserveInterestRateStrategy.sol';
import {IERC20DetailedBytes} from './interfaces/IERC20DetailedBytes.sol';
import {IProject} from '../interfaces/IProject.sol';

contract UiPoolDataProviderV2V3 is IUiPoolDataProviderV3 {
  using WadRayMath for uint256;
  using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
  using UserConfiguration for DataTypes.UserConfigurationMap;

  // IChainlinkAggregator public immutable networkBaseTokenPriceInUsdProxyAggregator;
  // IChainlinkAggregator public immutable marketReferenceCurrencyPriceInUsdProxyAggregator;
  // uint256 public constant ETH_CURRENCY_UNIT = 1 ether;
  // address public constant MKRAddress = 0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2;


  function getInterestRateStrategySlopes(DefaultReserveInterestRateStrategy interestRateStrategy)
    internal
    view
    returns (
      uint256,
      uint256,
      uint256,
      uint256
    )
  {
    return (
      interestRateStrategy.variableRateSlope1(),
      interestRateStrategy.variableRateSlope2(),
      interestRateStrategy.stableRateSlope1(),
      interestRateStrategy.stableRateSlope2()
    );
  }

  function getReservesList(ILendingPoolAddressesProvider provider)
    public
    view
    override
    returns (address[] memory)
  {
    ILendingPool lendingPool = ILendingPool(provider.getLendingPool());
    return lendingPool.getReservesList();
  }

  function getReservesData(ILendingPoolAddressesProvider provider)
    public
    view
    override
    returns (AggregatedReserveData[] memory)
  {
    // IAaveOracle oracle = IAaveOracle(provider.getPriceOracle());
    ILendingPool lendingPool = ILendingPool(provider.getLendingPool());
    address[] memory reserves = lendingPool.getReservesList();
    AggregatedReserveData[] memory reservesData = new AggregatedReserveData[](reserves.length);

    for (uint256 i = 0; i < reserves.length; i++) {
      AggregatedReserveData memory reserveData = reservesData[i];
      reserveData.project = reserves[i];

      IProject project = IProject(reserveData.project);
      // project data
      (
        reserveData.name,
        reserveData.projectStartDate,
        reserveData.projectEndDate,
        reserveData.projectStatus,
        reserveData.projectLiquidityRate,
        reserveData.projectBorrowRate
      ) = project.getProjectData();

      // reserve current state
      DataTypes.ReserveData memory baseData = lendingPool.getReserveData(
        reserveData.project
      );
      reserveData.underlyingAsset = baseData.underlyingAsset;
      reserveData.liquidityIndex = baseData.liquidityIndex;
      reserveData.liquidityRate = baseData.currentLiquidityRate;
      reserveData.stableBorrowRate = baseData.currentStableBorrowRate;
      reserveData.lastUpdateTimestamp = baseData.lastUpdateTimestamp;
      reserveData.aTokenAddress = baseData.aTokenAddress;
      reserveData.pTokenAddress = baseData.pTokenAddress;
      reserveData.stableDebtTokenAddress = baseData.stableDebtTokenAddress;

      reserveData.availableLiquidity = IERC20Detailed(reserveData.underlyingAsset).balanceOf(
        reserveData.aTokenAddress
      );

      reserveData.symbol = IERC20Detailed(reserveData.underlyingAsset).symbol();

      (
        ,
        ,
        ,
        reserveData.decimals,

      ) = baseData.configuration.getParamsMemory();

      (
        reserveData.isActive,
        reserveData.isFrozen,
        reserveData.borrowingEnabled,
        reserveData.stableBorrowRateEnabled,
        reserveData.depositsEnabled,
        reserveData.withdrawalsEnabled,
        reserveData.interestWithdrawalsEnabled
      ) = baseData.configuration.getFlagsMemory();
    }

    return reservesData;
  }

  function getUserReservesData(ILendingPoolAddressesProvider provider, address user)
    external
    view
    override
    returns (UserReserveData[] memory, uint8)
  {
    ILendingPool lendingPool = ILendingPool(provider.getLendingPool());
    address[] memory reserves = lendingPool.getReservesList();
    DataTypes.UserConfigurationMap memory userConfig = lendingPool.getUserConfiguration(user);

    UserReserveData[] memory userReservesData = new UserReserveData[](
      user != address(0) ? reserves.length : 0
    );

    for (uint256 i = 0; i < reserves.length; i++) {
      DataTypes.ReserveData memory baseData = lendingPool.getReserveData(reserves[i]);

      // user reserve data
      userReservesData[i].project = reserves[i];
      userReservesData[i].underlyingAsset = baseData.underlyingAsset;
      userReservesData[i].scaledATokenBalance = IAToken(baseData.aTokenAddress).scaledBalanceOf(
        user
      );
      userReservesData[i].scaledPTokenBalance = IPToken(baseData.pTokenAddress).scaledBalanceOf(
        user
      );
      // calculated balance
      userReservesData[i].aTokenBalance = IAToken(baseData.aTokenAddress).balanceOf(
        user
      );
      userReservesData[i].pTokenBalance = IPToken(baseData.pTokenAddress).balanceOf(
        user
      );

      if (userConfig.isBorrowing(i)) {
        userReservesData[i].scaledVariableDebt = IVariableDebtToken(
          baseData.variableDebtTokenAddress
        ).scaledBalanceOf(user);
        userReservesData[i].principalStableDebt = IStableDebtToken(baseData.stableDebtTokenAddress)
          .principalBalanceOf(user);
        if (userReservesData[i].principalStableDebt != 0) {
          userReservesData[i].stableBorrowRate = IStableDebtToken(baseData.stableDebtTokenAddress)
            .getUserStableRate(user);
          userReservesData[i].stableBorrowLastUpdateTimestamp = IStableDebtToken(
            baseData.stableDebtTokenAddress
          ).getUserLastUpdated(user);
        }
      }
    }

    // Return 0 to be compatible with v3 userEmodeCategoryId return
    return (userReservesData, 0);
  }

  function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
    uint8 i = 0;
    while (i < 32 && _bytes32[i] != 0) {
      i++;
    }
    bytes memory bytesArray = new bytes(i);
    for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
      bytesArray[i] = _bytes32[i];
    }
    return string(bytesArray);
  }
}
