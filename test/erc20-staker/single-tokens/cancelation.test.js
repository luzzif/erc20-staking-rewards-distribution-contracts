const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_BN } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { fastForwardTo, getEvmTimestamp } = require("../../utils/network");

const ERC20Staker = artifacts.require("ERC20Staker");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract("ERC20Staker - Single reward/stakable token - Cancelation", () => {
    let erc20StakerInstance,
        rewardsTokenInstance,
        stakableTokenInstance,
        ownerAddress,
        stakerAddress;

    beforeEach(async () => {
        const accounts = await web3.eth.getAccounts();
        ownerAddress = accounts[0];
        erc20StakerInstance = await ERC20Staker.new({ from: ownerAddress });
        rewardsTokenInstance = await FirstRewardERC20.new();
        stakableTokenInstance = await FirstStakableERC20.new();
        stakerAddress = accounts[1];
    });

    it("should fail when initialization has not been done", async () => {
        try {
            await erc20StakerInstance.cancel();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: not initialized");
        }
    });

    it("should fail when not called by the owner", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await erc20StakerInstance.cancel({ from: stakerAddress });
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
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await erc20StakerInstance.cancel({ from: ownerAddress });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: distribution already started"
            );
        }
    });

    it("should succeed in the right conditions", async () => {
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const rewardTokens = [rewardsTokenInstance];
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens,
            rewardAmounts: [rewardsAmount],
            duration: 2,
            // future timestamp
            startingTimestamp: (await getEvmTimestamp()).add(new BN(60)),
        });
        await erc20StakerInstance.cancel({ from: ownerAddress });

        expect(await erc20StakerInstance.getRewardTokens()).to.have.length(0);
        expect(await erc20StakerInstance.getStakableTokens()).to.have.length(0);
        for (let i = 0; i < rewardTokens.length; i++) {
            const rewardToken = rewardTokens[i];
            expect(
                await rewardToken.balanceOf(erc20StakerInstance.address)
            ).to.be.equalBn(ZERO_BN);
            expect(await rewardToken.balanceOf(ownerAddress)).to.be.equalBn(
                rewardsAmount
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
                await erc20StakerInstance.rewardPerSecond(rewardToken.address)
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
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 2,
            // far-future timestamp
            startingTimestamp: (await getEvmTimestamp()).add(new BN(60)),
        });
        await erc20StakerInstance.cancel({ from: ownerAddress });
        // resending funds since the ones sent before have been sent back
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 2,
        });
    });
});
