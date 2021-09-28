# ERC20 staking rewards distribution contracts

A generic contracts suite to bootstrap staking campaigns in which stakers get
distributed rewards over time in relation to their share of the total staked
tokens. Supports multiple ERC20 reward tokens, locked campaigns (i.e. no
withdrawals until the end of the distribution if tokens are staked), capped
campaigns, and rewards recovery by the owner for those dead moments in which no
tokens are staked.

## Getting started

To use `erc20-staking-rewards-distribution-contracts` in your project (for
example to extend the functionality of either the distribution contract or the
factory), simply run:

```
yarn add -D `erc20-staking-rewards-distribution-contracts`
```

Built artifacts (containing ABI and bytecode) can be imported in the following
way:

```js
const erc20DistributionArtifact = require("erc20-staking-rewards-distribution-contracts/build/ERC20StakingRewardsDistribution.json");
const erc20DistributionFactoryArtifact = require("erc20-staking-rewards-distribution-contracts/build/ERC20StakingRewardsDistributionFactory.json");
```

Solidity source code can be imported in the following way:

```js
import "erc20-staking-rewards-distribution-contracts/ERC20StakingRewardsDistribution.sol";
import "erc20-staking-rewards-distribution-contracts/ERC20StakingRewardsDistributionFactory.sol";
```

## Development

Start by cloning the repo and installing dependencies by running:

```
yarn
```

To trigger a compilation run:

```
yarn compile
```

Tests will be ran using the Truffle framework. They are divided in suites
depending on contract files and execution scenarios. To trigger a test run, just
run:

```
yarn test
```

These tests won't show any coverage data. In order to show coverage statistics
collected through `solidity-coverage` another command must be launched:

```
yarn test:coverage
```

There is a third variant in the testing process that collects information about
average gas consumption and estimates the cost of calling contracts' functions
based on current gas prices read from ETHGasStation. `eth-gas-reporter` is used
to achieve this, and in order to show the aforementioned data, just run:

```
yarn test:gasreport
```

**Warning**: collecting coverage or gas consumption data while performing tests
might slow down the entire process.

Fuzzing with Echidna is also set up on the distribution contract, and is
executed through Trail of Bits' Ethereum security toolbox. In order to run it,
start by install Docker and starting the daemon, then run:

`yarn prepare-fuzzing && yarn est:run`

This flattens all the tested contracts, makes them ready to be analyzed by
Echidna, and boots up the Ethereum security toolbox. When the toolbox is
running, run the following command to start fuzzing:

`echidna-test /tested/ERC20StakingRewardsDistributionFuzzer.sol --contract ERC20StakingRewardsDistributionFuzzer --config /tested/config.yml`

Linting and "prettification" on Solidity code is performed using
`prettier-plugin-solidity` and `solhint-plugin-prettier`. Test code is simply
checked using `eslint` and `prettier`.
