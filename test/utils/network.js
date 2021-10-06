const { provider } = require("hardhat").waffle;
const { BigNumber } = require("hardhat").ethers;

const getEvmTimestamp = async () => {
    const { timestamp } = await provider.getBlock("latest");
    return BigNumber.from(timestamp);
};
exports.getEvmTimestamp = getEvmTimestamp;

exports.stopMining = async () => {
    await provider.send("evm_setAutomine", [false]);
};

exports.startMining = async () => {
    await provider.send("evm_setAutomine", [true]);
};

const mineBlock = async (timestamp) => {
    await provider.send("evm_mine", timestamp ? [timestamp.toNumber()] : []);
};
exports.mineBlock = mineBlock;

exports.fastForwardTo = async ({ timestamp, mineBlockAfter = true }) => {
    const evmTimestamp = await getEvmTimestamp();
    const secondsInterval = BigNumber.from(timestamp)
        .sub(evmTimestamp)
        .toNumber();
    await provider.send("evm_increaseTime", [secondsInterval]);
    if (mineBlockAfter) {
        // mining a block persists the increased time on-chain. This lets us fetch the current EVM
        // timestamp by querying the last mined block and taking its timestamp.
        try {
            await mineBlock();
        } catch (error) {
            console.error("error mining block after fast forwarding", error);
        }
    }
};
