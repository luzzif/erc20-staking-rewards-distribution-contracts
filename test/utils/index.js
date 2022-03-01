const { ZERO_ADDRESS } = require("../constants");
const {
    getEvmTimestamp,
    stopMining,
    startMining,
    mineBlock,
} = require("./network");
const { provider } = require("hardhat").waffle;
const { getContractFactory, BigNumber } = require("hardhat").ethers;

exports.initializeStaker = async ({
    erc20DistributionInstance,
    stakableTokenInstance,
    staker,
    stakableAmount,
    setAllowance = true,
}) => {
    await stakableTokenInstance.mint(staker.address, stakableAmount);
    if (setAllowance) {
        await stakableTokenInstance
            .connect(staker)
            .approve(erc20DistributionInstance.address, stakableAmount);
    }
};

exports.initializeDistribution = async ({
    from,
    erc20DistributionFactoryInstance,
    stakableToken,
    rewardTokens,
    rewardAmounts,
    duration,
    startingTimestamp,
    fund = true,
    skipRewardTokensAmountsConsistenyCheck,
    locked = false,
    stakingCap = 0,
}) => {
    if (
        !skipRewardTokensAmountsConsistenyCheck &&
        rewardTokens.length !== rewardAmounts.length
    ) {
        throw new Error("reward tokens and amounts need to be the same length");
    }
    if (fund) {
        for (let i = 0; i < rewardTokens.length; i++) {
            // funds are sent directly to the distribution contract (this
            // wouldn't necessarily be needed if using the factory to
            // bootstrap distributions)
            if (rewardTokens[i].address === ZERO_ADDRESS) continue;
            await rewardTokens[i].mint(from.address, rewardAmounts[i]);
            await rewardTokens[i]
                .connect(from)
                .approve(
                    erc20DistributionFactoryInstance.address,
                    rewardAmounts[i]
                );
        }
    }
    // if not specified, the distribution starts the next 10 second from now
    const currentEvmTimestamp = await getEvmTimestamp();
    const campaignStartingTimestamp =
        startingTimestamp && startingTimestamp.gte(currentEvmTimestamp)
            ? BigNumber.from(startingTimestamp)
            : // defaults to 30 seconds in the future
              currentEvmTimestamp.add(10);
    const campaignEndingTimestamp = campaignStartingTimestamp.add(duration);
    await erc20DistributionFactoryInstance.connect(from).createDistribution(
        rewardTokens.map((instance) => instance.address),
        stakableToken.address,
        rewardAmounts,
        campaignStartingTimestamp,
        campaignEndingTimestamp,
        locked,
        stakingCap
    );
    return {
        erc20DistributionInstance: (
            await getContractFactory("ERC20StakingRewardsDistribution", from)
        ).attach(
            await erc20DistributionFactoryInstance.distributions(
                (await erc20DistributionFactoryInstance.getDistributionsAmount()) -
                    1
            )
        ),
        startingTimestamp: campaignStartingTimestamp,
        endingTimestamp: campaignEndingTimestamp,
    };
};

exports.initializeStandaloneDistribution = async ({
    from,
    stakableToken,
    rewardTokens,
    rewardAmounts,
    duration,
    startingTimestamp,
    fund = true,
    skipRewardTokensAmountsConsistenyCheck,
    locked = false,
    stakingCap = 0,
}) => {
    if (
        !skipRewardTokensAmountsConsistenyCheck &&
        rewardTokens.length !== rewardAmounts.length
    ) {
        throw new Error("reward tokens and amounts need to be the same length");
    }
    const distributionInstanceFactory = await getContractFactory(
        "StandaloneERC20StakingRewardsDistribution",
        from
    );
    const distributionInstance = await distributionInstanceFactory.deploy();
    if (fund) {
        for (let i = 0; i < rewardTokens.length; i++) {
            // funds are sent directly to the distribution contract (this
            // wouldn't necessarily be needed if using the factory to
            // bootstrap distributions)
            if (rewardTokens[i].address === ZERO_ADDRESS) continue;
            await rewardTokens[i].mint(from.address, rewardAmounts[i]);
            await rewardTokens[i].approve(
                distributionInstance.address,
                rewardAmounts[i]
            );
        }
    }
    // if not specified, the distribution starts the next 10 second from now
    const currentEvmTimestamp = await getEvmTimestamp();
    const campaignStartingTimestamp =
        startingTimestamp && startingTimestamp.gte(currentEvmTimestamp)
            ? BigNumber.from(startingTimestamp)
            : // defaults to 10 seconds in the future
              currentEvmTimestamp.add(10);
    const campaignEndingTimestamp = campaignStartingTimestamp.add(duration);
    await distributionInstance.initialize(
        rewardTokens.map((instance) => instance.address),
        stakableToken.address,
        rewardAmounts,
        campaignStartingTimestamp,
        campaignEndingTimestamp,
        locked,
        stakingCap
    );
    return {
        erc20DistributionInstance: distributionInstance,
        startingTimestamp: campaignStartingTimestamp,
        endingTimestamp: campaignEndingTimestamp,
    };
};

