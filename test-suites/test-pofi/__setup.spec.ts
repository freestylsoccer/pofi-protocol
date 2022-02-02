import rawBRE from 'hardhat';
import { MockContract } from 'ethereum-waffle';
import {
  insertContractAddressInDb,
  getEthersSigners,
  registerContractInJsonDb,
  getEthersSignersAddresses,
} from '../../helpers/contracts-helpers';
import {
  deployLendingPoolAddressesProvider,
  deployMintableERC20,
  deployLendingPoolAddressesProviderRegistry,
  deployLendingPoolConfigurator,
  deployLendingPool,
  deployWalletBalancerProvider,
  deployAaveProtocolDataProvider,
  deployStableAndVariableTokensHelper,
  deployATokensAndRatesHelper,
  deployWETHMocked,
  deployATokenImplementations,
  deployPTokenImplementations,
  deployMockProjects,
  deployUiPoolDataProviderV2V3
} from '../../helpers/contracts-deployments';
import { Signer } from 'ethers';
import { TokenContractId2, eContractid, tEthereumAddress, AavePools } from '../../helpers/types';
import { MintableERC20 } from '../../types/MintableERC20';
import { Project } from '../../types/Project';
import {
  ConfigNames,
  getReservesConfigByPool,
  getTreasuryAddress,
  loadPoolConfig,
} from '../../helpers/configuration';
import { initializeMakeSuite } from './helpers/make-suite';

import { waitForTx } from '../../helpers/misc-utils';
import { initReservesByHelper2, configureReservesByHelper2 } from '../../helpers/init-helpers';
import AaveConfig from '../../markets/aave';
import { ZERO_ADDRESS } from '../../helpers/constants';
import {
  getAllMockedProjects,
  getLendingPool,
  getLendingPoolConfiguratorProxy,
} from '../../helpers/contracts-getters';
import { WETH9Mocked } from '../../types/WETH9Mocked';
import { getAllProjectAddresses } from '../../helpers/mock-helpers';

const deployAllMockTokens = async (deployer: Signer) => {
  const tokens: { [symbol: string]: MockContract | MintableERC20 | WETH9Mocked } = {};

  const protoConfigData = getReservesConfigByPool(AavePools.proto);

  for (const tokenSymbol of Object.keys(TokenContractId2)) {
    if (tokenSymbol === 'WETH') {
      tokens[tokenSymbol] = await deployWETHMocked();
      await registerContractInJsonDb(tokenSymbol.toUpperCase(), tokens[tokenSymbol]);
      continue;
    }
    let decimals = 18;

    let configData = (<any>protoConfigData)[tokenSymbol];

    if (!configData) {
      decimals = 18;
    }

    tokens[tokenSymbol] = await deployMintableERC20([
      tokenSymbol,
      tokenSymbol,
      configData ? configData.reserveDecimals : 18,
    ]);
    await registerContractInJsonDb(tokenSymbol.toUpperCase(), tokens[tokenSymbol]);
  }

  return tokens;

};

export const deployProjects = async (deployer: Signer) => {
  const tokens: { [symbol: string]: Project } = {};

  for (const tokenSymbol of Object.keys(TokenContractId2)) {
    let name = `Pofi Project ${tokenSymbol}`;
    let startDate = '1643327644';
    let endDate = '1644929644';
    let liquidityRate = '150000000000000000000000000'; // 0.15
    let borrowRate = '165000000000000000000000000'; // 0.165

    tokens[tokenSymbol] = await deployMockProjects([
      name,
      startDate,
      endDate,
      liquidityRate,
      borrowRate
    ]);
    await registerContractInJsonDb(`Project${tokenSymbol}`, tokens[tokenSymbol]);
  }

  return tokens;
};

