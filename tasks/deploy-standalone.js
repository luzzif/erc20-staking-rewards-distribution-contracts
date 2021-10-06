const { task } = require("hardhat/config");

task(
    "deploy-standalone",
    "Deploys a standalone campaign and optionally verifies source code on Etherscan"
)
    .addOptionalParam(
        "ownerAddress",
        "The address that should be owning the campaign"
    )
    .addParam("rewardTokenAddresses", "Reward token addresses")
    .addParam("rewardAmounts", "Reward amounts")
    .addParam("stakableTokenAddress", "Stakable token address")
    .addParam("startingTimestamp", "Starting timestamp")
    .addParam("endingTimestamp", "Ending timestamp")
    .addParam("locked", "Locked")
    .addParam("stakingCap", "Staking cap")
    .addFlag(
        "verify",
        "Additional (and optional) Etherscan contracts verification"
    )
    .setAction(async (taskArguments, hre) => {
        const {
            ownerAddress,
            rewardTokenAddresses,
            rewardAmounts,
            stakableTokenAddress,
            startingTimestamp,
            endingTimestamp,
            locked,
            stakingCap,
            verify,
        } = taskArguments;
        const rewardTokenAddressesArray = JSON.parse(rewardTokenAddresses);
        const rewardAmountsArray = JSON.parse(rewardAmounts);

        await hre.run("clean");
        await hre.run("compile");

        const distributionFactory = await hre.ethers.getContractFactory(
            "StandaloneERC20StakingRewardsDistribution"
        );
        console.log("deploying contract");
        const distribution = await distributionFactory.deploy();
        await distribution.deployed();

        if (verify) {
            await new Promise((resolve) => {
                console.log("waiting");
                setTimeout(resolve, 60000);
            });
            await hre.run("verify", {
                address: distribution.address,
                constructorArgsParams: [],
            });
            console.log("source code verified");
        }

        console.log(`campaign deployed at address ${distribution.address}`);

        console.log("approving rewards");
        const parsedRewardAmounts = [];
        for (let i = 0; i < rewardTokenAddressesArray.length; i++) {
            const rewardToken = (
                await hre.ethers.getContractFactory("ERC20")
            ).attach(rewardTokenAddressesArray[i]);
            const rewardAmount = hre.ethers.utils.parseUnits(
                rewardAmountsArray[i].toString(),
                await rewardToken.decimals()
            );
            parsedRewardAmounts.push(rewardAmount);
            const approveTx = await rewardToken.approve(
                distribution.address,
                rewardAmount
            );
            await approveTx.wait();
        }

        console.log("initializing campaign");
        await distribution.initialize(
            rewardTokenAddressesArray,
            stakableTokenAddress,
            parsedRewardAmounts,
            startingTimestamp,
            endingTimestamp,
            locked,
            stakingCap
        );

        if (ownerAddress) {
            console.log("transferring ownership to", ownerAddress);
            await distribution.transferOwnership(ownerAddress);
        }
    });
