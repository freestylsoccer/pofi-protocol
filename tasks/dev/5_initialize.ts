import { task } from 'hardhat/config';
import {
  deployLendingPoolCollateralManager,
  deployMockFlashLoanReceiver,
  deployWalletBalancerProvider,
  deployAaveProtocolDataProvider,
  authorizeWETHGateway,
} from '../../helpers/contracts-deployments';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { eNetwork } from '../../helpers/types';
import {
  ConfigNames,
  getReservesConfigByPool,
  getTreasuryAddress,
  loadPoolConfig,
} from '../../helpers/configuration';

import { tEthereumAddress, AavePools, eContractid } from '../../helpers/types';
import { waitForTx, filterMapBy, notFalsyOrZeroAddress } from '../../helpers/misc-utils';
import { configureReservesByHelper, initReservesByHelper, initReservesByHelper2, configureReservesByHelper2 } from '../../helpers/init-helpers';
import { getAllTokenAddresses, getAllProjectAddresses } from '../../helpers/mock-helpers';
import { ZERO_ADDRESS } from '../../helpers/constants';
import {
  getAllMockedProjects,
  getAllMockedTokens,
  getLendingPoolAddressesProvider,
  getWETHGateway,
} from '../../helpers/contracts-getters';
import { insertContractAddressInDb } from '../../helpers/contracts-helpers';

task('dev:initialize-lending-pool', 'Initialize lending pool configuration.')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');
    const network = <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const {
      ATokenNamePrefix,
      PTokenNamePrefix,
      StableDebtTokenNamePrefix,
      VariableDebtTokenNamePrefix,
      SymbolPrefix,
      ReservesConfig,
    } = poolConfig;
    const mockTokens = await getAllMockedTokens();
    const allTokenAddresses = getAllTokenAddresses(mockTokens);
    const mockProjects = await getAllMockedProjects();
    const allProjectAddresses = await getAllProjectAddresses(mockProjects);

    const addressesProvider = await getLendingPoolAddressesProvider();

    const protoPoolReservesAddresses = <{ [symbol: string]: tEthereumAddress }>(
      filterMapBy(allTokenAddresses, (key: string) => !key.includes('UNI_'))
    );

    const testHelpers = await deployAaveProtocolDataProvider(addressesProvider.address, true);

    const admin = await addressesProvider.getPoolAdmin();

    const treasuryAddress = "0xcc1f73107f2C0C96a4525ef692fa375E9fF48642";

    await initReservesByHelper2(
      ReservesConfig,
      protoPoolReservesAddresses,
      allProjectAddresses,
      ATokenNamePrefix,
      PTokenNamePrefix,
      StableDebtTokenNamePrefix,
      VariableDebtTokenNamePrefix,
      SymbolPrefix,
      admin,
      treasuryAddress,
      ZERO_ADDRESS,
      pool,
      verify,
      "0xcc1f73107f2C0C96a4525ef692fa375E9fF48642",
    );

    await configureReservesByHelper2(ReservesConfig, protoPoolReservesAddresses, allProjectAddresses, testHelpers, admin);

    await deployWalletBalancerProvider(verify);

    await insertContractAddressInDb(eContractid.AaveProtocolDataProvider, testHelpers.address);
  });
