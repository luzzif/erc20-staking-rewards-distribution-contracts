const BN = require("bn.js");
const { expect } = require("chai");
const { MAXIMUM_VARIANCE, ZERO_BN } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stakeAtTimestamp,
    withdrawAtTimestamp,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");
const {
    stopMining,
    startMining,
    fastForwardTo,
    getEvmTimestamp,
} = require("../../utils/network");

const ERC20StakingRewardsDistribution = artifacts.require("ERC20StakingRewardsDistribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract("ERC20StakingRewardsDistribution - Single reward/stakable token - Claiming", () => {
    let erc20DistributionInstance,
        rewardsTokenInstance,
        stakableTokenInstance,
        ownerAddress,
        firstStakerAddress,
        secondStakerAddress,
        thirdStakerAddress;

    beforeEach(async () => {
        const accounts = await web3.eth.getAccounts();
        ownerAddress = accounts[0];
        erc20DistributionInstance = await ERC20StakingRewardsDistribution.new({
            from: ownerAddress,
        });
        rewardsTokenInstance = await FirstRewardERC20.new();
        stakableTokenInstance = await FirstStakableERC20.new();
        firstStakerAddress = accounts[1];
        secondStakerAddress = accounts[2];
        thirdStakerAddress = accounts[3];
    });

    it("should succeed in claiming the full reward if only one staker stakes right from the first second", async () => {
        const stakedAmount = await toWei(20, stakableTokenInstance);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        await fastForwardTo({
            timestamp: startingTimestamp,
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            startingTimestamp
        );
        const stakerStartingTimestamp = await getEvmTimestamp();
        expect(stakerStartingTimestamp).to.be.equalBn(startingTimestamp);
        // make sure the distribution has ended
        await fastForwardTo({ timestamp: endingTimestamp.add(new BN(1)) });
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainStartingTimestamp).to.be.equalBn(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equalBn(endingTimestamp);
        const stakingDuration = onchainEndingTimestamp.sub(
            onchainStartingTimestamp
        );
        expect(stakingDuration).to.be.equalBn(new BN(10));
        const rewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
            rewardsTokenInstance.address
        );
        const firstStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
            firstStakerAddress
        );
        expect(firstStakerRewardsTokenBalance).to.equalBn(
            rewardPerSecond.mul(stakingDuration)
        );
        // additional checks to be extra safe
        expect(firstStakerRewardsTokenBalance).to.equalBn(rewardsAmount);
    });

    it("should succeed in claiming two rewards if two stakers stake exactly the same amount at different times", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await fastForwardTo({
            timestamp: startingTimestamp,
            mineBlockAfter: false,
        });
        // make sure the staking operation happens as soon as possible
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            startingTimestamp
        );
        const firstStakerStartingTimestamp = await getEvmTimestamp();
        expect(firstStakerStartingTimestamp).to.be.equalBn(startingTimestamp);
        // make half of the distribution time pass
        await fastForwardTo({
            timestamp: startingTimestamp.add(new BN(5)),
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            secondStakerAddress,
            stakedAmount,
            startingTimestamp.add(new BN(5))
        );
        const secondStakerStartingTimestamp = await getEvmTimestamp();
        expect(secondStakerStartingTimestamp).to.be.equalBn(
            startingTimestamp.add(new BN(5))
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainStartingTimestamp).to.be.equalBn(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equalBn(endingTimestamp);
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equalBn(duration);
        // first staker staked for 10 seconds
        expect(
            onchainEndingTimestamp.sub(firstStakerStartingTimestamp)
        ).to.be.equalBn(new BN(10));
        // second staker staked for 5 seconds
        expect(
            onchainEndingTimestamp.sub(secondStakerStartingTimestamp)
        ).to.be.equalBn(new BN(5));
        const rewardPerSecond = rewardsAmount.div(duration);
        // the first staker had all of the rewards for 5 seconds and half of them for 5
        const expectedFirstStakerReward = rewardPerSecond
            .mul(new BN(5))
            .add(rewardPerSecond.mul(new BN(5)).div(new BN(2)));
        // the second staker had half of the rewards for 5 seconds
        const expectedSecondStakerReward = rewardPerSecond
            .div(new BN(2))
            .mul(new BN(5));
        // first staker claiming/balance checking
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedFirstStakerReward);
        // second staker claiming/balance checking
        await erc20DistributionInstance.claim({
            from: secondStakerAddress,
        });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.equalBn(expectedSecondStakerReward);
    });

    it("should succeed in claiming three rewards if three stakers stake exactly the same amount at different times", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(12);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: thirdStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await fastForwardTo({
            timestamp: startingTimestamp,
            mineBlockAfter: false,
        });
        // first staker stakes
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            startingTimestamp
        );
        const firstStakerStartingTimestamp = await getEvmTimestamp();
        expect(firstStakerStartingTimestamp).to.be.equalBn(startingTimestamp);
        await fastForwardTo({
            timestamp: startingTimestamp.add(new BN(6)),
            mineBlockAfter: false,
        });
        // second staker stakes
        await stakeAtTimestamp(
            erc20DistributionInstance,
            secondStakerAddress,
            stakedAmount,
            startingTimestamp.add(new BN(6))
        );
        const secondStakerStartingTimestamp = await getEvmTimestamp();
        expect(secondStakerStartingTimestamp).to.be.equalBn(
            startingTimestamp.add(new BN(6))
        );
        await fastForwardTo({
            timestamp: secondStakerStartingTimestamp.add(new BN(3)),
            mineBlockAfter: false,
        });
        // third staker stakes
        await stakeAtTimestamp(
            erc20DistributionInstance,
            thirdStakerAddress,
            stakedAmount,
            secondStakerStartingTimestamp.add(new BN(3))
        );
        const thirdStakerStartingTimestamp = await getEvmTimestamp();
        expect(thirdStakerStartingTimestamp).to.be.equalBn(
            secondStakerStartingTimestamp.add(new BN(3))
        );
        // make sure the distribution has ended
        await fastForwardTo({
            timestamp: endingTimestamp.add(new BN(10)),
        });
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainStartingTimestamp).to.be.equalBn(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equalBn(endingTimestamp);
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equalBn(duration);

        // first staker staked for 12 seconds
        expect(
            onchainEndingTimestamp.sub(firstStakerStartingTimestamp)
        ).to.be.equalBn(new BN(12));
        // second staker staked for 6 seconds
        expect(
            onchainEndingTimestamp.sub(secondStakerStartingTimestamp)
        ).to.be.equalBn(new BN(6));
        // third staker staked for 3 seconds
        expect(
            onchainEndingTimestamp.sub(thirdStakerStartingTimestamp)
        ).to.be.equalBn(new BN(3));

        const rewardPerSecond = rewardsAmount.div(duration);
        // the first staker had all of the rewards for 6 seconds,
        // half of them for 3 seconds and a third for 3 seconds
        const expectedFirstStakerReward = rewardPerSecond
            .mul(new BN(6))
            .add(rewardPerSecond.mul(new BN(3)).div(new BN(2)))
            .add(rewardPerSecond.mul(new BN(3)).div(new BN(3)));
        // the second staker had half of the rewards for 6 seconds
        // and a third for 3 seconds
        const expectedSecondStakerReward = rewardPerSecond
            .mul(new BN(3))
            .div(new BN(2))
            .add(rewardPerSecond.mul(new BN(3)).div(new BN(3)));
        // the third staker had a third of the rewards for 3 seconds
        // (math says that they'd simply get a full second reward for 3 seconds,
        // but let's do the calculation anyway for added clarity)
        const expectedThirdStakerReward = rewardPerSecond
            .mul(new BN(3))
            .div(new BN(3));

        // first staker claiming/balance checking
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.closeBn(expectedFirstStakerReward, MAXIMUM_VARIANCE);

        // second staker claim and rewards balance check
        await erc20DistributionInstance.claim({
            from: secondStakerAddress,
        });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.closeBn(expectedSecondStakerReward, MAXIMUM_VARIANCE);

        // third staker claim and rewards balance check
        await erc20DistributionInstance.claim({ from: thirdStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(thirdStakerAddress)
        ).to.be.closeBn(expectedThirdStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming a reward if a staker stakes when the distribution has already started", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        // fast forward to half of the distribution duration
        await fastForwardTo({
            timestamp: startingTimestamp.add(new BN(5)),
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            startingTimestamp.add(new BN(5))
        );
        const stakerStartingTimestamp = await getEvmTimestamp();
        expect(stakerStartingTimestamp).to.be.equalBn(
            startingTimestamp.add(new BN(5))
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainStartingTimestamp).to.be.equalBn(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equalBn(endingTimestamp);
        // the staker staked for half of the duration
        expect(
            onchainEndingTimestamp.sub(stakerStartingTimestamp)
        ).to.be.equalBn(new BN(5));
        const rewardPerSecond = rewardsAmount.div(duration);
        // the staker had all of the rewards for 5 seconds
        const expectedFirstStakerReward = rewardPerSecond.mul(new BN(5));
        // claim and rewards balance check
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.closeBn(expectedFirstStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming 0 rewards if a staker stakes at the last second (literally)", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const { endingTimestamp } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await fastForwardTo({
            timestamp: endingTimestamp.sub(new BN(1)),
            mineBlockAfter: false,
        });
        const stakerStartingTimestamp = endingTimestamp;
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            stakerStartingTimestamp
        );
        expect(stakerStartingTimestamp).to.be.equalBn(await getEvmTimestamp());
        await fastForwardTo({ timestamp: endingTimestamp });
        const campaignEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(
            campaignEndingTimestamp.sub(stakerStartingTimestamp)
        ).to.be.equalBn(ZERO_BN);
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(ZERO_BN);
    });

    it("should succeed in claiming one rewards if a staker stakes at the last valid distribution second", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const { endingTimestamp } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await fastForwardTo({
            timestamp: endingTimestamp.sub(new BN(1)),
            mineBlockAfter: false,
        });
        const stakerStartingTimestamp = endingTimestamp.sub(new BN(1));
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            stakerStartingTimestamp
        );
        expect(stakerStartingTimestamp).to.be.equalBn(await getEvmTimestamp());
        await fastForwardTo({ timestamp: endingTimestamp });
        const campaignEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(
            campaignEndingTimestamp.sub(stakerStartingTimestamp)
        ).to.be.equalBn(new BN(1));
        const rewardPerSecond = rewardsAmount.div(duration);
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(rewardPerSecond, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming two rewards if two stakers stake exactly the same amount at different times, and then the first staker withdraws a portion of his stake", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await fastForwardTo({
            timestamp: startingTimestamp,
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            startingTimestamp
        );
        const firstStakerStartingTimestamp = await getEvmTimestamp();
        expect(firstStakerStartingTimestamp).to.be.equalBn(startingTimestamp);
        await fastForwardTo({
            timestamp: startingTimestamp.add(new BN(5)),
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            secondStakerAddress,
            stakedAmount,
            startingTimestamp.add(new BN(5))
        );
        const secondStakerStartingTimestamp = await getEvmTimestamp();
        expect(secondStakerStartingTimestamp).to.be.equalBn(
            startingTimestamp.add(new BN(5))
        );
        // first staker withdraws at the eight second
        await fastForwardTo({
            timestamp: secondStakerStartingTimestamp.add(new BN(3)),
            mineBlockAfter: false,
        });
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount.div(new BN(2)),
            secondStakerStartingTimestamp.add(new BN(3))
        );
        const firstStakerWithdrawTimestamp = await getEvmTimestamp();
        expect(firstStakerWithdrawTimestamp).to.be.equalBn(
            secondStakerStartingTimestamp.add(new BN(3))
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainEndingTimestamp).to.be.equalBn(endingTimestamp);
        expect(onchainStartingTimestamp).to.be.equalBn(startingTimestamp);
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equalBn(duration);
        // first staker staked for 10 seconds
        expect(
            onchainEndingTimestamp.sub(firstStakerStartingTimestamp)
        ).to.be.equalBn(new BN(10));
        // first staker withdrew at second 8, 2 seconds before the end
        expect(
            onchainEndingTimestamp.sub(firstStakerWithdrawTimestamp)
        ).to.be.equalBn(new BN(2));
        // second staker staked for 5 seconds
        expect(
            onchainEndingTimestamp.sub(secondStakerStartingTimestamp)
        ).to.be.equalBn(new BN(5));
        const rewardPerSecond = rewardsAmount.div(duration);
        // the first staker had all of the rewards for 5 seconds, half of them for 3, and a third for 2
        const expectedFirstStakerReward = rewardPerSecond
            .mul(new BN(5))
            .add(rewardPerSecond.mul(new BN(3)).div(new BN(2)))
            .add(rewardPerSecond.mul(new BN(2)).div(new BN(3)));
        // the second staker had half of the rewards for 3 seconds and two thirds for 2
        const expectedSecondStakerReward = rewardPerSecond
            .div(new BN(2))
            .mul(new BN(3))
            .add(rewardPerSecond.mul(new BN(2)).mul(new BN(2)).div(new BN(3)));
        // first staker claim and rewards balance check
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.closeBn(expectedFirstStakerReward, MAXIMUM_VARIANCE);
        // second staker claim and rewards balance check
        await erc20DistributionInstance.claim({
            from: secondStakerAddress,
        });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.closeBn(expectedSecondStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming two rewards if two stakers both stake at the last valid distribution second", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const { endingTimestamp } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await stopMining();
        const stakingTimestamp = endingTimestamp.sub(new BN(1));
        await fastForwardTo({
            timestamp: stakingTimestamp,
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            stakingTimestamp
        );
        await stakeAtTimestamp(
            erc20DistributionInstance,
            secondStakerAddress,
            stakedAmount,
            stakingTimestamp
        );
        expect(await getEvmTimestamp()).to.be.equalBn(stakingTimestamp);
        await startMining();
        await fastForwardTo({ timestamp: endingTimestamp });

        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equalBn(duration);
        expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equalBn(
            new BN(1)
        );

        const rewardPerSecond = rewardsAmount.div(duration);
        // the first staker had half of the rewards for 1 second
        const expectedFirstStakerReward = rewardPerSecond.div(new BN(2));
        // the second staker had half of the rewards for 1 second
        const expectedSecondStakerReward = rewardPerSecond.div(new BN(2));

        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedFirstStakerReward);

        // second staker claim and rewards balance check
        await erc20DistributionInstance.claim({
            from: secondStakerAddress,
        });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.equalBn(expectedSecondStakerReward);
    });

    it("should succeed in claiming a reward if a staker stakes at second n and then increases their stake", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const amountPerStake = stakedAmount.div(new BN(2));
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await fastForwardTo({
            timestamp: startingTimestamp,
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            amountPerStake,
            startingTimestamp
        );
        const firstStakeStartingTimestamp = await getEvmTimestamp();
        expect(firstStakeStartingTimestamp).to.be.equalBn(startingTimestamp);
        await fastForwardTo({
            timestamp: startingTimestamp.add(new BN(5)),
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            amountPerStake,
            startingTimestamp.add(new BN(5))
        );
        const secondStakeStartingTimestamp = await getEvmTimestamp();
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equalBn(duration);
        expect(
            onchainEndingTimestamp.sub(firstStakeStartingTimestamp)
        ).to.be.equalBn(new BN(10));
        expect(
            onchainEndingTimestamp.sub(secondStakeStartingTimestamp)
        ).to.be.equalBn(new BN(5));
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(rewardsAmount);
    });

    it("should succeed in claiming two rewards if two staker respectively stake and withdraw at the same second", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20DistributionInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await fastForwardTo({ timestamp: startingTimestamp });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            startingTimestamp
        );
        const firstStakerStartingTimestamp = await getEvmTimestamp();
        expect(firstStakerStartingTimestamp).to.be.equalBn(startingTimestamp);
        await stopMining();
        const stakeAndWithdrawTimestamp = startingTimestamp.add(new BN(5));
        await fastForwardTo({
            timestamp: stakeAndWithdrawTimestamp,
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            secondStakerAddress,
            stakedAmount,
            stakeAndWithdrawTimestamp
        );
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStakerAddress,
            stakedAmount,
            stakeAndWithdrawTimestamp
        );
        const secondStakerStartingTimestamp = await getEvmTimestamp();
        const firstStakerWithdrawTimestamp = await getEvmTimestamp();
        await startMining();
        expect(secondStakerStartingTimestamp).to.be.equalBn(
            stakeAndWithdrawTimestamp
        );
        expect(firstStakerWithdrawTimestamp).to.be.equalBn(
            stakeAndWithdrawTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equalBn(duration);
        expect(
            firstStakerWithdrawTimestamp.sub(firstStakerStartingTimestamp)
        ).to.be.equalBn(new BN(5));
        expect(
            onchainEndingTimestamp.sub(secondStakerStartingTimestamp)
        ).to.be.equalBn(new BN(5));

        const rewardPerSecond = rewardsAmount.div(duration);
        // both stakers had all of the rewards for 5 seconds
        const expectedReward = rewardPerSecond.mul(new BN(5));

        // first staker claim and rewards balance check
        await erc20DistributionInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);

        // second staker claim and rewards balance check
        await erc20DistributionInstance.claim({
            from: secondStakerAddress,
        });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.equalBn(expectedReward);
    });
});
