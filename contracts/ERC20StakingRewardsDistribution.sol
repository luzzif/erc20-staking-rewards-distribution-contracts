// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20StakingRewardsDistribution is Ownable {
    using SafeMath for uint256;
    using SafeMath for uint64;
    using SafeERC20 for ERC20;

    ERC20[] public rewardTokens;
    ERC20 public stakableToken;
    mapping(address => uint256) public rewardTokenMultiplier;
    mapping(address => uint256) public rewardAmount;
    mapping(address => uint256) public rewardPerSecond;
    mapping(address => uint256) public stakedTokenAmount;
    uint256 public totalStakedTokensAmount;
    mapping(address => uint256) public rewardPerStakedToken;
    uint64 public startingTimestamp;
    uint64 public endingTimestamp;
    bool public locked;
    bool public initialized;
    uint64 public lastConsolidationTimestamp;
    mapping(address => uint256) public recoverableUnassignedReward;

    mapping(address => uint256) public stakedTokensOf;
    mapping(address => mapping(address => uint256))
        public consolidatedRewardsPerStakedToken;
    mapping(address => mapping(address => uint256)) public earnedRewards;
    mapping(address => mapping(address => uint256)) public claimedReward;

    event Initialized(
        address[] rewardsTokenAddresses,
        address stakableTokenAddress,
        uint256[] rewardsAmounts,
        uint64 startingTimestamp,
        uint64 endingTimestamp,
        bool locked
    );
    event Canceled();
    event Staked(address indexed staker, uint256 amount);
    event Withdrawn(address indexed withdrawer, uint256 amount);
    event Claimed(address indexed claimer, uint256[] amounts);
    event Recovered(uint256[] amounts);

    function getRewardTokens() external view returns (ERC20[] memory) {
        return rewardTokens;
    }

    function initialize(
        address[] calldata _rewardTokenAddresses,
        address _stakableTokenAddress,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestamp,
        bool _locked
    ) external onlyOwner onlyUninitialized {
        require(
            _startingTimestamp > block.timestamp,
            "ERC20StakingRewardsDistribution: invalid starting timestamp"
        );
        require(
            _endingTimestamp > _startingTimestamp,
            "ERC20StakingRewardsDistribution: invalid time duration"
        );
        require(
            _rewardTokenAddresses.length == _rewardAmounts.length,
            "ERC20StakingRewardsDistribution: inconsistent reward token/amount"
        );

        uint256 _secondsDuration = _endingTimestamp - _startingTimestamp;
        // Initializing reward tokens and amounts
        for (uint32 _i = 0; _i < _rewardTokenAddresses.length; _i++) {
            address _rewardTokenAddress = _rewardTokenAddresses[_i];
            uint256 _rewardAmount = _rewardAmounts[_i];
            require(
                _rewardTokenAddress != address(0),
                "ERC20StakingRewardsDistribution: 0 address as reward token"
            );
            require(
                _rewardAmount > 0,
                "ERC20StakingRewardsDistribution: no reward"
            );
            require(
                _rewardAmount >= _secondsDuration,
                "ERC20StakingRewardsDistribution: reward amount less than seconds duration"
            );
            ERC20 _rewardToken = ERC20(_rewardTokenAddress);
            require(
                _rewardToken.balanceOf(address(this)) >= _rewardAmount,
                "ERC20StakingRewardsDistribution: no funding"
            );
            // avoid overflow down the road (when consolidating rewards)
            // by constraining the reward token decimals to a maximum of 18
            uint256 _rewardTokenDecimals = _rewardToken.decimals();
            require(
                _rewardTokenDecimals > 0 && _rewardTokenDecimals <= 18,
                "ERC20StakingRewardsDistribution: invalid decimals for reward token"
            );
            rewardTokens.push(_rewardToken);
            rewardTokenMultiplier[_rewardTokenAddress] =
                uint256(10)**uint256(_rewardTokenDecimals);
            rewardPerSecond[_rewardTokenAddress] = _rewardAmount.div(
                _secondsDuration
            );
            rewardAmount[_rewardTokenAddress] = _rewardAmount;
        }

        require(
            _stakableTokenAddress != address(0),
            "ERC20StakingRewardsDistribution: 0 address as stakable token"
        );
        stakableToken = ERC20(_stakableTokenAddress);

        startingTimestamp = _startingTimestamp;
        endingTimestamp = _endingTimestamp;
        lastConsolidationTimestamp = _startingTimestamp;
        locked = _locked;

        initialized = true;
        emit Initialized(
            _rewardTokenAddresses,
            _stakableTokenAddress,
            _rewardAmounts,
            _startingTimestamp,
            _endingTimestamp,
            _locked
        );
    }

    function cancel() external onlyInitialized onlyOwner {
        require(
            block.timestamp < startingTimestamp,
            "ERC20StakingRewardsDistribution: distribution already started"
        );
        // resetting reward information (both tokens and amounts)
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            ERC20 rewardToken = rewardTokens[_i];
            address rewardTokenAddress = address(rewardToken);
            uint256 _relatedRewardAmount = rewardAmount[rewardTokenAddress];
            delete rewardTokenMultiplier[rewardTokenAddress];
            delete rewardAmount[rewardTokenAddress];
            delete rewardPerSecond[rewardTokenAddress];
            rewardToken.safeTransfer(owner(), _relatedRewardAmount);
        }
        delete rewardTokens;
        delete stakableToken;
        startingTimestamp = 0;
        endingTimestamp = 0;
        lastConsolidationTimestamp = 0;
        initialized = false;
        locked = false;
        emit Canceled();
    }

    function recoverUnassignedRewards() external onlyInitialized onlyStarted {
        consolidateReward();
        uint256 _numberOfRewardsTokens = rewardTokens.length;
        uint256[] memory _recoveredUnassignedRewards =
            new uint256[](_numberOfRewardsTokens);
        for (uint256 _i; _i < _numberOfRewardsTokens; _i++) {
            ERC20 _relatedRewardToken = rewardTokens[_i];

            uint256 _relatedUnassignedReward =
                recoverableUnassignedReward[address(_relatedRewardToken)];
            delete recoverableUnassignedReward[address(_relatedRewardToken)];
            _recoveredUnassignedRewards[_i] = _relatedUnassignedReward;
            _relatedRewardToken.safeTransfer(owner(), _relatedUnassignedReward);
        }
        emit Recovered(_recoveredUnassignedRewards);
    }

    function stake(uint256 _amount)
        external
        onlyInitialized
        onlyStarted
        onlyRunning
    {
        require(
            _amount > 0,
            "ERC20StakingRewardsDistribution: tried to stake nothing"
        );
        consolidateReward();
        stakedTokensOf[msg.sender] = stakedTokensOf[msg.sender].add(_amount);
        totalStakedTokensAmount = totalStakedTokensAmount.add(_amount);
        stakableToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) external onlyInitialized onlyStarted {
        require(
            _amount > 0,
            "ERC20StakingRewardsDistribution: tried to withdraw nothing"
        );
        if (locked) {
            require(
                block.timestamp > endingTimestamp,
                "ERC20StakingRewardsDistribution: funds locked until the distribution ends"
            );
        }
        consolidateReward();
        require(
            _amount <= stakedTokensOf[msg.sender],
            "ERC20StakingRewardsDistribution: withdrawn amount greater than current stake"
        );
        stakedTokensOf[msg.sender] = stakedTokensOf[msg.sender].sub(_amount);
        totalStakedTokensAmount = totalStakedTokensAmount.sub(_amount);
        stakableToken.safeTransfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _amount);
    }

    function claim() external onlyInitialized onlyStarted {
        consolidateReward();
        uint256[] memory _claimedRewards = new uint256[](rewardTokens.length);
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            ERC20 _relatedRewardToken = rewardTokens[_i];
            address _relatedRewardTokenAddress = address(_relatedRewardToken);
            uint256 _claimableReward =
                earnedRewards[msg.sender][_relatedRewardTokenAddress].sub(
                    claimedReward[msg.sender][_relatedRewardTokenAddress]
                );
            claimedReward[msg.sender][
                _relatedRewardTokenAddress
            ] = claimedReward[msg.sender][_relatedRewardTokenAddress].add(
                _claimableReward
            );
            _relatedRewardToken.safeTransfer(msg.sender, _claimableReward);
            _claimedRewards[_i] = _claimableReward;
        }
        emit Claimed(msg.sender, _claimedRewards);
    }

    function consolidateReward() public onlyInitialized onlyStarted {
        uint64 _consolidationTimestamp =
            uint64(Math.min(block.timestamp, endingTimestamp));
        uint256 _lastPeriodDuration =
            uint256(_consolidationTimestamp.sub(lastConsolidationTimestamp));
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            address _relatedRewardTokenAddress = address(rewardTokens[_i]);
            if (totalStakedTokensAmount == 0) {
                // If the current staked tokens amount is zero, there have been unassigned rewards in the last period.
                // We add these unassigned rewards to the amount that can be claimed back by the contract's owner.
                recoverableUnassignedReward[
                    _relatedRewardTokenAddress
                ] = recoverableUnassignedReward[_relatedRewardTokenAddress].add(
                    _lastPeriodDuration.mul(
                        rewardPerSecond[_relatedRewardTokenAddress]
                    )
                );
                rewardPerStakedToken[_relatedRewardTokenAddress] = 0;
            } else {
                rewardPerStakedToken[
                    _relatedRewardTokenAddress
                ] = rewardPerStakedToken[_relatedRewardTokenAddress].add(
                    _lastPeriodDuration
                        .mul(rewardPerSecond[_relatedRewardTokenAddress])
                        .mul(rewardTokenMultiplier[_relatedRewardTokenAddress])
                        .div(totalStakedTokensAmount)
                );
            }
            // avoids subtraction underflow. If the rewards per staked tokens are 0,
            // the rewards in current period must be 0 by definition, no need to
            // perform subtraction risking underflow.
            uint256 _rewardInCurrentPeriod =
                rewardPerStakedToken[_relatedRewardTokenAddress] > 0
                    ? stakedTokensOf[msg.sender]
                        .mul(
                        rewardPerStakedToken[_relatedRewardTokenAddress].sub(
                            consolidatedRewardsPerStakedToken[msg.sender][
                                _relatedRewardTokenAddress
                            ]
                        )
                    )
                        .div(rewardTokenMultiplier[_relatedRewardTokenAddress])
                    : 0;
            earnedRewards[msg.sender][
                _relatedRewardTokenAddress
            ] = earnedRewards[msg.sender][_relatedRewardTokenAddress].add(
                _rewardInCurrentPeriod
            );
            consolidatedRewardsPerStakedToken[msg.sender][
                _relatedRewardTokenAddress
            ] = rewardPerStakedToken[_relatedRewardTokenAddress];
        }
        lastConsolidationTimestamp = _consolidationTimestamp;
    }

    modifier onlyUninitialized() {
        require(
            !initialized,
            "ERC20StakingRewardsDistribution: already initialized"
        );
        _;
    }

    modifier onlyInitialized() {
        require(
            initialized,
            "ERC20StakingRewardsDistribution: not initialized"
        );
        _;
    }

    modifier onlyStarted() {
        require(
            initialized && block.timestamp >= startingTimestamp,
            "ERC20StakingRewardsDistribution: not started"
        );
        _;
    }

    modifier onlyRunning() {
        require(
            initialized && block.timestamp <= endingTimestamp,
            "ERC20StakingRewardsDistribution: already ended"
        );
        _;
    }
}
