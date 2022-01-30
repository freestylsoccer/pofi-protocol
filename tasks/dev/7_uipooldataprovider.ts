import { task } from 'hardhat/config';
import {
  deployUiPoolDataProviderV2V3
} from '../../helpers/contracts-deployments';

task('dev:ui-pool-data-provider', 'Deploy UIPoolDataProvider.')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ verify }, localBRE) => {
    await localBRE.run('set-DRE');

    console.log(`\n- UiPoolDataProvider deployment`);
    const uiPoolDataProvider = await deployUiPoolDataProviderV2V3(true);

    console.log('UiPoolDataProvider deployed at:', uiPoolDataProvider.address);
    console.log(`\tFinished UiPoolDataProvider deployment`);
  });
