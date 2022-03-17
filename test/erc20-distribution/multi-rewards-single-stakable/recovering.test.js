const { expect, use } = require("chai");
const { ZERO } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stakeAtTimestamp,
    withdrawAtTimestamp,
    stake,
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

describe("ERC20StakingRewardsDistribution - Multi rewards, single stakable token - Reward recovery", () => {
    const [owner, firstStaker, secondStaker] = provider.getWallets();

    let erc20DistributionFactoryInstance,
        firstRewardsTokenInstance,
        secondRewardsTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        const ERC20StakingRewardsDistribution = await getContractFactory(
            "ERC20StakingRewardsDistribution",
            owner
        );
        const ERC20StakingRewardsDistributionFactory = await getContractFactory(
            "ERC20StakingRewardsDistributionFactory",
            owner
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
        firstRewardsTokenInstance = await FirstRewardERC20.deploy();
        secondRewardsTokenInstance = await SecondRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should recover all of the rewards when the distribution ended and no staker joined", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [parseEther("100"), parseEther("10")];
        const {
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 10,
        });
        // at the start of the distribution, the owner deposited the rewards
        // into the staking contract, so their balance must be 0
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        const onchainEndingTimestmp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainEndingTimestmp).to.be.equal(endingTimestamp);
        await fastForwardTo({ timestamp: endingTimestamp });
        await erc20DistributionInstance.recoverUnassignedRewards();
        for (let i = 0; i < rewardAmounts.length; i++) {
            const rewardToken = rewardTokens[i];
            const rewardAmount = rewardAmounts[i];
            expect(await rewardToken.balanceOf(owner.address)).to.be.equal(
                rewardAmount
            );
            expect(
                await erc20DistributionInstance.recoverableUnassignedReward(
                    rewardToken.address
                )
            ).to.be.equal(ZERO);
        }
    });

    it("should always send funds to the contract's owner, even when called by another account", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [parseEther("100"), parseEther("10")];
        const {
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 10,
        });
        // at the start of the distribution, the owner deposited the rewards
        // into the staking contract, so their balance must be 0
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestmp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainEndingTimestmp).to.be.equal(endingTimestamp);
        await erc20DistributionInstance
            .connect(firstStaker)
            .recoverUnassignedRewards();
        for (let i = 0; i < rewardAmounts.length; i++) {
            const rewardToken = rewardTokens[i];
            const rewardAmount = rewardAmounts[i];
            expect(await rewardToken.balanceOf(owner.address)).to.be.equal(
                rewardAmount
            );
            expect(
                await rewardToken.balanceOf(firstStaker.address)
            ).to.be.equal(ZERO);
            expect(
                await erc20DistributionInstance.recoverableUnassignedReward(
                    rewardToken.address
                )
            ).to.be.equal(ZERO);
        }
    });

    it("should recover half of the rewards when only one staker joined for half of the duration", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [parseEther("10"), parseEther("100")];
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 10,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        await fastForwardTo({ timestamp: startingTimestamp });
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        // stake after 5 seconds until the end of the distribution
        const stakingStartingTimestamp = startingTimestamp.add(5);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            stakingStartingTimestamp
        );
        expect(await getEvmTimestamp()).to.be.equal(stakingStartingTimestamp);
        await fastForwardTo({ timestamp: endingTimestamp });
        const distributionEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        // staker staked for 5 seconds
        expect(
            distributionEndingTimestamp.sub(stakingStartingTimestamp)
        ).to.be.equal(5);
        // staker claims their reward
        const duration = endingTimestamp.sub(startingTimestamp);
        const firstRewardPerSecond = rewardAmounts[0].div(duration);
        const secondRewardPerSecond = rewardAmounts[1].div(duration);
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(firstRewardPerSecond.mul(5));
        expect(
            await secondRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(secondRewardPerSecond.mul(5));
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(rewardAmounts[0].div(2));
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(rewardAmounts[1].div(2));
    });

    it("should recover half of the rewards when two stakers stake at the same time", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [parseEther("10"), parseEther("100")];
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 20,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: secondStaker,
            stakableAmount: 1,
        });
        await fastForwardTo({ timestamp: startingTimestamp });
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        // stake after 10 seconds until the end of the distribution
        const stakingTimestamp = startingTimestamp.add(10);
        await stopMining();
        await stake(erc20DistributionInstance, firstStaker, [1], false);
        await stake(erc20DistributionInstance, secondStaker, [1], false);
        await mineBlock(stakingTimestamp);
        expect(await getEvmTimestamp()).to.be.equal(stakingTimestamp);
        await startMining();
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        // each staker staked for 10 seconds
        expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equal(10);
        // stakers claim their reward
        const onChainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onChainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        const secondsDuration = onChainEndingTimestamp.sub(
            onChainStartingTimestamp
        );
        const firstRewardPerSecond = rewardAmounts[0].div(secondsDuration);
        const secondRewardPerSecond = rewardAmounts[1].div(secondsDuration);
        const expectedFirstReward = firstRewardPerSecond.div(2).mul(10);
        const expectedSecondReward = secondRewardPerSecond.div(2).mul(10);

        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedFirstReward);
        expect(
            await secondRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedSecondReward);

        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await firstRewardsTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(expectedFirstReward);
        expect(
            await secondRewardsTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(expectedSecondReward);

        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(rewardAmounts[0].div(2));
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(rewardAmounts[1].div(2));
    });

    it("should recover a third of the rewards when a staker stakes for two thirds of the distribution duration", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [parseEther("10"), parseEther("100")];
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 12,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        await fastForwardTo({ timestamp: startingTimestamp });
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        // stake after 4 second until the end of the distribution
        const stakingTimestamp = startingTimestamp.add(4);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            stakingTimestamp
        );
        expect(await getEvmTimestamp()).to.be.equal(stakingTimestamp);
        await fastForwardTo({ timestamp: endingTimestamp });
        const distributionEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(distributionEndingTimestamp.sub(stakingTimestamp)).to.be.equal(
            8
        );
        // staker claims their reward
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        // 6.6 should be claimable
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal("6666666666666666666");
        // 66.6 should be claimable
        expect(
            await secondRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal("66666666666666666666");
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal("3333333333333333333");
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal("33333333333333333333");
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, right in the middle", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [parseEther("10"), parseEther("100")];
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 12,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        await fastForwardTo({ timestamp: startingTimestamp });
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        // stake after 4 seconds until the 8th second of the distribution (one third)
        const stakingTimestamp = startingTimestamp.add(4);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            stakingTimestamp
        );
        expect(await getEvmTimestamp()).to.be.equal(stakingTimestamp);
        const withdrawTimestamp = startingTimestamp.add(8);
        // withdraw after 4 seconds, occupying 4 seconds in total
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            1,
            withdrawTimestamp
        );
        expect(await getEvmTimestamp()).to.be.equal(withdrawTimestamp);
        await fastForwardTo({ timestamp: endingTimestamp });

        expect(withdrawTimestamp.sub(stakingTimestamp)).to.be.equal(4);
        // a third of the original reward
        const expectedFirstReward = rewardAmounts[0].div(3);
        const expectedSecondReward = rewardAmounts[1].div(3);
        // staker claims their reward
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedFirstReward);
        expect(
            await secondRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedSecondReward);
        await erc20DistributionInstance.recoverUnassignedRewards();
        // expect two third of the reward to be recovered
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal("6666666666666666666");
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal("66666666666666666666");
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, in the end period", async () => {
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const rewardAmounts = [parseEther("10"), parseEther("100")];
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 12,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        await fastForwardTo({ timestamp: startingTimestamp });
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal(ZERO);
        // stake after 8 second until the end of the distribution
        const stakingTimestamp = startingTimestamp.add(8);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            stakingTimestamp
        );
        expect(await getEvmTimestamp()).to.be.equal(stakingTimestamp);
        await fastForwardTo({ timestamp: endingTimestamp });
        const distributionEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(distributionEndingTimestamp.sub(stakingTimestamp)).to.be.equal(
            4
        );
        // staker claims their reward
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        // should have claimed 3.3
        expect(
            await firstRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal("3333333333333333333");
        // should have claimed 33.3
        expect(
            await secondRewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal("33333333333333333333");
        await erc20DistributionInstance.recoverUnassignedRewards();
        // should have recovered 6.6
        expect(
            await firstRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal("6666666666666666666");
        // should have recovered 66.6
        expect(
            await secondRewardsTokenInstance.balanceOf(owner.address)
        ).to.be.equal("66666666666666666666");
    });
});