const buildTestEnv = async (deployer: Signer, secondaryWallet: Signer) => {
  console.time('setup');
  console.log('building Test Env');
  const aaveAdmin = await deployer.getAddress();
  const config = loadPoolConfig(ConfigNames.Pofi);

  const mockProject: {
    [symbol: string]: Project;
  } = {
    ...(await deployProjects(deployer)),
  };

  const mockTokens: {
    [symbol: string]: MockContract | MintableERC20 | WETH9Mocked;
  } = {
    ...(await deployAllMockTokens(deployer)),
  };

  // oracle removed
  const addressesProvider = await deployLendingPoolAddressesProvider(AaveConfig.MarketId);
  await waitForTx(await addressesProvider.setPoolAdmin(aaveAdmin));

  //setting users[1] as emergency admin, which is in position 2 in the DRE addresses list
  const addressList = await getEthersSignersAddresses();

  await waitForTx(await addressesProvider.setEmergencyAdmin(addressList[2]));

  // oracle removed
  const addressesProviderRegistry = await deployLendingPoolAddressesProviderRegistry();
  await waitForTx(
    await addressesProviderRegistry.registerAddressesProvider(addressesProvider.address, 1)
  );

  // oracle removed
  const lendingPoolImpl = await deployLendingPool();

  await waitForTx(await addressesProvider.setLendingPoolImpl(lendingPoolImpl.address));

  const lendingPoolAddress = await addressesProvider.getLendingPool();
  const lendingPoolProxy = await getLendingPool(lendingPoolAddress);

  await insertContractAddressInDb(eContractid.LendingPool, lendingPoolProxy.address);

  // oracle removed
  const lendingPoolConfiguratorImpl = await deployLendingPoolConfigurator();
  await waitForTx(
    await addressesProvider.setLendingPoolConfiguratorImpl(lendingPoolConfiguratorImpl.address)
  );
  const lendingPoolConfiguratorProxy = await getLendingPoolConfiguratorProxy(
    await addressesProvider.getLendingPoolConfigurator()
  );
  await insertContractAddressInDb(
    eContractid.LendingPoolConfigurator,
    lendingPoolConfiguratorProxy.address
  );

  // Deploy deployment helpers
  await deployStableAndVariableTokensHelper([lendingPoolProxy.address, addressesProvider.address]);
  await deployATokensAndRatesHelper([
    lendingPoolProxy.address,
    addressesProvider.address,
    lendingPoolConfiguratorProxy.address,
  ]);

  const allTokenAddresses = Object.entries(mockTokens).reduce(
    (accum: { [tokenSymbol: string]: tEthereumAddress }, [tokenSymbol, tokenContract]) => ({
      ...accum,
      [tokenSymbol]: tokenContract.address,
    }),
    {}
  );

  const allProjectAddresses = await getAllProjectAddresses(await getAllMockedProjects());
  
  const { USD, ...tokensAddressesWithoutUsd } = allTokenAddresses;
  const allReservesAddresses = {
    ...tokensAddressesWithoutUsd,
  };

  // Reserve params from AAVE pool + mocked tokens
  const reservesParams = {
    ...config.ReservesConfig,
  };

  const testHelpers = await deployAaveProtocolDataProvider(addressesProvider.address);

  await deployATokenImplementations(ConfigNames.Pofi, reservesParams, false);
  await deployPTokenImplementations(ConfigNames.Pofi, reservesParams, false);

  const admin = await deployer.getAddress();

  const { ATokenNamePrefix, PTokenNamePrefix, StableDebtTokenNamePrefix, VariableDebtTokenNamePrefix, SymbolPrefix } =
    config;
  const treasuryAddress = await getTreasuryAddress(config);
  await deployUiPoolDataProviderV2V3();

  await initReservesByHelper2(
    reservesParams,
    allReservesAddresses,
    allProjectAddresses,
    ATokenNamePrefix,
    PTokenNamePrefix,
    StableDebtTokenNamePrefix,
    VariableDebtTokenNamePrefix,
    SymbolPrefix,
    admin,
    treasuryAddress,
    ZERO_ADDRESS,
    ConfigNames.Aave,
    false,
    "0x596EAE53961A7dc0A82a322F87D11028142c7c54"
  );

  await configureReservesByHelper2(reservesParams, allReservesAddresses, allProjectAddresses, testHelpers, admin);

  await deployWalletBalancerProvider();

  console.timeEnd('setup');
};

before(async () => {
  await rawBRE.run('set-DRE');
  const [deployer, secondaryWallet] = await getEthersSigners();
  const FORK = process.env.FORK;

  if (FORK) {
    await rawBRE.run('aave:mainnet', { skipRegistry: true });
  } else {
    console.log('-> Deploying test environment...');
    await buildTestEnv(deployer, secondaryWallet);
  }

  await initializeMakeSuite();
  console.log('\n***************');
  console.log('Setup and snapshot finished');
  console.log('***************\n');
});
