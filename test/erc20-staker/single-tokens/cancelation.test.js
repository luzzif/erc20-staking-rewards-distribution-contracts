const { expect } = require("chai");
const { ZERO_BN } = require("../../constants");
const { initializeDistribution, getTestContext } = require("../../utils");
const { toWei } = require("../../utils/conversion");

describe("ERC20Staker - Single reward/stakable token - Cancelation", () => {
    let erc20StakerInstance,
        rewardsTokenInstance,
        stakableTokenInstance,
        firstStakerAddress,
        ownerAddress;

    beforeEach(async () => {
        const testContext = await getTestContext();
        erc20StakerInstance = testContext.erc20StakerInstance;
        rewardsTokenInstance = testContext.rewardsTokenInstance;
        stakableTokenInstance = testContext.stakableTokenInstance;
        firstStakerAddress = testContext.firstStakerAddress;
        ownerAddress = testContext.ownerAddress;
    });

    it("should fail when initialization has not been done", async () => {
        try {
            await erc20StakerInstance.cancel();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: not initialized");
        }
    });

    it("should fail when not called by the owner", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await erc20StakerInstance.cancel({ from: firstStakerAddress });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "Ownable: caller is not the owner"
            );
        }
    });

    it("should fail when the program has already started", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await erc20StakerInstance.cancel({ from: ownerAddress });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: distribution already started"
            );
        }
    });

    it("should succeed in the right conditions", async () => {
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const rewardTokens = [rewardsTokenInstance];
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens,
            rewardAmounts: [rewardsAmount],
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
            expect(
                await rewardToken.balanceOf(erc20StakerInstance.address)
            ).to.be.equalBn(ZERO_BN);
            expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                rewardsAmount
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
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
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
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 2,
        });
    });
});
