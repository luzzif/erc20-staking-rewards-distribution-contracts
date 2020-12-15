const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("../../constants");
const { initializeDistribution, getTestContext } = require("../../utils");
const { toWei } = require("../../utils/conversion");

describe("ERC20Staker - Multi rewards, single stakable token - Initialization", () => {
    let erc20StakerInstance,
        firstRewardsTokenInstance,
        secondRewardsTokenInstance,
        stakableTokenInstance,
        highDecimalsTokenInstance,
        ownerAddress;

    beforeEach(async () => {
        const testContext = await getTestContext();
        erc20StakerInstance = testContext.erc20StakerInstance;
        firstRewardsTokenInstance = testContext.firstRewardsTokenInstance;
        secondRewardsTokenInstance = testContext.secondRewardsTokenInstance;
        stakableTokenInstance = testContext.stakableTokenInstance;
        ownerAddress = testContext.ownerAddress;
        highDecimalsTokenInstance = testContext.highDecimalsTokenInstance;
    });

    it("should fail when reward tokens/amounts arrays have inconsistent lengths", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [1],
                duration: 10,
                skipRewardTokensAmountsConsistenyCheck: true,
                // skip funding to avoid errors that happen before the contract is actually called
                fund: false,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: inconsistent reward token/amount arrays length"
            );
        }
    });

    it("should fail when passing a 0-address second rewards token", async () => {
        try {
            // manual funding to avoid error on zero-address token
            const rewardAmounts = [1, 1];
            await firstRewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardAmounts[0]
            );
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
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
                "ERC20Staker: 0 address as reward token"
            );
        }
    });

    it("should fail when passing 0 as the first reward amount", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [0, 1],
                duration: 10,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: no reward");
        }
    });

    it("should fail when passing 0 as the second reward amount", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [1, 0],
                duration: 10,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: no reward");
        }
    });

    it("should fail when the second rewards amount has not been sent to the contract", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [10, 0],
                duration: 10,
                fund: false,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: funds required");
        }
    });

    it("should fail when the second rewards token has more than 18 decimals (avoid overflow)", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
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
                "ERC20Staker: more than 18 decimals for reward token"
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
        const campaignStartingBlock = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens,
            rewardTokens,
            rewardAmounts,
            duration,
        });

        expect(await erc20StakerInstance.initialized()).to.be.true;
        const onchainRewardTokens = await erc20StakerInstance.getRewardTokens();
        expect(onchainRewardTokens).to.have.length(2);
        expect(onchainRewardTokens[0]).to.be.equal(
            firstRewardsTokenInstance.address
        );
        expect(onchainRewardTokens[1]).to.be.equal(
            secondRewardsTokenInstance.address
        );
        const onchainStakableTokens = await erc20StakerInstance.getStakableTokens();
        expect(onchainStakableTokens).to.have.length(1);
        for (let i = 0; i < rewardTokens.length; i++) {
            const rewardAmount = rewardAmounts[i];
            const rewardToken = rewardTokens[i];
            expect(
                await erc20StakerInstance.rewardTokenMultiplier(
                    rewardToken.address
                )
            ).to.be.equalBn(
                new BN(1).mul(new BN(10).pow(await rewardToken.decimals()))
            );
            expect(
                await rewardToken.balanceOf(erc20StakerInstance.address)
            ).to.be.equalBn(rewardAmount);
            expect(
                await erc20StakerInstance.rewardAmount(rewardToken.address)
            ).to.be.equalBn(rewardAmount);
            expect(
                await erc20StakerInstance.rewardPerBlock(rewardToken.address)
            ).to.be.equalBn(new BN(rewardAmount).div(duration));
        }
        const onchainStartingBlock = await erc20StakerInstance.startingBlock();
        expect(onchainStartingBlock).to.be.equalBn(campaignStartingBlock);
        const onchainEndingBlock = await erc20StakerInstance.endingBlock();
        expect(onchainEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
            duration
        );
    });

    it("should fail when trying to initialize a second time", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [1, 1],
                duration: 2,
            });
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [1, 1],
                duration: 2,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: already initialized"
            );
        }
    });
});
