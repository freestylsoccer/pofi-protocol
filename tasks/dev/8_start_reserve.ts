import { task } from 'hardhat/config';
import { getLendingPoolConfiguratorProxy } from '../../helpers/contracts-getters';

task('dev:start-reserve', 'Start Reserve')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ verify }, localBRE) => {
    await localBRE.run('set-DRE');

    const configurator = await getLendingPoolConfiguratorProxy();

    // steps
    // disble deposit
    // disable withdraw
    // updateproject borrower -- maybe do it in reserve initialization
    // enable borrowing on reserve
    // update borrowRate, keep liquidityRate = 0
    // borrow
    // update liquidityRate

    // await configurator.updateProjectBorrower("0xd0761F8315d52CCc7B5D524032060e7166c47a00", "0x2c5CeF061409B80e48b6e9cCc636Ebe58023d1A9");
    // await configurator.enableBorrowingOnReserve("0xd0761F8315d52CCc7B5D524032060e7166c47a00", true);

    // await configurator.updateReserveRates("0x4633c6F79e27e1B75eA38632740506dD5f56e33C", "150000000000000000000000000", "165000000000000000000000000");
    // console.log("rates updated...");

  });
