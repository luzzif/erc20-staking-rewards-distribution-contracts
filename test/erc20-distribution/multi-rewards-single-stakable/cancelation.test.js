const { expect } = require("chai");
const { ZERO_BN } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");

const ERC20Distribution = artifacts.require("ERC20Distribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract(
    "ERC20Distribution - Multi rewards, single stakable token - Cancelation",
    () => {
        let erc20DistributionInstance,
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
            stakableTokenInstance,
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
        });

        it("should succeed in the right conditions", async () => {
            const rewardAmounts = [
                await toWei(10, firstRewardsTokenInstance),
                await toWei(100, secondRewardsTokenInstance),
            ];
            const rewardTokens = [
                firstRewardsTokenInstance,
                secondRewardsTokenInstance,
            ];
            // if not specified, the distribution starts 10 seconds from
            // now, so we have the time to cancel it
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens,
                rewardAmounts,
                duration: 2,
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
                const rewardAmount = rewardAmounts[i];
                expect(
                    await rewardToken.balanceOf(
                        erc20DistributionInstance.address
                    )
                ).to.be.equalBn(ZERO_BN);
                expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                    rewardAmount
                );
                expect(
                    await erc20DistributionInstance.rewardTokenMultiplier(
                        rewardToken.address
                    )
                ).to.be.equalBn(ZERO_BN);
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
            const rewardAmounts = [
                await toWei(10, firstRewardsTokenInstance),
                await toWei(10, firstRewardsTokenInstance),
            ];
            const rewardTokens = [
                firstRewardsTokenInstance,
                secondRewardsTokenInstance,
            ];
            // if not specified, the distribution starts 10 seconds from
            // now, so we have the time to cancel it
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens,
                rewardAmounts,
                duration: 2,
            });
            await erc20DistributionInstance.cancel({ from: ownerAddress });
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens,
                rewardAmounts,
                duration: 2,
            });
        });
    }
);
