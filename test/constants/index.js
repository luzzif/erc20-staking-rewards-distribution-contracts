const { BigNumber } = require("hardhat").ethers;

// Maximum variance allowed between expected values and actual ones.
// Mainly to account for division between integers, and associated rounding.
exports.MAXIMUM_VARIANCE = BigNumber.from(1); // 1 wei
exports.ZERO = BigNumber.from(0);
exports.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