exports.initializeDistributionFromFactory = async ({
    from,
    erc20DistributionFactoryInstance,
    stakableToken,
    rewardTokens,
    rewardAmounts,
    duration,
    startingTimestamp,
    fund = true,
    skipRewardTokensAmountsConsistenyCheck,
    locked = false,
    stakingCap = 0,
}) => {
    if (
        !skipRewardTokensAmountsConsistenyCheck &&
        rewardTokens.length !== rewardAmounts.length
    ) {
        throw new Error("reward tokens and amounts need to be the same length");
    }
    if (fund) {
        for (let i = 0; i < rewardTokens.length; i++) {
            await rewardTokens[i].mint(from, rewardAmounts[i]);
            await rewardTokens[i].approve(
                erc20DistributionFactoryInstance.address,
                rewardAmounts[i]
            );
        }
    }
    // if not specified, the distribution starts the next 10 second from now
    const currentEvmTimestamp = await getEvmTimestamp();
    const campaignStartingTimestamp =
        startingTimestamp && startingTimestamp.gte(currentEvmTimestamp)
            ? BigNumber.from(startingTimestamp)
            : // defaults to 10 seconds in the future
              currentEvmTimestamp.add(10);
    const campaignEndingTimestamp = campaignStartingTimestamp.add(duration);
    await erc20DistributionFactoryInstance.createDistribution(
        rewardTokens.map((instance) => instance.address),
        stakableToken.address,
        rewardAmounts,
        campaignStartingTimestamp,
        campaignEndingTimestamp,
        locked,
        stakingCap,
        { from }
    );
    return {
        initializedErc20DistributionInstance: (
            await getContractFactory("ERC20StakingRewardsDistribution", from)
        ).attach(
            await erc20DistributionFactoryInstance.distributions(
                (await erc20DistributionFactoryInstance.getDistributionsAmount()) -
                    1
            )
        ),
        startingTimestamp: campaignStartingTimestamp,
        endingTimestamp: campaignEndingTimestamp,
    };
};

exports.stake = async (
    erc20DistributionInstance,
    from,
    amount,
    waitForReceipt = true
) => {
    const transaction = await erc20DistributionInstance
        .connect(from)
        .stake(amount);
    if (waitForReceipt) {
        await transaction.wait();
    }
};

exports.stakeAtTimestamp = async (
    erc20DistributionInstance,
    from,
    amount,
    timestamp
) => {
    await stopMining();
    // Make sure the transaction has actually been queued before returning
    const transaction = await erc20DistributionInstance
        .connect(from)
        .stake(amount);
    try {
        await mineBlock(timestamp);
        await transaction.wait();
    } catch (error) {
        const receipt = await provider.getTransactionReceipt(transaction.hash);
        if (!receipt.status) {
            await provider.call({
                ...(await provider.getTransaction(transaction.hash)),
                gasPrice: undefined,
                maxFeePerGas: undefined,
                maxPriorityFeePerGas: undefined,
            });
        }
    } finally {
        await startMining();
    }
};

exports.withdraw = async (
    erc20DistributionInstance,
    from,
    amount,
    waitForReceipt = true
) => {
    const transaction = await erc20DistributionInstance
        .connect(from)
        .withdraw(amount);
    if (waitForReceipt) {
        await transaction.wait();
    }
};

exports.withdrawAtTimestamp = async (
    erc20DistributionInstance,
    from,
    amount,
    timestamp
) => {
    await stopMining();
    // Make sure the transaction has actually been queued before returning
    const transaction = await erc20DistributionInstance
        .connect(from)
        .withdraw(amount);
    try {
        await mineBlock(timestamp);
        await transaction.wait();
    } catch (error) {
        const receipt = await provider.getTransactionReceipt(transaction.hash);
        if (!receipt.status) {
            await provider.call({
                ...(await provider.getTransaction(transaction.hash)),
                gasPrice: undefined,
                maxFeePerGas: undefined,
                maxPriorityFeePerGas: undefined,
            });
        }
    } finally {
        await startMining();
    }
};

exports.claimAllAtTimestamp = async (
    erc20DistributionInstance,
    from,
    recipient,
    timestamp
) => {
    await stopMining();
    // Make sure the transaction has actually been queued before returning
    const transaction = await erc20DistributionInstance
        .connect(from)
        .claimAll(recipient);
    try {
        await mineBlock(timestamp);
        await transaction.wait();
    } catch (error) {
        const receipt = await provider.getTransactionReceipt(transaction.hash);
        if (!receipt.status) {
            await provider.call({
                ...(await provider.getTransaction(transaction.hash)),
                gasPrice: undefined,
                maxFeePerGas: undefined,
                maxPriorityFeePerGas: undefined,
            });
        }
    } finally {
        await startMining();
    }
};
