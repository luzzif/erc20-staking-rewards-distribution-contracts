const ERC20Staker = artifacts.require("ERC20Staker");

module.exports = (deployer) => {
    deployer.deploy(ERC20Staker);
};
