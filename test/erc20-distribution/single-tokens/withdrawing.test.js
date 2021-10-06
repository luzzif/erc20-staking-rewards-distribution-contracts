const { expect, use } = require("chai");
const {
    initializeDistribution,
    initializeStaker,
    withdraw,
    stakeAtTimestamp,
    withdrawAtTimestamp,
} = require("../../utils");
const { fastForwardTo, getEvmTimestamp } = require("../../utils/network");
const { provider, solidity } = require("hardhat").waffle;
const {
    getContractFactory,
    utils: { parseEther },
} = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistribution - Single reward/stakable token - Withdrawing", () => {
    const [owner, staker] = provider.getWallets();

    let ERC20StakingRewardsDistribution,
        erc20DistributionFactoryInstance,
        rewardsTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        ERC20StakingRewardsDistribution = await getContractFactory(
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

    it("should fail when initialization has not been done", async () => {
        try {
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.connect(
                owner
            ).deploy();
            await erc20DistributionInstance.withdraw(0);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD20");
        }
    });

    it("should fail when the distribution has not yet started", async () => {
        try {
            const { erc20DistributionInstance } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [2],
                duration: 2,
            });
            await erc20DistributionInstance.withdraw(0);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD20");
        }
    });

    it("should fail when the staker tries to withdraw more than what they staked", async () => {
        try {
            const {
                startingTimestamp,
                erc20DistributionInstance,
            } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [20],
                duration: 10,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance,
                staker: staker,
                stakableAmount: 1,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                staker,
                1,
                startingTimestamp
            );
            await erc20DistributionInstance.connect(staker).withdraw(2);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD13");
        }
    });

    it("should succeed in the right conditions, when the distribution has not yet ended", async () => {
        const stakedAmount = parseEther("10");
        const {
            startingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [parseEther("1")],
            duration: 10,
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
        expect(
            await erc20DistributionInstance.stakedTokensOf(staker.address)
        ).to.be.equal(stakedAmount);
        await withdraw(erc20DistributionInstance, staker, stakedAmount.div(2));
        expect(
            await erc20DistributionInstance.stakedTokensOf(staker.address)
        ).to.be.equal(stakedAmount.div(2));
        expect(
            await stakableTokenInstance.balanceOf(staker.address)
        ).to.be.equal(stakedAmount.div(2));
    });

    it("should succeed in the right conditions, when the distribution has already ended", async () => {
        const stakedAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [parseEther("1")],
            duration: 10,
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
        expect(
            await erc20DistributionInstance.stakedTokensOf(staker.address)
        ).to.be.equal(stakedAmount);
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            staker,
            stakedAmount.div(2),
            endingTimestamp
        );
        expect(
            await erc20DistributionInstance.stakedTokensOf(staker.address)
        ).to.be.equal(stakedAmount.div(2));
        expect(
            await stakableTokenInstance.balanceOf(staker.address)
        ).to.be.equal(stakedAmount.div(2));
    });

    it("should fail when trying to withdraw from a non-ended locked distribution, right in the middle of it", async () => {
        try {
            const stakedAmount = parseEther("10");
            const {
                startingTimestamp,
                erc20DistributionInstance,
            } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [parseEther("1")],
                duration: 10,
                locked: true,
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
            expect(
                await erc20DistributionInstance.stakedTokensOf(staker.address)
            ).to.be.equal(stakedAmount);
            // fast-forward to the middle of the distribution
            const withdrawingTimestamp = startingTimestamp.add(5);
            await fastForwardTo({ timestamp: withdrawingTimestamp });
            await withdraw(
                erc20DistributionInstance,
                staker,
                stakedAmount.div(2)
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD12");
        }
    });

    it("should fail when trying to withdraw from a non-ended locked distribution, right at the last second of it", async () => {
        try {
            const stakedAmount = parseEther("10");
            const {
                startingTimestamp,
                endingTimestamp,
                erc20DistributionInstance,
            } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [parseEther("1")],
                duration: 10,
                locked: true,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance,
                staker: staker,
                stakableAmount: stakedAmount,
            });
            expect(
                await stakableTokenInstance.balanceOf(staker.address)
            ).to.be.equal(stakedAmount);
            expect(await erc20DistributionInstance.locked()).to.be.true;
            await stakeAtTimestamp(
                erc20DistributionInstance,
                staker,
                stakedAmount,
                startingTimestamp
            );
            expect(
                await erc20DistributionInstance.stakedTokensOf(staker.address)
            ).to.be.equal(stakedAmount);
            // fast-forward to the middle of the distribution
            const withdrawingTimestamp = endingTimestamp;
            await fastForwardTo({ timestamp: withdrawingTimestamp.sub(1) });
            await withdraw(
                erc20DistributionInstance,
                staker,
                stakedAmount.div(2)
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD12");
        }
    });

    it("should succeed when withdrawing from an ended locked distribution", async () => {
        const stakedAmount = parseEther("10");
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [parseEther("1")],
            duration: 10,
            locked: true,
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
        expect(
            await erc20DistributionInstance.stakedTokensOf(staker.address)
        ).to.be.equal(stakedAmount);
        // fast-forward to the middle of the distribution
        const withdrawingTimestamp = endingTimestamp.add(2);
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            staker,
            stakedAmount,
            withdrawingTimestamp
        );
        expect(await getEvmTimestamp()).to.be.equal(withdrawingTimestamp);
        expect(
            await stakableTokenInstance.balanceOf(staker.address)
        ).to.be.equal(stakedAmount);
    });
});
