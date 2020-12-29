const configuration = {
    networks: {},
    compilers: {
        solc: {
            version: "^0.6.12",
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 200,
                },
            },
        },
    },
    plugins: ["solidity-coverage"],
};

if (process.argv.indexOf("--gas-report") >= 0) {
    configuration.mocha = {
        reporter: "eth-gas-reporter",
        reporterOptions: {
            currency: "USD",
            excludeContracts: [
                "TestDependencies.sol",
                "DXTokenRegistry.sol",
                "Migrations.sol",
                "FirstRewardERC20.sol",
                "SecondRewardERC20.sol",
                "FirstStakableERC20.sol",
                "SecondStakableERC20.sol",
                "HighDecimalsERC20.sol",
            ],
        },
    };
}

module.exports = configuration;
