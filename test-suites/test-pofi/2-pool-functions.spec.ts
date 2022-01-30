import { makeSuite, TestEnv } from './helpers/make-suite';
import { ProtocolErrors } from '../../helpers/types';
import { APPROVAL_AMOUNT_LENDING_POOL } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';

const { expect } = require('chai');

makeSuite('Deposit, Borrow, Withdraw, Repay ', (testEnv: TestEnv) => {
  // let _mockFlashLoanReceiver = {} as MockFlashLoanReceiver;

  const {
    VL_NOT_ENOUGH_AVAILABLE_USER_BALANCE,
    VL_DEPOSITS_DISABLED,
    VL_WITHDRAWALS_DISABLED,
    VL_BORROWING_NOT_ENABLED,
  } = ProtocolErrors;

  it('Deposit', async () => {
    const { users, pool, dai, aDai, allReserves, configurator } = testEnv;

    // enable deposits
    await configurator.enableDepositsOnReserve(allReserves[1]);

    const amountDAItoDeposit = await convertToCurrencyDecimals(dai.address, '1000');

    await dai.connect(users[1].signer).mint(amountDAItoDeposit);
    // user 0 deposits 1000 DAI
    await dai.connect(users[1].signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);
    await pool.connect(users[1].signer).deposit(allReserves[1], dai.address, amountDAItoDeposit, users[1].address);

    const balance = await aDai.balanceOf(users[1].address);
    await expect(balance).to.be.equal(amountDAItoDeposit);
  });

  it('Try to do a deposit when deposits are disabled on reserve ', async () => {
    const { users, pool, dai, allReserves, configurator } = testEnv;
    // enable deposits
    await configurator.disableDepositsOnReserve(allReserves[1]);

    const amountDAItoDeposit = await convertToCurrencyDecimals(dai.address, '1000');

    await dai.connect(users[1].signer).mint(amountDAItoDeposit);
    // user 0 deposits 1000 DAI
    await dai.connect(users[1].signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);
    await expect(
      pool.connect(users[1].signer)
        .deposit(allReserves[1], dai.address, amountDAItoDeposit, users[1].address)
    ).to.be.revertedWith(VL_DEPOSITS_DISABLED);

    // enable deposits
    await configurator.enableDepositsOnReserve(allReserves[1]);
  });

  it('Withdraw ', async () => {
    const { users, pool, dai, allReserves, configurator } = testEnv;

    // enable withdrawls
    await configurator.enableWithdrawalsOnReserve(allReserves[1]);

    const amountDAItoWithdraw = await convertToCurrencyDecimals(dai.address, '1000');
    // console.log('user 1 pToken balance:');
    // console.log(await pToken.balanceOf(users[1].address));

    await pool.connect(users[1].signer).withdraw(allReserves[1], dai.address, amountDAItoWithdraw, users[1].address);
    // console.log(await pool.getReserveData(allReserves[1]));
    const balance = await dai.balanceOf(users[1].address);
    expect(balance).to.be.equal("0x6c6b935b8bbd400000");
  });

  it('Try to do a withdraw when withdrawls are disabled on reserve ', async () => {
    const { users, pool, dai, allReserves, configurator } = testEnv;

    // disable withdrawls
    await configurator.disableWithdrawalsOnReserve(allReserves[1]);

    const amountDAItoDeposit = await convertToCurrencyDecimals(dai.address, '2000');

    await dai.connect(users[1].signer).mint(amountDAItoDeposit);
    // user 0 deposits 1000 DAI
    await dai.connect(users[1].signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);
    await pool.connect(users[1].signer).deposit(allReserves[1], dai.address, amountDAItoDeposit, users[1].address);
    const amountDAItoWithdraw = await convertToCurrencyDecimals(dai.address, '1000');

    await expect(
      pool.connect(users[1].signer)
        .withdraw(allReserves[1], dai.address, amountDAItoWithdraw, users[1].address)
    ).to.be.revertedWith(VL_WITHDRAWALS_DISABLED);

    // enable withdrawls
    await configurator.enableWithdrawalsOnReserve(allReserves[1]);
  });

  it('Borrow', async () => {
    const { users, pool, dai, configurator, allReserves } = testEnv;

    const amountDAItoBorrow = await convertToCurrencyDecimals(dai.address, '1000');
    // set ptoject borrower
    await configurator.updateProjectBorrower(allReserves[1], users[2].address);
    // enable borrowing
    await configurator.enableBorrowingOnReserve(allReserves[1], true);
    // borrow
    await pool.connect(users[2].signer).borrow(allReserves[1], dai.address, amountDAItoBorrow, users[2].address);

    // console.log(await aDai.getIncentivesController());
    const balance = await dai.balanceOf(users[2].address);

    await expect(balance).to.be.equal(amountDAItoBorrow);
  });

  it('Try to Borrow when borrowing is disabled ', async () => {
    const { users, pool, dai, aDai, stableDebToken, variableDebToken, configurator, allReserves } = testEnv;

    const amountDAItoBorrow = await convertToCurrencyDecimals(dai.address, '1000');
    // set ptoject borrower
    await configurator.updateProjectBorrower(allReserves[1], users[2].address);
    // enable borrowing
    await configurator.disableBorrowingOnReserve(allReserves[1]);
    // borrow
    await expect(
      pool.connect(users[2].signer).borrow(allReserves[1], dai.address, amountDAItoBorrow, users[2].address)
      ).to.be.revertedWith(VL_BORROWING_NOT_ENABLED);

    await configurator.enableBorrowingOnReserve(allReserves[1], true);

    const amountDAItoWithdraw = await convertToCurrencyDecimals(dai.address, '1000');
    await pool.connect(users[1].signer).withdraw(allReserves[1], dai.address, amountDAItoWithdraw, users[1].address);
  });

  it('Try to Borrow when not project borrower ', async () => {
    const { users, pool, dai, configurator, allReserves } = testEnv;

    const amountDAItoBorrow = await convertToCurrencyDecimals(dai.address, '1000');
    // set ptoject borrower
    await configurator.updateProjectBorrower(allReserves[1], users[2].address);
    // borrow
    await expect(
      pool.connect(users[3].signer).borrow(allReserves[1], dai.address, amountDAItoBorrow, users[3].address)
      ).to.be.revertedWith("Only project borrower or emergency admin");

    await configurator.enableBorrowingOnReserve(allReserves[1], true);
  });

  it('Reapay ',  async () => {
    const { users, pool, dai, variableDebToken, allReserves } = testEnv;

    // user 0 deposits 1000 DAI
    await dai.connect(users[2].signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    const amountDAItoRepay = await convertToCurrencyDecimals(dai.address, '2000');
    await dai.connect(users[2].signer).mint(amountDAItoRepay);

    await pool.connect(users[2].signer).repay(allReserves[1], dai.address, amountDAItoRepay, users[2].address);

    let variableDebtBalance = await variableDebToken.connect(users[3].signer).balanceOf(users[3].address);
    await expect(variableDebtBalance).to.be.equal("0x00");
  });

  it('Try to Withdral interest without balance ', async () => {
    const { users, pool, dai, allReserves } = testEnv;

    await expect(
      pool.connect(users[5].signer).withdrawInterest(allReserves[1], dai.address, users[5].address)
    ).to.be.revertedWith(VL_NOT_ENOUGH_AVAILABLE_USER_BALANCE);
  });

  it('Set interest rates ', async () => {
    const { configurator, allReserves } = testEnv;
    await configurator.updateReserveRates(allReserves[1], "149836137868559762747440042", "63644321225180017306639757");

    function timeout(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    await timeout(1000);
  });

  it('Borrow after setting interest rates ', async () => {
    const { users, pool, dai, configurator, allReserves } = testEnv;

    const amountDAItoBorrow = await convertToCurrencyDecimals(dai.address, '1000');
    // set ptoject borrower
    await configurator.updateProjectBorrower(allReserves[1], users[2].address);
    // enable borrowing
    await configurator.enableBorrowingOnReserve(allReserves[1], true);
    // borrow
    await pool.connect(users[2].signer).borrow(allReserves[1], dai.address, amountDAItoBorrow, users[2].address);

    // console.log(await aDai.getIncentivesController());
    const balance = await dai.balanceOf(users[2].address);

    await expect(balance).to.be.equal("3000000000000000000000");
    // await configurator.disableBorrowingOnReserve(allReserves[1]);
  });

  it('Withdral interest when reserve has not enough balance', async () => {
    const { users, pool, dai, allReserves } = testEnv;

    await expect(
      pool.connect(users[1].signer).withdrawInterest(allReserves[1], dai.address, users[1].address)
    ).to.be.revertedWith('SafeERC20: low-level call failed');
  });

  it('Reapay after borrow',  async () => {
    const { users, pool, dai, variableDebToken, allReserves } = testEnv;

    // user 0 deposits 1000 DAI
    await dai.connect(users[2].signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    const amountDAItoRepay = await convertToCurrencyDecimals(dai.address, '1100');

    await pool.connect(users[2].signer).repay(allReserves[1], dai.address, amountDAItoRepay, users[2].address);

    let variableDebtBalance = await variableDebToken.connect(users[2].signer).balanceOf(users[2].address);
    await expect(variableDebtBalance).to.be.equal("0x00");
  });

  it('Withdral interest after repay', async () => {
    const { users, pool, dai, allReserves } = testEnv;

    await pool.connect(users[1].signer).withdrawInterest(allReserves[1], dai.address, users[1].address);

    function timeout(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    await timeout(3000);
  });
/*
  it('print ', async () => {
    const { users, aDai, pToken, helpersContract, allReserves } = testEnv;
    console.log('user reserve data:');
    console.log(await helpersContract.getUserReserveData(allReserves[1],users[1].address));
    console.log('reserve data:');
    console.log(await helpersContract.getReserveData(allReserves[1]));
    
    console.log('aToken total supply:');
    console.log(await aDai.totalSupply());
    console.log('user 1 aToken scaled balance:');
    console.log(await aDai.scaledBalanceOf(users[1].address));
    console.log('user 1 aToken balance:');
    console.log(await aDai.balanceOf(users[1].address));
  });
*/

  it('test ui pool data provider', async () => {
    const {uiPoolDataProvider, users, addressesProvider} = testEnv;

    // console.log(await uiPoolDataProvider.getReservesData(addressesProvider.address));
    console.log(await uiPoolDataProvider.getUserReservesData(addressesProvider.address, users[0].address));
  });
});
