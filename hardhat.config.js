const { config } = require("dotenv");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("./tasks/deploy-standalone");

config();

const infuraId = process.env.INFURA_ID;
const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const hardhatConfig = {
    networks: {
        mainnet: {
            url: `https://mainnet.infura.io/v3/${infuraId}`,
        },
        rinkeby: {
            url: `https://rinkeby.infura.io/v3/${infuraId}`,
            accounts,
        },
        xdai: {
            url: "https://rpc.xdaichain.com/",
            accounts,
            gasPrice: 1000000000,
        },
    },
    solidity: {
        compilers: [
            {
                version: "0.8.12",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    gasReporter: {
        currency: "USD",
        enabled: process.env.GAS_REPORT_ENABLED === "true",
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
};

module.exports = hardhatConfig;
