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
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract(
    "ERC20Distribution - Single stakable, multi reward tokens - Claiming",
    () => {
        let erc20DistributionInstance,
            firstRewardTokenInstance,
            secondRewardTokenInstance,
            stakableTokenInstance,
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
            firstRewardTokenInstance = await FirstRewardERC20.new();
            secondRewardTokenInstance = await SecondRewardERC20.new();
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
            const firstRewardAmount = await toWei(10, firstRewardTokenInstance);
            const secondRewardAmount = await toWei(
                20,
                secondRewardTokenInstance
            );
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardAmount, secondRewardAmount],
                duration: 10,
            });
            await fastForwardTo({
                timestamp: startingTimestamp,
                mineBlockAfter: false,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount],
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
            const firstRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                firstRewardTokenInstance.address
            );
            const firstStakerRewardsTokenBalance = await firstRewardTokenInstance.balanceOf(
                firstStakerAddress
            );
            expect(firstStakerRewardsTokenBalance).to.equalBn(
                firstRewardPerSecond.mul(stakingDuration)
            );
            // additional checks to be extra safe
            expect(firstStakerRewardsTokenBalance).to.equalBn(
                firstRewardAmount
            );

            const secondRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                secondRewardTokenInstance.address
            );
            const secondStakerRewardsTokenBalance = await secondRewardTokenInstance.balanceOf(
                firstStakerAddress
            );
            expect(secondStakerRewardsTokenBalance).to.equalBn(
                secondRewardPerSecond.mul(stakingDuration)
            );
            // additional checks to be extra safe
            expect(secondStakerRewardsTokenBalance).to.equalBn(
                secondRewardAmount
            );
        });

        it("should succeed in claiming two multiple rewards if two stakers stake exactly the same amount at different times", async () => {
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
            const firstRewardAmount = await toWei(10, firstRewardTokenInstance);
            const secondRewardAmount = await toWei(
                50,
                secondRewardTokenInstance
            );
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardAmount, secondRewardAmount],
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
                [stakedAmount],
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
                [stakedAmount],
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
            const firstRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                firstRewardTokenInstance.address
            );
            const secondRewardPerSecond = await erc20DistributionInstance.rewardPerSecond(
                secondRewardTokenInstance.address
            );
            // the first staker had all of the rewards for 5 seconds and half of them for 5
            const expectedFirstFirstStakerReward = firstRewardPerSecond
                .mul(new BN(5))
                .add(firstRewardPerSecond.mul(new BN(5)).div(new BN(2)));
            const expectedSecondFirstStakerReward = secondRewardPerSecond
                .mul(new BN(5))
                .add(secondRewardPerSecond.mul(new BN(5)).div(new BN(2)));
            // the second staker had half of the rewards for 5 seconds
            const expectedFirstSecondStakerReward = firstRewardPerSecond
                .div(new BN(2))
                .mul(new BN(5));
            const expectedSecondSecondStakerReward = secondRewardPerSecond
                .div(new BN(2))
                .mul(new BN(5));
            // first staker claiming/balance checking
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedFirstFirstStakerReward);
            expect(
                await secondRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedSecondFirstStakerReward);
            // second staker claiming/balance checking
            await erc20DistributionInstance.claim({
                from: secondStakerAddress,
            });
            expect(
                await firstRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.equalBn(expectedFirstSecondStakerReward);
            expect(
                await secondRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.equalBn(expectedSecondSecondStakerReward);
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
            const firstRewardAmount = await toWei(12, firstRewardTokenInstance);
            const secondRewardAmount = await toWei(
                30,
                secondRewardTokenInstance
            );
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardAmount, secondRewardAmount],
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
                [stakedAmount],
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
                [stakedAmount],
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
                [stakedAmount],
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

            const firstRewardPerSecond = firstRewardAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    firstRewardTokenInstance.address
                )
            ).to.be.equalBn(firstRewardPerSecond);
            const secondRewardPerSecond = secondRewardAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    secondRewardTokenInstance.address
                )
            ).to.be.equalBn(secondRewardPerSecond);
            // the first staker had all of the rewards for 6 seconds,
            // half of them for 3 seconds and a third for 3 seconds
            const expectedFirstFirstStakerReward = firstRewardPerSecond
                .mul(new BN(6))
                .add(firstRewardPerSecond.mul(new BN(3)).div(new BN(2)))
                .add(firstRewardPerSecond.mul(new BN(3)).div(new BN(3)));
            const expectedSecondFirstStakerReward = secondRewardPerSecond
                .mul(new BN(6))
                .add(secondRewardPerSecond.mul(new BN(3)).div(new BN(2)))
                .add(secondRewardPerSecond.mul(new BN(3)).div(new BN(3)));
            // the second staker had half of the rewards for 6 seconds
            // and a third for 3 seconds
            const expectedFirstSecondStakerReward = firstRewardPerSecond
                .mul(new BN(3))
                .div(new BN(2))
                .add(firstRewardPerSecond.mul(new BN(3)).div(new BN(3)));
            const expectedSecondSecondStakerReward = secondRewardPerSecond
                .mul(new BN(3))
                .div(new BN(2))
                .add(secondRewardPerSecond.mul(new BN(3)).div(new BN(3)));
            // the third staker had a third of the rewards for 3 seconds
            // (math says that they'd simply get a full second reward for 3 seconds,
            // but let's do the calculation anyway for added clarity)
            const expectedFirstThirdStakerReward = firstRewardPerSecond
                .mul(new BN(3))
                .div(new BN(3));
            const expectedSecondThirdStakerReward = secondRewardPerSecond
                .mul(new BN(3))
                .div(new BN(3));

            // first staker claiming/balance checking
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.closeBn(expectedFirstFirstStakerReward, MAXIMUM_VARIANCE);
            expect(
                await secondRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.closeBn(expectedSecondFirstStakerReward, MAXIMUM_VARIANCE);

            // second staker claim and rewards balance check
            await erc20DistributionInstance.claim({
                from: secondStakerAddress,
            });
            expect(
                await firstRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.closeBn(expectedFirstSecondStakerReward, MAXIMUM_VARIANCE);
            expect(
                await secondRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.closeBn(expectedSecondSecondStakerReward, MAXIMUM_VARIANCE);

            // third staker claim and rewards balance check
            await erc20DistributionInstance.claim({ from: thirdStakerAddress });
            expect(
                await firstRewardTokenInstance.balanceOf(thirdStakerAddress)
            ).to.be.closeBn(expectedFirstThirdStakerReward, MAXIMUM_VARIANCE);
            expect(
                await secondRewardTokenInstance.balanceOf(thirdStakerAddress)
            ).to.be.closeBn(expectedSecondThirdStakerReward, MAXIMUM_VARIANCE);
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
            const firstRewardsAmount = await toWei(
                10,
                firstRewardTokenInstance
            );
            const secondRewardsAmount = await toWei(
                20,
                secondRewardTokenInstance
            );
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
                [stakedAmount],
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
            const firstRewardPerSecond = firstRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    firstRewardTokenInstance.address
                )
            ).to.be.equalBn(firstRewardPerSecond);
            const secondRewardPerSecond = secondRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    secondRewardTokenInstance.address
                )
            ).to.be.equalBn(secondRewardPerSecond);
            // the staker had all of the rewards for 5 seconds
            const expectedFirstStakerReward = firstRewardPerSecond.mul(
                new BN(5)
            );
            // claim and rewards balance check
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.closeBn(expectedFirstStakerReward, MAXIMUM_VARIANCE);
            expect(
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
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
            const firstRewardsAmount = await toWei(
                10,
                firstRewardTokenInstance
            );
            const secondRewardsAmount = await toWei(
                10,
                secondRewardTokenInstance
            );
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
                [stakedAmount],
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
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(ZERO_BN);
            expect(
                await secondRewardTokenInstance.balanceOf(firstStakerAddress)
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
            const firstRewardsAmount = await toWei(
                10,
                firstRewardTokenInstance
            );
            const secondRewardsAmount = await toWei(
                20,
                secondRewardTokenInstance
            );
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
                [stakedAmount],
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

            const firstRewardPerSecond = firstRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    firstRewardTokenInstance.address
                )
            ).to.be.equalBn(firstRewardPerSecond);
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(firstRewardPerSecond, MAXIMUM_VARIANCE);

            const secondRewardPerSecond = secondRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    secondRewardTokenInstance.address
                )
            ).to.be.equalBn(secondRewardPerSecond);
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await secondRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(secondRewardPerSecond, MAXIMUM_VARIANCE);
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
            const firstRewardsAmount = await toWei(
                10,
                firstRewardTokenInstance
            );
            const secondRewardsAmount = await toWei(
                40,
                secondRewardTokenInstance
            );
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
                duration,
            });
            await fastForwardTo({
                timestamp: startingTimestamp,
                mineBlockAfter: false,
            });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount],
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
                [stakedAmount],
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
                [stakedAmount.div(new BN(2))],
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
            const firstRewardPerSecond = firstRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    firstRewardTokenInstance.address
                )
            ).to.be.equalBn(firstRewardPerSecond);
            const secondRewardPerSecond = secondRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    secondRewardTokenInstance.address
                )
            ).to.be.equalBn(secondRewardPerSecond);
            // the first staker had all of the rewards for 5 seconds, half of them for 3, and a third for 2
            const expectedFirstFirstStakerReward = firstRewardPerSecond
                .mul(new BN(5))
                .add(firstRewardPerSecond.mul(new BN(3)).div(new BN(2)))
                .add(firstRewardPerSecond.mul(new BN(2)).div(new BN(3)));
            const expectedSecondFirstStakerReward = secondRewardPerSecond
                .mul(new BN(5))
                .add(secondRewardPerSecond.mul(new BN(3)).div(new BN(2)))
                .add(secondRewardPerSecond.mul(new BN(2)).div(new BN(3)));
            // the second staker had half of the rewards for 3 seconds and two thirds for 2
            const expectedFirstSecondStakerReward = firstRewardPerSecond
                .div(new BN(2))
                .mul(new BN(3))
                .add(
                    firstRewardPerSecond
                        .mul(new BN(2))
                        .mul(new BN(2))
                        .div(new BN(3))
                );
            const expectedSecondSecondStakerReward = secondRewardPerSecond
                .div(new BN(2))
                .mul(new BN(3))
                .add(
                    secondRewardPerSecond
                        .mul(new BN(2))
                        .mul(new BN(2))
                        .div(new BN(3))
                );
            // first staker claim and rewards balance check
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.closeBn(expectedFirstFirstStakerReward, MAXIMUM_VARIANCE);
            expect(
                await secondRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.closeBn(expectedSecondFirstStakerReward, MAXIMUM_VARIANCE);
            // second staker claim and rewards balance check
            await erc20DistributionInstance.claim({
                from: secondStakerAddress,
            });
            expect(
                await firstRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.closeBn(expectedFirstSecondStakerReward, MAXIMUM_VARIANCE);
            expect(
                await secondRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.closeBn(expectedSecondSecondStakerReward, MAXIMUM_VARIANCE);
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
            const firstRewardsAmount = await toWei(
                10,
                firstRewardTokenInstance
            );
            const secondRewardsAmount = await toWei(
                20,
                secondRewardTokenInstance
            );
            const { endingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
                [stakedAmount],
                stakingTimestamp
            );
            await stakeAtTimestamp(
                erc20DistributionInstance,
                secondStakerAddress,
                [stakedAmount],
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

            const firstRewardPerSecond = firstRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    firstRewardTokenInstance.address
                )
            ).to.be.equalBn(firstRewardPerSecond);
            const secondRewardPerSecond = secondRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    secondRewardTokenInstance.address
                )
            ).to.be.equalBn(secondRewardPerSecond);
            // the first staker had half of the rewards for 1 second
            const expectedFirstFirstStakerReward = firstRewardPerSecond.div(
                new BN(2)
            );
            const expectedSecondFirstStakerReward = secondRewardPerSecond.div(
                new BN(2)
            );
            // the second staker had half of the rewards for 1 second
            const expectedFirstSecondStakerReward = firstRewardPerSecond.div(
                new BN(2)
            );
            const expectedSecondSecondStakerReward = secondRewardPerSecond.div(
                new BN(2)
            );

            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedFirstFirstStakerReward);
            expect(
                await secondRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedSecondFirstStakerReward);

            await erc20DistributionInstance.claim({
                from: secondStakerAddress,
            });
            expect(
                await firstRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.equalBn(expectedFirstSecondStakerReward);
            expect(
                await secondRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.equalBn(expectedSecondSecondStakerReward);
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
            const firstRewardsAmount = await toWei(
                10,
                firstRewardTokenInstance
            );
            const secondRewardsAmount = await toWei(
                100,
                secondRewardTokenInstance
            );
            const amountPerStake = stakedAmount.div(new BN(2));
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
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
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(firstRewardsAmount);
            expect(
                await secondRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(secondRewardsAmount);
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
            const firstRewardsAmount = await toWei(
                10,
                firstRewardTokenInstance
            );
            const secondRewardsAmount = await toWei(
                10,
                secondRewardTokenInstance
            );
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: [firstRewardsAmount, secondRewardsAmount],
                duration,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount],
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
                [stakedAmount],
                false
            );
            await withdraw(
                erc20DistributionInstance,
                firstStakerAddress,
                [stakedAmount],
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

            const firstRewardPerSecond = firstRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    firstRewardTokenInstance.address
                )
            ).to.be.equalBn(firstRewardPerSecond);
            const secondRewardPerSecond = secondRewardsAmount.div(duration);
            expect(
                await erc20DistributionInstance.rewardPerSecond(
                    secondRewardTokenInstance.address
                )
            ).to.be.equalBn(secondRewardPerSecond);
            // both stakers had all of the rewards for 5 seconds
            const expectedFirstReward = firstRewardPerSecond.mul(new BN(5));
            const expectedSecondReward = secondRewardPerSecond.mul(new BN(5));

            // first staker claim and rewards balance check
            await erc20DistributionInstance.claim({ from: firstStakerAddress });
            expect(
                await firstRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedFirstReward);
            expect(
                await secondRewardTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedSecondReward);

            // second staker claim and rewards balance check
            await erc20DistributionInstance.claim({
                from: secondStakerAddress,
            });
            expect(
                await firstRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.equalBn(expectedFirstReward);
            expect(
                await secondRewardTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.equalBn(expectedSecondReward);
        });
    }
);
