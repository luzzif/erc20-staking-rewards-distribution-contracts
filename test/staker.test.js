const { contract } = require("hardhat");
const { expect } = require("chai");
const { toWei } = require("./utils/conversion");
const { artifacts, web3 } = require("hardhat");
const BN = require("bn.js");

const ERC20Staker = artifacts.require("ERC20Staker.sol");
const ERC20PresetMinterPauser = artifacts.require(
    "ERC20PresetMinterPauser.json"
);

// Maximum variance allowed between expected values and actual ones.
// Mainly accounts for division between integers, and associated rounding.
const MAXIMUM_VARIANCE = new BN("100"); // 100 wei

contract("ERC20Staker", (accounts) => {
    const [
        firstStakerAddress,
        dxDaoAvatarAddress,
        secondStakerAddress,
        thirdStakerAddress,
    ] = accounts;
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    let erc20StakerInstance, rewardsTokenInstance, stakedTokenInstance;

    beforeEach(async () => {
        erc20StakerInstance = await ERC20Staker.new(dxDaoAvatarAddress);
        rewardsTokenInstance = await ERC20PresetMinterPauser.new(
            "Rewards token",
            "REW"
        );
        stakedTokenInstance = await ERC20PresetMinterPauser.new(
            "Staked token",
            "STKD"
        );
    });

    describe("initialization", () => {
        it("should fail when called by a non-DXdao address", async () => {
            try {
                await erc20StakerInstance.initialize(
                    zeroAddress,
                    stakedTokenInstance.address,
                    await toWei("1", rewardsTokenInstance),
                    await web3.eth.getBlockNumber(),
                    10
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("ERC20Staker: not DXdao");
            }
        });

        it("should fail when passing a 0-address rewards token", async () => {
            try {
                await erc20StakerInstance.initialize(
                    zeroAddress,
                    stakedTokenInstance.address,
                    await toWei("1", rewardsTokenInstance),
                    await web3.eth.getBlockNumber(),
                    10,
                    { from: dxDaoAvatarAddress }
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: 0 address as rewards token"
                );
            }
        });

        it("should fail when passing a 0-address lp token", async () => {
            try {
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    zeroAddress,
                    await toWei("1", rewardsTokenInstance),
                    await web3.eth.getBlockNumber(),
                    10,
                    { from: dxDaoAvatarAddress }
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: 0 address as LP token"
                );
            }
        });

        it("should fail when passing 0 as a rewards amount", async () => {
            try {
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    0,
                    await web3.eth.getBlockNumber(),
                    10,
                    { from: dxDaoAvatarAddress }
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: 0 rewards amount"
                );
            }
        });

        it("should fail when passing a lower or equal block as the starting one", async () => {
            try {
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    await toWei("1", rewardsTokenInstance),
                    await web3.eth.getBlockNumber(),
                    10,
                    { from: dxDaoAvatarAddress }
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: starting block lower than current"
                );
            }
        });

        it("should fail when passing 0 as blocks duration", async () => {
            try {
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    await toWei("1", rewardsTokenInstance),
                    (await web3.eth.getBlockNumber()) + 10,
                    0,
                    { from: dxDaoAvatarAddress }
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: invalid block duration"
                );
            }
        });

        it("should fail when the rewards amount has not been sent to the contract", async () => {
            try {
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    await toWei("1", rewardsTokenInstance),
                    (await web3.eth.getBlockNumber()) + 10,
                    10,
                    { from: dxDaoAvatarAddress }
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("ERC20Staker: funds required");
            }
        });

        it("should succeed in the right conditions", async () => {
            const rewardsAmount = await toWei("1", rewardsTokenInstance);
            const startingBlock = (await web3.eth.getBlockNumber()) + 10;
            const blocksDuration = 12;
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                startingBlock,
                blocksDuration,
                { from: dxDaoAvatarAddress }
            );

            expect(await erc20StakerInstance.initialized()).to.be.true;
            expect(
                (
                    await rewardsTokenInstance.balanceOf(
                        erc20StakerInstance.address
                    )
                ).toString()
            ).to.be.equal(rewardsAmount.toString());
            expect(await erc20StakerInstance.rewardsToken()).to.be.equal(
                rewardsTokenInstance.address
            );
            expect(await erc20StakerInstance.lpToken()).to.be.equal(
                stakedTokenInstance.address
            );
            expect(
                (await erc20StakerInstance.rewardsAmount()).toString()
            ).to.be.equal(rewardsAmount.toString());
            expect(
                (await erc20StakerInstance.startingBlock()).toString()
            ).to.be.equal(startingBlock.toString());
            const campaignStartingBlock = await erc20StakerInstance.startingBlock();
            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            expect(
                new BN(campaignEndingBlock.toString())
                    .sub(new BN(campaignStartingBlock.toString()))
                    .toString()
            ).to.be.equal(blocksDuration.toString());
            expect(
                (await erc20StakerInstance.rewardsPerBlock()).toString()
            ).to.be.equal(
                new BN(rewardsAmount).div(new BN(blocksDuration)).toString()
            );
        });

        it("should fail when trying to initialize a second time", async () => {
            const rewardsAmount = await toWei("1", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            try {
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 10,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 1083,
                    102994,
                    { from: dxDaoAvatarAddress }
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: already initialized"
                );
            }
        });
    });

    describe("cancelation", () => {
        it("should fail when initialization has not been done", async () => {
            try {
                await erc20StakerInstance.cancel();
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: not initialized"
                );
            }
        });

        it("should fail when not called by DXdao", async () => {
            try {
                const rewardsAmount = await toWei("1", rewardsTokenInstance);
                await rewardsTokenInstance.mint(
                    erc20StakerInstance.address,
                    rewardsAmount
                );
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 2,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                // dummy transaction to increase block number in local chain
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
                await erc20StakerInstance.cancel();
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("ERC20Staker: not DXdao");
            }
        });

        it("should fail when the program has already started", async () => {
            try {
                const rewardsAmount = await toWei("1", rewardsTokenInstance);
                await rewardsTokenInstance.mint(
                    erc20StakerInstance.address,
                    rewardsAmount
                );
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 2,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                // dummy transaction to increase block number in local chain
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
                await erc20StakerInstance.cancel({ from: dxDaoAvatarAddress });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: program already started"
                );
            }
        });

        it("should succeed in the right conditions", async () => {
            const rewardsAmount = await toWei("1", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                (await web3.eth.getBlockNumber()) + 3,
                15,
                { from: dxDaoAvatarAddress }
            );
            await erc20StakerInstance.cancel({ from: dxDaoAvatarAddress });

            expect(await erc20StakerInstance.initialized()).to.be.false;
            expect(
                (
                    await rewardsTokenInstance.balanceOf(
                        erc20StakerInstance.address
                    )
                ).toString()
            ).to.be.equal("0");
            expect(
                (
                    await rewardsTokenInstance.balanceOf(dxDaoAvatarAddress)
                ).toString()
            ).to.be.equal(rewardsAmount.toString());
            expect(await erc20StakerInstance.rewardsToken()).to.be.equal(
                zeroAddress
            );
            expect(await erc20StakerInstance.lpToken()).to.be.equal(
                zeroAddress
            );
            expect(
                (await erc20StakerInstance.rewardsAmount()).toString()
            ).to.be.equal("0");
            expect(
                (await erc20StakerInstance.startingBlock()).toString()
            ).to.be.equal("0");
            const campaignStartingBlock = await erc20StakerInstance.startingBlock();
            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            expect(
                new BN(campaignEndingBlock.toString())
                    .sub(new BN(campaignStartingBlock.toString()))
                    .toString()
            ).to.be.equal("0");
            expect(
                (await erc20StakerInstance.rewardsPerBlock()).toString()
            ).to.be.equal("0");
        });

        it("should allow for a second initialization on success", async () => {
            const rewardsAmount = await toWei("1", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                (await web3.eth.getBlockNumber()) + 3,
                15,
                { from: dxDaoAvatarAddress }
            );
            await erc20StakerInstance.cancel({ from: dxDaoAvatarAddress });
            // resending funds since the ones sent before have been sent back
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                (await web3.eth.getBlockNumber()) + 3,
                100,
                { from: dxDaoAvatarAddress }
            );
        });
    });

    describe("staking", () => {
        it("should fail when initialization has not been done", async () => {
            try {
                await erc20StakerInstance.stake(0);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: not initialized"
                );
            }
        });

        it("should fail when program has not yet started", async () => {
            try {
                const rewardsAmount = await toWei("1", rewardsTokenInstance);
                await rewardsTokenInstance.mint(
                    erc20StakerInstance.address,
                    rewardsAmount
                );
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 20,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                await erc20StakerInstance.stake(
                    await toWei("1", stakedTokenInstance)
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("ERC20Staker: not started");
            }
        });

        it("should fail when trying to stake 0", async () => {
            try {
                const rewardsAmount = await toWei("1", rewardsTokenInstance);
                await rewardsTokenInstance.mint(
                    erc20StakerInstance.address,
                    rewardsAmount
                );
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 1,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                await erc20StakerInstance.stake(0);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: staked amount is 0"
                );
            }
        });

        it("should fail when the staker has not enough balance", async () => {
            try {
                const rewardsAmount = await toWei("1", rewardsTokenInstance);
                await rewardsTokenInstance.mint(
                    erc20StakerInstance.address,
                    rewardsAmount
                );
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 1,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                await erc20StakerInstance.stake(
                    await toWei("1", stakedTokenInstance)
                );
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds balance"
                );
            }
        });

        it("should fail when no allowance was set by the staker", async () => {
            try {
                const rewardsAmount = await toWei("1", rewardsTokenInstance);
                await rewardsTokenInstance.mint(
                    erc20StakerInstance.address,
                    rewardsAmount
                );
                const stakedAmount = await toWei("1", stakedTokenInstance);
                await stakedTokenInstance.mint(
                    firstStakerAddress,
                    stakedAmount
                );
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 1,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                await erc20StakerInstance.stake(stakedAmount);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds allowance"
                );
            }
        });

        it("should fail when no allowance was set by the staker", async () => {
            try {
                const rewardsAmount = await toWei("1", rewardsTokenInstance);
                await rewardsTokenInstance.mint(
                    erc20StakerInstance.address,
                    rewardsAmount
                );
                const stakedAmount = await toWei("1", stakedTokenInstance);
                await stakedTokenInstance.mint(
                    firstStakerAddress,
                    stakedAmount
                );
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    stakedTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 1,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                await erc20StakerInstance.stake(stakedAmount);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds allowance"
                );
            }
        });

        it("should succeed in the right conditions", async () => {
            const rewardsAmount = await toWei("1", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            const stakedAmount = await toWei("1", stakedTokenInstance);
            await stakedTokenInstance.mint(firstStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount
            );
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                (await web3.eth.getBlockNumber()) + 1,
                15,
                { from: dxDaoAvatarAddress }
            );
            await erc20StakerInstance.stake(stakedAmount);
            expect(
                (
                    await erc20StakerInstance.lpTokensBalance(
                        firstStakerAddress
                    )
                ).toString()
            ).to.be.equal(stakedAmount.toString());
            expect(
                (await erc20StakerInstance.stakedLpTokensAmount()).toString()
            ).to.be.equal(stakedAmount.toString());
        });
    });

    describe("claiming", () => {
        it("should succeed in claiming the full reward if only one LP stakes", async () => {
            const rewardsAmount = await toWei("100", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            const campaignStartingBlock = (await web3.eth.getBlockNumber()) + 3;
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                campaignStartingBlock,
                10,
                { from: dxDaoAvatarAddress }
            );

            const stakedAmount = await toWei("20", stakedTokenInstance);
            await stakedTokenInstance.mint(firstStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: firstStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: firstStakerAddress,
            });
            const startingBlock = (await web3.eth.getBlockNumber()) - 1;

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 10; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            await erc20StakerInstance.claim({ from: firstStakerAddress });
            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            const stakingDuration = campaignEndingBlock - startingBlock;
            const rewardPerBlock = await erc20StakerInstance.rewardsPerBlock();
            const firstStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                firstStakerAddress
            );
            expect(firstStakerRewardsTokenBalance.toString()).to.equal(
                new BN(rewardPerBlock.toString())
                    .mul(new BN(stakingDuration))
                    .toString()
            );
        });

        it("should succeed in claiming two rewards if two LPs stake exactly the same amount at different times", async () => {
            const rewardsAmount = await toWei("10", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            const campaignStartingBlock = (await web3.eth.getBlockNumber()) + 3;
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                campaignStartingBlock,
                10,
                { from: dxDaoAvatarAddress }
            );

            const stakedAmount = await toWei("10", stakedTokenInstance);

            // first staker stakes
            await stakedTokenInstance.mint(firstStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: firstStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: firstStakerAddress,
            });
            const firstStakerStartingBlock =
                (await web3.eth.getBlockNumber()) - 1;

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 2; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            // second staker stakes
            await stakedTokenInstance.mint(secondStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: secondStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: secondStakerAddress,
            });

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 10; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            const rewardPerBlock = await erc20StakerInstance.rewardsPerBlock();
            const firstStakerLockupDuration =
                campaignEndingBlock - firstStakerStartingBlock;
            expect(firstStakerLockupDuration.toString()).to.be.equal("10");

            // the first staker had all of the rewards for 5 blocks and half of them for 5
            const expectedFirstStakerReward = new BN(rewardPerBlock)
                .mul(new BN("5"))
                .add(new BN(rewardPerBlock).mul(new BN("5")).div(new BN("2")));

            await erc20StakerInstance.claim({ from: firstStakerAddress });
            const firstStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                firstStakerAddress
            );
            expect(firstStakerRewardsTokenBalance.toString()).to.be.equal(
                expectedFirstStakerReward.toString()
            );

            // the second staker had half of the rewards for 5 blocks
            const expectedSecondStakerReward = new BN(rewardPerBlock)
                .mul(new BN("5"))
                .div(new BN("2"));

            await erc20StakerInstance.claim({ from: secondStakerAddress });
            const secondStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                secondStakerAddress
            );
            expect(secondStakerRewardsTokenBalance.toString()).to.be.equal(
                expectedSecondStakerReward.toString()
            );
        });

        it("should succeed in claiming three rewards if three LPs stake exactly the same amount at different times", async () => {
            const rewardsAmount = await toWei("10", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            const campaignStartingBlock = (await web3.eth.getBlockNumber()) + 3;
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                campaignStartingBlock,
                12,
                { from: dxDaoAvatarAddress }
            );

            const stakedAmount = await toWei("10", stakedTokenInstance);

            // first staker stakes
            await stakedTokenInstance.mint(firstStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: firstStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: firstStakerAddress,
            });
            const firstStakerStartingBlock =
                (await web3.eth.getBlockNumber()) - 1;

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 3; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            // second staker stakes
            await stakedTokenInstance.mint(secondStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: secondStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: secondStakerAddress,
            });
            const secondStakerStartingBlock =
                (await web3.eth.getBlockNumber()) - 1;

            // third staker stakes
            await stakedTokenInstance.mint(thirdStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: thirdStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: thirdStakerAddress,
            });
            const thirdStakerStartingBlock =
                (await web3.eth.getBlockNumber()) - 1;

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 5; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            const firstStakerLockupDuration =
                campaignEndingBlock - firstStakerStartingBlock;
            expect(firstStakerLockupDuration.toString()).to.be.equal("12");
            const secondStakerLockupDuration =
                campaignEndingBlock - secondStakerStartingBlock;
            expect(secondStakerLockupDuration.toString()).to.be.equal("6");
            const thirdStakerLockupDuration =
                campaignEndingBlock - thirdStakerStartingBlock;
            expect(thirdStakerLockupDuration.toString()).to.be.equal("3");

            const rewardPerBlock = await erc20StakerInstance.rewardsPerBlock();

            // the first staker had all of the rewards for 6 blocks,
            // and half of them for 3, and a third of them for 3
            const expectedFirstStakerReward = rewardPerBlock
                .mul(new BN("6"))
                .add(rewardPerBlock.mul(new BN("3")).div(new BN("2")))
                .add(rewardPerBlock.mul(new BN("3")).div(new BN("3")));

            await erc20StakerInstance.claim({ from: firstStakerAddress });
            const firstStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                firstStakerAddress
            );
            expect(firstStakerRewardsTokenBalance).to.be.close(
                expectedFirstStakerReward,
                MAXIMUM_VARIANCE
            );

            // the second staker had half of the rewards for 3 blocks and a third for 3 blocks
            const expectedSecondStakerReward = rewardPerBlock
                .mul(new BN("3"))
                .div(new BN("2"))
                .add(rewardPerBlock.mul(new BN("3")).div(new BN("3")));

            await erc20StakerInstance.claim({ from: secondStakerAddress });
            const secondStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                secondStakerAddress
            );
            expect(secondStakerRewardsTokenBalance).to.be.close(
                expectedSecondStakerReward,
                MAXIMUM_VARIANCE
            );

            // the third staker had a third of the rewards for 3 blocks
            const expectedThirdStakerReward = rewardPerBlock
                .mul(new BN("3"))
                .div(new BN("3"));

            await erc20StakerInstance.claim({ from: thirdStakerAddress });
            const thirdStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                thirdStakerAddress
            );
            expect(thirdStakerRewardsTokenBalance).to.be.close(
                expectedThirdStakerReward,
                MAXIMUM_VARIANCE
            );
        });

        it("should succeed in claiming one rewards if an LPs stakes when the distribution has already started", async () => {
            const rewardsAmount = await toWei("10", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            const campaignStartingBlock = (await web3.eth.getBlockNumber()) + 1;
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                campaignStartingBlock,
                10,
                { from: dxDaoAvatarAddress }
            );

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 4; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            // first staker stakes
            const stakedAmount = await toWei("10", stakedTokenInstance);
            await stakedTokenInstance.mint(firstStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: firstStakerAddress }
            );
            // should start staking from the 7th block onwards
            await erc20StakerInstance.stake(stakedAmount, {
                from: firstStakerAddress,
            });
            const stakingStartingBlock = (await web3.eth.getBlockNumber()) - 1;

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 10; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            const lockupDuration = campaignEndingBlock.sub(
                new BN(stakingStartingBlock)
            );
            // from 7th block (included) to the tenth (included)
            expect(lockupDuration.toString()).to.be.equal("4");

            const rewardPerBlock = await erc20StakerInstance.rewardsPerBlock();
            const expectedReward = rewardPerBlock.mul(new BN("4"));

            await erc20StakerInstance.claim({ from: firstStakerAddress });
            const rewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                firstStakerAddress
            );
            expect(rewardsTokenBalance).to.be.close(
                expectedReward,
                MAXIMUM_VARIANCE
            );
        });

        it("should succeed in claiming one rewards if an LPs stakes at the last distribution block", async () => {
            const rewardsAmount = await toWei("10", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            const campaignStartingBlock = (await web3.eth.getBlockNumber()) + 1;
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                campaignStartingBlock,
                10,
                { from: dxDaoAvatarAddress }
            );

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 7; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            // first staker stakes
            const stakedAmount = await toWei("10", stakedTokenInstance);
            await stakedTokenInstance.mint(firstStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: firstStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: firstStakerAddress,
            });
            const stakingStartingBlock = (await web3.eth.getBlockNumber()) - 1;

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 2; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            const lockupDuration = campaignEndingBlock.sub(
                new BN(stakingStartingBlock)
            );
            expect(lockupDuration.toString()).to.be.equal("1");

            const rewardPerBlock = await erc20StakerInstance.rewardsPerBlock();
            const expectedReward = rewardPerBlock.mul(new BN("1"));

            await erc20StakerInstance.claim({ from: firstStakerAddress });
            const rewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                firstStakerAddress
            );
            expect(rewardsTokenBalance).to.be.close(
                expectedReward,
                MAXIMUM_VARIANCE
            );
        });

        it("should succeed in claiming one rewards if two LPs stake at the last distribution block", async () => {
            const rewardsAmount = await toWei("10", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            const campaignStartingBlock = (await web3.eth.getBlockNumber()) + 1;
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                stakedTokenInstance.address,
                rewardsAmount,
                campaignStartingBlock,
                10,
                { from: dxDaoAvatarAddress }
            );

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 7; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            // first staker stakes
            const stakedAmount = await toWei("10", stakedTokenInstance);
            await stakedTokenInstance.mint(firstStakerAddress, stakedAmount);
            await stakedTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: firstStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: firstStakerAddress,
            });
            const stakingStartingBlock = (await web3.eth.getBlockNumber()) - 1;

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 2; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            const lockupDuration = campaignEndingBlock.sub(
                new BN(stakingStartingBlock)
            );
            expect(lockupDuration.toString()).to.be.equal("1");

            const rewardPerBlock = await erc20StakerInstance.rewardsPerBlock();
            const expectedReward = rewardPerBlock.mul(new BN("1"));

            await erc20StakerInstance.claim({ from: firstStakerAddress });
            const rewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                firstStakerAddress
            );
            expect(rewardsTokenBalance).to.be.close(
                expectedReward,
                MAXIMUM_VARIANCE
            );
        });

        // TODO: add a test where a staker stakes at the last block
    });
});
