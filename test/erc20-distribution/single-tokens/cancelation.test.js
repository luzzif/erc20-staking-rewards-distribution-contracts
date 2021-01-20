const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_BN } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { fastForwardTo, getEvmTimestamp } = require("../../utils/network");

const ERC20StakingRewardsDistribution = artifacts.require("ERC20StakingRewardsDistribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract(
    "ERC20StakingRewardsDistribution - Single reward/stakable token - Cancelation",
    () => {
        let erc20DistributionInstance,
            rewardsTokenInstance,
            stakableTokenInstance,
            ownerAddress,
            stakerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20StakingRewardsDistribution.new({
                from: ownerAddress,
            });
            rewardsTokenInstance = await FirstRewardERC20.new();
            stakableTokenInstance = await FirstStakableERC20.new();
            stakerAddress = accounts[1];
        });

        it("should fail when initialization has not been done", async () => {
            try {
                await erc20DistributionInstance.cancel();
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20StakingRewardsDistribution: not initialized"
                );
            }
        });

        it("should fail when not called by the owner", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [2],
                    duration: 2,
                });
                await erc20DistributionInstance.cancel({ from: stakerAddress });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "Ownable: caller is not the owner"
                );
            }
        });

        it("should fail when the program has already started", async () => {
            try {
                const { startingTimestamp } = await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableToken: stakableTokenInstance,
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [5],
                    duration: 2,
                });
                await fastForwardTo({ timestamp: startingTimestamp });
                await erc20DistributionInstance.cancel({ from: ownerAddress });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20StakingRewardsDistribution: distribution already started"
                );
            }
        });

        it("should succeed in the right conditions", async () => {
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const rewardTokens = [rewardsTokenInstance];
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens,
                rewardAmounts: [rewardsAmount],
                duration: 2,
                // future timestamp
                startingTimestamp: (await getEvmTimestamp()).add(new BN(60)),
            });
            await erc20DistributionInstance.cancel({ from: ownerAddress });

            expect(
                await erc20DistributionInstance.getRewardTokens()
            ).to.have.length(0);
            expect(await erc20DistributionInstance.stakableToken()).to.be.equal(
                "0x0000000000000000000000000000000000000000"
            );
            for (let i = 0; i < rewardTokens.length; i++) {
                const rewardToken = rewardTokens[i];
                expect(
                    await rewardToken.balanceOf(
                        erc20DistributionInstance.address
                    )
                ).to.be.equalBn(ZERO_BN);
                expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                    rewardsAmount
                );
                expect(
                    await erc20DistributionInstance.rewardAmount(
                        rewardToken.address
                    )
                ).to.be.equalBn(ZERO_BN);
                expect(
                    await erc20DistributionInstance.rewardPerSecond(
                        rewardToken.address
                    )
                ).to.be.equalBn(ZERO_BN);
            }
            expect(
                await erc20DistributionInstance.startingTimestamp()
            ).to.be.equalBn(ZERO_BN);
            expect(
                await erc20DistributionInstance.endingTimestamp()
            ).to.be.equalBn(ZERO_BN);
            expect(
                await erc20DistributionInstance.lastConsolidationTimestamp()
            ).to.be.equalBn(ZERO_BN);
            expect(await erc20DistributionInstance.initialized()).to.be.false;
        });

        it("should allow for a second initialization on success", async () => {
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [rewardsAmount],
                duration: 2,
                // far-future timestamp
                startingTimestamp: (await getEvmTimestamp()).add(new BN(60)),
            });
            await erc20DistributionInstance.cancel({ from: ownerAddress });
            // resending funds since the ones sent before have been sent back
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [rewardsAmount],
                duration: 2,
            });
        });
    }
);
