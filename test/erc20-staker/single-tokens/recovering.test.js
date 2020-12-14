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
const { web3 } = require("hardhat");

describe("ERC20Staker - Single reward/stakable token - Reward recovery", () => {
    let erc20StakerInstance,
        rewardsTokenInstance,
        stakableTokenInstance,
        firstStakerAddress,
        secondStakerAddress,
        ownerAddress;

    beforeEach(async () => {
        const testContext = await getTestContext();
        erc20StakerInstance = testContext.erc20StakerInstance;
        rewardsTokenInstance = testContext.rewardsTokenInstance;
        stakableTokenInstance = testContext.stakableTokenInstance;
        firstStakerAddress = testContext.firstStakerAddress;
        secondStakerAddress = testContext.secondStakerAddress;
        ownerAddress = testContext.ownerAddress;
    });

    it("should fail when the distribution is not initialized", async () => {
        try {
            await erc20StakerInstance.recoverUnassignedRewards();
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
                duration: 10,
                startingBlock: (await web3.eth.getBlockNumber()) + 100,
            });
            await erc20StakerInstance.recoverUnassignedRewards();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: not started");
        }
    });

    it("should recover all of the rewards when the distribution ended and no staker joined", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        // at the start of the distribution, the owner deposited the reward
        // into the staking contract, so theur balance is 0
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        await mineBlocks(11);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardsAmount);
    });

    it("should put the recoverable rewards variable to 0 when recovered", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        await mineBlocks(11);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardsAmount);
        expect(
            await erc20StakerInstance.recoverableUnassignedReward(
                rewardsTokenInstance.address
            )
        ).to.be.equalBn(ZERO_BN);
    });

    it("should always send funds to the contract's owner, even when called by another account", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        // at the start of the distribution, the owner deposited the reward
        // into the staking contract, so theur balance is 0
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        await mineBlocks(11);
        await erc20StakerInstance.recoverUnassignedRewards({
            from: secondStakerAddress,
        });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.equalBn(ZERO_BN);
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardsAmount);
    });

    it("should recover half of the rewards when only one staker joined for half of the duration", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
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
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
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
        const rewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            rewardsTokenInstance.address
        );
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(rewardPerBlock.mul(new BN(5)));
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardsAmount.div(new BN(2)));
    });

    it("should recover half of the rewards when two stakers stake the same time", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
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
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
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
        const rewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            rewardsTokenInstance.address
        );
        const expectedReward = rewardPerBlock.div(new BN(2)).mul(new BN(5));
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardsAmount.div(new BN(2)));
    });

    it("should recover a third of the rewards when a staker stakes for two thirds of the distribution duration", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
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
            rewardAmounts: [rewardsAmount],
            duration: 12,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
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
        const rewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            rewardsTokenInstance.address
        );
        const expectedReward = rewardPerBlock.mul(new BN(8));
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.closeBn(rewardsAmount.div(new BN(3)), MAXIMUM_VARIANCE);
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, right in the middle", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
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
            rewardAmounts: [rewardsAmount],
            duration: 12,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
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
        const rewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            rewardsTokenInstance.address
        );
        const expectedReward = rewardPerBlock.mul(new BN(4));
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardPerBlock.mul(new BN(8)));
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, in the end period", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
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
            rewardAmounts: [rewardsAmount],
            duration: 12,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
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
        const rewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            rewardsTokenInstance.address
        );
        const expectedReward = rewardPerBlock.mul(new BN(4));
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20StakerInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardPerBlock.mul(new BN(8)));
    });
});
