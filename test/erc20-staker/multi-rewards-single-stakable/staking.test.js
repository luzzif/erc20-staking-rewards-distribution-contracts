const { expect } = require("chai");
const { initializeDistribution, getTestContext } = require("../../utils");

describe("ERC20Staker - Multi rewards, single stakable token - Staking", () => {
    let erc20StakerInstance,
        firstRewardsTokenInstance,
        secondRewardsTokenInstance,
        stakableTokenInstance,
        ownerAddress;

    beforeEach(async () => {
        const testContext = await getTestContext();
        erc20StakerInstance = testContext.erc20StakerInstance;
        firstRewardsTokenInstance = testContext.firstRewardsTokenInstance;
        secondRewardsTokenInstance = testContext.secondRewardsTokenInstance;
        stakableTokenInstance = testContext.stakableTokenInstance;
        ownerAddress = testContext.ownerAddress;
    });

    it("should fail when given an amounts array of different length than the stakable tokens one", async () => {
        try {
            await initializeDistribution({
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
            await erc20StakerInstance.stake([1, 10]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: inconsistent staked amounts length"
            );
        }
    });

    // all the other cases should already be covered by the single tokens staking test suite
});
