const BN = require("bn.js");
const { expect } = require("chai");
const {
    initializeDistribution,
    initializeStaker,
    stake,
    withdraw,
    getTestContext,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { mineBlocks } = require("../../utils/network");

describe("ERC20Staker - Single reward/stakable token - Withdrawing", () => {
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
            await erc20StakerInstance.withdraw([0]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: not initialized");
        }
    });

    it("should fail when the distribution has not yet started", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
                startingBlock: 1000,
            });
            await erc20StakerInstance.withdraw([0]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: not started");
        }
    });

    it("should fail when the staker tries to withdraw more than what they staked", async () => {
        try {
            await initializeStaker({
                erc20StakerInstance,
                stakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: 1,
            });
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 10,
            });
            await stake(erc20StakerInstance, firstStakerAddress, [1]);
            await erc20StakerInstance.withdraw([2]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: withdrawn amount greater than current stake"
            );
        }
    });

    it("should succeed in the right conditions, when the distribution has not yet ended", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [await toWei(1, rewardsTokenInstance)],
            duration: 10,
        });
        await erc20StakerInstance.stake([stakedAmount]);
        expect(
            await erc20StakerInstance.stakedTokensOf(
                firstStakerAddress,
                stakableTokenInstance.address
            )
        ).to.be.equalBn(stakedAmount);
        await withdraw(erc20StakerInstance, firstStakerAddress, [
            stakedAmount.div(new BN(2)),
        ]);
        expect(
            await erc20StakerInstance.stakedTokensOf(
                firstStakerAddress,
                stakableTokenInstance.address
            )
        ).to.be.equalBn(stakedAmount.div(new BN(2)));
        expect(
            await erc20StakerInstance.stakedTokenAmount(
                stakableTokenInstance.address
            )
        ).to.be.equalBn(stakedAmount.div(new BN(2)));
        expect(
            await stakableTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(stakedAmount.div(new BN(2)));
    });

    it("should succeed in the right conditions, when the distribution has already ended", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [await toWei(1, rewardsTokenInstance)],
            duration: 10,
        });
        await erc20StakerInstance.stake([stakedAmount]);
        expect(
            await erc20StakerInstance.stakedTokensOf(
                firstStakerAddress,
                stakableTokenInstance.address
            )
        ).to.be.equalBn(stakedAmount);
        await mineBlocks(10);
        await erc20StakerInstance.withdraw([stakedAmount.div(new BN(2))]);
        expect(
            await erc20StakerInstance.stakedTokensOf(
                firstStakerAddress,
                stakableTokenInstance.address
            )
        ).to.be.equalBn(stakedAmount.div(new BN(2)));
        expect(
            await erc20StakerInstance.stakedTokenAmount(
                stakableTokenInstance.address
            )
        ).to.be.equalBn(stakedAmount.div(new BN(2)));
        expect(
            await stakableTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(stakedAmount.div(new BN(2)));
    });
});
