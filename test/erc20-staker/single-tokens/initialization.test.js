const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("../../constants");
const { initializeDistribution, getTestContext } = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { mineBlocks } = require("../../utils/network");

describe("ERC20Staker - Single reward/stakable token - Initialization", () => {
    let erc20StakerInstance,
        rewardsTokenInstance,
        stakableTokenInstance,
        highDecimalsTokenInstance,
        firstStakerAddress,
        ownerAddress;

    beforeEach(async () => {
        const testContext = await getTestContext();
        erc20StakerInstance = testContext.erc20StakerInstance;
        rewardsTokenInstance = testContext.firstRewardsTokenInstance;
        stakableTokenInstance = testContext.stakableTokenInstance;
        firstStakerAddress = testContext.firstStakerAddress;
        ownerAddress = testContext.ownerAddress;
        highDecimalsTokenInstance = testContext.highDecimalsTokenInstance;
    });

    it("should fail when not called by the owner", async () => {
        try {
            await initializeDistribution({
                from: firstStakerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 10,
                startingBlock: 0,
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
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [{ address: ZERO_ADDRESS }],
                rewardAmounts: [1],
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

    it("should fail when passing a 0-address stakable token", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [{ address: ZERO_ADDRESS }],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 10,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: 0 address as stakable token"
            );
        }
    });

    it("should fail when passing 0 as a rewards amount", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [0],
                duration: 10,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: no rewards");
        }
    });

    it("should fail when passing a lower or equal block as the starting one", async () => {
        try {
            await mineBlocks(10);
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 10,
                startingBlock: 0,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: starting block lower or equal than current"
            );
        }
    });

    it("should fail when passing 0 as blocks duration", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 0,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: invalid block duration"
            );
        }
    });

    it("should fail when passing 1 as blocks duration", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 1,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: invalid block duration"
            );
        }
    });

    it("should fail when the rewards amount has not been sent to the contract", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [10],
                duration: 10,
                fund: false,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: funds required");
        }
    });

    it("should fail when the rewards token has more than 18 decimals (avoid overflow)", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [highDecimalsTokenInstance],
                rewardAmounts: [10],
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
        const rewardAmounts = [new BN(await toWei(10, rewardsTokenInstance))];
        const duration = new BN(10);
        const rewardTokens = [rewardsTokenInstance];
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
        expect(onchainRewardTokens).to.have.length(rewardTokens.length);
        expect(onchainRewardTokens[0]).to.be.equal(
            rewardsTokenInstance.address
        );
        const onchainStakableTokens = await erc20StakerInstance.getStakableTokens();
        for (let i = 0; i < stakableTokens.length; i++) {
            expect(onchainStakableTokens[i]).to.be.equal(
                stakableTokens[i].address
            );
        }
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
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
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
