const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");

const ERC20Distribution = artifacts.require("ERC20Distribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");
const HighDecimalsERC20 = artifacts.require("HighDecimalsERC20");

contract(
    "ERC20Distribution - Multi rewards, single stakable token - Initialization",
    () => {
        let erc20DistributionInstance,
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
            stakableTokenInstance,
            highDecimalsTokenInstance,
            ownerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20Distribution.new({
                from: ownerAddress,
            });
            firstRewardsTokenInstance = await FirstRewardERC20.new();
            secondRewardsTokenInstance = await SecondRewardERC20.new();
            stakableTokenInstance = await FirstStakableERC20.new();
            highDecimalsTokenInstance = await HighDecimalsERC20.new();
        });

        it("should fail when reward tokens/amounts arrays have inconsistent lengths", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [11],
                    duration: 10,
                    skipRewardTokensAmountsConsistenyCheck: true,
                    // skip funding to avoid errors that happen before the contract is actually called
                    fund: false,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: inconsistent reward token/amount arrays length"
                );
            }
        });

        it("should fail when funding for the first reward token has not been sent to the contract before calling initialize", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [10, 10],
                    duration: 10,
                    skipRewardTokensAmountsConsistenyCheck: true,
                    // skip funding to avoid errors that happen before the contract is actually called
                    fund: false,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: no funding"
                );
            }
        });

        it("should fail when funding for the second reward token has not been sent to the contract before calling initialize", async () => {
            try {
                const rewardAmounts = [10, 10];
                await firstRewardsTokenInstance.mint(
                    erc20DistributionInstance.address,
                    rewardAmounts[0]
                );
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts,
                    duration: 10,
                    skipRewardTokensAmountsConsistenyCheck: true,
                    // skip funding to avoid errors that happen before the contract is actually called
                    fund: false,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: no funding"
                );
            }
        });

        it("should fail when passing a 0-address second reward token", async () => {
            try {
                // manual funding to avoid error on zero-address token
                const rewardAmounts = [10, 10];
                await firstRewardsTokenInstance.mint(
                    erc20DistributionInstance.address,
                    rewardAmounts[0]
                );
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        { address: ZERO_ADDRESS },
                    ],
                    rewardAmounts,
                    duration: 10,
                    fund: false,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: 0 address as reward token"
                );
            }
        });

        it("should fail when passing 0 as the first reward amount", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [0, 10],
                    duration: 10,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: no reward"
                );
            }
        });

        it("should fail when passing 0 as the second reward amount", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [10, 0],
                    duration: 10,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: no reward"
                );
            }
        });

        it("should fail when the second rewards token has more than 18 decimals (avoid overflow)", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        highDecimalsTokenInstance,
                    ],
                    rewardAmounts: [10, 10],
                    duration: 10,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: invalid decimals for reward token"
                );
            }
        });

        it("should succeed in the right conditions", async () => {
            const rewardAmounts = [
                new BN(await toWei(10, firstRewardsTokenInstance)),
                new BN(await toWei(100, secondRewardsTokenInstance)),
            ];
            const duration = new BN(10);
            const rewardTokens = [
                firstRewardsTokenInstance,
                secondRewardsTokenInstance,
            ];
            const stakableTokens = [stakableTokenInstance];
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens,
                rewardTokens,
                rewardAmounts,
                duration,
            });

            expect(await erc20DistributionInstance.initialized()).to.be.true;
            const onchainRewardTokens = await erc20DistributionInstance.getRewardTokens();
            expect(onchainRewardTokens).to.have.length(2);
            expect(onchainRewardTokens[0]).to.be.equal(
                firstRewardsTokenInstance.address
            );
            expect(onchainRewardTokens[1]).to.be.equal(
                secondRewardsTokenInstance.address
            );
            const onchainStakableTokens = await erc20DistributionInstance.getStakableTokens();
            expect(onchainStakableTokens).to.have.length(1);
            for (let i = 0; i < rewardTokens.length; i++) {
                const rewardAmount = rewardAmounts[i];
                const rewardToken = rewardTokens[i];
                expect(
                    await erc20DistributionInstance.rewardTokenMultiplier(
                        rewardToken.address
                    )
                ).to.be.equalBn(
                    new BN(1).mul(new BN(10).pow(await rewardToken.decimals()))
                );
                expect(
                    await rewardToken.balanceOf(
                        erc20DistributionInstance.address
                    )
                ).to.be.equalBn(rewardAmount);
                expect(
                    await erc20DistributionInstance.rewardAmount(
                        rewardToken.address
                    )
                ).to.be.equalBn(rewardAmount);
                expect(
                    await erc20DistributionInstance.rewardPerSecond(
                        rewardToken.address
                    )
                ).to.be.equalBn(new BN(rewardAmount).div(duration));
            }
            const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
            expect(onchainStartingTimestamp).to.be.equalBn(startingTimestamp);
            const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
            expect(
                onchainEndingTimestamp.sub(onchainStartingTimestamp)
            ).to.be.equalBn(duration);
        });

        it("should fail when trying to initialize a second time", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [11, 14],
                    duration: 2,
                });
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [17, 12],
                    duration: 2,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: already initialized"
                );
            }
        });

        it("should fail when passing a duration which surpasses the first reward amount (reward per second to 0)", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [
                        1,
                        await toWei(1, secondRewardsTokenInstance),
                    ],
                    duration: 10000000000,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: seconds duration less than rewards amount"
                );
            }
        });

        it("should fail when passing a duration which surpasses the second reward amount (reward per second to 0)", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [stakableTokenInstance],
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [
                        await toWei(1, secondRewardsTokenInstance),
                        1,
                    ],
                    duration: 10000000000,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: seconds duration less than rewards amount"
                );
            }
        });
    }
);
