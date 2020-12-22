const { expect } = require("chai");
const {
    initializeDistribution,
    initializeStaker,
    stakeAtTimestamp,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { fastForwardTo, mineBlock } = require("../../utils/network");

const ERC20Staker = artifacts.require("ERC20Staker");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract("ERC20Staker - Single reward/stakable token - Staking", () => {
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
            await erc20StakerInstance.stake([0]);
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: not initialized");
        }
    });

    it("should fail when program has not yet started", async () => {
        try {
            await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await erc20StakerInstance.stake([2], { from: stakerAddress });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("ERC20Staker: not started");
        }
    });

    it("should fail when the staker has not enough balance", async () => {
        try {
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await mineBlock(startingTimestamp);
            await erc20StakerInstance.stake([100], { from: stakerAddress });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds balance"
            );
        }
    });

    it("should fail when no allowance was set by the staker", async () => {
        try {
            await stakableTokenInstance.mint(stakerAddress, 1);
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await mineBlock(startingTimestamp);
            await erc20StakerInstance.stake([1], { from: stakerAddress });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds allowance"
            );
        }
    });

    it("should fail when not enough allowance was set by the staker", async () => {
        try {
            await stakableTokenInstance.mint(stakerAddress, 1);
            await stakableTokenInstance.approve(
                erc20StakerInstance.address,
                1,
                { from: stakerAddress }
            );
            // mint additional tokens to the staker for which we
            // don't set the correct allowance
            await stakableTokenInstance.mint(stakerAddress, 1);
            const { startingTimestamp } = await initializeDistribution({
                from: ownerAddress,
                erc20Staker: erc20StakerInstance,
                stakableTokens: [stakableTokenInstance],
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 2,
            });
            await mineBlock(startingTimestamp);
            await erc20StakerInstance.stake([2], { from: stakerAddress });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds allowance"
            );
        }
    });

    it("should succeed in the right conditions", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: stakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardTokens = [rewardsTokenInstance];
        const stakableTokens = [stakableTokenInstance];
        const { startingTimestamp } = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens,
            rewardTokens,
            rewardAmounts: [await toWei(1, rewardsTokenInstance)],
            duration: 2,
        });
        await fastForwardTo({ timestamp: startingTimestamp });
        await stakeAtTimestamp(
            erc20StakerInstance,
            stakerAddress,
            [stakedAmount],
            startingTimestamp
        );
        for (let i = 0; i < rewardTokens.length; i++) {
            const stakableToken = stakableTokens[i];
            expect(
                await erc20StakerInstance.stakedTokensOf(
                    stakerAddress,
                    stakableToken.address
                )
            ).to.be.equalBn(stakedAmount);
            expect(
                await erc20StakerInstance.stakedTokenAmount(
                    stakableToken.address
                )
            ).to.be.equalBn(stakedAmount);
        }
        expect(
            await erc20StakerInstance.totalStakedTokensAmount()
        ).to.be.equalBn(stakedAmount);
    });
});
