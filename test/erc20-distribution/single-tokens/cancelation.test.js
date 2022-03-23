const { expect, use } = require("chai");
const { ZERO } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { fastForwardTo, getEvmTimestamp } = require("../../utils/network");
const { provider, solidity } = require("hardhat").waffle;
const {
    getContractFactory,
    utils: { parseEther },
} = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistribution - Single reward/stakable token - Cancelation", () => {
    const [owner, staker] = provider.getWallets();

    let erc20DistributionFactoryInstance,
        rewardsTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        const ERC20StakingRewardsDistribution = await getContractFactory(
            "ERC20StakingRewardsDistribution"
        );
        const ERC20StakingRewardsDistributionFactory = await getContractFactory(
            "ERC20StakingRewardsDistributionFactory"
        );
        const FirstRewardERC20 = await getContractFactory("FirstRewardERC20");
        const FirstStakableERC20 = await getContractFactory(
            "FirstStakableERC20"
        );

        const erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
        erc20DistributionFactoryInstance = await ERC20StakingRewardsDistributionFactory.deploy(
            erc20DistributionInstance.address
        );
        rewardsTokenInstance = await FirstRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should fail when initialization has not been done", async () => {
        try {
            // initializing now sets the owner
            const { erc20DistributionInstance } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [2],
                duration: 2,
            });
            // canceling deinitializes the distribution
            await erc20DistributionInstance.connect(owner).cancel();
            await erc20DistributionInstance.connect(owner).cancel();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD19");
        }
    });

    it("should fail when not called by the owner", async () => {
        try {
            const { erc20DistributionInstance } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [2],
                duration: 2,
            });
            await erc20DistributionInstance.connect(staker).cancel();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD17");
        }
    });

    it("should fail when the program has already started", async () => {
        try {
            const {
                startingTimestamp,
                erc20DistributionInstance,
            } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [5],
                duration: 2,
            });
            await fastForwardTo({ timestamp: startingTimestamp });
            await erc20DistributionInstance.connect(owner).cancel();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD08");
        }
    });

    it("should succeed in the right conditions", async () => {
        const rewardsAmount = parseEther("100");
        const rewardTokens = [rewardsTokenInstance];
        const { erc20DistributionInstance } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts: [rewardsAmount],
            duration: 2,
            // future timestamp
            startingTimestamp: (await getEvmTimestamp()).add(60),
        });
        await erc20DistributionInstance.connect(owner).cancel();
        for (let i = 0; i < rewardTokens.length; i++) {
            const rewardToken = rewardTokens[i];
            expect(
                await rewardToken.balanceOf(erc20DistributionInstance.address)
            ).to.be.equal(rewardsAmount);
            expect(await rewardToken.balanceOf(owner.address)).to.be.equal(
                ZERO
            );
            expect(
                await erc20DistributionInstance.rewardAmount(
                    rewardToken.address
                )
            ).to.be.equal(rewardsAmount);
        }
        expect(await erc20DistributionInstance.initialized()).to.be.true;
        expect(await erc20DistributionInstance.canceled()).to.be.true;
    });

    it("shouldn't allow for a second initialization on success", async () => {
        const rewardsAmount = parseEther("100");
        const { erc20DistributionInstance } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 2,
            // far-future timestamp
            startingTimestamp: (await getEvmTimestamp()).add(60),
        });
        await erc20DistributionInstance.connect(owner).cancel();
        try {
            await erc20DistributionInstance.initialize(
                [rewardsTokenInstance.address],
                stakableTokenInstance.address,
                [rewardsAmount],
                1000000000000,
                10000000000000,
                false,
                0
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD18");
        }
    });

    it("shouldn't allow for a second cancelation on success", async () => {
        const rewardsAmount = parseEther("100");
        const { erc20DistributionInstance } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 2,
            // far-future timestamp
            startingTimestamp: (await getEvmTimestamp()).add(60),
        });
        await erc20DistributionInstance.connect(owner).cancel();
        try {
            await erc20DistributionInstance.connect(owner).cancel();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD19");
        }
    });
});
