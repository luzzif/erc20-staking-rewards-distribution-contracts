require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-ganache");
require("solidity-coverage");

module.exports = {
    solidity: "0.6.12",
    networks: {
        coverage: {
            url: "http://127.0.0.1:7545",
        },
    },
};
