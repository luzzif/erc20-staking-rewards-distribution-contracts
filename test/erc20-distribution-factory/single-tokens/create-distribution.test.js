const { expect, use } = require("chai");
const { getEvmTimestamp } = require("../../utils/network");
const { provider, solidity } = require("hardhat").waffle;
const { getContractFactory } = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistributionFactory - Distribution creation", () => {
    const [owner] = provider.getWallets();

    let ERC20StakingRewardsDistribution,
        erc20DistributionFactoryInstance,
        erc20DistributionInstance,
        rewardsTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        const ERC20StakingRewardsDistributionFactory = await getContractFactory(
            "ERC20StakingRewardsDistributionFactory"
        );
        ERC20StakingRewardsDistribution = await getContractFactory(
            "ERC20StakingRewardsDistribution"
        );
        const FirstRewardERC20 = await getContractFactory("FirstRewardERC20");
        const FirstStakableERC20 = await getContractFactory(
            "FirstStakableERC20"
        );

        erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
        erc20DistributionFactoryInstance = await ERC20StakingRewardsDistributionFactory.deploy(
            erc20DistributionInstance.address
        );
        rewardsTokenInstance = await FirstRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should fail when the caller has not enough reward token", async () => {
        try {
            // 10 seconds from now
            const startingTimestamp = (await getEvmTimestamp()).add(10);
            await erc20DistributionFactoryInstance.createDistribution(
                [rewardsTokenInstance.address],
                stakableTokenInstance.address,
                [10],
                startingTimestamp,
                startingTimestamp.add(10),
                false,
                0
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
            await rewardsTokenInstance.mint(owner.address, rewardAmount);
            const startingTimestamp = (await getEvmTimestamp()).add(10);
            await erc20DistributionFactoryInstance.createDistribution(
                [rewardsTokenInstance.address],
                stakableTokenInstance.address,
                [rewardAmount],
                startingTimestamp,
                startingTimestamp.add(10),
                false,
                0,
                { from: owner.address }
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
        await rewardsTokenInstance.mint(owner.address, rewardAmount);
        await rewardsTokenInstance.approve(
            erc20DistributionFactoryInstance.address,
            rewardAmount,
            { from: owner.address }
        );
        const rewardAmounts = [rewardAmount];
        const rewardTokens = [rewardsTokenInstance.address];
        const startingTimestamp = (await getEvmTimestamp()).add(10);
        const endingTimestamp = startingTimestamp.add(10);
        const locked = false;
        await erc20DistributionFactoryInstance.createDistribution(
            rewardTokens,
            stakableTokenInstance.address,
            rewardAmounts,
            startingTimestamp,
            endingTimestamp,
            locked,
            0,
            { from: owner.address }
        );
        expect(
            await erc20DistributionFactoryInstance.getDistributionsAmount()
        ).to.be.equal(1);
        const createdDistributionAddress = await erc20DistributionFactoryInstance.distributions(
            0
        );
        const erc20DistributionInstance = await ERC20StakingRewardsDistribution.attach(
            createdDistributionAddress
        );

        const onchainRewardTokens = await erc20DistributionInstance.getRewardTokens();
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();

        expect(onchainRewardTokens).to.have.length(rewardTokens.length);
        expect(await erc20DistributionInstance.stakableToken()).to.be.equal(
            stakableTokenInstance.address
        );
        for (let i = 0; i < onchainRewardTokens.length; i++) {
            const token = onchainRewardTokens[i];
            const amount = await erc20DistributionInstance.rewardAmount(token);
            expect(amount.toNumber()).to.be.equal(rewardAmounts[i]);
        }
        expect(onchainStartingTimestamp).to.be.equal(startingTimestamp);
        expect(onchainEndingTimestamp).to.be.equal(endingTimestamp);
        expect(await erc20DistributionInstance.owner()).to.be.equal(
            owner.address
        );
    });
});
