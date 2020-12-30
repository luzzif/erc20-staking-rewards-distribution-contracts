const ERC20DistributionFactory = artifacts.require("ERC20DistributionFactory");

module.exports = (deployer) => {
    deployer.deploy(ERC20DistributionFactory);
};
