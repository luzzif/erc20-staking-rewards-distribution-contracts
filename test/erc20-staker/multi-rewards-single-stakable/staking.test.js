const { expect } = require("chai");
const { initializeDistribution, initializeStaker } = require("../../utils");
const { fastForwardTo } = require("../../utils/network");

const ERC20Staker = artifacts.require("ERC20Staker");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract("ERC20Staker - Multi rewards, single stakable token - Staking", () => {
    let erc20StakerInstance,
        firstRewardsTokenInstance,
        secondRewardsTokenInstance,
        stakableTokenInstance,
        ownerAddress,
        stakerAddress;

    beforeEach(async () => {
        const accounts = await web3.eth.getAccounts();
        ownerAddress = accounts[0];
        erc20StakerInstance = await ERC20Staker.new({ from: ownerAddress });
        firstRewardsTokenInstance = await FirstRewardERC20.new();
        secondRewardsTokenInstance = await SecondRewardERC20.new();
        stakableTokenInstance = await FirstStakableERC20.new();
        stakerAddress = accounts[1];
    });

    it("should fail when given an amounts array of different length than the stakable tokens one", async () => {
        try {
            await initializeStaker({
                erc20StakerInstance,
                stakableTokenInstance,
                stakerAddress,
                stakableAmount: 1,
            });
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [1, 1],
                duration: 2,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await erc20StakerInstance.stake([1, 1], {
                from: stakerAddress,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: inconsistent staked amounts length"
            );
        }
    });

    // all the other cases should already be covered by the single tokens staking test suite
});
