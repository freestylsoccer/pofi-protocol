import { task } from 'hardhat/config';
import { loadPoolConfig, ConfigNames, getTreasuryAddress } from '../../helpers/configuration';
import { ZERO_ADDRESS } from '../../helpers/constants';
import {
  getAddressById,
  getAToken,
  getPToken,
  getFirstSigner,
  getInterestRateStrategy,
  getLendingPoolAddressesProvider,
  getProxy,
  getStableDebtToken,
  getVariableDebtToken,
} from '../../helpers/contracts-getters';
import { getParamPerNetwork, verifyContract } from '../../helpers/contracts-helpers';
import { eContractid, eNetwork, ICommonConfiguration, IReserveParams } from '../../helpers/types';
import { LendingPoolConfiguratorFactory, LendingPoolFactory } from '../../types';

task('verify:tokens', 'Deploy oracles for dev enviroment')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, all, pool }, localDRE) => {
    await localDRE.run('set-DRE');
    const network = localDRE.network.name as eNetwork;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets, ReservesConfig } = poolConfig as ICommonConfiguration;
    const treasuryAddress = await getTreasuryAddress(poolConfig);

    const addressesProvider = await getLendingPoolAddressesProvider();
    const lendingPoolProxy = LendingPoolFactory.connect(
      await addressesProvider.getLendingPool(),
      await getFirstSigner()
    );

    const lendingPoolConfigurator = LendingPoolConfiguratorFactory.connect(
      await addressesProvider.getLendingPoolConfigurator(),
      await getFirstSigner()
    );

    await verifyContract(
      eContractid.InitializableAdminUpgradeabilityProxy,
      await getPToken("0xd27175f5DfbFc43E79570f01dA320BBcc07836F8"),
      []
    );

    const configs = Object.entries(ReservesConfig) as [string, IReserveParams][];
    // console.log(ReserveAssets);
    // console.log(configs);
    const otherReserveAssets =
    {
      DAI: "0x58397AbCe419984AC70ae1B24869C84a05111e21",
      TUSD: "0xd0761F8315d52CCc7B5D524032060e7166c47a00",
      USDC: "0x28B389456aa1f841261f0809d2c2b5106566E13f",
      USDT: "0x4633c6F79e27e1B75eA38632740506dD5f56e33C",
      SUSD: "0xdfA2469CBFD7A0AFd74fae5b50c02255391B21EC",
      BUSD: "0x761EaaE4CDF672da139aba3f9C32A987117C2142",
    }
    await verifyContract(
      eContractid.InitializableAdminUpgradeabilityProxy,
      await getAToken("0x347c43320E52fb4848C2A3F7f46e7752FD3dDa53"),
      []
    );

    for (const entry of Object.entries(otherReserveAssets)) {
      const [token, tokenAddress] = entry;
      console.log(`- Verifying ${token} token related contracts`);
      const {
        stableDebtTokenAddress,
        variableDebtTokenAddress,
        aTokenAddress,
        interestRateStrategyAddress,
      } = await lendingPoolProxy.getReserveData(tokenAddress);

      const tokenConfig = configs.find(([symbol]) => symbol === token);
      if (!tokenConfig) {
        throw `ReservesConfig not found for ${token} token`;
      }

      const {
        optimalUtilizationRate,
        baseVariableBorrowRate,
        variableRateSlope1,
        variableRateSlope2,
        stableRateSlope1,
        stableRateSlope2,
      } = tokenConfig[1].strategy;

      console.log;
      // Proxy Stable Debt
      console.log(`\n- Verifying Stable Debt Token proxy...\n`);
      await verifyContract(
        eContractid.InitializableAdminUpgradeabilityProxy,
        await getProxy(stableDebtTokenAddress),
        [lendingPoolConfigurator.address]
      );
      /*
      // Proxy Variable Debt
      console.log(`\n- Verifying  Debt Token proxy...\n`);
      await verifyContract(
        eContractid.InitializableAdminUpgradeabilityProxy,
        await getProxy(variableDebtTokenAddress),
        [lendingPoolConfigurator.address]
      );
      */

      // Proxy aToken
      console.log('\n- Verifying aToken proxy...\n');
      await verifyContract(
        eContractid.InitializableAdminUpgradeabilityProxy,
        await getProxy(aTokenAddress),
        [lendingPoolConfigurator.address]
      );

      // Strategy Rate
      console.log(`\n- Verifying Strategy rate...\n`);
      await verifyContract(
        eContractid.DefaultReserveInterestRateStrategy,
        await getInterestRateStrategy(interestRateStrategyAddress),
        [
          addressesProvider.address,
          optimalUtilizationRate,
          baseVariableBorrowRate,
          variableRateSlope1,
          variableRateSlope2,
          stableRateSlope1,
          stableRateSlope2,
        ]
      );

      const stableDebt = await getAddressById(`stableDebt${token}`);
      const variableDebt = await getAddressById(`variableDebt${token}`);
      const aToken = await getAddressById(`a${token}`);
      console.log(aToken)
      if (aToken) {
        console.log('\n- Verifying aToken...\n');
        await verifyContract(eContractid.AToken, await getAToken(aToken), [
          lendingPoolProxy.address,
          tokenAddress,
          treasuryAddress,
          `Pofi interest bearing ${token}`,
          `a${token}`,
          ZERO_ADDRESS,
        ]);
      } else {
        console.error(`Skipping aToken verify for ${token}. Missing address at JSON DB.`);
      }

      if (stableDebt) {
        console.log('\n- Verifying StableDebtToken...\n');
        await verifyContract(eContractid.StableDebtToken, await getStableDebtToken(stableDebt), [
          lendingPoolProxy.address,
          tokenAddress,
          `Pofi stable debt bearing ${token}`,
          `stableDebt${token}`,
          ZERO_ADDRESS,
        ]);
      } else {
        console.error(`Skipping stable debt verify for ${token}. Missing address at JSON DB.`);
      }
      /*
      if (variableDebt) {
        console.log('\n- Verifying VariableDebtToken...\n');
        await verifyContract(
          eContractid.VariableDebtToken,
          await getVariableDebtToken(variableDebt),
          [
            lendingPoolProxy.address,
            tokenAddress,
            `Aave variable debt bearing ${token}`,
            `variableDebt${token}`,
            ZERO_ADDRESS,
          ]
        );
      } else {
        console.error(`Skipping variable debt verify for ${token}. Missing address at JSON DB.`);
      }
      */
    }
  });
