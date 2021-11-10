pragma solidity ^0.8.4;

import {
    ERC20StakingRewardsDistribution
} from "./flattened/ERC20StakingRewardsDistribution.sol";
import {ERC20PresetMinterPauser} from "./flattened/TestDependencies.sol";
import {
    IERC20StakingRewardsDistribution
} from "./flattened/ERC20StakingRewardsDistributionFactory.sol";

contract MockUser {
    ERC20StakingRewardsDistribution internal distribution;
    address stakingToken;

    constructor(address _distribution, address _stakingToken) {
        distribution = ERC20StakingRewardsDistribution(_distribution);
        stakingToken = _stakingToken;
        // Approve staking tokens to distribution
        ERC20PresetMinterPauser(_stakingToken).approve(
            _distribution,
            type(uint256).max
        );
    }

    // Test stake function
    function stake(uint256 amount) public {
        distribution.stake(amount);
    }

    // Test withdraw function
    function withdraw(uint256 amount) public {
        distribution.withdraw(amount);
    }

    // Test claim function
    function claim(uint256[] memory amounts) public {
        distribution.claim(amounts, address(this));
    }

    // Test claimAll function
    function claimAll() public {
        distribution.claimAll(address(this));
    }

    // Test cancel function
    function cancel() public {
        distribution.cancel();
    }

    // Test recoverUnassignedRewards function
    function recoverUnassignedRewards() public {
        distribution.recoverUnassignedRewards();
    }

    // Test addRewards function
    function addRewards(address rewardToken, uint256 amount) public {
        distribution.addRewards(rewardToken, amount);
    }
}

