const BN = require("bn.js");
const { expect } = require("chai");
const { MAXIMUM_VARIANCE } = require("../../constants");
const {
    initializeDistribution,
    initializeStaker,
    stake,
    withdraw,
    getTestContext,
} = require("../../utils");
const { toWei } = require("../../utils/conversion");
const {
    mineBlocks,
    stopMining,
    mineBlock,
    startMining,
} = require("../../utils/network");

describe("ERC20Staker - Single reward/stakable token - Claiming", () => {
    let erc20StakerInstance,
        rewardsTokenInstance,
        stakableTokenInstance,
        firstStakerAddress,
        secondStakerAddress,
        thirdStakerAddress,
        ownerAddress;

    beforeEach(async () => {
        const testContext = await getTestContext();
        erc20StakerInstance = testContext.erc20StakerInstance;
        rewardsTokenInstance = testContext.firstRewardsTokenInstance;
        stakableTokenInstance = testContext.stakableTokenInstance;
        firstStakerAddress = testContext.firstStakerAddress;
        secondStakerAddress = testContext.secondStakerAddress;
        thirdStakerAddress = testContext.thirdStakerAddress;
        ownerAddress = testContext.ownerAddress;
    });

    it("should succeed in claiming the full reward if only one staker stakes right from the first block", async () => {
        const stakedAmount = await toWei(20, stakableTokenInstance);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration: 10,
        });

        const startingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount]
        );

        await mineBlocks(10);

        await erc20StakerInstance.claim({ from: firstStakerAddress });
        const campaignEndingBlock = await erc20StakerInstance.endingBlock();
        const stakingDuration = campaignEndingBlock.sub(startingBlock);
        expect(stakingDuration).to.be.equalBn(new BN(10));
        const rewardPerBlock = await erc20StakerInstance.rewardPerBlock(
            rewardsTokenInstance.address
        );
        const firstStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
            firstStakerAddress
        );
        expect(firstStakerRewardsTokenBalance).to.equalBn(
            rewardPerBlock.mul(stakingDuration)
        );
        // additional checks to be extra safe
        expect(firstStakerRewardsTokenBalance).to.equalBn(rewardsAmount);
    });

    it("should succeed in claiming two rewards if two stakers stake exactly the same amount at different times", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const campaignStartingBlock = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });

        const firstStakerStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount]
        );

        await mineBlocks(4);

        const secondStakerStartingBlock = await stake(
            erc20StakerInstance,
            secondStakerAddress,
            [stakedAmount]
        );

        await mineBlocks(5);

        const campaignEndingBlock = await erc20StakerInstance.endingBlock();
        expect(campaignEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
            duration
        );

        // first staker staked for 10 blocks
        expect(campaignEndingBlock.sub(firstStakerStartingBlock)).to.be.equalBn(
            new BN(10)
        );
        // second staker staked for 5 blocks
        expect(
            campaignEndingBlock.sub(secondStakerStartingBlock)
        ).to.be.equalBn(new BN(5));

        const rewardPerBlock = rewardsAmount.div(duration);
        // the first staker had all of the rewards for 5 blocks and half of them for 5
        const expectedFirstStakerReward = rewardPerBlock
            .mul(new BN(5))
            .add(rewardPerBlock.mul(new BN(5)).div(new BN(2)));
        // the second staker had half of the rewards for 5 blocks
        const expectedSecondStakerReward = rewardPerBlock
            .div(new BN(2))
            .mul(new BN(5));

        // first staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedFirstStakerReward);

        // second staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: secondStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.equalBn(expectedSecondStakerReward);
    });

    it("should succeed in claiming three rewards if three stakers stake exactly the same amount at different times", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(12);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: thirdStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const campaignStartingBlock = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });

        // first staker stakes
        const firstStakerStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount]
        );

        await mineBlocks(5);

        // first staker stakes
        const secondStakerStartingBlock = await stake(
            erc20StakerInstance,
            secondStakerAddress,
            [stakedAmount]
        );

        await mineBlocks(2);

        // first staker stakes
        const thirdStakerStartingBlock = await stake(
            erc20StakerInstance,
            thirdStakerAddress,
            [stakedAmount]
        );

        // make sure the distribution has ended
        await mineBlocks(10);

        const campaignEndingBlock = await erc20StakerInstance.endingBlock();
        expect(campaignEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
            duration
        );

        // first staker staked for 12 blocks
        expect(campaignEndingBlock.sub(firstStakerStartingBlock)).to.be.equalBn(
            new BN(12)
        );
        // second staker staked for 6 blocks
        expect(
            campaignEndingBlock.sub(secondStakerStartingBlock)
        ).to.be.equalBn(new BN(6));
        // third staker staked for 3 blocks
        expect(campaignEndingBlock.sub(thirdStakerStartingBlock)).to.be.equalBn(
            new BN(3)
        );

        const rewardPerBlock = rewardsAmount.div(duration);
        // the first staker had all of the rewards for 6 blocks,
        // half of them for 3 blocks and a third for 3 blocks
        const expectedFirstStakerReward = rewardPerBlock
            .mul(new BN(6))
            .add(rewardPerBlock.mul(new BN(3)).div(new BN(2)))
            .add(rewardPerBlock.mul(new BN(3)).div(new BN(3)));
        // the second staker had half of the rewards for 6 blocks
        // and a third for 3 blocks
        const expectedSecondStakerReward = rewardPerBlock
            .mul(new BN(3))
            .div(new BN(2))
            .add(rewardPerBlock.mul(new BN(3)).div(new BN(3)));
        // the third staker had a third of the rewards for 3 blocks
        // (math says that they'd simply get a full block reward for 3 blocks,
        // but let's do the calculation anyway for added clarity)
        const expectedThirdStakerReward = rewardPerBlock
            .mul(new BN(3))
            .div(new BN(3));

        // first staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.closeBn(expectedFirstStakerReward, MAXIMUM_VARIANCE);

        // second staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: secondStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.closeBn(expectedSecondStakerReward, MAXIMUM_VARIANCE);

        // third staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: thirdStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(thirdStakerAddress)
        ).to.be.closeBn(expectedThirdStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming one rewards if a staker stakes when the distribution has already started", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const campaignStartingBlock = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });

        await mineBlocks(5);

        const stakerStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount]
        );

        await mineBlocks(10);

        const campaignEndingBlock = await erc20StakerInstance.endingBlock();
        expect(campaignEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
            duration
        );

        expect(campaignEndingBlock.sub(stakerStartingBlock)).to.be.equalBn(
            new BN(5)
        );

        const rewardPerBlock = rewardsAmount.div(duration);
        // the staker had all of the rewards for 5 blocks
        const expectedFirstStakerReward = rewardPerBlock.mul(new BN(5));

        // claim and rewards balance check
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.closeBn(expectedFirstStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming one rewards if a staker stakes at the last valid distribution block", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const campaignStartingBlock = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });

        await mineBlocks(9);

        const stakerStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount]
        );

        const campaignEndingBlock = await erc20StakerInstance.endingBlock();
        expect(campaignEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
            duration
        );

        expect(campaignEndingBlock.sub(stakerStartingBlock)).to.be.equalBn(
            new BN(1)
        );

        const rewardPerBlock = rewardsAmount.div(duration);
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(rewardPerBlock, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming two rewards if two stakers stake exactly the same amount at different times, and then the first staker withdraws a portion of his stake", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const campaignStartingBlock = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });

        const firstStakerStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount]
        );

        await mineBlocks(4);

        const secondStakerStartingBlock = await stake(
            erc20StakerInstance,
            secondStakerAddress,
            [stakedAmount]
        );

        await mineBlocks(2);

        const firstStakerWithdrawingBlock = await withdraw(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount.div(new BN(2))]
        );

        await mineBlocks(2);

        const campaignEndingBlock = await erc20StakerInstance.endingBlock();
        expect(campaignEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
            duration
        );

        // first staker staked for 10 blocks
        expect(campaignEndingBlock.sub(firstStakerStartingBlock)).to.be.equalBn(
            new BN(10)
        );
        // first staker withdrew at block 8
        expect(
            firstStakerWithdrawingBlock.sub(campaignStartingBlock)
        ).to.be.equalBn(new BN(8));
        // second staker staked for 5 blocks
        expect(
            campaignEndingBlock.sub(secondStakerStartingBlock)
        ).to.be.equalBn(new BN(5));

        const rewardPerBlock = rewardsAmount.div(duration);
        // the first staker had all of the rewards for 5 blocks, half of them for 3, and a third for 2
        const expectedFirstStakerReward = rewardPerBlock
            .mul(new BN(5))
            .add(rewardPerBlock.mul(new BN(3)).div(new BN(2)))
            .add(rewardPerBlock.mul(new BN(2)).div(new BN(3)));
        // the second staker had half of the rewards for 3 blocks and two thirds for 2
        const expectedSecondStakerReward = rewardPerBlock
            .div(new BN(2))
            .mul(new BN(3))
            .add(rewardPerBlock.mul(new BN(2)).mul(new BN(2)).div(new BN(3)));

        // first staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.closeBn(expectedFirstStakerReward, MAXIMUM_VARIANCE);

        // second staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: secondStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.closeBn(expectedSecondStakerReward, MAXIMUM_VARIANCE);
    });

    it("should succeed in claiming two rewards if two stakers both stake at the last valid distribution block", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const campaignStartingBlock = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });

        await mineBlocks(9);

        await stopMining();
        const firstStakerStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount],
            false
        );
        const secondStakerStartingBlock = await stake(
            erc20StakerInstance,
            secondStakerAddress,
            [stakedAmount],
            false
        );
        await mineBlock();
        await startMining();

        const campaignEndingBlock = await erc20StakerInstance.endingBlock();
        expect(campaignEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
            duration
        );
        expect(campaignEndingBlock.sub(firstStakerStartingBlock)).to.be.equalBn(
            new BN(1)
        );
        expect(
            campaignEndingBlock.sub(secondStakerStartingBlock)
        ).to.be.equalBn(new BN(1));

        const rewardPerBlock = rewardsAmount.div(duration);
        // the first staker had half of the rewards for 1 block
        const expectedFirstStakerReward = rewardPerBlock.div(new BN(2));
        // the second staker had half of the rewards for 1 block
        const expectedSecondStakerReward = rewardPerBlock.div(new BN(2));

        // first staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedFirstStakerReward);

        // second staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: secondStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.equalBn(expectedSecondStakerReward);
    });

    it("should succeed in claiming a reward if a staker stakes at block n and then increases their stake", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const campaignStartingBlock = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });

        const amountPerStake = stakedAmount.div(new BN(2));

        const firstStakeStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [amountPerStake]
        );

        await mineBlocks(4);

        const secondStakeStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [amountPerStake]
        );

        await mineBlocks(10);

        const campaignEndingBlock = await erc20StakerInstance.endingBlock();
        expect(campaignEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
            duration
        );
        expect(campaignEndingBlock.sub(firstStakeStartingBlock)).to.be.equalBn(
            new BN(10)
        );
        expect(campaignEndingBlock.sub(secondStakeStartingBlock)).to.be.equalBn(
            new BN(5)
        );

        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(rewardsAmount);
    });

    it("should succeed in claiming two rewards if two staker respectively stake and withdraw at the same block", async () => {
        const stakedAmount = await toWei(10, stakableTokenInstance);
        const duration = new BN(10);
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: firstStakerAddress,
            stakableAmount: stakedAmount,
        });
        await initializeStaker({
            erc20StakerInstance,
            stakableTokenInstance,
            stakerAddress: secondStakerAddress,
            stakableAmount: stakedAmount,
        });
        const rewardsAmount = await toWei(10, rewardsTokenInstance);
        const campaignStartingBlock = await initializeDistribution({
            from: ownerAddress,
            erc20Staker: erc20StakerInstance,
            stakableTokens: [stakableTokenInstance],
            rewardTokens: [rewardsTokenInstance],
            rewardAmounts: [rewardsAmount],
            duration,
        });

        const firstStakerStartingBlock = await stake(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount],
            false
        );

        await mineBlocks(4);

        await stopMining();
        const secondStakerStartingBlock = await stake(
            erc20StakerInstance,
            secondStakerAddress,
            [stakedAmount],
            false
        );
        const firstStakerEndingBlock = await withdraw(
            erc20StakerInstance,
            firstStakerAddress,
            [stakedAmount],
            false
        );
        await mineBlock();
        await startMining();

        await mineBlocks(10);

        const campaignEndingBlock = await erc20StakerInstance.endingBlock();
        expect(campaignEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
            duration
        );
        expect(
            firstStakerEndingBlock.sub(firstStakerStartingBlock)
        ).to.be.equalBn(new BN(5));
        expect(
            campaignEndingBlock.sub(secondStakerStartingBlock)
        ).to.be.equalBn(new BN(5));

        const rewardPerBlock = rewardsAmount.div(duration);
        // both stakers had all of the rewards for 5 blocks
        const expectedReward = rewardPerBlock.mul(new BN(5));

        // first staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: firstStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(firstStakerAddress)
        ).to.be.equalBn(expectedReward);

        // second staker claim and rewards balance check
        await erc20StakerInstance.claim({ from: secondStakerAddress });
        expect(
            await rewardsTokenInstance.balanceOf(secondStakerAddress)
        ).to.be.equalBn(expectedReward);
    });
});
