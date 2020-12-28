const BN = require("bn.js");
const { expect } = require("chai");
const { MAXIMUM_VARIANCE, ZERO_BN } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stake,
    stakeAtTimestamp,
    withdrawAtTimestamp,
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
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract(
    "ERC20Distribution - Multi rewards, single stakable token - Reward recovery",
    () => {
        let erc20DistributionInstance,
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
            stakableTokenInstance,
            ownerAddress,
            firstStakerAddress,
            secondStakerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20Distribution.new({
                from: ownerAddress,
            });
            firstRewardsTokenInstance = await FirstRewardERC20.new();
            secondRewardsTokenInstance = await SecondRewardERC20.new();
            stakableTokenInstance = await FirstStakableERC20.new();
            firstStakerAddress = accounts[1];
            secondStakerAddress = accounts[2];
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
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
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
            const onchainEndingTimestmp = await erc20DistributionInstance.endingTimestamp();
            expect(onchainEndingTimestmp).to.be.equalBn(endingTimestamp);
            await fastForwardTo({ timestamp: endingTimestamp });
            await erc20DistributionInstance.recoverUnassignedRewards();
            for (let i = 0; i < rewardAmounts.length; i++) {
                const rewardToken = rewardTokens[i];
                const rewardAmount = rewardAmounts[i];
                expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                    rewardAmount
                );
                expect(
                    await erc20DistributionInstance.recoverableUnassignedReward(
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
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
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
            await fastForwardTo({ timestamp: endingTimestamp });
            const onchainEndingTimestmp = await erc20DistributionInstance.endingTimestamp();
            expect(onchainEndingTimestmp).to.be.equalBn(endingTimestamp);
            await erc20DistributionInstance.recoverUnassignedRewards({
                from: firstStakerAddress,
            });
            for (let i = 0; i < rewardAmounts.length; i++) {
                const rewardToken = rewardTokens[i];
                const rewardAmount = rewardAmounts[i];
                expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                    rewardAmount
                );
                expect(
                    await rewardToken.balanceOf(firstStakerAddress)
                ).to.be.equalBn(ZERO_BN);
                expect(
                    await erc20DistributionInstance.recoverableUnassignedReward(
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
            // stake after 5 seconds until the end of the distribution
            const stakingStartingTimestamp = startingTimestamp.add(new BN(5));
            await fastForwardTo({ timestamp: stakingStartingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [1],
                stakingStartingTimestamp
            );
            expect(await getEvmTimestamp()).to.be.equalBn(
                stakingStartingTimestamp
            );
            await fastForwardTo({ timestamp: endingTimestamp });
            const distributionEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
            // staker staked for 5 seconds
            expect(
                distributionEndingTimestamp.sub(stakingStartingTimestamp)
            ).to.be.equalBn(new BN(5));
            // staker claims their reward
            const firstRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                firstRewardsTokenInstance.address
            );
            const secondRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                secondRewardsTokenInstance.address
            );
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(firstRewardPerSecond.mul(new BN(5)));
            expect(
                await secondRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(secondRewardPerSecond.mul(new BN(5)));
            await erc20DistributionInstance.recoverUnassignedRewards();
            expect(
                await firstRewardsTokenInstance.balanceOf(ownerAddress)
            ).to.be.equalBn(rewardAmounts[0].div(new BN(2)));
            expect(
                await secondRewardsTokenInstance.balanceOf(ownerAddress)
            ).to.be.equalBn(rewardAmounts[1].div(new BN(2)));
        });

        it("should recover half of the rewards when two stakers stake at the same time", async () => {
            const rewardTokens = [
                firstRewardsTokenInstance,
                secondRewardsTokenInstance,
            ];
            const rewardAmounts = [
                await toWei(10, firstRewardsTokenInstance),
                await toWei(100, secondRewardsTokenInstance),
            ];
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
                rewardTokens,
                rewardAmounts,
                duration: 20,
            });
            expect(
                await firstRewardsTokenInstance.balanceOf(ownerAddress)
            ).to.be.equalBn(ZERO_BN);
            expect(
                await secondRewardsTokenInstance.balanceOf(ownerAddress)
            ).to.be.equalBn(ZERO_BN);
            // stake after 10 seconds until the end of the distribution
            const stakingTimestamp = startingTimestamp.add(new BN(10));
            await fastForwardTo({ timestamp: stakingTimestamp });
            await stopMining();
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [1],
                stakingTimestamp
            );
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [1],
                stakingTimestamp
            );
            expect(await getEvmTimestamp()).to.be.equalBn(stakingTimestamp);
            await startMining();
            await fastForwardTo({ timestamp: endingTimestamp });
            const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
            // each staker staked for 10 seconds
            expect(onchainEndingTimestamp.sub(stakingTimestamp)).to.be.equalBn(
                new BN(10)
            );
            // stakers claim their reward
            const firstRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                firstRewardsTokenInstance.address
            );
            const secondRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                secondRewardsTokenInstance.address
            );
            const expectedFirstReward = firstRewardPerSecond
                .div(new BN(2))
                .mul(new BN(10));
            const expectedSecondReward = secondRewardPerSecond
                .div(new BN(2))
                .mul(new BN(10));

            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedFirstReward);
            expect(
                await secondRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedSecondReward);

            await erc20DistributionInstance.claim({
                from: secondStakerAddress,
            });
            expect(
                await firstRewardsTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.equalBn(expectedFirstReward);
            expect(
                await secondRewardsTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.equalBn(expectedSecondReward);

            await erc20DistributionInstance.recoverUnassignedRewards();
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
            // stake after 4 second until the end of the distribution
            const stakingTimestamp = startingTimestamp.add(new BN(4));
            await fastForwardTo({ timestamp: stakingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [1],
                stakingTimestamp
            );
            expect(await getEvmTimestamp()).to.be.equalBn(stakingTimestamp);
            await fastForwardTo({ timestamp: endingTimestamp });
            const distributionEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
            expect(
                distributionEndingTimestamp.sub(stakingTimestamp)
            ).to.be.equalBn(new BN(8));
            // staker claims their reward
            const firstRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                firstRewardsTokenInstance.address
            );
            const secondRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                secondRewardsTokenInstance.address
            );
            const expectedFirstReward = firstRewardPerSecond.mul(new BN(8));
            const expectedSecondReward = secondRewardPerSecond.mul(new BN(8));
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedFirstReward);
            expect(
                await secondRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedSecondReward);
            await erc20DistributionInstance.recoverUnassignedRewards();
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
            // stake after 4 seconds until the 8th second of the distribution (one third)
            const stakingTimestamp = startingTimestamp.add(new BN(4));
            await fastForwardTo({ timestamp: stakingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [1],
                stakingTimestamp
            );
            expect(await getEvmTimestamp()).to.be.equalBn(stakingTimestamp);
            const withdrawTimestamp = startingTimestamp.add(new BN(8));
            await fastForwardTo({ timestamp: withdrawTimestamp });
            // withdraw after 4 seconds, occupying 4 seconds in total
            await withdrawAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [1],
                withdrawTimestamp
            );
            expect(await getEvmTimestamp()).to.be.equalBn(withdrawTimestamp);
            await fastForwardTo({ timestamp: endingTimestamp });

            expect(withdrawTimestamp.sub(stakingTimestamp)).to.be.equalBn(
                new BN(4)
            );
            // staker claims their reward
            const firstRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                firstRewardsTokenInstance.address
            );
            const secondRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                secondRewardsTokenInstance.address
            );
            const expectedFirstReward = firstRewardPerSecond.mul(new BN(4));
            const expectedSecondReward = secondRewardPerSecond.mul(new BN(4));
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedFirstReward);
            expect(
                await secondRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedSecondReward);
            await erc20DistributionInstance.recoverUnassignedRewards();
            expect(
                await firstRewardsTokenInstance.balanceOf(ownerAddress)
            ).to.be.equalBn(firstRewardPerSecond.mul(new BN(8)));
            expect(
                await secondRewardsTokenInstance.balanceOf(ownerAddress)
            ).to.be.equalBn(secondRewardPerSecond.mul(new BN(8)));
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
            // stake after 8 second until the end of the distribution
            const stakingTimestamp = startingTimestamp.add(new BN(8));
            await fastForwardTo({ timestamp: stakingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [1],
                stakingTimestamp
            );
            expect(await getEvmTimestamp()).to.be.equalBn(stakingTimestamp);
            await fastForwardTo({ timestamp: endingTimestamp });
            const distributionEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
            expect(
                distributionEndingTimestamp.sub(stakingTimestamp)
            ).to.be.equalBn(new BN(4));
            // staker claims their reward
            const firstRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                firstRewardsTokenInstance.address
            );
            const secondRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                secondRewardsTokenInstance.address
            );
            const expectedFirstReward = firstRewardPerSecond.mul(new BN(4));
            const expectedSecondReward = secondRewardPerSecond.mul(new BN(4));
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedFirstReward);
            expect(
                await secondRewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedSecondReward);
            await erc20DistributionInstance.recoverUnassignedRewards();
            expect(
                await firstRewardsTokenInstance.balanceOf(ownerAddress)
            ).to.be.closeBn(
                firstRewardPerSecond.mul(new BN(8)),
                MAXIMUM_VARIANCE
            );
            expect(
                await secondRewardsTokenInstance.balanceOf(ownerAddress)
            ).to.be.closeBn(
                secondRewardPerSecond.mul(new BN(8)),
                MAXIMUM_VARIANCE
            );
        });
    }
);
