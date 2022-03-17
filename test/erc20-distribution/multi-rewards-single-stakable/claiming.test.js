const { expect, use } = require("chai");
const { MAXIMUM_VARIANCE, ZERO } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stakeAtTimestamp,
    withdrawAtTimestamp,
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

describe("ERC20StakingRewardsDistribution - Single stakable, multi reward tokens - Claiming", () => {
    const [
        owner,
        firstStaker,
        secondStaker,
        thirdStaker,
    ] = provider.getWallets();

    let erc20DistributionFactoryInstance,
        firstRewardTokenInstance,
        secondRewardTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        const ERC20StakingRewardsDistribution = await getContractFactory(
            "ERC20StakingRewardsDistribution"
        );
        const ERC20StakingRewardsDistributionFactory = await getContractFactory(
            "ERC20StakingRewardsDistributionFactory"
        );
        const FirstRewardERC20 = await getContractFactory("FirstRewardERC20");
        const SecondRewardERC20 = await getContractFactory("SecondRewardERC20");
        const FirstStakableERC20 = await getContractFactory(
            "FirstStakableERC20"
        );

        const erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
        erc20DistributionFactoryInstance = await ERC20StakingRewardsDistributionFactory.deploy(
            erc20DistributionInstance.address
        );
        firstRewardTokenInstance = await FirstRewardERC20.deploy();
        secondRewardTokenInstance = await SecondRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should succeed in claiming the full reward if only one staker stakes right from the first second", async () => {
        const stakedAmount = parseEther("20");
        const firstRewardAmount = parseEther("10");
        const secondRewardAmount = parseEther("20");
        const {
            erc20DistributionInstance,
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardAmount, secondRewardAmount],
            duration: 10,
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
        const firstStakerRewardsTokenBalance = await firstRewardTokenInstance.balanceOf(
            firstStaker.address
        );
        expect(firstStakerRewardsTokenBalance).to.equal(firstRewardAmount);
        // additional checks to be extra safe
        expect(firstStakerRewardsTokenBalance).to.equal(firstRewardAmount);

        const secondStakerRewardsTokenBalance = await secondRewardTokenInstance.balanceOf(
            firstStaker.address
        );
        expect(secondStakerRewardsTokenBalance).to.equal(secondRewardAmount);
        // additional checks to be extra safe
        expect(secondStakerRewardsTokenBalance).to.equal(secondRewardAmount);
    });

    it("should succeed when claiming zero first rewards and all of the second rewards", async () => {
        const stakedAmount = parseEther("20");
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("20");
        const {
            erc20DistributionInstance,
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
            duration: 10,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        // make sure the staking operation happens as soon as possible
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp.add(1) });
        // staker staked for all of the campaign's duration
        await erc20DistributionInstance
            .connect(firstStaker)
            .claim([firstRewardsAmount, 0], firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(firstRewardsAmount);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(ZERO);
        expect(
            await firstRewardTokenInstance.balanceOf(
                erc20DistributionInstance.address
            )
        ).to.be.equal(ZERO);
        expect(
            await secondRewardTokenInstance.balanceOf(
                erc20DistributionInstance.address
            )
        ).to.be.equal(secondRewardsAmount);
    });

    it("should succeed when claiming zero first reward and all of the second reward", async () => {
        const stakedAmount = parseEther("20");
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("20");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
            duration: 10,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        // make sure the staking operation happens as soon as possible
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp.add(1) });
        // staker staked for all of the campaign's duration
        await erc20DistributionInstance
            .connect(firstStaker)
            .claim([0, secondRewardsAmount], firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(ZERO);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(secondRewardsAmount);
        expect(
            await firstRewardTokenInstance.balanceOf(
                erc20DistributionInstance.address
            )
        ).to.be.equal(firstRewardsAmount);
        expect(
            await secondRewardTokenInstance.balanceOf(
                erc20DistributionInstance.address
            )
        ).to.be.equal(ZERO);
    });

    it("should succeed when claiming zero first rewards and part of the second rewards", async () => {
        const stakedAmount = parseEther("20");
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("20");
        const {
            erc20DistributionInstance,
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
            duration: 10,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        // make sure the staking operation happens as soon as possible
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp.add(1) });
        // staker staked for all of the campaign's duration, but we only claim half of the first reward
        const halfFirstRewardsAmount = firstRewardsAmount.div(2);
        await erc20DistributionInstance
            .connect(firstStaker)
            .claim([halfFirstRewardsAmount, 0], firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(halfFirstRewardsAmount);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(ZERO);
        expect(
            await firstRewardTokenInstance.balanceOf(
                erc20DistributionInstance.address
            )
        ).to.be.equal(halfFirstRewardsAmount);
        expect(
            await secondRewardTokenInstance.balanceOf(
                erc20DistributionInstance.address
            )
        ).to.be.equal(secondRewardsAmount);
    });

    it("should succeed when claiming zero first reward and all of the second reward", async () => {
        const stakedAmount = parseEther("20");
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("20");
        const {
            erc20DistributionInstance,
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
            duration: 10,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: stakedAmount,
        });
        // make sure the staking operation happens as soon as possible
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            stakedAmount,
            startingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp.add(1) });
        // staker staked for all of the campaign's duration, but we only claim half of the second reward
        const halfSecondRewardsAmount = secondRewardsAmount.div(2);
        await erc20DistributionInstance
            .connect(firstStaker)
            .claim([0, halfSecondRewardsAmount], firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(ZERO);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(halfSecondRewardsAmount);
        expect(
            await firstRewardTokenInstance.balanceOf(
                erc20DistributionInstance.address
            )
        ).to.be.equal(firstRewardsAmount);
        expect(
            await secondRewardTokenInstance.balanceOf(
                erc20DistributionInstance.address
            )
        ).to.be.equal(halfSecondRewardsAmount);
    });

    it("should succeed in claiming two multiple rewards if two stakers stake exactly the same amount at different times", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardAmount = parseEther("10");
        const secondRewardAmount = parseEther("50");
        const {
            erc20DistributionInstance,
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardAmount, secondRewardAmount],
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
        const firstRewardPerSecond = firstRewardAmount.div(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        );
        const secondRewardPerSecond = secondRewardAmount.div(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        );
        // the first staker had all of the rewards for 5 seconds and half of them for 5
        const expectedFirstFirstStakerReward = firstRewardPerSecond
            .mul(5)
            .add(firstRewardPerSecond.mul(5).div(2));
        const expectedSecondFirstStakerReward = secondRewardPerSecond
            .mul(5)
            .add(secondRewardPerSecond.mul(5).div(2));
        // the second staker had half of the rewards for 5 seconds
        const expectedFirstSecondStakerReward = firstRewardPerSecond
            .div(2)
            .mul(5);
        const expectedSecondSecondStakerReward = secondRewardPerSecond
            .div(2)
            .mul(5);
        // first staker claiming/balance checking
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedFirstFirstStakerReward);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedSecondFirstStakerReward);
        // second staker claiming/balance checking
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(expectedFirstSecondStakerReward);
        expect(
            await secondRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(expectedSecondSecondStakerReward);
    });

    it("should succeed in claiming three rewards if three stakers stake exactly the same amount at different times", async () => {
        const stakedAmount = parseEther("10");
        const duration = 12;
        const firstRewardAmount = parseEther("12");
        const secondRewardAmount = parseEther("30");
        const {
            erc20DistributionInstance,
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardAmount, secondRewardAmount],
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

        const firstRewardPerSecond = firstRewardAmount.div(duration);
        const secondRewardPerSecond = secondRewardAmount.div(duration);
        // the first staker had all of the rewards for 6 seconds,
        // half of them for 3 seconds and a third for 3 seconds
        const expectedFirstFirstStakerReward = firstRewardPerSecond
            .mul(6)
            .add(firstRewardPerSecond.mul(3).div(2))
            .add(firstRewardPerSecond.mul(3).div(3));
        const expectedSecondFirstStakerReward = secondRewardPerSecond
            .mul(6)
            .add(secondRewardPerSecond.mul(3).div(2))
            .add(secondRewardPerSecond.mul(3).div(3));
        // the second staker had half of the rewards for 6 seconds
        // and a third for 3 seconds
        const expectedFirstSecondStakerReward = firstRewardPerSecond
            .mul(3)
            .div(2)
            .add(firstRewardPerSecond.mul(3).div(3));
        const expectedSecondSecondStakerReward = secondRewardPerSecond
            .mul(3)
            .div(2)
            .add(secondRewardPerSecond.mul(3).div(3));
        // the third staker had a third of the rewards for 3 seconds
        // (math says that they'd simply get a full second reward for 3 seconds,
        // but let's do the calculation anyway for added clarity)
        const expectedFirstThirdStakerReward = firstRewardPerSecond
            .mul(3)
            .div(3);
        const expectedSecondThirdStakerReward = secondRewardPerSecond
            .mul(3)
            .div(3);

        // first staker claiming/balance checking
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedFirstFirstStakerReward, MAXIMUM_VARIANCE);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedSecondFirstStakerReward, MAXIMUM_VARIANCE);

        // second staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedFirstSecondStakerReward, MAXIMUM_VARIANCE);
        expect(
            await secondRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedSecondSecondStakerReward, MAXIMUM_VARIANCE);

        // third staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(thirdStaker)
            .claimAll(thirdStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(thirdStaker.address)
        ).to.be.closeTo(expectedFirstThirdStakerReward, MAXIMUM_VARIANCE);
        expect(
            await secondRewardTokenInstance.balanceOf(thirdStaker.address)
        ).to.be.closeTo(expectedSecondThirdStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming a reward if a staker stakes when the distribution has already started", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("20");
        const {
            erc20DistributionInstance,
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
        // claim and rewards balance check
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(parseEther("5"));
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(parseEther("10"));
    });

    it("should succeed in claiming one rewards if a staker stakes at the last valid distribution second", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("20");
        const {
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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

        const firstRewardPerSecond = firstRewardsAmount.div(duration);
        const secondRewardPerSecond = secondRewardsAmount.div(duration);
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(firstRewardPerSecond, MAXIMUM_VARIANCE);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(secondRewardPerSecond, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming two rewards if two stakers stake exactly the same amount at different times, and then the first staker withdraws a portion of his stake", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("40");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
        const firstRewardPerSecond = firstRewardsAmount.div(duration);
        const secondRewardPerSecond = secondRewardsAmount.div(duration);
        // the first staker had all of the rewards for 5 seconds, half of them for 3, and a third for 2
        const expectedFirstFirstStakerReward = firstRewardPerSecond
            .mul(5)
            .add(firstRewardPerSecond.mul(3).div(2))
            .add(firstRewardPerSecond.mul(2).div(3));
        const expectedSecondFirstStakerReward = secondRewardPerSecond
            .mul(5)
            .add(secondRewardPerSecond.mul(3).div(2))
            .add(secondRewardPerSecond.mul(2).div(3));
        // the second staker had half of the rewards for 3 seconds and two thirds for 2
        const expectedFirstSecondStakerReward = firstRewardPerSecond
            .div(2)
            .mul(3)
            .add(firstRewardPerSecond.mul(2).mul(2).div(3));
        const expectedSecondSecondStakerReward = secondRewardPerSecond
            .div(2)
            .mul(3)
            .add(secondRewardPerSecond.mul(2).mul(2).div(3));
        // first staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedFirstFirstStakerReward, MAXIMUM_VARIANCE);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedSecondFirstStakerReward, MAXIMUM_VARIANCE);
        // second staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedFirstSecondStakerReward, MAXIMUM_VARIANCE);
        expect(
            await secondRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedSecondSecondStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming two rewards if two stakers both stake at the last valid distribution second", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("20");
        const {
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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

        const firstRewardPerSecond = firstRewardsAmount.div(duration);
        const secondRewardPerSecond = secondRewardsAmount.div(duration);
        // the first staker had half of the rewards for 1 second
        const expectedFirstFirstStakerReward = firstRewardPerSecond.div(2);
        const expectedSecondFirstStakerReward = secondRewardPerSecond.div(2);
        // the second staker had half of the rewards for 1 second
        const expectedFirstSecondStakerReward = firstRewardPerSecond.div(2);
        const expectedSecondSecondStakerReward = secondRewardPerSecond.div(2);

        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedFirstFirstStakerReward, MAXIMUM_VARIANCE);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.closeTo(expectedSecondFirstStakerReward, MAXIMUM_VARIANCE);

        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedFirstSecondStakerReward, MAXIMUM_VARIANCE);
        expect(
            await secondRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.closeTo(expectedSecondSecondStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming a reward if a staker stakes at second n and then increases their stake", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("100");
        const amountPerStake = stakedAmount.div(2);
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(firstRewardsAmount);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(secondRewardsAmount);
    });

    it("should succeed in claiming two rewards if two staker respectively stake and withdraw at the same second", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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

        const firstRewardPerSecond = firstRewardsAmount.div(duration);
        const secondRewardPerSecond = secondRewardsAmount.div(duration);
        // both stakers had all of the rewards for 5 seconds
        const expectedFirstReward = firstRewardPerSecond.mul(5);
        const expectedSecondReward = secondRewardPerSecond.mul(5);

        // first staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedFirstReward);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedSecondReward);

        // second staker claim and rewards balance check
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await firstRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(expectedFirstReward);
        expect(
            await secondRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(expectedSecondReward);
    });

    it("should fail when trying to claim passing an excessive-length amounts array", async () => {
        const duration = 10;
        const {
            startingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [parseEther("10"), parseEther("10")],
            duration,
        });
        await fastForwardTo({ timestamp: startingTimestamp });
        try {
            await erc20DistributionInstance.claim(
                [1000, 1000, 1000],
                firstStaker.address
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD14");
        }
    });

    it("should fail when trying to claim passing a defective-length amounts array", async () => {
        const duration = 10;
        const {
            startingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [parseEther("10"), parseEther("10")],
            duration,
        });
        await fastForwardTo({ timestamp: startingTimestamp });
        try {
            await erc20DistributionInstance.claim([1000], firstStaker.address);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD14");
        }
    });

    it("should fail when trying to claim only a part of the reward, if the first passed in amount is bigger than allowed", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
        await fastForwardTo({ timestamp: endingTimestamp });
        try {
            await erc20DistributionInstance.claim(
                [firstRewardsAmount.add(1000), secondRewardsAmount.sub(1000)],
                firstStaker.address
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD15");
        }
    });

    it("should fail when trying to claim only a part of the reward, if the second passed in amount is bigger than allowed", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
        await fastForwardTo({ timestamp: endingTimestamp });
        try {
            await erc20DistributionInstance.claim(
                [firstRewardsAmount, secondRewardsAmount.add(1000)],
                firstStaker.address
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD15");
        }
    });

    it("should fail when trying to claim only a part of the reward, if the second passed in amount is bigger than allowed", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
        await fastForwardTo({ timestamp: endingTimestamp });
        try {
            await erc20DistributionInstance.claim(
                [firstRewardsAmount, secondRewardsAmount.add(1000)],
                firstStaker.address
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD15");
        }
    });

    it("should fail when trying to claim only a part of the reward, if the second passed in amount is bigger than allowed", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
        await fastForwardTo({ timestamp: endingTimestamp });
        try {
            await erc20DistributionInstance.claim(
                [firstRewardsAmount, secondRewardsAmount.add(1000)],
                firstStaker.address
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD15");
        }
    });

    it("should succeed in claiming specific amounts under the right conditions", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
        await fastForwardTo({ timestamp: endingTimestamp });
        await erc20DistributionInstance
            .connect(firstStaker)
            .claim(
                [firstRewardsAmount, secondRewardsAmount],
                firstStaker.address
            );
        expect(
            await firstRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(firstRewardsAmount);
        expect(
            await secondRewardTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(secondRewardsAmount);
    });

    it("should succeed in claiming specific amounts to a foreign address under the right conditions", async () => {
        const stakedAmount = parseEther("10");
        const duration = 10;
        const firstRewardsAmount = parseEther("10");
        const secondRewardsAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
        await fastForwardTo({ timestamp: endingTimestamp });
        await erc20DistributionInstance
            .connect(firstStaker)
            .claim(
                [firstRewardsAmount, secondRewardsAmount],
                secondStaker.address
            );
        expect(
            await firstRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(firstRewardsAmount);
        expect(
            await secondRewardTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(secondRewardsAmount);
    });
});
