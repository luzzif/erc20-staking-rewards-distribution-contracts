module.exports = {
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
