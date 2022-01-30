// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

import {IERC20} from '../dependencies/openzeppelin/contracts/IERC20.sol';
import {IScaledBalanceToken} from './IScaledBalanceToken.sol';
import {IInitializableAToken} from './IInitializableAToken.sol';
import {IAaveIncentivesController} from './IAaveIncentivesController.sol';

interface IPToken is IERC20, IScaledBalanceToken, IInitializableAToken {
  /**
   * @dev Emitted after the mint action
   * @param from The address performing the mint
   * @param value The amount being
   **/
  event Mint(address indexed from, uint256 value);

  /**
   * @dev Mints `amount` aTokens to `user`
   * @param user The address receiving the minted tokens
   * @param amount The amount of tokens getting minted
   * @return `true` if the the previous balance of the user was 0
   */
  function mint(
    address user,
    uint256 amount
  ) external returns (bool);

  /**
   * @dev Emitted after aTokens are burned
   * @param from The owner of the aTokens, getting them burned
   * @param value The amount being burned
   **/
  event Burn(address indexed from, uint256 value);

  /**
   * @dev Emitted during the transfer action
   * @param from The user whose tokens are being transferred
   * @param to The recipient
   * @param value The amount being transferred
   * @param index The new liquidity index of the reserve
   **/
  event BalanceTransfer(address indexed from, address indexed to, uint256 value, uint256 index);

  /**
   * @dev Burns aTokens from `user` and sends the equivalent amount of underlying to `receiverOfUnderlying`
   * @param user The owner of the aTokens, getting them burned
   * @param amount The amount being burned
   **/
  function burn(
    address user,
    uint256 amount
  ) external;

  function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}
