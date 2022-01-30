// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {Address} from '../../dependencies/openzeppelin/contracts/Address.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {IAToken} from '../../interfaces/IAToken.sol';
// import {IPToken} from '../../interfaces/IPToken.sol';
import {IVariableDebtToken} from '../../interfaces/IVariableDebtToken.sol';
import {IStableDebtToken} from '../../interfaces/IStableDebtToken.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {VersionedInitializable} from '../libraries/aave-upgradeability/VersionedInitializable.sol';
import {Helpers} from '../libraries/helpers/Helpers.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {WadRayMath} from '../libraries/math/WadRayMath.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {ReserveLogic} from '../libraries/logic/ReserveLogic.sol';
import {GenericLogic} from '../libraries/logic/GenericLogic.sol';
import {ValidationLogic} from '../libraries/logic/ValidationLogic.sol';
import {ReserveConfiguration} from '../libraries/configuration/ReserveConfiguration.sol';
import {UserConfiguration} from '../libraries/configuration/UserConfiguration.sol';
import {DataTypes} from '../libraries/types/DataTypes.sol';
import {LendingPoolStorage} from './LendingPoolStorage.sol';

/**
 * @title LendingPool contract
 * @dev Main point of interaction with an Aave protocol's market
 * - Users can:
 *   # Deposit
 *   # Withdraw
 *   # Borrow
 *   # Repay
 *   # Swap their loans between variable and stable rate
 *   # Enable/disable their deposits as collateral rebalance stable rate borrow positions
 *   # Liquidate positions
 *   # Execute Flash Loans
 * - To be covered by a proxy contract, owned by the LendingPoolAddressesProvider of the specific market
 * - All admin functions are callable by the LendingPoolConfigurator contract defined also in the
 *   LendingPoolAddressesProvider
 * @author Aave
 **/
