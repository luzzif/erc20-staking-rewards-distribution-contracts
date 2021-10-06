const { expect, use } = require("chai");
const { getEvmTimestamp } = require("../../utils/network");
const { provider, solidity } = require("hardhat").waffle;
const { getContractFactory } = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistributionFactory - Distribution creation", () => {
    const [, owner] = provider.getWallets();

    let ERC20StakingRewardsDistribution,
        UpgradedERC20StakingRewardsDistribution,
        erc20DistributionFactoryInstance,
        firstRewardsTokenInstance,
        secondRewardsTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        const ERC20StakingRewardsDistributionFactory = await getContractFactory(
            "ERC20StakingRewardsDistributionFactory"
        );
        ERC20StakingRewardsDistribution = await getContractFactory(
            "ERC20StakingRewardsDistribution"
        );
        UpgradedERC20StakingRewardsDistribution = await getContractFactory(
            "UpgradedERC20StakingRewardsDistribution"
        );
        const FirstRewardERC20 = await getContractFactory("FirstRewardERC20");
        const SecondRewardERC20 = await getContractFactory("SecondRewardERC20");
        const FirstStakableERC20 = await getContractFactory(
            "FirstStakableERC20"
        );

        const implementation = await ERC20StakingRewardsDistribution.deploy();
        erc20DistributionFactoryInstance = await ERC20StakingRewardsDistributionFactory.connect(
            owner
        ).deploy(implementation.address);
        firstRewardsTokenInstance = await FirstRewardERC20.deploy();
        secondRewardsTokenInstance = await SecondRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should fail when the caller has not enough first reward token", async () => {
        try {
            // 10 seconds from now
            const startingTimestamp = (await getEvmTimestamp()).add(10);
            await erc20DistributionFactoryInstance.createDistribution(
                [
                    firstRewardsTokenInstance.address,
                    secondRewardsTokenInstance.address,
                ],
                stakableTokenInstance.address,
                [10, 10],
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

    it("should fail when the caller has enough first reward token, but no approval was set by the owner", async () => {
        try {
            // 10 seconds from now
            const firstRewardAmount = 20;
            await firstRewardsTokenInstance.mint(
                owner.address,
                firstRewardAmount
            );
            // no allowance given
            const startingTimestamp = (await getEvmTimestamp()).add(10);
            await erc20DistributionFactoryInstance
                .connect(owner)
                .createDistribution(
                    [
                        firstRewardsTokenInstance.address,
                        secondRewardsTokenInstance.address,
                    ],
                    stakableTokenInstance.address,
                    [firstRewardAmount, 10],
                    startingTimestamp,
                    startingTimestamp.add(10),
                    false,
                    0
                );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds allowance"
            );
        }
    });

    it("should fail when the caller has not enough second reward token", async () => {
        try {
            // 10 seconds from now
            const firstRewardAmount = 20;
            await firstRewardsTokenInstance.mint(
                owner.address,
                firstRewardAmount
            );
            await firstRewardsTokenInstance
                .connect(owner)
                .approve(
                    erc20DistributionFactoryInstance.address,
                    firstRewardAmount
                );
            const startingTimestamp = (await getEvmTimestamp()).add(10);
            await erc20DistributionFactoryInstance.createDistribution(
                [
                    firstRewardsTokenInstance.address,
                    secondRewardsTokenInstance.address,
                ],
                stakableTokenInstance.address,
                [firstRewardAmount, 10],
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

    it("should fail when the caller has enough second reward token, but no approval was set by the owner", async () => {
        try {
            // 10 seconds from now
            const firstRewardAmount = 20;
            await firstRewardsTokenInstance.mint(
                owner.address,
                firstRewardAmount
            );
            await firstRewardsTokenInstance
                .connect(owner)
                .approve(
                    erc20DistributionFactoryInstance.address,
                    firstRewardAmount
                );
            const secondRewardAmount = 40;
            await secondRewardsTokenInstance.mint(
                owner.address,
                secondRewardAmount
            );
            // no allowance given
            const startingTimestamp = (await getEvmTimestamp()).add(10);
            await erc20DistributionFactoryInstance
                .connect(owner)
                .createDistribution(
                    [
                        firstRewardsTokenInstance.address,
                        secondRewardsTokenInstance.address,
                    ],
                    stakableTokenInstance.address,
                    [firstRewardAmount, secondRewardAmount],
                    startingTimestamp,
                    startingTimestamp.add(10),
                    false,
                    0
                );
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "ERC20: transfer amount exceeds allowance"
            );
        }
    });

    it("should succeed when in the right conditions", async () => {
        const firstRewardAmount = 10;
        await firstRewardsTokenInstance.mint(owner.address, firstRewardAmount);
        await firstRewardsTokenInstance
            .connect(owner)
            .approve(
                erc20DistributionFactoryInstance.address,
                firstRewardAmount
            );

        const secondRewardAmount = 20;
        await secondRewardsTokenInstance.mint(
            owner.address,
            secondRewardAmount
        );
        await secondRewardsTokenInstance
            .connect(owner)
            .approve(
                erc20DistributionFactoryInstance.address,
                secondRewardAmount
            );
        const rewardAmounts = [firstRewardAmount, secondRewardAmount];
        const rewardTokens = [
            firstRewardsTokenInstance.address,
            secondRewardsTokenInstance.address,
        ];
        const startingTimestamp = (await getEvmTimestamp()).add(10);
        const endingTimestamp = startingTimestamp.add(10);
        const locked = false;
        await erc20DistributionFactoryInstance
            .connect(owner)
            .createDistribution(
                rewardTokens,
                stakableTokenInstance.address,
                rewardAmounts,
                startingTimestamp,
                endingTimestamp,
                locked,
                0
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
        const onchainStakableToken = await erc20DistributionInstance.stakableToken();
        const onchainStartingTimestamp = await erc20DistributionInstance.startingTimestamp();
        const onchainEndingTimestamp = await erc20DistributionInstance.endingTimestamp();

        expect(onchainRewardTokens).to.have.length(rewardTokens.length);
        expect(onchainStakableToken).to.be.equal(stakableTokenInstance.address);
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

    it("should succeed when upgrading the implementation (new campaigns must use the new impl, old ones the previous one)", async () => {
        const firstRewardAmount = 20;
        await firstRewardsTokenInstance.mint(owner.address, firstRewardAmount);
        await firstRewardsTokenInstance
            .connect(owner)
            .approve(
                erc20DistributionFactoryInstance.address,
                firstRewardAmount
            );

        const secondRewardAmount = 40;
        await secondRewardsTokenInstance.mint(
            owner.address,
            secondRewardAmount
        );
        await secondRewardsTokenInstance
            .connect(owner)
            .approve(
                erc20DistributionFactoryInstance.address,
                secondRewardAmount
            );
        const rewardAmounts = [firstRewardAmount / 2, secondRewardAmount / 2];
        const rewardTokens = [
            firstRewardsTokenInstance.address,
            secondRewardsTokenInstance.address,
        ];
        const startingTimestamp = (await getEvmTimestamp()).add(10);
        const endingTimestamp = startingTimestamp.add(10);
        const locked = false;
        // proxy 1
        await erc20DistributionFactoryInstance
            .connect(owner)
            .createDistribution(
                rewardTokens,
                stakableTokenInstance.address,
                rewardAmounts,
                startingTimestamp,
                endingTimestamp,
                locked,
                0
            );

        // upgrading implementation
        const upgradedDistribution = await UpgradedERC20StakingRewardsDistribution.deploy();
        await erc20DistributionFactoryInstance
            .connect(owner)
            .upgradeImplementation(upgradedDistribution.address);

        // proxy 2
        await erc20DistributionFactoryInstance
            .connect(owner)
            .createDistribution(
                rewardTokens,
                stakableTokenInstance.address,
                rewardAmounts,
                startingTimestamp,
                endingTimestamp,
                locked,
                0
            );
        expect(
            await erc20DistributionFactoryInstance.getDistributionsAmount()
        ).to.be.equal(2);
        const proxy1Address = await erc20DistributionFactoryInstance.distributions(
            0
        );
        const proxy2Address = await erc20DistributionFactoryInstance.distributions(
            1
        );
        const distribution1Instance = await UpgradedERC20StakingRewardsDistribution.attach(
            proxy1Address
        );
        const distribution2Instance = await UpgradedERC20StakingRewardsDistribution.attach(
            proxy2Address
        );

        try {
            await distribution1Instance.isUpgraded();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("revert");
        }

        expect(await distribution2Instance.isUpgraded()).to.be.true;
    });
});
