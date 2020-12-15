const BN = require("bn.js");
const { expect } = require("chai");
const { MAXIMUM_VARIANCE, ZERO_BN } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stake,
    withdraw,
    getTestContext,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");
const {
    mineBlocks,
    stopMining,
    mineBlock,
    startMining,
} = require("../../utils/network");

describe("ERC20Staker - Multi rewards, single stakable token - Reward recovery", () => {
    let erc20StakerInstance,
        firstRewardsTokenInstance,
        secondRewardsTokenInstance,
        stakableTokenInstance,
        firstStakerAddress,
        secondStakerAddress,
        ownerAddress;

    beforeEach(async () => {
        const testContext = await getTestContext();
        erc20StakerInstance = testContext.erc20StakerInstance;
        firstRewardsTokenInstance = testContext.firstRewardsTokenInstance;
        secondRewardsTokenInstance = testContext.secondRewardsTokenInstance;
        stakableTokenInstance = testContext.stakableTokenInstance;
        firstStakerAddress = testContext.firstStakerAddress;
        secondStakerAddress = testContext.secondStakerAddress;
        ownerAddress = testContext.ownerAddress;
    });

    it("should recover all of the rewards when the distribution ended and no staker joined", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [
            await toWei(100, firstRewardsTokenInstance),
            await toWei(10, secondRewardsTokenInstance),
        ];
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens,
            rewardAmounts,
            duration: 10,
        });
        // at the start of the distribution, the owner deposited the rewards
        // into the staking contract, so their balance must be 0
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        await mineBlocks(11);
        await erc20StakerInstance.recoverUnassignedRewards();
        for (let i = 0; i < rewardAmounts.length; i++) {
            const rewardToken = rewardTokens[i];
            const rewardAmount = rewardAmounts[i];
            expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                rewardAmount
            );
            expect(
                await erc20StakerInstance.recoverableUnassignedReward(
                    rewardToken.address
                )
            ).to.be.equalBn(ZERO_BN);
        }
    });

    it("should always send funds to the contract's owner, even when called by another account", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [
            await toWei(100, firstRewardsTokenInstance),
            await toWei(10, secondRewardsTokenInstance),
        ];
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens,
            rewardAmounts,
            duration: 10,
        });
        // at the start of the distribution, the owner deposited the rewards
        // into the staking contract, so their balance must be 0
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        await mineBlocks(11);
        await erc20StakerInstance.recoverUnassignedRewards({
            from: firstStakerAddress,
        });
        for (let i = 0; i < rewardAmounts.length; i++) {
            const rewardToken = rewardTokens[i];
            const rewardAmount = rewardAmounts[i];
            expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                rewardAmount
            );
            expect(
                await erc20StakerInstance.recoverableUnassignedReward(
                    rewardToken.address
                )
            ).to.be.equalBn(ZERO_BN);
        }
    });

    it("should recover half of the rewards when only one staker joined for half of the duration", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [
            await toWei(10, firstRewardsTokenInstance),
            await toWei(100, secondRewardsTokenInstance),
        ];
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
            rewardTokens,
            rewardAmounts,
            duration: 10,
        });
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        // stake after 5 blocks until the end of the distribution
        await mineBlocks(5);
        const stakingStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [1]
        );
        await mineBlocks(10);
        const distributionEndingBlock = await erc20StakerInstance.endingBlock();
        // staker staked for 5 blocks
        expect(distributionEndingBlock.sub(stakingStartingBlock)).to.be.equalBn(
            new BN(5)
        );
        // staker claims their reward
        const firstRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            firstRewardsTokenInstance.address
        );
        const secondRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            secondRewardsTokenInstance.address
        );
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(firstRewardPerBlock.mul(new BN(5)));
        expect(
            await secondRewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(secondRewardPerBlock.mul(new BN(5)));
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardAmounts[0].div(new BN(2)));
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardAmounts[1].div(new BN(2)));
    });

    it("should recover half of the rewards when two stakers stake the same time", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [
            await toWei(10, firstRewardsTokenInstance),
            await toWei(100, secondRewardsTokenInstance),
        ];
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: 1,
        });
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: 1,
        });
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens,
            rewardAmounts,
            duration: 10,
        });
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        // stake after 5 blocks until the end of the distribution
        await mineBlocks(5);
        await stopMining();
        const firstStakerStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [1],
            false
        );
        const secondStakerStartingBlock = await stake(
            erc20StakerInstance,
            secondStakerAddress,
            [1],
            false
        );
        await mineBlock();
        await startMining();
        await mineBlocks(10);
        const distributionEndingBlock = await erc20StakerInstance.endingBlock();
        // each staker staked for 5 blocks
        expect(
            distributionEndingBlock.sub(firstStakerStartingBlock)
        ).to.be.equalBn(new BN(5));
        // each staker staked for 5 blocks
        expect(
            distributionEndingBlock.sub(secondStakerStartingBlock)
        ).to.be.equalBn(new BN(5));
        // stakers claim their reward
        const firstRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            firstRewardsTokenInstance.address
        );
        const secondRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            secondRewardsTokenInstance.address
        );
        const expectedFirstReward = firstRewardPerBlock
            .div(new BN(2))
            .mul(new BN(5));
        const expectedSecondReward = secondRewardPerBlock
            .div(new BN(2))
            .mul(new BN(5));
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedFirstReward);
        await erc20StakerInstance.claim({ from: secondStakerAddress });
        expect(
            await secondRewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.equalBn(expectedSecondReward);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardAmounts[0].div(new BN(2)));
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardAmounts[1].div(new BN(2)));
    });

    it("should recover a third of the rewards when a staker stakes for two thirds of the distribution duration", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [
            await toWei(10, firstRewardsTokenInstance),
            await toWei(100, secondRewardsTokenInstance),
        ];
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
            rewardTokens,
            rewardAmounts,
            duration: 12,
        });
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        // stake after 5 blocks until the end of the distribution
        await mineBlocks(4);
        const stakingStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [1],
            false
        );
        await mineBlocks(10);
        const distributionEndingBlock = await erc20StakerInstance.endingBlock();
        expect(distributionEndingBlock.sub(stakingStartingBlock)).to.be.equalBn(
            new BN(8)
        );
        // staker claims their reward
        const firstRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            firstRewardsTokenInstance.address
        );
        const secondRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            secondRewardsTokenInstance.address
        );
        const expectedFirstReward = firstRewardPerBlock.mul(new BN(8));
        const expectedSecondReward = secondRewardPerBlock.mul(new BN(8));
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedFirstReward);
        expect(
            await secondRewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedSecondReward);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.closeBn(rewardAmounts[0].div(new BN(3)), MAXIMUM_VARIANCE);
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.closeBn(rewardAmounts[1].div(new BN(3)), MAXIMUM_VARIANCE);
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, right in the middle", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [
            await toWei(10, firstRewardsTokenInstance),
            await toWei(100, secondRewardsTokenInstance),
        ];
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
            rewardTokens,
            rewardAmounts,
            duration: 12,
        });
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        // stake after 5 blocks until the end of the distribution
        await mineBlocks(4);
        const stakingStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [1],
            false
        );
        await mineBlocks(3);
        // withdraw after 4 blocks, occupying 4 blocks in total
        const stakingEndingBlock = await withdraw(
            erc20StakerInstance,
            firstStakerAddress,
            [1]
        );
        await mineBlocks(10);

        expect(stakingEndingBlock.sub(stakingStartingBlock)).to.be.equalBn(
            new BN(4)
        );
        // staker claims their reward
        const firstRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            firstRewardsTokenInstance.address
        );
        const secondRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            secondRewardsTokenInstance.address
        );
        const expectedFirstReward = firstRewardPerBlock.mul(new BN(4));
        const expectedSecondReward = secondRewardPerBlock.mul(new BN(4));
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedFirstReward);
        expect(
            await secondRewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedSecondReward);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(firstRewardPerBlock.mul(new BN(8)));
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(secondRewardPerBlock.mul(new BN(8)));
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, in the end period", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [
            await toWei(10, firstRewardsTokenInstance),
            await toWei(100, secondRewardsTokenInstance),
        ];
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
            rewardTokens,
            rewardAmounts,
            duration: 12,
        });
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        await mineBlocks(8);
        const stakingStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [1],
            false
        );
        await mineBlocks(3);

        const distributionEndingBlock = await erc20StakerInstance.endingBlock();
        expect(distributionEndingBlock.sub(stakingStartingBlock)).to.be.equalBn(
            new BN(4)
        );
        // staker claims their reward
        const firstRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            firstRewardsTokenInstance.address
        );
        const secondRewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            secondRewardsTokenInstance.address
        );
        const expectedFirstReward = firstRewardPerBlock.mul(new BN(4));
        const expectedSecondReward = secondRewardPerBlock.mul(new BN(4));
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedFirstReward);
        expect(
            await secondRewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedSecondReward);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await firstRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(firstRewardPerBlock.mul(new BN(8)));
        expect(
            await secondRewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(secondRewardPerBlock.mul(new BN(8)));
    });
});
