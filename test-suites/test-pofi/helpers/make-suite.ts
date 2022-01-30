import { evmRevert, evmSnapshot, DRE } from '../../../helpers/misc-utils';
import { Signer } from 'ethers';
import {
  getLendingPool,
  getLendingPoolAddressesProvider,
  getAaveProtocolDataProvider,
  getAToken,
  getPToken,
  getMintableERC20,
  getLendingPoolConfiguratorProxy,
  getPriceOracle,
  getLendingPoolAddressesProviderRegistry,
  getWETHMocked,
  getWETHGateway,
  getUniswapLiquiditySwapAdapter,
  getUniswapRepayAdapter,
  getFlashLiquidationAdapter,
  getParaSwapLiquiditySwapAdapter,
  getStableDebtToken,
  getVariableDebtToken,
  getUiPoolDataProvider
} from '../../../helpers/contracts-getters';
import { eEthereumNetwork, eNetwork, tEthereumAddress } from '../../../helpers/types';
import { LendingPool } from '../../../types/LendingPool';
import { AaveProtocolDataProvider } from '../../../types/AaveProtocolDataProvider';
import { MintableERC20 } from '../../../types/MintableERC20';
import { AToken } from '../../../types/AToken';
import { StableDebtToken, UiPoolDataProviderV2V3 } from '../../../types';
import { VariableDebtToken } from '../../../types';
import { PToken } from '../../../types';
import { LendingPoolConfigurator } from '../../../types/LendingPoolConfigurator';

import chai from 'chai';
// @ts-ignore
import bignumberChai from 'chai-bignumber';
import { almostEqual } from './almost-equal';
import { PriceOracle } from '../../../types/PriceOracle';
import { LendingPoolAddressesProvider } from '../../../types/LendingPoolAddressesProvider';
import { LendingPoolAddressesProviderRegistry } from '../../../types/LendingPoolAddressesProviderRegistry';
import { getEthersSigners } from '../../../helpers/contracts-helpers';
import { UniswapLiquiditySwapAdapter } from '../../../types/UniswapLiquiditySwapAdapter';
import { UniswapRepayAdapter } from '../../../types/UniswapRepayAdapter';
import { ParaSwapLiquiditySwapAdapter } from '../../../types/ParaSwapLiquiditySwapAdapter';
import { getParamPerNetwork } from '../../../helpers/contracts-helpers';
import { WETH9Mocked } from '../../../types/WETH9Mocked';
import { WETHGateway } from '../../../types/WETHGateway';
import { solidity } from 'ethereum-waffle';
import { AaveConfig } from '../../../markets/aave';
import { FlashLiquidationAdapter } from '../../../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { usingTenderly } from '../../../helpers/tenderly-utils';

chai.use(bignumberChai());
chai.use(almostEqual());
chai.use(solidity);

export interface SignerWithAddress {
  signer: Signer;
  address: tEthereumAddress;
}
export interface TestEnv {
  deployer: SignerWithAddress;
  users: SignerWithAddress[];
  pool: LendingPool;
  configurator: LendingPoolConfigurator;
  oracle: PriceOracle;
  helpersContract: AaveProtocolDataProvider;
  weth: WETH9Mocked;
  aWETH: AToken;
  dai: MintableERC20;
  aDai: AToken;
  usdc: MintableERC20;
  aUsdc: AToken;
  aave: MintableERC20;
  addressesProvider: LendingPoolAddressesProvider;
  uniswapLiquiditySwapAdapter: UniswapLiquiditySwapAdapter;
  uniswapRepayAdapter: UniswapRepayAdapter;
  registry: LendingPoolAddressesProviderRegistry;
  wethGateway: WETHGateway;
  flashLiquidationAdapter: FlashLiquidationAdapter;
  paraswapLiquiditySwapAdapter: ParaSwapLiquiditySwapAdapter;
  allReserves: string[];
  stableDebToken: StableDebtToken;
  variableDebToken: VariableDebtToken;
  stableDebTokenUsdc: StableDebtToken;
  variableDebTokenUsdc: VariableDebtToken;
  pToken: PToken;
  pUsdc: PToken;
  uiPoolDataProvider: UiPoolDataProviderV2V3;
}

let buidlerevmSnapshotId: string = '0x1';
const setBuidlerevmSnapshotId = (id: string) => {
  buidlerevmSnapshotId = id;
};

const testEnv: TestEnv = {
  deployer: {} as SignerWithAddress,
  users: [] as SignerWithAddress[],
  pool: {} as LendingPool,
  configurator: {} as LendingPoolConfigurator,
  helpersContract: {} as AaveProtocolDataProvider,
  oracle: {} as PriceOracle,
  weth: {} as WETH9Mocked,
  aWETH: {} as AToken,
  dai: {} as MintableERC20,
  aDai: {} as AToken,
  usdc: {} as MintableERC20,
  aUsdc: {} as AToken,
  aave: {} as MintableERC20,
  addressesProvider: {} as LendingPoolAddressesProvider,
  uniswapLiquiditySwapAdapter: {} as UniswapLiquiditySwapAdapter,
  uniswapRepayAdapter: {} as UniswapRepayAdapter,
  flashLiquidationAdapter: {} as FlashLiquidationAdapter,
  paraswapLiquiditySwapAdapter: {} as ParaSwapLiquiditySwapAdapter,
  registry: {} as LendingPoolAddressesProviderRegistry,
  wethGateway: {} as WETHGateway,
  allReserves: [],
  stableDebToken: {} as StableDebtToken,
  variableDebToken: {} as VariableDebtToken,
  stableDebTokenUsdc: {} as StableDebtToken,
  variableDebTokenUsdc: {} as VariableDebtToken,
  pToken: {} as PToken,
  pUsdc: {} as PToken,
  uiPoolDataProvider: {} as UiPoolDataProviderV2V3,
} as TestEnv;

