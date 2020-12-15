const { expect } = require("chai");
const { ZERO_BN } = require("../../constants");
const { initializeDistribution, getTestContext } = require("../../utils");
const { toWei } = require("../../utils/conversion");

describe("ERC20Staker - Multi rewards, single stakable token - Cancelation", () => {
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

    it("should succeed in the right conditions", async () => {
        const rewardAmounts = [
            await toWei(10, firstRewardsTokenInstance),
            await toWei(100, secondRewardsTokenInstance),
        ];
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens,
            rewardAmounts,
            duration: 2,
            // a block in the far future so that we can cancel when
            // the distribution has not yet started
            startingBlock: 1000,
        });
        await erc20StakerInstance.cancel({ from: ownerAddress });

        expect(await erc20StakerInstance.getRewardTokens()).to.have.length(0);
        expect(await erc20StakerInstance.getStakableTokens()).to.have.length(0);
        for (let i = 0; i < rewardTokens.length; i++) {
            const rewardToken = rewardTokens[i];
            const rewardAmount = rewardAmounts[i];
            expect(
                await rewardToken.balanceOf(erc20StakerInstance.address)
            ).to.be.equalBn(ZERO_BN);
            expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                rewardAmount
            );
            expect(
                await erc20StakerInstance.rewardTokenMultiplier(
                    rewardToken.address
                )
            ).to.be.equalBn(ZERO_BN);
            expect(
                await erc20StakerInstance.rewardAmount(rewardToken.address)
            ).to.be.equalBn(ZERO_BN);
            expect(
                await erc20StakerInstance.rewardPerBlock(rewardToken.address)
            ).to.be.equalBn(ZERO_BN);
        }
        expect(await erc20StakerInstance.startingBlock()).to.be.equalBn(
            ZERO_BN
        );
        expect(await erc20StakerInstance.endingBlock()).to.be.equalBn(ZERO_BN);
        expect(
            await erc20StakerInstance.lastConsolidationBlock()
        ).to.be.equalBn(ZERO_BN);
        expect(await erc20StakerInstance.initialized()).to.be.false;
    });

    it("should allow for a second initialization on success", async () => {
        const rewardAmounts = [
            await toWei(10, firstRewardsTokenInstance),
            await toWei(10, firstRewardsTokenInstance),
        ];
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens,
            rewardAmounts,
            duration: 2,
            // a block in the far future so that we can cancel when
            // the distribution has not yet started
            startingBlock: 1000,
        });
        await erc20StakerInstance.cancel({ from: ownerAddress });
        // resending funds since the ones sent before have been sent back
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens,
            rewardAmounts,
            duration: 2,
        });
    });
});
