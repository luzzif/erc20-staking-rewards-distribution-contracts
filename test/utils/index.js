const BN = require("bn.js");
const { web3 } = require("hardhat");

exports.initializeStaker = async ({
    erc20StakerInstance,
    stakableTokenInstance,
    stakerAddress,
    stakableAmount,
    setAllowance = true,
}) => {
    await stakableTokenInstance.mint(stakerAddress, stakableAmount);
    if (setAllowance) {
        await stakableTokenInstance.approve(
            erc20StakerInstance.address,
            stakableAmount,
            {
                from: stakerAddress,
            }
        );
    }
};

exports.initializeDistribution = async ({
    from,
    erc20Staker,
    stakableToken,
    rewardsToken,
    rewardsAmount,
    duration,
    startingBlock,
    fund = true,
}) => {
    if (fund) {
        await rewardsToken.mint(erc20Staker.address, rewardsAmount);
    }
    // if not specified, the distribution starts from the next block.
    // getBlockNumber returns the number of the last mined block.
    // The next one will contain out initialization transaction, so
    // the starting block has to be 2 blocks from the latest mined block.
    const campaignStartingBlock =
        startingBlock >= 0
            ? startingBlock
            : new BN((await web3.eth.getBlockNumber()) + 2);
    await erc20Staker.initialize(
        rewardsToken.address,
        stakableToken.address,
        rewardsAmount,
        campaignStartingBlock,
        duration,
        { from }
    );
    return campaignStartingBlock;
};

exports.stake = async (
    erc20StakerInstance,
    from,
    amount,
    waitForReceipt = true
) => {
    if (waitForReceipt) {
        await erc20StakerInstance.stake(amount, { from });
        // return the block in which the stake operation was performed
        return new BN(await web3.eth.getBlockNumber());
    } else {
        erc20StakerInstance.stake(amount, { from }).on("receipt", console.log);
        // The transaction will be included in the next block, so we have to add 1
        return new BN((await web3.eth.getBlockNumber()) + 1);
    }
};
