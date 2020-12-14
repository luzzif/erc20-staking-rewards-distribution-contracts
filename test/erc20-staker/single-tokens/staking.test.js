const { expect } = require("chai");
const {
    initializeDistribution,
    initializeStaker,
    getTestContext,
    stake,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");

describe("ERC20Staker - Single reward/stakable token - Staking", () => {
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
            await erc20StakerInstance.stake([0]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: not initialized");
        }
    });

    it("should fail when program has not yet started", async () => {
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
            await erc20StakerInstance.stake([0]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: not started");
        }
    });

    it("should fail when the staker has not enough balance", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await erc20StakerInstance.stake([1]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds balance"
            );
        }
    });

    it("should fail when no allowance was set by the staker", async () => {
        try {
            await initializeStaker({
                erc20StakerInstance,
                stakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: 1,
                setAllowance: false,
            });
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await erc20StakerInstance.stake([1]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds allowance"
            );
        }
    });

    it("should fail when not enough allowance was set by the staker", async () => {
        try {
            await initializeStaker({
                erc20StakerInstance,
                stakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: 1,
            });
            // mint additional tokens to the staker for which we
            // don't set the correct allowance
            await stakableTokenInstance.mint(firstStakerAddress, 1);
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await erc20StakerInstance.stake([2]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds allowance"
            );
        }
    });

    it("should succeed in the right conditions", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardTokens = [rewardsTokenInstance];
        const stakableTokens = [stakableTokenInstance];
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens,
            rewardTokens,
            rewardAmounts: [await toWei(1, rewardsTokenInstance)],
            duration: 2,
        });
        await stake(erc20StakerInstance, firstStakerAddress, [stakedAmount]);
        for (let i = 0; i < rewardTokens.length; i++) {
            const stakableToken = stakableTokens[i];
            expect(
                await erc20StakerInstance.stakedTokensOf(
                    firstStakerAddress,
                    stakableToken.address
                )
            ).to.be.equalBn(stakedAmount);
            expect(
                await erc20StakerInstance.stakedTokenAmount(
                    stakableToken.address
                )
            ).to.be.equalBn(stakedAmount);
        }
        expect(
            await erc20StakerInstance.totalStakedTokensAmount()
        ).to.be.equalBn(stakedAmount);
    });
});
