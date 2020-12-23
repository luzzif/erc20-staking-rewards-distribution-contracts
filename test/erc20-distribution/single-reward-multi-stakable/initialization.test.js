const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");

const ERC20Distribution = artifacts.require("ERC20Distribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");
const SecondStakableERC20 = artifacts.require("SecondStakableERC20");

contract(
    "ERC20Distribution - Multi rewards, multi stakable tokens - Initialization",
    () => {
        let erc20DistributionInstance,
            rewardsTokenInstance,
            firstStakableTokenInstance,
            secondStakableTokenInstance,
            ownerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20Distribution.new({ from: ownerAddress });
            rewardsTokenInstance = await FirstRewardERC20.new();
            firstStakableTokenInstance = await FirstStakableERC20.new();
            secondStakableTokenInstance = await SecondStakableERC20.new();
        });

        it("should fail when the second stakable tokens is the 0 address", async () => {
            try {
                await initializeDistribution({
                    from: ownerAddress,
                    erc20DistributionInstance,
                    stakableTokens: [
                        firstStakableTokenInstance,
                        { address: ZERO_ADDRESS },
                    ],
                    rewardTokens: [rewardsTokenInstance],
                    rewardAmounts: [1],
                    duration: 10,
                    skipRewardTokensAmountsConsistenyCheck: true,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Distribution: 0 address as stakable token"
                );
            }
        });

        it("should succeed in the right conditions", async () => {
            const rewardAmounts = [
                new BN(await toWei(10, rewardsTokenInstance)),
            ];
            const duration = new BN(10);
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
                rewardAmounts,
                duration,
            });

            expect(await erc20DistributionInstance.initialized()).to.be.true;
            const onchainRewardTokens = await erc20DistributionInstance.getRewardTokens();
            expect(onchainRewardTokens).to.have.length(1);
            expect(onchainRewardTokens[0]).to.be.equal(
                rewardsTokenInstance.address
            );
            const onchainStakableTokens = await erc20DistributionInstance.getStakableTokens();
            expect(onchainStakableTokens).to.have.length(2);
            const rewardAmount = rewardAmounts[0];
            const rewardToken = rewardTokens[0];
            expect(
                await erc20DistributionInstance.rewardTokenMultiplier(
                    rewardToken.address
                )
            ).to.be.equalBn(
                new BN(1).mul(new BN(10).pow(await rewardToken.decimals()))
            );
            expect(
                await rewardToken.balanceOf(erc20DistributionInstance.address)
            ).to.be.equalBn(rewardAmount);
            expect(
                await erc20DistributionInstance.rewardAmount(rewardToken.address)
            ).to.be.equalBn(rewardAmount);
            expect(
                await erc20DistributionInstance.rewardPerSecond(rewardToken.address)
            ).to.be.equalBn(new BN(rewardAmount).div(duration));
            const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
            expect(onchainStartingTimestamp).to.be.equalBn(startingTimestamp);
            const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
            expect(
                onchainEndingTimestamp.sub(onchainStartingTimestamp)
            ).to.be.equalBn(duration);
        });
    }
);
