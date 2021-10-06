const { expect, use } = require("chai");
const { ZERO_ADDRESS } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { getEvmTimestamp, fastForwardTo } = require("../../utils/network");
const { provider, solidity } = require("hardhat").waffle;
const {
    getContractFactory,
    utils: { parseEther },
} = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistribution - Single reward/stakable token - Initialization", () => {
    const [owner] = provider.getWallets();

    let ERC20StakingRewardsDistribution,
        erc20DistributionFactoryInstance,
        rewardsTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        ERC20StakingRewardsDistribution = await getContractFactory(
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

    it("should fail when passing a 0-address rewards token", async () => {
        try {
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.connect(
                owner
            ).deploy();
            await erc20DistributionInstance.initialize(
                [ZERO_ADDRESS],
                stakableTokenInstance.address,
                [10],
                10000000000,
                100000000000,
                false,
                0
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD04");
        }
    });

    it("should fail when passing a 0-address stakable token", async () => {
        try {
            await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: { address: ZERO_ADDRESS },
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [14],
                duration: 10,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD07");
        }
    });

    it("should fail when passing 0 as a rewards amount", async () => {
        try {
            await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [0],
                duration: 10,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD05");
        }
    });

    it("should fail when passing a lower starting timestamp than the current one", async () => {
        try {
            const currentEvmTimestamp = await getEvmTimestamp();
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.connect(
                owner
            ).deploy();
            await erc20DistributionInstance
                .connect(owner)
                .initialize(
                    [rewardsTokenInstance.address],
                    stakableTokenInstance.address,
                    [1],
                    currentEvmTimestamp.sub(10),
                    currentEvmTimestamp.add(10),
                    false,
                    0
                );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD01");
        }
    });

    it("should fail when passing the same starting timestamp as the current one", async () => {
        try {
            const currentEvmTimestamp = await getEvmTimestamp();
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.connect(
                owner
            ).deploy();
            await erc20DistributionInstance
                .connect(owner)
                .initialize(
                    [rewardsTokenInstance.address],
                    stakableTokenInstance.address,
                    [1],
                    currentEvmTimestamp,
                    currentEvmTimestamp.add(10),
                    false,
                    0
                );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD01");
        }
    });

    it("should fail when passing 0 as seconds duration", async () => {
        try {
            await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [1],
                duration: 0,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD02");
        }
    });

    it("should succeed in the right conditions", async () => {
        const rewardAmounts = [parseEther("10")];
        const duration = 10;
        const rewardTokens = [rewardsTokenInstance];
        const {
            startingTimestamp,
            endingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration,
        });
        await fastForwardTo({ timestamp: startingTimestamp });

        expect(await erc20DistributionInstance.initialized()).to.be.true;
        const onchainRewardTokens = await erc20DistributionInstance.getRewardTokens();
        expect(onchainRewardTokens).to.have.length(rewardTokens.length);
        expect(onchainRewardTokens[0]).to.be.equal(
            rewardsTokenInstance.address
        );
        expect(await erc20DistributionInstance.stakableToken()).to.be.equal(
            stakableTokenInstance.address
        );
        for (let i = 0; i < rewardTokens.length; i++) {
            const rewardAmount = rewardAmounts[i];
            const rewardToken = rewardTokens[i];
            expect(
                await rewardToken.balanceOf(erc20DistributionInstance.address)
            ).to.be.equal(rewardAmount);
            expect(
                await erc20DistributionInstance.rewardAmount(
                    rewardToken.address
                )
            ).to.be.equal(rewardAmount);
        }
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        expect(onchainStartingTimestamp).to.be.equal(startingTimestamp);
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();
        expect(onchainEndingTimestamp.sub(startingTimestamp)).to.be.equal(
            duration
        );
        expect(onchainEndingTimestamp).to.be.equal(endingTimestamp);
    });

    it("should fail when trying to initialize a second time", async () => {
        try {
            const { erc20DistributionInstance } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [rewardsTokenInstance],
                rewardAmounts: [2],
                duration: 2,
            });
            await erc20DistributionInstance.initialize(
                [rewardsTokenInstance.address],
                stakableTokenInstance.address,
                [7],
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
});
