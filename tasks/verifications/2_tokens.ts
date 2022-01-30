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
      await getPToken("0x587AC2c09479de3c330830b82c762f02b11F1860"),
      []
    );

    const configs = Object.entries(ReservesConfig) as [string, IReserveParams][];
    // console.log(ReserveAssets);
    // console.log(configs);
    const otherReserveAssets =
    {
      DAI: "0xA325C8f4e48F9331FcF680D9757e9d7Af4461394",
      TUSD: "0x70B7dC2DF4d782f2287d5cb36e2FD1bBB695074d",
      USDC: "0x24CBec54ad1cC16B8e7bCB681D2E9F51939FC617",
      USDT: "0x041A67A9fe6d7C0E13c1ae5d69784C6c9beb2216",
      SUSD: "0x5595Aaa3Ae2bc8816989b7DFEBf71F276A7eEacf",
      BUSD: "0xFD4d00188B0a312d7d339C815B04b766b273f7C0",
    }
    await verifyContract(
      eContractid.InitializableAdminUpgradeabilityProxy,
      await getAToken("0x04Ad3399D9108B2121BdE669f8d5C1B291758E40"),
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

      // Proxy Variable Debt
      console.log(`\n- Verifying  Debt Token proxy...\n`);
      await verifyContract(
        eContractid.InitializableAdminUpgradeabilityProxy,
        await getProxy(variableDebtTokenAddress),
        [lendingPoolConfigurator.address]
      );

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
          `Aave interest bearing ${token}`,
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
          `Aave stable debt bearing ${token}`,
          `stableDebt${token}`,
          ZERO_ADDRESS,
        ]);
      } else {
        console.error(`Skipping stable debt verify for ${token}. Missing address at JSON DB.`);
      }
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
    }
  });
