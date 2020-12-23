const BN = require("bn.js");
const { expect } = require("chai");
const { MAXIMUM_VARIANCE, ZERO_BN } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stake,
    withdrawAtTimestamp,
    stakeAtTimestamp,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");
const {
    stopMining,
    mineBlock,
    startMining,
    fastForwardTo,
    getEvmTimestamp,
} = require("../../utils/network");

const ERC20Distribution = artifacts.require("ERC20Distribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract("ERC20Distribution - Single reward/stakable token - Reward recovery", () => {
    let erc20DistributionInstance,
        rewardsTokenInstance,
        stakableTokenInstance,
        ownerAddress,
        firstStakerAddress,
        secondStakerAddress;

    beforeEach(async () => {
        const accounts = await web3.eth.getAccounts();
        ownerAddress = accounts[0];
        erc20DistributionInstance = await ERC20Distribution.new({ from: ownerAddress });
        rewardsTokenInstance = await FirstRewardERC20.new();
        stakableTokenInstance = await FirstStakableERC20.new();
        firstStakerAddress = accounts[1];
        secondStakerAddress = accounts[2];
    });

    it("should fail when the distribution is not initialized", async () => {
        try {
            await erc20DistributionInstance.recoverUnassignedRewards();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Distribution: not initialized");
        }
    });

    it("should fail when the distribution has not yet started", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 10,
            });
            await erc20DistributionInstance.recoverUnassignedRewards();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Distribution: not started");
        }
    });

    it("should recover all of the rewards when the distribution ended and no staker joined", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        const { endingTimestamp } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
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
        await fastForwardTo({ timestamp: endingTimestamp });
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardsAmount);
    });

    it("should put the recoverable rewards variable to 0 when recovered", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        const { endingTimestamp } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        await fastForwardTo({ timestamp: endingTimestamp });
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardsAmount);
        expect(
            await erc20DistributionInstance.recoverableUnassignedReward(
                rewardsTokenInstance.address
            )
        ).to.be.equalBn(ZERO_BN);
    });

    it("should always send funds to the contract's owner, even when called by another account", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        const { endingTimestamp } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
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
        await fastForwardTo({ timestamp: endingTimestamp });
        await erc20DistributionInstance.recoverUnassignedRewards({
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
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: 1,
        });
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        // stake after 5 seconds until the end of the distribution
        const stakingTimestamp = startingTimestamp.add(new BN(5));
        await fastForwardTo({ timestamp: stakingTimestamp });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            [1],
            stakingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        // staker staked for 5 seconds
        expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equalBn(
            new BN(5)
        );
        // staker claims their reward
        const rewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
            rewardsTokenInstance.address
        );
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(rewardPerSecond.mul(new BN(5)));
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardsAmount.div(new BN(2)));
    });

    it("should recover half of the rewards when two stakers stake the same time", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: 1,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: 1,
        });
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        // stake after 5 seconds until the end of the distribution
        await stopMining();
        const stakingTimestamp = startingTimestamp.add(new BN(5));
        await fastForwardTo({ timestamp: stakingTimestamp });
        await stake(erc20DistributionInstance, firstStakerAddress, [1], false);
        await stake(erc20DistributionInstance, secondStakerAddress, [1], false);
        await mineBlock(stakingTimestamp);
        expect(await getEvmTimestamp()).to.be.equalBn(stakingTimestamp);
        await startMining();
        await fastForwardTo({ timestamp: endingTimestamp });
        const distributionEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        // each staker staked for 5 seconds
        expect(distributionEndingTimestamp.sub(stakingTimestamp)).to.be.equalBn(
            new BN(5)
        );
        // stakers claim their reward
        const rewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
            rewardsTokenInstance.address
        );
        const expectedReward = rewardPerSecond.div(new BN(2)).mul(new BN(5));
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20DistributionInstance.claim({ from: secondStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardsAmount.div(new BN(2)));
    });

    it("should recover a third of the rewards when a staker stakes for two thirds of the distribution duration", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: 1,
        });
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 12,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        // stake after 4 seconds until the end of the distribution
        const stakingTimestamp = startingTimestamp.add(new BN(4));
        await fastForwardTo({ timestamp: stakingTimestamp });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            [1],
            stakingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equalBn(
            new BN(8)
        );
        // staker claims their reward
        const rewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
            rewardsTokenInstance.address
        );
        const expectedReward = rewardPerSecond.mul(new BN(8));
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.closeBn(rewardsAmount.div(new BN(3)), MAXIMUM_VARIANCE);
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, right in the middle", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: 1,
        });
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 12,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        // stake after 4 second until the 8th second
        const stakingTimestamp = startingTimestamp.add(new BN(4));
        await fastForwardTo({ timestamp: stakingTimestamp });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            [1],
            stakingTimestamp
        );
        const withdrawTimestamp = stakingTimestamp.add(new BN(4));
        await fastForwardTo({ timestamp: withdrawTimestamp });
        // withdraw after 4 seconds, occupying 4 seconds in total
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            [1],
            withdrawTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });

        expect(withdrawTimestamp.sub(stakingTimestamp)).to.be.equalBn(
            new BN(4)
        );
        // staker claims their reward
        const rewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
            rewardsTokenInstance.address
        );
        const expectedReward = rewardPerSecond.mul(new BN(4));
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardPerSecond.mul(new BN(8)));
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, in the end period", async () => {
        const rewardsAmount = await toWei(100, rewardsTokenInstance);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: 1,
        });
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 12,
        });
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(ZERO_BN);
        const stakingTimestamp = startingTimestamp.add(new BN(8));
        await fastForwardTo({ timestamp: stakingTimestamp });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            [1],
            stakingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });

        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equalBn(
            new BN(4)
        );
        // staker claims their reward
        const rewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
            rewardsTokenInstance.address
        );
        const expectedReward = rewardPerSecond.mul(new BN(4));
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await rewardsTokenInstance.balanceOf(ownerAddress)
        ).to.be.equalBn(rewardPerSecond.mul(new BN(8)));
    });
});
