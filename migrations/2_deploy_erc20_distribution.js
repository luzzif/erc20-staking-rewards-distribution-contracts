const ERC20Distribution = artifacts.require("ERC20Distribution");

module.exports = (deployer) => {
    deployer.deploy(ERC20Distribution);
};
