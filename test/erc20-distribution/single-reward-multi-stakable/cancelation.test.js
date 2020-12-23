const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_BN } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { getEvmTimestamp } = require("../../utils/network");

const ERC20Distribution = artifacts.require("ERC20Distribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");
const SecondStakableERC20 = artifacts.require("SecondStakableERC20");

contract(
    "ERC20Distribution - Single reward, multi stakable tokens - Cancelation",
    () => {
        let erc20DistributionInstance,
            rewardsTokenInstance,
            firstStakableTokenInstance,
            secondStakableTokenInstance,
            ownerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20Distribution.new({
                from: ownerAddress,
            });
            rewardsTokenInstance = await FirstRewardERC20.new();
            firstStakableTokenInstance = await FirstStakableERC20.new();
            secondStakableTokenInstance = await SecondStakableERC20.new();
        });

        it("should succeed in the right conditions", async () => {
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            const rewardTokens = [rewardsTokenInstance];
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
            expect(
                await erc20DistributionInstance.getStakableTokens()
            ).to.have.length(0);
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
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
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
                stakableTokens: [
                    firstStakableTokenInstance,
                    secondStakableTokenInstance,
                ],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [rewardsAmount],
                duration: 2,
            });
            expect(
                await erc20DistributionInstance.getRewardTokens()
            ).to.have.length(1);
            expect(
                await erc20DistributionInstance.getStakableTokens()
            ).to.have.length(2);
        });
    }
);
