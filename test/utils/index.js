const BN = require("bn.js");
const { web3 } = require("hardhat");
const { artifacts } = require("hardhat");

const ERC20Staker = artifacts.require("ERC20Staker.sol");
const ERC20PresetMinterPauser = artifacts.require(
    "ERC20PresetMinterPauser.json"
);
const HighDecimalsERC20 = artifacts.require("HighDecimalsERC20.json");

exports.getTestContext = async () => {
    const [
        firstStakerAddress,
        ownerAddress,
        secondStakerAddress,
        thirdStakerAddress,
    ] = await web3.eth.getAccounts();

    return {
        erc20StakerInstance: await ERC20Staker.new({
            from: ownerAddress,
        }),
        firstRewardsTokenInstance: await ERC20PresetMinterPauser.new(
            "Rewards token 1",
            "REW1"
        ),
        secondRewardsTokenInstance: await ERC20PresetMinterPauser.new(
            "Rewards token 2",
            "REW2"
        ),
        stakableTokenInstance: await ERC20PresetMinterPauser.new(
            "Staked token",
            "STKD"
        ),
        highDecimalsTokenInstance: await HighDecimalsERC20.new(),
        firstStakerAddress,
        ownerAddress,
        secondStakerAddress,
        thirdStakerAddress,
    };
};

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
    stakableTokens,
    rewardTokens,
    rewardAmounts,
    duration,
    startingBlock,
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
            await rewardTokens[i].mint(erc20Staker.address, rewardAmounts[i]);
        }
    }
    // if not specified, the distribution starts from the next block.
    // getBlockNumber returns the number of the last mined block.
    // The next one will contain our initialization transaction, so
    // the starting block has to be 2 blocks from the latest mined block.
    const campaignStartingBlock =
        startingBlock >= 0
            ? startingBlock
            : new BN((await web3.eth.getBlockNumber()) + 2);
    await erc20Staker.initialize(
        rewardTokens.map((instance) => instance.address),
        stakableTokens.map((instance) => instance.address),
        rewardAmounts,
        campaignStartingBlock,
        duration,
        { from }
    );
    return campaignStartingBlock;
};

exports.stake = async (
    erc20StakerInstance,
    from,
    amounts,
    waitForReceipt = true
) => {
    if (waitForReceipt) {
        await erc20StakerInstance.stake(amounts, { from });
        // return the block in which the stake operation was performed
        return new BN(await web3.eth.getBlockNumber());
    } else {
        // The transaction will be included in the next block, so we have to add 1
        const blockNumber = new BN((await web3.eth.getBlockNumber()) + 1);
        // Make sure the transaction has actually been queued before returning
        return new Promise((resolve, reject) => {
            erc20StakerInstance
                .stake(amounts, { from })
                .on("transactionHash", () => {
                    resolve(blockNumber);
                })
                .on("error", reject);
        });
    }
};

exports.withdraw = async (
    erc20StakerInstance,
    from,
    amounts,
    waitForReceipt = true
) => {
    if (waitForReceipt) {
        await erc20StakerInstance.withdraw(amounts, { from });
        return new BN(await web3.eth.getBlockNumber());
    } else {
        // The transaction will be included in the next block, so we have to add 1
        const blockNumber = new BN((await web3.eth.getBlockNumber()) + 1);
        // Make sure the transaction has actually been queued before returning
        return new Promise((resolve, reject) => {
            erc20StakerInstance
                .withdraw(amounts, { from })
                .on("transactionHash", () => {
                    resolve(blockNumber);
                })
                .on("error", reject);
        });
    }
};
