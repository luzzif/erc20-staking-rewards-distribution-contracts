const { expect, use } = require("chai");
const { ZERO } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    withdrawAtTimestamp,
    stakeAtTimestamp,
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

describe("ERC20StakingRewardsDistribution - Single reward/stakable token - Reward recovery", () => {
    const [owner, firstStaker, secondStaker] = provider.getWallets();

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

    it("should fail when the distribution is not initialized", async () => {
        try {
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.connect(
                owner
            ).deploy();
            const startingTimestamp = (await getEvmTimestamp()) + 10;
            await rewardsTokenInstance.mint(
                erc20DistributionInstance.address,
                1
            );
            await erc20DistributionInstance
                .connect(owner)
                .initialize(
                    [rewardsTokenInstance.address],
                    stakableTokenInstance.address,
                    [1],
                    startingTimestamp,
                    startingTimestamp + 10,
                    false,
                    0
                );
            await erc20DistributionInstance.recoverUnassignedRewards();
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
                rewardAmounts: [11],
                duration: 10,
            });
            await erc20DistributionInstance.recoverUnassignedRewards();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD20");
        }
    });

    it("should recover all of the rewards when the distribution ended and no staker joined", async () => {
        const rewardsAmount = parseEther("100");
        const {
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
        // at the start of the distribution, the owner deposited the reward
        // into the staking contract, so theur balance is 0
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            ZERO
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            rewardsAmount
        );
    });

    it("should put the recoverable rewards variable to 0 when recovered", async () => {
        const rewardsAmount = parseEther("100");
        const {
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
        await fastForwardTo({ timestamp: endingTimestamp });
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            rewardsAmount
        );
        expect(
            await erc20DistributionInstance.recoverableUnassignedReward(
                rewardsTokenInstance.address
            )
        ).to.be.equal(ZERO);
    });

    it("should recover half of the rewards when only one staker joined for half of the duration", async () => {
        const rewardsAmount = parseEther("100");
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
            stakableAmount: 1,
        });
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            ZERO
        );
        // stake after 5 seconds until the end of the distribution
        const stakingTimestamp = startingTimestamp.add(5);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            stakingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        // staker staked for 5 seconds
        expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equal(5);
        // staker claims their reward
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(parseEther("50"));
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            parseEther("50")
        );
    });

    it("should recover half of the rewards when two stakers stake the same time", async () => {
        const rewardsAmount = parseEther("100");
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
            stakableAmount: 1,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: secondStaker,
            stakableAmount: 1,
        });
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            ZERO
        );
        // stake after 5 seconds until the end of the distribution
        await stopMining();
        const stakingTimestamp = startingTimestamp.add(5);
        await stake(erc20DistributionInstance, firstStaker, [1], false);
        await stake(erc20DistributionInstance, secondStaker, [1], false);
        await mineBlock(stakingTimestamp);
        expect(await getEvmTimestamp()).to.be.equal(stakingTimestamp);
        await startMining();
        await fastForwardTo({ timestamp: endingTimestamp });
        const distributionEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        // each staker staked for 5 seconds
        expect(distributionEndingTimestamp.sub(stakingTimestamp)).to.be.equal(
            5
        );
        // stakers claim their reward
        const expectedReward = parseEther("25");
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedReward);
        await erc20DistributionInstance
            .connect(secondStaker)
            .claimAll(secondStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(secondStaker.address)
        ).to.be.equal(expectedReward);
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            rewardsAmount.div(2)
        );
    });

    it("should recover a third of the rewards when a staker stakes for two thirds of the distribution duration", async () => {
        const rewardsAmount = parseEther("100");
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
            duration: 12,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            ZERO
        );
        // stake after 4 seconds until the end of the distribution
        const stakingTimestamp = startingTimestamp.add(4);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            stakingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equal(8);
        // staker claims their reward
        const expectedReward = "66666666666666666666";
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedReward);
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            "33333333333333333333"
        );
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, right in the middle", async () => {
        const rewardsAmount = parseEther("100");
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
            duration: 12,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            ZERO
        );
        // stake after 4 second until the 8th second
        const stakingTimestamp = startingTimestamp.add(4);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            stakingTimestamp
        );
        const withdrawTimestamp = stakingTimestamp.add(4);
        // withdraw after 4 seconds, occupying 4 seconds in total
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            1,
            withdrawTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });

        expect(withdrawTimestamp.sub(stakingTimestamp)).to.be.equal(4);
        // staker claims their reward
        const expectedReward = "33333333333333333333";
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedReward);
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            "66666666666666666666"
        );
    });

    it("should recover two thirds of the rewards when a staker stakes for a third of the distribution duration, in the end period", async () => {
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
            duration: 12,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            ZERO
        );
        const stakingTimestamp = startingTimestamp.add(8);
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            stakingTimestamp
        );
        await fastForwardTo({ timestamp: endingTimestamp });

        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equal(4);
        // staker claims their reward
        const expectedReward = "3333333333333333333";
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedReward);
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            "6666666666666666666"
        );
    });

    it("should recover the unassigned rewards when a staker stakes for a certain period, withdraws, stakes again, and withdraws again", async () => {
        const rewardsAmount = parseEther("100");
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
            duration: 12,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            ZERO
        );
        const firstStakingTimestamp = startingTimestamp;
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            firstStakingTimestamp
        );

        const firstWithdrawTimestamp = firstStakingTimestamp.add(3);
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            1,
            firstWithdrawTimestamp
        );

        const secondStakingTimestamp = firstWithdrawTimestamp.add(3);
        // reapproving the stakable token before staking for a second time
        await stakableTokenInstance
            .connect(firstStaker)
            .approve(erc20DistributionInstance.address, 1);
        await stopMining();
        // should be able to immediately claim the first unassigned rewards from the first 3 empty seconds
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        await erc20DistributionInstance
            .connect(owner)
            .recoverUnassignedRewards();
        await stake(erc20DistributionInstance, firstStaker, [1], false);
        await mineBlock(secondStakingTimestamp);
        expect(await getEvmTimestamp()).to.be.equal(secondStakingTimestamp);
        await startMining();
        // recoverable unassigned rewards should have been put to 0
        expect(
            await erc20DistributionInstance.recoverableUnassignedReward(
                rewardsTokenInstance.address
            )
        ).to.be.equal(ZERO);

        const secondWithdrawTimestamp = secondStakingTimestamp.add(3);
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            1,
            secondWithdrawTimestamp
        );

        await fastForwardTo({ timestamp: endingTimestamp });

        // the staker staked for 6 seconds total
        const expectedReward = parseEther("50");
        // claiming for the second time
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedReward);

        // the owner should already have some recovered reward tokens from above
        const expectedRemainingReward = parseEther("25");
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            expectedRemainingReward
        );
        expect(
            await erc20DistributionInstance.recoverableUnassignedReward(
                rewardsTokenInstance.address
            )
        ).to.be.equal(expectedRemainingReward);
        // claiming the unassigned rewards that accrued starting from the second withdraw
        await erc20DistributionInstance.recoverUnassignedRewards();
        expect(
            await erc20DistributionInstance.recoverableUnassignedReward(
                rewardsTokenInstance.address
            )
        ).to.be.equal(ZERO);
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            expectedRemainingReward.mul(2)
        );
    });

    it("should recover the unassigned rewards when a staker stakes for a certain period, withdraws, stakes again, withdraws again, and there's a direct transfer of rewards in the contract", async () => {
        const rewardsAmount = parseEther("100");
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
            duration: 12,
        });
        await initializeStaker({
            erc20DistributionInstance,
            stakableTokenInstance,
            staker: firstStaker,
            stakableAmount: 1,
        });
        // directly mint rewards to the contract (should be recovered at the first recover call)
        const firstMintedAmount = parseEther("10");
        await rewardsTokenInstance.mint(
            erc20DistributionInstance.address,
            firstMintedAmount
        );
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            ZERO
        );
        const firstStakingTimestamp = startingTimestamp;
        await stakeAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            [1],
            firstStakingTimestamp
        );

        const firstWithdrawTimestamp = firstStakingTimestamp.add(3);
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            1,
            firstWithdrawTimestamp
        );

        const secondStakingTimestamp = firstWithdrawTimestamp.add(3);
        // reapproving the stakable token before staking for a second time
        await stakableTokenInstance
            .connect(firstStaker)
            .approve(erc20DistributionInstance.address, 1);
        await stopMining();
        // should be able to immediately claim the first unassigned rewards from the first 3 empty seconds
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        // should recover the first direct reward token transfer
        await erc20DistributionInstance
            .connect(owner)
            .recoverUnassignedRewards();
        await stake(erc20DistributionInstance, firstStaker, [1], false);
        await mineBlock(secondStakingTimestamp);
        expect(await getEvmTimestamp()).to.be.equal(secondStakingTimestamp);
        await startMining();
        // recoverable unassigned rewards should have been put to 0
        expect(
            await erc20DistributionInstance.recoverableUnassignedReward(
                rewardsTokenInstance.address
            )
        ).to.be.equal(ZERO);

        // directly mint rewards to the contract for the second time
        // (should be recovered at the first recover call)
        const secondMintedAmount = parseEther("20");
        await rewardsTokenInstance.mint(
            erc20DistributionInstance.address,
            secondMintedAmount
        );
        const secondWithdrawTimestamp = secondStakingTimestamp.add(3);
        await withdrawAtTimestamp(
            erc20DistributionInstance,
            firstStaker,
            1,
            secondWithdrawTimestamp
        );

        await fastForwardTo({ timestamp: endingTimestamp });

        // the staker staked for 6 seconds total
        const expectedReward = parseEther("50");
        // claiming for the second time
        await erc20DistributionInstance
            .connect(firstStaker)
            .claimAll(firstStaker.address);
        expect(
            await rewardsTokenInstance.balanceOf(firstStaker.address)
        ).to.be.equal(expectedReward);

        // the owner should already have some recovered reward tokens from above
        // (also the first minted tokens)
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            firstMintedAmount.add(parseEther("25"))
        );
        // at this point recoverable rewards should be the minted amount sent to the contract
        // (20) plus 3 seconds when the contract did not have any staked amount  (at 100 total
        // reward tokens for a 12 seconds duration, this would be 100/12*3 = 25).
        // The total amount recoverable should be 45
        expect(
            await erc20DistributionInstance.recoverableUnassignedReward(
                rewardsTokenInstance.address
            )
        ).to.be.equal(parseEther("45"));
        await erc20DistributionInstance.recoverUnassignedRewards();
        // claiming the unassigned rewards that accrued starting from the second withdraw
        expect(
            await erc20DistributionInstance.recoverableUnassignedReward(
                rewardsTokenInstance.address
            )
        ).to.be.equal(ZERO);
        expect(await rewardsTokenInstance.balanceOf(owner.address)).to.be.equal(
            firstMintedAmount.add(secondMintedAmount).add(parseEther("50"))
        );
    });
});