contract ERC20StakingRewardsDistributionFuzzer {
    ERC20StakingRewardsDistribution internal distribution;
    MockUser internal mockUser;

    ERC20PresetMinterPauser internal rewardToken1;
    ERC20PresetMinterPauser internal rewardToken2;
    ERC20PresetMinterPauser internal stakableToken;

    event AssertionFailed();

    constructor() {
        rewardToken1 = new ERC20PresetMinterPauser("Reward token 1", "RWD1");
        rewardToken2 = new ERC20PresetMinterPauser("Reward token 2", "RWD2");
        stakableToken = new ERC20PresetMinterPauser("Stakable token", "STK");

        distribution = new ERC20StakingRewardsDistribution();

        uint256[] memory _rewardAmounts = new uint256[](2);
        _rewardAmounts[0] = 1 ether;
        _rewardAmounts[1] = 2 ether;

        rewardToken1.mint(address(distribution), _rewardAmounts[0]);
        rewardToken2.mint(address(distribution), _rewardAmounts[1]);

        address[] memory _rewardTokens = new address[](2);
        _rewardTokens[0] = address(rewardToken1);
        _rewardTokens[1] = address(rewardToken2);

        distribution.initialize(
            _rewardTokens,
            address(stakableToken),
            _rewardAmounts,
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 10000),
            false,
            0
        );

        mockUser = new MockUser(address(distribution), address(stakableToken));
        stakableToken.approve(address(distribution), 10000 ether);
    }

    // Test stake function
    function stake(uint256 _amount) public {
        uint256 _stakerTokenBalanceBefore =
            stakableToken.balanceOf(address(this));
        uint256 _totalStakedBefore = distribution.totalStakedTokensAmount();
        uint256 _stakedTokensBefore =
            distribution.stakedTokensOf(address(this));

        distribution.stake(_amount);

        uint256 _stakerTokenBalanceAfter =
            stakableToken.balanceOf(address(this));
        uint256 _totalStakedAfter = distribution.totalStakedTokensAmount();
        uint256 _stakedTokensAfter = distribution.stakedTokensOf(address(this));

        // staker token balance decreased by amount
        if (_stakerTokenBalanceBefore - _amount != _stakerTokenBalanceAfter) {
            emit AssertionFailed();
        }

        // total staked increased by amount
        if (_totalStakedBefore + _amount != _totalStakedAfter) {
            emit AssertionFailed();
        }

        // staked tokens increased by amount
        if (_stakedTokensBefore + _amount != _stakedTokensAfter) {
            emit AssertionFailed();
        }
    }

    // Test stake function as user
    function stakeAsUser(uint256 amount) public {
        uint256 stakerTokenBalanceBefore =
            stakableToken.balanceOf(address(mockUser));
        uint256 totalStakedBefore = distribution.totalStakedTokensAmount();
        uint256 stakedTokensBefore =
            distribution.stakedTokensOf(address(mockUser));
        mockUser.stake(amount);
        uint256 stakerTokenBalanceAfter =
            stakableToken.balanceOf(address(mockUser));
        uint256 totalStakedAfter = distribution.totalStakedTokensAmount();
        uint256 stakedTokensAfter =
            distribution.stakedTokensOf(address(mockUser));

        // Assert that staker token balance decreases by amount
        if (stakerTokenBalanceBefore - amount != stakerTokenBalanceAfter) {
            emit AssertionFailed();
        }
        // Assert that total staked increases by amount
        if (totalStakedBefore + amount != totalStakedAfter) {
            emit AssertionFailed();
        }
        // Assert that staked tokens increases by amount
        if (stakedTokensBefore + amount != stakedTokensAfter) {
            emit AssertionFailed();
        }
    }

    // Test withdraw function
    function withdraw(uint256 amount) public {
        uint256 stakerTokenBalanceBefore =
            stakableToken.balanceOf(address(this));
        uint256 totalStakedBefore = distribution.totalStakedTokensAmount();
        uint256 stakedTokensBefore = distribution.stakedTokensOf(address(this));
        distribution.withdraw(amount);
        uint256 stakerTokenBalanceAfter =
            stakableToken.balanceOf(address(this));
        uint256 totalStakedAfter = distribution.totalStakedTokensAmount();
        uint256 stakedTokensAfter = distribution.stakedTokensOf(address(this));

        // Assert that staker token balance increases by amount
        if (stakerTokenBalanceBefore + amount != stakerTokenBalanceAfter) {
            emit AssertionFailed();
        }
        // Assert that total staked decreases by amount
        if (totalStakedBefore - amount != totalStakedAfter) {
            emit AssertionFailed();
        }
        // Assert that staked tokens decreases by amount
        if (stakedTokensBefore - amount != stakedTokensAfter) {
            emit AssertionFailed();
        }
    }

    // Test withdraw function as user
    function withdrawAsUser(uint256 amount) public {
        uint256 stakerTokenBalanceBefore =
            stakableToken.balanceOf(address(mockUser));
        uint256 totalStakedBefore = distribution.totalStakedTokensAmount();
        uint256 stakedTokensBefore =
            distribution.stakedTokensOf(address(mockUser));
        mockUser.withdraw(amount);
        uint256 stakerTokenBalanceAfter =
            stakableToken.balanceOf(address(mockUser));
        uint256 totalStakedAfter = distribution.totalStakedTokensAmount();
        uint256 stakedTokensAfter =
            distribution.stakedTokensOf(address(mockUser));

        // Assert that staker token balance increases by amount
        if (stakerTokenBalanceBefore + amount != stakerTokenBalanceAfter) {
            emit AssertionFailed();
        }
        // Assert that total staked decreases by amount
        if (totalStakedBefore - amount != totalStakedAfter) {
            emit AssertionFailed();
        }
        // Assert that staked tokens decreases by amount
        if (stakedTokensBefore - amount != stakedTokensAfter) {
            emit AssertionFailed();
        }
    }

    // Test claim function
    function claim(uint256[] memory amounts) public {
        uint256 rewardBalancesBefore1 = rewardToken1.balanceOf(address(this));
        uint256 rewardBalancesBefore2 = rewardToken2.balanceOf(address(this));
        distribution.claim(amounts, address(this));
        uint256 rewardBalancesAfter1 = rewardToken1.balanceOf(address(this));
        uint256 rewardBalancesAfter2 = rewardToken2.balanceOf(address(this));

        // Assert that reward token balances are increasing at least by expected amounts
        if (rewardBalancesBefore1 + amounts[0] > rewardBalancesAfter1) {
            emit AssertionFailed();
        }
        if (rewardBalancesBefore2 + amounts[1] > rewardBalancesAfter2) {
            emit AssertionFailed();
        }
    }

    // Test claim function as user
    function claimAsUser(uint256[] memory amounts) public {
        uint256 rewardBalancesBefore1 =
            rewardToken1.balanceOf(address(mockUser));
        uint256 rewardBalancesBefore2 =
            rewardToken2.balanceOf(address(mockUser));
        mockUser.claim(amounts);
        uint256 rewardBalancesAfter1 =
            rewardToken1.balanceOf(address(mockUser));
        uint256 rewardBalancesAfter2 =
            rewardToken2.balanceOf(address(mockUser));

        // Assert that reward token balances are increasing at least by expected amounts
        if (rewardBalancesBefore1 + amounts[0] > rewardBalancesAfter1) {
            emit AssertionFailed();
        }
        if (rewardBalancesBefore2 + amounts[1] > rewardBalancesAfter2) {
            emit AssertionFailed();
        }
    }

    // Test claimAll function
    function claimAll() public {
        uint256[] memory claimableRewards =
            distribution.claimableRewards(address(this));

        uint256 rewardBalancesBefore1 = rewardToken1.balanceOf(address(this));
        uint256 rewardBalancesBefore2 = rewardToken2.balanceOf(address(this));
        distribution.claimAll(address(this));
        uint256 rewardBalancesAfter1 = rewardToken1.balanceOf(address(this));
        uint256 rewardBalancesAfter2 = rewardToken2.balanceOf(address(this));

        // Assert that reward token balances are increasing at least by expected amounts - 1 wei rounding buffer
        if (
            (rewardBalancesBefore1 + claimableRewards[0]) >
            (rewardBalancesAfter1 + 1)
        ) {
            emit AssertionFailed();
        }
        if (
            (rewardBalancesBefore2 + claimableRewards[1]) >
            (rewardBalancesAfter2 + 1)
        ) {
            emit AssertionFailed();
        }
    }

    // Test claimAll function as user
    function claimAllAsUser() public {
        uint256[] memory claimableRewards =
            distribution.claimableRewards(address(mockUser));

        uint256 rewardBalancesBefore1 =
            rewardToken1.balanceOf(address(mockUser));
        uint256 rewardBalancesBefore2 =
            rewardToken2.balanceOf(address(mockUser));
        mockUser.claimAll();
        uint256 rewardBalancesAfter1 =
            rewardToken1.balanceOf(address(mockUser));
        uint256 rewardBalancesAfter2 =
            rewardToken2.balanceOf(address(mockUser));

        // Assert that reward token balances are increasing at least by expected amounts - 1 wei rounding buffer
        if (
            (rewardBalancesBefore1 + claimableRewards[0]) >
            (rewardBalancesAfter1 + 1)
        ) {
            emit AssertionFailed();
        }
        if (
            (rewardBalancesBefore2 + claimableRewards[1]) >
            (rewardBalancesAfter2 + 1)
        ) {
            emit AssertionFailed();
        }
    }

    // Test cancel function
    function cancel() public {
        distribution.cancel();

        // Assert revert since after startingTimestamp
        emit AssertionFailed();
    }

    // Test cancel function as user
    function cancelAsUser() public {
        mockUser.cancel();

        // Assert revert since after startingTimestamp
        emit AssertionFailed();
    }

    // Test recoverUnassignedRewards function
    function recoverUnassignedRewards() public {
        uint256 recoverableRewards1 =
            distribution.recoverableUnassignedReward(address(rewardToken1));
        uint256 recoverableRewards2 =
            distribution.recoverableUnassignedReward(address(rewardToken2));
        uint256 ownerRewardBalancesBefore1 =
            rewardToken1.balanceOf(address(this));
        uint256 ownerRewardBalancesBefore2 =
            rewardToken2.balanceOf(address(this));

        distribution.recoverUnassignedRewards();

        uint256 ownerRewardBalancesAfter1 =
            rewardToken1.balanceOf(address(this));
        uint256 ownerRewardBalancesAfter2 =
            rewardToken2.balanceOf(address(this));

        // Assert owner balances increase by at least expected amount
        if (
            (ownerRewardBalancesBefore1 + recoverableRewards1) >
            ownerRewardBalancesAfter1
        ) {
            emit AssertionFailed();
        }
        if (
            (ownerRewardBalancesBefore2 + recoverableRewards2) >
            ownerRewardBalancesAfter2
        ) {
            emit AssertionFailed();
        }
    }

    // Test recoverUnassignedRewardsAsUser function
    function recoverUnassignedRewardsAsUser() public {
        uint256 recoverableRewards1 =
            distribution.recoverableUnassignedReward(address(rewardToken1));
        uint256 recoverableRewards2 =
            distribution.recoverableUnassignedReward(address(rewardToken2));
        uint256 ownerRewardBalancesBefore1 =
            rewardToken1.balanceOf(address(this));
        uint256 ownerRewardBalancesBefore2 =
            rewardToken2.balanceOf(address(this));

        mockUser.recoverUnassignedRewards();

        uint256 ownerRewardBalancesAfter1 =
            rewardToken1.balanceOf(address(this));
        uint256 ownerRewardBalancesAfter2 =
            rewardToken2.balanceOf(address(this));

        // Assert owner balances increase by at least expected amount
        if (
            (ownerRewardBalancesBefore1 + recoverableRewards1) >
            ownerRewardBalancesAfter1
        ) {
            emit AssertionFailed();
        }
        if (
            (ownerRewardBalancesBefore2 + recoverableRewards2) >
            ownerRewardBalancesAfter2
        ) {
            emit AssertionFailed();
        }
    }

    function addRewards(uint256 seed, uint256 amount) public {
        address rewardToken;
        if (seed % 2 == 0) {
            rewardToken = address(rewardToken1);
        } else {
            rewardToken = address(rewardToken2);
        }
        uint256 distributionRewardAmountBefore =
            distribution.rewardAmount(rewardToken);
        uint256 distributionRewardBalanceBefore =
            ERC20PresetMinterPauser(rewardToken).balanceOf(
                address(distribution)
            );
        distribution.addRewards(rewardToken, amount);
        uint256 distributionRewardAmountAfter =
            distribution.rewardAmount(rewardToken);
        uint256 distributionRewardBalanceAfter =
            ERC20PresetMinterPauser(rewardToken).balanceOf(
                address(distribution)
            );

        // Assert that tracked reward amount is correctly increased
        if (
            distributionRewardAmountBefore + amount !=
            distributionRewardAmountAfter
        ) {
            emit AssertionFailed();
        }
        // Assert that distribution reward balance is properly increased
        if (
            distributionRewardBalanceBefore + amount !=
            distributionRewardBalanceAfter
        ) {
            emit AssertionFailed();
        }
    }

    function addRewardsAsUser(uint256 seed, uint256 amount) public {
        address rewardToken;
        if (seed % 2 == 0) {
            rewardToken = address(rewardToken1);
        } else {
            rewardToken = address(rewardToken2);
        }
        uint256 distributionRewardAmountBefore =
            distribution.rewardAmount(rewardToken);
        uint256 distributionRewardBalanceBefore =
            ERC20PresetMinterPauser(rewardToken).balanceOf(
                address(distribution)
            );
        mockUser.addRewards(rewardToken, amount);
        uint256 distributionRewardAmountAfter =
            distribution.rewardAmount(rewardToken);
        uint256 distributionRewardBalanceAfter =
            ERC20PresetMinterPauser(rewardToken).balanceOf(
                address(distribution)
            );

        // Assert that tracked reward amount is correctly increased
        if (
            distributionRewardAmountBefore + amount !=
            distributionRewardAmountAfter
        ) {
            emit AssertionFailed();
        }
        // Assert that distribution reward balance is properly increased
        if (
            distributionRewardBalanceBefore + amount !=
            distributionRewardBalanceAfter
        ) {
            emit AssertionFailed();
        }
    }
}
