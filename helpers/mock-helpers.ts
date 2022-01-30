import { tEthereumAddress } from './types';
import { MockAggregator } from '../types/MockAggregator';
import { Project } from '../types/Project';
import { MockTokenMap, MockProjectMap } from './contracts-helpers';

export const getAllTokenAddresses = (mockTokens: MockTokenMap) =>
  Object.entries(mockTokens).reduce(
    (accum: { [tokenSymbol: string]: tEthereumAddress }, [tokenSymbol, tokenContract]) => ({
      ...accum,
      [tokenSymbol]: tokenContract.address,
    }),
    {}
  );

export const getAllProjectAddresses = (mockProjects: MockProjectMap) =>
  Object.entries(mockProjects).reduce(
    (accum: { [tokenSymbol: string]: tEthereumAddress }, [tokenSymbol, tokenContract]) => ({
      ...accum,
      [tokenSymbol]: tokenContract.address,
    }),
    {}
  );

export const getAllAggregatorsAddresses = (mockAggregators: {
  [tokenSymbol: string]: MockAggregator;
}) =>
  Object.entries(mockAggregators).reduce(
    (accum: { [tokenSymbol: string]: tEthereumAddress }, [tokenSymbol, aggregator]) => ({
      ...accum,
      [tokenSymbol]: aggregator.address,
    }),
    {}
  );
