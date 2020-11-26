const { web3 } = require("hardhat");

exports.stopMining = async () => {
    return new Promise((resolve, reject) => {
        web3.eth.currentProvider.send({ method: "miner_stop" }, (error) => {
            if (error) {
                console.log("error stopping instamining");
                return reject(error);
            }
        });
        return resolve();
    });
};

exports.startMining = async () => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({ method: "miner_start" }, (error) => {
            if (error) {
                console.error("error resuming instamining", error);
                return reject(error);
            }
        });
        return resolve();
    });
};

exports.mineBlock = async () => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({ method: "evm_mine" }, (error) => {
            if (error) {
                console.error("error mining a single block", error);
                return reject(error);
            }
        });
        return resolve();
    });
};

exports.mineBlocks = async (amount) => {
    return new Promise((resolve, reject) => {
        for (let i = 0; i < amount; i++) {
            web3.currentProvider.send({ method: "evm_mine" }, (error) => {
                if (error) {
                    console.error(`error mining ${amount} blocks`, error);
                    return reject(error);
                }
            });
        }
        return resolve();
    });
};
