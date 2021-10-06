const { expect, use } = require("chai");
const { ZERO } = require("../../constants");
const { initializeDistribution } = require("../../utils");
const { getEvmTimestamp } = require("../../utils/network");
const { provider, solidity } = require("hardhat").waffle;
const {
    getContractFactory,
    utils: { parseEther },
} = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistribution - Multi rewards, single stakable token - Cancelation", () => {
    const [owner] = provider.getWallets();

    let erc20DistributionFactoryInstance,
        firstRewardsTokenInstance,
        secondRewardsTokenInstance,
        stakableTokenInstance;

    beforeEach(async () => {
        const ERC20StakingRewardsDistribution = await getContractFactory(
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

        const erc20DistributionInstance = await ERC20StakingRewardsDistribution.connect(
            owner
        ).deploy();
        erc20DistributionFactoryInstance = await ERC20StakingRewardsDistributionFactory.connect(
            owner
        ).deploy(erc20DistributionInstance.address);
        firstRewardsTokenInstance = await FirstRewardERC20.deploy();
        secondRewardsTokenInstance = await SecondRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should succeed in the right conditions", async () => {
        const rewardAmounts = [parseEther("10"), parseEther("100")];
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        // if not specified, the distribution starts 10 seconds from
        // now, so we have the time to cancel it
        const { erc20DistributionInstance } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 2,
        });
        await erc20DistributionInstance.cancel({ from: owner.address });
        for (let i = 0; i < rewardTokens.length; i++) {
            const rewardToken = rewardTokens[i];
            const rewardAmount = rewardAmounts[i];
            expect(
                await rewardToken.balanceOf(erc20DistributionInstance.address)
            ).to.be.equal(ZERO);
            expect(await rewardToken.balanceOf(owner.address)).to.be.equal(
                rewardAmount
            );
        }
        expect(await erc20DistributionInstance.initialized()).to.be.true;
        expect(await erc20DistributionInstance.canceled()).to.be.true;
    });

    it("shouldn't allow for a second initialization on success", async () => {
        const rewardAmounts = [parseEther("10"), parseEther("10")];
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        // if not specified, the distribution starts 10 seconds from
        // now, so we have the time to cancel it
        const { erc20DistributionInstance } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 2,
        });
        await erc20DistributionInstance.cancel({ from: owner.address });
        try {
            const currentTimestamp = await getEvmTimestamp();
            await erc20DistributionInstance.initialize(
                rewardTokens.map((token) => token.address),
                stakableTokenInstance.address,
                rewardAmounts,
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

    it("shouldn't allow for a second cancelation on success", async () => {
        const rewardAmounts = [parseEther("10"), parseEther("10")];
        const rewardTokens = [
            firstRewardsTokenInstance,
            secondRewardsTokenInstance,
        ];
        // if not specified, the distribution starts 10 seconds from
        // now, so we have the time to cancel it
        const { erc20DistributionInstance } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens,
            rewardAmounts,
            duration: 2,
        });
        await erc20DistributionInstance.cancel({ from: owner.address });
        try {
            await erc20DistributionInstance.cancel({ from: owner.address });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRD19");
        }
    });
});
