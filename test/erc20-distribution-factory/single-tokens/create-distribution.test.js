const BN = require("bn.js");
const { expect } = require("chai");
const { getEvmTimestamp } = require("../../utils/network");

const ERC20DistributionFactory = artifacts.require("ERC20DistributionFactory");
const ERC20Distribution = artifacts.require("ERC20Distribution");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract("ERC20DistributionFactory - Distribution creation", () => {
    let erc20DistributionFactoryInstance,
        rewardsTokenInstance,
        stakableTokenInstance,
        ownerAddress;

    beforeEach(async () => {
        const accounts = await web3.eth.getAccounts();
        ownerAddress = accounts[0];
        erc20DistributionFactoryInstance = await ERC20DistributionFactory.new({
            from: ownerAddress,
        });
        rewardsTokenInstance = await FirstRewardERC20.new();
        stakableTokenInstance = await FirstStakableERC20.new();
    });

    it("should fail when the caller has not enough reward token", async () => {
        try {
            // 10 seconds from now
            const startingTimestamp = (await getEvmTimestamp()).add(new BN(10));
            await erc20DistributionFactoryInstance.createDistribution(
                [rewardsTokenInstance.address],
                [stakableTokenInstance.address],
                [10],
                startingTimestamp,
                startingTimestamp.add(new BN(10)),
                false
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds balance"
            );
        }
    });

    it("should fail when the caller has enough reward token but no approval was given to the factory contract", async () => {
        try {
            // 10 seconds from now
            const rewardAmount = 10;
            await rewardsTokenInstance.mint(ownerAddress, rewardAmount);
            const startingTimestamp = (await getEvmTimestamp()).add(new BN(10));
            await erc20DistributionFactoryInstance.createDistribution(
                [rewardsTokenInstance.address],
                [stakableTokenInstance.address],
                [rewardAmount],
                startingTimestamp,
                startingTimestamp.add(new BN(10)),
                false
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds allowance"
            );
        }
    });

    it("should succeed when in the right conditions", async () => {
        // 10 seconds from now
        const rewardAmount = 10;
        await rewardsTokenInstance.mint(ownerAddress, rewardAmount);
        await rewardsTokenInstance.approve(
            erc20DistributionFactoryInstance.address,
            rewardAmount,
            { from: ownerAddress }
        );
        const rewardAmounts = [rewardAmount];
        const rewardTokens = [rewardsTokenInstance.address];
        const stakableTokens = [stakableTokenInstance.address];
        const startingTimestamp = (await getEvmTimestamp()).add(new BN(10));
        const endingTimestamp = startingTimestamp.add(new BN(10));
        const locked = false;
        await erc20DistributionFactoryInstance.createDistribution(
            rewardTokens,
            stakableTokens,
            rewardAmounts,
            startingTimestamp,
            endingTimestamp,
            locked
        );
        expect(
            await erc20DistributionFactoryInstance.getDistributionsAmount()
        ).to.be.equalBn(new BN(1));
        const createdDistributionAddress = await erc20DistributionFactoryInstance.distributions(
            0
        );
        const erc20DistributionInstance = await ERC20Distribution.at(
            createdDistributionAddress
        );

        const onchainRewardTokens = await erc20DistributionInstance.getRewardTokens();
        const onchainStakableTokens = await erc20DistributionInstance.getStakableTokens();
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();

        expect(onchainRewardTokens).to.have.length(rewardTokens.length);
        expect(onchainStakableTokens).to.have.length(stakableTokens.length);
        for (let i = 0; i < onchainRewardTokens.length; i++) {
            const token = onchainRewardTokens[i];
            const amount = await erc20DistributionInstance.rewardAmount(token);
            expect(amount.toNumber()).to.be.equal(rewardAmounts[i]);
        }
        expect(onchainStartingTimestamp).to.be.equalBn(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equalBn(endingTimestamp);
    });
});
