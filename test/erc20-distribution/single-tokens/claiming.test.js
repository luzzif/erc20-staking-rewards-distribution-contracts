const { expect, use } = require("chai");
const { MAXIMUM_VARIANCE, ZERO } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stakeAtTimestamp,
    withdrawAtTimestamp,
    claimAllAtTimestamp,
    stake,
    withdraw,
} = require("../../utils");
const {
    stopMining,
    startMining,
    fastForwardTo,
    getEvmTimestamp,
    mineBlock,
} = require("../../utils/network");
const { provider, solidity } = require("hardhat").waffle;
const {
    getContractFactory,
    utils: { parseEther },
} = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistribution - Single reward/stakable token - Claiming", () => {
    const [
        owner,
        firstStaker,
        secondStaker,
        thirdStaker,
    ] = provider.getWallets();

    let erc20DistributionFactoryInstance,
        rewardsTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        const ERC20StakingRewardsDistribution = await getContractFactory(
            "ERC20StakingRewardsDistribution"
        );
        const ERC20StakingRewardsDistributionFactory = await getContractFactory(
            "ERC20StakingRewardsDistributionFactory"
        );
        const FirstRewardERC20 = await getContractFactory("FirstRewardERC20");
        const FirstStakableERC20 = await getContractFactory(
            "FirstStakableERC20"
        );

        const erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
        erc20DistributionFactoryInstance = await ERC20StakingRewardsDistributionFactory.deploy(
            erc20DistributionInstance.address
        );
        rewardsTokenInstance = await FirstRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should succeed in claiming the full reward if only one staker stakes right from the first second", async () => {
        const stakedAmount = parseEther("20");
        const rewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        await fastForwardTo({
            timestamp: startingTimestamp,
            mineBlockAfter: false,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );
        const stakerStartingTimestamp = await getEvmTimestamp();
        expect(stakerStartingTimestamp).to.be.equal(startingTimestamp);
        // make sure the distribution has ended
        await fastForwardTo({ timestamp: endingTimestamp.add(1) });
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainStartingTimestamp).to.be.equal(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equal(endingTimestamp);
        const stakingDuration = onchainEndingTimestamp.sub(
            onchainStartingTimestamp
        );
        expect(stakingDuration).to.be.equal(10);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.equal(rewardsAmount);
    });

    it("should succeed in claiming two rewards if two stakers stake exactly the same amount at different times", async () => {
        const stakedAmount = await parseEther("10");
        const duration = 10;
        const rewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: secondStaker,
            stakableAmount: stakedAmount,
        });
        // make sure the staking operation happens as soon as possible
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );
        const firstStakerStartingTimestamp = await getEvmTimestamp();
        expect(firstStakerStartingTimestamp).to.be.equal(startingTimestamp);
        // make half of the distribution time pass
        await stakeAtTimestamp(
            erc20DistributionInstance,
            secondStaker,
            stakedAmount,
            startingTimestamp.add(5)
        );
        const secondStakerStartingTimestamp = await getEvmTimestamp();
        expect(secondStakerStartingTimestamp).to.be.equal(
            startingTimestamp.add(5)
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainStartingTimestamp).to.be.equal(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equal(endingTimestamp);
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equal(duration);
        // first staker staked for 10 seconds
        expect(
            onchainEndingTimestamp.sub(firstStakerStartingTimestamp)
        ).to.be.equal(10);
        // second staker staked for 5 seconds
        expect(
            onchainEndingTimestamp.sub(secondStakerStartingTimestamp)
        ).to.be.equal(5);
        const rewardPerSecond = rewardsAmount.div(duration);
        // the first staker had all of the rewards for 5 seconds and half of them for 5
        const expectedFirstStakerReward = rewardPerSecond
            .mul(5)
            .add(rewardPerSecond.mul(5).div(2));
        // the second staker had half of the rewards for 5 seconds
        const expectedSecondStakerReward = rewardPerSecond.div(2).mul(5);
        // first staker claiming/balance checking
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedFirstStakerReward);
        // second staker claiming/balance checking
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(expectedSecondStakerReward);
    });

    it("should succeed in claiming three rewards if three stakers stake exactly the same amount at different times", async () => {
        const stakedAmount = await parseEther("10");
        const duration = 12;
        const rewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: secondStaker,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: thirdStaker,
            stakableAmount: stakedAmount,
        });
        // first staker stakes
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );
        const firstStakerStartingTimestamp = await getEvmTimestamp();
        expect(firstStakerStartingTimestamp).to.be.equal(startingTimestamp);
        // second staker stakes
        await stakeAtTimestamp(
            erc20DistributionInstance,
            secondStaker,
            stakedAmount,
            startingTimestamp.add(6)
        );
        const secondStakerStartingTimestamp = await getEvmTimestamp();
        expect(secondStakerStartingTimestamp).to.be.equal(
            startingTimestamp.add(6)
        );
        // third staker stakes
        await stakeAtTimestamp(
            erc20DistributionInstance,
            thirdStaker,
            stakedAmount,
            secondStakerStartingTimestamp.add(3)
        );
        const thirdStakerStartingTimestamp = await getEvmTimestamp();
        expect(thirdStakerStartingTimestamp).to.be.equal(
            secondStakerStartingTimestamp.add(3)
        );
        // make sure the distribution has ended
        await fastForwardTo({
            timestamp: endingTimestamp.add(10),
        });
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainStartingTimestamp).to.be.equal(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equal(endingTimestamp);
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equal(duration);

        // first staker staked for 12 seconds
        expect(
            onchainEndingTimestamp.sub(firstStakerStartingTimestamp)
        ).to.be.equal(12);
        // second staker staked for 6 seconds
        expect(
            onchainEndingTimestamp.sub(secondStakerStartingTimestamp)
        ).to.be.equal(6);
        // third staker staked for 3 seconds
        expect(
            onchainEndingTimestamp.sub(thirdStakerStartingTimestamp)
        ).to.be.equal(3);

        // the first staker had all of the rewards for 6 seconds,
        // half of them for 3 seconds and a third for 3 seconds
        const expectedFirstStakerReward = "7083333333333333333";
        // the second staker had half of the rewards for 6 seconds
        // and a third for 3 seconds
        const expectedSecondStakerReward = "2083333333333333333";
        // the third staker had a third of the rewards for 3 seconds
        const expectedThirdStakerReward = "833333333333333333";

        // first staker claiming/balance checking
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedFirstStakerReward, MAXIMUM_VARIANCE);

        // second staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedSecondStakerReward, MAXIMUM_VARIANCE);

        // third staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(thirdStaker)
            .claimAll(thirdStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(thirdStaker.address)
        ).to.be.closeTo(expectedThirdStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming a reward if a staker stakes when the distribution has already started", async () => {
        const stakedAmount = await parseEther("10");
        const duration = 10;
        const rewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        // fast forward to half of the distribution duration
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp.add(5)
        );
        const stakerStartingTimestamp = await getEvmTimestamp();
        expect(stakerStartingTimestamp).to.be.equal(startingTimestamp.add(5));
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainStartingTimestamp).to.be.equal(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equal(endingTimestamp);
        // the staker staked for half of the duration
        expect(onchainEndingTimestamp.sub(stakerStartingTimestamp)).to.be.equal(
            5
        );
        const rewardPerSecond = rewardsAmount.div(duration);
        // the staker had all of the rewards for 5 seconds
        const expectedFirstStakerReward = rewardPerSecond.mul(5);
        // claim and rewards balance check
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedFirstStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming one rewards if a staker stakes at the last valid distribution second", async () => {
        const stakedAmount = await parseEther("10");
        const duration = 10;
        const rewardsAmount = parseEther("10");
        const {
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        const stakerStartingTimestamp = endingTimestamp.sub(1);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            stakerStartingTimestamp
        );
        expect(stakerStartingTimestamp).to.be.equal(await getEvmTimestamp());
        await fastForwardTo({ timestamp: endingTimestamp });
        const campaignEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(
            campaignEndingTimestamp.sub(stakerStartingTimestamp)
        ).to.be.equal(1);
        const rewardPerSecond = rewardsAmount.div(duration);
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(rewardPerSecond, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming two rewards if two stakers stake exactly the same amount at different times, and then the first staker withdraws a portion of his stake", async () => {
        const stakedAmount = await parseEther("10");
        const duration = 10;
        const rewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: secondStaker,
            stakableAmount: stakedAmount,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );
        const firstStakerStartingTimestamp = await getEvmTimestamp();
        expect(firstStakerStartingTimestamp).to.be.equal(startingTimestamp);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            secondStaker,
            stakedAmount,
            startingTimestamp.add(5)
        );
        const secondStakerStartingTimestamp = await getEvmTimestamp();
        expect(secondStakerStartingTimestamp).to.be.equal(
            startingTimestamp.add(5)
        );
        // first staker withdraws at the eight second
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount.div(2),
            secondStakerStartingTimestamp.add(3)
        );
        const firstStakerWithdrawTimestamp = await getEvmTimestamp();
        expect(firstStakerWithdrawTimestamp).to.be.equal(
            secondStakerStartingTimestamp.add(3)
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainEndingTimestamp).to.be.equal(endingTimestamp);
        expect(onchainStartingTimestamp).to.be.equal(startingTimestamp);
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equal(duration);
        // first staker staked for 10 seconds
        expect(
            onchainEndingTimestamp.sub(firstStakerStartingTimestamp)
        ).to.be.equal(10);
        // first staker withdrew at second 8, 2 seconds before the end
        expect(
            onchainEndingTimestamp.sub(firstStakerWithdrawTimestamp)
        ).to.be.equal(2);
        // second staker staked for 5 seconds
        expect(
            onchainEndingTimestamp.sub(secondStakerStartingTimestamp)
        ).to.be.equal(5);
        const rewardPerSecond = rewardsAmount.div(duration);
        // the first staker had all of the rewards for 5 seconds, half of them for 3, and a third for 2
        const expectedFirstStakerReward = rewardPerSecond
            .mul(5)
            .add(rewardPerSecond.mul(3).div(2))
            .add(rewardPerSecond.mul(2).div(3));
        // the second staker had half of the rewards for 3 seconds and two thirds for 2
        const expectedSecondStakerReward = rewardPerSecond
            .div(2)
            .mul(3)
            .add(rewardPerSecond.mul(2).mul(2).div(3));
        // first staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedFirstStakerReward, MAXIMUM_VARIANCE);
        // second staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedSecondStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming two rewards if two stakers both stake at the last valid distribution second", async () => {
        const stakedAmount = await parseEther("10");
        const duration = 10;
        const rewardsAmount = parseEther("10");
        const {
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: secondStaker,
            stakableAmount: stakedAmount,
        });
        await stopMining();
        const stakingTimestamp = endingTimestamp.sub(1);
        await stake(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            false
        );
        await stake(
            erc20DistributionInstance,
            secondStaker,
            stakedAmount,
            false
        );
        await mineBlock(stakingTimestamp);
        expect(await getEvmTimestamp()).to.be.equal(stakingTimestamp);
        await startMining();
        await fastForwardTo({ timestamp: endingTimestamp });

        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equal(duration);
        expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equal(1);

        const rewardPerSecond = rewardsAmount.div(duration);
        // the first staker had half of the rewards for 1 second
        const expectedFirstStakerReward = rewardPerSecond.div(2);
        // the second staker had half of the rewards for 1 second
        const expectedSecondStakerReward = rewardPerSecond.div(2);

        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedFirstStakerReward, MAXIMUM_VARIANCE);

        // second staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedSecondStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming a reward if a staker stakes at second n and then increases their stake", async () => {
        const stakedAmount = await parseEther("10");
        const duration = 10;
        const rewardsAmount = parseEther("10");
        const amountPerStake = stakedAmount.div(2);
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            amountPerStake,
            startingTimestamp
        );
        const firstStakeStartingTimestamp = await getEvmTimestamp();
        expect(firstStakeStartingTimestamp).to.be.equal(startingTimestamp);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            amountPerStake,
            startingTimestamp.add(5)
        );
        const secondStakeStartingTimestamp = await getEvmTimestamp();
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equal(duration);
        expect(
            onchainEndingTimestamp.sub(firstStakeStartingTimestamp)
        ).to.be.equal(10);
        expect(
            onchainEndingTimestamp.sub(secondStakeStartingTimestamp)
        ).to.be.equal(5);
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(rewardsAmount);
    });

    it("should succeed in claiming two rewards if two staker respectively stake and withdraw at the same second", async () => {
        const stakedAmount = await parseEther("10");
        const duration = 10;
        const rewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: secondStaker,
            stakableAmount: stakedAmount,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );
        const firstStakerStartingTimestamp = await getEvmTimestamp();
        expect(firstStakerStartingTimestamp).to.be.equal(startingTimestamp);
        await stopMining();
        const stakeAndWithdrawTimestamp = startingTimestamp.add(5);
        await stake(
            erc20DistributionInstance,
            secondStaker,
            stakedAmount,
            false
        );
        await withdraw(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            false
        );
        await mineBlock(stakeAndWithdrawTimestamp);
        const secondStakerStartingTimestamp = await getEvmTimestamp();
        const firstStakerWithdrawTimestamp = await getEvmTimestamp();
        await startMining();
        expect(secondStakerStartingTimestamp).to.be.equal(
            stakeAndWithdrawTimestamp
        );
        expect(firstStakerWithdrawTimestamp).to.be.equal(
            stakeAndWithdrawTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equal(duration);
        expect(
            firstStakerWithdrawTimestamp.sub(firstStakerStartingTimestamp)
        ).to.be.equal(5);
        expect(
            onchainEndingTimestamp.sub(secondStakerStartingTimestamp)
        ).to.be.equal(5);

        const rewardPerSecond = rewardsAmount.div(duration);
        // both stakers had all of the rewards for 5 seconds
        const expectedReward = rewardPerSecond.mul(5);

        // first staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedReward);

        // second staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(expectedReward);
    });

    it("should succeed when staggered operations happen (test that found a previous bug)", async () => {
        // what happens here:
        // - First staker stakes
        // - Second staker stakes
        // - First staker fully withdraws
        // - Second staker fully withdraws (no more staked tokens in the contract)
        // - First staker claims all
        // - Second staker claims all
        // - First staker restakes right in the ending 2 seconds
        // - First staker claims accrued rewards after the campaign ended

        const stakedAmount = await parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [parseEther("10")],
            duration: 10,
            stakingCap: 0,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount.mul(2),
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: secondStaker,
            stakableAmount: stakedAmount,
        });

        // first staker stakes at the start
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );

        // second staker stakes at 3 seconds
        const secondStakingTimestamp = startingTimestamp.add(3);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            secondStaker,
            stakedAmount,
            secondStakingTimestamp
        );

        // first staker withdraws at 5 seconds
        const firstWithdrawingTimestamp = secondStakingTimestamp.add(2);
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            firstWithdrawingTimestamp
        );

        // second staker withdraws at 6 seconds
        const secondWithdrawingTimestamp = firstWithdrawingTimestamp.add(1);
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            secondStaker,
            stakedAmount,
            secondWithdrawingTimestamp
        );

        // first staker claims reward and at stakes at 8 seconds
        await stopMining();
        const firstClaimAndRestakeTimestamp = secondWithdrawingTimestamp.add(2);
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        await stake(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            false
        );
        await mineBlock(firstClaimAndRestakeTimestamp);
        expect(await getEvmTimestamp()).to.be.equal(
            firstClaimAndRestakeTimestamp
        );
        await startMining();

        // second staker now claims their previously accrued rewards. With the found and now fixed bug, this
        // would have reverted due to the fact that when the first staker claimed, the reward per staked token for
        // each reward token was put to 0, alongside the consolidated reward per staked token FOR THE FIRST STAKER ONLY.
        // Issue is that the consolidated reward per staked token of the second staker wasn't put to zero.
        // When then consolidating the reward in the last consolidation period for the second staker, when claiming
        // their reward in the following instruction, a calculation was made:
        // `reward.perStakedToken - staker.consolidatedRewardPerStakedToken[reward.token]`, to account for the last
        // consolidation checkpointing. In this scenario, reward.perStakedToken was zero,
        // while the consolidated amount wasn't. This caused an underflow, which now reverts in Solidity 0.8.0.
        const secondClaimTimestamp = firstClaimAndRestakeTimestamp.add(1);
        await claimAllAtTimestamp(
            erc20DistributionInstance,
            secondStaker,
            secondStaker.address,
            secondClaimTimestamp
        );

        // fast forwarding to the end of the campaign
        await fastForwardTo({
            timestamp: endingTimestamp,
        });

        // first staker staked at the start for 5 seconds, while the second staked at 3 seconds
        // for 3 seconds. The two stakers overlapped by a grand total of 2 seconds.
        // The first staker then staked again in the last 2 seconds, but we'll account for
        // this and claim these rewards later in the test.

        // First staker got full rewards for 3 seconds and half rewards for 2 seconds. At a rate
        // of 1 reward token/second, this translates to a reward of 3 + (0.5 * 2) = 4
        const expectedFirstStakerReward = parseEther("4");

        // Second staker got full rewards for 1 second and half rewards for 2 seconds. At a rate
        // of 1 reward token/second, this translates to a reward of 1 + (0.5 * 2) = 2
        const expectedSecondStakerReward = parseEther("2");

        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedFirstStakerReward, MAXIMUM_VARIANCE);
        expect(
            await rewardsTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedSecondStakerReward, MAXIMUM_VARIANCE);

        // used to see how much stuff was actually claimed in the second claim
        const preClaimBalance = await rewardsTokenInstance.balanceOf(
            firstStaker.address
        );
        // now claiming the remaining rewards for the first staker (mentioned in the comment above)
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        // the first staker staked at the end for 2 seconds. At a reward rate of 1 token/second,
        // 2 reward tokens are expected to be claimed
        const postClaimBalance = await rewardsTokenInstance.balanceOf(
            firstStaker.address
        );
        const expectedRemainingReward = parseEther("2");
        expect(postClaimBalance.sub(preClaimBalance)).to.be.closeTo(
            expectedRemainingReward,
            MAXIMUM_VARIANCE
        );

        // we also test recovery for good measure. There have been staked tokens in the contract
        // for all but 2 seconds (first staker staked at the start for 5 seconds and second staker
        // staked at second 3 for 3 seconds, overlapping for 2, and then first staker restaked
        // at the 8th second until the end)
        await erc20DistributionInstance
            .connect(owner)
            .recoverUnassignedRewards();
        const expectedRecoveredReward = parseEther("2");
        expect(
            await rewardsTokenInstance.balanceOf(owner.address)
        ).to.be.closeTo(expectedRecoveredReward, MAXIMUM_VARIANCE);

        // At this point all the tokens minus some wei due to integer truncation should
        // have been recovered from the contract.
        // Initial reward was 10 tokens, the first staker got 6 in total, the second staker
        // 2, and the owner recovered 2.
    });
});
