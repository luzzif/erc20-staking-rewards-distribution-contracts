const { contract } = require("hardhat");
const { expect } = require("chai");
const { toWei } = require("./utils/conversion");
const { artifacts, web3 } = require("hardhat");
const BN = require("bn.js");
const {
    stopMining,
    mineBlocks,
    startMining,
    mineBlock,
} = require("./utils/network");
const { initializeStaker, initializeDistribution, stake } = require("./utils");

const ERC20Staker = artifacts.require("ERC20Staker.sol");
const ERC20PresetMinterPauser = artifacts.require(
    "ERC20PresetMinterPauser.json"
);

// Maximum variance allowed between expected values and actual ones.
// Mainly to account for division between integers, and associated rounding.
const MAXIMUM_VARIANCE = new BN(100); // 100 wei
const ZERO_BN = new BN(0);

contract("ERC20Staker", (accounts) => {
    const [
        firstStakerAddress,
        dxDaoAvatarAddress,
        secondStakerAddress,
        thirdStakerAddress,
    ] = accounts;
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    let erc20StakerInstance, rewardsTokenInstance, stakableTokenInstance;

    beforeEach(async () => {
        erc20StakerInstance = await ERC20Staker.new(dxDaoAvatarAddress);
        rewardsTokenInstance = await ERC20PresetMinterPauser.new(
            "Rewards token",
            "REW"
        );
        stakableTokenInstance = await ERC20PresetMinterPauser.new(
            "Staked token",
            "STKD"
        );
    });

    describe("initialization", () => {
        it("should fail when called by a non-DXdao address", async () => {
            try {
                await initializeDistribution({
                    from: firstStakerAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 10,
                    startingBlock: 0,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("ERC20Staker: not DXdao");
            }
        });

        it("should fail when passing a 0-address rewards token", async () => {
            try {
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: { address: zeroAddress },
                    rewardsAmount: 1,
                    duration: 10,
                    startingBlock: 0,
                    fund: false,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: 0 address as rewards token"
                );
            }
        });

        it("should fail when passing a 0-address stakable token", async () => {
            try {
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: { address: zeroAddress },
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 10,
                    startingBlock: 0,
                    fund: false,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: 0 address as LP token"
                );
            }
        });

        it("should fail when passing 0 as a rewards amount", async () => {
            try {
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 0,
                    duration: 10,
                    startingBlock: 0,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: 0 rewards amount"
                );
            }
        });

        it("should fail when passing a lower or equal block as the starting one", async () => {
            try {
                await mineBlocks(10);
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 10,
                    startingBlock: 0,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: starting block lower or equal than current"
                );
            }
        });

        it("should fail when passing 0 as blocks duration", async () => {
            try {
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 0,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: invalid block duration"
                );
            }
        });

        it("should fail when the rewards amount has not been sent to the contract", async () => {
            try {
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 10,
                    duration: 10,
                    fund: false,
                });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("ERC20Staker: funds required");
            }
        });

        it("should succeed in the right conditions", async () => {
            const rewardsAmount = new BN(await toWei(10, rewardsTokenInstance));
            const duration = new BN(10);
            const campaignStartingBlock = await initializeDistribution({
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount,
                duration,
            });

            expect(await erc20StakerInstance.initialized()).to.be.true;
            expect(
                await rewardsTokenInstance.balanceOf(
                    erc20StakerInstance.address
                )
            ).to.be.equalBn(rewardsAmount);
            expect(await erc20StakerInstance.rewardsToken()).to.be.equal(
                rewardsTokenInstance.address
            );
            expect(await erc20StakerInstance.lpToken()).to.be.equal(
                stakableTokenInstance.address
            );
            expect(await erc20StakerInstance.rewardsAmount()).to.be.equalBn(
                rewardsAmount
            );
            const onchainStartingBlock = await erc20StakerInstance.startingBlock();
            expect(onchainStartingBlock).to.be.equalBn(campaignStartingBlock);
            const onchainEndingBlock = await erc20StakerInstance.endingBlock();
            expect(onchainEndingBlock.sub(campaignStartingBlock)).to.be.equalBn(
                duration
            );
            expect(await erc20StakerInstance.rewardsPerBlock()).to.be.equalBn(
                new BN(rewardsAmount).div(duration)
            );
        });

        it("should fail when trying to initialize a second time", async () => {
            try {
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 1,
                });
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 1,
                });
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
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 1,
                });
                await erc20StakerInstance.cancel({ from: firstStakerAddress });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("ERC20Staker: not DXdao");
            }
        });

        it("should fail when the program has already started", async () => {
            try {
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 1,
                });
                await erc20StakerInstance.cancel({ from: dxDaoAvatarAddress });
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20Staker: program already started"
                );
            }
        });

        it("should succeed in the right conditions", async () => {
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            await initializeDistribution({
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount,
                duration: 1,
                // a block in the far future so that we can cancel when
                // the distribution has not yet started
                startingBlock: 100,
            });
            await erc20StakerInstance.cancel({ from: dxDaoAvatarAddress });

            expect(await erc20StakerInstance.initialized()).to.be.false;
            expect(
                await rewardsTokenInstance.balanceOf(
                    erc20StakerInstance.address
                )
            ).to.be.equalBn(ZERO_BN);
            expect(
                await rewardsTokenInstance.balanceOf(dxDaoAvatarAddress)
            ).to.be.equalBn(rewardsAmount);
            expect(await erc20StakerInstance.rewardsToken()).to.be.equal(
                zeroAddress
            );
            expect(await erc20StakerInstance.lpToken()).to.be.equal(
                zeroAddress
            );
            expect(await erc20StakerInstance.rewardsAmount()).to.be.equalBn(
                ZERO_BN
            );
            expect(await erc20StakerInstance.startingBlock()).to.be.equalBn(
                ZERO_BN
            );
            const campaignStartingBlock = await erc20StakerInstance.startingBlock();
            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            expect(
                campaignEndingBlock.sub(campaignStartingBlock)
            ).to.be.equalBn(ZERO_BN);
            expect(await erc20StakerInstance.rewardsPerBlock()).to.be.equalBn(
                ZERO_BN
            );
        });

        it("should allow for a second initialization on success", async () => {
            const rewardsAmount = await toWei(10, rewardsTokenInstance);
            await initializeDistribution({
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount,
                duration: 1,
                // a block in the far future so that we can cancel when
                // the distribution has not yet started
                startingBlock: 100,
            });
            await erc20StakerInstance.cancel({ from: dxDaoAvatarAddress });
            // resending funds since the ones sent before have been sent back
            await initializeDistribution({
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount,
                duration: 1,
            });
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
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 1,
                    startingBlock: 100,
                });
                await erc20StakerInstance.stake(0);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain("ERC20Staker: not started");
            }
        });

        it("should fail when trying to stake 0", async () => {
            try {
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 1,
                });
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
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 1,
                });
                await erc20StakerInstance.stake(1);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds balance"
                );
            }
        });

        it("should fail when no allowance was set by the staker", async () => {
            try {
                await initializeStaker({
                    erc20StakerInstance,
                    stakableTokenInstance,
                    stakerAddress: firstStakerAddress,
                    stakableAmount: 1,
                    setAllowance: false,
                });
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 1,
                });
                await erc20StakerInstance.stake(1);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds allowance"
                );
            }
        });

        it("should fail when not enough allowance was set by the staker", async () => {
            try {
                await initializeStaker({
                    erc20StakerInstance,
                    stakableTokenInstance,
                    stakerAddress: firstStakerAddress,
                    stakableAmount: 1,
                });
                // mint additional tokens to the staker for which we
                // don't set the correct allowance
                await stakableTokenInstance.mint(firstStakerAddress, 1);
                await initializeDistribution({
                    from: dxDaoAvatarAddress,
                    erc20Staker: erc20StakerInstance,
                    stakableToken: stakableTokenInstance,
                    rewardsToken: rewardsTokenInstance,
                    rewardsAmount: 1,
                    duration: 1,
                });
                await erc20StakerInstance.stake(2);
                throw new Error("should have failed");
            } catch (error) {
                expect(error.message).to.contain(
                    "ERC20: transfer amount exceeds allowance"
                );
            }
        });

        it("should succeed in the right conditions", async () => {
            const stakedAmount = await toWei(10, stakableTokenInstance);
            await initializeStaker({
                erc20StakerInstance,
                stakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeDistribution({
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount: await toWei(1, rewardsTokenInstance),
                duration: 1,
            });
            await erc20StakerInstance.stake(stakedAmount);
            expect(
                await erc20StakerInstance.lpTokensBalance(firstStakerAddress)
            ).to.be.equalBn(stakedAmount);
            expect(
                await erc20StakerInstance.stakedLpTokensAmount()
            ).to.be.equalBn(stakedAmount);
        });
    });

    describe("claiming", () => {
        it("should succeed in claiming the full reward if only one LP stakes right from the first block", async () => {
            const stakedAmount = await toWei(20, stakableTokenInstance);
            await initializeStaker({
                erc20StakerInstance,
                stakableTokenInstance,
                stakerAddress: firstStakerAddress,
                stakableAmount: stakedAmount,
            });
            await initializeDistribution({
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount: await toWei(10, rewardsTokenInstance),
                duration: 10,
            });

            const startingBlock = await stake(
                erc20StakerInstance,
                firstStakerAddress,
                stakedAmount
            );

            await mineBlocks(10);

            await erc20StakerInstance.claim({ from: firstStakerAddress });
            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            const stakingDuration = campaignEndingBlock.sub(startingBlock);
            const rewardPerBlock = await erc20StakerInstance.rewardsPerBlock();
            const firstStakerRewardsTokenBalance = await rewardsTokenInstance.balanceOf(
                firstStakerAddress
            );
            expect(firstStakerRewardsTokenBalance).to.equalBn(
                rewardPerBlock.mul(stakingDuration)
            );
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
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount,
                duration,
            });

            const firstStakerStartingBlock = await stake(
                erc20StakerInstance,
                firstStakerAddress,
                stakedAmount
            );

            await mineBlocks(4);

            const secondStakerStartingBlock = await stake(
                erc20StakerInstance,
                secondStakerAddress,
                stakedAmount
            );

            await mineBlocks(5);

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            expect(
                campaignEndingBlock.sub(campaignStartingBlock)
            ).to.be.equalBn(duration);

            // first staker staked for 10 blocks
            expect(
                campaignEndingBlock.sub(firstStakerStartingBlock)
            ).to.be.equalBn(new BN(10));
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

        it("should succeed in claiming three rewards if three LPs stake exactly the same amount at different times", async () => {
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
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount,
                duration,
            });

            // first staker stakes
            const firstStakerStartingBlock = await stake(
                erc20StakerInstance,
                firstStakerAddress,
                stakedAmount
            );

            await mineBlocks(5);

            // first staker stakes
            const secondStakerStartingBlock = await stake(
                erc20StakerInstance,
                secondStakerAddress,
                stakedAmount
            );

            await mineBlocks(2);

            // first staker stakes
            const thirdStakerStartingBlock = await stake(
                erc20StakerInstance,
                thirdStakerAddress,
                stakedAmount
            );

            // make sure the distribution has ended
            await mineBlocks(10);

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            expect(
                campaignEndingBlock.sub(campaignStartingBlock)
            ).to.be.equalBn(duration);

            // first staker staked for 12 blocks
            expect(
                campaignEndingBlock.sub(firstStakerStartingBlock)
            ).to.be.equalBn(new BN(12));
            // second staker staked for 6 blocks
            expect(
                campaignEndingBlock.sub(secondStakerStartingBlock)
            ).to.be.equalBn(new BN(6));
            // third staker staked for 3 blocks
            expect(
                campaignEndingBlock.sub(thirdStakerStartingBlock)
            ).to.be.equalBn(new BN(3));

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

        it("should succeed in claiming one rewards if an LPs stakes when the distribution has already started", async () => {
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
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount,
                duration,
            });

            await mineBlocks(5);

            const stakerStartingBlock = await stake(
                erc20StakerInstance,
                firstStakerAddress,
                stakedAmount
            );

            await mineBlocks(10);

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            expect(
                campaignEndingBlock.sub(campaignStartingBlock)
            ).to.be.equalBn(duration);

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
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount,
                duration,
            });

            await mineBlocks(9);

            const stakerStartingBlock = await stake(
                erc20StakerInstance,
                firstStakerAddress,
                stakedAmount
            );

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            expect(
                campaignEndingBlock.sub(campaignStartingBlock)
            ).to.be.equalBn(duration);

            expect(campaignEndingBlock.sub(stakerStartingBlock)).to.be.equalBn(
                new BN(1)
            );

            const rewardPerBlock = rewardsAmount.div(duration);
            await erc20StakerInstance.claim({ from: firstStakerAddress });
            expect(
                await rewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(rewardPerBlock, MAXIMUM_VARIANCE);
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
                from: dxDaoAvatarAddress,
                erc20Staker: erc20StakerInstance,
                stakableToken: stakableTokenInstance,
                rewardsToken: rewardsTokenInstance,
                rewardsAmount,
                duration,
            });
            console.log(
                "campaign starting block",
                campaignStartingBlock.toNumber()
            );
            console.log(
                "campaign ending block",
                (await erc20StakerInstance.endingBlock()).toNumber()
            );

            await mineBlocks(9);

            console.log(
                "block after fast-forward",
                await web3.eth.getBlockNumber()
            );
            console.log(
                "currently processing block",
                (await web3.eth.getBlockNumber()) + 1
            );
            console.log(
                "ending block",
                (await erc20StakerInstance.endingBlock()).toString()
            );

            await stopMining();
            console.log("staking for first staker");
            const firstStakerStartingBlock = await stake(
                erc20StakerInstance,
                firstStakerAddress,
                stakedAmount,
                false
            );
            console.log("staking for second staker");
            const secondStakerStartingBlock = await stake(
                erc20StakerInstance,
                secondStakerAddress,
                stakedAmount,
                false
            );
            await startMining();
            await mineBlock();
            console.log(
                "first staker starting block",
                firstStakerStartingBlock.toNumber()
            );
            console.log(
                "second staker starting block",
                firstStakerStartingBlock.toNumber()
            );
            console.log(
                "current block number after mining the block",
                await web3.eth.getBlockNumber()
            );

            const campaignEndingBlock = await erc20StakerInstance.endingBlock();
            expect(
                campaignEndingBlock.sub(campaignStartingBlock)
            ).to.be.equalBn(duration);
            /* expect(
                campaignEndingBlock.sub(firstStakerStartingBlock)
            ).to.be.equalBn(new BN(1));
            expect(
                campaignEndingBlock.sub(secondStakerStartingBlock)
            ).to.be.equalBn(new BN(1)); */

            const rewardPerBlock = rewardsAmount.div(duration);
            // the first staker had half of the rewards for 1 block
            const expectedFirstStakerReward = rewardPerBlock.div(new BN(2));
            // the second staker had half of the rewards for 1 block
            const expectedSecondStakerReward = rewardPerBlock.div(new BN(2));

            // first staker claim and rewards balance check
            await erc20StakerInstance.claim({ from: firstStakerAddress });
            console.log(
                (
                    await rewardsTokenInstance.balanceOf(firstStakerAddress)
                ).toString()
            );
            /* expect(
                await rewardsTokenInstance.balanceOf(firstStakerAddress)
            ).to.be.equalBn(expectedFirstStakerReward); */

            // second staker claim and rewards balance check
            await erc20StakerInstance.claim({ from: secondStakerAddress });
            console.log(
                (
                    await rewardsTokenInstance.balanceOf(secondStakerAddress)
                ).toString()
            );
            /* expect(
                await rewardsTokenInstance.balanceOf(secondStakerAddress)
            ).to.be.equalBn(expectedSecondStakerReward); */
        });
    });
});
