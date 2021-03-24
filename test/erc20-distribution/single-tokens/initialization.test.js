const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { getEvmTimestamp, fastForwardTo } = require("../../utils/network");

const ERC20StakingRewardsDistribution = artifacts.require(
    "ERC20StakingRewardsDistribution"
);
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract(
    "ERC20StakingRewardsDistribution - Single reward/stakable token - Initialization",
    () => {
        let erc20DistributionInstance,
            rewardsTokenInstance,
            stakableTokenInstance,
            ownerAddress,
            firstStakerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            erc20DistributionInstance = await ERC20StakingRewardsDistribution.new();
            rewardsTokenInstance = await FirstRewardERC20.new();
            stakableTokenInstance = await FirstStakableERC20.new();
            ownerAddress = accounts[0];
            firstStakerAddress = accounts[1];
        });

        it("should fail when not called by the owner", async () => {
            try {
                await initializeDistribution({
                    from: firstStakerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [11],
                    duration: 10,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "Ownable: caller is not the owner"
                );
            }
        });

        it("should fail when passing a 0-address rewards token", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [{ address: ZERO_ADDRESS }],
                    rewardAmounts: [10],
                    duration: 10,
                    fund: false,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20StakingRewardsDistribution: 0 address as reward token"
                );
            }
        });

        it("should fail when passing a 0-address stakable token", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: { address: ZERO_ADDRESS },
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [14],
                    duration: 10,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20StakingRewardsDistribution: 0 address as stakable token"
                );
            }
        });

        it("should fail when passing 0 as a rewards amount", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [0],
                    duration: 10,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20StakingRewardsDistribution: no reward"
                );
            }
        });

        it("should fail when passing a lower starting timestamp than the current one", async () => {
            try {
                const currentEvmTimestamp = await getEvmTimestamp();
                await erc20DistributionInstance.initialize(
                    [rewardsTokenInstance.address],
                    stakableTokenInstance.address,
                    [1],
                    currentEvmTimestamp.sub(new BN(10)),
                    currentEvmTimestamp.add(new BN(10)),
                    false,
                    0,
                    { from: ownerAddress }
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20StakingRewardsDistribution: invalid starting timestamp"
                );
            }
        });

        it("should fail when passing the same starting timestamp as the current one", async () => {
            try {
                const currentEvmTimestamp = await getEvmTimestamp();
                await erc20DistributionInstance.initialize(
                    [rewardsTokenInstance.address],
                    stakableTokenInstance.address,
                    [1],
                    currentEvmTimestamp,
                    currentEvmTimestamp.add(new BN(10)),
                    false,
                    0,
                    { from: ownerAddress }
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20StakingRewardsDistribution: invalid starting timestamp"
                );
            }
        });

        it("should fail when passing 0 as seconds duration", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [1],
                    duration: 0,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20StakingRewardsDistribution: invalid time duration"
                );
            }
        });

        it("should succeed in the right conditions", async () => {
            const rewardAmounts = [
                new BN(await toWei(10, rewardsTokenInstance)),
            ];
            const duration = new BN(10);
            const rewardTokens = [rewardsTokenInstance];
            const {
                startingTimestamp,
                endingTimestamp,
            } = await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens,
                rewardAmounts,
                duration,
            });
            await fastForwardTo(startingTimestamp);

            expect(await erc20DistributionInstance.initialized()).to.be.true;
            const onchainRewardTokens = await erc20DistributionInstance.getRewardTokens();
            expect(onchainRewardTokens).to.have.length(rewardTokens.length);
            expect(onchainRewardTokens[0]).to.be.equal(
                rewardsTokenInstance.address
            );
            expect(await erc20DistributionInstance.stakableToken()).to.be.equal(
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
            expect(onchainEndingTimestamp.sub(startingTimestamp)).to.be.equalBn(
                duration
            );
            expect(onchainEndingTimestamp).to.be.equalBn(endingTimestamp);
        });

        it("should fail when trying to initialize a second time", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [2],
                    duration: 2,
                });
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [7],
                    duration: 2,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20StakingRewardsDistribution: already initialized"
                );
            }
        });
    }
);
