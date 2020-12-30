const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_BN } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    withdraw,
    stakeAtTimestamp,
    withdrawAtTimestamp,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { fastForwardTo } = require("../../utils/network");

const ERC20Distribution = artifacts.require("ERC20Distribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");
const SecondStakableERC20 = artifacts.require("SecondStakableERC20");

contract(
    "ERC20Distribution - Single reward, multi stakable tokens - Withdrawing",
    () => {
        let erc20DistributionInstance,
            rewardsTokenInstance,
            firstStakableTokenInstance,
            secondStakableTokenInstance,
            ownerAddress,
            stakerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20Distribution.new({ from: ownerAddress });
            rewardsTokenInstance = await FirstRewardERC20.new();
            firstStakableTokenInstance = await FirstStakableERC20.new();
            secondStakableTokenInstance = await SecondStakableERC20.new();
            stakerAddress = accounts[1];
        });

        it("should fail when the staker tries to withdraw more first token than what they staked", async () => {
            try {
                await initializeStaker({
                    erc20DistributionInstance,
                    stakableTokenInstance: firstStakableTokenInstance,
                    stakerAddress: stakerAddress,
                    stakableAmount: 10,
                });
                await initializeStaker({
                    erc20DistributionInstance,
                    stakableTokenInstance: secondStakableTokenInstance,
                    stakerAddress: stakerAddress,
                    stakableAmount: 10,
                });
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [
                        firstStakableTokenInstance,
                        secondStakableTokenInstance,
                    ],
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [10],
                    duration: 10,
                });
                await fastForwardTo({ timestamp: startingTimestamp });
                await stakeAtTimestamp(
                    erc20DistributionInstance,
                    stakerAddress,
                    [10, 10],
                    startingTimestamp
                );
                await erc20DistributionInstance.withdraw([15, 10]);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: withdrawn amount greater than current stake"
                );
            }
        });

        it("should fail when the staker tries to withdraw more second token than what they staked", async () => {
            try {
                await initializeStaker({
                    erc20DistributionInstance,
                    stakableTokenInstance: firstStakableTokenInstance,
                    stakerAddress: stakerAddress,
                    stakableAmount: 10,
                });
                await initializeStaker({
                    erc20DistributionInstance,
                    stakableTokenInstance: secondStakableTokenInstance,
                    stakerAddress: stakerAddress,
                    stakableAmount: 10,
                });
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [
                        firstStakableTokenInstance,
                        secondStakableTokenInstance,
                    ],
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [15],
                    duration: 10,
                });
                await fastForwardTo({ timestamp: startingTimestamp });
                await stakeAtTimestamp(
                    erc20DistributionInstance,
                    stakerAddress,
                    [10, 10],
                    startingTimestamp
                );
                await erc20DistributionInstance.withdraw([10, 15]);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: withdrawn amount greater than current stake"
                );
            }
        });

        it("should succeed in the right conditions in withdrawing 100% of the stake, when the distribution has not yet ended", async () => {
            const stakedAmounts = [
                await toWei(10, firstStakableTokenInstance),
                await toWei(39, secondStakableTokenInstance),
            ];
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: stakedAmounts[0],
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: stakedAmounts[1],
            });
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [await toWei(1, rewardsTokenInstance)],
                duration: 10,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                stakerAddress,
                stakedAmounts,
                startingTimestamp
            );
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    firstStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[0]);
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    secondStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[1]);
            await withdraw(erc20DistributionInstance, stakerAddress, stakedAmounts);
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    firstStakableTokenInstance.address
                )
            ).to.be.equalBn(ZERO_BN);
            expect(
                await erc20DistributionInstance.stakedTokenAmount(
                    secondStakableTokenInstance.address
                )
            ).to.be.equalBn(ZERO_BN);
            expect(
                await firstStakableTokenInstance.balanceOf(stakerAddress)
            ).to.be.equalBn(stakedAmounts[0]);
            expect(
                await secondStakableTokenInstance.balanceOf(stakerAddress)
            ).to.be.equalBn(stakedAmounts[1]);
        });

        it("should succeed in the right conditions in withdrawing a part of the stake, when the distribution has not yet ended", async () => {
            const stakedAmounts = [
                await toWei(10, firstStakableTokenInstance),
                await toWei(39, secondStakableTokenInstance),
            ];
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: stakedAmounts[0],
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: stakedAmounts[1],
            });
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [await toWei(1, rewardsTokenInstance)],
                duration: 10,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                stakerAddress,
                stakedAmounts,
                startingTimestamp
            );
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    firstStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[0]);
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    secondStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[1]);
            await withdraw(
                erc20DistributionInstance,
                stakerAddress,
                stakedAmounts.map((amount) => amount.div(new BN(2)))
            );
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    firstStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[0].div(new BN(2)));
            expect(
                await erc20DistributionInstance.stakedTokenAmount(
                    secondStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[1].div(new BN(2)));
            expect(
                await firstStakableTokenInstance.balanceOf(stakerAddress)
            ).to.be.equalBn(stakedAmounts[0].div(new BN(2)));
            expect(
                await secondStakableTokenInstance.balanceOf(stakerAddress)
            ).to.be.equalBn(stakedAmounts[1].div(new BN(2)));
        });

        it("should succeed in the right conditions in withdrawing 100% of the stake, when the distribution has already ended", async () => {
            const stakedAmounts = [
                await toWei(10, firstStakableTokenInstance),
                await toWei(30, secondStakableTokenInstance),
            ];
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: stakedAmounts[0],
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: stakedAmounts[1],
            });
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
                rewardAmounts: [await toWei(1, rewardsTokenInstance)],
                duration: 10,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                stakerAddress,
                stakedAmounts,
                startingTimestamp
            );
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    firstStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[0]);
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    secondStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[1]);
            await fastForwardTo({ timestamp: endingTimestamp });
            await withdrawAtTimestamp(
                erc20DistributionInstance,
                stakerAddress,
                stakedAmounts,
                endingTimestamp
            );
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    firstStakableTokenInstance.address
                )
            ).to.be.equalBn(ZERO_BN);
            expect(
                await erc20DistributionInstance.stakedTokenAmount(
                    secondStakableTokenInstance.address
                )
            ).to.be.equalBn(ZERO_BN);
            expect(
                await firstStakableTokenInstance.balanceOf(stakerAddress)
            ).to.be.equalBn(stakedAmounts[0]);
            expect(
                await secondStakableTokenInstance.balanceOf(stakerAddress)
            ).to.be.equalBn(stakedAmounts[1]);
        });

        it("should succeed in the right conditions in withdrawing a part of the stake, when the distribution has already ended", async () => {
            const stakedAmounts = [
                await toWei(10, firstStakableTokenInstance),
                await toWei(30, secondStakableTokenInstance),
            ];
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: stakedAmounts[0],
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: stakedAmounts[1],
            });
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
                rewardAmounts: [await toWei(1, rewardsTokenInstance)],
                duration: 10,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                stakerAddress,
                stakedAmounts,
                startingTimestamp
            );
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    firstStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[0]);
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    secondStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[1]);
            await fastForwardTo({ timestamp: endingTimestamp });
            await withdrawAtTimestamp(
                erc20DistributionInstance,
                stakerAddress,
                stakedAmounts.map((amount) => amount.div(new BN(2))),
                endingTimestamp
            );
            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    firstStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[0].div(new BN(2)));
            expect(
                await erc20DistributionInstance.stakedTokenAmount(
                    secondStakableTokenInstance.address
                )
            ).to.be.equalBn(stakedAmounts[1].div(new BN(2)));
            expect(
                await firstStakableTokenInstance.balanceOf(stakerAddress)
            ).to.be.equalBn(stakedAmounts[0].div(new BN(2)));
            expect(
                await secondStakableTokenInstance.balanceOf(stakerAddress)
            ).to.be.equalBn(stakedAmounts[1].div(new BN(2)));
        });
    }
);
