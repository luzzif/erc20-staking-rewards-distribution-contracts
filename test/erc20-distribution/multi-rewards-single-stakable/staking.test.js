const { expect } = require("chai");
const { initializeDistribution, initializeStaker } = require("../../utils");
const { fastForwardTo } = require("../../utils/network");

const ERC20Distribution = artifacts.require("ERC20Distribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract(
    "ERC20Distribution - Multi rewards, single stakable token - Staking",
    () => {
        let erc20DistributionInstance,
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
            stakableTokenInstance,
            ownerAddress,
            stakerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20Distribution.new({
                from: ownerAddress,
            });
            firstRewardsTokenInstance = await FirstRewardERC20.new();
            secondRewardsTokenInstance = await SecondRewardERC20.new();
            stakableTokenInstance = await FirstStakableERC20.new();
            stakerAddress = accounts[1];
        });

        it("should fail when given an amounts array of different length than the stakable tokens one", async () => {
            try {
                await initializeStaker({
                    erc20DistributionInstance,
                    stakableTokenInstance,
                    stakerAddress,
                    stakableAmount: 1,
                });
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [2, 2],
                    duration: 2,
                });
                await fastForwardTo({ timestamp: startingTimestamp });
                await erc20DistributionInstance.stake([1, 1], {
                    from: stakerAddress,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: inconsistent staked amounts length"
                );
            }
        });

        // all the other cases should already be covered by the single tokens staking test suite
    }
);
