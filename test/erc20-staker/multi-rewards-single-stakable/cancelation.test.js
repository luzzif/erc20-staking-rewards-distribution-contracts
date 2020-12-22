const { expect } = require("chai");
const { ZERO_BN } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");

const ERC20Staker = artifacts.require("ERC20Staker");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract(
    "ERC20Staker - Multi rewards, single stakable token - Cancelation",
    () => {
        let erc20StakerInstance,
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
            stakableTokenInstance,
            ownerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20StakerInstance = await ERC20Staker.new({ from: ownerAddress });
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
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens,
                rewardAmounts,
                duration: 2,
            });
            await erc20StakerInstance.cancel({ from: ownerAddress });

            expect(await erc20StakerInstance.getRewardTokens()).to.have.length(
                0
            );
            expect(
                await erc20StakerInstance.getStakableTokens()
            ).to.have.length(0);
            for (let i = 0; i < rewardTokens.length; i++) {
                const rewardToken = rewardTokens[i];
                const rewardAmount = rewardAmounts[i];
                expect(
                    await rewardToken.balanceOf(erc20StakerInstance.address)
                ).to.be.equalBn(ZERO_BN);
                expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                    rewardAmount
                );
                expect(
                    await erc20StakerInstance.rewardTokenMultiplier(
                        rewardToken.address
                    )
                ).to.be.equalBn(ZERO_BN);
                expect(
                    await erc20StakerInstance.rewardAmount(rewardToken.address)
                ).to.be.equalBn(ZERO_BN);
                expect(
                    await erc20StakerInstance.rewardPerSecond(
                        rewardToken.address
                    )
                ).to.be.equalBn(ZERO_BN);
            }
            expect(await erc20StakerInstance.startingTimestamp()).to.be.equalBn(
                ZERO_BN
            );
            expect(await erc20StakerInstance.endingTimestamp()).to.be.equalBn(
                ZERO_BN
            );
            expect(
                await erc20StakerInstance.lastConsolidationTimestamp()
            ).to.be.equalBn(ZERO_BN);
            expect(await erc20StakerInstance.initialized()).to.be.false;
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
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens,
                rewardAmounts,
                duration: 2,
            });
            await erc20StakerInstance.cancel({ from: ownerAddress });
            // resending funds since the ones sent before have been sent back
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens,
                rewardAmounts,
                duration: 2,
            });
        });
    }
);