contract LendingPool is VersionedInitializable, ILendingPool, LendingPoolStorage {
  using SafeMath for uint256;
  using WadRayMath for uint256;
  using PercentageMath for uint256;
  using SafeERC20 for IERC20;

  uint256 public constant LENDINGPOOL_REVISION = 0x2;

  modifier whenNotPaused() {
    _whenNotPaused();
    _;
  }

  modifier onlyLendingPoolConfigurator() {
    _onlyLendingPoolConfigurator();
    _;
  }

  function _whenNotPaused() internal view {
    require(!_paused, Errors.LP_IS_PAUSED);
  }

  function _onlyLendingPoolConfigurator() internal view {
    require(
      _addressesProvider.getLendingPoolConfigurator() == msg.sender,
      Errors.LP_CALLER_NOT_LENDING_POOL_CONFIGURATOR
    );
  }

  function getRevision() internal pure override returns (uint256) {
    return LENDINGPOOL_REVISION;
  }

  /**
   * @dev Function is invoked by the proxy contract when the LendingPool contract is added to the
   * LendingPoolAddressesProvider of the market.
   * - Caching the address of the LendingPoolAddressesProvider in order to reduce gas consumption
   *   on subsequent operations
   * @param provider The address of the LendingPoolAddressesProvider
   **/
  function initialize(ILendingPoolAddressesProvider provider) public initializer {
    _addressesProvider = provider;
    _maxStableRateBorrowSizePercent = 2500;
    _flashLoanPremiumTotal = 9;
    _maxNumberOfReserves = 128;
  }

  /**
   * @dev Deposits an `amount` of underlying asset into the reserve, receiving in return overlying aTokens.
   * - E.g. User deposits 100 USDC and gets in return 100 aUSDC
   * @param project The address of the project contrat associated to the reserve
   * @param asset The address of the underlying asset to deposit
   * @param amount The amount to be deposited
   * @param onBehalfOf The address that will receive the aTokens, same as msg.sender if the user
   *   wants to receive them on his own wallet, or a different address if the beneficiary of aTokens
   *   is a different wallet
   **/
  function deposit(
    address project,
    address asset,
    uint256 amount,
    address onBehalfOf
  ) external override whenNotPaused {
    DataTypes.ReserveData storage reserve = _reserves[project];

    require(reserve.underlyingAsset == asset, Errors.LP_INVALID_ASSET);

    ValidationLogic.validateDeposit(reserve, amount);

    address aToken = reserve.aTokenAddress;
    address pToken = reserve.pTokenAddress;

    reserve.updateState();

    IERC20(asset).safeTransferFrom(msg.sender, aToken, amount);

    IAToken(aToken).mint(onBehalfOf, amount, reserve.liquidityIndex);

    // IPToken(pToken).mint(onBehalfOf, amount, reserve.liquidityIndex);

    emit Deposit(project, asset, msg.sender, onBehalfOf, amount);
  }

  /**
   * @dev Withdraws an `amount` of underlying asset from the reserve, burning the equivalent aTokens owned
   * E.g. User has 100 aUSDC, calls withdraw() and receives 100 USDC, burning the 100 aUSDC
   * @param project The address of the project contrat associated to the reserve
   * @param asset The address of the underlying asset to withdraw
   * @param amount The underlying amount to be withdrawn
   *   - Send the value type(uint256).max in order to withdraw the whole aToken balance
   * @param to Address that will receive the underlying, same as msg.sender if the user
   *   wants to receive it on his own wallet, or a different address if the beneficiary is a
   *   different wallet
   * @return The final amount withdrawn
   **/
  function withdraw(
    address project,
    address asset,
    uint256 amount,
    address to
  ) external override whenNotPaused returns (uint256) {
    DataTypes.ReserveData storage reserve = _reserves[project];

    require(reserve.underlyingAsset == asset, Errors.LP_INVALID_ASSET);

    address aToken = reserve.aTokenAddress;

    uint256 userBalance = IAToken(aToken).balanceOf(msg.sender);

    uint256 amountToWithdraw = amount;

    if (amount == type(uint256).max) {
      amountToWithdraw = userBalance;
    }

    ValidationLogic.validateWithdraw(
      project,
      amountToWithdraw,
      userBalance,
      _reserves
    );

    reserve.updateState();

    if (amountToWithdraw == userBalance) {
      _usersConfig[msg.sender].setUsingAsCollateral(reserve.id, false);
      emit ReserveUsedAsCollateralDisabled(asset, msg.sender);
    }

    IAToken(aToken).burn(msg.sender, to, amountToWithdraw, reserve.liquidityIndex);

    emit Withdraw(project, msg.sender, to, amountToWithdraw);

    return amountToWithdraw;
  }

  /**
   * @dev Withdraws an `amount` of underlying asset from the reserve, burning the equivalent aTokens owned
   * E.g. User has 100 aUSDC, calls withdraw() and receives 100 USDC, burning the 100 aUSDC
   * @param project The address of the project contrat associated to the reserve
   * @param asset The address of the underlying asset to withdraw
   * @param to Address that will receive the underlying, same as msg.sender if the user
   *   wants to receive it on his own wallet, or a different address if the beneficiary is a
   *   different wallet
   * @return The final amount withdrawn
   **/
  function withdrawInterest(
    address project,
    address asset,
    address to
  ) external override whenNotPaused returns (uint256) {
    DataTypes.ReserveData storage reserve = _reserves[project];

    require(reserve.underlyingAsset == asset, Errors.LP_INVALID_ASSET);

    address aToken = reserve.aTokenAddress;

    uint256 userBalance = IAToken(aToken).balanceOf(msg.sender);

    ValidationLogic.validateInterestWithdraw(
      project,
      userBalance,
      _reserves
    );

    reserve.updateState();

    uint256 amountToWithdraw = IAToken(aToken).withdrawInterest(msg.sender, to, reserve.liquidityIndex);

    emit WithdrawInterest(project, msg.sender, to, amountToWithdraw);

    return amountToWithdraw;
  }

  /**
   * @dev Allows users to borrow a specific `amount` of the reserve underlying asset, provided that the borrower
   * already deposited enough collateral, or he was given enough allowance by a credit delegator on the
   * corresponding debt token (StableDebtToken or VariableDebtToken)
   * - E.g. User borrows 100 USDC passing as `onBehalfOf` his own address, receiving the 100 USDC in his wallet
   *   and 100 stable/variable debt tokens, depending on the `interestRateMode`
   * @param project The address of the project contrat associated to the reserve
   * @param asset The address of the underlying asset to borrow
   * @param amount The amount to be borrowed
   * @param onBehalfOf Address of the user who will receive the debt. Should be the address of the borrower itself
   * calling the function if he wants to borrow against his own collateral, or the address of the credit delegator
   * if he has been given credit delegation allowance
   **/
  function borrow(
    address project,
    address asset,
    uint256 amount,
    address onBehalfOf
  ) external override whenNotPaused {
    DataTypes.ReserveData storage reserve = _reserves[project];

    require(reserve.underlyingAsset == asset, Errors.LP_INVALID_ASSET);

    _executeBorrow(
      ExecuteBorrowParams(
        project,
        asset,
        msg.sender,
        onBehalfOf,
        amount,
        reserve.aTokenAddress,
        true
      )
    );
  }

  /**
   * @notice Repays a borrowed `amount` on a specific reserve, burning the equivalent debt tokens owned
   * - E.g. User repays 100 USDC, burning 100 variable/stable debt tokens of the `onBehalfOf` address
   * @param project The address of the project contrat associated to the reserve
   * @param asset The address of the borrowed underlying asset previously borrowed
   * @param amount The amount to repay
   * - Send the value type(uint256).max in order to repay the whole debt for `asset` on the specific `debtMode`
   * @param onBehalfOf Address of the user who will get his debt reduced/removed. Should be the address of the
   * user calling the function if he wants to reduce/remove his own debt, or the address of any other
   * other borrower whose debt should be removed
   * @return The final amount repaid
   **/
  function repay(
    address project,
    address asset,
    uint256 amount,
    address onBehalfOf
  ) external override whenNotPaused returns (uint256) {
    DataTypes.ReserveData storage reserve = _reserves[project];

    require(reserve.underlyingAsset == asset, Errors.LP_INVALID_ASSET);

    (uint256 stableDebt, uint256 variableDebt) = Helpers.getUserCurrentDebt(onBehalfOf, reserve);

    DataTypes.InterestRateMode interestRateMode = DataTypes.InterestRateMode(1);

    ValidationLogic.validateRepay(
      reserve,
      amount,
      interestRateMode,
      onBehalfOf,
      stableDebt,
      variableDebt
    );

    uint256 paybackAmount =
      interestRateMode == DataTypes.InterestRateMode.STABLE ? stableDebt : variableDebt;

    if (amount < paybackAmount) {
      paybackAmount = amount;
    }

    reserve.updateState();

    if (interestRateMode == DataTypes.InterestRateMode.STABLE) {
      IStableDebtToken(reserve.stableDebtTokenAddress).burn(onBehalfOf, paybackAmount);
    } else {
      IVariableDebtToken(reserve.variableDebtTokenAddress).burn(
        onBehalfOf,
        paybackAmount,
        reserve.variableBorrowIndex
      );
    }

    address aToken = reserve.aTokenAddress;

    if (stableDebt.add(variableDebt).sub(paybackAmount) == 0) {
      _usersConfig[onBehalfOf].setBorrowing(reserve.id, false);
    }

    IERC20(asset).safeTransferFrom(msg.sender, aToken, paybackAmount);

    IAToken(aToken).handleRepayment(msg.sender, paybackAmount);

    emit Repay(project, asset, onBehalfOf, msg.sender, paybackAmount);

    return paybackAmount;
  }

  /**
   * @dev Returns the state and configuration of the reserve
   * @param project The address of the project contrat associated to the reserve
   * @return The state of the reserve
   **/
  function getReserveData(address project)
    external
    view
    override
    returns (DataTypes.ReserveData memory)
  {
    return _reserves[project];
  }

  /**
   * @dev Returns the configuration of the reserve
   * @param project The address of the project contrat associated to the reserve
   * @return The configuration of the reserve
   **/
  function getConfiguration(address project)
    external
    view
    override
    returns (DataTypes.ReserveConfigurationMap memory)
  {
    return _reserves[project].configuration;
  }

  /**
   * @dev Returns the configuration of the user across all the reserves
   * @param user The user address
   * @return The configuration of the user
   **/
  function getUserConfiguration(address user)
    external
    view
    override
    returns (DataTypes.UserConfigurationMap memory)
  {
    return _usersConfig[user];
  }

  /**
   * @dev Returns the normalized income per unit of asset
   * @param project The address of the project contrat associated to the reserve
   * @return The reserve's normalized income
   */
  function getReserveNormalizedIncome(address project)
    external
    view
    virtual
    override
    returns (uint256)
  {
    return _reserves[project].getNormalizedIncome();
  }

  /**
   * @dev Returns the normalized variable debt per unit of asset
   * @param project The address of the project contrat associated to the reserve
   * @return The reserve normalized variable debt
   */
  function getReserveNormalizedVariableDebt(address project)
    external
    view
    override
    returns (uint256)
  {
    return _reserves[project].getNormalizedDebt();
  }

  /**
   * @dev Returns if the LendingPool is paused
   */
  function paused() external view override returns (bool) {
    return _paused;
  }

  /**
   * @dev Returns the list of the initialized reserves
   **/
  function getReservesList() external view override returns (address[] memory) {
    address[] memory _activeReserves = new address[](_reservesCount);

    for (uint256 i = 0; i < _reservesCount; i++) {
      _activeReserves[i] = _reservesList[i];
    }
    return _activeReserves;
  }

  /**
   * @dev Returns the cached LendingPoolAddressesProvider connected to this contract
   **/
  function getAddressesProvider() external view override returns (ILendingPoolAddressesProvider) {
    return _addressesProvider;
  }

  /**
   * @dev Returns the maximum number of reserves supported to be listed in this LendingPool
   */
  function MAX_NUMBER_RESERVES() public view returns (uint256) {
    return _maxNumberOfReserves;
  }

  /**
   * @dev Validates and finalizes an aToken transfer
   * - Only callable by the overlying aToken of the `asset`
   * @param project The address of the proyect contrat associated to the reserve
   * @param from The user from which the aTokens are transferred
   * @param to The user receiving the aTokens
   * @param amount The amount being transferred/withdrawn
   * @param balanceFromBefore The aToken balance of the `from` user before the transfer
   * @param balanceToBefore The aToken balance of the `to` user before the transfer
   */
  function finalizeTransfer(
    address project,
    address from,
    address to,
    uint256 amount,
    uint256 balanceFromBefore,
    uint256 balanceToBefore
  ) external override whenNotPaused {
    require(msg.sender == _reserves[project].aTokenAddress, Errors.LP_CALLER_MUST_BE_AN_ATOKEN);

    uint256 reserveId = _reserves[project].id;

    if (from != to) {
      if (balanceFromBefore.sub(amount) == 0) {
        DataTypes.UserConfigurationMap storage fromConfig = _usersConfig[from];
        fromConfig.setUsingAsCollateral(reserveId, false);
        emit ReserveUsedAsCollateralDisabled(project, from);
      }

      if (balanceToBefore == 0 && amount != 0) {
        DataTypes.UserConfigurationMap storage toConfig = _usersConfig[to];
        toConfig.setUsingAsCollateral(reserveId, true);
        emit ReserveUsedAsCollateralEnabled(project, to);
      }
    }
  }

  /**
   * @dev Initializes a reserve, activating it, assigning an aToken and debt tokens and an
   * interest rate strategy
   * - Only callable by the LendingPoolConfigurator contract
   * @param project The address of the proyect contrat associated to the reserve
   * @param asset The address of the underlying asset of the reserve
   * @param aTokenAddress The address of the aToken that will be assigned to the reserve
   * @param stableDebtAddress The address of the StableDebtToken that will be assigned to the reserve
   * @param aTokenAddress The address of the VariableDebtToken that will be assigned to the reserve
   * @param interestRateStrategyAddress The address of the interest rate strategy contract
   **/
  function initReserve(
    address project,
    address asset,
    address aTokenAddress,
    address pTokenAddress,
    address stableDebtAddress,
    address variableDebtAddress,
    address interestRateStrategyAddress,
    address projectBorrower
  ) external override onlyLendingPoolConfigurator {
    require(Address.isContract(project), Errors.LP_NOT_CONTRACT);
    require(Address.isContract(asset), Errors.LP_NOT_CONTRACT);
    _reserves[project].init(
      asset,
      aTokenAddress,
      pTokenAddress,
      stableDebtAddress,
      variableDebtAddress,
      interestRateStrategyAddress,
      projectBorrower
    );
    _addReserveToList(project);
  }

  /**
   * @dev Updates the address of the interest rate strategy contract
   * - Only callable by the LendingPoolConfigurator contract
   * @param project The address of the proyect contrat associated to the reserve
   * @param rateStrategyAddress The address of the interest rate strategy contract
   **/
  function setReserveInterestRateStrategyAddress(address project, address rateStrategyAddress)
    external
    override
    onlyLendingPoolConfigurator
  {
    _reserves[project].interestRateStrategyAddress = rateStrategyAddress;
  }

  /**
   * @dev Sets the configuration bitmap of the reserve as a whole
   * - Only callable by the LendingPoolConfigurator contract
   * @param project The address of the proyect contrat associated to the reserve
   * @param configuration The new configuration bitmap
   **/
  function setConfiguration(address project, uint256 configuration)
    external
    override
    onlyLendingPoolConfigurator
  {
    _reserves[project].configuration.data = configuration;
  }

  /**
   * @dev Set the _pause state of a reserve
   * - Only callable by the LendingPoolConfigurator contract
   * @param val `true` to pause the reserve, `false` to un-pause it
   */
  function setPause(bool val) external override onlyLendingPoolConfigurator {
    _paused = val;
    if (_paused) {
      emit Paused();
    } else {
      emit Unpaused();
    }
  }

  struct ExecuteBorrowParams {
    address project;
    address asset;
    address user;
    address onBehalfOf;
    uint256 amount;
    address aTokenAddress;
    bool releaseUnderlying;
  }

  function _executeBorrow(ExecuteBorrowParams memory vars) internal {
    DataTypes.ReserveData storage reserve = _reserves[vars.project];
    DataTypes.UserConfigurationMap storage userConfig = _usersConfig[vars.onBehalfOf];

    ValidationLogic.validateBorrow(
      vars.asset,
      reserve,
      vars.onBehalfOf,
      vars.amount,
      reserve.projectBorrower,
      _addressesProvider.getEmergencyAdmin()
    );

    reserve.updateState();

    uint256 currentStableRate = reserve.currentStableBorrowRate;

    bool isFirstBorrowing = false;

    isFirstBorrowing = IStableDebtToken(reserve.stableDebtTokenAddress).mint(
      vars.user,
      vars.onBehalfOf,
      vars.amount,
      currentStableRate
    );

    if (isFirstBorrowing) {
      userConfig.setBorrowing(reserve.id, true);
    }

    if (vars.releaseUnderlying) {
      IAToken(vars.aTokenAddress).transferUnderlyingTo(vars.asset, vars.user, vars.amount);
    }

    emit Borrow(
      vars.project,
      vars.asset,
      vars.user,
      vars.onBehalfOf,
      vars.amount,
      currentStableRate
    );
  }

  function _addReserveToList(address project) internal {
    uint256 reservesCount = _reservesCount;

    require(reservesCount < _maxNumberOfReserves, Errors.LP_NO_MORE_RESERVES_ALLOWED);

    bool reserveAlreadyAdded = _reserves[project].id != 0 || _reservesList[0] == project;

    if (!reserveAlreadyAdded) {
      _reserves[project].id = uint8(reservesCount);
      _reservesList[reservesCount] = project;

      _reservesCount = reservesCount + 1;
    }
  }

  function getUnderlyingAsset(address project) external view override returns (address asset) {
    return _reserves[project].underlyingAsset;
  }

  function getATokenAddress(address project) external view override returns (address atoken) {
    return _reserves[project].aTokenAddress;
  }

  function getPTokenAddress(address project) external view override returns (address ptoken) {
    return _reserves[project].pTokenAddress;
  }

  function updateProjectBorrower(
    address project,
    address projectBorrower
  ) external override onlyLendingPoolConfigurator {

    DataTypes.ReserveData storage reserve = _reserves[project];

    reserve.projectBorrower = projectBorrower;

    reserve.updateState();
  }

  function updateInterestRates(
    address project,
    uint128 newDepositRate,
    uint128 newBorrowRate
  ) external override onlyLendingPoolConfigurator {

    DataTypes.ReserveData storage reserve = _reserves[project];

    reserve.updateProjectInterestRates(project, newDepositRate, newBorrowRate);

    reserve.updateState();
  }
}
