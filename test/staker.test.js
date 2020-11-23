const { expect } = require("chai");
const { toWei } = require("./utils/conversion");
const { artifacts, web3 } = require("hardhat");
const { default: BigNumber } = require("bignumber.js");

BigNumber.config({
    DECIMAL_PLACES: 0,
    ROUNDING_MODE: BigNumber.ROUND_FLOOR,
});

const ERC20Staker = artifacts.require("ERC20Staker.sol");
const ERC20PresetMinterPauser = artifacts.require(
    "ERC20PresetMinterPauser.json"
);

// eslint-disable-next-line no-undef
contract("ERC20Staker", (accounts) => {
    const dxDaoAvatarAddress = accounts[1];
    const firstStakerAddress = accounts[0];
    const secondStakerAddress = accounts[2];
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    let erc20StakerInstance, rewardsTokenInstance, lpTokenInstance;

    beforeEach(async () => {
        erc20StakerInstance = await ERC20Staker.new(dxDaoAvatarAddress);
        rewardsTokenInstance = await ERC20PresetMinterPauser.new(
            "Rewards token",
            "REW"
        );
        lpTokenInstance = await ERC20PresetMinterPauser.new("LP token", "LPT");
    });

    describe("initialization", () => {
        it("should fail when called by a non-DXdao address", async () => {
            try {
                await erc20StakerInstance.initialize(
                    zeroAddress,
                    lpTokenInstance.address,
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
                    lpTokenInstance.address,
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
                    lpTokenInstance.address,
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
                    lpTokenInstance.address,
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
                    lpTokenInstance.address,
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
                    lpTokenInstance.address,
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
                lpTokenInstance.address,
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
                lpTokenInstance.address
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
                new BigNumber(campaignEndingBlock.toString())
                    .minus(campaignStartingBlock.toString())
                    .toString()
            ).to.be.equal(blocksDuration.toString());
            expect(
                (await erc20StakerInstance.rewardsPerBlock()).toString()
            ).to.be.equal(
                new BigNumber(rewardsAmount).div(blocksDuration).toFixed(0)
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
                    lpTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 10,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    lpTokenInstance.address,
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
                    lpTokenInstance.address,
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
                    lpTokenInstance.address,
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
                lpTokenInstance.address,
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
                new BigNumber(campaignEndingBlock.toString())
                    .minus(campaignStartingBlock.toString())
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
                lpTokenInstance.address,
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
                lpTokenInstance.address,
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
                    lpTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 20,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                await erc20StakerInstance.stake(
                    await toWei("1", lpTokenInstance)
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
                    lpTokenInstance.address,
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
                    lpTokenInstance.address,
                    rewardsAmount,
                    (await web3.eth.getBlockNumber()) + 1,
                    15,
                    { from: dxDaoAvatarAddress }
                );
                await erc20StakerInstance.stake(
                    await toWei("1", lpTokenInstance)
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
                const stakedAmount = await toWei("1", lpTokenInstance);
                await lpTokenInstance.mint(firstStakerAddress, stakedAmount);
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    lpTokenInstance.address,
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
                const stakedAmount = await toWei("1", lpTokenInstance);
                await lpTokenInstance.mint(firstStakerAddress, stakedAmount);
                await erc20StakerInstance.initialize(
                    rewardsTokenInstance.address,
                    lpTokenInstance.address,
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
            const stakedAmount = await toWei("1", lpTokenInstance);
            await lpTokenInstance.mint(firstStakerAddress, stakedAmount);
            await lpTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount
            );
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                lpTokenInstance.address,
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
                lpTokenInstance.address,
                rewardsAmount,
                campaignStartingBlock,
                20,
                { from: dxDaoAvatarAddress }
            );

            const stakedAmount = await toWei("20", lpTokenInstance);
            await lpTokenInstance.mint(firstStakerAddress, stakedAmount);
            await lpTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: firstStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: firstStakerAddress,
            });
            const startingBlock = await web3.eth.getBlockNumber();

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 20; i++) {
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
                new BigNumber(rewardPerBlock.toString())
                    .times(stakingDuration)
                    .toString()
            );
        });

        it("should succeed in claiming two rewards if two LP stake exactly the same amount at different times", async () => {
            const rewardsAmount = await toWei("100", rewardsTokenInstance);
            await rewardsTokenInstance.mint(
                erc20StakerInstance.address,
                rewardsAmount
            );
            const campaignStartingBlock = (await web3.eth.getBlockNumber()) + 1;
            await erc20StakerInstance.initialize(
                rewardsTokenInstance.address,
                lpTokenInstance.address,
                rewardsAmount,
                campaignStartingBlock,
                10,
                { from: dxDaoAvatarAddress }
            );

            const stakedAmount = await toWei("20", lpTokenInstance);

            // first staker stakes
            await lpTokenInstance.mint(firstStakerAddress, stakedAmount);
            await lpTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: firstStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: firstStakerAddress,
            });
            const firstStakerStartingBlock = await web3.eth.getBlockNumber();

            // second staker stakes
            await lpTokenInstance.mint(secondStakerAddress, stakedAmount);
            await lpTokenInstance.approve(
                erc20StakerInstance.address,
                stakedAmount,
                { from: secondStakerAddress }
            );
            await erc20StakerInstance.stake(stakedAmount, {
                from: secondStakerAddress,
            });
            const secondStakerStartingBlock = await web3.eth.getBlockNumber();

            // spam dummy txs to make blocks flow
            for (let i = 0; i < 10; i++) {
                await rewardsTokenInstance.mint(dxDaoAvatarAddress, 1);
            }

            const rewardPerBlock = await erc20StakerInstance.rewardsPerBlock();
            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            const firstStakerDuration =
                campaignEndingBlock - firstStakerStartingBlock;
            const secondStakerDuration =
                campaignEndingBlock - secondStakerStartingBlock;

            await erc20StakerInstance.claim({ from: firstStakerAddress });
            const firstStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                firstStakerAddress
            );

            await erc20StakerInstance.claim({ from: secondStakerAddress });
            const secondStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                secondStakerAddress
            );

            // first staker had 3 full blocks of being the only staker and 4 with a 50/50 weight.
            expect(firstStakerRewardsTokenBalance.toString()).to.equal(
                new BigNumber(rewardPerBlock)
                    .dividedBy(2)
                    .times(firstStakerDuration)
                    .toString()
            );

            // second staker had 4 blocks of 50/50 weight.
            expect(secondStakerRewardsTokenBalance.toString()).to.equal(
                new BigNumber(rewardPerBlock)
                    .dividedBy(2)
                    .times(secondStakerDuration)
                    .toString()
            );

            const givenOutRewards = firstStakerRewardsTokenBalance.add(
                secondStakerRewardsTokenBalance
            );

            expect(
                (
                    await erc20StakerInstance.earnedRewards(firstStakerAddress)
                ).toString()
            ).to.be.equal(firstStakerRewardsTokenBalance.toString());
            expect(
                (
                    await erc20StakerInstance.earnedRewards(secondStakerAddress)
                ).toString()
            ).to.be.equal(secondStakerRewardsTokenBalance.toString());

            const untouchedReward = await rewardsTokenInstance.balanceOf(
                erc20StakerInstance.address
            );

            expect(untouchedReward.toString()).to.be.equal(
                new BigNumber(rewardsAmount).minus(givenOutRewards).toString()
            );
        });
    });
});
