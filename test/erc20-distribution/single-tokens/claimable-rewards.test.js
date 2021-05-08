const BN = require("bn.js");
const { expect } = require("chai");
const { MAXIMUM_VARIANCE } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stakeAtTimestamp,
    withdrawAtTimestamp,
    claimAllAtTimestamp,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");
const {
    fastForwardTo,
    stopMining,
    getEvmTimestamp,
    startMining,
} = require("../../utils/network");

const ERC20StakingRewardsDistribution = artifacts.require(
    "ERC20StakingRewardsDistribution"
);
const FirstRewardERC20 = artifacts.require("FirstRewardERC20");
const SecondRewardERC20 = artifacts.require("SecondRewardERC20");
const FirstStakableERC20 = artifacts.require("FirstStakableERC20");

contract(
    "ERC20StakingRewardsDistribution - Single reward/stakable token - Get claimable rewards",
    () => {
        let erc20DistributionInstance,
            firstRewardTokenInstance,
            secondRewardTokenInstance,
            stakableTokenInstance,
            ownerAddress,
            firstStakerAddress,
            secondStakerAddress;

        beforeEach(async () => {
            const accounts = await web3.eth.getAccounts();
            ownerAddress = accounts[0];
            erc20DistributionInstance = await ERC20StakingRewardsDistribution.new(
                {
                    from: ownerAddress,
                }
            );
            firstStakerAddress = accounts[1];
            secondStakerAddress = accounts[2];
            firstRewardTokenInstance = await FirstRewardERC20.new();
            secondRewardTokenInstance = await SecondRewardERC20.new();
            stakableTokenInstance = await FirstStakableERC20.new();
            firstStakerAddress = accounts[1];
        });

        it("should give an empty array back when the distribution has not been initialized yet", async () => {
            const claimableRewards = await erc20DistributionInstance.claimableRewards(
                firstStakerAddress
            );
            expect(claimableRewards).to.have.length(0);
        });

        it("should give an array back with length 1 when the distribution has been initialized with 1 reward token but not yet started", async () => {
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [firstRewardTokenInstance],
                rewardAmounts: ["10"],
                duration: 10,
            });
            const claimableRewards = await erc20DistributionInstance.claimableRewards(
                firstStakerAddress
            );
            expect(claimableRewards).to.have.length(1);
            expect(claimableRewards[0]).to.be.equalBn(new BN(0));
        });

        it("should give an array back with length 2 when the distribution has been initialized with 2 reward token but not yet started", async () => {
            await initializeDistribution({
                from: ownerAddress,
                erc20DistributionInstance,
                stakableToken: stakableTokenInstance,
                rewardTokens: [
                    firstRewardTokenInstance,
                    secondRewardTokenInstance,
                ],
                rewardAmounts: ["10", "1"],
                duration: 10,
            });
            const claimableRewards = await erc20DistributionInstance.claimableRewards(
                firstStakerAddress
            );
            expect(claimableRewards).to.have.length(2);
            expect(claimableRewards[0]).to.be.equalBn(new BN(0));
            expect(claimableRewards[1]).to.be.equalBn(new BN(0));
        });
    }
);
