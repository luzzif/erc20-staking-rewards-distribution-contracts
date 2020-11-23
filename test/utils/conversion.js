const { default: BigNumber } = require("bignumber.js");

exports.toWei = async (amount, tokenInstance) => {
    const decimals = await tokenInstance.decimals();
    return new BigNumber(amount).multipliedBy(`1e${decimals}`).toString();
};
