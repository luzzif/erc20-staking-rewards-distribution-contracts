const BN = require("bn.js");
const {
    getEvmTimestamp,
    stopMining,
    startMining,
    mineBlock,
} = require("./network");

exports.initializeStaker = async ({
    erc20DistributionInstance,
    stakableTokenInstance,
    stakerAddress,
    stakableAmount,
    setAllowance = true,
}) => {
    await stakableTokenInstance.mint(stakerAddress, stakableAmount);
    if (setAllowance) {
        await stakableTokenInstance.approve(
            erc20DistributionInstance.address,
            stakableAmount,
            { from: stakerAddress }
        );
    }
};

exports.initializeDistribution = async ({
    from,
    erc20DistributionInstance,
    stakableTokens,
    rewardTokens,
    rewardAmounts,
    duration,
    startingTimestamp,
    fund = true,
    skipRewardTokensAmountsConsistenyCheck,
}) => {
    if (
        !skipRewardTokensAmountsConsistenyCheck &&
        rewardTokens.length !== rewardAmounts.length
    ) {
        throw new Error("reward tokens and amounts need to be the same length");
    }
    if (fund) {
        for (let i = 0; i < rewardTokens.length; i++) {
            await rewardTokens[i].mint(
                erc20DistributionInstance.address,
                rewardAmounts[i]
            );
        }
    }
    // if not specified, the distribution starts the next 10 second from now
    const currentEvmTimestamp = await getEvmTimestamp();
    const campaignStartingTimestamp =
        startingTimestamp && startingTimestamp.gte(currentEvmTimestamp)
            ? new BN(startingTimestamp)
            : // defaults to 10 seconds in the future
              currentEvmTimestamp.add(new BN(10));
    const campaignEndingTimestamp = campaignStartingTimestamp.add(
        new BN(duration)
    );
    await erc20DistributionInstance.initialize(
        rewardTokens.map((instance) => instance.address),
        stakableTokens.map((instance) => instance.address),
        rewardAmounts,
        campaignStartingTimestamp,
        campaignEndingTimestamp,
        { from }
    );
    return {
        startingTimestamp: campaignStartingTimestamp,
        endingTimestamp: campaignEndingTimestamp,
    };
};

exports.stake = async (
    erc20DistributionInstance,
    from,
    amounts,
    waitForReceipt = true
) => {
    if (waitForReceipt) {
        await erc20DistributionInstance.stake(amounts, { from });
    } else {
        // Make sure the transaction has actually been queued before returning
        return new Promise((resolve, reject) => {
            erc20DistributionInstance
                .stake(amounts, { from })
                .on("transactionHash", resolve)
                .on("error", reject)
                .then(resolve)
                .catch(reject);
        });
    }
};

exports.stakeAtTimestamp = async (
    erc20DistributionInstance,
    from,
    amounts,
    timestamp
) => {
    await stopMining();
    // Make sure the transaction has actually been queued before returning
    await new Promise((resolve, reject) => {
        erc20DistributionInstance
            .stake(amounts, { from })
            .on("transactionHash", resolve)
            .on("error", reject)
            .then(resolve)
            .catch(reject);
    });
    await mineBlock(new BN(timestamp).toNumber());
    await startMining();
};

exports.withdraw = async (
    erc20DistributionInstance,
    from,
    amounts,
    waitForReceipt = true
) => {
    if (waitForReceipt) {
        await erc20DistributionInstance.withdraw(amounts, { from });
        return new BN(await web3.eth.getBlockNumber());
    } else {
        // Make sure the transaction has actually been queued before returning
        return new Promise((resolve, reject) => {
            erc20DistributionInstance
                .withdraw(amounts, { from })
                .on("transactionHash", resolve)
                .on("error", reject)
                .then(resolve)
                .catch(reject);
        });
    }
};

exports.withdrawAtTimestamp = async (
    erc20DistributionInstance,
    from,
    amounts,
    timestamp
) => {
    await stopMining();
    // Make sure the transaction has actually been queued before returning
    await new Promise((resolve, reject) => {
        erc20DistributionInstance
            .withdraw(amounts, { from })
            .on("transactionHash", resolve)
            .on("error", reject)
            .then(resolve)
            .catch(reject);
    });
    await mineBlock(new BN(timestamp).toNumber());
    await startMining();
};
