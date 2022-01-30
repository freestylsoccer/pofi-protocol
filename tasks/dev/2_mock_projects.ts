import { task } from 'hardhat/config';
import { deployAllMockProjects } from '../../helpers/contracts-deployments';

task('dev:deploy-mock-projects', 'Deploy mock projects for dev enviroment')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ verify }, localBRE) => {
    await localBRE.run('set-DRE');
    await deployAllMockProjects(verify);
  });
