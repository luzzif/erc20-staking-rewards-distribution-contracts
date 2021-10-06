const { expect, use } = require("chai");
const { ZERO_ADDRESS } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { getEvmTimestamp } = require("../../utils/network");
const { provider, solidity } = require("hardhat").waffle;
const {
    getContractFactory,
    utils: { parseEther },
} = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistribution - Multi rewards, single stakable token - Initialization", () => {
    const [, owner] = provider.getWallets();

    let ERC20StakingRewardsDistribution,
        erc20DistributionFactoryInstance,
        firstRewardsTokenInstance,
        secondRewardsTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        ERC20StakingRewardsDistribution = await getContractFactory(
            "ERC20StakingRewardsDistribution"
        );
        const ERC20StakingRewardsDistributionFactory = await getContractFactory(
            "ERC20StakingRewardsDistributionFactory"
        );
        const FirstRewardERC20 = await getContractFactory("FirstRewardERC20");
        const SecondRewardERC20 = await getContractFactory("SecondRewardERC20");
        const FirstStakableERC20 = await getContractFactory(
            "FirstStakableERC20"
        );

        const erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
        erc20DistributionFactoryInstance = await ERC20StakingRewardsDistributionFactory.deploy(
            erc20DistributionInstance.address
        );
        firstRewardsTokenInstance = await FirstRewardERC20.deploy();
        secondRewardsTokenInstance = await SecondRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should fail when reward tokens/amounts arrays have inconsistent lengths", async () => {
        try {
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
            await erc20DistributionInstance.initialize(
                [
                    firstRewardsTokenInstance.address,
                    secondRewardsTokenInstance.address,
                ],
                stakableTokenInstance.address,
                [11],
                100000000000,
                1000000000000,
                false,
                0
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD03");
        }
    });

    it("should fail when funding for the first reward token has not been sent to the contract before calling initialize", async () => {
        try {
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
            await erc20DistributionInstance.initialize(
                [
                    firstRewardsTokenInstance.address,
                    secondRewardsTokenInstance.address,
                ],
                stakableTokenInstance.address,
                [11, 36],
                100000000000,
                1000000000000,
                false,
                0
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD06");
        }
    });

    it("should fail when funding for the second reward token has not been sent to the contract before calling initialize", async () => {
        try {
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
            await firstRewardsTokenInstance.mint(
                erc20DistributionInstance.address,
                11
            );
            await erc20DistributionInstance.initialize(
                [
                    firstRewardsTokenInstance.address,
                    secondRewardsTokenInstance.address,
                ],
                stakableTokenInstance.address,
                [11, 36],
                100000000000,
                1000000000000,
                false,
                0
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD06");
        }
    });

    it("should fail when passing a 0-address second reward token", async () => {
        try {
            const erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
            await firstRewardsTokenInstance.mint(
                erc20DistributionInstance.address,
                11
            );
            await erc20DistributionInstance.initialize(
                [firstRewardsTokenInstance.address, ZERO_ADDRESS],
                stakableTokenInstance.address,
                [11, 36],
                100000000000,
                1000000000000,
                false,
                0
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD04");
        }
    });

    it("should fail when passing 0 as the first reward amount", async () => {
        try {
            await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [0, 10],
                duration: 10,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD05");
        }
    });

    it("should fail when passing 0 as the second reward amount", async () => {
        try {
            await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [10, 0],
                duration: 10,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD05");
        }
    });

    it("should succeed in the right conditions", async () => {
        const rewardAmounts = [parseEther("10"), parseEther("100")];
        const duration = 10;
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        const {
            startingTimestamp,
            erc20DistributionInstance,
        } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration,
        });

        expect(await erc20DistributionInstance.initialized()).to.be.true;
        const onchainRewardTokens = await erc20DistributionInstance.getRewardTokens();
        expect(onchainRewardTokens).to.have.length(2);
        expect(onchainRewardTokens[0]).to.be.equal(
            firstRewardsTokenInstance.address
        );
        expect(onchainRewardTokens[1]).to.be.equal(
            secondRewardsTokenInstance.address
        );
        const onchainStakableToken = await erc20DistributionInstance.stakableToken();
        expect(onchainStakableToken).to.be.equal(stakableTokenInstance.address);
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
        expect(
            onchainEndingTimestamp.sub(onchainStartingTimestamp)
        ).to.be.equal(duration);
    });

    it("should fail when trying to initialize a second time", async () => {
        try {
            const { erc20DistributionInstance } = await initializeDistribution({
                from: owner,
                erc20DistributionFactoryInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [
                    firstRewardsTokenInstance,
                    secondRewardsTokenInstance,
                ],
                rewardAmounts: [11, 14],
                duration: 2,
            });
            const currentTimestamp = await getEvmTimestamp();
            await erc20DistributionInstance.initialize(
                [
                    firstRewardsTokenInstance.address,
                    secondRewardsTokenInstance.address,
                ],
                stakableTokenInstance.address,
                [17, 12],
                currentTimestamp.add(10),
                currentTimestamp.add(20),
                false,
                0
            );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD18");
        }
    });
});
