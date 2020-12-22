const BN = require("bn.js");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { toWei } = require("../../utils/conversion");
const { getEvmTimestamp, fastForwardTo } = require("../../utils/network");

const ERC20Staker = artifacts.require("ERC20Staker");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");
const HighDecimalsERC20 = artifacts.require("HighDecimalsERC20");

contract("ERC20Staker - Single reward/stakable token - Initialization", () => {
    let erc20StakerInstance,
        rewardsTokenInstance,
        stakableTokenInstance,
        highDecimalsTokenInstance,
        ownerAddress,
        firstStakerAddress;

    beforeEach(async () => {
        const accounts = await web3.eth.getAccounts();
        erc20StakerInstance = await ERC20Staker.new();
        rewardsTokenInstance = await FirstRewardERC20.new();
        stakableTokenInstance = await FirstStakableERC20.new();
        highDecimalsTokenInstance = await HighDecimalsERC20.new();
        ownerAddress = accounts[0];
        firstStakerAddress = accounts[1];
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
            expect(error.message).to.contain("ERC20Staker: no reward");
        }
    });

    it("should fail when passing a lower starting timestamp than the current one", async () => {
        try {
            const currentEvmTimestamp = await getEvmTimestamp();
            await erc20StakerInstance.initialize(
                [rewardsTokenInstance.address],
                [stakableTokenInstance.address],
                [1],
                currentEvmTimestamp.sub(new BN(10)),
                currentEvmTimestamp.add(new BN(10)),
                { from: ownerAddress }
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: starting timestamp lower or equal than current"
            );
        }
    });

    it("should fail when passing the same starting timestamp as the current one", async () => {
        try {
            const currentEvmTimestamp = await getEvmTimestamp();
            await erc20StakerInstance.initialize(
                [rewardsTokenInstance.address],
                [stakableTokenInstance.address],
                [1],
                currentEvmTimestamp,
                currentEvmTimestamp.add(new BN(10)),
                { from: ownerAddress }
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20Staker: starting timestamp lower or equal than current"
            );
        }
    });

    it("should fail when passing 0 as seconds duration", async () => {
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
                "ERC20Staker: invalid time duration"
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

    it("should fail when the rewards token has more than 18 decimals (avoids possible overflow)", async () => {
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
        const {
            startingTimestamp,
            endingTimestamp,
        } = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens,
            rewardTokens,
            rewardAmounts,
            duration,
        });
        await fastForwardTo(startingTimestamp);

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
                await erc20StakerInstance.rewardPerSecond(rewardToken.address)
            ).to.be.equalBn(new BN(rewardAmount).div(duration));
        }
        const onchainStartingTimestamp = await erc20StakerInstance.startingTimestamp();
        expect(onchainStartingTimestamp).to.be.equalBn(startingTimestamp);
        const onchainEndingTimestamp = await erc20StakerInstance.endingTimestamp();
        expect(onchainEndingTimestamp.sub(startingTimestamp)).to.be.equalBn(
            duration
        );
        expect(onchainEndingTimestamp).to.be.equalBn(endingTimestamp);
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