export async function initializeMakeSuite() {
  const [_deployer, ...restSigners] = await getEthersSigners();
  const deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }
  testEnv.deployer = deployer;
  testEnv.pool = await getLendingPool();

  testEnv.configurator = await getLendingPoolConfiguratorProxy();

  testEnv.addressesProvider = await getLendingPoolAddressesProvider();

  if (process.env.FORK) {
    testEnv.registry = await getLendingPoolAddressesProviderRegistry(
      getParamPerNetwork(AaveConfig.ProviderRegistry, process.env.FORK as eNetwork)
    );
  } else {
    testEnv.registry = await getLendingPoolAddressesProviderRegistry();
    // testEnv.oracle = await getPriceOracle();
  }

  testEnv.helpersContract = await getAaveProtocolDataProvider();

  const allTokens = await testEnv.helpersContract.getAllATokens();
  // console.log(allTokens);
  const aDaiAddress = allTokens.find((aToken) => aToken.symbol === 'aDAI')?.tokenAddress;
  const aUsdcAddress = allTokens.find((aToken) => aToken.symbol === 'aUSDC')?.tokenAddress;

  // const aWEthAddress = allTokens.find((aToken) => aToken.symbol === 'aWETH')?.tokenAddress;

  const reservesTokens = await testEnv.helpersContract.getAllReservesTokens();
  // console.log(reservesTokens);

  const daiAddress = reservesTokens.find((token) => token.symbol === 'DAI')?.tokenAddress;
  const usdcAddress = reservesTokens.find((token) => token.symbol === 'USDC')?.tokenAddress;
  // const aaveAddress = reservesTokens.find((token) => token.symbol === 'AAVE')?.tokenAddress;
  // const wethAddress = reservesTokens.find((token) => token.symbol === 'WETH')?.tokenAddress;
  testEnv.uiPoolDataProvider =  await getUiPoolDataProvider();
  // console.log(await testEnv.uiPoolDataProvider.getReservesData(await testEnv.addressesProvider.address));
  
  testEnv.allReserves = await testEnv.pool.getReservesList();

  // console.log(await testEnv.pool.getUnderlyingAsset(testEnv.allReserves[1]));

  if (!aDaiAddress|| !aUsdcAddress) {
    process.exit(1);
  }
  if (!daiAddress || !usdcAddress) {
    process.exit(1);
  }

  testEnv.aDai = await getAToken(aDaiAddress);
  testEnv.aUsdc = await getAToken(aUsdcAddress);
  // testEnv.aWETH = await getAToken(aWEthAddress);

  testEnv.dai = await getMintableERC20(daiAddress);
  testEnv.usdc = await getMintableERC20(usdcAddress);

  const reserveData = await testEnv.pool.getReserveData(testEnv.allReserves[1]);
  testEnv.stableDebToken = await getStableDebtToken(reserveData[8]);
  testEnv.variableDebToken = await getVariableDebtToken(reserveData[9]);
  // console.log(reserveData);
  // console.log(reserveData[14]);
  testEnv.pToken = await getPToken(reserveData[14]);
  // "0x073c411d109feb1b0E5B00C9D3Dd6fC27464e5cb"
  // "0x235AaDb27eA828b183EE179D39B68A9E0956d12a"
  const reserveDataUsdc = await testEnv.pool.getReserveData(testEnv.allReserves[4]);
  testEnv.stableDebTokenUsdc = await getStableDebtToken(reserveDataUsdc[8]);
  testEnv.variableDebTokenUsdc = await getVariableDebtToken(reserveDataUsdc[9]);
  // console.log(reserveDataUsdc);
  testEnv.pUsdc = await getPToken(reserveDataUsdc[14]);


  for (let i=0; i<testEnv.allReserves.length; i++) {
    // console.log(await testEnv.helpersContract.getReserveData(testEnv.allReserves[i]));
    // console.log(await testEnv.helpersContract.getReserveConfigurationData(testEnv.allReserves[i]));
  }

  /*
  testEnv.aave = await getMintableERC20(aaveAddress);
  testEnv.weth = await getWETHMocked(wethAddress);
  testEnv.wethGateway = await getWETHGateway();

  testEnv.uniswapLiquiditySwapAdapter = await getUniswapLiquiditySwapAdapter();
  testEnv.uniswapRepayAdapter = await getUniswapRepayAdapter();
  testEnv.flashLiquidationAdapter = await getFlashLiquidationAdapter();

  testEnv.paraswapLiquiditySwapAdapter = await getParaSwapLiquiditySwapAdapter();
  */
}

const setSnapshot = async () => {
  const hre = DRE as HardhatRuntimeEnvironment;
  if (usingTenderly()) {
    setBuidlerevmSnapshotId((await hre.tenderlyNetwork.getHead()) || '0x1');
    return;
  }
  setBuidlerevmSnapshotId(await evmSnapshot());
};

const revertHead = async () => {
  const hre = DRE as HardhatRuntimeEnvironment;
  if (usingTenderly()) {
    await hre.tenderlyNetwork.setHead(buidlerevmSnapshotId);
    return;
  }
  await evmRevert(buidlerevmSnapshotId);
};

export function makeSuite(name: string, tests: (testEnv: TestEnv) => void) {
  describe(name, () => {
    before(async () => {
      await setSnapshot();
    });
    tests(testEnv);
    after(async () => {
      await revertHead();
    });
  });
}
