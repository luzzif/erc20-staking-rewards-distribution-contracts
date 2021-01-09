const HighDecimalsERC20 = artifacts.require("HighDecimalsERC20");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");
const SecondStakableERC20 = artifacts.require("SecondStakableERC20");
const ERC20StakingRewardsDistribution = artifacts.require("ERC20StakingRewardsDistribution");
const ERC20StakingRewardsDistributionFactory = artifacts.require("ERC20StakingRewardsDistributionFactory");

module.exports = (deployer, network) => {
    if (network === "soliditycoverage") {
        deployer.deploy(ERC20StakingRewardsDistribution);
        deployer.deploy(HighDecimalsERC20);
        deployer.deploy(FirstRewardERC20);
        deployer.deploy(SecondRewardERC20);
        deployer.deploy(FirstStakableERC20);
        deployer.deploy(SecondStakableERC20);
        deployer.deploy(ERC20StakingRewardsDistributionFactory);
    }
};
