const { expect } = require("chai");
const { ZERO_BN } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stakeAtTimestamp,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { fastForwardTo, mineBlock } = require("../../utils/network");

const ERC20Distribution = artifacts.require("ERC20Distribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");
const SecondStakableERC20 = artifacts.require("SecondStakableERC20");

contract(
    "ERC20Distribution - Single reward, multiple stakable tokenss - Staking",
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
            erc20DistributionInstance = await ERC20Distribution.new({
                from: ownerAddress,
            });
            rewardsTokenInstance = await FirstRewardERC20.new();
            firstStakableTokenInstance = await FirstStakableERC20.new();
            secondStakableTokenInstance = await SecondStakableERC20.new();
            stakerAddress = accounts[1];
        });

        it("should fail when the staker has not enough balance for the first stakable token", async () => {
            try {
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [
                        firstStakableTokenInstance,
                        secondStakableTokenInstance,
                    ],
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [2],
                    duration: 2,
                });
                await mineBlock(startingTimestamp);
                await erc20DistributionInstance.stake([100, 0], {
                    from: stakerAddress,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds balance"
                );
            }
        });

        it("should fail when the staker has not enough balance for the second stakable token", async () => {
            try {
                await firstStakableTokenInstance.mint(stakerAddress, 100);
                await firstStakableTokenInstance.approve(
                    erc20DistributionInstance.address,
                    100,
                    { from: stakerAddress }
                );
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [
                        firstStakableTokenInstance,
                        secondStakableTokenInstance,
                    ],
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [2],
                    duration: 2,
                });
                await mineBlock(startingTimestamp);
                await erc20DistributionInstance.stake([100, 102020], {
                    from: stakerAddress,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds balance"
                );
            }
        });

        it("should fail when no allowance was set by the staker on the first stakable token", async () => {
            try {
                await firstStakableTokenInstance.mint(stakerAddress, 1);
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [
                        firstStakableTokenInstance,
                        secondStakableTokenInstance,
                    ],
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [2],
                    duration: 2,
                });
                await mineBlock(startingTimestamp);
                await erc20DistributionInstance.stake([1, 0], {
                    from: stakerAddress,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds allowance"
                );
            }
        });

        it("should fail when no allowance was set by the staker on the second stakable token", async () => {
            try {
                await firstStakableTokenInstance.mint(stakerAddress, 1);
                await firstStakableTokenInstance.approve(
                    erc20DistributionInstance.address,
                    1,
                    { from: stakerAddress }
                );
                await secondStakableTokenInstance.mint(stakerAddress, 200);
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [
                        firstStakableTokenInstance,
                        secondStakableTokenInstance,
                    ],
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [2],
                    duration: 2,
                });
                await mineBlock(startingTimestamp);
                await erc20DistributionInstance.stake([1, 200], {
                    from: stakerAddress,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds allowance"
                );
            }
        });

        it("should fail when not enough allowance was set by the staker on the first stakable token", async () => {
            try {
                await firstStakableTokenInstance.mint(stakerAddress, 100);
                await firstStakableTokenInstance.approve(
                    erc20DistributionInstance.address,
                    50,
                    { from: stakerAddress }
                );
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [
                        firstStakableTokenInstance,
                        secondStakableTokenInstance,
                    ],
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [2],
                    duration: 2,
                });
                await mineBlock(startingTimestamp);
                await erc20DistributionInstance.stake([100, 100], {
                    from: stakerAddress,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds allowance"
                );
            }
        });

        it("should fail when not enough allowance was set by the staker on the second stakable token", async () => {
            try {
                await firstStakableTokenInstance.mint(stakerAddress, 100);
                await firstStakableTokenInstance.approve(
                    erc20DistributionInstance.address,
                    100,
                    { from: stakerAddress }
                );
                await secondStakableTokenInstance.mint(stakerAddress, 100);
                await secondStakableTokenInstance.approve(
                    erc20DistributionInstance.address,
                    50,
                    { from: stakerAddress }
                );
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [
                        firstStakableTokenInstance,
                        secondStakableTokenInstance,
                    ],
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [2],
                    duration: 2,
                });
                await mineBlock(startingTimestamp);
                await erc20DistributionInstance.stake([100, 100], {
                    from: stakerAddress,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds allowance"
                );
            }
        });

        it("should succeed in the right conditions", async () => {
            const firstStakedAmount = await toWei(
                10,
                firstStakableTokenInstance
            );
            const secondStakedAmount = await toWei(
                10,
                secondStakableTokenInstance
            );
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: firstStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: firstStakedAmount,
            });
            await initializeStaker({
                erc20DistributionInstance,
                stakableTokenInstance: secondStakableTokenInstance,
                stakerAddress: stakerAddress,
                stakableAmount: secondStakedAmount,
            });
            const rewardTokens = [rewardsTokenInstance];
            const stakableTokens = [
                firstStakableTokenInstance,
                secondStakableTokenInstance,
            ];
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens,
                rewardTokens,
                rewardAmounts: [await toWei(1, rewardsTokenInstance)],
                duration: 2,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                stakerAddress,
                [firstStakedAmount, secondStakedAmount],
                startingTimestamp
            );

            expect(
                await erc20DistributionInstance.stakedTokensOf(
                    stakerAddress,
                    firstStakableTokenInstance.address
                )
            ).to.be.equalBn(firstStakedAmount);
            expect(
                await erc20DistributionInstance.stakedTokenAmount(
                    secondStakableTokenInstance.address
                )
            ).to.be.equalBn(secondStakedAmount);

            expect(
                await erc20DistributionInstance.totalStakedTokensAmount()
            ).to.be.equalBn(firstStakedAmount.add(secondStakedAmount));
        });

        it("should succeed and do nothing when trying to stake 0 tokens", async () => {
            const stakableTokens = [
                firstStakableTokenInstance,
                secondStakableTokenInstance,
            ];
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [await toWei(1, rewardsTokenInstance)],
                duration: 2,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await stakeAtTimestamp(
                erc20DistributionInstance,
                stakerAddress,
                [0, 0],
                startingTimestamp
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
                await erc20DistributionInstance.totalStakedTokensAmount()
            ).to.be.equalBn(ZERO_BN);
        });
    }
);
