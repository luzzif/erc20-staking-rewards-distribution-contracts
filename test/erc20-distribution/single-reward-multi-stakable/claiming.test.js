const BN = require("bn.js");
const { expect } = require("chai");
const { MAXIMUM_VARIANCE, ZERO_BN } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stake,
    withdraw,
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
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");
const SecondStakableERC20 = artifacts.require("SecondStakableERC20");

contract(
    "ERC20Distribution - Single reward, multi stakable tokens - Claiming",
    () => {
        let erc20DistributionInstance,
            rewardsTokenInstance,
            firstStakableTokenInstance,
            secondStakableTokenInstance,
            ownerAddress,
            firstStakerAddress,
            secondStakerAddress,
            thirdStakerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20Distribution.new({
                from: ownerAddress,
            });
            rewardsTokenInstance = await FirstRewardERC20.new();
            firstStakableTokenInstance = await FirstStakableERC20.new();
            secondStakableTokenInstance = await SecondStakableERC20.new();
            firstStakerAddress = accounts[1];
            secondStakerAddress = accounts[2];
            thirdStakerAddress = accounts[3];
        });

        it("should succeed in claiming the full reward if only one staker stakes only the first token right from the first second", async () => {
            const stakedAmount = await toWei(20, firstStakableTokenInstance);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, 0],
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
            // additional check to be extra safe
            expect(firstStakerRewardsTokenBalance).to.equalBn(rewardsAmount);
        });

        it("should succeed in claiming the full reward if only one staker stakes only the second token right from the first second", async () => {
            const stakedAmount = await toWei(20, firstStakableTokenInstance);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [0, stakedAmount],
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
            // additional check to be extra safe
            expect(firstStakerRewardsTokenBalance).to.equalBn(rewardsAmount);
        });

        it("should succeed in claiming the full reward if only one staker stakes both tokens in the same quantities right from the first second", async () => {
            const stakedAmount = await toWei(20, firstStakableTokenInstance);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, stakedAmount],
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
            // additional check to be extra safe
            expect(firstStakerRewardsTokenBalance).to.equalBn(rewardsAmount);
        });

        it("should succeed in claiming the full reward if only one staker stakes both tokens in different amounts right from the first second", async () => {
            const firstStakedAmount = await toWei(
                20,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                13,
                secondStakableTokenInstance
            );
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [firstStakedAmount, secondStakedAmount],
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
            expect(firstStakerRewardsTokenBalance).to.closeBn(
                rewardPerSecond.mul(stakingDuration),
                MAXIMUM_VARIANCE
            );
            // additional check to be extra safe
            expect(firstStakerRewardsTokenBalance).to.closeBn(
                rewardsAmount,
                MAXIMUM_VARIANCE
            );
        });

        it("should succeed in claiming two rewards if two stakers stake exactly the same first token amount at different times", async () => {
            const stakedAmount = await toWei(10, firstStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, 0],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            // make half of the distribution time pass
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(5)),
                mineBlockAfter: false,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [stakedAmount, 0],
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

        it("should succeed in claiming two rewards if two stakers stake exactly the same second token amount at different times", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [0, stakedAmount],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            // make half of the distribution time pass
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(5)),
                mineBlockAfter: false,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [0, stakedAmount],
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

        it("should succeed in claiming two rewards if a staker stakes the first token and then another one stakes the second token, in the same amount but at different times", async () => {
            const firstStakedAmount = await toWei(
                10,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                10,
                secondStakableTokenInstance
            );
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [firstStakedAmount, 0],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            // make half of the distribution time pass
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(5)),
                mineBlockAfter: false,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [0, secondStakedAmount],
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

        it("should succeed in claiming three rewards if three stakers stake exactly the same first token amount at different times", async () => {
            const stakedAmount = await toWei(10, firstStakableTokenInstance);
            const duration = new BN(12);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, 0],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(6)),
                mineBlockAfter: false,
            });
            // second staker stakes
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [stakedAmount, 0],
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
                [stakedAmount, 0],
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

        it("should succeed in claiming three rewards if three stakers stake exactly the same second token amount at different times", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(12);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [0, stakedAmount],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(6)),
                mineBlockAfter: false,
            });
            // second staker stakes
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [0, stakedAmount],
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
                [0, stakedAmount],
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

        it("should succeed in claiming three rewards if a staker stakes first token and the other 2 stake second token, exactly at the same amount, at different times", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(12);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, 0],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(6)),
                mineBlockAfter: false,
            });
            // second staker stakes
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [0, stakedAmount],
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
                [0, stakedAmount],
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

        it("should succeed in claiming three rewards if two stakers stake first token and the other one stakes second token, exactly at the same amount, at different times", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(12);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, 0],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(6)),
                mineBlockAfter: false,
            });
            // second staker stakes
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [stakedAmount, 0],
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
                [0, stakedAmount],
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

        it("should succeed in claiming a reward if a staker stakes the first token when the distribution has already started", async () => {
            const stakedAmount = await toWei(10, firstStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, 0],
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

        it("should succeed in claiming a reward if a staker stakes the second token when the distribution has already started", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [0, stakedAmount],
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

        it("should succeed in claiming a reward if a staker stakes the same amount of both tokens when the distribution has already started", async () => {
            const firstStakedAmount = await toWei(
                10,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                10,
                secondStakableTokenInstance
            );
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [firstStakedAmount, secondStakedAmount],
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

        it("should succeed in claiming a reward if a staker stakes different amounts of both tokens when the distribution has already started", async () => {
            const firstStakedAmount = await toWei(
                10,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                13,
                secondStakableTokenInstance
            );
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [firstStakedAmount, secondStakedAmount],
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

        it("should succeed in claiming 0 rewards if a staker stakes the first token at the last second (literally)", async () => {
            const stakedAmount = await toWei(10, firstStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, 0],
                stakerStartingTimestamp
            );
            expect(stakerStartingTimestamp).to.be.equalBn(
                await getEvmTimestamp()
            );
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

        it("should succeed in claiming 0 rewards if a staker stakes the second token at the last second (literally)", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [0, stakedAmount],
                stakerStartingTimestamp
            );
            expect(stakerStartingTimestamp).to.be.equalBn(
                await getEvmTimestamp()
            );
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

        it("should succeed in claiming 0 rewards if a staker stakes both tokens at the last second (literally)", async () => {
            const firstStakedAmount = await toWei(
                10,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                13,
                secondStakableTokenInstance
            );
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [firstStakedAmount, secondStakedAmount],
                stakerStartingTimestamp
            );
            expect(stakerStartingTimestamp).to.be.equalBn(
                await getEvmTimestamp()
            );
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

        it("should succeed in claiming one reward if a staker stakes the first token at the last valid distribution second", async () => {
            const stakedAmount = await toWei(10, firstStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, 0],
                stakerStartingTimestamp
            );
            expect(stakerStartingTimestamp).to.be.equalBn(
                await getEvmTimestamp()
            );
            await fastForwardTo({ timestamp: endingTimestamp });
            const campaignEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
            expect(
                campaignEndingTimestamp.sub(stakerStartingTimestamp)
            ).to.be.equalBn(new BN(1));
            const rewardPerSecond = rewardsAmount.div(duration);
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await rewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(rewardPerSecond);
        });

        it("should succeed in claiming one reward if a staker stakes the second token at the last valid distribution second", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [0, stakedAmount],
                stakerStartingTimestamp
            );
            expect(stakerStartingTimestamp).to.be.equalBn(
                await getEvmTimestamp()
            );
            await fastForwardTo({ timestamp: endingTimestamp });
            const campaignEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
            expect(
                campaignEndingTimestamp.sub(stakerStartingTimestamp)
            ).to.be.equalBn(new BN(1));
            const rewardPerSecond = rewardsAmount.div(duration);
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await rewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(rewardPerSecond);
        });

        it("should succeed in claiming one reward if a staker stakes both tokens at the last valid distribution second", async () => {
            const firstStakedAmount = await toWei(
                10,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                13,
                secondStakableTokenInstance
            );
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [firstStakedAmount, secondStakedAmount],
                stakerStartingTimestamp
            );
            expect(stakerStartingTimestamp).to.be.equalBn(
                await getEvmTimestamp()
            );
            await fastForwardTo({ timestamp: endingTimestamp });
            const campaignEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
            expect(
                campaignEndingTimestamp.sub(stakerStartingTimestamp)
            ).to.be.equalBn(new BN(1));
            const rewardPerSecond = rewardsAmount.div(duration);
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await rewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.closeBn(rewardPerSecond, MAXIMUM_VARIANCE);
        });

        it("should succeed in claiming two rewards if two stakers stake exactly the same amount f first token at different times, and then the first staker withdraws a portion of his stake", async () => {
            const stakedAmount = await toWei(10, firstStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [stakedAmount, 0],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(5)),
                mineBlockAfter: false,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [stakedAmount, 0],
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
                [stakedAmount.div(new BN(2)), 0],
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
                .add(
                    rewardPerSecond.mul(new BN(2)).mul(new BN(2)).div(new BN(3))
                );
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

        it("should succeed in claiming two rewards if two stakers stake exactly the same amount of second token at different times, and then the first staker withdraws a portion of his stake", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [0, stakedAmount],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(5)),
                mineBlockAfter: false,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [0, stakedAmount],
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
                [0, stakedAmount.div(new BN(2))],
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
                .add(
                    rewardPerSecond.mul(new BN(2)).mul(new BN(2)).div(new BN(3))
                );
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

        it("should succeed in claiming two rewards if a staker stakes the first token, the second staker stakes second token, and then the first withdraws a portion of his stake", async () => {
            const firstStakedAmount = await toWei(
                10,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                10,
                secondStakableTokenInstance
            );
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                [firstStakedAmount, 0],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(5)),
                mineBlockAfter: false,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [0, secondStakedAmount],
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
                [firstStakedAmount.div(new BN(2)), 0],
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
                .add(
                    rewardPerSecond.mul(new BN(2)).mul(new BN(2)).div(new BN(3))
                );
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

        it("should succeed in claiming two rewards if two stakers both stake the first token at the last valid distribution second", async () => {
            const stakedAmount = await toWei(10, firstStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: stakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
            await stake(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount, 0],
                false
            );
            await stake(
                erc20DistributionInstance,
                secondStakerAddress,
                [stakedAmount, 0],
                false
            );
            await mineBlock(stakingTimestamp);
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

        it("should succeed in claiming two rewards if two stakers both stake the second token at the last valid distribution second", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: stakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
            await stake(
                erc20DistributionInstance,
                firstStakerAddress,
                [0, stakedAmount],
                false
            );
            await stake(
                erc20DistributionInstance,
                secondStakerAddress,
                [0, stakedAmount],
                false
            );
            await mineBlock(stakingTimestamp);
            expect(await getEvmTimestamp()).to.be.equalBn(stakingTimestamp);
            await startMining();
            await fastForwardTo({ timestamp: endingTimestamp });
            // make 100% sure the time actually changes
            await mineBlock(endingTimestamp);
            expect(await getEvmTimestamp()).to.be.equalBn(endingTimestamp);

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

        it("should succeed in claiming two rewards if two stakers both stake both tokens at the last valid distribution second", async () => {
            const firstStakedAmount = await toWei(
                10,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                10,
                secondStakableTokenInstance
            );
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
            await stake(
                erc20DistributionInstance,
                firstStakerAddress,
                [firstStakedAmount, secondStakedAmount],
                false
            );
            await stake(
                erc20DistributionInstance,
                secondStakerAddress,
                [firstStakedAmount, secondStakedAmount],
                false
            );
            await mineBlock(stakingTimestamp);
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

        it("should succeed in claiming two rewards if two stakers both stake different amounts of both tokens at the last valid distribution second", async () => {
            const firstStakedAmount = await toWei(
                15,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                10,
                secondStakableTokenInstance
            );
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
            const totalFirstStakerStake = firstStakedAmount.mul(new BN(2));
            await stake(
                erc20DistributionInstance,
                firstStakerAddress,
                [firstStakedAmount, firstStakedAmount],
                false
            );
            const totalSecondStakerStake = firstStakedAmount.add(
                secondStakedAmount
            );
            await stake(
                erc20DistributionInstance,
                secondStakerAddress,
                [firstStakedAmount, secondStakedAmount],
                false
            );
            await mineBlock(stakingTimestamp);
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

            expect(
                await erc20DistributionInstance.totalStakedTokensOf(
                    firstStakerAddress
                )
            ).to.be.equalBn(totalFirstStakerStake);
            expect(
                await erc20DistributionInstance.totalStakedTokensOf(
                    secondStakerAddress
                )
            ).to.be.equalBn(totalSecondStakerStake);

            const rewardPerSecond = rewardsAmount.div(duration);
            const onchainTotalStake = await erc20DistributionInstance.totalStakedTokensAmount();
            expect(onchainTotalStake).to.be.equalBn(
                totalFirstStakerStake.add(totalSecondStakerStake)
            );
            const tokenMultipler = new BN(10).pow(new BN(18));
            const firstStakerPoolShare = totalFirstStakerStake
                .mul(tokenMultipler)
                .div(onchainTotalStake);
            // the first staker had half of the rewards for 1 second
            const expectedFirstStakerReward = rewardPerSecond
                .mul(firstStakerPoolShare)
                .div(tokenMultipler);
            const secondStakerPoolShare = totalSecondStakerStake
                .mul(tokenMultipler)
                .div(onchainTotalStake);
            // the second staker had half of the rewards for 1 second
            const expectedSecondStakerReward = rewardPerSecond
                .mul(secondStakerPoolShare)
                .div(tokenMultipler);

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

        it("should succeed in claiming a reward if a staker stakes at second n and then increases their stake", async () => {
            const stakedAmount = await toWei(10, firstStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
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
                stakableTokens: [firstStakableTokenInstance],
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
                [amountPerStake],
                startingTimestamp
            );
            const firstStakeStartingTimestamp = await getEvmTimestamp();
            expect(firstStakeStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await fastForwardTo({
                timestamp: startingTimestamp.add(new BN(5)),
                mineBlockAfter: false,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [amountPerStake],
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

        it("should succeed in claiming two rewards if two staker respectively stake and withdraw the first token at the same second", async () => {
            const stakedAmount = await toWei(10, firstStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [rewardsAmount],
                duration,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount, 0],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await stopMining();
            const stakeAndWithdrawTimestamp = startingTimestamp.add(new BN(5));
            await fastForwardTo({
                timestamp: stakeAndWithdrawTimestamp,
                mineBlockAfter: false,
            });
            await stake(
                erc20DistributionInstance,
                secondStakerAddress,
                [stakedAmount, 0],
                false
            );
            await withdraw(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount, 0],
                false
            );
            await mineBlock(stakeAndWithdrawTimestamp);
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

        it("should succeed in claiming two rewards if two staker respectively stake and withdraw the second token at the same second", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [rewardsAmount],
                duration,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [0, stakedAmount],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await stopMining();
            const stakeAndWithdrawTimestamp = startingTimestamp.add(new BN(5));
            await fastForwardTo({
                timestamp: stakeAndWithdrawTimestamp,
                mineBlockAfter: false,
            });
            await stake(
                erc20DistributionInstance,
                secondStakerAddress,
                [0, stakedAmount],
                false
            );
            await withdraw(
                erc20DistributionInstance,
                firstStakerAddress,
                [0, stakedAmount],
                false
            );
            await mineBlock(stakeAndWithdrawTimestamp);
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

        it("should succeed in claiming two rewards if two staker respectively stake and withdraw the second token at the same second", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [rewardsAmount],
                duration,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [0, stakedAmount],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await stopMining();
            const stakeAndWithdrawTimestamp = startingTimestamp.add(new BN(5));
            await fastForwardTo({
                timestamp: stakeAndWithdrawTimestamp,
                mineBlockAfter: false,
            });
            await stake(
                erc20DistributionInstance,
                secondStakerAddress,
                [0, stakedAmount],
                false
            );
            await withdraw(
                erc20DistributionInstance,
                firstStakerAddress,
                [0, stakedAmount],
                false
            );
            await mineBlock(stakeAndWithdrawTimestamp);
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

        it("should succeed in claiming two rewards if two staker respectively stake and withdraw both tokens at the same second", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [rewardsAmount],
                duration,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount, stakedAmount],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await stopMining();
            const stakeAndWithdrawTimestamp = startingTimestamp.add(new BN(5));
            await fastForwardTo({
                timestamp: stakeAndWithdrawTimestamp,
                mineBlockAfter: false,
            });
            await stake(
                erc20DistributionInstance,
                secondStakerAddress,
                [stakedAmount, stakedAmount],
                false
            );
            await withdraw(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount, stakedAmount],
                false
            );
            await mineBlock(stakeAndWithdrawTimestamp);
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

        it("should succeed in claiming two rewards if two staker respectively stake and withdraw both tokens at the same second, but with different amounts", async () => {
            const stakedAmount = await toWei(10, secondStakableTokenInstance);
            const duration = new BN(10);
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: secondStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [rewardsAmount],
                duration,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount, stakedAmount],
                startingTimestamp
            );
            const firstStakerStartingTimestamp = await getEvmTimestamp();
            expect(firstStakerStartingTimestamp).to.be.equalBn(
                startingTimestamp
            );
            await stopMining();
            const stakeAndWithdrawTimestamp = startingTimestamp.add(new BN(5));
            await fastForwardTo({
                timestamp: stakeAndWithdrawTimestamp,
                mineBlockAfter: false,
            });
            await stake(
                erc20DistributionInstance,
                secondStakerAddress,
                [stakedAmount, 30],
                false
            );
            await withdraw(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount, stakedAmount],
                false
            );
            await mineBlock(stakeAndWithdrawTimestamp);
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
            ).to.be.closeBn(expectedReward, MAXIMUM_VARIANCE);
        });
    }
);
