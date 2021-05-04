const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");

const ERC20StakingRewardsDistribution = artifacts.require(
    "ERC20StakingRewardsDistribution"
);
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract(
    "ERC20StakingRewardsDistribution - Multi rewards, single stakable token - Initialization",
    () => {
        let erc20DistributionInstance,
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
            stakableTokenInstance,
            ownerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20StakingRewardsDistribution.new(
                { from: ownerAddress }
            );
            firstRewardsTokenInstance = await FirstRewardERC20.new();
            secondRewardsTokenInstance = await SecondRewardERC20.new();
            stakableTokenInstance = await FirstStakableERC20.new();
        });

        it("should fail when reward tokens/amounts arrays have inconsistent lengths", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
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
                expect(error.message).to.contain("SRD03");
            }
        });

        it("should fail when funding for the first reward token has not been sent to the contract before calling initialize", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
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
                expect(error.message).to.contain("SRD06");
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
                    stakableToken: stakableTokenInstance,
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
                expect(error.message).to.contain("SRD06");
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
                    stakableToken: stakableTokenInstance,
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
                expect(error.message).to.contain("SRD04");
            }
        });

        it("should fail when passing 0 as the first reward amount", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [0, 10],
                    duration: 10,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("SRD05");
            }
        });

        it("should fail when passing 0 as the second reward amount", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [10, 0],
                    duration: 10,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("SRD05");
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
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
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
            const onchainStakableToken = await erc20DistributionInstance.stakableToken();
            expect(onchainStakableToken).to.be.equal(
                stakableTokenInstance.address
            );
            for (let i = 0; i < rewardTokens.length; i++) {
                const rewardAmount = rewardAmounts[i];
                const rewardToken = rewardTokens[i];
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
                    stakableToken: stakableTokenInstance,
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
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [
                        firstRewardsTokenInstance,
                        secondRewardsTokenInstance,
                    ],
                    rewardAmounts: [17, 12],
                    duration: 2,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("SRD18");
            }
        });
    }
);
