const configuration = {
    contracts_build_directory: "build",
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
            excludeContracts: ["test/TestDependencies.sol"],
        },
    };
}

module.exports = configuration;
