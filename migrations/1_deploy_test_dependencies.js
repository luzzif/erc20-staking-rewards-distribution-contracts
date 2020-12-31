const HighDecimalsERC20 = artifacts.require("HighDecimalsERC20");
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");
const SecondStakableERC20 = artifacts.require("SecondStakableERC20");
const ERC20Distribution = artifacts.require("ERC20Distribution");
const ERC20DistributionFactory = artifacts.require("ERC20DistributionFactory");

module.exports = (deployer, network) => {
    if (network === "soliditycoverage") {
        deployer.deploy(ERC20Distribution);
        deployer.deploy(HighDecimalsERC20);
        deployer.deploy(FirstRewardERC20);
        deployer.deploy(SecondRewardERC20);
        deployer.deploy(FirstStakableERC20);
        deployer.deploy(SecondStakableERC20);
        deployer.deploy(ERC20DistributionFactory);
    }
};
