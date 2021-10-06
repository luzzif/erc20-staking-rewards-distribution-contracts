const { expect, use } = require("chai");
const { provider, solidity } = require("hardhat").waffle;
const { getContractFactory } = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistributionFactory - Pause staking", () => {
    const [owner, other] = provider.getWallets();
    let erc20DistributionFactoryInstance, erc20DistributionInstance;

    beforeEach(async () => {
        const ERC20StakingRewardsDistributionFactory = await getContractFactory(
            "ERC20StakingRewardsDistributionFactory",
            owner
        );
        const ERC20StakingRewardsDistribution = await getContractFactory(
            "ERC20StakingRewardsDistribution"
        );

        erc20DistributionInstance = await ERC20StakingRewardsDistribution.deploy();
        erc20DistributionFactoryInstance = await ERC20StakingRewardsDistributionFactory.deploy(
            erc20DistributionInstance.address
        );
    });

    it("should fail when the caller is not the owner", async () => {
        try {
            // by default the first account is used, which is not the owner
            await erc20DistributionFactoryInstance
                .connect(other)
                .pauseStaking();
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain(
                "Ownable: caller is not the owner"
            );
        }
    });

    it("should fail when the owner already paused the staking", async () => {
        await erc20DistributionFactoryInstance.pauseStaking({
            from: owner.address,
        });
        try {
            await erc20DistributionFactoryInstance.pauseStaking({
                from: owner.address,
            });
            throw new Error("should have failed");
        } catch (error) {
            expect(error.message).to.contain("SRF01");
        }
    });

    it("should succeed in the right conditions", async () => {
        expect(await erc20DistributionFactoryInstance.stakingPaused()).to.be
            .false;
        await erc20DistributionFactoryInstance.pauseStaking({
            from: owner.address,
        });
        expect(await erc20DistributionFactoryInstance.stakingPaused()).to.be
            .true;
    });
});
