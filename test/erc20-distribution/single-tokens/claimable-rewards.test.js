const { expect, use } = require("chai");
const { initializeDistribution } = require("../../utils");
const { provider, solidity } = require("hardhat").waffle;
const { getContractFactory } = require("hardhat").ethers;

use(solidity);

describe("ERC20StakingRewardsDistribution - Single reward/stakable token - Get claimable rewards", () => {
    const [owner, firstStaker] = provider.getWallets();

    let ERC20StakingRewardsDistribution,
        erc20DistributionFactoryInstance,
        firstRewardTokenInstance,
        secondRewardTokenInstance,
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
        firstRewardTokenInstance = await FirstRewardERC20.deploy();
        secondRewardTokenInstance = await SecondRewardERC20.deploy();
        stakableTokenInstance = await FirstStakableERC20.deploy();
    });

    it("should give an empty array back when the distribution has not been initialized yet", async () => {
        const erc20DistributionInstance = await ERC20StakingRewardsDistribution.connect(
            owner
        ).deploy();
        const claimableRewards = await erc20DistributionInstance.claimableRewards(
            firstStaker.address
        );
        expect(claimableRewards).to.have.length(0);
    });

    it("should give an array back with length 1 when the distribution has been initialized with 1 reward token but not yet started", async () => {
        const { erc20DistributionInstance } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance],
            rewardAmounts: ["10"],
            duration: 10,
        });
        const claimableRewards = await erc20DistributionInstance.claimableRewards(
            firstStaker.address
        );
        expect(claimableRewards).to.have.length(1);
        expect(claimableRewards[0]).to.be.equal(0);
    });

    it("should give an array back with length 2 when the distribution has been initialized with 2 reward token but not yet started", async () => {
        const { erc20DistributionInstance } = await initializeDistribution({
            from: owner,
            erc20DistributionFactoryInstance,
            stakableToken: stakableTokenInstance,
            rewardTokens: [firstRewardTokenInstance, secondRewardTokenInstance],
            rewardAmounts: ["10", "1"],
            duration: 10,
        });
        const claimableRewards = await erc20DistributionInstance.claimableRewards(
            firstStaker.address
        );
        expect(claimableRewards).to.have.length(2);
        expect(claimableRewards[0]).to.be.equal(0);
        expect(claimableRewards[1]).to.be.equal(0);
    });
});
