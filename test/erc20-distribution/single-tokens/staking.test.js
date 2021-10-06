const { expect, use } = require("chai");
const {
    initializeDistribution,
    initializeStaker,
    stakeAtTimestamp,
    stake,
} = require("../../utils");
const { mineBlock, fastForwardTo } = require("../../utils/network");
const { Duration } = require("luxon");
const { ZERO, MAXIMUM_VARIANCE } = require("../../constants");
const { provider, solidity } = require("hardhat").waffle;
const {
    getContractFactory,
    utils: { parseEther },
    BigNumber,
} = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistribution - Single reward/stakable token - Staking", () => {
    const [owner, staker] = provider.getWallets();

    let ERC20StakingRewardsDistribution,
        erc20DistributionFactoryInstance,
        rewardsTokenInstance,
        zeroDecimalsRewardTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        ERC20StakingRewardsDistribution = await getContractFactory(
            "ERC20StakingRewardsDistribution"
        );
        const ERC20StakingRewardsDistributionFactory = await getContractFactory(
            "ERC20StakingRewardsDistributionFactory"
        );
        const FirstRewardERC20 = await getContractFactory("FirstRewardERC20");
        const ZeroDecimalsRewardERC20 = await getContractFactory(
            "ZeroDecimalsRewardERC20"
        );
        const FirstStakableERC20 = await getContractFactory(
            "FirstStakableERC20"
        );

        const erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
        erc20DistributionFactoryInstance = await ERC20StakingRewardsDistributionFactory.deploy(
            erc20DistributionInstance.address
        );
        rewardsTokenInstance = await FirstRewardERC20.deploy();
        zeroDecimalsRewardTokenInstance = await ZeroDecimalsRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should fail when initialization has not been done", async () => {
        try {
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.connect(
                owner
            ).deploy();
            await erc20DistributionInstance.stake([0]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD21");
        }
    });

    it("should fail when program has not yet started", async () => {
        try {
            const { erc20DistributionInstance } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [3],
                duration: 2,
            });
            await erc20DistributionInstance.connect(staker).stake([2]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD21");
        }
    });

    it("should fail when the staker has not enough balance", async () => {
        try {
            const {
                startingTimestamp,
                erc20DistributionInstance,
            } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [2],
                duration: 2,
            });
            await mineBlock(startingTimestamp);
            await erc20DistributionInstance.connect(staker).stake([100]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds balance"
            );
        }
    });

    it("should fail when no allowance was set by the staker", async () => {
        try {
            await stakableTokenInstance.mint(staker.address, 1);
            const {
                startingTimestamp,
                erc20DistributionInstance,
            } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [2],
                duration: 2,
            });
            await mineBlock(startingTimestamp);
            await erc20DistributionInstance.connect(staker).stake([1]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds allowance"
            );
        }
    });

    it("should fail when not enough allowance was set by the staker", async () => {
        try {
            const {
                startingTimestamp,
                erc20DistributionInstance,
            } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [3],
                duration: 2,
            });
            await stakableTokenInstance.mint(staker.address, 1);
            await stakableTokenInstance
                .connect(staker)
                .approve(erc20DistributionInstance.address, 1);
            // mint additional tokens to the staker for which we
            // don't set the correct allowance
            await stakableTokenInstance.mint(staker.address, 1);
            await mineBlock(startingTimestamp);
            await erc20DistributionInstance.connect(staker).stake([2]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds allowance"
            );
        }
    });

    it("should succeed in the right conditions", async () => {
        const stakedAmount = parseEther("10");
        const rewardTokens = [rewardsTokenInstance];
        const {
            startingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts: [parseEther("1")],
            duration: 2,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: staker,
            stakableAmount: stakedAmount,
        });
        await stakeAtTimestamp(
            erc20DistributionInstance,
            staker,
            stakedAmount,
            startingTimestamp
        );
        for (let i = 0; i < rewardTokens.length; i++) {
            expect(
                await erc20DistributionInstance.stakedTokensOf(staker.address)
            ).to.be.equal(stakedAmount);
        }
        expect(
            await erc20DistributionInstance.totalStakedTokensAmount()
        ).to.be.equal(stakedAmount);
    });

    it("should fail when the staking cap is surpassed", async () => {
        try {
            const stakedAmount = parseEther("11");
            const stakingCap = parseEther("10");
            const {
                startingTimestamp,
                erc20DistributionInstance,
            } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [2],
                duration: 2,
                stakingCap,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance,
                staker: staker,
                stakableAmount: stakedAmount,
            });
            await mineBlock(startingTimestamp);
            await erc20DistributionInstance.connect(staker).stake(stakedAmount);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD10");
        }
    });

    it("should succeed when the staking cap is just hit", async () => {
        const stakedAmount = parseEther("10");
        const stakingCap = parseEther("10");
        const {
            startingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [2],
            duration: 2,
            stakingCap,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: staker,
            stakableAmount: stakedAmount,
        });
        await mineBlock(startingTimestamp);
        await erc20DistributionInstance.connect(staker).stake(stakedAmount);
    });

    it("should correctly consolidate rewards when the user stakes 2 times with a low decimals token, in a lengthy campaign", async () => {
        const stakedAmount = parseEther("10");
        const rewardAmount = 10000;
        const duration = BigNumber.from(
            Math.floor(Duration.fromObject({ months: 1 }).toMillis() / 1000)
        );
        const {
            startingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [zeroDecimalsRewardTokenInstance],
            rewardAmounts: [rewardAmount],
            duration,
            stakingCap: 0,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: staker,
            stakableAmount: stakedAmount,
        });
        const halfStakableAmount = stakedAmount.div(2);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            staker,
            halfStakableAmount,
            startingTimestamp
        );
        const preSecondStakeReward = await erc20DistributionInstance.rewards(0);
        expect(preSecondStakeReward.perStakedToken).to.be.equal(ZERO);
        // fast forwarding to 1/20th of the campaign
        const secondStakingTimestamp = startingTimestamp.add(duration.div(20));
        await stakeAtTimestamp(
            erc20DistributionInstance,
            staker,
            halfStakableAmount,
            secondStakingTimestamp
        );
        const postSecondStakeRewards = await erc20DistributionInstance.rewards(
            0
        );
        // in the first stint, the staker staked alone for 1/10th of the distribution
        // calculate expected reward per staked token as if it were done onchain
        const firstStintDuration = secondStakingTimestamp.sub(
            startingTimestamp
        );
        const expectedRewardPerStakedToken = firstStintDuration
            .mul(rewardAmount)
            .mul(BigNumber.from(2).pow(112))
            .div(halfStakableAmount.mul(duration));
        expect(postSecondStakeRewards.perStakedToken).to.be.equal(
            expectedRewardPerStakedToken
        );
        const onChainEarnedAmount = await erc20DistributionInstance.earnedRewardsOf(
            staker.address
        );
        expect(onChainEarnedAmount).to.have.length(1);
        expect(onChainEarnedAmount[0]).to.be.closeTo(
            halfStakableAmount // in order to check the consolidation of the first stint we need to use the staked amount in the first stint here, not the current onchain value, which is doubled
                .mul(expectedRewardPerStakedToken)
                .div(BigNumber.from(2).pow(112)),
            MAXIMUM_VARIANCE
        );
    });

    it("should fail when the user stakes but staking is disabled", async () => {
        const stakedAmount = parseEther("10");
        const rewardAmount = 10000;
        const duration = Math.floor(
            Duration.fromObject({ months: 1 }).toMillis() / 1000
        );
        const {
            startingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [zeroDecimalsRewardTokenInstance],
            rewardAmounts: [rewardAmount],
            duration,
            stakingCap: 0,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker,
            stakableAmount: stakedAmount,
        });
        await erc20DistributionFactoryInstance.connect(owner).pauseStaking();
        const halfStakableAmount = stakedAmount.div(2);
        try {
            await fastForwardTo({ timestamp: startingTimestamp });
            await stake(erc20DistributionInstance, staker, halfStakableAmount);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD25");
        }
    });
});
